-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — dados de SYNC por plataforma/provedor (decisão de modelo).
--
-- O problema: game_tracks é 1 por usuário+jogo (a EXPERIÊNCIA curada), mas o
-- mesmo jogo existe em várias plataformas — Steam (PC), PSN (PS5), RA (SNES)
-- sincronizariam por cima um do outro.
--
-- A solução: game_sync_data = o dado BRUTO de cada provedor, separado por
-- (usuário, jogo, provedor). Os importers escrevem AQUI sempre (sem conflito
-- entre si e sem tocar no que é manual); o track continua sendo o resumo
-- humano. A UI mostra os dois: o track + as linhas por provedor (horas,
-- conquistas, plataforma, último sync).
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.game_sync_data (
  user_id              uuid not null references public.profiles (id) on delete cascade,
  game_id              uuid not null references public.games (id) on delete cascade,
  provider             text not null check (provider in
    ('steam', 'retroachievements', 'psn', 'xbox', 'nintendo', 'gog', 'epic')),
  platform             text,               -- plataforma DAQUELE provedor (PC, PS5, SNES…)
  hours_played         numeric(10, 1),
  achievements_earned  integer,
  achievements_total   integer,
  progress             integer,            -- % quando o provedor dá pronto (PSN/RA)
  last_played          timestamptz,        -- quando o provedor informa
  synced_at            timestamptz not null default now(),
  primary key (user_id, game_id, provider)
);
create index if not exists sync_data_user_idx on public.game_sync_data (user_id);
create index if not exists sync_data_game_idx on public.game_sync_data (user_id, game_id);

alter table public.game_sync_data enable row level security;

-- leitura: dono ou biblioteca pública (mesma regra dos tracks)
drop policy if exists "sync_data: read own or public" on public.game_sync_data;
create policy "sync_data: read own or public" on public.game_sync_data
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
-- escrita: só service role (edge functions dos importers) — sem policy de write.
