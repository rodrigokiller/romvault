-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — créditos/versão/data em tools e documents.
--   Ferramentas e documentos também têm autor e data de lançamento (RHDN e
--   PO.B.R.E trazem isso). Aditivo, idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.tools     add column if not exists credits      text;
alter table public.tools     add column if not exists release_date date;
alter table public.documents add column if not exists credits      text;
alter table public.documents add column if not exists version      text;
alter table public.documents add column if not exists release_date date;
