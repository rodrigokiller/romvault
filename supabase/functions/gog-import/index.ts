// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca GOG pelo PERFIL PÚBLICO
// (endpoint JSON público gog.com/u/<user>/games/stats — sem key, sem NPSSO).
// O usuário só precisa deixar o perfil público nas configurações do GOG.
//
// GOG não expõe conquistas por esse caminho: vem jogos + horas + última
// sessão. Tudo PC. Match por título — NUNCA cria jogo. Cria cópias
// (digital · GOG) e game_sync_data; tracks novos entram como backlog
// (com horas), igual o Steam.
//
// Sem segredo. Deploy: supabase functions deploy gog-import --no-verify-jwt
// Cron: aceita x-cron-secret (CRON_SECRET) — sincroniza provider='gog'.
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

interface GogGame {
  title: string;
  hours: number | null;
  lastSession: string | null;
}

/** Lê todas as páginas do perfil público do GOG. */
async function gogGames(username: string): Promise<GogGame[]> {
  // headers COMPLETOS de Chrome (client hints sec-ch-ua + sec-fetch) — o
  // Cloudflare do GOG deixa passar bem mais requisicoes com eles do que só o UA
  const CHROME = {
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.9,pt-BR;q=0.8',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    'sec-ch-ua': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'empty',
    'sec-fetch-mode': 'cors',
    'sec-fetch-site': 'same-origin',
    'X-Requested-With': 'XMLHttpRequest',
  };
  const fetchPage = (page: number) => fetch(
    `https://www.gog.com/u/${encodeURIComponent(username)}/games/stats?page=${page}`,
    { headers: { ...CHROME, Referer: `https://www.gog.com/u/${encodeURIComponent(username)}/games` } },
  );
  const out: GogGame[] = [];
  for (let page = 1; page <= 40; page++) {
    // até 3 tentativas com backoff no 403 (CDN às vezes solta na 2a/3a)
    let res = await fetchPage(page);
    for (let attempt = 1; attempt <= 2 && res.status === 403; attempt++) {
      await new Promise((r) => setTimeout(r, 1500 * attempt));
      res = await fetchPage(page);
    }
    if (res.status === 404) throw new Error(`Perfil GOG "${username}" não existe ou é privado.`);
    if (res.status === 403) {
      throw new Error('GOG bloqueou a consulta (HTTP 403). O CDN deles recusa IPs de servidor de vez em quando; confira se o perfil está PÚBLICO em gog.com/account/settings/privacy e tente de novo em alguns minutos.');
    }
    if (!res.ok) throw new Error(`GOG: HTTP ${res.status}`);
    const data = await res.json();
    // deno-lint-ignore no-explicit-any
    const items = (data?._embedded?.items ?? []) as any[];
    for (const it of items) {
      const title = it?.game?.title;
      if (!title) continue;
      // stats vem keyed pelo id do usuário: { "<uid>": { playtime, lastSession } }
      // deno-lint-ignore no-explicit-any
      const stat = Object.values((it?.stats ?? {}) as Record<string, any>)[0];
      out.push({
        title: String(title),
        hours: stat?.playtime ? Math.round((Number(stat.playtime) / 60) * 10) / 10 : null,
        lastSession: stat?.lastSession ?? null,
      });
    }
    const pages = Number(data?.pages ?? 1);
    if (page >= pages) break;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function syncUser(admin: any, userId: string, username: string, byKey: Map<string, string>) {
  const games = await gogGames(username);
  if (games.length === 0) {
    await admin.from('user_accounts')
      .update({ last_sync: new Date().toISOString() })
      .eq('user_id', userId).eq('provider', 'gog');
    return {
      gog_games: 0, matched: 0, tracks_added: 0, tracks_updated: 0,
      copies_added: 0, unmatched: 0, sample_misses: [],
      note: 'Conta vinculada; nenhum jogo visível no perfil ainda.',
    };
  }

  const matched: { gid: string; g: GogGame }[] = [];
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
        hours_played: m.g.hours, source: 'gog',
      });
    } else if (src === 'gog' && m.g.hours) {
      await admin.from('game_tracks').update({ hours_played: m.g.hours })
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

  // dado bruto por provedor (dedupe por game_id)
  const syncByGame = new Map<string, Record<string, unknown>>();
  for (const m of matched) {
    syncByGame.set(m.gid, {
      user_id: userId, game_id: m.gid, provider: 'gog', platform: 'PC',
      hours_played: m.g.hours,
      last_played: m.g.lastSession,
      synced_at: new Date().toISOString(),
    });
  }
  const syncRows = [...syncByGame.values()];
  for (let i = 0; i < syncRows.length; i += 200) {
    const { error: sdErr } = await admin.from('game_sync_data')
      .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
    if (sdErr) throw new Error(`game_sync_data: ${sdErr.message}`);
  }

  // cópias (vitrine)
  const myCopies = await fetchAll(() =>
    admin.from('game_copies').select('game_id').eq('user_id', userId).eq('store', 'GOG'));
  const copyGames = new Set(myCopies.map((c: { game_id: string }) => c.game_id));
  const newCopies: Record<string, unknown>[] = [];
  for (const m of matched) {
    if (!copyGames.has(m.gid)) {
      copyGames.add(m.gid);
      newCopies.push({
        user_id: userId, game_id: m.gid, platform: 'PC',
        distribution: 'digital', store: 'GOG',
      });
    }
  }
  for (let i = 0; i < newCopies.length; i += 200) {
    const { error: cpErr } = await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
    if (cpErr) throw new Error(`game_copies: ${cpErr.message}`);
  }

  await admin.from('user_accounts')
    .update({ last_sync: new Date().toISOString() })
    .eq('user_id', userId).eq('provider', 'gog');

  // fila de vinculação: misses persistidos pro painel admin (best-effort)
  if (misses.length > 0) {
    await admin.from('job_runs').insert({
      job: 'gog-sync-misses', mode: 'user', ok: true,
      stats: { user_id: userId, unmatched: misses.length, sample: misses.slice(0, 20) },
    }).then(() => {}, () => {});
  }

  return {
    gog_games: games.length,
    matched: matched.length,
    tracks_added: trackRows.length,
    tracks_updated: updated,
    copies_added: newCopies.length,
    unmatched: misses.length,
    sample_misses: misses.slice(0, 10),
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
        admin.from('user_accounts').select('user_id, account_id').eq('provider', 'gog'));
      let ok = 0, failed = 0;
      for (const acc of accounts) {
        try {
          await syncUser(admin, acc.user_id as string, acc.account_id as string, byKey);
          ok++;
        } catch { failed++; }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await admin.from('job_runs').insert({ job: 'gog-cron', mode: 'cron', ok: failed === 0, stats: { accounts: accounts.length, synced: ok, failed } }).then(() => {}, () => {});
      return json({ ok: true, mode: 'cron', accounts: accounts.length, synced: ok, failed });
    }

    const body = await req.json().catch(() => ({}));
    const target = String(body.gog_user ?? '').trim();
    if (!target) return json({ error: 'Informe o username do GOG.' }, 400);

    const result = await syncUser(admin, caller!.id, target, byKey);
    return json({ ok: true, ...result });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
