-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — coleções curadas ("Melhores traduções PT-BR de SNES", etc.).
--   Criadas por admins; itens polimórficos ordenados. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.collections (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique,
  title        text not null,
  description  text,
  cover_url    text,
  is_published boolean not null default false,
  position     integer not null default 0,
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

drop trigger if exists collections_set_updated_at on public.collections;
create trigger collections_set_updated_at
  before update on public.collections
  for each row execute function public.set_updated_at();

create table if not exists public.collection_items (
  collection_id uuid not null references public.collections (id) on delete cascade,
  subject_type  text not null check (subject_type in ('game','romhack','translation','tool','document')),
  subject_id    uuid not null,
  position      integer not null default 0,
  note          text,
  primary key (collection_id, subject_type, subject_id)
);
create index if not exists collection_items_idx on public.collection_items (collection_id, position);

alter table public.collections      enable row level security;
alter table public.collection_items enable row level security;

drop policy if exists "collections: read published or admin" on public.collections;
create policy "collections: read published or admin" on public.collections
  for select using (is_published or public.is_admin());
drop policy if exists "collections: write admin" on public.collections;
create policy "collections: write admin" on public.collections
  for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "collection_items: read via collection" on public.collection_items;
create policy "collection_items: read via collection" on public.collection_items
  for select using (
    exists (select 1 from public.collections c
            where c.id = collection_id and (c.is_published or public.is_admin()))
  );
drop policy if exists "collection_items: write admin" on public.collection_items;
create policy "collection_items: write admin" on public.collection_items
  for all using (public.is_admin()) with check (public.is_admin());
