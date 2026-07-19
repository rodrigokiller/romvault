-- ═══════════════════════════════════════════════════════════════════════════
-- 37) Agendador GENÉRICO de importers (steam/psn/xbox/gog/nintendo suportavam
--   modo cron via x-cron-secret mas nunca ganharam função de agendamento).
--   Padrão da casa: nenhum segredo aqui; o Killer chama UMA vez por job no
--   SQL Editor, ex.:
--
--     select public.setup_import_cron('steam-sync',
--       'https://SEU-PROJETO.supabase.co/functions/v1/steam-import',
--       'SEU-CRON-SECRET', '{}'::jsonb, '0 7 * * *');
--
--   (remover: select cron.unschedule('steam-sync')) Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.setup_import_cron(
  job_name  text,
  fn_url    text,
  secret    text,
  body      jsonb default '{}'::jsonb,
  cron_expr text default '0 7 * * *'   -- diário 07:00 UTC = 04:00 BRT
)
returns text
language plpgsql
security definer
set search_path = public
as $$
begin
  perform cron.unschedule(job_name)
  where exists (select 1 from cron.job where jobname = job_name);
  perform cron.schedule(
    job_name,
    cron_expr,
    format(
      $job$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := %L::jsonb
      ); $job$,
      fn_url, secret, body::text
    )
  );
  return 'agendado: ' || job_name || ' @ ' || cron_expr;
end;
$$;

revoke execute on function public.setup_import_cron(text, text, text, jsonb, text) from anon, authenticated;
