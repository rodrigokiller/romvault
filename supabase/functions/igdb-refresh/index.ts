// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: REFRESH DIÁRIO do catálogo IGDB.
//
// O buraco que faltava: não havia NADA varrendo o IGDB sozinho. Jogo novo só
// entrava quando alguém rodava o `npm run import` local, e jogo que MUDAVA de
// data (adiamento) ou ganhava um port nunca atualizava.
//
// Esta função pega os jogos ALTERADOS no IGDB desde a última rodada
// (`updated_at`), em TODAS as plataformas que a gente acompanha, e:
//   - CRIA os que ainda não temos (mesmo dedupe por igdb_id/slug do importer);
//   - ATUALIZA os que já existem SÓ nos campos voláteis: data de lançamento
//     (o "adiou"), plataformas (novo port), hypes/tba, e capa se faltava.
//     NÃO mexe em título/descrição/gêneros — isso pode ter sido curado à mão.
//
// Cursor = maior `updated_at` já processado, guardado em sync_state
// (source='igdb', entity='refresh'). Na 1ª rodada começa nos últimos 3 dias.
//
// Auth: x-cron-secret (cron) OU admin (teste manual pelo painel).
// Segredos: TWITCH_CLIENT_ID/SECRET, CRON_SECRET.
// Deploy: supabase functions deploy igdb-refresh --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

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
const TRACKED_IDS = Object.keys(PLATFORM_SHORT).map(Number);
const GAME_TYPE: Record<number, string> = {
  0: 'main', 2: 'expansion', 4: 'expanded', 5: 'mod', 8: 'remake', 9: 'remaster', 10: 'expanded', 11: 'port',
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s: string) => strip(s).toLowerCase().replace(/['’"]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
const img = (u: string | undefined, size: string) => (u ? 'https:' + u.replace('/t_thumb/', `/t_${size}/`) : null);

// deno-lint-ignore no-explicit-any
function igdbToGame(g: any) {
  // deno-lint-ignore no-explicit-any
  const shorts = (g.platforms ?? []).map((p: any) => PLATFORM_SHORT[p.id]).filter(Boolean);
  const primary = shorts[0] ?? 'PC';
  const platforms = [primary, ...shorts.filter((p: string) => p !== primary)];
  return {
    slug: `${slugify(g.name)}-${slugify(primary)}`,
    igdb_id: g.id,
    title: g.name,
    // deno-lint-ignore no-explicit-any
    developer: (g.involved_companies ?? []).find((ic: any) => ic.developer)?.company?.name ?? null,
    // deno-lint-ignore no-explicit-any
    developers: (g.involved_companies ?? []).filter((ic: any) => ic.developer).map((ic: any) => ic.company?.name).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    publishers: (g.involved_companies ?? []).filter((ic: any) => ic.publisher).map((ic: any) => ic.company?.name).filter(Boolean),
    release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
    // deno-lint-ignore no-explicit-any
    genres: (g.genres ?? []).map((x: any) => x.name).filter(Boolean),
    platforms,
    franchise: g.franchises?.[0]?.name ?? g.collection?.name ?? null,
    description: g.summary ?? null,
    cover_url: img(g.cover?.url, 'cover_big_2x'),
    thumbnail: img(g.cover?.url, 'cover_big'),
    // deno-lint-ignore no-explicit-any
    screenshots: (g.screenshots ?? []).map((s: any) => img(s.url, 'screenshot_med')).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    game_modes: (g.game_modes ?? []).map((x: any) => x.name).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    themes: (g.themes ?? []).map((x: any) => x.name).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    is_adult: (g.themes ?? []).some((x: any) => x.name === 'Erotic'),
    game_type: GAME_TYPE[g.game_type as number] ?? 'main',
    // deno-lint-ignore no-explicit-any
    alt_titles: (g.alternative_names ?? []).map((a: any) => String(a.name)).filter(Boolean).slice(0, 8),
    series: g.collection?.name ?? null,
    hypes: typeof g.hypes === 'number' ? g.hypes : null,
    tba: !g.first_release_date,
    external_ids: { igdb: g.id },
    data_source: 'igdb',
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const twitchId = Deno.env.get('TWITCH_CLIENT_ID');
    const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
    if (!twitchId || !twitchSecret) return json({ error: 'TWITCH_CLIENT_ID/SECRET não configurados.' }, 500);
    const admin = createClient(url, serviceKey);

    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    const body = await req.json().catch(() => ({}));
    if (!isCron) {
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: prof } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!prof?.is_admin) return json({ error: 'Apenas admins.' }, 403);
    }

    const tokRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!tokRes.ok) return json({ error: `OAuth Twitch: ${tokRes.status}` }, 502);
    const token = (await tokRes.json()).access_token as string;
    const igdb = async (q: string) => {
      const r = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST', headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` }, body: q,
      });
      if (!r.ok) throw new Error(`IGDB ${r.status}: ${await r.text()}`);
      // deno-lint-ignore no-explicit-any
      return await r.json() as any[];
    };

    // cursor = maior updated_at já visto. 1ª vez: últimos 3 dias.
    const { data: ss } = await admin.from('sync_state').select('cursor')
      .eq('source', 'igdb').eq('entity', 'refresh').maybeSingle();
    let cursor = Number(ss?.cursor ?? 0) || (Math.floor(Date.now() / 1000) - 3 * 86400);
    const startCursor = cursor;

    const fields =
      'fields id,name,updated_at,summary,first_release_date,hypes,slug,cover.url,screenshots.url,genres.name,'
      + 'platforms.id,platforms.name,game_modes.name,themes.name,franchises.name,collection.name,game_type,'
      + 'alternative_names.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';
    const platList = TRACKED_IDS.join(',');
    const perPage = 500;
    const maxPages = Math.min(Number(body.pages) || 6, 30); // ~3000 jogos/rodada

    const stats = { criados: 0, atualizados: 0, pulados: 0, erros: 0 };
    for (let page = 0; page < maxPages; page++) {
      // só jogos puros (0,8,9,10,11), nas nossas plataformas, mais novos que o cursor
      const games = await igdb(
        `${fields} where updated_at > ${cursor} & game_type = (0,8,9,10,11) & platforms = (${platList});`
        + ` sort updated_at asc; limit ${perPage};`,
      );
      if (games.length === 0) break;

      // quem desses já temos? (por igdb_id, em lote — sem carregar 84k linhas)
      const igdbIds = games.map((g) => g.id);
      const { data: have } = await admin.from('games')
        .select('id, igdb_id, cover_url, platforms, release_date, screenshots, genres, description, developer, franchise')
        .in('igdb_id', igdbIds);
      // deno-lint-ignore no-explicit-any
      const byIgdb = new Map<number, any>((have ?? []).map((h) => [Number(h.igdb_id), h]));

      for (const g of games) {
        cursor = Math.max(cursor, Number(g.updated_at) || cursor);
        const row = igdbToGame(g);
        const cur = byIgdb.get(g.id);
        if (cur) {
          // regra: ATUALIZA o volátil/autoritativo (data, plataformas, hypes,
          // tba) e PREENCHE o que está vazio (capa, screenshots, gêneros, dev,
          // descrição). NUNCA sobrescreve texto que já existe — pode ter sido
          // curado à mão.
          const patch: Record<string, unknown> = {};
          if (row.release_date !== cur.release_date) patch.release_date = row.release_date;
          const union = [...new Set([...(cur.platforms ?? []), ...row.platforms])];
          if (union.length !== (cur.platforms ?? []).length) patch.platforms = union;
          if (!cur.cover_url && row.cover_url) { patch.cover_url = row.cover_url; patch.thumbnail = row.thumbnail; }
          if (!(cur.screenshots?.length) && row.screenshots.length) patch.screenshots = row.screenshots;
          if (!(cur.genres?.length) && row.genres.length) patch.genres = row.genres;
          if (!cur.description && row.description) patch.description = row.description;
          if (!cur.developer && row.developer) { patch.developer = row.developer; patch.developers = row.developers; }
          if (!cur.franchise && row.franchise) patch.franchise = row.franchise;
          patch.hypes = row.hypes;
          patch.tba = row.tba;
          const { error } = await admin.from('games').update(patch).eq('id', cur.id);
          if (error) stats.erros++; else stats.atualizados++;
          continue;
        }
        // NOVO: insere (dedupe por slug; se colidir com outro jogo, sufixa)
        let ins = await admin.from('games').insert(row).select('id').single();
        if (ins.error && /duplicate|unique/i.test(ins.error.message)) {
          if (/games_igdb_id/i.test(ins.error.message)) { stats.pulados++; continue; }
          ins = await admin.from('games').insert({ ...row, slug: `${row.slug}-${g.id}` }).select('id').single();
        }
        if (ins.error || !ins.data) { stats.erros++; continue; }
        stats.criados++;
        await admin.from('id_map').upsert(
          { romvault_id: ins.data.id, source: 'igdb', entity: `game:${row.platforms[0].toLowerCase()}`, external_id: String(g.id), confidence: 1, match_type: 'igdb_id' },
          { onConflict: 'source,entity,external_id' },
        ).then(() => {}, () => {});
      }
      if (games.length < perPage) break;
    }

    if (cursor > startCursor) {
      await admin.from('sync_state').upsert(
        { source: 'igdb', entity: 'refresh', cursor: String(cursor), status: 'idle', last_sync_at: new Date().toISOString(), items_processed: stats.criados + stats.atualizados },
        { onConflict: 'source,entity' },
      );
    }
    await admin.from('job_runs')
      .insert({ job: 'igdb-refresh', mode: isCron ? 'cron' : 'manual', ok: stats.erros === 0, stats })
      .then(() => {}, () => {});
    return json({ ok: true, ...stats, cursor });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
