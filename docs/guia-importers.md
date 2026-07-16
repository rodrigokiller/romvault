# Guia dos importers — a "aula" 🎓

> `npm run help` lista tudo. Este guia explica **o que cada um faz, quando usar
> e em que ordem**. Regra de ouro: `--dry` primeiro em qualquer coisa destrutiva.

## O mapa mental (3 famílias)

```
 CATÁLOGO (traz conteúdo)      ARTE (traz imagens)          MANUTENÇÃO (arruma a casa)
 ─────────────────────────    ─────────────────────────    ─────────────────────────
 igdb      → jogos             covers          → IGDB       dedupe   → funde jogos
 rhdn      → hacks/trads/      covers-libretro → box art    fix-entities → limpa &#039;
             tools/docs        screenscraper   → box 3D/    seed-collections → coleções
 pobre     → traduções BR                        verso
 smwc      → hacks de SMW
 dataset   → exemplos curados
```

## Família 1 — Catálogo (o conteúdo)

| Comando | Traz | Fonte |
|---|---|---|
| `--source=igdb --platform=snes --all` | **jogos puros** (sem DLC/mod) | API IGDB, cursor incremental por plataforma |
| `--source=rhdn --file=romhacking.sql.zip` | 8k hacks + 6,5k traduções + 1,7k tools + docs | dump oficial do romhacking.net |
| `--source=pobre` | ~1,4k traduções PT-BR + hacks BR | scrape do romhackers.org |
| `--source=smwc --all` | ~2,7k hacks de Super Mario World | API do SMW Central |

Todos deduplicam sozinhos (id_map): **re-rodar nunca duplica**, só continua.

## Família 2 — Arte (as imagens) — SE COMPLEMENTAM assim:

1. **`--source=covers`** (IGDB): dá a **capa de loja em RETRATO** — a arte
   canônica de cards/pesquisa/página. Roda primeiro. Limite de 200/vez
   (`--limit=500` p/ mais).
2. **`--source=covers-libretro`**: dá a **BOX ART física** (foto da caixa).
   Vai pra `metadata.boxart` (material da vitrine física) e só vira capa
   se o jogo ficou SEM nenhuma no passo 1. Grátis, sem chave.
   `--backfill` preenche a boxart também de quem JÁ tem capa de loja.
3. **`--source=screenscraper`**: o luxo — **box 3D, verso, foto do cartucho**
   (vai pra `metadata.box3d`/`support`; a vitrine usa). Requer conta dev (abaixo).

Ordem recomendada de arte: `covers` → `covers-libretro` → `covers-libretro --backfill` → `screenscraper`.

## Família 3 — Manutenção

- `--source=dedupe --dry` → revisa; sem `--dry` → funde duplicados (re-aponta
  hacks/trads/tracks/cópias/tudo pro jogo que fica).
- `--source=all` → pipeline: dataset → dedupe → covers → libretro numa linha.
- `node scripts/seed-collections.mjs` → recria as coleções curadas.
- `node scripts/fix-entities.mjs` → limpa `&#039;` etc. de imports antigos.

## ScreenScraper — como conseguir as credenciais

Você precisa de **DOIS pares** no `.env` da raiz:

```
SS_USER=seu_login          # sua conta NORMAL (a que você doou €10)
SS_PASSWORD=sua_senha      #   → a doação aumenta SUA cota/threads diários
SS_DEVID=???               # identifica o SOFTWARE (ROMVault)
SS_DEVPASSWORD=???         #   → precisa PEDIR (passos abaixo)
```

**Como pedir o devid** (confirmado no site deles):
1. Logado, abra o fórum, rubrica de API: <https://www.screenscraper.fr/forumsujets.php?frub=12>
2. Crie um tópico **apresentando o software** (pode ser em inglês): nome
   (ROMVault), o que é (catálogo/tracker de jogos e romhacks, uso não
   comercial), e que você quer acesso à API (`jeuRecherche`/`mediaJeu`).
3. A equipe aprova e te passa o `devid` + `devpassword`.
4. Preencheu o `.env` → `npm run import -- --source=screenscraper --inspect`
   pra testar (lista os sistemas). Depois `--platform=snes --limit=20 --dry`.

> A doação de €10 vale pra **sua conta de usuário** (mais requests/threads por
> dia) — o devid é outra coisa: identifica o app e é liberado pelo fórum.

## Import da Steam (biblioteca do usuário — não é catálogo)

Diferente dos outros (que populam o CATÁLOGO), o Steam import traz a
**biblioteca de um usuário** pros tracks dele:

- Onde: **Configurações → Importar da Steam** (dentro do site, logado).
- O que traz: jogos + horas jogadas; cria cópias digitais (loja "Steam") e
  tracks `source='steam'`; **nunca sobrescreve** status marcado à mão.
- Requisitos (uma vez): perfil Steam com "detalhes do jogo" públicos, e:
  ```
  supabase secrets set STEAM_API_KEY=xxx   # grátis: steamcommunity.com/dev/apikey
  supabase functions deploy steam-import --no-verify-jwt
  ```
- Aceita SteamID64 (76561198...) ou vanity URL (o apelido da URL do perfil).
- Melhorias futuras (roadmap): login OpenID direto com a conta Steam (em vez
  de digitar o ID) e importação de conquistas por jogo.

## E o libretro × screenscraper?

Sim, se complementam: **libretro** = rápido, grátis, sem burocracia, só a
frente da caixa. **ScreenScraper** = mais rico (3D/verso/cartucho/manual), mas
com aprovação + cota. Use libretro pra cobrir tudo já, e o ScreenScraper pra
"upar" os jogos importantes com mídia 3D quando a conta dev sair.
