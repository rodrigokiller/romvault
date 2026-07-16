// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: sync IGDB dentro do app (admin dispara pela UI).
// Faz o mesmo que o CLI (scripts/import.mjs --source=igdb), mas server-side:
// OAuth Twitch + apicalypse + dedupe por igdb_id/slug + insert via service role
// (bypassa RLS) + id_map + cursor por plataforma em sync_state.
//
// Segredos (supabase secrets set): TWITCH_CLIENT_ID, TWITCH_CLIENT_SECRET.
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY são injetados.
//
// Deploy:  supabase functions deploy igdb-sync --no-verify-jwt
//   (--no-verify-jwt é obrigatório: sem ele a plataforma bloqueia o preflight
//    OPTIONS do navegador -> "Failed to send a request". A auth é feita AQUI:
//    lemos o JWT do caller e exigimos is_admin.)
// Invoke:  supabase.functions.invoke('igdb-sync', { body: { platform, limit, pages } })
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const IGDB_PLATFORMS: Record<string, number> = {
  nes: 18, snes: 19, n64: 4, gamecube: 21, gc: 21, wii: 5, wiiu: 41, switch: 130, nsw: 130, switch2: 508, 'nintendo-switch-2': 508,
  gb: 33, gbc: 22, gba: 24, nds: 20, ds: 20, '3ds': 37, virtualboy: 87, vb: 87,
  genesis: 29, megadrive: 29, md: 29, master: 64, mastersystem: 64, gamegear: 35, gg: 35,
  saturn: 32, dreamcast: 23, dc: 23, segacd: 78, sega32x: 30,
  ps1: 7, psx: 7, ps2: 8, ps3: 9, ps4: 48, ps5: 167, psp: 38, vita: 46, psvita: 46,
  xbox: 11, x360: 12, xbox360: 12, xboxone: 49, xone: 49, xseries: 169,
  pc: 6, windows: 6, dos: 13, mac: 14, linux: 3,
  arcade: 52, tg16: 128, pcengine: 128, neogeo: 80, atari2600: 59, jaguar: 62,
  amiga: 16, c64: 15, '3do': 50, colecovision: 68, intellivision: 67, android: 34, ios: 39,
};
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

