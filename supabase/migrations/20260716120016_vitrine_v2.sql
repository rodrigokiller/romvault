-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — vitrine v2 (spec docs/vitrine-v2-spec.md). Idempotente.
--   1) 5º status "owned" (Na coleção): cópia sem status vira track owned.
--   2) custom_art por usuário+jogo (sempre vence na vitrine).
--   3) shelves/shelf_items: estantes personalizadas (v2.1 usa; schema já vai).
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.game_tracks drop constraint if exists game_tracks_status_check;
alter table public.game_tracks add constraint game_tracks_status_check
  check (status in ('playing', 'finished', 'abandoned', 'backlog', 'owned'));

alter table public.game_tracks add column if not exists custom_art text;

create table if not exists public.shelves (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  kind       text not null default 'custom' check (kind in ('platform', 'custom')),
  platform   text,          -- quando kind='platform' (view auto tematizada)
  name       text not null,
  theme      jsonb,         -- { accent, background, art_mode: 'box'|'store' }
  position   integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists shelves_user_idx on public.shelves (user_id, position);

create table if not exists public.shelf_items (
  shelf_id uuid not null references public.shelves (id) on delete cascade,
  game_id  uuid not null references public.games (id) on delete cascade,
  position integer not null default 0,
  primary key (shelf_id, game_id)
);

alter table public.shelves     enable row level security;
alter table public.shelf_items enable row level security;

drop policy if exists "shelves: read own or public" on public.shelves;
create policy "shelves: read own or public" on public.shelves
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
drop policy if exists "shelves: write self" on public.shelves;
create policy "shelves: write self" on public.shelves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "shelf_items: read via shelf" on public.shelf_items;
create policy "shelf_items: read via shelf" on public.shelf_items
  for select using (
    exists (select 1 from public.shelves s
            join public.profiles p on p.id = s.user_id
            where s.id = shelf_id and (s.user_id = auth.uid() or p.library_public))
  );
drop policy if exists "shelf_items: write self" on public.shelf_items;
create policy "shelf_items: write self" on public.shelf_items
  for all using (exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid()))
  with check (exists (select 1 from public.shelves s where s.id = shelf_id and s.user_id = auth.uid()));
