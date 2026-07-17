-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — fila de curadoria de arte: jogos SEM capa ordenados por
-- IMPORTÂNCIA = quantos vínculos têm (hacks + traduções + tracks + cópias).
-- Um jogo obscuro sem capa não incomoda ninguém; um com 30 vínculos sim.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.games_missing_cover(lim integer default 30)
returns table(id uuid, title text, platforms text[], links bigint)
language sql
security definer
set search_path = public
as $$
  select g.id, g.title, g.platforms,
    (select count(*) from public.romhacks r where r.game_id = g.id)
    + (select count(*) from public.translations t where t.game_id = g.id)
    + (select count(*) from public.game_tracks gt where gt.game_id = g.id)
    + (select count(*) from public.game_copies gc where gc.game_id = g.id) as links
  from public.games g
  where g.cover_url is null
  order by links desc, g.title asc
  limit lim;
$$;
grant execute on function public.games_missing_cover(integer) to authenticated;