function stripDiacritics(s: string) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}
function slugifyText(s: string) {
  return stripDiacritics(s).toLowerCase().replace(/['’"]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/-{2,}/g, '-').replace(/^-+|-+$/g, '');
}
function igdbImage(url: string | undefined, size: string) {
  return url ? 'https:' + url.replace('/t_thumb/', `/t_${size}/`) : null;
}

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

// deno-lint-ignore no-explicit-any
function igdbToGame(g: any, primaryShort: string) {
  // deno-lint-ignore no-explicit-any
  const mapped = (g.platforms ?? []).map((p: any) => PLATFORM_SHORT[p.id] ?? p.name).filter(Boolean);
  const platforms = [primaryShort, ...mapped.filter((p: string) => p !== primaryShort)];
  return {
    slug: slugifyText(g.name) + '-' + slugifyText(primaryShort),
    igdb_id: g.id,
    title: g.name,
    // deno-lint-ignore no-explicit-any
    developer: (g.involved_companies ?? []).find((ic: any) => ic.developer)?.company?.name ?? null,
    // deno-lint-ignore no-explicit-any
    publishers: (g.involved_companies ?? []).filter((ic: any) => ic.publisher).map((ic: any) => ic.company?.name).filter(Boolean),
    release_date: g.first_release_date ? new Date(g.first_release_date * 1000).toISOString().slice(0, 10) : null,
    // deno-lint-ignore no-explicit-any
    genres: (g.genres ?? []).map((x: any) => x.name).filter(Boolean),
    platforms,
    franchise: g.franchises?.[0]?.name ?? g.collection?.name ?? null,
    description: g.summary ?? null,
    cover_url: igdbImage(g.cover?.url, 'cover_big_2x'),
    thumbnail: igdbImage(g.cover?.url, 'cover_big'),
    // deno-lint-ignore no-explicit-any
    screenshots: (g.screenshots ?? []).map((s: any) => igdbImage(s.url, 'screenshot_med')).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    game_modes: (g.game_modes ?? []).map((x: any) => x.name).filter(Boolean),
    // deno-lint-ignore no-explicit-any
    themes: (g.themes ?? []).map((x: any) => x.name).filter(Boolean),
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
    if (!twitchId || !twitchSecret) return json({ error: 'TWITCH_CLIENT_ID/SECRET não configurados (supabase secrets set).' }, 500);

    // 1) autentica o chamador: cron (x-cron-secret) OU usuário admin (JWT)
    const admin = createClient(url, serviceKey);
    const cronSecret = Deno.env.get('CRON_SECRET');
    const isCron = Boolean(cronSecret) && req.headers.get('x-cron-secret') === cronSecret;
    if (!isCron) {
      const authHeader = req.headers.get('Authorization') ?? '';
      const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: { user } } = await asUser.auth.getUser();
      if (!user) return json({ error: 'Não autenticado.' }, 401);
      const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
      if (!profile?.is_admin) return json({ error: 'Apenas admins.' }, 403);
    }

    // 2) params
    const body = await req.json().catch(() => ({}));
    const platformKey = String(body.platform ?? 'snes').toLowerCase();
    const platformId = IGDB_PLATFORMS[platformKey];
    if (!platformId) return json({ error: `Plataforma desconhecida: ${platformKey}` }, 400);
    const limit = Math.min(Number(body.limit) || 50, 500);
    const pages = Math.min(Number(body.pages) || 1, 20);
    const primaryShort = PLATFORM_SHORT[platformId] ?? platformKey.toUpperCase();
    const entity = `game:${platformKey}`;
    const source = 'igdb';

    // 3) token IGDB
    const tokRes = await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    );
    if (!tokRes.ok) return json({ error: `OAuth Twitch falhou: ${tokRes.status}` }, 502);
    const token = (await tokRes.json()).access_token as string;

    // 4) cursor + jogos existentes (dedupe). range alto: sem o teto de 1000.
    const { data: ss } = await admin.from('sync_state').select('cursor').eq('source', source).eq('entity', entity).maybeSingle();
    let cursor = Number(ss?.cursor ?? 0) || 0;
    const existing = await fetchAll(() => admin.from('games').select('id, slug, igdb_id, cover_url'));
    // deno-lint-ignore no-explicit-any
    const byIgdb = new Map<number, any>(existing.filter((g) => g.igdb_id != null).map((g) => [Number(g.igdb_id), g]));
    const bySlug = new Map<string, string>(existing.map((g) => [g.slug, g.id]));

    const fields =
      'fields id,name,summary,first_release_date,slug,cover.url,screenshots.url,genres.name,' +
      'platforms.id,platforms.name,game_modes.name,themes.name,franchises.name,collection.name,' +
      'involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';

    let imported = 0, enriched = 0, skipped = 0, mapped = 0;
    for (let page = 0; page < pages; page++) {
      // SO JOGOS PUROS: 0=main, 8=remake, 9=remaster, 10=expanded, 11=port.
      // Mods/romhacks (5) vem de fontes proprias (RHDN, SMWC) como romhacks.
      const q = `${fields} where platforms = (${platformId}) & game_type = (0,8,9,10,11) & id > ${cursor}; sort id asc; limit ${limit};`;
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}`, Accept: 'application/json' },
        body: q,
      });
      if (!res.ok) return json({ error: `IGDB games: ${res.status} ${await res.text()}` }, 502);
      const games = await res.json();
      if (!Array.isArray(games) || games.length === 0) break;

      for (const g of games) {
        cursor = Math.max(cursor, g.id);
        const row = igdbToGame(g, primaryShort);

        // ja existe por igdb_id? enriquece a capa se estiver faltando.
        const ex = byIgdb.get(g.id);
        if (ex) {
          if (!ex.cover_url && row.cover_url) {
            await admin.from('games').update({ cover_url: row.cover_url, thumbnail: row.thumbnail, screenshots: row.screenshots }).eq('id', ex.id);
            ex.cover_url = row.cover_url;
            enriched++;
          } else skipped++;
          continue;
        }
        if (bySlug.has(row.slug)) { skipped++; continue; }

        const { data: ins, error } = await admin.from('games').upsert(row, { onConflict: 'slug' }).select('id').single();
        if (error || !ins) { skipped++; continue; }
        byIgdb.set(g.id, { id: ins.id, cover_url: row.cover_url });
        bySlug.set(row.slug, ins.id);
        imported++;
        const { error: mErr } = await admin.from('id_map').upsert(
          { romvault_id: ins.id, source, entity, external_id: String(g.id), confidence: 1, match_type: 'igdb_id' },
          { onConflict: 'source,entity,external_id' },
        );
        if (!mErr) mapped++;
      }
      if (games.length < limit) break;
    }

    await admin.from('sync_state').upsert(
      { source, entity, cursor: String(cursor), status: 'idle', last_sync_at: new Date().toISOString(), items_processed: imported },
      { onConflict: 'source,entity' },
    );

    return json({ ok: true, platform: platformKey, imported, enriched, skipped, mapped, cursor });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
