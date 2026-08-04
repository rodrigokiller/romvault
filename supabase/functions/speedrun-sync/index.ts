// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: recordes de SPEEDRUN (speedrun.com) por jogo.
//
// A speedrun.com tem API pública boa (sem Cloudflare, ~100 req/min). Esta função
// acha o jogo lá pelo nome, pega o WR de cada categoria (full-game) e cacheia em
// game_speedruns. Dois modos:
//   - { game_id }  -> read-through da PÁGINA do jogo (qualquer um; re-busca só se
//                     passou de 7 dias). Devolve os runs.
//   - lote (cron/admin) -> processa uma leva (owned/populares primeiro).
// O id do jogo no speedrun.com fica em games.external_ids.speedruncom (ou false
// quando não existe lá) pra não re-pesquisar.
//
// Deploy: supabase functions deploy speedrun-sync --no-verify-jwt
// Cron: select public.setup_import_cron('speedrun-sync',
//   'https://SEU-PROJETO.supabase.co/functions/v1/speedrun-sync','SECRET','{}'::jsonb,'0 9 * * *');
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const strip = (s: string) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
const norm = (s: string) => strip(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const SR = 'https://www.speedrun.com/api/v1';
const UA = { 'User-Agent': 'RomVault/1.0 (+https://romvault.app)' };
const sr = async (p: string) => {
  const r = await fetch(`${SR}${p}`, { headers: UA });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`speedrun.com ${r.status}`);
  return await r.json();
};

// deno-lint-ignore no-explicit-any
type Admin = any;

/** Resolve o id do jogo no speedrun.com (cacheado em external_ids). */
// deno-lint-ignore no-explicit-any
async function resolveSrId(admin: Admin, game: any): Promise<string | null> {
  const ext = (game.external_ids ?? {}) as Record<string, unknown>;
  if (typeof ext.speedruncom === 'string') return ext.speedruncom;
  if (ext.speedruncom === false) return null;

  const res = await sr(`/games?name=${encodeURIComponent(game.title)}&max=8`);
  // deno-lint-ignore no-explicit-any
  const cands = (res?.data ?? []) as any[];
  const want = norm(game.title);
  const year = game.release_date ? Number(String(game.release_date).slice(0, 4)) : null;
  let hit = cands.find((c) => norm(c.names?.international ?? '') === want)
    ?? cands.find((c) => {
      const n = norm(c.names?.international ?? '');
      return (n.includes(want) || want.includes(n)) && (!year || !c.released || Math.abs(c.released - year) <= 2);
    })
    ?? null;
  const id = hit?.id ?? null;
  await admin.from('games').update({
    external_ids: { ...ext, speedruncom: id ?? false, speedruncom_at: new Date().toISOString() },
  }).eq('id', game.id);
  return id;
}

/** Puxa o WR de cada categoria e regrava game_speedruns do jogo. */
// deno-lint-ignore no-explicit-any
async function syncGame(admin: Admin, game: any): Promise<number> {
  const srId = await resolveSrId(admin, game);
  if (!srId) return 0;
  const res = await sr(`/games/${srId}/records?top=1&scope=full-game&miscellaneous=no&embed=players,category`);
  // deno-lint-ignore no-explicit-any
  const recs = (res?.data ?? []) as any[];
  const rows: Record<string, unknown>[] = [];
  for (const r of recs.slice(0, 10)) {
    const run = r.runs?.[0]?.run;
    if (!run) continue;
    const cat = r.category?.data?.name ?? 'Any%';
    // deno-lint-ignore no-explicit-any
    const p = (r.players?.data ?? [])[0] as any;
    const runner = p?.names?.international ?? p?.name ?? null;
    rows.push({
      game_id: game.id, category: cat, place: 1, runner,
      time_seconds: run.times?.primary_t ?? null,
      video_url: run.videos?.links?.[0]?.uri ?? null,
      run_url: run.weblink ?? null, source: 'speedrun.com', fetched_at: new Date().toISOString(),
    });
  }
  // regrava limpo (categorias mudam; place=1 só)
  await admin.from('game_speedruns').delete().eq('game_id', game.id);
  if (rows.length) await admin.from('game_speedruns').insert(rows);
  return rows.length;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const admin = createClient(url, serviceKey);
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    const singleId = typeof body.game_id === 'string' ? body.game_id : null;

    // MODO SINGLE (read-through da página): qualquer um; re-busca só se >7 dias.
    if (singleId) {
      const { data: game } = await admin.from('games').select('id, title, release_date, external_ids').eq('id', singleId).maybeSingle();
      if (!game) return json({ error: 'Jogo não encontrado.' }, 404);
      const ext = (game.external_ids ?? {}) as Record<string, unknown>;
      const checkedAt = typeof ext.speedruncom_at === 'string' ? Date.parse(ext.speedruncom_at) : 0;
      const stale = !checkedAt || (Date.now() - checkedAt) > 7 * 86400 * 1000;
      let n = 0;
      if (stale) n = await syncGame(admin, game);
      const { data: runs } = await admin.from('game_speedruns').select('category, runner, time_seconds, video_url, run_url')
        .eq('game_id', singleId).order('time_seconds', { ascending: true });
      return json({ ok: true, refetched: stale, count: n, runs: runs ?? [] });
    }

    // MODO LOTE (cron/admin)
    if (!isCron) {
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Apenas admins.' }, 403);
    }

    const limit = Math.min(Number(body.limit) || 40, 80);
    // prioridade: jogos que alguém TEM, depois populares, ainda não checados
    const { data: owned } = await admin.from('game_copies').select('game_id').limit(4000);
    const ownedIds = [...new Set((owned ?? []).map((x: { game_id: string }) => x.game_id))];
    const pool: { id: string; title: string; release_date: string | null; external_ids: Record<string, unknown> | null }[] = [];
    if (ownedIds.length) {
      const { data } = await admin.from('games').select('id, title, release_date, external_ids')
        .in('id', ownedIds.slice(0, 1500));
      pool.push(...((data ?? []) as typeof pool));
    }
    const { data: pop } = await admin.from('games').select('id, title, release_date, external_ids')
      .order('hypes', { ascending: false, nullsFirst: false }).limit(800);
    pool.push(...((pop ?? []) as typeof pool));

    // remove os já checados nos últimos 30 dias e dedupe
    const seen = new Set<string>();
    const todo: typeof pool = [];
    for (const g of pool) {
      if (seen.has(g.id)) continue; seen.add(g.id);
      const at = typeof g.external_ids?.speedruncom_at === 'string' ? Date.parse(g.external_ids.speedruncom_at as string) : 0;
      if (at && (Date.now() - at) < 30 * 86400 * 1000) continue;
      todo.push(g);
      if (todo.length >= limit) break;
    }

    let comRuns = 0, total = 0;
    for (const g of todo) {
      try {
        const n = await syncGame(admin, g);
        total++; if (n > 0) comRuns++;
      } catch { /* rate-limit/erro pontual: segue */ }
    }
    await admin.from('job_runs').insert({ job: 'speedrun-sync', mode: isCron ? 'cron' : 'manual', ok: true, stats: { processados: total, com_runs: comRuns } }).then(() => {}, () => {});
    return json({ ok: true, processados: total, com_runs: comRuns });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
