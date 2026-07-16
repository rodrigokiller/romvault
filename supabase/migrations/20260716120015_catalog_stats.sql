-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — estatísticas do acervo (página /stats pública). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

-- jogos por plataforma (unnest do array)
create or replace function public.games_per_platform()
returns table (platform text, total bigint)
language sql stable set search_path = public as $$
  select p as platform, count(*)::bigint as total
  from public.games, unnest(platforms) as p
  group by p order by total desc;
$$;

-- traduções por idioma
create or replace function public.translations_per_language()
returns table (language text, total bigint)
language sql stable set search_path = public as $$
  select language, count(*)::bigint as total
  from public.translations
  where language is not null and is_public
  group by language order by total desc;
$$;

grant execute on function public.games_per_platform() to anon, authenticated;
grant execute on function public.translations_per_language() to anon, authenticated;
