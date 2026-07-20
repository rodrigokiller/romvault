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
      | { appid: number; name: string; playtime_forever: number; rtime_last_played?: number }[]
      | undefined;
    if (!owned || owned.length === 0) {
      return json({ error: 'Biblioteca vazia ou perfil privado (detalhes do jogo precisam ser públicos).' }, 404);
    }

    // 4) nosso catálogo: match por external_ids.steam e por título (paginado).
    // Fallback por título SÓ casa jogo de PC: o Chrono Trigger de SNES não
    // pode "capturar" o Chrono Trigger da Steam (versões são jogos ligados,
    // não o mesmo registro) — sem PC no catálogo, cria a versão de PC.
    const existing = await fetchAll(() => admin.from('games').select('id, title, external_ids, platforms, igdb_id'));
    const bySteam = new Map<number, string>();
    const byTitle = new Map<string, string>();
    for (const g of existing) {
      const sid = (g.external_ids as Record<string, unknown> | null)?.steam;
      if (sid != null) bySteam.set(Number(sid), g.id);
      if (((g.platforms ?? []) as string[]).includes('PC')) byTitle.set(norm(g.title), g.id);
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
      const { data: ins, error: insErr } = await admin
        .from('games').upsert(chunk, { onConflict: 'slug', ignoreDuplicates: true })
        .select('id, external_ids');
      if (insErr) throw new Error(`games upsert: ${insErr.message}`);
      created += (ins ?? []).length;
      const { data: all, error: selErr } = await admin
        .from('games').select('id, external_ids, title')
        .in('slug', chunk.map((c) => c.slug));
      if (selErr) throw new Error(`games re-select: ${selErr.message}`);
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
          // importado = "Na coleção" (você TEM o jogo); status de jogo é escolha do usuário
          user_id: user.id, game_id: gid, status: 'owned', platform: 'PC',
          hours_played: hours || null, source: 'steam',
        });
      } else if (src === 'steam' && hours > 0) {
        hourUpdates.push({ game_id: gid, hours });
      }
    }
    // dedupe por game_id (dois appids casam no mesmo jogo) + erro visivel
    const trackByGid = new Map<string, Record<string, unknown>>();
    for (const row of newTracks) trackByGid.set(row.game_id as string, row);
    const trackRows = [...trackByGid.values()];
    for (let i = 0; i < trackRows.length; i += 200) {
      const { error: trkErr } = await admin.from('game_tracks')
        .upsert(trackRows.slice(i, i + 200), { onConflict: 'user_id,game_id' });
      if (trkErr) throw new Error(`game_tracks: ${trkErr.message}`);
    }
    for (const u of hourUpdates) {
      await admin.from('game_tracks').update({ hours_played: u.hours })
        .eq('user_id', user.id).eq('game_id', u.game_id);
    }

    // 5b) AUTO-VINCULA os jogos RECÉM-CRIADOS com o IGDB na hora (o vínculo
    // nasce certo em vez de virar dívida pro relink). Teto de 60/sync pra
    // caber no tempo da function; o resto o cron diário + relink pegam.
    // Casa por nome exato; sem cover ainda assim grava o igdb_id (o vínculo
    // é o que importa — a capa a fila de arte completa depois).
    const twitchId = Deno.env.get('TWITCH_CLIENT_ID');
    const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
    let enriched = 0;
    if (twitchId && twitchSecret && toCreate.length > 0) {
      try {
        const tokRes = await fetch(
          `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
          { method: 'POST' },
        );
        const igdbToken = (await tokRes.json())?.access_token;
        if (igdbToken) {
          const usedIgdb = new Set<number>();
          for (const g of existing) {
            const id = (g.external_ids as Record<string, unknown> | null)?.igdb ?? g.igdb_id;
            if (id != null) usedIgdb.add(Number(id));
          }
          for (const c of toCreate.slice(0, 60)) {
            const gid = gameIdOf.get(c.external_ids.steam);
            if (!gid) continue;
            const res = await fetch('https://api.igdb.com/v4/games', {
              method: 'POST',
              headers: { 'Client-ID': twitchId, Authorization: `Bearer ${igdbToken}` },
              body: `fields name, game_type, cover.image_id, first_release_date, platforms; search "${c.title.replace(/"/g, '')}"; limit 8;`,
            });
            if (!res.ok) continue;
            // deno-lint-ignore no-explicit-any
            const hits = (await res.json()) as any[];
            // nome exato + tem PC (id 6) > nome exato; ignora igdb já usado
            const exact = hits.filter((h) => norm(h.name) === norm(c.title) && !usedIgdb.has(Number(h.id)));
            const pcOnly = exact.filter((h) => (h.platforms ?? []).includes(6));
            const pool = pcOnly.length > 0 ? pcOnly : exact;
            // DESEMPATE POR ANO: vários jogos têm o MESMO nome (o caso Final
            // Fantasy VI: Pixel Remaster de 2022 vs o port antigo). A data da
            // própria Steam diz qual é o que o usuário tem.
            let steamYear: number | null = null;
            if (pool.length > 1) {
              try {
                const dRes = await fetch(
                  `https://store.steampowered.com/api/appdetails?appids=${c.external_ids.steam}&filters=basic`,
                );
                if (dRes.ok) {
                  const dj = await dRes.json();
                  const raw = dj?.[String(c.external_ids.steam)]?.data?.release_date?.date;
                  const y = raw ? new Date(String(raw)).getFullYear() : NaN;
                  if (Number.isFinite(y)) steamYear = y;
                }
              } catch { /* sem data da Steam: cai no critério antigo */ }
            }
            // deno-lint-ignore no-explicit-any
            const yearOf = (h: any) =>
              h.first_release_date ? new Date(h.first_release_date * 1000).getFullYear() : null;
            const hit = steamYear != null
              ? [...pool].sort((a, b) => {
                const ya = yearOf(a); const yb = yearOf(b);
                return (ya == null ? 999 : Math.abs(ya - steamYear!))
                  - (yb == null ? 999 : Math.abs(yb - steamYear!));
              })[0]
              : pool[0];
            if (!hit) continue;
            usedIgdb.add(Number(hit.id));
            const patch: Record<string, unknown> = {
              igdb_id: hit.id,
              game_type: ({ 0: 'main', 8: 'remake', 9: 'remaster', 10: 'expanded', 11: 'port' } as Record<number, string>)[hit.game_type] ?? 'main',
            };
            if (hit.cover?.image_id) {
              patch.cover_url = `https://images.igdb.com/igdb/image/upload/t_cover_big_2x/${hit.cover.image_id}.jpg`;
              patch.thumbnail = `https://images.igdb.com/igdb/image/upload/t_cover_big/${hit.cover.image_id}.jpg`;
            }
            if (hit.first_release_date) patch.release_date = new Date(hit.first_release_date * 1000).toISOString().slice(0, 10);
            const { error: upErr } = await admin.from('games').update(patch).eq('id', gid);
            if (!upErr) enriched++;
            await new Promise((r) => setTimeout(r, 280)); // ~4 req/s do IGDB
          }
        }
      } catch { /* enriquecimento é bônus: nunca derruba o sync */ }
    }

    // 6b) dado BRUTO por provedor (game_sync_data): horas/último jogo por conta
    // (dedupe por game_id: dois appids podem casar no mesmo jogo)
    const syncByGame = new Map<string, Record<string, unknown>>();
    for (const g of owned) {
      const gid = gameIdOf.get(g.appid);
      if (!gid) continue;
      syncByGame.set(gid, {
        user_id: user.id, game_id: gid, provider: 'steam', platform: 'PC',
        hours_played: Math.round((g.playtime_forever / 60) * 10) / 10 || null,
        last_played: g.rtime_last_played ? new Date(g.rtime_last_played * 1000).toISOString() : null,
        synced_at: new Date().toISOString(),
      });
    }
    const syncRows = [...syncByGame.values()];
    for (let i = 0; i < syncRows.length; i += 200) {
      const { error: sdErr } = await admin.from('game_sync_data')
        .upsert(syncRows.slice(i, i + 200), { onConflict: 'user_id,game_id,provider' });
      if (sdErr) throw new Error(`game_sync_data: ${sdErr.message}`);
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
      const { error: cpErr } = await admin.from('game_copies').insert(newCopies.slice(i, i + 200));
      if (cpErr) throw new Error(`game_copies: ${cpErr.message}`);
    }

    return json({
      ok: true,
      steam_games: owned.length,
      games_created: created,
      games_enriched: enriched,
      tracks_added: trackRows.length,
      hours_updated: hourUpdates.length,
      copies_added: newCopies.length,
    });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
