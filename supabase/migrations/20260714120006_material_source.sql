-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — rastreio de origem nos materiais (para imports automáticos).
--   games já tem `data_source`. Estende romhacks/translations/documents/tools
--   com `data_source` (ex.: 'manual' | 'romhacking.net' | 'igdb' | 'import') e
--   `source_url` (link para o registro original na fonte). Aditivo, idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.romhacks     add column if not exists data_source text;
alter table public.romhacks     add column if not exists source_url  text;
alter table public.translations add column if not exists data_source text;
alter table public.translations add column if not exists source_url  text;
alter table public.documents    add column if not exists data_source text;
alter table public.documents    add column if not exists source_url  text;
alter table public.tools        add column if not exists data_source text;
alter table public.tools        add column if not exists source_url  text;

-- Índices para filtrar/relatar o que veio de cada fonte.
create index if not exists romhacks_source_idx     on public.romhacks     (data_source);
create index if not exists translations_source_idx on public.translations (data_source);
create index if not exists documents_source_idx    on public.documents    (data_source);
create index if not exists tools_source_idx        on public.tools        (data_source);
