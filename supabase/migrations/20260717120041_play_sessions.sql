-- ═══════════════════════════════════════════════════════════════════════════
-- 41) HISTÓRICO de sessões de jogo (pedido do Killer: "melhorar o Nintendo
--   pra histórico"). O sync de presença (Nintendo) e os syncs de last_played
--   (Steam/PSN/Xbox) só guardavam o ÚLTIMO dia jogado em game_sync_data. Aqui
--   cada DIA de jogo detectado vira uma linha — vira o histórico real que
--   alimenta o heatmap mesmo quando a pessoa jogou vários dias entre syncs.
--   Uma linha por (user, game, dia, provider). Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.play_sessions (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  game_id    uuid not null references public.games (id) on delete cascade,
  provider   text not null,            -- nintendo | steam | psn | xbox | gog | manual
  played_on  date not null,
  created_at timestamptz not null default now(),
  primary key (user_id, game_id, provider, played_on)
);
create index if not exists play_sessions_user_idx on public.play_sessions (user_id, played_on);

alter table public.play_sessions enable row level security;

-- leitura: dono sempre; público quando a biblioteca é pública (heatmap alheio)
drop policy if exists "sessions: read" on public.play_sessions;
create policy "sessions: read" on public.play_sessions
  for select using (
    auth.uid() = user_id
    or exists (select 1 from public.profiles p where p.id = user_id and p.library_public)
  );
-- escrita: service role (importers) — sem policy de insert p/ o cliente.
