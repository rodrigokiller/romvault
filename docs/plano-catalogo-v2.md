# Catálogo v2: plano faseado (do analise.txt do Killer, 2026-07-17)

Decisão de topo: **NÃO recomeçamos do zero.** Tudo aqui é aditivo por migration;
o acervo (60k+ jogos, 16k materiais enriquecidos, id_map, dados de usuários) se
mantém. O que estiver errado se corrige com ferramenta (merge/link), não com reset.

## Fase 1 (FEITA, migration 33 + commit desta leva)

- **platforms + platform_aliases**: plataformas canônicas + de→para POR FONTE
  (rhdn "Super Nintendo" → snes; igdb 19 → snes; uma entrada por fonte mesmo
  com nome igual, pra integração ficar auditável). Seed: canônicas + igdb +
  rhdn + mobygames + libretro. games.platforms text[] continua sendo a fonte de
  exibição até a fase 3 (troca gradual, sem big-bang).
- **game_relations**: remaster/remake/port/expanded/versão = jogos SEPARADOS e
  LIGADOS (semântica: game_id É <relation> DE related_id). Alimentada pelo
  game-sync (por jogo, via remasters/remakes/ports/expanded_games/parent do
  IGDB) e futuramente pela ferramenta visual. Página do jogo ganhou a seção
  "Versões e relacionados".
- **game_media**: mídia por (jogo, plataforma, tipo, região, fonte) — capa,
  boxart, box3d, verso, mídia, cart, disc, logo, hero, title, screenshot.
  Estrutura pronta; os importers passam a GRAVAR nela na fase 2.
- **games.game_type** (main/remake/remaster/expanded/port/mod) importado do
  IGDB (sync em massa + por jogo + CLI); badge na busca (ctrl+K, dropdown,
  /search) e no cabeçalho do jogo.
- **games.alt_titles** pesquisável (coluna gerada alt_search + trigram): FF III
  acha o FF VI. Importado do IGDB (alternative_names); RHDN japtitle já entrava
  como alt_title na criação.
- **games.series** (coleção do IGDB; franchise já existia).
- **games.relevance** + `compute_game_relevance()` + pg_cron diário 04:00:
  igdb (+40), main (+30, remake/remaster/expanded +15, port +10), capa (+10),
  descrição (+5), bibliotecas ×3 (teto 60), zeradas ×5 (teto 50), reviews ×4
  (teto 40), contas sincronizadas ×2 (teto 40). Busca ordena por prefixo e
  depois relevância. Views de página: não medimos ainda (fase 4).
- **steam-import platform-aware**: fallback por título só casa jogo com PC nas
  plataformas (o Chrono Trigger de SNES não captura mais o da Steam). gog/psn/
  xbox/nintendo já eram por plataforma|título.
- Selo de origem (data_source + igdb_id) na página do jogo, junto do Reportar.

## Fase 2: mídia por plataforma + ferramenta visual (a próxima)

1. Importers gravam em game_media com a plataforma que já conhecem (libretro:
   pasta; screenscraper: systemeid; moby: platform_id; igdb: cover geral +
   localized covers/artworks/logos por grupo, como o Killer pediu).
   Moby vira mídia própria rotulada (frente/verso/mídia + região), não fallback.
   Libretro guarda REFERÊNCIA das outras regiões (usa/japan/europe) sem baixar
   tudo; o usuário escolhe a região na vitrine dele (config por usuário/jogo).
2. Resolução de exibição da capa: custom_art do usuário > game_media (cover|
   boxart da plataforma da CÓPIA dele) > cover_url geral. Vitrine/Library/
   detail passam a usar o resolvedor.
3. **Ferramenta visual admin (merge + link)** na página do jogo:
   - "Fundir com outro jogo…" (busca no catálogo, escolhe alvo, preview do que
     move: tracks, cópias, materiais, media, sync_data; executa server-side)
   - "Ligar como versão de…" (cria game_relations manual)
   - Botões por fonte de imagem: buscar no libretro / moby / screenscraper /
     IGDB só PRA ESTE jogo + relatório "sem boxart", "sem box3d" no admin.
4. Botão do usuário "sincronizar imagens" (cooldown): global quando o jogo não
   tem nada; individual pra escolha de região/plataforma na vitrine.
5. dedupe-games: guarda de game_type (remaster ≠ main NUNCA funde; sugere
   game_relations no lugar).

## Fase 3: plataformas 100% normalizadas

- Importers resolvem plataforma via platform_aliases (não mais mapas no código);
  mapa no código vira só seed.
- Página /admin de plataformas: cadastrar canônica + aliases (o "de→para" do
  Killer) + ver id/vínculo de cada fonte por plataforma.
- games.platforms migra de text[] pra FK (view de compatibilidade durante a
  troca). Página por plataforma (/platform/snes) com "coisas especiais" por
  plataforma (arte da fita no SNES, arte do CD no PS1...) usando game_media
  kind=cart/disc.

## Fase 4: fontes novas + rating/tempo

- HLTB: edge function com descoberta de token (padrão do ckatzorke/
  howlongtobeat) + fallback IGDB time_to_beat; badge da origem do dado.
- Metacritic: lib chrismichaelps/metacritic como referência; dados
  complementares por plataforma; painel de notas vira igdb + casa + metacritic,
  cada um com badge de origem.
- Age ratings (IGDB age_ratings) no lado direito da página.
- Contador de views de página (alimenta relevance).
- Tabelas normalizadas de series/franchises (+ spin-off of, publishers lista)
  quando formos fazer páginas de série/franquia navegáveis.

## Biblioteca: agrupar versões (opinião dada ao Killer)

Vale a pena como TOGGLE opcional ("Agrupar versões"), nunca padrão: o grupo
(via game_relations) vira um card só com a arte do representante (último jogado
por padrão; configurável mais novo/mais antigo) e um contador "3 versões" que
expande a pilha. Vitrine fica fora (cópias físicas são por release, faz sentido
ver todas). Implementa na fase 2, depois que as relações povoarem.

## Sincronizadores: regra de vínculo

Vínculo = external_id da fonte (steam appid etc.) OU título dentro da MESMA
plataforma; nunca título global. Erro de vínculo existente se corrige com a
ferramenta de merge/link da fase 2 (mover sync_data/track de um jogo pro outro).
