-- ═══════════════════════════════════════════════════════════════════════════
-- 47) CARGOS (roles) + TRILHAS SONORAS.
--
--   a) roles de verdade: user | manager | admin. `is_admin` CONTINUA existindo
--      (dezenas de policies antigas dependem dele) e fica em sincronia — quem
--      era admin vira role='admin'. Curadoria = manager OU admin, via
--      can_curate(), pra não reescrever policy nenhuma antiga.
--   b) game_soundtracks: o álbum PRINCIPAL e suas DERIVAÇÕES (parent_id),
--      com ids externos em jsonb (musicbrainz, steam, gog, vgmdb) igual
--      games.external_ids já faz.
--   c) soundtrack_tracks: faixas com duração (o MusicBrainz dá de graça).
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

/* ── a) cargos ────────────────────────────────────────────────────────────── */
alter table public.profiles
  add column if not exists role text not null default 'user';

do $$
begin
  alter table public.profiles drop constraint if exists profiles_role_check;
  alter table public.profiles add constraint profiles_role_check
    check (role in ('user', 'manager', 'admin'));
end;
$$;

-- quem já era admin nasce com o cargo certo
update public.profiles set role = 'admin' where is_admin and role <> 'admin';

/** Pode curar catálogo (trilhas, etc.)? manager ou admin. */
create or replace function public.can_curate()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and (p.is_admin or p.role in ('manager', 'admin'))
  );
$$;
grant execute on function public.can_curate() to authenticated;

/* ── b) álbuns ────────────────────────────────────────────────────────────── */
create table if not exists public.game_soundtracks (
  id           uuid primary key default gen_random_uuid(),
  game_id      uuid not null references public.games (id) on delete cascade,
  title        text not null,
  -- 'inspired' cobre o caso "Music Inspired by The Witcher" (não é OST)
  kind         text not null default 'original' check (kind in
    ('original', 'arrange', 'vocal', 'remix', 'cover', 'piano', 'live',
     'selection', 'inspired', 'other')),
  -- null = álbum principal; preenchido = derivação daquele álbum
  parent_id    uuid references public.game_soundtracks (id) on delete set null,
  composer     text,
  artists      text[] not null default '{}',
  release_date date,
  label        text,                    -- selo/gravadora
  catalog      text,                    -- nº de catálogo (o forte do VGMdb)
  disc_count   int,
  track_count  int,
  cover_url    text,
  -- {musicbrainz: "mbid", steam: "1092840", gog: "...", vgmdb: "33474"}
  external_ids jsonb not null default '{}'::jsonb,
  notes        text,
  added_by     uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists game_soundtracks_game_idx on public.game_soundtracks (game_id);
create index if not exists game_soundtracks_parent_idx on public.game_soundtracks (parent_id);
-- um álbum por id de cada provedor (evita duplicar no import e no modal)
create unique index if not exists game_soundtracks_mb_idx
  on public.game_soundtracks ((external_ids->>'musicbrainz'))
  where external_ids->>'musicbrainz' is not null;
create unique index if not exists game_soundtracks_steam_idx
  on public.game_soundtracks ((external_ids->>'steam'))
  where external_ids->>'steam' is not null;

alter table public.game_soundtracks enable row level security;
drop policy if exists "soundtracks: read" on public.game_soundtracks;
create policy "soundtracks: read" on public.game_soundtracks for select using (true);
drop policy if exists "soundtracks: curate" on public.game_soundtracks;
create policy "soundtracks: curate" on public.game_soundtracks
  for all using (public.can_curate()) with check (public.can_curate());

/* ── c) faixas ────────────────────────────────────────────────────────────── */
create table if not exists public.soundtrack_tracks (
  soundtrack_id uuid not null references public.game_soundtracks (id) on delete cascade,
  disc          int  not null default 1,
  position      int  not null,
  title         text not null,
  duration_ms   int,
  primary key (soundtrack_id, disc, position)
);
alter table public.soundtrack_tracks enable row level security;
drop policy if exists "tracks: read" on public.soundtrack_tracks;
create policy "tracks: read" on public.soundtrack_tracks for select using (true);
drop policy if exists "tracks: curate" on public.soundtrack_tracks;
create policy "tracks: curate" on public.soundtrack_tracks
  for all using (public.can_curate()) with check (public.can_curate());
