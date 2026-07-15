// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: importa a biblioteca Steam do usuário logado.
// Puxa GetOwnedGames (jogos + horas), casa com nosso catálogo por
// external_ids.steam ou título (plataforma PC), cria jogos mínimos quando
// faltam (data_source='steam') e upserta game_tracks (source='steam') +
// game_copies (digital/Steam). NÃO sobrescreve status marcado manualmente.
//
// Segredo:  supabase secrets set STEAM_API_KEY=xxxx
//           (grátis em https://steamcommunity.com/dev/apikey)
// Deploy:   supabase functions deploy steam-import --no-verify-jwt
// Invoke:   functions.invoke('steam-import', { body: { steamid: '7656119...' } })
//           (aceita também vanity URL, ex.: { steamid: 'meunick' })
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
const slugify = (s: string) =>
  norm(s).replace(/\s+/g, '-');

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

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const steamKey = Deno.env.get('STEAM_API_KEY');
    if (!steamKey) return json({ error: 'STEAM_API_KEY não configurada (supabase secrets set).' }, 500);

    // 1) usuário logado (o import é NA CONTA DELE)
    const asUser = createClient(url, anonKey, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);
    const admin = createClient(url, serviceKey);

    // 2) resolve SteamID (aceita vanity URL)
    const body = await req.json().catch(() => ({}));
    let steamid = String(body.steamid ?? '').trim();
    if (!steamid) return json({ error: 'Informe o steamid (SteamID64 ou vanity URL).' }, 400);
    if (!/^\d{17}$/.test(steamid)) {
      const r = await fetch(
        `https://api.steampowered.com/ISteamUser/ResolveVanityURL/v1/?key=${steamKey}&vanityurl=${encodeURIComponent(steamid)}`,
      );
      const v = await r.json();
      if (v?.response?.success !== 1) return json({ error: 'Vanity URL não encontrada.' }, 404);
      steamid = v.response.steamid;
    }

    // 3) biblioteca Steam (jogos + horas)
    const ownedRes = await fetch(
      `https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/?key=${steamKey}&steamid=${steamid}&include_appinfo=1&include_played_free_games=1`,
    );
    if (!ownedRes.ok) return json({ error: `Steam API: ${ownedRes.status}` }, 502);
    const owned = (await ownedRes.json())?.response?.games as
      | { appid: number; name: string; playtime_forever: number }[]
      | undefined;
    if (!owned || owned.length === 0) {
      return json({ error: 'Biblioteca vazia ou perfil privado (detalhes do jogo precisam ser públicos).' }, 404);
    }

    // 4) nosso catálogo: match por external_ids.steam e por título (paginado)
    const existing = await fetchAll(() => admin.from('games').select('id, title, external_ids'));
    const bySteam = new Map<number, string>();
    const byTitle = new Map<string, string>();
    for (const g of existing) {
      const sid = (g.external_ids as Record<string, unknown> | null)?.steam;
      if (sid != null) bySteam.set(Number(sid), g.id);
      byTitle.set(norm(g.title), g.id);
    }

    // 5) resolve/cria cada jogo (lotes p/ não estourar)
    let created = 0;
    const gameIdOf = new Map<number, string>(); // appid -> nosso id
    const toCreate: { slug: string; title: string; platforms: string[]; external_ids: Record<string, number>; data_source: string }[] = [];
    for (const g of owned) {
      const hit = bySteam.get(g.appid) ?? byTitle.get(norm(g.name));
      if (hit) { gameIdOf.set(g.appid, hit); continue; }
      toCreate.push({
        slug: `${slugify(g.name)}-pc`.replace(/^-+/, ''),
        title: g.name,
        platforms: ['PC'],
        external_ids: { steam: g.appid },
        data_source: 'steam',
      });
    }
    for (let i = 0; i < toCreate.length; i += 200) {
      const chunk = toCreate.slice(i, i + 200);
      // DO NOTHING no conflito de slug: nunca sobrescreve um jogo existente
      // (ex.: um registro do IGDB com o mesmo slug). Depois re-seleciona por
      // slug para mapear ids — inclusive os que já existiam.
      const { data: ins } = await admin
        .from('games').upsert(chunk, { onConflict: 'slug', ignoreDuplicates: true })
        .select('id, external_ids');
      created += (ins ?? []).length;
      const { data: all } = await admin
        .from('games').select('id, external_ids, title')
        .in('slug', chunk.map((c) => c.slug));
      for (const g of all ?? []) {
        const appid = Number((g.external_ids as Record<string, unknown>)?.steam);
        if (appid) gameIdOf.set(appid, g.id);
        else byTitle.set(norm(g.title as string), g.id); // slug colidiu com jogo não-steam
      }
      // fallback: mapeia por título os que colidiram sem external_ids.steam
      for (const c of chunk) {
        const appid = c.external_ids.steam;
        if (!gameIdOf.has(appid)) {
          const hit = byTitle.get(norm(c.title));
          if (hit) gameIdOf.set(appid, hit);
        }
      }
    }

    // 6) tracks: cria os que faltam (backlog) e atualiza horas dos source=steam
    const myTracks = await fetchAll(() =>
      admin.from('game_tracks').select('game_id, source').eq('user_id', user.id));
    const trackByGame = new Map(myTracks.map((t) => [t.game_id as string, t.source as string]));

    const newTracks: Record<string, unknown>[] = [];
    const hourUpdates: { game_id: string; hours: number }[] = [];
    for (const g of owned) {
      const gid = gameIdOf.get(g.appid);
      if (!gid) continue;
      const hours = Math.round((g.playtime_forever / 60) * 10) / 10;
      const src = trackByGame.get(gid);
      if (src === undefined) {
        newTracks.push({
          user_id: user.id, game_id: gid, status: 'backlog', platform: 'PC',
          hours_played: hours || null, source: 'steam',
        });
      } else if (src === 'steam' && hours > 0) {
        hourUpdates.push({ game_id: gid, hours });
      }
    }
    for (let i = 0; i < newTracks.length; i += 200) {
      await admin.from('game_tracks').upsert(newTracks.slice(i, i + 200), { onConflict: 'user_id,game_id' });
    }
    for (const u of hourUpdates) {
      await admin.from('game_tracks').update({ hours_played: u.hours })
        .eq('user_id', user.id).eq('game_id', u.game_id);
    }

    // 7) cópias digitais Steam (só as que ainda não existem)
    const myCopies = await fetchAll(() =>
      admin.from('game_copies').select('game_id').eq('user_id', user.id).eq('store', 'Steam'));
    const copyGames = new Set(myCopies.map((c) => c.game_id as string));
    const newCopies: Record<string, unknown>[] = [];
    for (const gid of new Set(gameIdOf.values())) {
      if (!copyGames.has(gid)) {
        newCopies.push({ user_id: user.id, game_id: gid, platform: 'PC', distribution: 'digital', store: 'Steam' });
      }
    }
    for (let i = 0; i < newCopies.length; i += 200) {
      await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
    }

    return json({
      ok: true,
      steam_games: owned.length,
      games_created: created,
      tracks_added: newTracks.length,
      hours_updated: hourUpdates.length,
      copies_added: newCopies.length,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
