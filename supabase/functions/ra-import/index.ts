// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa o progresso do RetroAchievements.
// Puxa GetUserCompletedGames (jogos com conquistas + %), casa com nosso
// catálogo por TÍTULO+PLATAFORMA (nunca cria jogo: RA tem hacks/subsets que
// poluiriam o acervo) e upserta game_tracks source='retroachievements' com
// achievements_earned/total. finished quando 100%; senão playing.
// NÃO sobrescreve status marcado manualmente.
//
// Segredos: supabase secrets set RA_API_USER=<seu usuário do RA>
//           supabase secrets set RA_API_KEY=<web API key de retroachievements.org/controlpanel.php>
// Deploy:   supabase functions deploy ra-import --no-verify-jwt
// Invoke:   functions.invoke('ra-import', { body: { ra_user: 'fulano' } })
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

/** "Legend of Zelda, The" -> "the legend of zelda" (padrão dos títulos do RA). */
function keyTitle(raw: string): string {
  let t = raw.replace(/~[^~]+~/g, '').trim();       // ~Hack~ / ~Homebrew~ / ~Prototype~
  t = t.replace(/\[Subset[^\]]*\]/gi, '').trim();   // [Subset - Bonus]
  const m = t.match(/^(.*), (The|A|An)( |$)(.*)$/i);
  if (m) t = `${m[2]} ${m[1]}${m[4] ? ` ${m[4]}` : ''}`;
  return norm(t);
}

/* ConsoleName do RA -> nosso nome curto de plataforma */
const RA_PLATFORM: Record<string, string> = {
  'nes famicom': 'NES', 'nes': 'NES', 'famicom disk system': 'FDS',
  'snes super famicom': 'SNES', 'snes': 'SNES', 'nintendo 64': 'N64', 'gamecube': 'GameCube',
  'game boy': 'Game Boy', 'game boy color': 'GBC', 'game boy advance': 'GBA',
  'nintendo ds': 'NDS', 'nintendo dsi': 'NDS', 'virtual boy': 'Virtual Boy',
  'mega drive': 'Genesis', 'genesis mega drive': 'Genesis', 'master system': 'Master System',
  'game gear': 'Game Gear', 'sega cd': 'Sega CD', '32x': '32X', 'sega 32x': '32X',
  'saturn': 'Saturn', 'sega saturn': 'Saturn', 'dreamcast': 'Dreamcast',
  'playstation': 'PS1', 'playstation 2': 'PS2', 'playstation portable': 'PSP',
  'pc engine': 'TG-16', 'pc engine turbografx 16': 'TG-16', 'pc engine cd turbografx cd': 'TG-16',
  'arcade': 'Arcade', 'neo geo pocket': 'Neo Geo Pocket',
  'atari 2600': 'Atari 2600', 'atari jaguar': 'Jaguar', 'jaguar': 'Jaguar',
  'msx': 'MSX', 'wonderswan': 'WonderSwan', '3do interactive multiplayer': '3DO', '3do': '3DO',
  'colecovision': 'ColecoVision', 'intellivision': 'Intellivision', 'amiga': 'Amiga',
};

// pagina de 1000 em 1000 (o PostgREST corta qualquer resposta em 1000)
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

