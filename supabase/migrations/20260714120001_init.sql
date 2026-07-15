-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — schema inicial (idempotente: seguro reexecutar)
-- Convenções: datas de lançamento como `date` ISO canônico; chaves de API
-- guardadas HASHEADAS; reviews/favoritos NORMALIZADOS (tabela polimórfica);
-- UM único sync_state e UM único id_map. Sem arrays de FK no usuário.
-- ═══════════════════════════════════════════════════════════════════════════

-- Extensões ------------------------------------------------------------------
create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;     -- similaridade de texto (dedupe fuzzy)

-- ─────────────────────────────────────────────────────────────────────────
-- Função genérica de updated_at (usada por vários triggers)
-- ─────────────────────────────────────────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- profiles  (1:1 com auth.users)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique,
  avatar_url  text,
  bio         text,
  is_admin    boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- cria a linha de profile automaticamente no signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1))
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────
-- games  (a entidade central; tudo se pendura aqui)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.games (
  id                 uuid primary key default gen_random_uuid(),
  slug               text not null unique,
  igdb_id            bigint,
  title              text not null,
  alt_title          text,
  developer          text,
  publishers         text[],
  release_date       date,
  genres             text[],
  platforms          text[],
  franchise          text,
  description        text,
  cover_url          text,
  thumbnail          text,
  screenshots        text[],
  video_url          text,
  game_modes         text[],
  features           text[],
  themes             text[],
  age_rating         text,
  age_rating_details text,
  regional_titles    jsonb,
  resources          jsonb,
  completion_times   jsonb,
  external_ids       jsonb,
  metadata           jsonb,
  technical_info     jsonb,
  data_source        text,
  created_by         uuid references public.profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create unique index if not exists games_igdb_id_idx
  on public.games (igdb_id) where igdb_id is not null;
create index if not exists games_title_trgm_idx
  on public.games using gin (title gin_trgm_ops);
create index if not exists games_platforms_idx
  on public.games using gin (platforms);

drop trigger if exists games_set_updated_at on public.games;
create trigger games_set_updated_at
  before update on public.games
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- romhacks
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.romhacks (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  title         text not null,
  description   text,
  categories    text[],
  version       text,
  file_url      text,
  file_size     bigint,
  patch_type    text,
  difficulty    text,
  hack_type     text,
  rom_size      text,
  required_rom  jsonb,
  features      text[],
  changelog     text,
  credits       text,
  tags          text[],
  compatibility jsonb,
  thumbnail     text,
  screenshots   text[],
  video_url     text,
  downloads     integer not null default 0,
  rating        numeric(3, 2) not null default 0,
  release_date  date,
  is_public     boolean not null default true,
  submitted_by  uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists romhacks_game_idx on public.romhacks (game_id);
create index if not exists romhacks_public_idx on public.romhacks (is_public) where is_public;

drop trigger if exists romhacks_set_updated_at on public.romhacks;
create trigger romhacks_set_updated_at
  before update on public.romhacks
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- translations  (romhack + campos de idioma/qualidade; game_id obrigatório)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.translations (
  id                    uuid primary key default gen_random_uuid(),
  game_id               uuid not null references public.games (id) on delete cascade,
  title                 text not null,
  description           text,
  categories            text[],
  version               text,
  file_url              text,
  file_size             bigint,
  patch_type            text,
  difficulty            text,
  hack_type             text,
  rom_size              text,
  required_rom          jsonb,
  features              text[],
  changelog             text,
  credits               text,
  tags                  text[],
  compatibility         jsonb,
  thumbnail             text,
  screenshots           text[],
  video_url             text,
  downloads             integer not null default 0,
  rating                numeric(3, 2) not null default 0,
  release_date          date,
  language              text,
  source_language       text,
  completion_percentage integer check (completion_percentage between 0 and 100),
  translation_type      text,
  quality_rating        jsonb,
  is_public             boolean not null default true,
  submitted_by          uuid references public.profiles (id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
create index if not exists translations_game_idx on public.translations (game_id);
create index if not exists translations_language_idx on public.translations (language);
create index if not exists translations_public_idx on public.translations (is_public) where is_public;

drop trigger if exists translations_set_updated_at on public.translations;
create trigger translations_set_updated_at
  before update on public.translations
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- documents  (game_id NULLABLE: docs gerais de romhacking existem sem jogo)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.documents (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid references public.games (id) on delete cascade,
  title        text not null,
  description  text,
  category     text,
  page_count   integer,
  file_format  text,
  language     text,
  file_url     text,
  thumbnail    text,
  screenshots  text[],
  tags         text[],
  downloads    integer not null default 0,
  rating       numeric(3, 2) not null default 0,
  is_public    boolean not null default true,
  submitted_by uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists documents_game_idx on public.documents (game_id);
create index if not exists documents_public_idx on public.documents (is_public) where is_public;

drop trigger if exists documents_set_updated_at on public.documents;
create trigger documents_set_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- tools  (SEM game_id: utilitários são independentes de jogo)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.tools (
  id                   uuid primary key default gen_random_uuid(),
  title                text not null,
  description          text,
  category             text,
  supported_platforms  text[],
  supported_file_types text[],
  requirements         jsonb,
  license              text,
  source_code_url      text,
  documentation_url    text,
  version              text,
  file_url             text,
  file_size            bigint,
  thumbnail            text,
  screenshots          text[],
  tags                 text[],
  downloads            integer not null default 0,
  rating               numeric(3, 2) not null default 0,
  is_public            boolean not null default true,
  submitted_by         uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
create index if not exists tools_public_idx on public.tools (is_public) where is_public;

drop trigger if exists tools_set_updated_at on public.tools;
create trigger tools_set_updated_at
  before update on public.tools
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- articles  (conteúdo editorial em markdown)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.articles (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  title          text not null,
  excerpt        text,
  content        text,
  category       text,
  tags           text[],
  cover_url      text,
  featured_items jsonb,
  views          integer not null default 0,
  author         uuid references public.profiles (id) on delete set null,
  published_at   timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index if not exists articles_published_idx
  on public.articles (published_at desc) where published_at is not null;

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
  before update on public.articles
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- reviews  (POLIMÓRFICO: um usuário avalia qualquer entidade uma única vez)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.reviews (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  subject_type text not null check (subject_type in ('game','romhack','translation','tool','document')),
  subject_id   uuid not null,
  rating       integer not null check (rating between 1 and 5),
  comment      text,
  helpful      integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (user_id, subject_type, subject_id)
);
create index if not exists reviews_subject_idx on public.reviews (subject_type, subject_id);

-- ─────────────────────────────────────────────────────────────────────────
-- favorites  (PK composta; um por usuário/entidade)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.favorites (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  subject_type text not null check (subject_type in ('game','romhack','translation','tool','document')),
  subject_id   uuid not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, subject_type, subject_id)
);
create index if not exists favorites_subject_idx on public.favorites (subject_type, subject_id);

-- ─────────────────────────────────────────────────────────────────────────
-- download_events  (série temporal p/ "trending" semanal, computado depois)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.download_events (
  id           uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('game','romhack','translation','tool','document')),
  subject_id   uuid not null,
  created_at   timestamptz not null default now()
);
create index if not exists download_events_subject_idx
  on public.download_events (subject_type, subject_id, created_at desc);

-- ─────────────────────────────────────────────────────────────────────────
-- api_keys  (guardamos o HASH, nunca o texto plano; só o prefixo p/ exibir)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.api_keys (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  name        text not null,
  key_prefix  text not null,
  key_hash    text not null,
  permissions text[],
  is_active   boolean not null default true,
  usage_count integer not null default 0,
  last_used   timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists api_keys_user_idx on public.api_keys (user_id);

-- ─────────────────────────────────────────────────────────────────────────
-- sync_state  (UM só: estado de ingestão por fonte+entidade)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.sync_state (
  id              uuid primary key default gen_random_uuid(),
  source          text not null,
  entity          text not null,
  cursor          text,
  status          text not null default 'idle',
  last_sync_at    timestamptz,
  items_processed integer not null default 0,
  error_message   text,
  updated_at      timestamptz not null default now(),
  unique (source, entity)
);

drop trigger if exists sync_state_set_updated_at on public.sync_state;
create trigger sync_state_set_updated_at
  before update on public.sync_state
  for each row execute function public.set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────
-- id_map  (UM só: mapeia id externo -> id do ROMVault, com confiança/match)
-- ─────────────────────────────────────────────────────────────────────────
create table if not exists public.id_map (
  id          uuid primary key default gen_random_uuid(),
  romvault_id uuid,
  source      text not null,
  entity      text not null,
  external_id text not null,
  confidence  numeric(4, 3),
  match_type  text,
  created_at  timestamptz not null default now(),
  unique (source, entity, external_id)
);
create index if not exists id_map_romvault_idx on public.id_map (romvault_id);
