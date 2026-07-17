-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — convites com código (beta fechado controlável) + registro de
-- JOBS (a "tabela de syncs" pros jobs que não são de biblioteca: capas,
-- igdb, crons — cada rodada vira uma linha consultável no admin).
-- ═══════════════════════════════════════════════════════════════════════════

-- 1) convites: admin gera códigos; usuário resgata; perfil mostra o padrinho
create table if not exists public.invites (
  code       text primary key,
  created_by uuid not null references public.profiles (id) on delete cascade,
  max_uses   integer not null default 1,
  uses       integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.profiles
  add column if not exists invited_by uuid references public.profiles (id);

alter table public.invites enable row level security;
drop policy if exists "invites: admin all" on public.invites;
create policy "invites: admin all" on public.invites
  for all using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin))
  with check (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- resgate: valida e grava o padrinho (security definer; 1 resgate por perfil)
create or replace function public.redeem_invite(invite_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  inv record;
  inviter text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;
  if exists (select 1 from public.profiles where id = auth.uid() and invited_by is not null) then
    raise exception 'Você já resgatou um convite.';
  end if;
  select * into inv from public.invites where code = invite_code for update;
  if inv is null then
    raise exception 'Convite inválido.';
  end if;
  if inv.uses >= inv.max_uses then
    raise exception 'Convite esgotado.';
  end if;
  if inv.created_by = auth.uid() then
    raise exception 'Não dá pra resgatar o próprio convite.';
  end if;
  update public.invites set uses = uses + 1 where code = invite_code;
  update public.profiles set invited_by = inv.created_by where id = auth.uid();
  select username into inviter from public.profiles where id = inv.created_by;
  return coalesce(inviter, 'ok');
end;
$$;
grant execute on function public.redeem_invite(text) to authenticated;

-- 2) registro de jobs (capas, moby, igdb, crons de sync, digest…)
create table if not exists public.job_runs (
  id          uuid primary key default gen_random_uuid(),
  job         text not null,             -- 'mobygames', 'covers-libretro', 'ra-cron', 'backlog-digest'…
  mode        text,                      -- 'cli' | 'cron' | 'manual'
  ok          boolean not null default true,
  stats       jsonb not null default '{}'::jsonb,
  started_at  timestamptz,
  finished_at timestamptz not null default now()
);
create index if not exists job_runs_job_idx on public.job_runs (job, finished_at desc);

alter table public.job_runs enable row level security;
-- leitura: admin; escrita: só service role (edge/CLI)
drop policy if exists "job_runs: admin read" on public.job_runs;
create policy "job_runs: admin read" on public.job_runs
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
