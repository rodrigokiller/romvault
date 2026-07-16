# Vitrine v2 — spec (do texto do Killer, 2026-07-16)

## Conceito
**Vitrine ≠ Library.** A vitrine é uma **apresentação dos jogos que o usuário
TEM** (cópias) — "como se alguém entrasse na sua sala e olhasse seus jogos".
A `/u/x/library` continua como está (tracking: jogando/zerado/abandonado/quero,
inclusive de jogos que ele não tem mais).

## Referência visual
App do **Nintendo Switch Online (SNES)**: grid de capas MUITO adaptativa —
- capa **paisagem** → o card prioriza a LARGURA (sem tarjas em cima/embaixo);
- capa **retrato** → prioriza a altura;
- cards se encaixam uns nos outros com **pouco espaçamento** (masonry),
  arrastável/rolável em todas as direções;
- a estante de madeira **sai** nesse modo (fundo livre pros cards fluírem).

## Estantes (views)
- Padrão: **TODOS** + uma view por **plataforma** em que o usuário tem jogos.
- Usuário pode **criar estantes personalizadas** (agrupar jogos à vontade).
- Cada estante: **ordenação manual** (novos entram no FIM), tema/fundo
  configurável. Não é filtro — é curadoria/apresentação.

## Tema por plataforma
Ao entrar na view do SNES: fundo temático — desenho estilizado do console
**semi-transparente** (canto sup. direito / centro / baixo — Killer vai
desenhar), cores da plataforma.

## Arte (prioridade)
1. **Arte custom do usuário** para o jogo — SEMPRE vence;
2. modo "Caixa": box3d > boxart física > capa de loja;
3. modo "Loja": capa de loja.
Toggle Caixa/Loja fica nas **configurações da estante selecionada**.

## Cópia → Biblioteca (bug + remodelagem)
Adicionar uma **cópia** sem escolher status não mostrava o jogo na library.
Solução (aprovada): **5º status "Na coleção"** (owned) — adicionar cópia
auto-adiciona à biblioteca com esse status quando o jogo ainda não tem track
(nunca sobrescreve os 4 estados existentes).

## Fases de implementação
- **v2.0 (feita nesta rodada)**: página própria `/u/:user/vitrine` (link, não
  botão), grid masonry de proporção natural (sem tarjas), views TODOS +
  por-plataforma automáticas, prioridade de arte (custom>caixa>loja) com
  toggle, tema accent + fundo tipográfico da plataforma, status "Na coleção".
- **v2.1**: estantes personalizadas (CRUD) + ordenação manual drag-and-drop +
  persistência de tema/fundo por estante (schema já criado: shelves/
  shelf_items), upload de arte custom por jogo.
- **v2.2**: desenhos estilizados dos consoles no fundo (assets do Killer),
  fundos custom por estante.

## Perguntas em aberto (pro Killer)
1. Reordenação manual: **arrastar** (desktop) serve? No touch, setas/long-press?
2. A vitrine é **pública** como a library (respeita library_public)? URL
   `/u/x/vitrine` ok?
3. Arte custom por jogo: upload direto (Storage) ou URL colada? Ambos?
