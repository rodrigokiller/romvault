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
supabase functions deploy igdb-sync
```

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
