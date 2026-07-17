// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa troféus/jogos da PSN (API não-oficial,
// mesmo fluxo da lib psn-api). O usuário informa o username (perfil PÚBLICO,
// como no PlayTracker); nós autenticamos com o NPSSO de uma conta de serviço.
//
// Match por título+plataforma (PS3/PS4/PS5/Vita) — NUNCA cria jogo.
// 100% de troféus -> Terminado; progresso -> Jogando; troféus viram
// achievements. Também cria cópias (digital · PSN) pra vitrine.
//
// Segredo:  supabase secrets set PSN_NPSSO=<64 chars>
//           (logado na PSN no navegador: ca.account.sony.com/api/v1/ssocookie)
//           OBS: o NPSSO expira (~2 meses) — renovar quando o sync falhar.
// Deploy:   supabase functions deploy psn-import --no-verify-jwt
// Cron:     aceita x-cron-secret (CRON_SECRET) e sincroniza todas as contas
//           vinculadas provider='psn'.
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

/** Limpa o título de troféu da PSN: ®/™, sufixo "Trophies", "Trophy Set". */
function keyTitle(raw: string): string {
  return norm(
    raw
      .replace(/[®™©]/g, '')
      .replace(/\btrophy set\b/gi, '')
      .replace(/\btrophies\b/gi, '')
      .trim(),
  );
}

const PSN_PLATFORM: Record<string, string> = {
  PS3: 'PS3', PS4: 'PS4', PS5: 'PS5', PSVITA: 'PS Vita', PSPC: 'PC',
};

// client id/secret PÚBLICOS do app Android da PSN (mesmos da lib psn-api)
const AUTH_BASIC = 'MDk1MTUxNTktNzIzNy00MzcwLTliNDAtMzgwNmU2N2MwODkxOnVjUGprYTV0bnRCMktxc1A=';
const REDIRECT = 'com.scee.psxandroid.scecompcall://redirect';

