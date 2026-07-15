-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — Row Level Security (idempotente: seguro reexecutar)
--   • Conteúdo (games, romhacks, translations, documents, tools, articles):
--       select liberado (ou is_public); insert/update só pelo dono; delete só admin.
--   • profiles: select público, update self.
--   • reviews: select público, escrita self.  favorites/api_keys: só self.
--   • sync_state / id_map: só admin (ingestão roda via service_role, que ignora RLS).
-- ═══════════════════════════════════════════════════════════════════════════

-- Helper: o usuário atual é admin? (security definer evita recursão de RLS em profiles)
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.is_admin
  );
$$;

-- Habilita RLS em todas as tabelas -------------------------------------------
alter table public.profiles        enable row level security;
alter table public.games           enable row level security;
alter table public.romhacks        enable row level security;
alter table public.translations    enable row level security;
alter table public.documents       enable row level security;
alter table public.tools           enable row level security;
alter table public.articles        enable row level security;
alter table public.reviews         enable row level security;
alter table public.favorites       enable row level security;
alter table public.download_events enable row level security;
alter table public.api_keys        enable row level security;
alter table public.sync_state      enable row level security;
alter table public.id_map          enable row level security;

-- profiles ───────────────────────────────────────────────────────────────────
drop policy if exists "profiles: read all" on public.profiles;
create policy "profiles: read all" on public.profiles
  for select using (true);
drop policy if exists "profiles: insert self" on public.profiles;
create policy "profiles: insert self" on public.profiles
  for insert with check (auth.uid() = id);
drop policy if exists "profiles: update self" on public.profiles;
create policy "profiles: update self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- games (leitura pública; escrita do dono; delete admin) ──────────────────────
drop policy if exists "games: read all" on public.games;
create policy "games: read all" on public.games
  for select using (true);
drop policy if exists "games: insert own" on public.games;
create policy "games: insert own" on public.games
  for insert with check (auth.uid() = created_by);
drop policy if exists "games: update own" on public.games;
create policy "games: update own" on public.games
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
drop policy if exists "games: delete admin" on public.games;
create policy "games: delete admin" on public.games
  for delete using (public.is_admin());

-- romhacks ────────────────────────────────────────────────────────────────────
drop policy if exists "romhacks: read public or own" on public.romhacks;
create policy "romhacks: read public or own" on public.romhacks
  for select using (is_public or auth.uid() = submitted_by or public.is_admin());
drop policy if exists "romhacks: insert own" on public.romhacks;
create policy "romhacks: insert own" on public.romhacks
  for insert with check (auth.uid() = submitted_by);
drop policy if exists "romhacks: update own" on public.romhacks;
create policy "romhacks: update own" on public.romhacks
  for update using (auth.uid() = submitted_by) with check (auth.uid() = submitted_by);
drop policy if exists "romhacks: delete admin" on public.romhacks;
create policy "romhacks: delete admin" on public.romhacks
  for delete using (public.is_admin());

-- translations ────────────────────────────────────────────────────────────────
drop policy if exists "translations: read public or own" on public.translations;
create policy "translations: read public or own" on public.translations
  for select using (is_public or auth.uid() = submitted_by or public.is_admin());
drop policy if exists "translations: insert own" on public.translations;
create policy "translations: insert own" on public.translations
  for insert with check (auth.uid() = submitted_by);
drop policy if exists "translations: update own" on public.translations;
create policy "translations: update own" on public.translations
  for update using (auth.uid() = submitted_by) with check (auth.uid() = submitted_by);
drop policy if exists "translations: delete admin" on public.translations;
create policy "translations: delete admin" on public.translations
  for delete using (public.is_admin());

-- documents ───────────────────────────────────────────────────────────────────
drop policy if exists "documents: read public or own" on public.documents;
create policy "documents: read public or own" on public.documents
  for select using (is_public or auth.uid() = submitted_by or public.is_admin());
drop policy if exists "documents: insert own" on public.documents;
create policy "documents: insert own" on public.documents
  for insert with check (auth.uid() = submitted_by);
drop policy if exists "documents: update own" on public.documents;
create policy "documents: update own" on public.documents
  for update using (auth.uid() = submitted_by) with check (auth.uid() = submitted_by);
drop policy if exists "documents: delete admin" on public.documents;
create policy "documents: delete admin" on public.documents
  for delete using (public.is_admin());

-- tools ───────────────────────────────────────────────────────────────────────
drop policy if exists "tools: read public or own" on public.tools;
create policy "tools: read public or own" on public.tools
  for select using (is_public or auth.uid() = submitted_by or public.is_admin());
drop policy if exists "tools: insert own" on public.tools;
create policy "tools: insert own" on public.tools
  for insert with check (auth.uid() = submitted_by);
drop policy if exists "tools: update own" on public.tools;
create policy "tools: update own" on public.tools
  for update using (auth.uid() = submitted_by) with check (auth.uid() = submitted_by);
drop policy if exists "tools: delete admin" on public.tools;
create policy "tools: delete admin" on public.tools
  for delete using (public.is_admin());

-- articles (leitura pública; escrita do autor; delete admin) ──────────────────
drop policy if exists "articles: read all" on public.articles;
create policy "articles: read all" on public.articles
  for select using (true);
drop policy if exists "articles: insert own" on public.articles;
create policy "articles: insert own" on public.articles
  for insert with check (auth.uid() = author);
drop policy if exists "articles: update own" on public.articles;
create policy "articles: update own" on public.articles
  for update using (auth.uid() = author) with check (auth.uid() = author);
drop policy if exists "articles: delete admin" on public.articles;
create policy "articles: delete admin" on public.articles
  for delete using (public.is_admin());

-- reviews (leitura pública; escrita self) ─────────────────────────────────────
drop policy if exists "reviews: read all" on public.reviews;
create policy "reviews: read all" on public.reviews
  for select using (true);
drop policy if exists "reviews: insert self" on public.reviews;
create policy "reviews: insert self" on public.reviews
  for insert with check (auth.uid() = user_id);
drop policy if exists "reviews: update self" on public.reviews;
create policy "reviews: update self" on public.reviews
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "reviews: delete self" on public.reviews;
create policy "reviews: delete self" on public.reviews
  for delete using (auth.uid() = user_id);

-- favorites (só self) ─────────────────────────────────────────────────────────
drop policy if exists "favorites: all self" on public.favorites;
create policy "favorites: all self" on public.favorites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- api_keys (só self) ──────────────────────────────────────────────────────────
drop policy if exists "api_keys: all self" on public.api_keys;
create policy "api_keys: all self" on public.api_keys
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- download_events (qualquer um registra um download; leitura só admin) ─────────
drop policy if exists "download_events: insert any" on public.download_events;
create policy "download_events: insert any" on public.download_events
  for insert with check (true);
drop policy if exists "download_events: read admin" on public.download_events;
create policy "download_events: read admin" on public.download_events
  for select using (public.is_admin());

-- sync_state (só admin no cliente; ingestão usa service_role) ──────────────────
drop policy if exists "sync_state: all admin" on public.sync_state;
create policy "sync_state: all admin" on public.sync_state
  for all using (public.is_admin()) with check (public.is_admin());

-- id_map (só admin no cliente) ────────────────────────────────────────────────
drop policy if exists "id_map: all admin" on public.id_map;
create policy "id_map: all admin" on public.id_map
  for all using (public.is_admin()) with check (public.is_admin());
