-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — merge inteligente de horas: o track (resumo curado) deriva
-- hours_played da SOMA das contas sincronizadas (Steam PC + PSN PS5 + ...),
-- automaticamente, via trigger em game_sync_data.
-- Regra: manual > tudo — tracks criados manualmente nunca são tocados.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.sync_hours_rollup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  total numeric;
begin
  select sum(hours_played) into total
  from public.game_sync_data
  where user_id = new.user_id and game_id = new.game_id and hours_played is not null;

  if total is not null then
    update public.game_tracks
    set hours_played = round(total, 1)
    where user_id = new.user_id and game_id = new.game_id
      and source <> 'manual';
  end if;
  return new;
end;
$$;

drop trigger if exists sync_hours_rollup_trg on public.game_sync_data;
create trigger sync_hours_rollup_trg
  after insert or update on public.game_sync_data
  for each row execute function public.sync_hours_rollup();
