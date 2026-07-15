-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — zeradas (playthroughs): cada vez que o usuário TERMINOU o jogo,
--   com data OBRIGATÓRIA em precisão flexível (dia, mês ou ano — como
--   trackers de livros). Rejogar = adicionar outra zerada.
--   + price_paid nas cópias (valor da coleção). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.game_copies add column if not exists price_paid numeric(10,2);

create table if not exists public.game_playthroughs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  game_id     uuid not null references public.games (id) on delete cascade,
  finished_on date not null,          -- partes ausentes viram 01 (ver precision)
  precision   text not null default 'day'
              check (precision in ('day', 'month', 'year')),
  notes       text,
  created_at  timestamptz not null default now()
);
create index if not exists game_playthroughs_idx
  on public.game_playthroughs (user_id, game_id, finished_on desc);

alter table public.game_playthroughs enable row level security;

drop policy if exists "playthroughs: read own or public" on public.game_playthroughs;
create policy "playthroughs: read own or public" on public.game_playthroughs
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
drop policy if exists "playthroughs: write self" on public.game_playthroughs;
create policy "playthroughs: write self" on public.game_playthroughs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
