-- ═══════════════════════════════════════════════════════════════════════════
-- 45) PRÓXIMOS LANÇAMENTOS / MAIS AGUARDADOS (pedido do Killer):
--   - hypes: quantas pessoas seguem o jogo no IGDB. É o critério de "mais
--     aguardado" que faltava (nota não serve: jogo não lançado não tem nota).
--   - tba: "to be announced" — sabe-se que está em produção, mas sem data.
--     (release_date null sozinho não serve: jogo VELHO sem data também é null.)
--   Carga: npm run import -- --source=igdb-upcoming
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.games
  add column if not exists hypes int,
  add column if not exists tba   boolean not null default false;

-- ordenação de "mais aguardados" e da agenda de lançamentos
create index if not exists games_hypes_idx on public.games (hypes desc nulls last);
create index if not exists games_release_date_idx on public.games (release_date);
create index if not exists games_tba_idx on public.games (tba) where tba;
