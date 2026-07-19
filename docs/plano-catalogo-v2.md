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

## Análise por fonte: como cada uma modela jogo / plataforma / gênero

Pedido do Killer: "cada plataforma tem seu jeito de gravar gêneros, jogos,
plataformas". O levantamento, fonte a fonte (base: código dos importers + dump
real do RHDN):

| Fonte | Jogo | Plataforma | Gênero | Nosso de→para |
|---|---|---|---|---|
| IGDB | id numérico estável (igdb_id), slug, game_type, parent/remaster/port | id numérico fixo (19=SNES) | lista FIXA de 23 nomes | platform_aliases + genre_aliases (identidade explícita) |
| RHDN (dump) | gamekey + gametitle + japtitle (vira alt_title) | consoleid numérico -> nome por extenso ("Super Nintendo") | 24 com hierarquia "Action > Fighting" (extraídos do dump) | aliases rhdn seedados nas migrations 33/34 |
| PO.B.R.E | página por path; título no h1 "Jogo (Grupo)" | campo "Sistema:" em português ("Mega Drive") | campo "Tipo:" em português, separado por " - " | aliases pobre (melhor esforço; completar ao vivo) |
| SMW Central | id numérico da seção; sempre SMW/SNES | implícita (SNES) | NÃO tem gênero; tem TAGS livres (vão pra romhacks.tags) | não se aplica |
| Steam | appid numérico (external_ids.steam) | sempre PC | não importamos (a loja tem, API não expõe bem) | vínculo por appid > título dentro de PC |
| PSN/Xbox | nome do trophy title / título do histórico | família do console (PS4/PS5, Xbox One/Series) | não expõem | título dentro da plataforma |
| GOG | título do perfil público | sempre PC | não importamos | título dentro de PC |
| MobyGames | game_id próprio; API tem genres/platforms ricos | platform_id próprio (lista em /platforms) | tem, POR PLATAFORMA, não importamos ainda (fase 4) | aliases moby seedados (plataforma) |
| ScreenScraper | jeu id próprio; busca por título | systemeid numérico (resolvido ao vivo) | tem, não importamos | resolução ao vivo via systemesListe |
| libretro | ARQUIVO nomeado padrão No-Intro | pasta por sistema | não tem | aliases libretro (pasta -> canônica) |

Conclusões que viram regra:
1. IGDB é o EIXO: igdb_id é a identidade universal; todo merge/link converge
   pra ele. Jogos sem igdb_id são legítimos (manuais/RHDN-only), mas o painel
   admin (fase 2) os lista como fila de vinculação.
2. Fontes de MATERIAL (rhdn/pobre/smwc) nunca criam plataforma/gênero novos:
   passam pelos aliases; alias desconhecido cai em relatório pra cadastrar
   (nada de "Super Famicom" virando plataforma duplicada de novo).
3. Fontes de TRACKER (steam/psn/xbox/gog/nintendo) nunca definem metadados do
   jogo: só vinculam (id externo > título NA plataforma) ou criam casca com
   plataforma certa pra o IGDB enriquecer depois.
4. Fontes de MÍDIA (libretro/moby/screenscraper) nunca tocam texto: só
   game_media (fase 2), com a plataforma que já conhecem.

## Sincronizadores: regra de vínculo

Vínculo = external_id da fonte (steam appid etc.) OU título dentro da MESMA
plataforma; nunca título global. Erro de vínculo existente se corrige com a
ferramenta de merge/link da fase 2 (mover sync_data/track de um jogo pro outro).
