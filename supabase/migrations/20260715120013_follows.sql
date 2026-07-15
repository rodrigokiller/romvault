-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — follows (amizades v1: seguir usuários). Base do feed social.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  followed_id uuid not null references public.profiles (id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (follower_id, followed_id),
  check (follower_id <> followed_id)
);
create index if not exists follows_followed_idx on public.follows (followed_id);

alter table public.follows enable row level security;

drop policy if exists "follows: read all" on public.follows;
create policy "follows: read all" on public.follows
  for select using (true);
drop policy if exists "follows: write self" on public.follows;
create policy "follows: write self" on public.follows
  for all using (auth.uid() = follower_id) with check (auth.uid() = follower_id);
