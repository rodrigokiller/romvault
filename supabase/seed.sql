-- ═══════════════════════════════════════════════════════════════════════════
-- ROMVault — seed de exemplo (opcional). Popula umas linhas pra ver o catalogo
-- renderizando com conteudo. IDEMPOTENTE: pode rodar mais de uma vez sem duplicar
-- (games/articles por slug unico; o resto por guarda `not exists`).
-- Rode no SQL Editor do Supabase DEPOIS das migrations. Nao usa usuarios
-- (created_by/submitted_by ficam null).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Jogos ──────────────────────────────────────────────────────────────────
insert into public.games
  (slug, igdb_id, title, developer, publishers, release_date, genres, platforms,
   franchise, description, game_modes, features, themes, age_rating,
   completion_times, external_ids, data_source)
values
  ('chrono-trigger', 1234, 'Chrono Trigger', 'Square', array['Square'],
   '1995-03-11', array['RPG'], array['SNES','PlayStation','Nintendo DS'],
   'Chrono',
   'JRPG de viagem no tempo com multiplos finais, considerado um dos maiores RPGs de todos os tempos.',
   array['Single Player'], array['Multiplos Finais','New Game+','Battery Save'],
   array['Ficcao Cientifica','Fantasia'], 'ESRB E',
   '{"main_story":"20h","main_extras":"27h","completionist":"41h","source":"HowLongToBeat"}'::jsonb,
   '{"igdb":1234,"hltb":"chrono-trigger"}'::jsonb, 'manual'),

  ('super-metroid', 2058, 'Super Metroid', 'Nintendo R&D1', array['Nintendo'],
   '1994-03-19', array['Metroidvania','Acao/Aventura'], array['SNES'],
   'Metroid',
   'Marco do genero metroidvania: exploracao nao-linear, atmosfera isolante e controle preciso.',
   array['Single Player'], array['Exploracao','Sequence Breaking','Battery Save'],
   array['Ficcao Cientifica','Isolamento'], 'ESRB E',
   '{"main_story":"7h","main_extras":"10h","completionist":"14h","source":"HowLongToBeat"}'::jsonb,
   '{"igdb":2058}'::jsonb, 'manual'),

  ('legend-of-mana', 3910, 'Legend of Mana', 'Square', array['Square'],
   '1999-07-15', array['Action RPG'], array['PlayStation'],
   'Mana',
   'ARPG da serie Mana com mundo montado pelo jogador (Land Make), arte pintada a mao e trilha marcante.',
   array['Single Player','Co-op'], array['Land Make','Forja','Multiplos Finais'],
   array['Fantasia'], 'ESRB E',
   '{"main_story":"22h","main_extras":"40h","completionist":"70h","source":"HowLongToBeat"}'::jsonb,
   '{"igdb":3910}'::jsonb, 'manual'),

  ('zelda-alttp', 1029, 'The Legend of Zelda: A Link to the Past', 'Nintendo EAD',
   array['Nintendo'], '1991-11-21', array['Acao/Aventura'], array['SNES'],
   'The Legend of Zelda',
   'Aventura top-down definitiva do SNES: dois mundos paralelos, dungeons memoraveis e itens classicos.',
   array['Single Player'], array['Dois Mundos','Puzzles','Battery Save'],
   array['Fantasia'], 'ESRB E',
   '{"main_story":"14h","main_extras":"19h","completionist":"27h","source":"HowLongToBeat"}'::jsonb,
   '{"igdb":1029}'::jsonb, 'manual')
on conflict (slug) do nothing;

-- ── Romhacks (ligados a um jogo por slug; guarda por titulo+game_id) ────────
insert into public.romhacks
  (game_id, title, description, categories, version, patch_type, difficulty,
   hack_type, tags, downloads, rating, release_date)
select g.id, 'Prophet''s Guile',
  'Hack narrativo curto que reimagina o arco do Magus com novos eventos e mapas.',
  array['Story','Improvement'], '1.2', 'BPS', 'Normal', 'Full',
  array['story','magus'], 4821, 4.60, '2013-05-01'
from public.games g
where g.slug = 'chrono-trigger'
  and not exists (select 1 from public.romhacks r where r.game_id = g.id and r.title = 'Prophet''s Guile');

insert into public.romhacks
  (game_id, title, description, categories, version, patch_type, difficulty,
   hack_type, tags, downloads, rating, release_date)
select g.id, 'Project Base',
  'Rebalanceamento e melhorias de qualidade de vida mantendo a estrutura original.',
  array['Improvement','Gameplay'], '0.9', 'IPS', 'Normal', 'Gameplay',
  array['qol','rebalance'], 9130, 4.80, '2015-08-20'
from public.games g
where g.slug = 'super-metroid'
  and not exists (select 1 from public.romhacks r where r.game_id = g.id and r.title = 'Project Base');

-- ── Traducao (o proprio projeto do Killer, de brincadeira) ──────────────────
insert into public.translations
  (game_id, title, description, language, source_language, completion_percentage,
   translation_type, patch_type, version, downloads, rating, release_date)
select g.id, 'Legend of Mana — Traducao PT-BR',
  'Traducao completa para portugues do Brasil, feita com o LoM Studio.',
  'Portugues (BR)', 'Ingles', 15, 'Full', 'PPF', '0.1', 340, 5.00, '2026-07-01'
from public.games g
where g.slug = 'legend-of-mana'
  and not exists (select 1 from public.translations t where t.game_id = g.id and t.title = 'Legend of Mana — Traducao PT-BR');

-- ── Documento (generico, sem jogo) ─────────────────────────────────────────
insert into public.documents
  (title, description, category, file_format, language, tags, downloads, rating)
select 'Guia de Assembly do SNES (65816)', 'Introducao pratica ao 65816 para romhacking de SNES.',
  'Technical', 'HTML', 'Portugues (BR)', array['snes','assembly','65816'], 1204, 4.70
where not exists (select 1 from public.documents d where d.title = 'Guia de Assembly do SNES (65816)');

-- ── Ferramentas (as da suite do Killer) ────────────────────────────────────
insert into public.tools
  (title, description, category, supported_platforms, license, source_code_url, tags, downloads, rating)
select 'TIM Studio', 'Editor moderno de imagens TIM de PSX (TIM <-> PNG, ISO, reinsercao).',
  'Tile Editor', array['PlayStation'], 'Free',
  'https://github.com/rodrigokiller/tim-studio', array['psx','tim','graphics'], 512, 4.90
where not exists (select 1 from public.tools t where t.title = 'TIM Studio');

insert into public.tools
  (title, description, category, supported_platforms, license, source_code_url, tags, downloads, rating)
select 'Tile Studio', 'Editor de tiles/graficos crus estilo Tile Molester (codecs por console).',
  'Tile Editor', array['SNES','Game Boy','NES','PlayStation'], 'Free',
  'https://github.com/rodrigokiller/tile-studio', array['tiles','snes','gb'], 388, 4.85
where not exists (select 1 from public.tools t where t.title = 'Tile Studio');

-- ── Artigo (blog) ──────────────────────────────────────────────────────────
insert into public.articles
  (slug, title, excerpt, content, category, tags, views, published_at)
values
  ('melhores-romhacks-2025',
   'Os melhores romhacks de 2025',
   'Uma selecao dos hacks e traducoes que mais marcaram o ano.',
   E'# Os melhores romhacks de 2025\n\nSelecao editorial dos lancamentos que mais chamaram atencao...\n\n(conteudo de exemplo)',
   'Showcase', array['retrospectiva','2025'], 1530, now())
on conflict (slug) do nothing;
