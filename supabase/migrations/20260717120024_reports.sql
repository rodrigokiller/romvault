-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — reportes da comunidade ("essa arte/jogo tá errado") + saúde do
-- digest. O FF VI com arte de FF VII teria sido reportado pelo 1º visitante.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.reports (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.profiles (id) on delete cascade,
  subject_type  text not null check (subject_type in ('game', 'romhack', 'translation', 'doc', 'tool')),
  subject_id    uuid not null,
  subject_label text,            -- título na hora do reporte (link estável no admin)
  subject_url   text,            -- rota da página reportada
  reason        text not null check (reason in ('wrong_art', 'wrong_match', 'wrong_data', 'broken_link', 'other')),
  note          text,
  created_at    timestamptz not null default now(),
  resolved_at   timestamptz
);
create index if not exists reports_open_idx on public.reports (created_at desc) where resolved_at is null;

alter table public.reports enable row level security;

-- qualquer logado pode reportar (em nome próprio)
drop policy if exists "reports: insert self" on public.reports;
create policy "reports: insert self" on public.reports
  for insert with check (auth.uid() = user_id);
-- ler/resolver é papel de admin
drop policy if exists "reports: admin read" on public.reports;
create policy "reports: admin read" on public.reports
  for select using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));
drop policy if exists "reports: admin update" on public.reports;
create policy "reports: admin update" on public.reports
  for update using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin));

-- saúde do digest (painel admin): última notificação criada
create or replace function public.digest_last()
returns timestamptz
language sql
security definer
set search_path = public
as $$
  select max(created_at) from public.notifications
  where exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin);
$$;
grant execute on function public.digest_last() to authenticated;
