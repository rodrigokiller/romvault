-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — tracking de jogos por perfil (biblioteca/estante).
--   Um registro por usuário+jogo: status (jogando/terminado/abandonado/quero
--   jogar), plataforma em que joga, horas, conquistas, notas. `source` já
--   preparado para imports futuros (steam/gog/...). Privacidade por perfil
--   (profiles.library_public). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists library_public boolean not null default true;

create table if not exists public.game_tracks (
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game_id      uuid not null references public.games (id) on delete cascade,
  status       text not null default 'backlog'
               check (status in ('playing', 'finished', 'abandoned', 'backlog')),
  platform     text,
  hours_played numeric(7, 1),
  achievements_earned integer,
  achievements_total  integer,
  notes        text,
  source       text not null default 'manual',  -- manual | steam | gog | ...
  started_at   date,
  finished_at  date,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  primary key (user_id, game_id)
);
create index if not exists game_tracks_user_idx on public.game_tracks (user_id, status);
create index if not exists game_tracks_game_idx on public.game_tracks (game_id);

drop trigger if exists game_tracks_set_updated_at on public.game_tracks;
create trigger game_tracks_set_updated_at
  before update on public.game_tracks
  for each row execute function public.set_updated_at();

alter table public.game_tracks enable row level security;

-- dono lê/escreve; terceiros leem se a biblioteca do dono for pública
drop policy if exists "tracks: read own or public" on public.game_tracks;
create policy "tracks: read own or public" on public.game_tracks
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
drop policy if exists "tracks: write self" on public.game_tracks;
create policy "tracks: write self" on public.game_tracks
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
