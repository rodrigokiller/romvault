-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — cópias de jogos (nível "coleção", complementa game_tracks).
--   game_tracks = a EXPERIÊNCIA (1 por usuário+jogo: status/horas/conquistas).
--   game_copies = as CÓPIAS (N por usuário+jogo): plataforma, física/digital,
--   loja/origem, edição, região. Mesmo jogo em várias plataformas e/ou várias
--   cópias na mesma plataforma. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.game_copies (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  game_id      uuid not null references public.games (id) on delete cascade,
  platform     text not null,
  distribution text not null default 'physical'
               check (distribution in ('physical', 'digital')),
  store        text,      -- Steam, GOG, PSN, eShop, cartucho, repro, CD...
  edition      text,      -- Standard, Collector's, Greatest Hits...
  region       text,      -- NTSC-U, PAL, NTSC-J...
  condition    text,      -- CIB, loose, sealed...
  acquired_at  date,
  notes        text,
  created_at   timestamptz not null default now()
);
create index if not exists game_copies_user_idx on public.game_copies (user_id, platform);
create index if not exists game_copies_game_idx on public.game_copies (user_id, game_id);

alter table public.game_copies enable row level security;

drop policy if exists "copies: read own or public" on public.game_copies;
create policy "copies: read own or public" on public.game_copies
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
drop policy if exists "copies: write self" on public.game_copies;
create policy "copies: write self" on public.game_copies
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
