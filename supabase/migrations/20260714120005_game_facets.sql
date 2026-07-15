-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — facetas de jogos: letras iniciais disponíveis (para a barra A–Z).
--   Retorna as letras iniciais distintas (A–Z; '#' p/ não-letra), respeitando
--   os filtros de plataforma/gênero ativos. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.games_first_letters(
  p_platform text default null,
  p_genre    text default null
)
returns table (letter text)
language sql
stable
set search_path = public
as $$
  select distinct
    case
      when upper(left(title, 1)) between 'A' and 'Z' then upper(left(title, 1))
      else '#'
    end as letter
  from public.games
  where (p_platform is null or platforms @> array[p_platform])
    and (p_genre    is null or genres    @> array[p_genre])
  order by letter;
$$;

grant execute on function public.games_first_letters(text, text) to anon, authenticated;

-- Valores distintos de plataforma e gênero (para preencher os dropdowns de
-- filtro sem depender do que está carregado na página atual).
create or replace function public.game_facets()
returns table (kind text, value text)
language sql
stable
set search_path = public
as $$
  select 'platform' as kind, p as value
    from (select distinct unnest(platforms) as p from public.games) t
   where p is not null and p <> ''
  union
  select 'genre' as kind, g as value
    from (select distinct unnest(genres) as g from public.games) t
   where g is not null and g <> ''
  order by kind, value;
$$;

grant execute on function public.game_facets() to anon, authenticated;
