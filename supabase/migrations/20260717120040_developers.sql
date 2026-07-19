-- ═══════════════════════════════════════════════════════════════════════════
-- 40) DEVELOPERS no PLURAL (pedido do Killer: Chrono Trigger = Bird Studio +
--   Square, e só mostrávamos um). games.developers text[] espelhando o modelo
--   do IGDB (main developers + publishers); games.developer (singular) segue
--   preenchido com o primeiro, por compatibilidade. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.games
  add column if not exists developers text[] not null default '{}';

-- backfill: quem só tem o singular ganha o array de 1
update public.games
   set developers = array[developer]
 where developer is not null
   and coalesce(array_length(developers, 1), 0) = 0;
