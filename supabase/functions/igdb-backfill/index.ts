// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: BACKFILL do catálogo IGDB (carga inicial contínua).
//
// O `igdb-refresh` só pega o que MUDOU (updated_at). Faltava quem terminasse a
// CARGA de jogos antigos: as varreduras por plataforma foram rodadas na mão pelo
// CLI e várias pararam no meio (ex.: GameCube parou no id 356k, N64 no 396k,
// enquanto SNES chegou a ~411k). Esta função retoma o cursor de cada plataforma
// (source='igdb', entity='game:<key>' — o MESMO do CLI) e varre `id > cursor`
// até a cabeça. Rodando num cron diário, em ~1-2 semanas o catálogo fecha, e
// depois fica só "aparando" o topo. Idempotente (upsert por igdb_id).
//
// Prioriza as plataformas MAIS ATRASADAS (menor cursor primeiro) e é time-boxed
// (maxSeconds) pra não estourar o limite da edge. Regra de escrita = igual ao
// refresh: cria os novos e SÓ PREENCHE lacunas nos que já existem (nunca
// sobrescreve texto curado à mão).
//
// Auth: x-cron-secret (cron) OU admin (teste manual). Segredos:
// TWITCH_CLIENT_ID/SECRET, CRON_SECRET.
// Deploy: supabase functions deploy igdb-backfill --no-verify-jwt
// Cron (SQL Editor):
//   select public.setup_import_cron('igdb-backfill',
//     'https://SEU-PROJETO.supabase.co/functions/v1/igdb-backfill',
//     'SEU-CRON-SECRET', '{}'::jsonb, '0 8 * * *');
// Reset de uma plataforma (re-varre do 0 pra pegar buracos): body { reset:['n64'] }
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });

const PLATFORM_SHORT: Record<number, string> = {
  18: 'NES', 19: 'SNES', 4: 'N64', 21: 'GameCube', 5: 'Wii', 41: 'Wii U', 130: 'Switch', 508: 'Switch 2',
  33: 'Game Boy', 22: 'GBC', 24: 'GBA', 20: 'NDS', 37: '3DS', 87: 'Virtual Boy',
  29: 'Genesis', 64: 'Master System', 35: 'Game Gear', 32: 'Saturn', 23: 'Dreamcast', 78: 'Sega CD', 30: '32X',
  7: 'PS1', 8: 'PS2', 9: 'PS3', 48: 'PS4', 167: 'PS5', 38: 'PSP', 46: 'PS Vita',
  11: 'Xbox', 12: 'Xbox 360', 49: 'Xbox One', 169: 'Xbox Series',
  6: 'PC', 13: 'DOS', 14: 'Mac', 3: 'Linux',
  52: 'Arcade', 128: 'TG-16', 80: 'Neo Geo', 59: 'Atari 2600', 62: 'Jaguar',
  16: 'Amiga', 15: 'C64', 50: '3DO', 68: 'ColecoVision', 67: 'Intellivision', 34: 'Android', 39: 'iOS',
  // variantes regionais japonesas -> caem no console que o usuário conhece
  58: 'SNES', 99: 'NES', 51: 'FDS', 86: 'TG-16', 137: '3DS',
  // handhelds/consoles/computadores que faltavam (muito jogo JP e retrô)
  57: 'WonderSwan', 123: 'WonderSwan', 124: 'WonderSwan', 119: 'NGP', 120: 'NGPC', 136: 'Neo Geo CD',
  84: 'SG-1000', 60: 'Atari 7800', 66: 'Atari 5200', 61: 'Lynx', 114: 'Amiga CD32', 117: 'CD-i',
  70: 'Vectrex', 127: 'Channel F', 27: 'MSX', 53: 'MSX', 121: 'X68000', 118: 'FM Towns',
  125: 'PC-8800', 77: 'Sharp X1', 26: 'ZX Spectrum', 25: 'Amstrad CPC', 65: 'Atari 8-bit', 63: 'Atari ST',
};
// UMA chave canônica por id do IGDB (bate com os entity 'game:<key>' do CLI)
const IGDB_PLATFORMS: Record<string, number> = {
  nes: 18, snes: 19, n64: 4, gamecube: 21, wii: 5, wiiu: 41, switch: 130, switch2: 508,
  gb: 33, gbc: 22, gba: 24, nds: 20, '3ds': 37, virtualboy: 87,
  genesis: 29, master: 64, gamegear: 35, saturn: 32, dreamcast: 23, segacd: 78, sega32x: 30,
  ps1: 7, ps2: 8, ps3: 9, ps4: 48, ps5: 167, psp: 38, vita: 46,
  xbox: 11, x360: 12, xboxone: 49, xseries: 169,
  pc: 6, dos: 13, mac: 14, linux: 3,
  arcade: 52, tg16: 128, neogeo: 80, atari2600: 59, jaguar: 62,
  amiga: 16, c64: 15, '3do': 50, colecovision: 68, intellivision: 67, android: 34, ios: 39,
  // variantes JP + consoles/computadores que faltavam
  superfamicom: 58, famicom: 99, fds: 51, pcengine: 86, new3ds: 137,
  wonderswan: 57, wonderswancolor: 123, swancrystal: 124, ngp: 119, ngpc: 120, neogeocd: 136,
  sg1000: 84, atari7800: 60, atari5200: 66, lynx: 61, amigacd32: 114, cdi: 117,
  vectrex: 70, channelf: 127, msx: 27, msx2: 53, x68000: 121, fmtowns: 118,
  pc8800: 125, sharpx1: 77, zxspectrum: 26, amstradcpc: 25, atari8bit: 65, atarist: 63,
};
const GAME_TYPE: Record<number, string> = {
  0: 'main', 2: 'expansion', 4: 'expanded', 5: 'mod', 8: 'remake', 9: 'remaster', 10: 'expanded', 11: 'port',
};

