-- ═══════════════════════════════════════════════════════════════════════════
-- 31) Snapshot MENSAL da coleção (sugestão aceita pelo Killer): grava os
--   contadores de cada usuário uma vez por mês — habilita o gráfico de
--   crescimento da coleção ao longo dos anos no /u/:user/stats.
--   Puro SQL via pg_cron (sem edge function, sem segredo). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;

create table if not exists public.collection_snapshots (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  month      date not null,               -- primeiro dia do mês do snapshot
  games      int  not null default 0,     -- jogos na biblioteca (tracks)
  finished   int  not null default 0,     -- zerados acumulados
  hours      numeric not null default 0,  -- horas somadas
  copies     int  not null default 0,     -- cópias na vitrine
  value      numeric not null default 0,  -- valor pago somado
  created_at timestamptz not null default now(),
  primary key (user_id, month)
);

alter table public.collection_snapshots enable row level security;

-- leitura: dono sempre; público quando a biblioteca é pública (mesmo porteiro
-- das outras tabelas do tracker). Escrita: só o job (security definer).
drop policy if exists "snapshots: read" on public.collection_snapshots;
create policy "snapshots: read" on public.collection_snapshots
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );

create or replace function public.snapshot_collections()
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.collection_snapshots (user_id, month, games, finished, hours, copies, value)
  select
    t.user_id,
    date_trunc('month', now())::date,
    count(*),
    count(*) filter (where t.status = 'finished'),
    coalesce(sum(t.hours_played), 0),
    coalesce((select count(*) from public.game_copies c where c.user_id = t.user_id), 0),
    coalesce((select sum(c.price_paid) from public.game_copies c where c.user_id = t.user_id), 0)
  from public.game_tracks t
  group by t.user_id
  on conflict (user_id, month) do update set
    games = excluded.games, finished = excluded.finished, hours = excluded.hours,
    copies = excluded.copies, value = excluded.value;
$$;

revoke execute on function public.snapshot_collections() from anon, authenticated;

-- dia 1 de cada mês às 00:10 UTC (re-agenda sem duplicar)
do $$
begin
  perform cron.unschedule('collection-snapshot')
  where exists (select 1 from cron.job where jobname = 'collection-snapshot');
  perform cron.schedule('collection-snapshot', '10 0 1 * *', 'select public.snapshot_collections()');
end;
$$;

-- primeiro ponto da série: agora (senão o gráfico só nasceria mês que vem)
select public.snapshot_collections();
