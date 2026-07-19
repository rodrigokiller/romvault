-- ═══════════════════════════════════════════════════════════════════════════
-- 33) CATÁLOGO V2 (fundação) — do analise.txt do Killer (2026-07-17):
--   a) plataformas canônicas + tabela de->para por fonte (rhdn "Super
--      Nintendo" -> SNES; igdb 19 -> SNES; uma entrada POR FONTE mesmo
--      quando o nome coincide, pra integração ficar auditável)
--   b) game_relations: remaster/remake/port/expanded/versão são JOGOS
--      SEPARADOS mas LIGADOS (Chrono Trigger SNES x PS1 x NDS)
--   c) game_media: mídia por (jogo, plataforma, tipo, região, fonte) —
--      resolve o caso Quake 2 (capa Steam pra quem tem na Steam, PSX pra
--      quem tem no PSX) e o "Moby como mídia própria, não fallback"
--   d) games: game_type (main/remake/...), alt_titles PESQUISÁVEL
--      (FF III x FF VI), series, relevance (ranking diário da busca)
--   e) compute_game_relevance() + pg_cron diário
--   Tudo aditivo: NADA é apagado; games.platforms/metadata seguem valendo
--   até as fases seguintes. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists pg_cron;
create extension if not exists pg_trgm;

/* ── a) plataformas canônicas + aliases por fonte ─────────────────────────── */
create table if not exists public.platforms (
  slug       text primary key,          -- 'snes' (chave estável)
  name       text not null,             -- nome curto canônico: 'SNES'
  full_name  text,                      -- 'Super Nintendo Entertainment System'
  family     text,                      -- nintendo | sony | sega | microsoft | pc | atari | nec | snk | outros
  sort       int  not null default 100
);
alter table public.platforms enable row level security;
drop policy if exists "platforms: read" on public.platforms;
create policy "platforms: read" on public.platforms for select using (true);

create table if not exists public.platform_aliases (
  source       text not null,           -- igdb | rhdn | mobygames | screenscraper | libretro | smwcentral | pobre
  external_key text not null,           -- id numérico OU nome exato na fonte
  platform     text not null references public.platforms (slug) on delete cascade,
  primary key (source, external_key)
);
alter table public.platform_aliases enable row level security;
drop policy if exists "platform_aliases: read" on public.platform_aliases;
create policy "platform_aliases: read" on public.platform_aliases for select using (true);

