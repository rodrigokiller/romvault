-- ═══════════════════════════════════════════════════════════════════════════
-- 36) DIGEST DO ADMIN (sugestão aceita): resumo semanal por e-mail com o
--   tamanho da fila de vinculação — o hub avisa onde precisa de curadoria.
--   admin_queue_stats(): agregados pro e-mail/painel (service role executa;
--   anon/authenticated ficam de fora). Agendamento no padrão da casa:
--   setup_admin_digest_cron(url, secret[, cron]) chamado UMA vez no SQL
--   Editor (nenhum segredo neste arquivo). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.admin_queue_stats()
returns json
language sql
security definer
stable
set search_path = public
as $$
  select json_build_object(
    'sem_igdb', (
      select count(*) from public.games
      where igdb_id is null
        and data_source in ('steam', 'gog', 'psn', 'xbox', 'nintendo')
    ),
    'candidatos', (
      select count(*) from (
        select array_agg(g.id) as ids
        from public.games g
        group by lower(g.title)
        having count(*) > 1
      ) grupos
      where not exists (
        select 1 from public.game_relations r
        where r.game_id = any(grupos.ids) and r.related_id = any(grupos.ids)
      )
    ),
    'aliases', (select count(*) from public.alias_pending),
    'misses_7d', (
      select coalesce(sum((stats->>'unmatched')::int), 0)
      from public.job_runs
      where job like '%-sync-misses' and finished_at > now() - interval '7 days'
    ),
    'amostra_aliases', (
      select coalesce(json_agg(x), '[]'::json) from (
        select source, kind, external_key
        from public.alias_pending
        order by first_seen desc
        limit 8
      ) x
    )
  );
$$;

revoke execute on function public.admin_queue_stats() from anon, authenticated;

create or replace function public.setup_admin_digest_cron(
  fn_url    text,
  secret    text,
  cron_expr text default '0 12 * * 1'   -- segunda 12:00 UTC = 09:00 BRT
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule('admin-digest')
  where exists (select 1 from cron.job where jobname = 'admin-digest');
  perform cron.schedule(
    'admin-digest',
    cron_expr,
    format(
      $job$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := '{}'::jsonb
      ); $job$,
      fn_url, secret
    )
  );
  return 'agendado: admin-digest @ ' || cron_expr;
end;
$$;

revoke execute on function public.setup_admin_digest_cron(text, text, text) from anon, authenticated;
