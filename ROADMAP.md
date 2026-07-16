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
