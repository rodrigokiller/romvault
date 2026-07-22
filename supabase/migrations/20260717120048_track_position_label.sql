-- ═══════════════════════════════════════════════════════════════════════════
-- 48) Rótulo original da faixa (para o Discogs).
--
--   A chave da faixa é (soundtrack_id, disc, position) com position INTEIRO —
--   serve pro MusicBrainz, que numera 1,2,3. Mas no Discogs um LP tem faixa
--   "A1", "B2" (lado do vinil) e um box set tem "1-1", "2-14". Guardar isso
--   como inteiro perderia a informação que o colecionador quer ver.
--
--   Solução: `position` continua sendo o inteiro sequencial (ordena e forma a
--   chave) e `position_label` guarda o rótulo como está na capa. Quando é null,
--   a tela mostra o número mesmo.
--   Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.soundtrack_tracks
  add column if not exists position_label text;
