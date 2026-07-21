# ROMVault — Roadmap

> Atualizado em 2026-07-15. Itens em ordem aproximada de prioridade dentro de
> cada bloco. ✅ = feito · 🔨 = em curso · 🧊 = standby decidido · 💡 = ideia.

## Catálogo & imports
- ✅ Importador multi-fonte (`npm run import`): dataset curado, IGDB (jogos
  puros por plataforma, cursor incremental), SMW Central (API), RHDN (dump SQL
  oficial), PO.B.R.E (scrape educado). Logging padronizado (`--verbose`/`--dry`).
- ✅ `data_source` + `source_url` em tudo que é importado; dedupe via `id_map`.
- 🔨 Importar as demais plataformas via IGDB (Killer roda por plataforma).
- 💡 Seções restantes do dump RHDN: **fonts (186), homebrew (178), abandoned (46)**.
- 💡 Fontes extras: fórum romhacking.net.br (scrape), romhack.ing (scrape,
  lançamentos pós-2024), GBAtemp (translations).
- 💡 Sync agendado (cron/edge) das fontes vivas (IGDB, SMWC, PO.B.R.E).

## Downloads / hospedagem (🧊 standby — decisão tomada, implementar depois)
**Fase 1 (feita):** links — `source_url` (página original, crédito à fonte) +
`file_url` (download direto; RHDN usa `/download/<seção>/<id>/`, PO.B.R.E o CDN).
**Fase 2 (aprovada pelo Killer, aguardando o site ir ao ar):**
- Bucket **Cloudflare R2** (10 GB grátis, egress ilimitado grátis — ideal p/
  downloads; patches ≈ 3–8 GB no total).
- Tool `npm run mirror`: baixa `file_url`, sobe pro R2, grava `mirror_url`
  (original vira fallback). Começar pelos mais baixados.
- Backup permanente do RHDN: o zip de 12 GB no Internet Archive contém TODOS os
  arquivos — se o site cair, o espelho nasce dele.
- Migration futura: coluna `mirror_url` nos materiais.

## Tracking de jogos / Biblioteca (🔨 EM CURSO — pedido do Killer 2026-07-15)
Visão: estante pessoal estilo Backloggd/HLTB, MUITO bonita visualmente.
- 🔨 Fundação: tabela `game_tracks` (status playing/finished/abandoned/backlog,
  plataforma, horas, conquistas, notas), RLS (privacidade por perfil),
  botão de tracking no GameDetail, página `/u/:username/library` v1 (estante
  de capas + abas por status + contadores).
- 💡 Estante temática por plataforma: mudar de plataforma muda o visual
  (PS5 dark-blue sleek, Nintendo red-white, Steam dark). Temas personalizáveis.
- 💡 Animações ao reordenar/filtrar (view transitions / FLIP).
- 💡 Import de bibliotecas externas: **Steam** (API pública com key — horas +
  conquistas), GOG, EA, Battle.net, PSN/Xbox (APIs não-oficiais — avaliar).
  Guardar `source` no track (manual/steam/gog...) desde já (campo criado).
- 💡 Perfis públicos/privados (flag `library_public` criada desde já) e,
  futuramente, sistema de amizades (tabela `friendships` polimórfica simples).
- 💡 Estatísticas do perfil: total de horas, % finalizados, jogos por plataforma.

## Trilhas sonoras (💡 pedido do Killer 2026-07-21)
Álbuns lançados dos jogos (OST) ligados ao registro do jogo — "nosso banco vai
ter tudo". Fontes candidatas a avaliar:
- **MusicBrainz** (API pública, sem chave, tem release-group de OST de jogo e
  relação com a obra) — provavelmente a melhor base canônica.
- **VGMdb** (o acervo mais completo de OST de jogo; API não-oficial/scrape).
- **IGDB** não cobre OST; Discogs tem, mas casar jogo↔álbum é manual.
Escopo mínimo: tabela `game_soundtracks` (game_id, título do álbum, ano, selo,
nº de faixas, capa, link externo) + aba na página do jogo. Faixas depois.

## Sync de contas — situação real de cada loja (apurado 2026-07-21)
- ✅ **Steam / GOG / PSN / Xbox**: identificador público → cron diário.
  Steam já pede `include_played_free_games=1` (jogo grátis NÃO é filtrado).
- ✅ **Epic**: fluxo do launcher (authorizationCode) → biblioteca + horas.
- 🧊 **EA**: sem caminho para um site. Nem o Playnite tem plugin de EA; a
  biblioteca do EA App vive em arquivo local da máquina.
- 🧊 **Ubisoft**: idem — o plugin do Playnite lê o *product cache local*
  (`Uplay.GetLocalProductCache()`), não uma API web.
- 💡 **Battle.net**: a lista de jogos comprados só sai de uma **sessão de
  navegador logada** (o Playnite abre um webview e usa os cookies) — inviável
  pedir isso a um usuário de site. O que É viável: OAuth OFICIAL da Blizzard
  (develop.battle.net) pra **dados por jogo** (personagens de WoW, perfil de
  D3/SC2/OW). Entra como "sincronizar dados de jogo", não biblioteca.
- 💡 **Riot**: API oficial + RSO. Não há biblioteca (jogos são grátis), mas há
  **histórico de partidas/tempo** de LoL/TFT/Valorant — e isso conta, porque o
  ROMVault rastreia TEMPO JOGADO, não só posse. Chave de produção precisa de
  aprovação da Riot (a de dev expira em 24h).

## App / UX
- 💡 Badge visual "importado de X" nos detalhes (data_source já existe).
- 💡 Filtro/facet por fonte nas listas.
- 💡 Tema claro (tokens preparados; fazer com o Killer testando contraste).
- 💡 OpenGraph por rota (precisa prerender/SSR).
- 💡 Dashboard de analytics (downloads, uso de API keys).
- 💡 Notificações (novos hacks de jogos favoritados).

## Infra
- ✅ Edge Functions: igdb-sync (admin) + public-api (x-api-key). Deploy com
  `--no-verify-jwt`.
- 💡 Rate-limit na public-api; caching CDN.
- 💡 **Storage próprio pra uploads de usuário** (arte custom da vitrine,
  avatares): fora do Supabase Storage — avaliar Cloudflare R2 (S3-compatível,
  egress grátis) ou Backblaze B2. Por enquanto arte custom é só URL colada;
  o botão "Upload (em breve)" na vitrine é molde não-funcional até isso sair.
