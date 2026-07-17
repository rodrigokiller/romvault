# Edge Functions do ROMVault

## `igdb-sync` — importar jogos do IGDB de dentro do app

Faz o mesmo que `npm run import -- --source=igdb`, mas server-side e disparável
pela UI do painel **/admin** (só admins). Usa a service role (bypassa RLS),
deduplica por `igdb_id`/`slug`, grava `id_map` e o cursor incremental por
plataforma em `sync_state`.

### 1. Segredos (uma vez)

As credenciais da Twitch (a IGDB usa OAuth da Twitch — crie um app em
<https://dev.twitch.tv/console/apps>):

```bash
supabase secrets set TWITCH_CLIENT_ID=xxxx TWITCH_CLIENT_SECRET=yyyy
```

`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SUPABASE_ANON_KEY` já são
injetados automaticamente pelo runtime — não precisa setar.

### 2. Deploy

```bash
supabase functions deploy igdb-sync --no-verify-jwt
```

> **`--no-verify-jwt` é obrigatório.** Sem ele, a plataforma bloqueia o
> **preflight `OPTIONS`** do navegador (que não carrega o token) com 401 e o
> `functions.invoke` falha com **"Failed to send a request to the Edge Function"**.
> A autenticação continua: a própria função lê o JWT do usuário e exige
> `is_admin` — só admins conseguem rodar.

### 3. Uso

No app, entre em **/admin** (precisa ter `is_admin = true` no seu profile),
escolha a plataforma + limite + páginas e clique **Sincronizar**. O cursor é
incremental: rodar de novo continua de onde parou.

> Pré-requisito de admin (SQL Editor):
> ```sql
> update public.profiles set is_admin = true
> where id = (select id from auth.users where email = 'SEU-EMAIL');
> ```

### Alternativa sem deploy

O importador CLI continua valendo e não precisa de Edge Function:

```bash
npm run import -- --source=igdb --platform=snes --all
```

---

## `public-api` — API pública somente-leitura (autenticada por API key)

Serve o catálogo (games/romhacks/translations/documents/tools) para integrações
externas. A chave (`rv_...`) criada em **Configurações** vai no header
`x-api-key`; guardamos só o hash SHA-256.

### Deploy

Sem verificação de JWT (a autenticação é a nossa, por `x-api-key`):

```bash
supabase functions deploy public-api --no-verify-jwt
```

### Uso

```bash
curl "https://<project>.supabase.co/functions/v1/public-api/games?q=metroid&limit=5" \
  -H "x-api-key: rv_xxxxxxxxxxxxxxxx"
```

Rotas: `/games`, `/games/:slug`, `/romhacks?game=`, `/translations?game=`,
`/documents?game=`, `/tools`. Query: `limit` (≤100), `offset`, `q`, `platform`.
A doc navegável fica em **/api** no app.

---

## `steam-import` — importa a biblioteca Steam do usuário logado

Puxa jogos + horas via Steam Web API, casa com o catálogo (por
`external_ids.steam` ou título), cria jogos mínimos (`data_source='steam'`)
quando faltam, e grava `game_tracks` (source `steam`, sem sobrescrever status
manual) + `game_copies` (digital/Steam). Disparado em **Configurações →
Importar da Steam** (SteamID64 ou vanity URL; o perfil precisa ser público).

### Deploy

```bash
supabase secrets set STEAM_API_KEY=xxxx   # gratis: steamcommunity.com/dev/apikey
supabase functions deploy steam-import --no-verify-jwt
```

## ra-import (RetroAchievements)

Importa o progresso de conquistas retrô do usuário: jogos 100% viram
"Terminado", progresso parcial vira "Jogando" (achievements_earned/total nos
tracks). Match por título+plataforma contra o catálogo — NUNCA cria jogo.

```sh
supabase secrets set RA_API_USER=<seu usuário no RA>
supabase secrets set RA_API_KEY=<web API key: retroachievements.org/controlpanel.php>
supabase functions deploy ra-import --no-verify-jwt
```

### ra-import — modo cron (sync automático diário)

Com `CRON_SECRET` setada, a função aceita `x-cron-secret` e sincroniza TODAS
as contas vinculadas (tabela user_accounts). Agendar (SQL Editor):

```sql
select public.setup_ra_cron('https://SEU-PROJETO.supabase.co/functions/v1/ra-import', 'SEGREDO-IGUAL-AO-CRON_SECRET');
```

## backlog-digest ("seu backlog ganhou tradução")

Cruza traduções publicadas nos últimos N dias com os backlogs e cria
notificações (sino do header). Auth: x-cron-secret OU JWT de admin.

```sh
supabase functions deploy backlog-digest --no-verify-jwt
```
```sql
select public.setup_digest_cron('https://SEU-PROJETO.supabase.co/functions/v1/backlog-digest', 'SEGREDO-IGUAL-AO-CRON_SECRET');
```

## game-sync (ferramenta de admin por jogo)

Na página do jogo (admin): re-sincroniza metadados/arte do IGDB (capa/thumb
sempre; resto só se vazio) ou define capa/boxart/box3d por URL.

```sh
supabase functions deploy game-sync --no-verify-jwt   # usa os secrets TWITCH_*
```

## psn-import (PlayStation, API não-oficial)

Usuário informa o username da PSN (perfil público). Autenticação via NPSSO de
uma conta de serviço (expira ~2 meses — renovar quando o sync falhar):
logado na PSN, abra ca.account.sony.com/api/v1/ssocookie e copie o valor.

```sh
supabase secrets set PSN_NPSSO=<64 chars>
supabase functions deploy psn-import --no-verify-jwt
```

Modo cron (todas as contas vinculadas): mesmo x-cron-secret; agende com um
cron.schedule apontando pra função, ou reuse setup_ra_cron trocando a URL.

## backlog-digest por E-MAIL (opcional)

Com RESEND_API_KEY setada, quem ligar "digest por e-mail" nas configurações
recebe o resumo semanal por e-mail (Resend free tier; RESEND_FROM opcional).

```sh
supabase secrets set RESEND_API_KEY=re_...
```

## xbox-import (xbl.io)

Conquistas do Xbox via OpenXBL (key gratuita em xbl.io). Usuário informa o
gamertag. 100% -> Terminado; cria cópias e game_sync_data; modo cron.

```sh
supabase secrets set XBLIO_KEY=<key do xbl.io>
supabase functions deploy xbox-import --no-verify-jwt
```

## gog-import (perfil público, sem key)

Biblioteca + horas pelo endpoint público gog.com/u/<user>/games/stats
(perfil precisa estar público no GOG). Sem segredo; modo cron.

```sh
supabase functions deploy gog-import --no-verify-jwt
```

## game_sync_data (modelo)

Todos os importers gravam o dado BRUTO por (usuário, jogo, provedor) em
game_sync_data — o mesmo jogo em N plataformas nunca conflita; o track
continua sendo o resumo curado (status manual nunca é sobrescrito).
A UI mostra as linhas por conta na página do jogo e no quick view.
