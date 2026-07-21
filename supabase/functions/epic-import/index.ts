// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca da EPIC GAMES.
//
// A Epic não tem API pública de biblioteca. O caminho é o MESMO que as
// ferramentas open source usam há anos (Legendary, Heroic, Rare): o usuário
// loga na Epic no browser, abre a URL de redirect do launcher e cola aqui o
// `authorizationCode`. Trocamos por um token e lemos a biblioteca DELE. As
// credenciais abaixo são as do próprio launcher — constantes públicas usadas
// por todos esses projetos.
//
// SYNC AUTOMÁTICO: o código de login é de uso único, então guardamos o
// refresh_token CRIPTOGRAFADO (AES-GCM, chave em TOKEN_ENC_KEY) na tabela
// user_account_secrets — que tem RLS sem policy nenhuma (nem o dono lê pelo
// cliente; só a service role). Desvincular a conta apaga o segredo (cascade).
// Sem TOKEN_ENC_KEY configurada, o sync segue funcionando em modo MANUAL —
// simplesmente não guardamos nada.
//
// Traz: lista de jogos + TEMPO DE JOGO. Match por título — NUNCA cria jogo
// (igual GOG). Cria cópias (digital · Epic), game_sync_data e tracks "owned".
//
// Segredos: TOKEN_ENC_KEY (32 bytes em HEX de 64 chars ou base64) e CRON_SECRET.
//   Gerar:  node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
// Deploy: supabase functions deploy epic-import --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const keyTitle = (raw: string) => norm(raw.replace(/[®™©]/g, ''));

/* credenciais públicas do Epic Games Launcher (as mesmas de Legendary/Heroic) */
const EPIC_CLIENT_ID = '34a02cf8f4414e29b15921876da36f9a';
const EPIC_CLIENT_SECRET = 'daafbccc737745039dffe53d94fc76cf';
const OAUTH = 'https://account-public-service-prod.ol.epicgames.com/account/api/oauth/token';
const ASSETS = 'https://launcher-public-service-prod06.ol.epicgames.com/launcher/api/public/assets/Windows?label=Live';
const CATALOG = 'https://catalog-public-service-prod06.ol.epicgames.com/catalog/api/shared/namespace';
const PLAYTIME = 'https://library-service.live.use1a.on.epicgames.com/library/api/public/playtime/account';

/* ── cripto do refresh_token (AES-GCM) ─────────────────────────────────────── */
const b64encode = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b); // token é pequeno
  return btoa(s);
};
const b64decode = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function aesKey(): Promise<CryptoKey | null> {
  const raw = (Deno.env.get('TOKEN_ENC_KEY') ?? '').trim();
  if (!raw) return null;
  let bytes: Uint8Array | null = null;
  // aceita HEX (64 chars, sem caractere que brigue com shell) ou base64
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    bytes = new Uint8Array(32);
    for (let i = 0; i < 32; i++) bytes[i] = parseInt(raw.slice(i * 2, i * 2 + 2), 16);
  } else {
    try { bytes = b64decode(raw); } catch { return null; }
  }
  if (!bytes || bytes.length !== 32) return null; // AES-256 exige 32 bytes
  return await crypto.subtle.importKey('raw', bytes, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

async function encryptToken(plain: string): Promise<string | null> {
  const key = await aesKey();
  if (!key) return null;
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plain)));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64encode(out);
}

async function decryptToken(stored: string): Promise<string | null> {
  const key = await aesKey();
  if (!key) return null;
  try {
    const all = b64decode(stored);
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: all.slice(0, 12) }, key, all.slice(12));
    return new TextDecoder().decode(pt);
  } catch { return null; }
}