insert into public.platforms (slug, name, full_name, family, sort) values
  ('nes', 'NES', 'Nintendo Entertainment System', 'nintendo', 10),
  ('snes', 'SNES', 'Super Nintendo Entertainment System', 'nintendo', 11),
  ('n64', 'N64', 'Nintendo 64', 'nintendo', 12),
  ('gamecube', 'GameCube', 'Nintendo GameCube', 'nintendo', 13),
  ('wii', 'Wii', 'Nintendo Wii', 'nintendo', 14),
  ('wii-u', 'Wii U', 'Nintendo Wii U', 'nintendo', 15),
  ('switch', 'Switch', 'Nintendo Switch', 'nintendo', 16),
  ('switch-2', 'Switch 2', 'Nintendo Switch 2', 'nintendo', 17),
  ('game-boy', 'Game Boy', 'Nintendo Game Boy', 'nintendo', 20),
  ('gbc', 'GBC', 'Game Boy Color', 'nintendo', 21),
  ('gba', 'GBA', 'Game Boy Advance', 'nintendo', 22),
  ('nds', 'NDS', 'Nintendo DS', 'nintendo', 23),
  ('3ds', '3DS', 'Nintendo 3DS', 'nintendo', 24),
  ('virtual-boy', 'Virtual Boy', 'Nintendo Virtual Boy', 'nintendo', 25),
  ('fds', 'FDS', 'Famicom Disk System', 'nintendo', 26),
  ('pokemon-mini', 'Pokémon mini', 'Nintendo Pokémon mini', 'nintendo', 27),
  ('genesis', 'Genesis', 'Sega Mega Drive / Genesis', 'sega', 30),
  ('master-system', 'Master System', 'Sega Master System', 'sega', 31),
  ('game-gear', 'Game Gear', 'Sega Game Gear', 'sega', 32),
  ('sega-cd', 'Sega CD', 'Sega Mega-CD / Sega CD', 'sega', 33),
  ('32x', '32X', 'Sega 32X', 'sega', 34),
  ('saturn', 'Saturn', 'Sega Saturn', 'sega', 35),
  ('dreamcast', 'Dreamcast', 'Sega Dreamcast', 'sega', 36),
  ('sg-1000', 'SG-1000', 'Sega SG-1000 / SC-3000', 'sega', 37),
  ('ps1', 'PS1', 'Sony PlayStation', 'sony', 40),
  ('ps2', 'PS2', 'Sony PlayStation 2', 'sony', 41),
  ('ps3', 'PS3', 'Sony PlayStation 3', 'sony', 42),
  ('ps4', 'PS4', 'Sony PlayStation 4', 'sony', 43),
  ('ps5', 'PS5', 'Sony PlayStation 5', 'sony', 44),
  ('psp', 'PSP', 'Sony PlayStation Portable', 'sony', 45),
  ('ps-vita', 'PS Vita', 'Sony PlayStation Vita', 'sony', 46),
  ('xbox', 'Xbox', 'Microsoft Xbox', 'microsoft', 50),
  ('xbox-360', 'Xbox 360', 'Microsoft Xbox 360', 'microsoft', 51),
  ('xbox-one', 'Xbox One', 'Microsoft Xbox One', 'microsoft', 52),
  ('xbox-series', 'Xbox Series', 'Microsoft Xbox Series X|S', 'microsoft', 53),
  ('pc', 'PC', 'PC (Windows)', 'pc', 60),
  ('dos', 'DOS', 'MS-DOS', 'pc', 61),
  ('mac', 'Mac', 'Apple macOS', 'pc', 62),
  ('linux', 'Linux', 'Linux', 'pc', 63),
  ('tg-16', 'TG-16', 'NEC TurboGrafx-16 / PC Engine', 'nec', 70),
  ('tg-cd', 'TG-CD', 'NEC TurboGrafx-CD', 'nec', 71),
  ('supergrafx', 'SuperGrafx', 'NEC PC Engine SuperGrafx', 'nec', 72),
  ('pc-fx', 'PC-FX', 'NEC PC-FX', 'nec', 73),
  ('pc-98', 'PC-98', 'NEC PC-9800', 'nec', 74),
  ('neo-geo', 'Neo Geo', 'SNK Neo Geo AES/MVS', 'snk', 80),
  ('neo-geo-cd', 'Neo Geo CD', 'SNK Neo Geo CD', 'snk', 81),
  ('neo-geo-pocket', 'Neo Geo Pocket', 'SNK Neo Geo Pocket / Color', 'snk', 82),
  ('atari-2600', 'Atari 2600', 'Atari 2600', 'atari', 90),
  ('atari-5200', 'Atari 5200', 'Atari 5200', 'atari', 91),
  ('atari-7800', 'Atari 7800', 'Atari 7800', 'atari', 92),
  ('lynx', 'Lynx', 'Atari Lynx', 'atari', 93),
  ('jaguar', 'Jaguar', 'Atari Jaguar', 'atari', 94),
  ('arcade', 'Arcade', 'Arcade', 'outros', 100),
  ('amiga', 'Amiga', 'Commodore Amiga', 'outros', 101),
  ('c64', 'C64', 'Commodore 64', 'outros', 102),
  ('msx', 'MSX', 'MSX / MSX2', 'outros', 103),
  ('3do', '3DO', '3DO Interactive Multiplayer', 'outros', 104),
  ('colecovision', 'ColecoVision', 'ColecoVision', 'outros', 105),
  ('intellivision', 'Intellivision', 'Mattel Intellivision', 'outros', 106),
  ('wonderswan', 'WonderSwan', 'Bandai WonderSwan', 'outros', 107),
  ('x68000', 'X68000', 'Sharp X68000', 'outros', 108),
  ('cd-i', 'CD-i', 'Philips CD-i', 'outros', 109),
  ('zeebo', 'Zeebo', 'Zeebo', 'outros', 110),
  ('android', 'Android', 'Android', 'mobile', 120),
  ('ios', 'iOS', 'Apple iOS', 'mobile', 121)
on conflict (slug) do nothing;

