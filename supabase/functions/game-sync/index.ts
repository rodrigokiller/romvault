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
    const gameId = String(body.game_id ?? '');
    const action = String(body.action ?? 'igdb');
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

    const fields =
      'fields name, cover.image_id, screenshots.image_id, summary, first_release_date, ' +
      'platforms, genres.name, franchises.name, involved_companies.company.name, involved_companies.developer;';
    const query = game.igdb_id
      ? `${fields} where id = ${game.igdb_id};`
      : `${fields} search "${String(game.title).replace(/"/g, '')}"; limit 10;`;
    const igdbRes = await fetch('https://api.igdb.com/v4/games', {
      method: 'POST',
      headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` },
      body: query,
    });
    if (!igdbRes.ok) return json({ error: `IGDB: HTTP ${igdbRes.status}` }, 502);
    // deno-lint-ignore no-explicit-any
    const hits = (await igdbRes.json()) as any[];
    const hit = game.igdb_id
      ? hits[0]
      : (hits.find((h) => norm(h.name) === norm(game.title)) ?? hits[0]);
    if (!hit) return json({ error: `IGDB não achou "${game.title}".` }, 404);

    const patch: Record<string, unknown> = {};
    const updated: string[] = [];
    if (hit.cover?.image_id) {
      patch.cover_url = img(hit.cover.image_id, 'cover_big_2x');
      patch.thumbnail = img(hit.cover.image_id, 'cover_big');
      updated.push('cover');
    }
    if (!game.igdb_id && hit.id) { patch.igdb_id = hit.id; updated.push('igdb_id'); }
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
    if (!game.developer && hit.involved_companies?.length) {
      // deno-lint-ignore no-explicit-any
      const dev = hit.involved_companies.find((c: any) => c.developer)?.company?.name;
      if (dev) { patch.developer = dev; updated.push('developer'); }
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

    if (updated.length === 0) return json({ ok: true, action, updated, note: 'nada novo no IGDB' });
    const { error } = await admin.from('games').update(patch).eq('id', gameId);
    if (error) throw error;
    return json({ ok: true, action, matched: hit.name, updated });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
