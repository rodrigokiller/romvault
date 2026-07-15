-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — meta anual de zeradas ("quero zerar N jogos este ano").
--   Guardada no perfil; o progresso vem de game_playthroughs do ano corrente.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.profiles
  add column if not exists yearly_goal integer
  check (yearly_goal is null or yearly_goal between 1 and 999);
