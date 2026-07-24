# ROMVault — Jobs, crons e o que roda sozinho

> Panorama de tudo que executa em segundo plano. Atualizado em 2026-07-24.
> Os crons vivem no `pg_cron` do Supabase e chamam edge functions via
> `net.http_post` com o header `x-cron-secret`. Confira os agendados com:
> `select jobname, schedule, active from cron.job order by jobname;`

## Como funciona, em uma frase

O `pg_cron` (dentro do Postgres) dispara na hora marcada → faz um POST na edge
function → a function roda com a service role (bypassa RLS) e se identifica pelo
`x-cron-secret`. Nada disso depende de você deixar o PC ligado.

---

## 1) Sincronização das BIBLIOTECAS dos usuários

Cada usuário liga a conta dele; o cron passa em TODAS as contas daquele provedor
e atualiza a biblioteca. Casam por título com o catálogo, criam cópias
(vitrine) + `game_sync_data` + tracks (com horas).

| Job | Edge function | O que traz | Cron? |
|---|---|---|---|
| steam-sync | `steam-import` | jogos + horas (inclui free-to-play) | diário, se agendado |
| gog-sync | `gog-import` | jogos + horas (perfil público) | diário, se agendado |
| psn-sync | `psn-import` | jogos + troféus | diário, se agendado |
| xbox-sync | `xbox-import` | jogos + conquistas | diário, se agendado |
| ra-sync-all | `ra-import` | RetroAchievements | diário, se agendado |
| epic-cron | `epic-import` | jogos + horas (token cifrado) | diário, se `TOKEN_ENC_KEY` |
| — | `nintendo-import` | presença de amigos | **sem cron** (frágil, manual) |

**Atualiza o que já existe?** Sim, mas só os DADOS DO USUÁRIO (horas,
último jogado). O steam-import, quando CRIA um jogo novo, já vincula o IGDB e
grava a data de lançamento. Não altera metadados de jogos que já estavam no
catálogo.

Agendar (uma vez, no SQL Editor):
```sql
select public.setup_import_cron('steam-sync',
  'https://SEU-PROJETO.supabase.co/functions/v1/steam-import',
  'SEU-CRON-SECRET', '{}'::jsonb, '0 7 * * *');   -- 07:00 UTC = 04:00 BRT
```

---

## 2) CATÁLOGO e enriquecimento

| Job | Onde | O que faz | Atualiza existentes? |
|---|---|---|---|
| `igdb-sync` | edge (admin dispara na UI) | cria jogos novos do IGDB por plataforma (cursor) | **NÃO** — `ignoreDuplicates`; só preenche capa faltante |
| `enrich-cron` | `game-sync` action `enrich-batch` | Metacritic + HowLongToBeat de quem falta | preenche o que falta; ~40/dia, priorizando estantes |
| `game-relevance` | SQL puro (cron diário 04:00 UTC) | recalcula a nota de relevância (ordenação das listas) | sim (recalcula tudo) |

Agendar o enrich:
```sql
select public.setup_import_cron('enrich-cron',
  'https://SEU-PROJETO.supabase.co/functions/v1/game-sync',
  'SEU-CRON-SECRET', '{"action":"enrich-batch","limit":40}'::jsonb, '0 8 * * *');
```

### Isto NÃO tem cron — roda só quando VOCÊ chama `npm run import` (local):

- **Hacks, traduções, documentos** → `--source=rhdn` (dump do RHDN),
  `--source=smwc`, `--source=pobre`. **Não há job diário.** Trad nova no RHDN só
  entra quando você roda o import.
- **Carga do catálogo** → `--source=dataset`, `--source=igdb`, `--source=all`.
- **Próximos lançamentos + adiamentos** → `--source=igdb-upcoming` (é o único
  que ATUALIZA `release_date`/`hypes`/`tba` de jogos que já existem).
- **Capas e mídia** → `covers-libretro`, `mobygames`, `screenscraper`.
- **Plataformas** → `platform-wiki`. **Trilhas** → `soundtracks`.

---

## 3) Notificações e manutenção

| Job | Edge/SQL | O que faz | Cron |
|---|---|---|---|
| `admin-digest` | `admin-digest` | e-mail semanal pros admins com a fila de curadoria | semanal |
| `backlog-digest` | `backlog-digest` | avisa o usuário quando o backlog dele ganhou tradução | diário |
| `collection-snapshot` | SQL | snapshot mensal das coleções | mensal (auto) |

---

## Lacunas conhecidas (honestidade)

1. **Jogos já no catálogo NÃO se atualizam.** Se um jogo mudar de data ou for
   adiado no IGDB, o nosso registro fica como estava — o `igdb-sync` ignora
   duplicados. A ÚNICA exceção é o `igdb-upcoming` (CLI), que atualiza os
   não-lançados. Um cron de "refresh" resolveria; ainda não existe.
2. **Hacks/traduções/tools dependem de você rodar o import local.** Não há cron
   puxando o RHDN todo dia.
3. **Metacritic/HLTB é incremental.** São 84 mil jogos; o cron faz ~40/dia
   priorizando estantes. A carga inicial pesada é melhor feita local:
   `npm run import -- --source=enrich --limit=2000` (repetir).

## Ver o estado real (SQL Editor)

```sql
-- o que está agendado
select jobname, schedule, active from cron.job order by jobname;
-- últimas rodadas registradas
select job, finished_at, ok, stats from job_runs order by finished_at desc limit 20;
```
