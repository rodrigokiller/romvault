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

    // auth: admin logado
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!prof?.is_admin) return json({ error: 'Só admins.' }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'igdb');

    /* ── ações que NÃO precisam de um jogo existente ── */
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
      if (existing) return json({ ok: true, existed: true, slug: existing.slug });

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
      return json({ ok: true, created: true, slug: created?.slug, title: hit.name });
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

    const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
    const normTitle = (s: string) => norm(String(s ?? ''));

    /* ── FASE 4a: HowLongToBeat (sem API oficial: descoberta de token no
       bundle deles, padrão das libs da comunidade) + fallback IGDB ── */
    if (action === 'hltb') {
      const fmtH = (secs: number | null | undefined) =>
        secs && secs > 0 ? `${Math.round((secs / 3600) * 2) / 2}h` : null;
      let times: { main: string | null; extras: string | null; full: string | null; source: string } | null = null;

      try {
        // 1) token: home -> _app-*.js -> "/api/xxx/".concat("a").concat("b")
        const home = await (await fetch('https://howlongtobeat.com/', { headers: { 'User-Agent': UA } })).text();
        const appJs = home.match(/src="(\/_next\/static\/chunks\/pages\/_app-[^"]+\.js)"/)?.[1];
        if (appJs) {
          const js = await (await fetch(`https://howlongtobeat.com${appJs}`, { headers: { 'User-Agent': UA } })).text();
          const mm = js.match(/"\/api\/([a-z]+)\/"(?:\.concat\("([^"]+)"\))(?:\.concat\("([^"]+)"\))?/);
          if (mm) {
            const endpoint = `/api/${mm[1]}/${mm[2] ?? ''}${mm[3] ?? ''}`;
            const res = await fetch(`https://howlongtobeat.com${endpoint}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json', 'User-Agent': UA,
                origin: 'https://howlongtobeat.com', referer: 'https://howlongtobeat.com/',
              },
              body: JSON.stringify({
                searchType: 'games',
                searchTerms: String(game.title).split(/\s+/).filter(Boolean),
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
              }),
            });
            if (res.ok) {
              // deno-lint-ignore no-explicit-any
              const hits = ((await res.json())?.data ?? []) as any[];
              const best = hits.find((h) => normTitle(h.game_name) === normTitle(game.title)) ?? hits[0];
              if (best) {
                times = {
                  main: fmtH(best.comp_main), extras: fmtH(best.comp_plus), full: fmtH(best.comp_100),
                  source: 'HowLongToBeat',
                };
              }
            }
          }
        }
      } catch { /* HLTB fora/mudou: cai no IGDB */ }

      // fallback: time_to_beats do IGDB (dados existem mas são mais ralos)
      const hltbTwitchId = Deno.env.get('TWITCH_CLIENT_ID');
      const hltbTwitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
      if (!times && game.igdb_id && hltbTwitchId && hltbTwitchSecret) {
        try {
          const tok = (await (await fetch(
            `https://id.twitch.tv/oauth2/token?client_id=${hltbTwitchId}&client_secret=${hltbTwitchSecret}&grant_type=client_credentials`,
            { method: 'POST' },
          )).json())?.access_token;
          const ttb = await fetch('https://api.igdb.com/v4/game_time_to_beats', {
            method: 'POST',
            headers: { 'Client-ID': hltbTwitchId, Authorization: `Bearer ${tok}` },
            body: `fields hastily, normally, completely; where game_id = ${game.igdb_id};`,
          });
          // deno-lint-ignore no-explicit-any
          const [row] = ((await ttb.json()) ?? []) as any[];
          if (row) {
            times = { main: fmtH(row.normally), extras: fmtH(row.hastily), full: fmtH(row.completely), source: 'IGDB' };
          }
        } catch { /* sem fallback */ }
      }

      if (!times || (!times.main && !times.full)) {
        return json({ error: 'Nem o HowLongToBeat nem o IGDB têm tempos pra este jogo.' }, 404);
      }
      const { error: htErr } = await admin.from('games').update({
        completion_times: {
          main_story: times.main, main_extras: times.extras, completionist: times.full, source: times.source,
        },
      }).eq('id', gameId);
      if (htErr) throw htErr;
      return json({ ok: true, action, updated: ['completion_times'], note: `Tempos de ${times.source}: ${times.main ?? '?'} / ${times.full ?? '?'}` });
    }

    /* ── FASE 4b: Metacritic (API do próprio frontend deles, complementar) ── */
    if (action === 'metacritic') {
      const mcKey = '1MOZgmNFxvmljaQR1X9KAij9Mo4xAY3u'; // apiKey pública do site
      const q = encodeURIComponent(String(game.title).slice(0, 60));
      const res = await fetch(
        `https://backend.metacritic.com/finder/metacritic/search/${q}/web?apiKey=${mcKey}&offset=0&limit=10&mcoTypeId=13`,
        { headers: { 'User-Agent': UA } },
      );
      if (!res.ok) return json({ error: `Metacritic: HTTP ${res.status}` }, 502);
      // deno-lint-ignore no-explicit-any
      const items = (((await res.json()) as any)?.data?.items ?? []) as any[];
      const gamesOnly = items.filter((i) => i.type === 'game-title' || i.criticScoreSummary);
      const best = gamesOnly.find((i) => normTitle(i.title) === normTitle(game.title)) ?? gamesOnly[0];
      const score = best?.criticScoreSummary?.score;
      if (!best || !score) return json({ error: 'Metacritic não achou este jogo (ou está sem nota).' }, 404);

      const mcMeta = { ...((game.metadata as Record<string, unknown> | null) ?? {}) } as Record<string, unknown>;
      const prevScores = (mcMeta.scores as Record<string, unknown> | undefined) ?? {};
      mcMeta.scores = {
        ...prevScores,
        metacritic: { score: Number(score), url: `https://www.metacritic.com/game/${best.slug}/`, slug: best.slug },
      };
      const { error: mcErr } = await admin.from('games').update({ metadata: mcMeta }).eq('id', gameId);
      if (mcErr) throw mcErr;
      return json({ ok: true, action, updated: ['metacritic'], note: `Metacritic ${score} (${best.title})` });
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
    const hit = forceId
      ? hits[0] // o admin escolheu explicitamente: obedece
      : ((game.igdb_id && !customQuery)
        ? hits[0]
        : (hits.find((h) => norm(h.name) === norm(searchTerm))
          ?? hits.find(sharesPlat)
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
