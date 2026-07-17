// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca Xbox via xbl.io (OpenXBL,
// API terceirizada estável com key gratuita). Usuário informa o gamertag.
//
// Match por título+plataforma (Xbox/360/One/Series/PC) — NUNCA cria jogo.
// 100% de conquistas -> Terminado; progresso -> Jogando; gamerscore/conquistas
// viram achievements. Cria cópias (digital · Xbox) e game_sync_data.
//
// Segredo:  supabase secrets set XBLIO_KEY=<key de https://xbl.io>
// Deploy:   supabase functions deploy xbox-import --no-verify-jwt
// Cron:     aceita x-cron-secret (CRON_SECRET) — sincroniza provider='xbox'.
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

/* devices do xbl.io -> nosso nome de plataforma (1º conhecido vence) */
const XBOX_PLATFORM: Record<string, string> = {
  XboxSeries: 'Xbox Series', XboxOne: 'Xbox One', Xbox360: 'Xbox 360', Xbox: 'Xbox',
  PC: 'PC', Win32: 'PC',
};

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

interface XblTitle {
  name: string;
  devices?: string[];
  achievement?: {
    currentAchievements: number;
    totalAchievements: number;
    currentGamerscore: number;
    totalGamerscore: number;
    progressPercentage: number;
  };
  titleHistory?: { lastTimePlayed?: string };
}

