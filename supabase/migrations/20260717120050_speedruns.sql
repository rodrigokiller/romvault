-- ═══════════════════════════════════════════════════════════════════════════
-- 50) game_speedruns: recordes (WR por categoria) do speedrun.com, cacheados por
--   jogo. Preenchido pela edge `speedrun-sync` (cron pros populares/owned +
--   read-through sob demanda na página do jogo). O id do jogo no speedrun.com
--   fica em games.external_ids.speedruncom pra não re-buscar.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.game_speedruns (
  id            uuid primary key default gen_random_uuid(),
  game_id       uuid not null references public.games (id) on delete cascade,
  category      text not null,
  place         integer not null default 1,     -- 1 = world record
  runner        text,
  time_seconds  numeric(10, 2),
  video_url     text,
  run_url       text,
  source        text not null default 'speedrun.com',
  fetched_at    timestamptz not null default now(),
  unique (game_id, category, place)
);
create index if not exists game_speedruns_game_idx on public.game_speedruns (game_id, time_seconds);

alter table public.game_speedruns enable row level security;
-- leitura pública (é conteúdo da página do jogo); escrita só service role (edge).
drop policy if exists "game_speedruns: public read" on public.game_speedruns;
create policy "game_speedruns: public read" on public.game_speedruns for select using (true);
