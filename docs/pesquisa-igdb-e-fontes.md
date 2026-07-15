# Pesquisa — IGDB e fontes de dados de romhacking para o ROMVault

> Compilado em 2026-07-15 (pesquisa verificada online, incl. teste ao vivo da API
> do SMW Central). Serve de base para a análise do Killer sobre: como o IGDB
> rotula romhacks, como filtrar "jogos de verdade", e de onde importar
> hacks/traduções/ferramentas.

## 1. Enum `category` / `game_type` do IGDB (endpoint Game)

Valores numéricos confirmados no schema oficial da API:

| # | Nome | # | Nome |
|---|------|---|------|
| 0 | `main_game` | 8 | `remake` |
| 1 | `dlc_addon` | 9 | `remaster` |
| 2 | `expansion` | 10 | `expanded_game` |
| 3 | `bundle` | 11 | `port` |
| 4 | `standalone_expansion` | 12 | `fork` |
| 5 | `mod` | 13 | `pack` |
| 6 | `episode` | 14 | `update` |
| 7 | `season` | | |

**`category` está DEPRECIADO.** O schema marca o campo `category` como
*"DEPRECATED! Use game_type instead"*. O substituto é **`game_type`** — uma
referência (ID) ao endpoint `/v4/game_types`, cujos IDs espelham o mesmo enum
(0=main_game … 5=mod … 14=update). Em filtros Apicalypse, `game_type` aceita os
mesmos números.

**Romhacks estão no IGDB?** Sim, porém de forma **parcial e inconsistente**.
Não existe tipo "romhack"/"fan translation": quando cadastrados, aparecem como
**`game_type` = 5 (`mod`)**. O IGDB não distingue romhack de mod de PC.

**Vínculo com o jogo-base:**
- **`parent_game`** — *"If a DLC, expansion or part of a bundle, this is the
  main game or bundle"*. Na prática é o campo usado para apontar um mod/romhack
  ao jogo original.
- **`version_parent`** — *"If a version, this is the main game"* (edições, ex.
  "Gold Edition").

⚠️ A cobertura de romhacks no IGDB é rala e `parent_game` nem sempre está
preenchido. O IGDB serve bem como catálogo de jogos comerciais; **não** como
catálogo confiável de romhacks.

## 2. Hack de jogo existente vs. homebrew novo

- **Jogo comercial:** `game_type = 0`, sem `parent_game`/`version_parent`.
- **Hack/romhack/mod:** `game_type = 5`, com `parent_game` (quando bem cadastrado).
- **Homebrew original:** catalogado como jogo normal (`main_game`), sem
  `parent_game`. **Não há flag de homebrew** — indistinguível de comercial só
  pelo tipo; separar homebrew exigiria keywords + curadoria manual.
- `franchises`/`collection` agrupam séries; não diferenciam hack de comercial.

**Filtros recomendados (Apicalypse):**
- Só jogos comerciais por plataforma:
  `where platforms = (X) & game_type = 0 & version_parent = null & parent_game = null;`
- Romhacks à parte: `where game_type = 5;` e usar `parent_game` p/ linkar ao
  jogo-base (nosso modelo: registro em `romhacks` com `game_id`).

> Nota de implementação no ROMVault: o sync usa um filtro intermediário
> (`game_type != (1,3,5,6,7,13,14)`) que mantém remakes/remasters/ports (valem
> como jogos no catálogo retro) e exclui DLC/bundle/mod/episódio/temporada/
> pack/update.

## 3. Fontes de romhacking importáveis

### romhacking.net (RHDN)
- **Status:** read-only desde 01/08/2024. Sem API oficial.
- **Melhor caminho — dump oficial no Internet Archive:**
  <https://archive.org/details/romhacking.net-20240801> — export do **banco SQL**
  + arquivos/imagens, cobrindo **Hacks, Translations, Utilities, Documents,
  Fonts, Homebrew, Abandoned**.
- **Viabilidade: ALTA** (ETL único a partir do SQL dump). A fonte
  cross-plataforma mais rica.

