// ─────────────────────────────────────────────────────────────────────────────
// ROMVault — Edge Function: o usuário vincula ao IGDB os SEUS jogos de sync
// que ficaram sem match (o botão "vincular os que faltam" da saúde do sync).
// Escopo seguro: só toca jogos que o usuário TEM em game_sync_data, que estão
// SEM igdb_id e foram CRIADOS por sync (data_source de provedor). Cap por
// chamada pra caber no tempo; chamar de novo continua.
//
// Segredos: TWITCH_CLIENT_ID/SECRET. Deploy: supabase functions deploy link-my-games --no-verify-jwt
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...CORS, 'Content-Type': 'application/json' } });
const norm = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const img = (id: string, size: string) => `https://images.igdb.com/igdb/image/upload/t_${size}/${id}.jpg`;

const SYNC_SOURCES = ['steam', 'gog', 'psn', 'xbox', 'nintendo'];
const PLAT_IGDB: Record<string, number> = { PC: 6, PS4: 48, PS5: 167, PS3: 9, 'Xbox One': 49, 'Xbox Series': 169, Switch: 130 };

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

    const body = await req.json().catch(() => ({}));
    const provider = body.provider ? String(body.provider) : null;

    // jogos do usuário (game_sync_data) sem igdb, criados por sync
    let q = admin.from('game_sync_data')
      .select('game_id, provider, game:games(id, title, platforms, data_source, igdb_id, cover_url)')
      .eq('user_id', user.id).range(0, 4999);
    if (provider) q = q.eq('provider', provider);
    const { data: rows } = await q;
    type Row = { game: { id: string; title: string; platforms: string[] | null; data_source: string | null; igdb_id: number | null; cover_url: string | null } | null };
    const targets = [...new Map(
      ((rows ?? []) as unknown as Row[])
        .filter((r) => r.game && r.game.igdb_id == null && SYNC_SOURCES.includes(r.game.data_source ?? ''))
        .map((r) => [r.game!.id, r.game!]),
    ).values()].slice(0, 80);

    if (targets.length === 0) return json({ ok: true, linked: 0, tried: 0, note: 'Nada pra vincular: todos já têm IGDB.' });

    const token = (await (await fetch(
      `https://id.twitch.tv/oauth2/token?client_id=${twitchId}&client_secret=${twitchSecret}&grant_type=client_credentials`,
      { method: 'POST' },
    )).json())?.access_token;
    if (!token) return json({ error: 'OAuth Twitch falhou.' }, 502);

    // igdb_ids já usados (evita duplicar)
    const used = new Set<number>();
    for (const g of await (async () => {
      const out: { igdb_id: number }[] = [];
      for (let f = 0; ; f += 1000) {
        const { data } = await admin.from('games').select('igdb_id').not('igdb_id', 'is', null).order('id').range(f, f + 999);
        out.push(...((data ?? []) as { igdb_id: number }[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    })()) used.add(Number(g.igdb_id));

    let linked = 0;
    for (const g of targets) {
      const res = await fetch('https://api.igdb.com/v4/games', {
        method: 'POST',
        headers: { 'Client-ID': twitchId, Authorization: `Bearer ${token}` },
        body: `fields name, game_type, cover.image_id, first_release_date, platforms; search "${g.title.replace(/"/g, '')}"; limit 8;`,
      });
      if (!res.ok) continue;
      // deno-lint-ignore no-explicit-any
      const hits = (await res.json()) as any[];
      const wantPlat = (g.platforms ?? []).map((p) => PLAT_IGDB[p]).filter(Boolean);
      const exact = hits.filter((h) => norm(h.name) === norm(g.title) && !used.has(Number(h.id)));
      const hit = exact.find((h) => (h.platforms ?? []).some((p: number) => wantPlat.includes(p))) ?? exact[0];
      if (!hit) continue;
      used.add(Number(hit.id));
      const patch: Record<string, unknown> = {
        igdb_id: hit.id,
        game_type: ({ 0: 'main', 8: 'remake', 9: 'remaster', 10: 'expanded', 11: 'port' } as Record<number, string>)[hit.game_type] ?? 'main',
      };
      if (hit.cover?.image_id && !g.cover_url) { patch.cover_url = img(hit.cover.image_id, 'cover_big_2x'); patch.thumbnail = img(hit.cover.image_id, 'cover_big'); }
      if (hit.first_release_date) patch.release_date = new Date(hit.first_release_date * 1000).toISOString().slice(0, 10);
      const { error } = await admin.from('games').update(patch).eq('id', g.id);
      if (!error) linked++;
      await new Promise((r) => setTimeout(r, 280));
    }
    return json({ ok: true, linked, tried: targets.length });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});
