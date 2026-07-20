-- ═══════════════════════════════════════════════════════════════════════════
-- 42) play_sessions pra TODAS as fontes + LOG MANUAL + backfill do que já
--   existe. Assim o "histórico" nasce cheio e unificado (não só Nintendo):
--   a) o usuário pode registrar "joguei isso em tal dia" (RLS insert/delete
--      próprio, provider='manual') — vale pra retrô/emulador/físico
--   b) backfill: cada zerada (game_playthroughs) e cada last_played dos syncs
--      viram sessões históricas
--   Idempotente (o backfill é on-conflict-do-nothing).
-- ═══════════════════════════════════════════════════════════════════════════

-- a) log manual: o dono insere/apaga as PRÓPRIAS sessões
drop policy if exists "sessions: insert own" on public.play_sessions;
create policy "sessions: insert own" on public.play_sessions
  for insert with check (auth.uid() = user_id);
drop policy if exists "sessions: delete own" on public.play_sessions;
create policy "sessions: delete own" on public.play_sessions
  for delete using (auth.uid() = user_id);

-- b) backfill das ZERADAS (data de término = dia jogado, provider=manual)
insert into public.play_sessions (user_id, game_id, provider, played_on)
select user_id, game_id, 'manual', finished_on
from public.game_playthroughs
where finished_on is not null
on conflict (user_id, game_id, provider, played_on) do nothing;

-- b) backfill do LAST_PLAYED de cada conta sincronizada (Steam/PSN/Xbox/GOG…)
insert into public.play_sessions (user_id, game_id, provider, played_on)
select user_id, game_id, provider, last_played::date
from public.game_sync_data
where last_played is not null
on conflict (user_id, game_id, provider, played_on) do nothing;

-- c) TRIGGER: daqui pra frente, todo last_played novo/atualizado vira sessão
--   automaticamente — um lugar só cobre steam/psn/xbox/gog/ra/nintendo sem
--   tocar em nenhum importer.
create or replace function public.log_play_session()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_played is not null then
    insert into public.play_sessions (user_id, game_id, provider, played_on)
    values (new.user_id, new.game_id, new.provider, new.last_played::date)
    on conflict (user_id, game_id, provider, played_on) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists sync_data_logs_session on public.game_sync_data;
create trigger sync_data_logs_session
  after insert or update of last_played on public.game_sync_data
  for each row execute function public.log_play_session();
