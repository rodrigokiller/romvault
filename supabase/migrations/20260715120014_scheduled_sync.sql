-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — sync agendado do IGDB (pg_cron + pg_net).
--   NADA de segredo neste arquivo: a função setup_igdb_cron recebe URL e
--   segredo como parâmetros — o Killer chama UMA vez no SQL Editor:
--
--     select public.setup_igdb_cron(
--       'https://SEU-PROJETO.supabase.co/functions/v1/igdb-sync',
--       'UM-SEGREDO-FORTE',        -- igual ao secret CRON_SECRET da function
--       'switch',                  -- plataforma
--       '0 6 * * 1'                -- cron: toda segunda 06:00 UTC
--     );
--
--   (repita por plataforma; remover: select cron.unschedule('igdb-sync-switch'))
--   Requer tb: supabase secrets set CRON_SECRET=UM-SEGREDO-FORTE + redeploy.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.setup_igdb_cron(
  fn_url    text,
  secret    text,
  platform  text default 'switch',
  cron_expr text default '0 6 * * 1'
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  job_name text := 'igdb-sync-' || platform;
begin
  -- remove agendamento anterior do mesmo nome, se houver
  perform cron.unschedule(job_name)
  where exists (select 1 from cron.job where jobname = job_name);

  perform cron.schedule(
    job_name,
    cron_expr,
    format(
      $job$ select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type','application/json','x-cron-secret', %L),
        body := jsonb_build_object('platform', %L, 'limit', 500, 'pages', 4)
      ); $job$,
      fn_url, secret, platform
    )
  );
  return 'agendado: ' || job_name || ' @ ' || cron_expr;
end;
$$;

-- só admins (via SQL editor o owner sempre pode)
revoke execute on function public.setup_igdb_cron(text, text, text, text) from anon, authenticated;