interface RaGame {
  GameID: number;
  Title: string;
  ConsoleName: string;
  MaxPossible: number;
  NumAwarded: number;
  PctWon: string | number;
  HardcoreMode: string | number;
}

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Sincroniza UM usuário: tracks + cópias (a vitrine mostra o que ele TEM). */
async function syncUser(
  admin: Admin, raUser: string, raKey: string, userId: string, target: string,
  byKey: Map<string, string>,
) {
  // jogos com progresso no RA (inclui linhas duplicadas hardcore/softcore)
  const raRes = await fetch(
    `https://retroachievements.org/API/API_GetUserCompletedGames.php?z=${encodeURIComponent(raUser)}&y=${encodeURIComponent(raKey)}&u=${encodeURIComponent(target)}`,
  );
  if (!raRes.ok) throw new Error(`RetroAchievements API: HTTP ${raRes.status}`);
  const raw = (await raRes.json()) as RaGame[] | { Error?: string };
  if (!Array.isArray(raw)) {
    throw new Error((raw as { Error?: string }).Error ?? 'Usuário do RA não encontrado.');
  }
  // dedupe por GameID ficando com o MAIOR progresso (hardcore e softcore vêm separados)
  const best = new Map<number, RaGame>();
  for (const g of raw) {
    const prev = best.get(g.GameID);
    if (!prev || Number(g.NumAwarded) > Number(prev.NumAwarded)) best.set(g.GameID, g);
  }
  const games = [...best.values()].filter((g) => Number(g.NumAwarded) > 0);
  if (games.length === 0) {
    // conta válida sem jogos ainda NÃO é erro: vincula e o cron acompanha
    await admin.from('user_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', 'retroachievements');
    return {
      ra_games: 0, matched: 0, tracks_added: 0, tracks_updated: 0,
      copies_added: 0, unmatched: 0, sample_misses: [],
      note: 'Conta vinculada; nenhum jogo com conquistas ainda (o sync diário acompanha).',
    };
  }

  // match RA -> catálogo (NUNCA cria jogo)
  let unmatchedConsole = 0;
  const matched: { gid: string; ra: RaGame; platform: string }[] = [];
  const misses: string[] = [];
  for (const g of games) {
    const plat = RA_PLATFORM[norm(g.ConsoleName)];
    if (!plat) { unmatchedConsole++; continue; }
    const gid = byKey.get(`${plat}|${keyTitle(g.Title)}`);
    if (gid) matched.push({ gid, ra: g, platform: plat });
    else misses.push(`${g.Title} (${plat})`);
  }

  // tracks: cria os que faltam; atualiza SÓ os source='retroachievements'
  const myTracks = await fetchAll(() =>
    admin.from('game_tracks').select('game_id, source').eq('user_id', userId));
  const trackByGame = new Map(myTracks.map((t) => [t.game_id as string, t.source as string]));

  const newTracks: Record<string, unknown>[] = [];
  let updated = 0;
  for (const m of matched) {
    const earned = Number(m.ra.NumAwarded);
    const total = Number(m.ra.MaxPossible);
    const status = total > 0 && earned >= total ? 'finished' : 'owned';
    const src = trackByGame.get(m.gid);
    if (src === undefined) {
      newTracks.push({
        user_id: userId, game_id: m.gid, status, platform: m.platform,
        achievements_earned: earned, achievements_total: total,
        source: 'retroachievements',
      });
    } else if (src === 'retroachievements') {
      await admin.from('game_tracks')
        .update({ achievements_earned: earned, achievements_total: total, ...(status === 'finished' ? { status } : {}) })
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

  // dado BRUTO por provedor (game_sync_data): nunca conflita com manual/outros
  // (dedupe por game_id: dois sets do RA podem casar no mesmo jogo)
  const syncByGame = new Map<string, Record<string, unknown>>();
  for (const m of matched) {
    const earned = Number(m.ra.NumAwarded);
    const total = Number(m.ra.MaxPossible);
    syncByGame.set(m.gid, {
      user_id: userId, game_id: m.gid, provider: 'retroachievements',
      platform: m.platform,
      achievements_earned: earned, achievements_total: total,
      progress: total > 0 ? Math.min(100, Math.round((earned / total) * 100)) : null,
      synced_at: new Date().toISOString(),
    });
  }
  const syncRows = [...syncByGame.values()];
  for (let i = 0; i < syncRows.length; i += 200) {
    const { error: sdErr } = await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
    if (sdErr) throw new Error(`game_sync_data: ${sdErr.message}`);
  }

  // cópias: jogado no RA = tem a ROM -> entra na VITRINE (só as que faltam)
  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'RetroAchievements'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: m.platform,
        distribution: 'digital', store: 'RetroAchievements',
      });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    const { error: cpErr } = await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
    if (cpErr) throw new Error(`game_copies: ${cpErr.message}`);
  }

  // carimbo do sync automático
  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'retroachievements');

  // fila de vinculação: misses persistidos pro painel admin (best-effort)
  if (misses.length > 0) {
    await admin.from('job_runs').insert({
      job: 'ra-sync-misses', mode: 'user', ok: true,
      stats: { user_id: userId, unmatched: misses.length, sample: misses.slice(0, 20) },
    }).then(() => {}, () => {});
  }

  return {
    ra_games: games.length,
    matched: matched.length,
    tracks_added: trackRows.length,
    tracks_updated: updated,
    copies_added: newCopies.length,
    unmatched: misses.length + unmatchedConsole,
    sample_misses: misses.slice(0, 10),
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const raUser = Deno.env.get('RA_API_USER');
    const raKey = Deno.env.get('RA_API_KEY');
    const cronSecret = Deno.env.get('CRON_SECRET');
    if (!raUser || !raKey) {
      return json({ error: 'RA_API_USER/RA_API_KEY não configuradas (supabase secrets set).' }, 500);
    }
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

    // catálogo: índice título+plataforma (compartilhado entre usuários no modo cron)
    const catalog = await fetchAll(() => admin.from('games').select('id, title, platforms'));
    const byKey = new Map<string, string>();
    for (const g of catalog) {
      for (const p of (g.platforms ?? []) as string[]) {
        byKey.set(`${p}|${norm(g.title)}`, g.id);
      }
    }

    // MODO CRON: sincroniza TODAS as contas vinculadas (estilo PlayTracker)
    if (viaCron) {
      const accounts = await fetchAll(() =>
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'retroachievements'));
      let ok = 0, failed = 0;
      for (const acc of accounts) {
        try {
          await syncUser(admin, raUser, raKey, acc.user_id as string, acc.account_id as string, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1200)); // gentileza com a API do RA
      }
      await admin.from('job_runs').insert({ job: 'ra-cron', mode: 'cron', ok: failed === 0, stats: { accounts: accounts.length, synced: ok, failed } }).then(() => {}, () => {});
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, failed });
    }

    // MODO USUÁRIO: o import é na conta do caller
    const body = await req.json().catch(() => ({}));
    const target = String(body.ra_user ?? '').trim();
    if (!target) return json({ error: 'Informe o usuário do RetroAchievements.' }, 400);

    const result = await syncUser(admin, raUser, raKey, caller!.id, target, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