// deno-lint-ignore no-explicit-any
async function xbl(path: string, key: string): Promise<any> {
  const res = await fetch(`https://xbl.io/api/v2${path}`, {
    headers: { 'X-Authorization': key, Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`xbl.io: HTTP ${res.status}`);
  const data = await res.json();
  // o xbl.io embrulha o payload em { content: {...} } — desembrulha sempre
  return data?.content ?? data;
}

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, key: string, userId: string, gamertag: string, byKey: Map<string, string>) {
  // gamertag -> xuid (friends/search é o endpoint de JOGADOR do xbl.io;
  // /search é marketplace — fica como fallback). Erros de baixo aparecem
  // na mensagem: 401 = XBLIO_KEY errada, 403 = plano/permissão da key.
  // deno-lint-ignore no-explicit-any
  let people: any[] = [];
  const errs: string[] = [];
  const peek = (o: unknown) => JSON.stringify(o ?? null).slice(0, 180); // raio-x da resposta
  try {
    const alt = await xbl(`/friends/search?gt=${encodeURIComponent(gamertag)}`, key);
    people = (alt?.profileUsers ?? alt?.people ?? []);
    if (people.length === 0) errs.push(`friends/search respondeu: ${peek(alt)}`);
  } catch (e) { errs.push(`friends/search: ${e instanceof Error ? e.message : String(e)}`); }
  if (people.length === 0) {
    try {
      const search = await xbl(`/search/${encodeURIComponent(gamertag)}`, key);
      people = (search?.people ?? search?.profileUsers ?? []);
      if (people.length === 0) errs.push(`search respondeu: ${peek(search)}`);
    } catch (e) { errs.push(`search: ${e instanceof Error ? e.message : String(e)}`); }
  }
  const person = people.find((p) => norm(p.gamertag ?? p.settings?.find?.((s: { id: string }) => s.id === 'Gamertag')?.value ?? '') === norm(gamertag)) ?? people[0];
  const xuid = person?.xuid ?? person?.id;
  if (!xuid) {
    throw new Error(`Gamertag "${gamertag}" não encontrada no xbl.io [${errs.join(' | ')}]`);
  }

  const data = await xbl(`/achievements/player/${xuid}`, key);
  const titles = (data?.titles ?? []) as XblTitle[];
  if (titles.length === 0) {
    await admin.from('user_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', 'xbox');
    return {
      xbox_games: 0, matched: 0, tracks_added: 0, tracks_updated: 0,
      copies_added: 0, unmatched: 0, sample_misses: [],
      note: 'Conta vinculada; histórico vazio (se tiver jogos, confira a privacidade do perfil Xbox).',
    };
  }

  let unmatched = 0;
  const matched: { gid: string; t: XblTitle; platform: string }[] = [];
  const misses: string[] = [];
  for (const t of titles) {
    const device = (t.devices ?? []).find((d) => XBOX_PLATFORM[d]);
    const plat = device ? XBOX_PLATFORM[device] : null;
    if (!plat) { unmatched++; continue; }
    const gid = byKey.get(`${plat}|${keyTitle(t.name)}`);
    if (gid) matched.push({ gid, t, platform: plat });
    else misses.push(`${t.name} (${plat})`);
  }

  const myTracks = await fetchAll(() =>
    admin.from('game_tracks').select('game_id, source').eq('user_id', userId));
  const trackByGame = new Map(myTracks.map((x: { game_id: string; source: string }) => [x.game_id, x.source]));

  const newTracks: Record<string, unknown>[] = [];
  let updated = 0;
  for (const m of matched) {
    const a = m.t.achievement;
    const pct = Math.round(a?.progressPercentage ?? 0);
    const status = pct >= 100 ? 'finished' : 'owned';
    const src = trackByGame.get(m.gid);
    if (src === undefined) {
      newTracks.push({
        user_id: userId, game_id: m.gid, status, platform: m.platform,
        achievements_earned: a?.currentAchievements ?? null,
        achievements_total: a?.totalAchievements ?? null,
        source: 'xbox',
      });
    } else if (src === 'xbox') {
      await admin.from('game_tracks')
        .update({
          achievements_earned: a?.currentAchievements ?? null,
          achievements_total: a?.totalAchievements ?? null,
          ...(status === 'finished' ? { status } : {}),
        })
        .eq('user_id', userId).eq('game_id', m.gid);
      updated++;
    }
  }
  // dedupe por game_id (PS4+PS5/subsets/duplo-appid caem no MESMO jogo):
  // linhas duplicadas no mesmo upsert = erro 21000 e o lote inteiro sumia.
  // 'finished' vence quando ha conflito de status.
  const trackByGid = new Map<string, Record<string, unknown>>();
  for (const row of newTracks) {
    const gid = row.game_id as string;
    const prev = trackByGid.get(gid);
    if (!prev || (prev.status !== 'finished' && row.status === 'finished')) trackByGid.set(gid, row);
  }
  const trackRows = [...trackByGid.values()];
  for (let i = 0; i < trackRows.length; i += 200) {
    const { error: trkErr } = await admin.from('game_tracks')
      .upsert(trackRows.slice(i, i + 200), { onConflict: 'user_id,game_id' });
    if (trkErr) throw new Error(`game_tracks: ${trkErr.message}`);
  }

  // dado bruto por provedor (dedupe por game_id — fica o maior progresso)
  const syncByGame = new Map<string, { pct: number; row: Record<string, unknown> }>();
  for (const m of matched) {
    const a = m.t.achievement;
    const pct = Math.round(a?.progressPercentage ?? 0);
    const prev = syncByGame.get(m.gid);
    if (prev && prev.pct >= pct) continue;
    syncByGame.set(m.gid, {
      pct,
      row: {
        user_id: userId, game_id: m.gid, provider: 'xbox', platform: m.platform,
        achievements_earned: a?.currentAchievements ?? null,
        achievements_total: a?.totalAchievements ?? null,
        progress: pct,
        last_played: m.t.titleHistory?.lastTimePlayed ?? null,
        synced_at: new Date().toISOString(),
      },
    });
  }
  const syncRows = [...syncByGame.values()].map((x) => x.row);
  for (let i = 0; i < syncRows.length; i += 200) {
    const { error: sdErr } = await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
    if (sdErr) throw new Error(`game_sync_data: ${sdErr.message}`);
  }

  // cópias (vitrine)
  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'Xbox'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: m.platform,
        distribution: 'digital', store: 'Xbox',
      });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    const { error: cpErr } = await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
    if (cpErr) throw new Error(`game_copies: ${cpErr.message}`);
  }

  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'xbox');

  return {
    xbox_games: titles.length,
    matched: matched.length,
    tracks_added: trackRows.length,
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
    const key = Deno.env.get('XBLIO_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!key) return json({ error: 'XBLIO_KEY não configurada (key grátis em xbl.io).' }, 500);
    const admin = createClient(url, serviceKey);

    // AUTH PRIMEIRO: requisição anônima não ganha token externo nem catálogo
    // (com --no-verify-jwt, isso aqui é a única porta)
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
      for (const p of (g.platforms ?? []) as string[]) {
        byKey.set(`${p}|${norm(g.title)}`, g.id);
      }
    }

    if (viaCron) {
      const accounts = await fetchAll(() =>
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'xbox'));
      let ok = 0, failed = 0;
      for (const acc of accounts) {
        try {
          await syncUser(admin, key, acc.user_id as string, acc.account_id as string, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await admin.from('job_runs').insert({ job: 'xbox-cron', mode: 'cron', ok: failed === 0, stats: { accounts: accounts.length, synced: ok, failed } }).then(() => {}, () => {});
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, failed });
    }

    const body = await req.json().catch(() => ({}));
    const target = String(body.gamertag ?? '').trim();
    if (!target) return json({ error: 'Informe o gamertag.' }, 400);

    const result = await syncUser(admin, key, caller!.id, target, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