-- aliases IGDB (ids numéricos da API)
insert into public.platform_aliases (source, external_key, platform) values
  ('igdb', '18', 'nes'), ('igdb', '19', 'snes'), ('igdb', '4', 'n64'),
  ('igdb', '21', 'gamecube'), ('igdb', '5', 'wii'), ('igdb', '41', 'wii-u'),
  ('igdb', '130', 'switch'), ('igdb', '508', 'switch-2'),
  ('igdb', '33', 'game-boy'), ('igdb', '22', 'gbc'), ('igdb', '24', 'gba'),
  ('igdb', '20', 'nds'), ('igdb', '37', '3ds'), ('igdb', '87', 'virtual-boy'),
  ('igdb', '29', 'genesis'), ('igdb', '64', 'master-system'), ('igdb', '35', 'game-gear'),
  ('igdb', '32', 'saturn'), ('igdb', '23', 'dreamcast'), ('igdb', '78', 'sega-cd'), ('igdb', '30', '32x'),
  ('igdb', '7', 'ps1'), ('igdb', '8', 'ps2'), ('igdb', '9', 'ps3'), ('igdb', '48', 'ps4'),
  ('igdb', '167', 'ps5'), ('igdb', '38', 'psp'), ('igdb', '46', 'ps-vita'),
  ('igdb', '11', 'xbox'), ('igdb', '12', 'xbox-360'), ('igdb', '49', 'xbox-one'), ('igdb', '169', 'xbox-series'),
  ('igdb', '6', 'pc'), ('igdb', '13', 'dos'), ('igdb', '14', 'mac'), ('igdb', '3', 'linux'),
  ('igdb', '52', 'arcade'), ('igdb', '128', 'tg-16'), ('igdb', '80', 'neo-geo'),
  ('igdb', '59', 'atari-2600'), ('igdb', '62', 'jaguar'), ('igdb', '16', 'amiga'),
  ('igdb', '15', 'c64'), ('igdb', '50', '3do'), ('igdb', '68', 'colecovision'),
  ('igdb', '67', 'intellivision'), ('igdb', '34', 'android'), ('igdb', '39', 'ios')
on conflict (source, external_key) do nothing;

-- aliases RHDN (nomes exatos das seções do romhacking.net, da analise do Killer)
insert into public.platform_aliases (source, external_key, platform) values
  ('rhdn', 'Nintendo Entertainment System', 'nes'), ('rhdn', 'Super Nintendo', 'snes'),
  ('rhdn', 'Nintendo 64', 'n64'), ('rhdn', 'Nintendo GameCube', 'gamecube'), ('rhdn', 'Wii', 'wii'),
  ('rhdn', 'Wii U', 'wii-u'), ('rhdn', 'Game Boy', 'game-boy'), ('rhdn', 'Game Boy Advance', 'gba'),
  ('rhdn', 'Nintendo DS', 'nds'), ('rhdn', 'Nintendo 3DS', '3ds'), ('rhdn', 'Virtual Boy', 'virtual-boy'),
  ('rhdn', 'Famicom Disk System', 'fds'), ('rhdn', 'Pokémon mini', 'pokemon-mini'),
  ('rhdn', 'Sega Genesis', 'genesis'), ('rhdn', 'Sega Master System', 'master-system'),
  ('rhdn', 'Sega Game Gear', 'game-gear'), ('rhdn', 'Sega CD', 'sega-cd'), ('rhdn', 'Sega 32X', '32x'),
  ('rhdn', 'Sega Saturn', 'saturn'), ('rhdn', 'Dreamcast', 'dreamcast'), ('rhdn', 'SG-1000/SC-3000', 'sg-1000'),
  ('rhdn', 'PlayStation', 'ps1'), ('rhdn', 'PlayStation 2', 'ps2'), ('rhdn', 'PlayStation 3', 'ps3'),
  ('rhdn', 'PlayStation Portable', 'psp'), ('rhdn', 'Playstation Vita', 'ps-vita'),
  ('rhdn', 'Xbox', 'xbox'), ('rhdn', 'Xbox 360', 'xbox-360'), ('rhdn', 'PC', 'pc'),
  ('rhdn', 'Turbografx-16', 'tg-16'), ('rhdn', 'Turbografx-CD', 'tg-cd'),
  ('rhdn', 'PC Engine SuperGrafx', 'supergrafx'), ('rhdn', 'PC-FX', 'pc-fx'), ('rhdn', 'PC-98', 'pc-98'),
  ('rhdn', 'Neo-Geo CD', 'neo-geo-cd'), ('rhdn', 'Neo-Geo Pocket Color', 'neo-geo-pocket'),
  ('rhdn', 'Atari 2600', 'atari-2600'), ('rhdn', 'Atari 5200', 'atari-5200'),
  ('rhdn', 'Atari 7800', 'atari-7800'), ('rhdn', 'Atari Lynx', 'lynx'), ('rhdn', 'Atari Jaguar', 'jaguar'),
  ('rhdn', 'Arcade', 'arcade'), ('rhdn', 'MSX', 'msx'),
  ('rhdn', '3DO Interactive Multiplayer', '3do'), ('rhdn', 'ColecoVision', 'colecovision'),
  ('rhdn', 'Wonderswan', 'wonderswan'), ('rhdn', 'X68000', 'x68000'),
  ('rhdn', 'Philips CD-i', 'cd-i'), ('rhdn', 'Zeebo', 'zeebo'), ('rhdn', 'Game Gear', 'game-gear')
