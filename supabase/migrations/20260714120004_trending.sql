-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — trending semanal a partir de download_events.
--   download_events é read-admin no RLS. Esta função SECURITY DEFINER expõe
--   apenas a CONTAGEM agregada (sem vazar linhas cruas), liberada para todos.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.trending_week(days int default 7, lim int default 8)
returns table (subject_type text, subject_id uuid, cnt bigint)
language sql
security definer
stable
set search_path = public
as $$
  select de.subject_type, de.subject_id, count(*)::bigint as cnt
  from public.download_events de
  where de.created_at >= now() - make_interval(days => days)
  group by de.subject_type, de.subject_id
  order by cnt desc
  limit lim;
$$;

grant execute on function public.trending_week(int, int) to anon, authenticated;