async function psnToken(npsso: string): Promise<string> {
  const authRes = await fetch(
    'https://ca.account.sony.com/api/authz/v3/oauth/authorize?access_type=offline'
    + '&client_id=09515159-7237-4370-9b40-3806e67c0891&response_type=code'
    + '&scope=psn%3Amobile.v2.core%20psn%3Aclientapp'
    + `&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    { headers: { Cookie: `npsso=${npsso}` }, redirect: 'manual' },
  );
  const location = authRes.headers.get('location') ?? '';
  const code = new URLSearchParams(location.split('?')[1] ?? '').get('code');
  if (!code) throw new Error('NPSSO inválido/expirado — renove o segredo PSN_NPSSO.');

  const tokRes = await fetch('https://ca.account.sony.com/api/authz/v3/oauth/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${AUTH_BASIC}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: `code=${encodeURIComponent(code)}&redirect_uri=${encodeURIComponent(REDIRECT)}&grant_type=authorization_code&token_format=jwt`,
  });
  const tok = await tokRes.json();
  if (!tok?.access_token) throw new Error('Troca de token da PSN falhou.');
  return tok.access_token as string;
}

async function findAccountId(token: string, username: string): Promise<string> {
  const res = await fetch('https://m.np.playstation.com/api/search/v1/universalSearch', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      searchTerm: username,
      domainRequests: [{ domain: 'SocialAllAccounts' }],
    }),
  });
  const data = await res.json();
  // deno-lint-ignore no-explicit-any
  const results = (data?.domainResponses?.[0]?.results ?? []) as any[];
  const hit = results.find((r) =>
    norm(r?.socialMetadata?.onlineId ?? '') === norm(username)) ?? results[0];
  const accountId = hit?.socialMetadata?.accountId;
  if (!accountId) throw new Error(`Usuário "${username}" não encontrado na PSN.`);
  return String(accountId);
}

interface PsnTitle {
  trophyTitleName: string;
  trophyTitlePlatform: string; // "PS4" | "PS5" | "PS3" | "PSVITA" | "PS4,PS5"
  progress: number;
  earnedTrophies: Record<string, number>;
  definedTrophies: Record<string, number>;
  lastUpdatedDateTime?: string;
}

async function trophyTitles(token: string, accountId: string): Promise<PsnTitle[]> {
  const out: PsnTitle[] = [];
  for (let offset = 0; ; offset += 250) {
    const res = await fetch(
      `https://m.np.playstation.com/api/trophy/v1/users/${accountId}/trophyTitles?limit=250&offset=${offset}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (res.status === 403) throw new Error('Perfil privado na PSN — o usuário precisa deixar público.');
    if (!res.ok) throw new Error(`PSN trophies: HTTP ${res.status}`);
    const data = await res.json();
    const page = (data?.trophyTitles ?? []) as PsnTitle[];
    out.push(...page);
    if (page.length < 250) break;
  }
  return out;
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

const sum = (o: Record<string, number> | undefined) =>
  Object.values(o ?? {}).reduce((a, b) => a + b, 0);

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, token: string, userId: string, username: string, byKey: Map<string, string>) {
  const accountId = await findAccountId(token, username);
  const titles = await trophyTitles(token, accountId);
  if (titles.length === 0) throw new Error('Nenhum jogo com troféus nesse perfil.');

  let unmatched = 0;
  const matched: { gid: string; t: PsnTitle; platform: string }[] = [];
  const misses: string[] = [];
  for (const t of titles) {
    const plat = PSN_PLATFORM[(t.trophyTitlePlatform ?? '').split(',')[0]?.trim()];
    if (!plat) { unmatched++; continue; }
    const gid = byKey.get(`${plat}|${keyTitle(t.trophyTitleName)}`);
    if (gid) matched.push({ gid, t, platform: plat });
    else misses.push(`${t.trophyTitleName} (${plat})`);
  }

  const myTracks = await fetchAll(() =>
    admin.from('game_tracks').select('game_id, source').eq('user_id', userId));
  const trackByGame = new Map(myTracks.map((x: { game_id: string; source: string }) => [x.game_id, x.source]));

  const newTracks: Record<string, unknown>[] = [];
  let updated = 0;
  for (const m of matched) {
    const earned = sum(m.t.earnedTrophies);
    const total = sum(m.t.definedTrophies);
    const status = m.t.progress >= 100 ? 'finished' : 'playing';
    const src = trackByGame.get(m.gid);
    if (src === undefined) {
      newTracks.push({
        user_id: userId, game_id: m.gid, status, platform: m.platform,
        achievements_earned: earned, achievements_total: total, source: 'psn',
      });
    } else if (src === 'psn') {
      await admin.from('game_tracks')
        .update({ achievements_earned: earned, achievements_total: total, ...(status === 'finished' ? { status } : {}) })
        .eq('user_id', userId).eq('game_id', m.gid);
      updated++;
    }
  }
  for (let i = 0; i < newTracks.length; i += 200) {
    await admin.from('game_tracks').upsert(newTracks.slice(i, i + 200), { onConflict: 'user_id,game_id' });
  }

  // dado BRUTO por provedor (game_sync_data) — dedupe por game_id (PS4+PS5
  // do mesmo jogo casam no mesmo registro; fica o de maior progresso)
  const syncByGame = new Map<string, { progress: number; row: Record<string, unknown> }>();
  for (const m of matched) {
    const progress = Math.min(100, Math.round(m.t.progress ?? 0));
    const prev = syncByGame.get(m.gid);
    if (prev && prev.progress >= progress) continue;
    syncByGame.set(m.gid, {
      progress,
      row: {
        user_id: userId, game_id: m.gid, provider: 'psn',
        platform: m.platform,
        achievements_earned: sum(m.t.earnedTrophies), achievements_total: sum(m.t.definedTrophies),
        progress,
        last_played: m.t.lastUpdatedDateTime ?? null,
        synced_at: new Date().toISOString(),
      },
    });
  }
  const syncRows = [...syncByGame.values()].map((x) => x.row);
  for (let i = 0; i < syncRows.length; i += 200) {
    await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
  }

  // cópias (vitrine): jogou na PSN = tem o jogo
  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'PSN'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: m.platform,
        distribution: 'digital', store: 'PSN',
      });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
  }

  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'psn');

  return {
    psn_games: titles.length,
    matched: matched.length,
    tracks_added: newTracks.length,
    tracks_updated: updated,
    copies_added: newCopies.length,
    unmatched: misses.length + unmatched,
    sample_misses: misses.slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const npsso = Deno.env.get('PSN_NPSSO');
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!npsso) return json({ error: 'PSN_NPSSO não configurado (supabase secrets set).' }, 500);
    const admin = createClient(url, serviceKey);

    const token = await psnToken(npsso);
    const catalog = await fetchAll(() => admin.from('games').select('id, title, platforms'));
    const byKey = new Map<string, string>();
    for (const g of catalog) {
      for (const p of (g.platforms ?? []) as string[]) {
        byKey.set(`${p}|${norm(g.title)}`, g.id);
      }
    }

    // modo cron: todas as contas vinculadas
    if (cronSecret && req.headers.get('x-cron-secret') === cronSecret) {
      const accounts = await fetchAll(() =>
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'psn'));
      let ok = 0, failed = 0;
      for (const acc of accounts) {
        try {
          await syncUser(admin, token, acc.user_id as string, acc.account_id as string, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, failed });
    }

    // modo usuário
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const body = await req.json().catch(() => ({}));
    const target = String(body.psn_user ?? '').trim();
    if (!target) return json({ error: 'Informe o username da PSN.' }, 400);

    const result = await syncUser(admin, token, user.id, target, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
