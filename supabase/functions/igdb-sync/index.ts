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
  snes: 19, nes: 18, n64: 4, gb: 33, gbc: 22, gba: 24, nds: 20,
  ps1: 7, psx: 7, ps2: 8, genesis: 29, megadrive: 29, saturn: 32, dreamcast: 23,
  master: 64, gamegear: 35, tg16: 128, arcade: 52,
};
const PLATFORM_SHORT: Record<number, string> = {
  19: 'SNES', 18: 'NES', 4: 'N64', 33: 'Game Boy', 22: 'GBC', 24: 'GBA', 20: 'NDS',
  7: 'PS1', 8: 'PS2', 29: 'Genesis', 32: 'Saturn', 23: 'Dreamcast',
  64: 'Master System', 35: 'Game Gear', 128: 'TG-16', 52: 'Arcade',
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
    cover_url: igdbImage(g.cover?.url, 'cover_big'),
    thumbnail: igdbImage(g.cover?.url, 'cover_small'),
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

    // 1) autentica o chamador e exige is_admin
    const authHeader = req.headers.get('Authorization') ?? '';
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const admin = createClient(url, serviceKey);
    const { data: profile } = await admin.from('profiles').select('is_admin').eq('id', user.id).maybeSingle();
    if (!profile?.is_admin) return json({ error: 'Apenas admins.' }, 403);

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

    // 4) cursor + jogos existentes (dedupe)
    const { data: ss } = await admin.from('sync_state').select('cursor').eq('source', source).eq('entity', entity).maybeSingle();
    let cursor = Number(ss?.cursor ?? 0) || 0;
    const { data: existing } = await admin.from('games').select('id, slug, igdb_id');
    const byIgdb = new Map<number, string>((existing ?? []).filter((g) => g.igdb_id != null).map((g) => [Number(g.igdb_id), g.id]));
    const bySlug = new Map<string, string>((existing ?? []).map((g) => [g.slug, g.id]));

    const fields =
      'fields id,name,summary,first_release_date,slug,cover.url,screenshots.url,genres.name,' +
      'platforms.id,platforms.name,game_modes.name,themes.name,franchises.name,collection.name,' +
      'involved_companies.developer,involved_companies.publisher,involved_companies.company.name;';

    let imported = 0, skipped = 0, mapped = 0;
    for (let page = 0; page < pages; page++) {
      const q = `${fields} where platforms = (${platformId}) & id > ${cursor}; sort id asc; limit ${limit};`;
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
        if (byIgdb.get(g.id) ?? bySlug.get(row.slug)) { skipped++; continue; }
        const { data: ins, error } = await admin.from('games').upsert(row, { onConflict: 'slug' }).select('id').single();
        if (error || !ins) continue;
        byIgdb.set(g.id, ins.id);
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

    return json({ ok: true, platform: platformKey, imported, skipped, mapped, cursor });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
