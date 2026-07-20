// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: o usuário preenche as CAPAS que faltam nos SEUS
// jogos da vitrine (o botão "sincronizar imagens"). Escopo seguro: só jogos
// que o usuário TEM (game_copies), COM igdb_id e SEM cover_url — puxa a capa
// do IGDB. Cap por chamada; cooldown no cliente.
//
// Segredos: TWITCH_CLIENT_ID/SECRET. Deploy: supabase functions deploy sync-my-art --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const img = (id: string, size: string) => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const admin = createClient(url, serviceKey);
    const asUser = createClient(url, anonKey, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } });
    const { data: { user } } = await asUser.auth.getUser();
    if (!user) return json({ error: 'Não autenticado.' }, 401);

    const twitchId = Deno.env.get('TWITCH_CLIENT_ID');
    const twitchSecret = Deno.env.get('TWITCH_CLIENT_SECRET');
    if (!twitchId || !twitchSecret) return json({ error: 'TWITCH_CLIENT_ID/SECRET não configuradas.' }, 500);

    // jogos que o usuário TEM (cópias), com igdb_id e sem capa
    const { data: copies } = await admin.from('game_copies')
      .select('game:games(id, igdb_id, cover_url)')
      .eq('user_id', user.id).range(0, 4999);
    type C = { game: { id: string; igdb_id: number | null; cover_url: string | null } | null };
    const targets = [...new Map(
      ((copies ?? []) as unknown as C[])
        .filter((c) => c.game && c.game.igdb_id != null && !c.game.cover_url)
        .map((c) => [c.game!.id, c.game!]),
    ).values()].slice(0, 120);

    if (targets.length === 0) return json({ ok: true, filled: 0, note: 'Nada a preencher: todas as capas já estão lá.' });

    const token = (await (await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    )).json())?.access_token;
    if (!token) return json({ error: 'OAuth Twitch falhou.' }, 502);

    let filled = 0;
    // busca em lotes de 10 ids (a API aceita where id = (...))
    for (let i = 0; i < targets.length; i += 10) {
      const chunk = targets.slice(i, i + 10);
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` },
        body: `fields id, cover.image_id; where id = (${chunk.map((c) => c.igdb_id).join(',')}) & cover != null;`,
      });
      if (!res.ok) continue;
      // deno-lint-ignore no-explicit-any
      const hits = (await res.json()) as any[];
      const coverOf = new Map(hits.map((h) => [Number(h.id), h.cover?.image_id as string | undefined]));
      for (const g of chunk) {
        const cid = coverOf.get(Number(g.igdb_id));
        if (!cid) continue;
        const { error } = await admin.from('games')
          .update({ cover_url: img(cid, 'cover_big_2x'), thumbnail: img(cid, 'cover_big') })
          .eq('id', g.id).is('cover_url', null);
        if (!error) filled++;
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return json({ ok: true, filled, tried: targets.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
