-- ═══════════════════════════════════════════════════════════════════════════
-- 49) scene_releases: lançamentos raspados da cena (fórum BR SMF, etc.).
--   Captura TUDO (mesmo sem casar com um jogo do catálogo — game_id é opcional),
--   pra nada se perder. Quando o scraper casa com confiança, ele também cria uma
--   linha em `translations` (com página própria) e aponta matched_translation_id
--   aqui — daí o backlog-digest já existente notifica sozinho, e o feed mostra a
--   tradução (não a linha raspada). As não-casadas aparecem no feed direto daqui.
-- ═══════════════════════════════════════════════════════════════════════════
create table if not exists public.scene_releases (
  id                     uuid primary key default gen_random_uuid(),
  source                 text not null,               -- 'romhacking.net.br'
  source_url             text not null,               -- link do tópico (dedupe)
  kind                   text not null default 'translation'
                         check (kind in ('translation', 'hack')),
  title                  text not null,               -- título do post
  game_name              text,                        -- nome do jogo extraído
  platform               text,                        -- plataforma extraída (SNES...)
  language               text,                        -- 'Português (BR)'
  author                 text,
  game_id                uuid references public.games (id) on delete set null,
  matched_translation_id uuid references public.translations (id) on delete set null,
  published_at           timestamptz,
  created_at             timestamptz not null default now()
);
create unique index if not exists scene_releases_url_idx on public.scene_releases (source_url);
create index if not exists scene_releases_recent_idx
  on public.scene_releases (published_at desc nulls last, created_at desc);

alter table public.scene_releases enable row level security;
-- leitura pública (é o feed da cena); escrita só service role (edge function).
drop policy if exists "scene_releases: public read" on public.scene_releases;
create policy "scene_releases: public read" on public.scene_releases for select using (true);
