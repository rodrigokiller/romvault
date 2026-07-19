-- ═══════════════════════════════════════════════════════════════════════════
-- 34) GÊNEROS canônicos + de->para por fonte (mesmo desenho das plataformas).
--   Análise pedida pelo Killer: cada fonte grava gênero do seu jeito —
--   IGDB tem lista FIXA de 23 (nossa canônica, já que games.genres[] de 60k
--   jogos usa esses nomes); RHDN tem 24 com hierarquia ("Action > Fighting",
--   extraídos do dump real); PO.B.R.E usa nomes em português no campo "Tipo".
--   Moby/ScreenScraper/SMWC não alimentam gênero hoje (Moby teria na API,
--   fase 4; SMWC usa tags, outra coisa).
--   Os importers passam a RESOLVER por esta tabela na fase 3; por ora ela é
--   o cadastro + documentação viva da integração. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create table if not exists public.genres (
  slug    text primary key,
  name    text not null,            -- nome canônico (o que games.genres[] usa)
  is_game boolean not null default true  -- false: Application/Screen Saver etc.
);
alter table public.genres enable row level security;
drop policy if exists "genres: read" on public.genres;
create policy "genres: read" on public.genres for select using (true);

create table if not exists public.genre_aliases (
  source       text not null,       -- igdb | rhdn | pobre | mobygames | ...
  external_key text not null,       -- nome/id exato na fonte
  genre        text not null references public.genres (slug) on delete cascade,
  primary key (source, external_key)
);
alter table public.genre_aliases enable row level security;
drop policy if exists "genre_aliases: read" on public.genre_aliases;
create policy "genre_aliases: read" on public.genre_aliases for select using (true);

-- canônicos = a lista fixa do IGDB + 3 extras necessários pelas outras fontes
insert into public.genres (slug, name, is_game) values
  ('point-and-click', 'Point-and-click', true),
  ('fighting', 'Fighting', true),
  ('shooter', 'Shooter', true),
  ('music', 'Music', true),
  ('platform', 'Platform', true),
  ('puzzle', 'Puzzle', true),
  ('racing', 'Racing', true),
  ('rts', 'Real Time Strategy (RTS)', true),
  ('rpg', 'Role-playing (RPG)', true),
  ('simulator', 'Simulator', true),
  ('sport', 'Sport', true),
  ('strategy', 'Strategy', true),
  ('tbs', 'Turn-based strategy (TBS)', true),
  ('tactical', 'Tactical', true),
  ('beat-em-up', 'Hack and slash/Beat ''em up', true),
  ('quiz', 'Quiz/Trivia', true),
  ('pinball', 'Pinball', true),
  ('adventure', 'Adventure', true),
  ('indie', 'Indie', true),
  ('arcade', 'Arcade', true),
  ('visual-novel', 'Visual Novel', true),
  ('card-board', 'Card & Board Game', true),
  ('moba', 'MOBA', true),
  -- extras (fora do IGDB, exigidos por RHDN/PO.B.R.E)
  ('action', 'Action', true),
  ('application', 'Application', false),
  ('other', 'Other', true)
on conflict (slug) do nothing;

-- IGDB: identidade explícita (uma entrada POR FONTE mesmo com nome igual,
-- princípio do de->para do Killer — integração auditável)
insert into public.genre_aliases (source, external_key, genre) values
  ('igdb', 'Point-and-click', 'point-and-click'), ('igdb', 'Fighting', 'fighting'),
  ('igdb', 'Shooter', 'shooter'), ('igdb', 'Music', 'music'), ('igdb', 'Platform', 'platform'),
  ('igdb', 'Puzzle', 'puzzle'), ('igdb', 'Racing', 'racing'),
  ('igdb', 'Real Time Strategy (RTS)', 'rts'), ('igdb', 'Role-playing (RPG)', 'rpg'),
  ('igdb', 'Simulator', 'simulator'), ('igdb', 'Sport', 'sport'), ('igdb', 'Strategy', 'strategy'),
  ('igdb', 'Turn-based strategy (TBS)', 'tbs'), ('igdb', 'Tactical', 'tactical'),
  ('igdb', 'Hack and slash/Beat ''em up', 'beat-em-up'), ('igdb', 'Quiz/Trivia', 'quiz'),
  ('igdb', 'Pinball', 'pinball'), ('igdb', 'Adventure', 'adventure'), ('igdb', 'Indie', 'indie'),
  ('igdb', 'Arcade', 'arcade'), ('igdb', 'Visual Novel', 'visual-novel'),
  ('igdb', 'Card & Board Game', 'card-board'), ('igdb', 'MOBA', 'moba')
on conflict (source, external_key) do nothing;

-- RHDN: os 24 gêneros REAIS do dump (tabela genres), com hierarquia achatada
insert into public.genre_aliases (source, external_key, genre) values
  ('rhdn', 'Action', 'action'),
  ('rhdn', 'Action > Beat ''Em Up', 'beat-em-up'),
  ('rhdn', 'Action > Fighting', 'fighting'),
  ('rhdn', 'Action > Platformer', 'platform'),
  ('rhdn', 'Action > Shooter', 'shooter'),
  ('rhdn', 'Action Adventure', 'adventure'),
  ('rhdn', 'Adventure', 'adventure'),
  ('rhdn', 'Application', 'application'),
  ('rhdn', 'Boardgame', 'card-board'),
  ('rhdn', 'Card Game', 'card-board'),
  ('rhdn', 'Dating Sim', 'visual-novel'),
  ('rhdn', 'Game Creation', 'application'),
  ('rhdn', 'Other', 'other'),
  ('rhdn', 'Puzzle', 'puzzle'),
  ('rhdn', 'Racing', 'racing'),
  ('rhdn', 'Role Playing', 'rpg'),
  ('rhdn', 'Role Playing > Action RPG', 'rpg'),
  ('rhdn', 'Screen Saver', 'application'),
  ('rhdn', 'Simulation', 'simulator'),
  ('rhdn', 'Sports', 'sport'),
  ('rhdn', 'Strategy', 'strategy'),
  ('rhdn', 'Strategy > Turn Based', 'tbs'),
  ('rhdn', 'Unknown', 'other'),
  ('rhdn', 'Visual Novel', 'visual-novel')
on conflict (source, external_key) do nothing;

-- PO.B.R.E: campo "Tipo" em português (melhor esforço; completa-se ao vivo)
insert into public.genre_aliases (source, external_key, genre) values
  ('pobre', 'Ação', 'action'), ('pobre', 'Aventura', 'adventure'), ('pobre', 'RPG', 'rpg'),
  ('pobre', 'Plataforma', 'platform'), ('pobre', 'Luta', 'fighting'), ('pobre', 'Corrida', 'racing'),
  ('pobre', 'Esporte', 'sport'), ('pobre', 'Estratégia', 'strategy'), ('pobre', 'Puzzle', 'puzzle'),
  ('pobre', 'Tiro', 'shooter'), ('pobre', 'Simulação', 'simulator'), ('pobre', 'RPG de Ação', 'rpg')
on conflict (source, external_key) do nothing;
