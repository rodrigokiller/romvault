-- ═══════════════════════════════════════════════════════════════════════════
-- 32) Contadores de comunidade na página do jogo: quantos TÊM o jogo, estão
--   jogando e já zeraram + a nota média das reviews da casa. SECURITY DEFINER
--   expõe só AGREGADOS (nunca linhas de tracks alheios; privados idem — conta
--   volume, não expõe quem). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.game_community_stats(gid uuid)
returns table (
  owners     bigint,  -- tem na biblioteca (qualquer status)
  playing    bigint,
  finished   bigint,
  review_avg numeric,
  review_n   bigint
)
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.game_tracks t where t.game_id = gid),
    (select count(*) from public.game_tracks t where t.game_id = gid and t.status = 'playing'),
    (select count(*) from public.game_tracks t where t.game_id = gid and t.status = 'finished'),
    (select round(avg(r.rating)::numeric, 1) from public.reviews r
      where r.subject_type = 'game' and r.subject_id = gid),
    (select count(*) from public.reviews r
      where r.subject_type = 'game' and r.subject_id = gid);
$$;

grant execute on function public.game_community_stats(uuid) to anon, authenticated;