const strip = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');
const slugify = (s: string) => strip(s).toLowerCase().replace(/['’"]/g, '').replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
const img = (u: string | undefined, size: string) => (u ? 'https:' + u.replace('/t_thumb/', `/t_${size}/`) : null);

// deno-lint-ignore no-explicit-any
function igdbToGame(g: any, primary: string) {
  // deno-lint-ignore no-explicit-any
  const shorts = (g.platforms ?? []).map((p: any) => PLATFORM_SHORT[p.id] ?? p.name).filter(Boolean);
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
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
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

    const fields =
      'fields id,name,summary,first_release_date,hypes,cover.url,screenshots.url,genres.name,'
      + 'platforms.id,platforms.name,game_modes.name,themes.name,franchises.name,collection.name,game_type,'
      + 'alternative_names.name,involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';
    const perPage = 500;
    const pagesPerPlatform = Math.min(Number(body.pagesPerPlatform) || 6, 40);
    const maxSeconds = Math.min(Number(body.maxSeconds) || 110, 140);
    const only = Array.isArray(body.only) ? (body.only as string[]) : null;
    const reset = new Set(Array.isArray(body.reset) ? (body.reset as string[]) : []);

    // cursores atuais de cada plataforma
    const keys = Object.keys(IGDB_PLATFORMS).filter((k) => !only || only.includes(k));
    const { data: states } = await admin.from('sync_state').select('entity, cursor')
      .eq('source', 'igdb').in('entity', keys.map((k) => `game:${k}`));
    const cursorOf: Record<string, number> = {};
    for (const s of (states ?? []) as { entity: string; cursor: string | null }[]) {
      cursorOf[s.entity] = Number(s.cursor ?? 0) || 0;
    }
    // mais atrasada primeiro (reset => 0, vai pro topo da fila)
    keys.sort((a, b) => (reset.has(a) ? 0 : cursorOf[`game:${a}`] ?? 0) - (reset.has(b) ? 0 : cursorOf[`game:${b}`] ?? 0));

    const started = Date.now();
    const perPlatform: Record<string, { criados: number; atualizados: number; pulados: number; erros: number; cursor: number; done: boolean }> = {};
    let touched = 0;

    for (const key of keys) {
      if ((Date.now() - started) / 1000 > maxSeconds) break;
      const pid = IGDB_PLATFORMS[key];
      const primary = PLATFORM_SHORT[pid] ?? key.toUpperCase();
      let cursor = reset.has(key) ? 0 : (cursorOf[`game:${key}`] ?? 0);
      const st = { criados: 0, atualizados: 0, pulados: 0, erros: 0, cursor, done: false };
      perPlatform[key] = st;

      for (let page = 0; page < pagesPerPlatform; page++) {
        if ((Date.now() - started) / 1000 > maxSeconds) break;
        const games = await igdb(
          `${fields} where platforms = (${pid}) & game_type = (0,8,9,10,11) & id > ${cursor}; sort id asc; limit ${perPage};`,
        );
        if (games.length === 0) { st.done = true; break; }

        const igdbIds = games.map((g) => g.id);
        const { data: have } = await admin.from('games')
          .select('id, igdb_id, cover_url, platforms, release_date, screenshots, genres, description, developer, franchise')
          .in('igdb_id', igdbIds);
        // deno-lint-ignore no-explicit-any
        const byIgdb = new Map<number, any>((have ?? []).map((h) => [Number(h.igdb_id), h]));

        for (const g of games) {
          cursor = Math.max(cursor, Number(g.id) || cursor);
          const row = igdbToGame(g, primary);
          const cur = byIgdb.get(g.id);
          if (cur) {
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
            if (Object.keys(patch).length) {
              const { error } = await admin.from('games').update(patch).eq('id', cur.id);
              if (error) st.erros++; else st.atualizados++;
            }
            continue;
          }
          let ins = await admin.from('games').insert(row).select('id').single();
          if (ins.error && /duplicate|unique/i.test(ins.error.message)) {
            if (/games_igdb_id/i.test(ins.error.message)) { st.pulados++; continue; }
            ins = await admin.from('games').insert({ ...row, slug: `${row.slug}-${g.id}` }).select('id').single();
          }
          if (ins.error || !ins.data) { st.erros++; continue; }
          st.criados++;
          await admin.from('id_map').upsert(
            { romvault_id: ins.data.id, source: 'igdb', entity: `game:${key}`, external_id: String(g.id), confidence: 1, match_type: 'igdb_id' },
            { onConflict: 'source,entity,external_id' },
          ).then(() => {}, () => {});
        }
        st.cursor = cursor;
        // salva o cursor a cada página (resiliente a timeout)
        await admin.from('sync_state').upsert(
          { source: 'igdb', entity: `game:${key}`, cursor: String(cursor), status: 'idle', last_sync_at: new Date().toISOString(), items_processed: st.criados + st.atualizados },
          { onConflict: 'source,entity' },
        );
        if (games.length < perPage) { st.done = true; break; }
      }
      touched++;
    }

    const totals = Object.values(perPlatform).reduce(
      (a, s) => ({ criados: a.criados + s.criados, atualizados: a.atualizados + s.atualizados, pulados: a.pulados + s.pulados, erros: a.erros + s.erros }),
      { criados: 0, atualizados: 0, pulados: 0, erros: 0 },
    );
    await admin.from('job_runs')
      .insert({ job: 'igdb-backfill', mode: isCron ? 'cron' : 'manual', ok: totals.erros === 0, stats: { ...totals, plataformas: touched } })
      .then(() => {}, () => {});
    return json({ ok: true, plataformas: touched, totals, perPlatform, segundos: Math.round((Date.now() - started) / 1000) });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
