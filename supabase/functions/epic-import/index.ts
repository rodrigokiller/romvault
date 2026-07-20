// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca da EPIC GAMES.
//
// A Epic não tem API pública de biblioteca. O caminho é o MESMO que as
// ferramentas open source de biblioteca usam há anos (Legendary, Heroic, Rare):
// o usuário loga na Epic no browser, abre a URL de redirect do launcher e cola
// aqui o `authorizationCode` que aparece. Trocamos esse código por um token e
// lemos a biblioteca DELE. As credenciais abaixo são as do próprio launcher,
// constantes públicas embutidas no binário e usadas por todos esses projetos.
//
// Consequência honesta: como depende de um código de login, o Epic é sync
// MANUAL (o código é de uso único e vale poucos minutos). Steam/GOG/PSN/Xbox
// rodam no cron diário porque bastam um identificador público; a Epic não.
//
// Traz: lista de jogos + TEMPO DE JOGO (endpoint de playtime da conta).
// Match por título — NUNCA cria jogo (igual GOG). Cria cópias (digital · Epic),
// game_sync_data e tracks novos como "owned".
//
// Sem segredo de ambiente. Deploy: supabase functions deploy epic-import --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

/** Troca o authorizationCode por access_token + account_id. */
async function epicLogin(code: string): Promise<{ token: string; accountId: string }> {
  const basic = btoa(`${EPIC_CLIENT_ID}:${EPIC_CLIENT_SECRET}`);
  const res = await fetch(OAUTH, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `grant_type=authorization_code&code=${encodeURIComponent(code)}&token_type=eg1`,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.access_token) {
    const why = data?.errorMessage ?? `HTTP ${res.status}`;
    throw new Error(
      `A Epic recusou o código (${why}). Ele é de uso único e expira em poucos minutos — `
      + 'abra a URL de novo, copie o "authorizationCode" fresquinho e cole aqui.',
    );
  }
  return { token: String(data.access_token), accountId: String(data.account_id) };
}

/** Biblioteca + tempo de jogo da conta. */
async function epicLibrary(token: string, accountId: string): Promise<EpicGame[]> {
  const auth = { Authorization: `bearer ${token}` };
  const aRes = await fetch(ASSETS, { headers: auth });
  if (!aRes.ok) throw new Error(`Epic (biblioteca): HTTP ${aRes.status}`);
  // deno-lint-ignore no-explicit-any
  const assets = (await aRes.json()) as any[];

  // fora: Unreal Engine (namespace 'ue') e plugins — não são jogos
  const wanted = assets.filter((a) => a?.namespace && a.namespace !== 'ue' && a?.catalogItemId);

  // tempo de jogo por artifactId (= appName). Best-effort: se falhar, sem horas.
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
  for (const a of wanted) {
    byNs.set(a.namespace, [...(byNs.get(a.namespace) ?? []), a.catalogItemId]);
  }
  const titleOf = new Map<string, { title: string; isGame: boolean }>();
  for (const [ns, ids] of byNs) {
    for (let i = 0; i < ids.length; i += 30) {
      const chunk = ids.slice(i, i + 30);
      const qs = chunk.map((id) => `id=${encodeURIComponent(id)}`).join('&');
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
    if (!info || !info.isGame) continue;
    if (seen.has(info.title)) continue;
    seen.add(info.title);
    const secs = playtime.get(String(a.appName));
    out.push({
      title: info.title,
      appName: String(a.appName),
      hours: secs ? Math.round((secs / 3600) * 10) / 10 : null,
    });
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, userId: string, code: string, byKey: Map<string, string>) {
  const { token, accountId } = await epicLogin(code);
  const games = await epicLibrary(token, accountId);

  await admin.from('user_accounts').upsert({
    user_id: userId, provider: 'epic', account_id: accountId, last_sync: new Date().toISOString(),
  }, { onConflict: 'user_id,provider' });

  if (games.length === 0) {
    return {
      epic_games: 0, matched: 0, tracks_added: 0, copies_added: 0, unmatched: 0, sample_misses: [],
      account_id: accountId, note: 'Conta vinculada; nenhum jogo encontrado na biblioteca.',
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
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: 'PC', distribution: 'digital', store: 'Epic',
      });
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
    account_id: accountId,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    // sem modo cron: o código de login é de uso único (ver cabeçalho)
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    // aceita o código puro OU a resposta JSON inteira colada do redirect
    const raw = String(body.epic_code ?? '').trim();
    if (!raw) return json({ error: 'Cole o authorizationCode da Epic.' }, 400);
    const code = raw.startsWith('{')
      ? String((JSON.parse(raw) as { authorizationCode?: string })?.authorizationCode ?? '').trim()
      : raw.replace(/^"|"$/g, '');
    if (!code) return json({ error: 'Não achei o authorizationCode no que você colou.' }, 400);

    const catalog = await fetchAll(() => admin.from('games').select('id, title, platforms'));
    const byKey = new Map<string, string>();
    for (const g of catalog) {
      for (const p of (g.platforms ?? []) as string[]) byKey.set(`${p}|${norm(g.title)}`, g.id);
    }

    const result = await syncUser(admin, user.id, code, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