on conflict (source, external_key) do nothing;

-- aliases MobyGames / ScreenScraper / libretro (nomes usados nos importers)
insert into public.platform_aliases (source, external_key, platform) values
  ('mobygames', 'SNES', 'snes'), ('mobygames', 'NES', 'nes'), ('mobygames', 'Nintendo 64', 'n64'),
  ('mobygames', 'GameCube', 'gamecube'), ('mobygames', 'Wii', 'wii'),
  ('mobygames', 'Game Boy', 'game-boy'), ('mobygames', 'Game Boy Color', 'gbc'),
  ('mobygames', 'Game Boy Advance', 'gba'), ('mobygames', 'Nintendo DS', 'nds'),
  ('mobygames', 'Nintendo 3DS', '3ds'), ('mobygames', 'Genesis', 'genesis'),
  ('mobygames', 'SEGA Master System', 'master-system'), ('mobygames', 'Game Gear', 'game-gear'),
  ('mobygames', 'SEGA CD', 'sega-cd'), ('mobygames', 'SEGA Saturn', 'saturn'),
  ('mobygames', 'Dreamcast', 'dreamcast'), ('mobygames', 'PlayStation', 'ps1'),
  ('mobygames', 'PlayStation 2', 'ps2'), ('mobygames', 'PSP', 'psp'),
  ('mobygames', 'TurboGrafx-16', 'tg-16'), ('mobygames', 'Neo Geo', 'neo-geo'), ('mobygames', 'Arcade', 'arcade'),
  ('libretro', 'Nintendo - Super Nintendo Entertainment System', 'snes'),
  ('libretro', 'Nintendo - Nintendo Entertainment System', 'nes'),
  ('libretro', 'Nintendo - Nintendo 64', 'n64'),
  ('libretro', 'Nintendo - GameCube', 'gamecube'),
  ('libretro', 'Nintendo - Wii', 'wii'),
  ('libretro', 'Nintendo - Game Boy', 'game-boy'),
  ('libretro', 'Nintendo - Game Boy Color', 'gbc'),
  ('libretro', 'Nintendo - Game Boy Advance', 'gba'),
  ('libretro', 'Nintendo - Nintendo DS', 'nds'),
  ('libretro', 'Nintendo - Nintendo 3DS', '3ds'),
  ('libretro', 'Nintendo - Virtual Boy', 'virtual-boy'),
  ('libretro', 'Nintendo - Family Computer Disk System', 'fds'),
  ('libretro', 'Sega - Mega Drive - Genesis', 'genesis'),
  ('libretro', 'Sega - Master System - Mark III', 'master-system'),
  ('libretro', 'Sega - Game Gear', 'game-gear'),
  ('libretro', 'Sega - Mega-CD - Sega CD', 'sega-cd'),
  ('libretro', 'Sega - 32X', '32x'),
  ('libretro', 'Sega - Saturn', 'saturn'),
  ('libretro', 'Sega - Dreamcast', 'dreamcast'),
  ('libretro', 'Sony - PlayStation', 'ps1'),
  ('libretro', 'Sony - PlayStation 2', 'ps2'),
  ('libretro', 'Sony - PlayStation Portable', 'psp'),
  ('libretro', 'NEC - PC Engine - TurboGrafx 16', 'tg-16'),
  ('libretro', 'SNK - Neo Geo', 'neo-geo'),
  ('libretro', 'Bandai - WonderSwan', 'wonderswan'),
  ('libretro', 'Microsoft - MSX', 'msx'),
  ('libretro', 'Atari - 2600', 'atari-2600')
on conflict (source, external_key) do nothing;

