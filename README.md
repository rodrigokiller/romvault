# ROMVault

Um **hub de romhacking** — pense num romhacking.net moderno. Catálogo de
**jogos** com **romhacks**, **traduções**, **documentos** e **ferramentas**
pendurados no jogo de origem, mais **artigos** editoriais. Interface escura,
quadrada, com estética de terminal.

> Estado atual: **alicerce (scaffold)**. Buildar limpo e rodar mostrando a casca
> (header + home + lista de jogos). As páginas de detalhe são placeholders com o
> design correto; features completas vêm nos próximos milestones.

---

## Stack

Monorepo com **npm workspaces**.

| Camada | Tecnologias |
| --- | --- |
| `packages/core` | TypeScript puro. Factory tipada do Supabase, `Database` types (à mão), domínio testável (`slug`, `dedupe`) com **Vitest**. |
| `apps/web` | **React 18** + **Vite 5** + **TypeScript strict** + **react-router-dom 6** + **@tanstack/react-query 5** + **@supabase/supabase-js 2** + **react-hook-form + zod** + **i18next / react-i18next** + **lucide-react** + **date-fns**. |
| Estilo | **CSS puro com design tokens** (sem Tailwind, sem shadcn). Tema terminal, tudo quadrado. |
| Backend | **Supabase** (Postgres + Auth + RLS). Migrations idempotentes em `supabase/migrations`. |
| Deploy | **Vercel** (`vercel.json`). |

## Estrutura

```
romvault/
├── package.json            # workspaces + scripts orquestradores (dev/build/lint/typecheck/db:*)
├── vercel.json             # build + SPA rewrite + cache de /assets
├── .env.example            # VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY
├── packages/core/          # @romvault/core
│   └── src/
│       ├── client.ts           # createRomvaultClient({url,anonKey})
│       ├── database.types.ts   # tipos à mão (regen: npm run db:types)
│       └── domain/             # slug.ts, dedupe.ts + domain.test.ts (vitest)
├── apps/web/               # @romvault/web
│   └── src/
│       ├── App.tsx             # pilha de providers + rotas
│       ├── styles/             # tokens.css + global.css
│       ├── components/         # Header, Layout, Logo, ui/* (primitivos quadrados)
│       ├── i18n/               # config + pt-BR.json + en.json
│       ├── hooks/              # useGames (padrão react-query)
│       ├── auth/               # AuthProvider + guards
│       └── pages/              # Home, Games, GameDetail, materials, Login, ...
└── supabase/
    ├── config.toml
    └── migrations/         # <ts>_init.sql + <ts>_rls.sql (idempotentes)
```

## Como rodar

Requer **Node >= 20**.

```bash
npm install          # instala todos os workspaces
npm run dev          # sobe o Vite em http://localhost:5173
```

O app **roda sem Supabase**: mostra a casca completa e um aviso de "Configuração
pendente"; as áreas com dados aparecem vazias (estado vazio elegante).

Outros scripts:

```bash
npm run build        # core (typecheck) + web (tsc + vite build)
npm run typecheck    # tsc --noEmit em todos os workspaces
npm run test         # vitest (domínio do core)
npm run lint         # eslint no web
npm run preview      # serve o build de produção
```

## Configurar o Supabase

1. Crie um projeto em [supabase.com](https://supabase.com).
2. Copie `.env.example` para `apps/web/.env` e preencha:
   ```
   VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co
   VITE_SUPABASE_ANON_KEY=sua-anon-key
   ```
3. Aplique o schema (CLI do Supabase):
   ```bash
   npm run db:login
   npm run db:link      # informe o project-ref
   npm run db:push      # aplica migrations/*.sql
   npm run db:types     # regenera packages/core/src/database.types.ts
   ```
4. Reinicie o `npm run dev`.

Na **Vercel**, defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em
_Settings → Environment Variables_ (o Vite as lê no build) e faça deploy.

## Modelo de dados (resumo)

`profiles`, `games` (entidade central), `romhacks`, `translations`,
`documents`, `tools`, `articles`, `reviews` (polimórfica), `favorites`,
`download_events`, `api_keys` (hash), `sync_state`, `id_map`. RLS: conteúdo
público na leitura; escrita só do dono; delete só admin. Detalhes em
`supabase/migrations`.

## Licença

Privado / em desenvolvimento.