### romhack.ing (RHDI) — sucessor ativo
- Alpha 08/2024, registro aberto 03/2025. Importou hacks e utilitários do RHDN.
- **Sem API/dump oficial** — SPA com backend JSON (reverse-engineering possível
  mas não-oficial).
- **Viabilidade: MÉDIA** (scrape). Útil p/ lançamentos novos pós-2024.

### Cena brasileira
- **"romhacking.com.br": não confirmado que exista** (nenhuma evidência).
- Hubs BR ativos:
  - **PO.B.R.E** — <https://romhackers.org/> — base de traduções por plataforma
    (Console ~971, Portable ~418, Computer ~67, Arcade ~17). Sem API → scrape.
  - **Fórum Unificado de Romhacking e Tradução** — <https://www.romhacking.net.br/>
    — fórum SMF ativo com board de Lançamentos. Sem API → scrape.
- **Viabilidade: BAIXA–MÉDIA** (scrape), mas valor alto p/ público PT-BR.

### Outros
- **SMW Central** — <https://www.smwcentral.net> — **API JSON pública, testada
  ao vivo**: `GET /ajax.php?a=getsectionlist&s=smwhacks` → JSON paginado
  (`total`, `per_page`, `data[]` com id/name/authors/…); detalhe via
  `a=getfile&id=<id>`. **Viabilidade: ALTA.** Escopo: universo Mario/Nintendo.
- **GBAtemp Download Center** — <https://gbatemp.net/download/> (categoria
  Translations). XenForo RM, sem API → scrape. **Viabilidade: MÉDIA.**

## 4. Recomendação prática

**(a) Jogos comerciais (IGDB):** por plataforma, `/v4/games` com
`game_type` (não o `category` depreciado), paginado (máx. 500/req), guardando o
`id` IGDB como chave canônica + slug/name/platforms/first_release_date/cover/
franchise para dedup e séries.

**(b) Romhacks/traduções:** fonte primária = **dump SQL do RHDN** (ETL único);
complementar com **API do SMW Central** e, para PT-BR, scrape de **PO.B.R.E** e
**romhacking.net.br**; **romhack.ing** para o pós-2024. Vincular cada hack ao
jogo-base casando **título normalizado + plataforma** contra o catálogo
(nosso `packages/core/domain/dedupe.ts` já faz essa cascata) e marcando os
ambíguos para revisão manual. Registrar `data_source` + `source_url` (colunas
já criadas na migration `20260714120006_material_source.sql`).

## Fontes

- IGDB API docs: <https://api-docs.igdb.com/>
- Schema IGDB (mirror c/ enums): <https://github.com/DmitryScaletta/igdb-api-types>
- RetroRGB — RHDN read-only: <https://retrorgb.com/rip-romhacking-net-to-go-read-only.html>
- Time Extension — RHDN winding down: <https://www.timeextension.com/news/2024/08/romhacking-net-is-winding-down-after-almost-20-years>
- Wikipedia — ROM hacking: <https://en.wikipedia.org/wiki/ROM_hacking>
- Internet Archive — dump RHDN: <https://archive.org/details/romhacking.net-20240801>
- Anúncio oficial RHDN: <https://www.romhacking.net/forum/index.php?topic=39405.0>
- ArchiveTeam: <https://wiki.archiveteam.org/index.php/Romhacking.net>
- romhack.ing: <https://romhack.ing/> · <https://romhack.ing/help/about/>
- PO.B.R.E: <https://romhackers.org/>
- Fórum Unificado (BR): <https://www.romhacking.net.br/>
- SMW Central + API: <https://www.smwcentral.net/> ·
  `https://www.smwcentral.net/ajax.php?a=getsectionlist&s=smwhacks`
- Wrapper npm da API do SMWC: <https://www.jsdelivr.com/package/npm/smwcentral.net-jsonapi>
- GBAtemp Download Center: <https://gbatemp.net/download/>

**Ressalvas:** (1) "romhacking.com.br" não verificado/possivelmente inexistente;
(2) romhack.ing sem API oficial; (3) cobertura de romhacks no IGDB é irregular
e `parent_game` nem sempre preenchido.