/* ── b) relações entre jogos (versões ligadas, NUNCA fundidas) ────────────── */
create table if not exists public.game_relations (
  game_id    uuid not null references public.games (id) on delete cascade,
  related_id uuid not null references public.games (id) on delete cascade,
  -- semântica: game_id É <relation> DE related_id (ps1 é expanded_of do snes)
  relation   text not null check (relation in
    ('remaster_of', 'remake_of', 'port_of', 'expanded_of', 'version_of', 'spinoff_of', 'mod_of')),
  source     text not null default 'igdb',   -- igdb | manual
  primary key (game_id, related_id)
);
create index if not exists game_relations_related_idx on public.game_relations (related_id);
alter table public.game_relations enable row level security;
drop policy if exists "relations: read" on public.game_relations;
create policy "relations: read" on public.game_relations for select using (true);
drop policy if exists "relations: admin write" on public.game_relations;
create policy "relations: admin write" on public.game_relations for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

/* ── c) mídia por (jogo, plataforma, tipo, região, fonte) ─────────────────── */
create table if not exists public.game_media (
  id         uuid primary key default gen_random_uuid(),
  game_id    uuid not null references public.games (id) on delete cascade,
  platform   text,                       -- nome curto canônico ('SNES'); null = geral
  kind       text not null check (kind in
    ('cover', 'boxart', 'box3d', 'back', 'media', 'cart', 'disc', 'logo', 'hero', 'title', 'screenshot')),
  region     text,                       -- usa | japan | europe | brazil | world
  url        text not null,
  source     text not null,              -- igdb | libretro | mobygames | screenscraper | manual
  created_at timestamptz not null default now(),
  unique (game_id, url)
);
create index if not exists game_media_game_idx on public.game_media (game_id, kind);
alter table public.game_media enable row level security;
drop policy if exists "media: read" on public.game_media;
create policy "media: read" on public.game_media for select using (true);
drop policy if exists "media: admin write" on public.game_media;
create policy "media: admin write" on public.game_media for all using (
  exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
);

/* ── d) colunas novas em games ────────────────────────────────────────────── */
alter table public.games
  add column if not exists game_type  text,          -- main | remake | remaster | expanded | port | mod | dlc
  add column if not exists alt_titles text[] not null default '{}',
  add column if not exists series     text,          -- coleção/série do IGDB (franchise já existe)
  add column if not exists relevance  numeric not null default 0;

-- coluna gerada pesquisável: busca cobre título E títulos alternativos
alter table public.games
  add column if not exists alt_search text generated always as (array_to_string(alt_titles, ' · ')) stored;
create index if not exists games_relevance_idx on public.games (relevance desc);
create index if not exists games_alt_search_trgm on public.games using gin (alt_search gin_trgm_ops);

/* ── e) relevância diária (ordenação da busca/ctrl+K) ─────────────────────── */
create or replace function public.compute_game_relevance()
returns void
language sql
security definer
set search_path = public
as $$
  with agg as (
    select g.id,
      (case when g.igdb_id is not null then 40 else 0 end)
    + (case when coalesce(g.game_type, 'main') = 'main' then 30
            when g.game_type in ('remake', 'remaster', 'expanded') then 15
            when g.game_type = 'port' then 10
            else 0 end)
    + (case when g.cover_url is not null then 10 else 0 end)
    + (case when g.description is not null then 5 else 0 end)
    + least(coalesce(t.n, 0) * 3, 60)     -- bibliotecas que têm o jogo
    + least(coalesce(r.n, 0) * 5, 50)     -- zeradas
    + least(coalesce(v.n, 0) * 4, 40)     -- reviews
    + least(coalesce(s.n, 0) * 2, 40)     -- contas sincronizadas
      as rel
    from public.games g
    left join (select game_id, count(*) n from public.game_tracks group by 1) t on t.game_id = g.id
    left join (select game_id, count(*) n from public.game_playthroughs group by 1) r on r.game_id = g.id
    left join (select subject_id, count(*) n from public.reviews where subject_type = 'game' group by 1) v on v.subject_id = g.id
    left join (select game_id, count(distinct user_id) n from public.game_sync_data group by 1) s on s.game_id = g.id
  )
  update public.games g
  set relevance = agg.rel
  from agg
  where agg.id = g.id and g.relevance is distinct from agg.rel;
$$;

revoke execute on function public.compute_game_relevance() from anon, authenticated;

do $$
begin
  perform cron.unschedule('game-relevance')
  where exists (select 1 from cron.job where jobname = 'game-relevance');
  perform cron.schedule('game-relevance', '0 4 * * *', 'select public.compute_game_relevance()');
end;
$$;

-- primeira rodada agora (senão a ordenação só nasceria amanhã)
select public.compute_game_relevance();
