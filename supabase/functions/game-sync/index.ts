// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: sync/ajuste de UM jogo (ferramenta de admin).
// Estilo trakt: em qualquer página de jogo o admin pode re-sincronizar
// metadados/arte do IGDB ou definir arte manualmente por URL.
//
//   action 'igdb'    -> busca no IGDB (por igdb_id ou título+plataforma) e
//                       atualiza capa/thumb SEMPRE que houver; preenche
//                       screenshots/descrição/dev/gêneros/lançamento se vazios.
//   action 'set-art' -> override manual: { cover_url? , boxart?, box3d? }
//                       (cover_url também vira thumbnail; boxart/box3d vão
//                       pro metadata com merge)
//
// Auth: JWT de admin. Segredos: TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET (os
// mesmos do igdb-sync). Deploy: supabase functions deploy game-sync --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

/** Mensagem legível de QUALQUER erro (PostgrestError é objeto plano, não Error). */
const errMsg = (e: unknown): string => {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as { message?: unknown; details?: unknown; hint?: unknown };
    const parts = [o.message, o.details, o.hint].filter((x) => typeof x === 'string' && x);
    if (parts.length > 0) return parts.join(' · ');
    try { return JSON.stringify(e); } catch { /* circular */ }
  }
  return String(e);
};

const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

const img = (imageId: string, size: string) =>
  `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;

/** UA de navegador: HLTB e Metacritic rejeitam cliente "sem cara de browser". */
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

const fmtH = (secs: number | null | undefined) =>
  (secs && secs > 0 ? `${Math.round((secs / 3600) * 2) / 2}h` : null);

type Times = { main_story: string | null; main_extras: string | null; completionist: string | null; source: string };

/**
 * HowLongToBeat — fluxo novo (2025). O antigo (_app-*.js + tokens .concat)
 * morreu e fazia TUDO cair no fallback do IGDB. Agora:
 *   GET  /api/bleed/init -> { token, hpKey, hpVal }   (anti-bot leve)
 *   POST /api/bleed      com x-auth-token/x-hp-key/x-hp-val + honeypot no corpo
 */
async function hltbTimes(title: string): Promise<Times | null> {
  try {
    const initRes = await fetch(`https://howlongtobeat.com/api/bleed/init?t=${Date.now()}`, {
      headers: { 'User-Agent': UA, referer: 'https://howlongtobeat.com/' },
    });
    if (!initRes.ok) return null;
    const sec = (await initRes.json()) as { token?: string; hpKey?: string; hpVal?: string };
    const body: Record<string, unknown> = {
      searchType: 'games',
      searchTerms: String(title).split(/\s+/).filter(Boolean),
      searchPage: 1,
      size: 5,
      searchOptions: {
        games: {
          userId: 0, platform: '', sortCategory: 'popular', rangeCategory: 'main',
          rangeTime: { min: null, max: null },
          gameplay: { perspective: '', flow: '', genre: '', difficulty: '' },
          rangeYear: { min: '', max: '' }, modifier: '',
        },
        users: { sortCategory: 'postcount' }, lists: { sortCategory: 'follows' },
        filter: '', sort: 0, randomizer: 0,
      },
      useCache: true,
    };
    if (sec.hpKey) body[sec.hpKey] = sec.hpVal;
    const res = await fetch('https://howlongtobeat.com/api/bleed', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json', 'User-Agent': UA,
        origin: 'https://howlongtobeat.com', referer: 'https://howlongtobeat.com/',
        'x-auth-token': sec.token ?? '', 'x-hp-key': sec.hpKey ?? '', 'x-hp-val': sec.hpVal ?? '',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) return null;
    // deno-lint-ignore no-explicit-any
    const hits = ((await res.json())?.data ?? []) as any[];
    const best = hits.find((h) => norm(String(h.game_name ?? '')) === norm(title)) ?? hits[0];
    if (!best) return null;
    return {
      main_story: fmtH(best.comp_main), main_extras: fmtH(best.comp_plus),
      completionist: fmtH(best.comp_100), source: 'HowLongToBeat',
    };
  } catch { return null; }
}

