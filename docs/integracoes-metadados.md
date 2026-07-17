# ROMVault: mapa de integrações, metadados e tabelas

O que cada sistema traz, pra onde vai, e como é deduplicado. Atualizado em 2026-07-17.

## 1. Bancos de METADADOS de jogos (só leitura; nenhum é tracker)

| Fonte | Como | O que traz | Grava em | Dedupe |
|---|---|---|---|---|
| IGDB (via Twitch OAuth) | CLI `--source=igdb`, edge `igdb-sync` (cron), edge `game-sync` (por jogo, admin) | titulo, slug, capa/thumb, screenshots, descricao, data de lancamento, plataformas, generos, franquia, dev, temas (+18 via Erotic), releases POR plataforma, titulos alternativos, notas (criticos agregados + usuarios) | `games` (colunas proprias; releases/alt_titles/scores em `games.metadata`) | `igdb_id` unico + `id_map` (source=igdb) + cursor em `sync_state` |
| libretro-thumbnails | CLI `--source=covers-libretro` | box art 2D real por plataforma | `games.metadata.boxart` | matching por nome normalizado |
| MobyGames | CLI `--source=mobygames` | scans fisicos: frente/verso/midia | `games.metadata.moby.{front,back,media}` (+`moby_miss` pra nao re-tentar) | matching titulo+plataforma |
| ScreenScraper | CLI `--source=screenscraper` | box 3D, verso, manual | `games.metadata.{box3d,...}` | idem |
| HowLongToBeat | SEM API oficial; hoje so via dataset curado | tempos de conclusao | `games.completion_times` (main_story/main_extras/completionist/source) | manual |

## 2. Fontes de MATERIAIS da cena (hacks/traducoes/docs/tools)

| Fonte | Como | O que traz | Grava em | Dedupe |
|---|---|---|---|---|
| romhacking.net (dump SQL do Archive) | CLI `--source=rhdn --file=...` (+ `--enrich` p/ downloads/videos; `--enrich --images=` p/ screenshots via zip de 12,5 GB) | titulo, descricao, versao, categoria, idioma, downloads, data, file_url (respeita `nofile`), source_url, video_url (YouTube), screenshots (tscreen/hackimages/transimage) | `romhacks`, `translations`, `tools`, `documents` (+ cria `games` base c/ dados do dump) | `id_map` (source=romhacking.net, entity=hack/translation/utility/document, external_id=chave do dump) |
| PO.B.R.E (romhackers.org) | CLI `--source=pobre` (+ `--enrich`) | traducoes PT-BR: titulo, grupo, versao, progresso, patch_type, file_url (CDN deles), screenshots (img.romhackers.org) | `translations`, `romhacks`, `tools`, `documents` | `id_map` (external_id=path do site) |
| SMW Central | CLI `--source=smwc` (+ `--enrich`) | hacks de SMW: titulo, dificuldade, exits, tags, autores, rating, download real (dl.smwcentral.net), screenshots (API `images`) | `romhacks` (game_id=Super Mario World) | `id_map` (source=smwcentral) |

## 3. Contas do USUARIO (tracker; todas SOMENTE LEITURA)

Nenhum provedor aceita escrita (não dá pra "marcar como zerado" de volta na Steam/PSN/Xbox).
O analogo do trakt pra jogos NÃO existe entre os integrados; a API pública do ROMVault
(`public-api`, keys em /settings) é o que oferecemos pra terceiros lerem NOSSOS dados.

| Provedor | Edge function | O que traz | Grava em |
|---|---|---|---|
| Steam (API key + OpenID login) | `steam-import` | biblioteca inteira + horas | `game_sync_data` (provider=steam) + `game_tracks` novos como **owned** + horas nos tracks source=steam |
| RetroAchievements | `ra-import` | jogos com conquistas, earned/total | `game_sync_data` + tracks (100%=finished, senao owned) |
| PSN (NPSSO service account) | `psn-import` | trophy titles, progresso | idem (provider=psn) |
| Xbox (xbl.io) | `xbox-import` | historico + achievements | idem (provider=xbox) |
| GOG (perfil publico) | `gog-import` | jogos + horas | idem (provider=gog); CDN as vezes bloqueia datacenter (403) |
| Nintendo BETA (nxapi session) | `nintendo-import` | presenca (jogando agora) acumulada | idem (provider=nintendo); tracks como playing |

Regras comuns: auth ANTES de trabalho caro; dedupe de tracks por game_id no lote;
erros de escrita nunca engolidos; cron via `x-cron-secret`; rollup de horas por trigger
(`game_sync_data` -> `game_tracks.hours_played` de tracks nao-manuais); `job_runs` loga crons.

## 4. Derivados internos

| Peça | De onde | Pra que |
|---|---|---|
| `trending_week(days,lim)` RPC | `download_events` | "Em alta na semana" (Home + /scene) |
| `scene_top_patches` RPC | `game_playthroughs` com patch | ranking all-time da /scene |
| `patch_usage` RPC | idem | "N zeraram com este patch" na pagina do material |
| `game_community_stats(gid)` RPC | `game_tracks` + `reviews` | tem/jogando/zeraram + nota da casa na pagina do jogo |
| `collection_snapshots` + pg_cron mensal | `game_tracks`/`game_copies` | grafico "Crescimento da coleção" no /stats do usuario |
| heatmap | zeradas (peso 3) + `last_played` dos syncs + copias adquiridas | atividade por dia; clique abre o modal do dia |