// deno-lint-ignore no-explicit-any
async function fetchAll(query: () => any): Promise<any[]> {
  const PAGE = 1000;
  // deno-lint-ignore no-explicit-any
  const out: any[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await query().range(from, from + PAGE - 1);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

interface EpicGame { title: string; appName: string; hours: number | null }
interface EpicAuth { token: string; accountId: string; refresh: string | null }

/** POST no oauth da Epic (authorization_code na 1ª vez, refresh_token depois). */
async function epicOAuth(body: string): Promise<EpicAuth | { error: string }> {
  const basic = btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`);
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: { Authorization: `Basic ${basic}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    return { error: String(data?.errorMessage ?? `HTTP ${res.status}`) };
  }
  return {
    token: String(data.access_token),
    accountId: String(data.account_id),
    refresh: data.refresh_token ? String(data.refresh_token) : null,
  };
}

const loginWithCode = (code: string) =>
  epicOAuth(`grant_type=authorization_code&code=${encodeURIComponent(code)}&token_type=eg1`);
const loginWithRefresh = (rt: string) =>
  epicOAuth(`grant_type=refresh_token&refresh_token=${encodeURIComponent(rt)}&token_type=eg1`);

/** Biblioteca + tempo de jogo da conta. */
async function epicLibrary(token: string, accountId: string): Promise<EpicGame[]> {
  const auth = { Authorization: `bearer ${token}` };
  const aRes = await fetch(ASSETS, { headers: auth });
  if (!aRes.ok) throw new Error(`Epic (biblioteca): HTTP ${aRes.status}`);
  // deno-lint-ignore no-explicit-any
  const assets = (await aRes.json()) as any[];

  // fora: Unreal Engine (namespace 'ue') e plugins — não são jogos
  const wanted = assets.filter((a) => a?.namespace && a.namespace !== 'ue' && a?.catalogItemId);

  // tempo de jogo por artifactId (= appName). Best-effort.
  const playtime = new Map<string, number>();
  try {
    const pRes = await fetch(`${PLAYTIME}/${accountId}/all`, { headers: auth });
    if (pRes.ok) {
      // deno-lint-ignore no-explicit-any
      for (const p of ((await pRes.json()) ?? []) as any[]) {
        if (p?.artifactId && p?.totalTime) playtime.set(String(p.artifactId), Number(p.totalTime));
      }
    }
  } catch { /* sem horas: a lista já vale */ }

  // títulos: catálogo em lote, agrupado por namespace
  const byNs = new Map<string, string[]>();
  for (const a of wanted) byNs.set(a.namespace, [...(byNs.get(a.namespace) ?? []), a.catalogItemId]);
  const titleOf = new Map<string, { title: string; isGame: boolean }>();
  for (const [ns, ids] of byNs) {
    for (let i = 0; i < ids.length; i += 30) {
      const qs = ids.slice(i, i + 30).map((id) => `id=${encodeURIComponent(id)}`).join('&');
      const cRes = await fetch(
        `${CATALOG}/${encodeURIComponent(ns)}/bulk/items?${qs}&country=US&locale=en-US&includeDLCDetails=false&includeMainGameDetails=false`,
        { headers: auth },
      );
      if (!cRes.ok) continue;
      // deno-lint-ignore no-explicit-any
      const map = (await cRes.json()) as Record<string, any>;
      for (const [cid, item] of Object.entries(map)) {
        // deno-lint-ignore no-explicit-any
        const cats = ((item?.categories ?? []) as any[]).map((x) => String(x?.path ?? ''));
        const isGame = cats.includes('games') || cats.includes('applications');
        const isAddon = cats.includes('addons') || cats.includes('digitalextras');
        if (item?.title) titleOf.set(cid, { title: String(item.title), isGame: isGame && !isAddon });
      }
      await new Promise((r) => setTimeout(r, 150));
    }
  }

  const out: EpicGame[] = [];
  const seen = new Set<string>();
  for (const a of wanted) {
    const info = titleOf.get(a.catalogItemId);
    if (!info || !info.isGame || seen.has(info.title)) continue;
    seen.add(info.title);
    const secs = playtime.get(String(a.appName));
    out.push({ title: info.title, appName: String(a.appName), hours: secs ? Math.round((secs / 3600) * 10) / 10 : null });
  }
  return out;
}

/** Guarda (ou atualiza) o refresh_token criptografado. Silencioso sem chave. */
// deno-lint-ignore no-explicit-any
async function saveSecret(admin: any, userId: string, refresh: string | null) {
  if (!refresh) return false;
  const enc = await encryptToken(refresh);
  if (!enc) return false; // TOKEN_ENC_KEY ausente: fica manual, sem guardar nada
  await admin.from('user_account_secrets').upsert({
    user_id: userId, provider: 'epic', secret_enc: enc, updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });
  return true;
}

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, userId: string, auth: EpicAuth, byKey: Map<string, string>) {
  const games = await epicLibrary(auth.token, auth.accountId);

  await admin.from('user_accounts').upsert({
    user_id: userId, provider: 'epic', account_id: auth.accountId, last_sync: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });
  // a Epic ROTACIONA o refresh a cada uso: guarda sempre o mais novo
  const autoSync = await saveSecret(admin, userId, auth.refresh);

  if (games.length === 0) {
    return {
      epic_games: 0, matched: 0, tracks_added: 0, copies_added: 0, unmatched: 0, sample_misses: [],
      account_id: auth.accountId, auto_sync: autoSync,
      note: 'Conta vinculada; nenhum jogo encontrado na biblioteca.',
    };
  }

  const matched: { gid: string; g: EpicGame }[] = [];
  const misses: string[] = [];
  for (const g of games) {
    const gid = byKey.get(`PC|${keyTitle(g.title)}`);
    if (gid) matched.push({ gid, g });
    else misses.push(g.title);
  }

  const myTracks = await fetchAll(() =>
    admin.from('game_tracks').select('game_id, source').eq('user_id', userId));
  const trackByGame = new Map(myTracks.map((x: { game_id: string; source: string }) => [x.game_id, x.source]));

  const newTracks: Record<string, unknown>[] = [];
  let updated = 0;
  for (const m of matched) {
    const src = trackByGame.get(m.gid);
    if (src === undefined) {
      newTracks.push({
        user_id: userId, game_id: m.gid, status: 'owned', platform: 'PC',
        hours_played: m.g.hours, source: 'epic',
      });
    } else if (src === 'epic' && m.g.hours) {
      await admin.from('game_tracks').update({ hours_played: m.g.hours })
        .eq('user_id', userId).eq('game_id', m.gid);
      updated++;
    }
  }
  const trackByGid = new Map<string, Record<string, unknown>>();
  for (const row of newTracks) trackByGid.set(row.game_id as string, row);
  const trackRows = [...trackByGid.values()];
  for (let i = 0; i < trackRows.length; i += 200) {
    const { error } = await admin.from('game_tracks')
      .upsert(trackRows.slice(i, i + 200), { onConflict: 'user_id,game_id' });
    if (error) throw new Error(`game_tracks: ${error.message}`);
  }

  const syncByGame = new Map<string, Record<string, unknown>>();
  for (const m of matched) {
    syncByGame.set(m.gid, {
      user_id: userId, game_id: m.gid, provider: 'epic', platform: 'PC',
      hours_played: m.g.hours, synced_at: new Date().toISOString(),
    });
  }
  const syncRows = [...syncByGame.values()];
  for (let i = 0; i < syncRows.length; i += 200) {
    const { error } = await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
    if (error) throw new Error(`game_sync_data: ${error.message}`);
  }

  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'Epic'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({ user_id: userId, game_id: m.gid, platform: 'PC', distribution: 'digital', store: 'Epic' });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    const { error } = await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
    if (error) throw new Error(`game_copies: ${error.message}`);
  }

  if (misses.length > 0) {
    await admin.from('job_runs').insert({
      job: 'epic-sync-misses', mode: 'user', ok: true,
      stats: { user_id: userId, unmatched: misses.length, sample: misses.slice(0, 20) },
    }).then(() => {}, () => {});
  }

  return {
    epic_games: games.length,
    matched: matched.length,
    tracks_added: trackRows.length,
    tracks_updated: updated,
    copies_added: newCopies.length,
    unmatched: misses.length,
    sample_misses: misses.slice(0, 10),
    account_id: auth.accountId,
    auto_sync: autoSync,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const cronSecret = Deno.env.get('CRON_SECRET');
    const admin = createClient(url, serviceKey);

    const viaCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    let caller: { id: string } | null = null;
    if (!viaCron) {
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      caller = user;
    }

    const catalog = await fetchAll(() => admin.from('games').select('id, title, platforms'));
    const byKey = new Map<string, string>();
    for (const g of catalog) {
      for (const p of (g.platforms ?? []) as string[]) byKey.set(`${p}|${norm(g.title)}`, g.id);
    }

    /* ── cron diário: renova pelo refresh_token guardado ── */
    if (viaCron) {
      const secrets = await fetchAll(() =>
        admin.from('user_account_secrets').select('user_id, secret_enc').eq('provider', 'epic'));
      let ok = 0; let failed = 0;
      for (const s of secrets) {
        try {
          const rt = await decryptToken(s.secret_enc as string);
          if (!rt) { failed++; continue; }
          const auth = await loginWithRefresh(rt);
          if ('error' in auth) {
            // refresh expirado (a Epic dá ~23 dias): apaga o segredo — o usuário
            // reconecta quando quiser, sem lixo criptografado parado no banco.
            await admin.from('user_account_secrets')
              .delete().eq('user_id', s.user_id).eq('provider', 'epic');
            failed++;
            continue;
          }
          await syncUser(admin, s.user_id as string, auth, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await admin.from('job_runs').insert({
        job: 'epic-cron', mode: 'cron', ok: failed === 0,
        stats: { accounts: secrets.length, synced: ok, failed },
      }).then(() => {}, () => {});
      return json({ ok: true, mode: 'cron', accounts: secrets.length, synced: ok, failed });
    }

    const body = await req.json().catch(() => ({}));
    // aceita o código puro OU a resposta JSON inteira colada do redirect
    const raw = String(body.epic_code ?? '').trim();
    if (!raw) return json({ error: 'Cole o authorizationCode da Epic.' }, 400);
    const code = raw.startsWith('{')
      ? String((JSON.parse(raw) as { authorizationCode?: string })?.authorizationCode ?? '').trim()
      : raw.replace(/^"|"$/g, '');
    if (!code) return json({ error: 'Não achei o authorizationCode no que você colou.' }, 400);

    const auth = await loginWithCode(code);
    if ('error' in auth) {
      return json({
        error: `A Epic recusou o código (${auth.error}). Ele é de uso único e expira em poucos minutos — `
          + 'abra a URL de novo, copie o "authorizationCode" fresquinho e cole aqui.',
      }, 400);
    }

    const result = await syncUser(admin, caller!.id, auth, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
