-- ═══════════════════════════════════════════════════════════════════════════
-- 38) Sugestões aceitas (curadoria fecha o ciclo no PAINEL, sem SQL manual):
--   a) cron_jobs_admin(): lista cron.job pro painel /admin (nunca mais caçar
--      no histórico o que foi agendado)
--   b) relation_families(): as maiores famílias de versões ligadas — validação
--      por amostragem pós-backfill
--   c) policies de escrita: admin cadastra alias de plataforma/gênero direto
--      do painel (insert nos aliases + delete do pendente)
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── a) agendamentos vivos (só admin) ─────────────────────────────────────── */
create or replace function public.cron_jobs_admin()
returns table (jobname text, schedule text, active boolean)
language sql
security definer
stable
set search_path = public
as $$
  select j.jobname::text, j.schedule::text, j.active
  from cron.job j
  where (select p.is_admin from public.profiles p where p.id = auth.uid())
  order by j.jobname;
$$;
grant execute on function public.cron_jobs_admin() to authenticated;

/* ── b) famílias de versões: hubs com mais derivados (dados públicos) ─────── */
create or replace function public.relation_families(lim int default 10)
returns table (
  base_id    uuid,
  base_title text,
  base_slug  text,
  members    bigint,
  sample     json   -- até 6 derivados: título + relação
)
language sql
security definer
stable
set search_path = public
as $$
  select
    g.id, g.title, g.slug, agg.n,
    (
      select coalesce(json_agg(x), '[]'::json) from (
        select g2.title, r2.relation
        from public.game_relations r2
        join public.games g2 on g2.id = r2.game_id
        where r2.related_id = g.id
        limit 6
      ) x
    )
  from (
    select related_id, count(*) as n
    from public.game_relations
    group by related_id
    order by n desc
    limit lim
  ) agg
  join public.games g on g.id = agg.related_id
  order by agg.n desc;
$$;
grant execute on function public.relation_families(int) to anon, authenticated;

/* ── c) cadastro de alias direto do painel (RLS: só admin escreve) ────────── */
drop policy if exists "platform_aliases: admin write" on public.platform_aliases;
create policy "platform_aliases: admin write" on public.platform_aliases
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "genre_aliases: admin write" on public.genre_aliases;
create policy "genre_aliases: admin write" on public.genre_aliases
  for insert with check (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );

drop policy if exists "alias_pending: admin delete" on public.alias_pending;
create policy "alias_pending: admin delete" on public.alias_pending
  for delete using (
    exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
  );
