# Checklist de testes guiado 🧪

> Roteiro clicável, feature por feature. Marque ✅/❌ e anote o que estranhar.
> URLs relativas ao `npm run dev` (localhost:5173). Atualizado a cada lote.

## Catálogo & navegação
- [ ] `/games` — padrão "modo loja": ordenado por lançamento, SEM jogos futuros
- [ ] `/games` — "Mais filtros" → Em desenvolvimento mostra os 2027 (chip âmbar c/ ícone relógio)
- [ ] `/games` — chips de década (90s) preenchem de/até; URL reflete filtros (F5 mantém)
- [ ] `/games` — barra A–Z filtra; paginação numerada funciona
- [ ] Header: links Traduções / Romhacks / Ferramentas / Docs abrem as listas com filtros
- [ ] `/translations` — filtrar por idioma "Portug…" lista as PT-BR
- [ ] Busca do topo: dropdown com resultados; Enter abre `/search` com abas por tipo

## Card de jogo (grid)
- [ ] Hover: aparecem ❤️ / 📚 (menu de status + "Tenho este jogo") / 👁️ quick-view
- [ ] Menu do 📚 NÃO é cortado pelo card
- [ ] Selinho `BR` (accent, legível) só em jogos com tradução no idioma da UI
- [ ] Capas revelam com blur-up suave

## Página do jogo (`/games/<slug>`)
- [ ] Capa INTEIRA sem corte (SNES alta, N64 paisagem); hero desfocado atrás
- [ ] Bloco "Tradução de fãs: BR EN…" (e "Idiomas oficiais" após langs-igdb)
- [ ] Destaques (top hacks/trads do jogo) acima das abas
- [ ] Abas Traduções/Romhacks/Docs com contadores e cards reais
- [ ] Minhas cópias: adicionar c/ data+preço; aviso de duplicata na 2ª
- [ ] Zeradas: registrar com data dia/mês/ano + estrelas+mini-review
- [ ] Avaliações no fim; Favoritar/Compartilhar funcionam

## Biblioteca (`/u/<você>/library`)
- [ ] Abas por status + contadores; chips de plataforma TEMATIZAM (SNES roxo…)
- [ ] Chips Recentes/A–Z/Por plataforma REORDENAM COM ANIMAÇÃO (FLIP)
- [ ] "Modo vitrine": PRATELEIRAS DE MADEIRA + caixinhas com lombada + tilt 3D
- [ ] Vitrine: toggle "Arte: Caixa/Loja" alterna as artes
- [ ] Vitrine: chips de plataforma VISÍVEIS (dá pra trocar tema lá dentro)
- [ ] Stats: valor da coleção (após preço nas cópias) · meta anual c/ barra
- [ ] Adicionar vários (busca+checkboxes) · Exportar baixa JSON

## Perfil & social
- [ ] `/u/<você>` — barra de backlog, timeline "Zeradas por ano" (anos são links)
- [ ] `/u/<você>/year/2026` — Wrapped: stats, barras mensais, parede de capas, share
- [ ] `/users` — grid de perfis; Seguir em perfil alheio; feed "zeradas de quem sigo"
- [ ] `/collections` — 4 coleções; detalhe com mosaico de capas

## Admin (`/admin`)
- [ ] Contador de arte (X sem capa · Y sem boxart · Z com box3D)
- [ ] Sync IGDB por plataforma (incl. switch2) roda e reporta
- [ ] Deletar itens por tabela

## Configurações
- [ ] API keys: criar (aparece 1x), copiar, revogar; `/api` documenta
- [ ] Importar da Steam (após deploy + STEAM_API_KEY)

## CLI (terminal)
- [ ] `npm run help` lista tudo
- [ ] `--source=dedupe --dry` → sem duplicados novos após rodar o real
- [ ] `--source=purge-mods --dry` → lista hacks-como-jogos; real remove
- [ ] `--source=covers-libretro` sobe boxart SEM "Bad Request"
- [ ] `--source=langs-igdb` preenche "Idiomas oficiais" na página