/** Fallback do HLTB: game_time_to_beats do IGDB (mais ralo, porém estável). */
async function igdbTimes(igdbId: number | null | undefined): Promise<Times | null> {
  const cid = Deno.env.get('TWITCH_CLIENT_ID');
  const secret = Deno.env.get('TWITCH_CLIENT_SECRET');
  if (!igdbId || !cid || !secret) return null;
  try {
    const tok = (await (await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${cid}&client_secret=${secret}&grant_type=client_credentials`,
      { method: 'POST' },
    )).json())?.access_token;
    const ttb = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
      method: 'POST',
      headers: { 'Client-ID': cid, Authorization: `Bearer ${tok}` },
      body: `fields hastily, normally, completely; where game_id = ${igdbId};`,
    });
    // deno-lint-ignore no-explicit-any
    const [row] = ((await ttb.json()) ?? []) as any[];
    if (!row) return null;
    return {
      main_story: fmtH(row.normally), main_extras: fmtH(row.hastily),
      completionist: fmtH(row.completely), source: 'IGDB',
    };
  } catch { return null; }
}

const MC_KEY = '1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u'; // apiKey pública do frontend deles
/**
 * Metacritic — SÓ título idêntico (+ano ±1). O finder é fuzzy e muitas vezes nem
 * traz o jogo certo ("GTA VI" devolvia Vice City); cair no [0] colava nota errada.
 */
async function mcScore(title: string, releaseDate: string | null): Promise<{ score: number; url: string; slug: string } | null> {
  try {
    const q = encodeURIComponent(String(title).slice(0, 60));
    const res = await fetch(
      `https://backend.metacritic.com/finder/metacritic/search/${q}/web?apiKey=${MC_KEY}&offset=0&limit=10&mcoTypeId=13`,
      { headers: { 'User-Agent': UA } },
    );
    if (!res.ok) return null;
    // deno-lint-ignore no-explicit-any
    const items = (((await res.json()) as any)?.data?.items ?? []) as any[];
    const gamesOnly = items.filter((i) => i.type === 'game-title' || i.criticScoreSummary);
    const target = norm(title);
    const ourYear = releaseDate ? new Date(String(releaseDate)).getFullYear() : null;
    // deno-lint-ignore no-explicit-any
    const yearOf = (i: any): number | null => {
      const raw = i?.premiereYear ?? i?.releaseYear ?? i?.releaseDate ?? null;
      if (raw == null) return null;
      const y = typeof raw === 'number' ? raw : new Date(String(raw)).getFullYear();
      return Number.isFinite(y) ? y : null;
    };
    const exact = gamesOnly.filter((i) => norm(String(i.title ?? '')) === target);
    const best = ourYear != null
      ? (exact.find((i) => { const y = yearOf(i); return y == null || Math.abs(y - ourYear) <= 1; }) ?? null)
      : (exact[0] ?? null);
    const score = best?.criticScoreSummary?.score;
    if (!best || !score) return null;
    return { score: Number(score), url: `https://www.metacritic.com/game/${best.slug}/`, slug: best.slug };
  } catch { return null; }
}

/* id de plataforma do IGDB -> nosso nome curto (mesma tabela do importer) */
const PLATFORM_SHORT: Record<number, string> = {
  18: 'NES', 19: 'SNES', 4: 'N64', 21: 'GameCube', 5: 'Wii', 41: 'Wii U', 130: 'Switch', 508: 'Switch 2',
  33: 'Game Boy', 22: 'GBC', 24: 'GBA', 20: 'NDS', 37: '3DS', 87: 'Virtual Boy',
  29: 'Genesis', 64: 'Master System', 35: 'Game Gear', 32: 'Saturn', 23: 'Dreamcast', 78: 'Sega CD', 30: '32X',
  7: 'PS1', 8: 'PS2', 9: 'PS3', 48: 'PS4', 167: 'PS5', 38: 'PSP', 46: 'PS Vita',
  11: 'Xbox', 12: 'Xbox 360', 49: 'Xbox One', 169: 'Xbox Series',
  6: 'PC', 13: 'DOS', 14: 'Mac', 3: 'Linux',
  52: 'Arcade', 128: 'TG-16', 80: 'Neo Geo', 59: 'Atari 2600', 62: 'Jaguar',
  16: 'Amiga', 15: 'C64', 50: '3DO', 68: 'ColecoVision', 67: 'Intellivision', 34: 'Android', 39: 'iOS',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'igdb');

    // auth: admin logado — EXCETO o enrich em lote, que é chamado pelo cron
    // (sem usuário) e se identifica pelo x-cron-secret.
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = action === 'enrich-batch'
      && Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!isCron) {
      const asUser = createClient(url, anonKey, {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Só admins.' }, 403);
    }

    /* ── ações que NÃO precisam de um jogo existente ── */

    /*
     * ENRICH EM LOTE (job diário): preenche Metacritic + HowLongToBeat de quem
     * ainda não tem. É a "primeira carga" automática — o resto do dia-a-dia os
     * jogos novos entram por aqui sozinhos. Marca mc_miss/hltb_miss pra não
     * re-gastar request em quem não tem match.
     */
    if (action === 'enrich-batch') {
      const cap = Math.min(Math.max(Number(body.limit ?? 25), 1), 60);
      const WINDOW = 1500;
      // janela DESLOCADA a cada rodada: varrendo sempre as mesmas primeiras
      // linhas, o resto do catálogo nunca seria enriquecido.
      const { count: poolCount } = await admin.from('games')
        .select('id', { count: 'exact', head: true }).not('igdb_id', 'is', null);
      const maxOffset = Math.max(0, (poolCount ?? 0) - WINDOW);
      const offset = maxOffset > 0 ? Math.floor(Math.random() * maxOffset) : 0;
      const { data: pool } = await admin.from('games')
        .select('id, title, release_date, metadata, completion_times, igdb_id')
        .not('igdb_id', 'is', null)
        .order('id')
        .range(offset, offset + WINDOW - 1);
      type Row = {
        id: string; title: string; release_date: string | null; igdb_id: number | null;
        metadata: Record<string, unknown> | null;
        completion_times: { main_story?: string | null; completionist?: string | null } | null;
      };
      const pending = ((pool ?? []) as Row[]).filter((g) => {
        const md = (g.metadata ?? {}) as { scores?: { metacritic?: unknown }; mc_miss?: boolean; hltb_miss?: boolean };
        const ct = g.completion_times;
        const hasMc = Boolean(md.scores?.metacritic) || md.mc_miss === true;
        const hasHltb = Boolean(ct && (ct.main_story || ct.completionist)) || md.hltb_miss === true;
        return !hasMc || !hasHltb;
      }).slice(0, cap);

      let hltbOk = 0; let mcOk = 0;
      for (const g of pending) {
        const md = { ...((g.metadata ?? {}) as Record<string, unknown>) };
        const scores = { ...((md.scores as Record<string, unknown> | undefined) ?? {}) };
        const ct = g.completion_times;
        const patch: Record<string, unknown> = {};
        if (!(ct && (ct.main_story || ct.completionist)) && md.hltb_miss !== true) {
          const times = (await hltbTimes(String(g.title))) ?? (await igdbTimes(g.igdb_id));
          if (times && (times.main_story || times.completionist)) { patch.completion_times = times; hltbOk++; }
          else md.hltb_miss = true;
        }
        if (!scores.metacritic && md.mc_miss !== true) {
          const mc = await mcScore(String(g.title), g.release_date);
          if (mc) { scores.metacritic = mc; md.scores = scores; mcOk++; }
          else md.mc_miss = true;
        }
        patch.metadata = md;
        await admin.from('games').update(patch).eq('id', g.id);
        await new Promise((r) => setTimeout(r, 350)); // gentileza com HLTB/MC
      }
      // registro no painel de jobs (falha aqui nunca derruba a rodada)
      await admin.from('job_runs')
        .insert({ job: 'enrich-cron', mode: 'cron', ok: true, stats: { tentados: pending.length, hltb: hltbOk, metacritic: mcOk } })
        .then(() => {}, () => {});
      return json({ ok: true, action, tried: pending.length, hltb: hltbOk, metacritic: mcOk });
    }
    if (action === 'igdb-search' || action === 'igdb-create') {
      const twitchId = Deno.env.get('TWITCH_CLIENT_ID');
      const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
      if (!twitchId || !twitchSecret) return json({ error: 'TWITCH_CLIENT_ID/SECRET não configuradas.' }, 500);
      const tokRes = await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
        { method: 'POST' },
      );
      const token = (await tokRes.json())?.access_token;
      if (!token) return json({ error: 'OAuth Twitch falhou.' }, 502);
      const igdb = (q: string) => fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` },
        body: q,
      });

      if (action === 'igdb-search') {
        // busca por termo OU por id direto — o modal estilo Plex usa os dois
        const igdbId = Number(body.igdb_id ?? 0);
        const query = String(body.query ?? '').replace(/"/g, '').slice(0, 100);
        if (!query && !igdbId) return json({ error: 'Informe a busca ou o id do IGDB.' }, 400);
        const F = 'fields name, platforms, first_release_date, cover.image_id, summary, game_type;';
        const res = await igdb(igdbId
          ? `${F} where id = ${igdbId};`
          : `${F} search "${query}"; limit 10;`);
        if (!res.ok) return json({ error: `IGDB: HTTP ${res.status}` }, 502);
        // deno-lint-ignore no-explicit-any
        const hits = (await res.json()) as any[];
        return json({
          ok: true,
          results: hits.map((h) => ({
            igdb_id: h.id,
            title: h.name,
            year: h.first_release_date ? new Date(h.first_release_date * 1000).getFullYear() : null,
            platforms: (h.platforms ?? []).map((p: number) => PLATFORM_SHORT[p]).filter(Boolean),
            thumb: h.cover?.image_id ? img(h.cover.image_id, 'cover_small') : null,
            summary: h.summary ? String(h.summary).slice(0, 220) : null,
          })),
        });
      }

      // igdb-create: importa UM jogo pelo id do IGDB (dedupe por igdb_id)
      const igdbId = Number(body.igdb_id ?? 0);
      if (!igdbId) return json({ error: 'Informe igdb_id.' }, 400);
      const { data: existing } = await admin.from('games').select('id, slug').eq('igdb_id', igdbId).maybeSingle();
      // devolve o id: o painel encadeia o enriquecimento (mídia/HLTB/Metacritic)
      if (existing) return json({ ok: true, existed: true, id: existing.id, slug: existing.slug });

      const res = await igdb(
        'fields name, cover.image_id, screenshots.image_id, summary, first_release_date, platforms, '
        + 'genres.name, franchises.name, involved_companies.company.name, involved_companies.developer; '
        + `where id = ${igdbId};`,
      );
      if (!res.ok) return json({ error: `IGDB: HTTP ${res.status}` }, 502);
      // deno-lint-ignore no-explicit-any
      const [hit] = (await res.json()) as any[];
      if (!hit) return json({ error: 'Jogo não achado no IGDB.' }, 404);

      const platforms = (hit.platforms ?? []).map((p: number) => PLATFORM_SHORT[p]).filter(Boolean);
      const slugBase = norm(hit.name).replace(/\s+/g, '-');
      const row: Record<string, unknown> = {
        slug: slugBase,
        title: hit.name,
        igdb_id: igdbId,
        platforms,
        data_source: 'igdb',
        description: hit.summary ?? null,
        release_date: hit.first_release_date
          ? new Date(hit.first_release_date * 1000).toISOString().slice(0, 10) : null,
        // deno-lint-ignore no-explicit-any
        genres: (hit.genres ?? []).map((g: any) => g.name),
        franchise: hit.franchises?.[0]?.name ?? null,
        // deno-lint-ignore no-explicit-any
        developer: hit.involved_companies?.find((c: any) => c.developer)?.company?.name ?? null,
        cover_url: hit.cover?.image_id ? img(hit.cover.image_id, 'cover_big_2x') : null,
        thumbnail: hit.cover?.image_id ? img(hit.cover.image_id, 'cover_big') : null,
        // deno-lint-ignore no-explicit-any
        screenshots: (hit.screenshots ?? []).slice(0, 6).map((s: any) => img(s.image_id, '720p')),
      };
      let { data: created, error: insErr } = await admin.from('games').insert(row).select('id, slug').single();
      if (insErr && /duplicate|unique/i.test(insErr.message)) {
        // slug colidiu com outro jogo: sufixa com o id do IGDB
        row.slug = `${slugBase}-${igdbId}`;
        ({ data: created, error: insErr } = await admin.from('games').insert(row).select('id, slug').single());
      }
      if (insErr) throw insErr;
      return json({ ok: true, created: true, id: created?.id, slug: created?.slug, title: hit.name });
    }

    const gameId = String(body.game_id ?? '');
    if (!gameId) return json({ error: 'Informe game_id.' }, 400);

    const { data: game } = await admin.from('games').select('*').eq('id', gameId).maybeSingle();
    if (!game) return json({ error: 'Jogo não encontrado.' }, 404);

    /* ── override manual de arte ── */
    if (action === 'set-art') {
      const patch: Record<string, unknown> = {};
      const meta = { ...((game.metadata as Record<string, unknown> | null) ?? {}) };
      if (body.cover_url) {
        patch.cover_url = String(body.cover_url);
        patch.thumbnail = String(body.thumbnail ?? body.cover_url);
      }
      if (body.boxart) meta.boxart = String(body.boxart);
      if (body.box3d) meta.box3d = String(body.box3d);
      if (body.boxart || body.box3d) patch.metadata = meta;
      if (Object.keys(patch).length === 0) return json({ error: 'Nada pra salvar.' }, 400);
      const { error } = await admin.from('games').update(patch).eq('id', gameId);
      if (error) throw error;
      return json({ ok: true, action, updated: Object.keys(patch) });
    }

    /* ── FERRAMENTA VISUAL DE MERGE (analise.txt): funde ESTE jogo dentro de
       um alvo — filhos re-apontados, lacunas do alvo preenchidas, este some.
       Caso Starbound: página criada pela Steam + registro IGDB duplicado. ── */
    if (action === 'merge') {
      const targetId = String(body.target_id ?? '');
      if (!targetId || targetId === gameId) return json({ error: 'Informe um jogo ALVO diferente.' }, 400);
      const { data: target } = await admin.from('games').select('*').eq('id', targetId).maybeSingle();
      if (!target) return json({ error: 'Jogo alvo não encontrado.' }, 404);
      // dois igdb_ids DIFERENTES normalmente = jogos distintos (remaster/port),
      // mas às vezes um deles é um MATCH ERRADO (RHDN criou um chrono-trigger-snes
      // com igdb 206320). Bloqueia por padrão sugerindo Ligar, mas aceita
      // force:true quando o admin confirma que é a mesma coisa.
      if (game.igdb_id && target.igdb_id && game.igdb_id !== target.igdb_id && !body.force) {
        return json({
          error: `Os dois têm igdb_id diferentes (${game.igdb_id} vs ${target.igdb_id}). `
            + 'Se forem versões distintas, use "Ligar como versão". Se um está com igdb errado, confirme pra fundir mesmo assim.',
          needsForce: true,
        }, 409);
      }

      const moved: Record<string, number> = {};
      const repoint = async (table: string, col = 'game_id') => {
        const { count } = await admin.from(table).select('*', { count: 'exact', head: true }).eq(col, gameId);
        if ((count ?? 0) === 0) { moved[table] = 0; return; }
        const { error } = await admin.from(table).update({ [col]: targetId }).eq(col, gameId);
        // conflito de unicidade (ex.: game_media mesma url): move linha a linha
        if (error) {
          const { data: rows } = await admin.from(table).select('id').eq(col, gameId);
          let ok = 0;
          for (const r of (rows ?? []) as { id: string }[]) {
            const { error: e } = await admin.from(table).update({ [col]: targetId }).eq('id', r.id);
            if (e) await admin.from(table).delete().eq('id', r.id);
            else ok++;
          }
          moved[table] = ok;
          return;
        }
        moved[table] = count ?? 0;
      };

      await repoint('romhacks');
      await repoint('translations');
      await repoint('documents');
      await repoint('game_copies');
      await repoint('game_playthroughs');
      await repoint('game_media');
      // tracks/sync: unicidade por usuário — move só quem não conflita; o que
      // conflitar morre junto do jogo fonte (o usuário já tem linha no alvo)
      const { data: srcTracks } = await admin.from('game_tracks').select('user_id').eq('game_id', gameId);
      moved.game_tracks = 0;
      for (const tr of (srcTracks ?? []) as { user_id: string }[]) {
        const { count } = await admin.from('game_tracks').select('*', { count: 'exact', head: true })
          .eq('user_id', tr.user_id).eq('game_id', targetId);
        if ((count ?? 0) === 0) {
          await admin.from('game_tracks').update({ game_id: targetId })
            .eq('user_id', tr.user_id).eq('game_id', gameId);
          moved.game_tracks++;
        }
      }
      const { data: srcSync } = await admin.from('game_sync_data').select('user_id, provider').eq('game_id', gameId);
      moved.game_sync_data = 0;
      for (const s of (srcSync ?? []) as { user_id: string; provider: string }[]) {
        const { count } = await admin.from('game_sync_data').select('*', { count: 'exact', head: true })
          .eq('user_id', s.user_id).eq('game_id', targetId).eq('provider', s.provider);
        if ((count ?? 0) === 0) {
          await admin.from('game_sync_data').update({ game_id: targetId })
            .eq('user_id', s.user_id).eq('game_id', gameId).eq('provider', s.provider);
          moved.game_sync_data++;
        }
      }
      // polimórficos e relações: conflito raro vira delete da linha fonte
      for (const t of ['favorites', 'reviews']) {
        const { data: rows } = await admin.from(t).select('user_id').eq('subject_type', 'game').eq('subject_id', gameId);
        for (const r of (rows ?? []) as { user_id: string }[]) {
          const { error: e } = await admin.from(t).update({ subject_id: targetId })
            .eq('user_id', r.user_id).eq('subject_type', 'game').eq('subject_id', gameId);
          if (e) await admin.from(t).delete().eq('user_id', r.user_id).eq('subject_type', 'game').eq('subject_id', gameId);
        }
      }
      await admin.from('collection_items').update({ subject_id: targetId })
        .eq('subject_type', 'game').eq('subject_id', gameId)
        .then(() => {}, () => {});
      for (const col of ['game_id', 'related_id'] as const) {
        const { data: rels } = await admin.from('game_relations').select('game_id, related_id').eq(col, gameId);
        for (const r of (rels ?? []) as { game_id: string; related_id: string }[]) {
          const ng = col === 'game_id' ? targetId : r.game_id;
          const nr = col === 'related_id' ? targetId : r.related_id;
          await admin.from('game_relations').delete().eq('game_id', r.game_id).eq('related_id', r.related_id);
          if (ng !== nr) {
            await admin.from('game_relations')
              .upsert({ game_id: ng, related_id: nr, relation: 'version_of', source: 'manual' }, { onConflict: 'game_id,related_id', ignoreDuplicates: true })
              .then(() => {}, () => {});
          }
        }
      }
      await admin.from('id_map').update({ romvault_id: targetId }).eq('romvault_id', gameId);

      // lacunas do alvo preenchidas com o que a fonte tinha (external_ids é o
      // OURO: o appid da Steam passa pro alvo e o próximo sync casa direto)
      const fill: Record<string, unknown> = {};
      const tExt = { ...((game.external_ids as Record<string, unknown> | null) ?? {}), ...((target.external_ids as Record<string, unknown> | null) ?? {}) };
      if (Object.keys(tExt).length > Object.keys((target.external_ids as Record<string, unknown> | null) ?? {}).length) fill.external_ids = tExt;
      const platsUnion = [...new Set([...(target.platforms ?? []), ...(game.platforms ?? [])])];
      if (platsUnion.length > (target.platforms ?? []).length) fill.platforms = platsUnion;
      if (!target.cover_url && game.cover_url) { fill.cover_url = game.cover_url; fill.thumbnail = game.thumbnail; }
      if (!target.description && game.description) fill.description = game.description;
      if (!target.igdb_id && game.igdb_id) fill.igdb_id = game.igdb_id;
      if (Object.keys(fill).length > 0) await admin.from('games').update(fill).eq('id', targetId);

      const { error: delErr } = await admin.from('games').delete().eq('id', gameId);
      if (delErr) return json({ error: `Filhos movidos, mas apagar a fonte falhou: ${delErr.message}` }, 500);
      return json({ ok: true, action, target_slug: target.slug, moved });
    }

    /* ── FASE 4a: HowLongToBeat (sem API oficial: descoberta de token no
       bundle deles, padrão das libs da comunidade) + fallback IGDB ── */
    if (action === 'hltb') {
      const times = (await hltbTimes(String(game.title))) ?? (await igdbTimes(game.igdb_id));
      if (!times || (!times.main_story && !times.completionist)) {
        return json({ error: 'Nem o HowLongToBeat nem o IGDB têm tempos pra este jogo.' }, 404);
      }
      const { error: htErr } = await admin.from('games').update({ completion_times: times }).eq('id', gameId);
      if (htErr) throw htErr;
      return json({
        ok: true, action, updated: ['completion_times'],
        note: `Tempos de ${times.source}: ${times.main_story ?? '?'} / ${times.completionist ?? '?'}`,
      });
    }

    /* ── FASE 4b: Metacritic (API do próprio frontend deles, complementar) ── */
    if (action === 'metacritic') {
      const mc = await mcScore(String(game.title), game.release_date ?? null);
      if (!mc) return json({ error: 'Metacritic sem match confiável pra este jogo (ou sem nota).' }, 404);
      const mcMeta = { ...((game.metadata as Record<string, unknown> | null) ?? {}) } as Record<string, unknown>;
      const prevScores = (mcMeta.scores as Record<string, unknown> | undefined) ?? {};
      mcMeta.scores = { ...prevScores, metacritic: mc };
      const { error: mcErr } = await admin.from('games').update({ metadata: mcMeta }).eq('id', gameId);
      if (mcErr) throw mcErr;
      return json({ ok: true, action, updated: ['metacritic'], note: `Metacritic ${mc.score} (${mc.slug})` });
    }

    /* ── FASE 2: MÍDIA DO IGDB POR GRUPOS (analise.txt: "trazer tudo, separar
       por grupo igual o IGDB") — capas localizadas (com região), artes
       adicionais e vídeos, gravados em game_media/metadata ── */
    if (action === 'igdb-media') {
      if (!game.igdb_id) return json({ error: 'Este jogo não tem igdb_id: vincule primeiro.' }, 400);
      const mTwitchId = Deno.env.get('TWITCH_CLIENT_ID');
      const mTwitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
      if (!mTwitchId || !mTwitchSecret) return json({ error: 'TWITCH_CLIENT_ID/SECRET não configuradas.' }, 500);
      const mTok = (await (await fetch(
        `https://id.twitch.tv/oauth2/token?client_id=${mTwitchId}&client_secret=${mTwitchSecret}&grant_type=client_credentials`,
        { method: 'POST' },
      )).json())?.access_token;
      if (!mTok) return json({ error: 'OAuth Twitch falhou.' }, 502);

      const mRes = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': mTwitchId, Authorization: `Bearer ${mTok}` },
        body: 'fields artworks.image_id, videos.video_id, videos.name, '
          + 'game_localizations.cover.image_id, game_localizations.name, game_localizations.region.name; '
          + `where id = ${game.igdb_id};`,
      });
      if (!mRes.ok) return json({ error: `IGDB: HTTP ${mRes.status}` }, 502);
      // deno-lint-ignore no-explicit-any
      const [mHit] = ((await mRes.json()) ?? []) as any[];
      if (!mHit) return json({ error: 'Jogo não achado no IGDB.' }, 404);

      const rows: { game_id: string; kind: string; region: string | null; url: string; source: string }[] = [];
      // deno-lint-ignore no-explicit-any
      for (const a of (mHit.artworks ?? []) as any[]) {
        if (a?.image_id) rows.push({ game_id: gameId, kind: 'hero', region: null, url: img(a.image_id, '1080p'), source: 'igdb' });
      }
      // deno-lint-ignore no-explicit-any
      for (const l of (mHit.game_localizations ?? []) as any[]) {
        if (l?.cover?.image_id) {
          rows.push({
            game_id: gameId, kind: 'cover',
            region: (l.region?.name as string | undefined) ?? (l.name as string | undefined) ?? null,
            url: img(l.cover.image_id, 'cover_big_2x'), source: 'igdb',
          });
        }
      }
      let mediaCount = 0;
      if (rows.length > 0) {
        const { error: gmErr } = await admin.from('game_media')
          .upsert(rows, { onConflict: 'game_id,url', ignoreDuplicates: true });
        if (gmErr) return json({ error: `game_media: ${gmErr.message} (migration 33 aplicada?)` }, 500);
        mediaCount = rows.length;
      }
      // vídeos: o primeiro vira video_url do jogo (se vazio); lista no metadata
      // deno-lint-ignore no-explicit-any
      const vids = ((mHit.videos ?? []) as any[])
        .filter((v) => v?.video_id)
        .map((v) => ({ name: (v.name as string | null) ?? null, id: String(v.video_id) }))
        .slice(0, 8);
      const mPatch: Record<string, unknown> = {};
      if (vids.length > 0) {
        const mMeta = { ...((game.metadata as Record<string, unknown> | null) ?? {}) };
        mMeta.videos = vids;
        mPatch.metadata = mMeta;
        if (!game.video_url) mPatch.video_url = `https://www.youtube.com/watch?v=${vids[0].id}`;
      }
      if (Object.keys(mPatch).length > 0) await admin.from('games').update(mPatch).eq('id', gameId);
      return json({
        ok: true, action,
        note: `Mídia IGDB: ${mediaCount} imagem(ns) (${rows.filter((r) => r.kind === 'cover').length} capas localizadas) + ${vids.length} vídeo(s).`,
      });
    }

    /* ── re-sync do IGDB ── */
    const twitchId = Deno.env.get('TWITCH_CLIENT_ID');
    const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
    if (!twitchId || !twitchSecret) {
      return json({ error: 'TWITCH_CLIENT_ID/SECRET não configuradas.' }, 500);
    }
    const tokRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    const token = (await tokRes.json())?.access_token;
    if (!token) return json({ error: 'OAuth Twitch falhou.' }, 502);

    // termo customizado OU vínculo explícito por id (modal estilo Plex)
    const customQuery = String(body.query ?? '').replace(/"/g, '').slice(0, 100).trim();
    const forceId = Number(body.igdb_id ?? 0); // "Vincular" do modal manda o id escolhido
    const searchTerm = customQuery || String(game.title).replace(/"/g, '');

    const fields =
      'fields name, cover.image_id, screenshots.image_id, summary, first_release_date, ' +
      'platforms, themes.name, genres.name, franchises.name, involved_companies.company.name, involved_companies.developer, ' +
      'alternative_names.name, release_dates.date, release_dates.platform, release_dates.human, release_dates.release_region, ' +
      'aggregated_rating, aggregated_rating_count, rating, rating_count, ' +
      'game_type, collection.name, parent_game, version_parent, remasters, remakes, ports, expanded_games, standalone_expansions;';
    const query = forceId
      ? `${fields} where id = ${forceId};`
      : (game.igdb_id && !customQuery
        ? `${fields} where id = ${game.igdb_id};`
        : `${fields} search "${searchTerm}"; limit 10;`);
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` },
      body: query,
    });
    if (!igdbRes.ok) return json({ error: `IGDB: HTTP ${igdbRes.status}` }, 502);
    // deno-lint-ignore no-explicit-any
    const hits = (await igdbRes.json()) as any[];
    /*
     * Matching SEGURO (sem cair cego no 1º resultado — era assim que um FF VI
     * ganhava arte de FF VII): 1º nome exato; 2º candidato que divide
     * plataforma com o nosso jogo; com termo customizado o admin manda, então
     * aceita o 1º. Sem match: erro sugerindo o termo de busca.
     */
    const ourPlats = new Set((game.platforms ?? []) as string[]);
    // deno-lint-ignore no-explicit-any
    const sharesPlat = (h: any) =>
      (h.platforms ?? []).some((pid: number) => ourPlats.has(PLATFORM_SHORT[pid]));
    /*
     * DESEMPATE POR ANO: quando vários candidatos têm o MESMO nome (Final
     * Fantasy VI original vs Pixel Remaster de 2022), o ano que já sabemos do
     * nosso jogo escolhe o certo — antes vinha o 1º da lista, no chute.
     */
    const ourYear = game.release_date ? new Date(String(game.release_date)).getFullYear() : null;
    // deno-lint-ignore no-explicit-any
    const yearOf = (h: any) => (h.first_release_date ? new Date(h.first_release_date * 1000).getFullYear() : null);
    // deno-lint-ignore no-explicit-any
    const closest = (list: any[]) => {
      if (list.length === 0) return undefined;
      if (ourYear == null || list.length === 1) return list[0];
      return [...list].sort((a, b) => {
        const ya = yearOf(a); const yb = yearOf(b);
        return (ya == null ? 999 : Math.abs(ya - ourYear)) - (yb == null ? 999 : Math.abs(yb - ourYear));
      })[0];
    };
    const hit = forceId
      ? hits[0] // o admin escolheu explicitamente: obedece
      : ((game.igdb_id && !customQuery)
        ? hits[0]
        : (closest(hits.filter((h) => norm(h.name) === norm(searchTerm)))
          ?? closest(hits.filter(sharesPlat))
          ?? (customQuery ? hits[0] : undefined)));
    if (!hit) {
      return json({ error: `IGDB não achou nada confiável pra "${searchTerm}" — tente ajustar o termo de busca.` }, 404);
    }

    const patch: Record<string, unknown> = {};
    const updated: string[] = [];
    if (hit.cover?.image_id) {
      patch.cover_url = img(hit.cover.image_id, 'cover_big_2x');
      patch.thumbnail = img(hit.cover.image_id, 'cover_big');
      updated.push('cover');
    }
    if (!game.igdb_id && hit.id) { patch.igdb_id = hit.id; updated.push('igdb_id'); }
    // vínculo explícito re-aponta o igdb_id (corrigir match errado)
    if (forceId && hit.id && game.igdb_id !== hit.id) { patch.igdb_id = hit.id; updated.push('igdb_id'); }
    // igdb_id é ÚNICO: se outro jogo já usa este id, erro CLARO em vez do
    // "duplicate key" cru (era a causa do {"error":"[object Object]"})
    if (patch.igdb_id) {
      const { data: clash } = await admin.from('games')
        .select('slug, title').eq('igdb_id', patch.igdb_id).neq('id', gameId).maybeSingle();
      if (clash) {
        return json({
          error: `Este id do IGDB já está vinculado a "${clash.title}" (/games/${clash.slug}). `
            + 'Se são o mesmo jogo duplicado, funda com: npm run import -- --source=dedupe --dry',
        }, 409);
      }
    }
    // +18 (tema Erotic) marca sempre que detectado
    // deno-lint-ignore no-explicit-any
    if ((hit.themes ?? []).some((t: any) => t.name === 'Erotic') && !game.is_adult) {
      patch.is_adult = true;
      updated.push('is_adult');
    }
    if ((!game.screenshots || game.screenshots.length === 0) && hit.screenshots?.length) {
      // deno-lint-ignore no-explicit-any
      patch.screenshots = hit.screenshots.slice(0, 6).map((s: any) => img(s.image_id, '720p'));
      updated.push('screenshots');
    }
    if (!game.description && hit.summary) { patch.description = hit.summary; updated.push('description'); }
    if (!game.release_date && hit.first_release_date) {
      patch.release_date = new Date(hit.first_release_date * 1000).toISOString().slice(0, 10);
      updated.push('release_date');
    }
    if ((!game.genres || game.genres.length === 0) && hit.genres?.length) {
      // deno-lint-ignore no-explicit-any
      patch.genres = hit.genres.map((g: any) => g.name);
      updated.push('genres');
    }
    if (!game.franchise && hit.franchises?.length) { patch.franchise = hit.franchises[0].name; updated.push('franchise'); }
    if (hit.involved_companies?.length) {
      // deno-lint-ignore no-explicit-any
      const devs = (hit.involved_companies as any[]).filter((c) => c.developer).map((c) => c.company?.name).filter(Boolean);
      if (!game.developer && devs[0]) { patch.developer = devs[0]; updated.push('developer'); }
      // plural SEMPRE atualiza (Bird Studio + Square, não só o primeiro)
      if (devs.length > 0) { patch.developers = devs; updated.push('developers'); }
      // deno-lint-ignore no-explicit-any
      const pubs = (hit.involved_companies as any[]).filter((c) => c.publisher).map((c) => c.company?.name).filter(Boolean);
      if (pubs.length > 0 && !(game.publishers ?? []).length) { patch.publishers = pubs; updated.push('publishers'); }
    }
    // MULTI-PLATAFORMA: mescla (união) as plataformas do IGDB nas nossas —
    // ex.: Chrono Trigger que só tinha PC/PS1/PSP ganha SNES/NDS de volta
    if (hit.platforms?.length) {
      const mapped = (hit.platforms as number[]).map((pid) => PLATFORM_SHORT[pid]).filter(Boolean);
      const merged = [...new Set([...(game.platforms ?? []), ...mapped])];
      if (merged.length > (game.platforms ?? []).length) {
        patch.platforms = merged;
        updated.push('platforms');
      }
    }

    /* metadados extras -> metadata (merge): releases POR PLATAFORMA (Chrono
       Trigger: SFC 1995-03-11, SNES 1995-08-11, Wii 2011...), títulos
       alternativos/localizados e notas do IGDB (críticos agregados + usuários) */
    const meta = { ...((game.metadata as Record<string, unknown> | null) ?? {}) };
    let metaTouched = false;
    if (hit.release_dates?.length) {
      // região do IGDB (id numérico do release_region) -> etiqueta curta;
      // o "duplicado" na aba era a MESMA plataforma em regiões diferentes
      const REGION: Record<number, string> = {
        1: 'EU', 2: 'NA', 3: 'AU', 4: 'NZ', 5: 'JP', 6: 'CN', 7: 'ASIA', 8: 'WW', 9: 'KR', 10: 'BR',
      };
      const seenRel = new Set<string>();
      // deno-lint-ignore no-explicit-any
      const releases = (hit.release_dates as any[])
        .map((r) => ({
          platform: PLATFORM_SHORT[r.platform] ?? null,
          date: r.date ? new Date(r.date * 1000).toISOString().slice(0, 10) : (r.human ?? null),
          region: REGION[r.release_region as number] ?? null,
        }))
        .filter((r) => {
          if (!r.platform || !r.date) return false;
          const k = `${r.platform}|${r.date}|${r.region ?? ''}`;
          if (seenRel.has(k)) return false; // dedupe exato
          seenRel.add(k);
          return true;
        })
        .sort((a, b) => String(a.date).localeCompare(String(b.date)));
      if (releases.length > 0) { meta.releases = releases; metaTouched = true; updated.push('releases'); }
    }
    if (hit.alternative_names?.length) {
      // coluna PESQUISÁVEL (a busca cobre título + alternativos: FF III x FF VI)
      // deno-lint-ignore no-explicit-any
      const alts = (hit.alternative_names as any[]).map((a) => String(a.name)).filter(Boolean).slice(0, 8);
      if (alts.length > 0) { patch.alt_titles = alts; updated.push('alt_titles'); }
    }
    // tipo do jogo (main/remake/remaster/expanded/port) + série (coleção)
    const GAME_TYPE: Record<number, string> = {
      0: 'main', 2: 'expansion', 4: 'expanded', 5: 'mod', 8: 'remake', 9: 'remaster', 10: 'expanded', 11: 'port',
    };
    if (hit.game_type !== undefined && GAME_TYPE[hit.game_type as number]) {
      patch.game_type = GAME_TYPE[hit.game_type as number];
      updated.push('game_type');
    }
    if (!game.series && hit.collection?.name) { patch.series = hit.collection.name; updated.push('series'); }
    if (hit.aggregated_rating || hit.rating) {
      meta.scores = {
        critics: hit.aggregated_rating ? Math.round(hit.aggregated_rating) : null,
        critics_count: hit.aggregated_rating_count ?? null,
        users: hit.rating ? Math.round(hit.rating) : null,
        users_count: hit.rating_count ?? null,
        source: 'igdb',
      };
      metaTouched = true;
      updated.push('scores');
    }
    if (metaTouched) patch.metadata = meta;

    /* RELAÇÕES: remaster/remake/port/expanded são jogos SEPARADOS mas ligados.
       Só liga quem JÁ EXISTE no nosso banco (por igdb_id) — nunca cria jogo aqui. */
    let linked = 0;
    const relPairs: { ids: number[]; relation: string; inverted: boolean }[] = [
      { ids: (hit.remasters ?? []) as number[], relation: 'remaster_of', inverted: true },
      { ids: (hit.remakes ?? []) as number[], relation: 'remake_of', inverted: true },
      { ids: (hit.ports ?? []) as number[], relation: 'port_of', inverted: true },
      { ids: [...((hit.expanded_games ?? []) as number[]), ...((hit.standalone_expansions ?? []) as number[])], relation: 'expanded_of', inverted: true },
      { ids: [hit.parent_game, hit.version_parent].filter(Boolean) as number[], relation: 'version_of', inverted: false },
    ];
    const allRelIds = [...new Set(relPairs.flatMap((p) => p.ids))];
    if (allRelIds.length > 0) {
      const { data: relGames } = await admin.from('games').select('id, igdb_id').in('igdb_id', allRelIds);
      const ourByIgdb = new Map((relGames ?? []).map((r) => [Number(r.igdb_id), r.id as string]));
      const rows: { game_id: string; related_id: string; relation: string; source: string }[] = [];
      for (const p of relPairs) {
        for (const relIgdb of p.ids) {
          const other = ourByIgdb.get(Number(relIgdb));
          if (!other || other === gameId) continue;
          // inverted: o OUTRO jogo é remaster/porte DESTE; senão ESTE é versão do outro
          rows.push(p.inverted
            ? { game_id: other, related_id: gameId, relation: p.relation, source: 'igdb' }
            : { game_id: gameId, related_id: other, relation: p.relation, source: 'igdb' });
        }
      }
      if (rows.length > 0) {
        const { error: relErr } = await admin.from('game_relations')
          .upsert(rows, { onConflict: 'game_id,related_id', ignoreDuplicates: true });
        if (!relErr) linked = rows.length; // tabela ainda não migrada: segue sem travar
      }
    }

    if (updated.length === 0 && linked === 0) return json({ ok: true, action, updated, note: 'nada novo no IGDB' });
    if (Object.keys(patch).length > 0) {
      const { error } = await admin.from('games').update(patch).eq('id', gameId);
      if (error) throw error;
    }
    return json({ ok: true, action, matched: hit.name, updated, linked });
  } catch (err) {
    return json({ error: errMsg(err) }, 500);
  }
});
