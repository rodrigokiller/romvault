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
