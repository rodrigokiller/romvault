# ROMVault — Design

Estética **terminal / dev retro**: fundo escuro, tudo quadrado, dados em
monoespaçada e texto de leitura em Inter. Nada de shadcn genérico, nada de
cantos arredondados.

## Tokens

Fonte da verdade: `apps/web/src/styles/tokens.css`. Dark-only por ora, mas
estruturado para um tema claro futuro via `data-theme`.

### Cores

```
--bg:#0b0e10; --panel:#10151a; --panel-2:#141b1f;
--line:#1c262c; --line-bright:#2c3d45;
--ink:#d6e2dc; --ink-bright:#eaf3ee; --muted:#7f948c;
--accent:#34e2a0; --accent-dim:rgba(52,226,160,.12);
--amber:#ffb454; --red:#ff6b6b; --blue:#7db8ff;
```

- **`--bg`** é o canvas; **`--panel` / `--panel-2`** são as superfícies (cards,
  inputs). Bordas com `--line` (sutil) e `--line-bright` (contorno ativo/hover).
- **`--accent`** (verde-menta) é a cor de marca: kickers, foco, links, CTA.

### Categorias de material (cor semântica)

| Material | Cor | Badge |
| --- | --- | --- |
| Romhack | `--accent` | `.badge-romhack` |
| Tradução | `--blue` | `.badge-translation` |
| Documento | `--amber` | `.badge-doc` |
| Ferramenta | `--red` | `.badge-tool` |

### Tipografia

```
--mono:"JetBrains Mono","Cascadia Code",ui-monospace,monospace;
--sans:"Inter Variable","Inter","Segoe UI",system-ui,sans-serif;
```

- **Mono** para dados, rótulos, badges, kickers, números (tabular).
- **Inter** para leitura: medida ~74ch, `line-height` 1.65.
- **Kicker**: rótulo mono, UPPERCASE, tracking largo, em `--accent`
  (classe `.kicker`, ex.: `// em alta esta semana`).
- Fontes carregadas via `@fontsource-variable/inter` e `@fontsource/jetbrains-mono`
  (a família `Inter Variable` lidera o stack `--sans` para de fato aplicar).

### Espaçamento, raio, layout

```
--s1..--s8  : escala base 4px (4,8,12,16,24,32,48,64)
--radius:0  : TUDO QUADRADO — sem exceção
--header-h:60px; --content-max:1180px
--z-*       : dropdown/sticky/backdrop/modal/toast/tooltip
```

## Princípios

1. **Quadrado.** `border-radius: 0` em cards, botões, inputs, badges, dialogs.
   Cantos arredondados são proibidos.
2. **Terminal, sutil.** Scanlines + vinheta MUITO leves no `body`
   (`pointer-events:none`, nunca interceptam clique).
3. **Mono para dados, Inter para prosa.** Números são tabular-nums.
4. **Categorias por cor.** Use os badges coloridos por tipo de material.
5. **Acessibilidade AA.** Foco visível por teclado (`:focus-visible` com anel
   accent), contraste adequado, `aria-*` nos controles, `prefers-reduced-motion`
   respeitado.
6. **Primitivos próprios.** `components/ui/` (Button, Card, Badge, Input, Select,
   Field, Dialog, Tabs, Toast, feedback) — sem biblioteca de componentes.

## Componentes-chave

- **Header** (`components/Header.tsx`): reutilizável, em todas as páginas.
  Esquerda: marca + Início/Explorar. Centro: busca grande. Direita: idioma +
  configurações + perfil/entrar-sair.
- **Layout** (`components/Layout.tsx`): header + `<Outlet/>` + rodapé, e o banner
  de "Configuração pendente" quando falta env.
- **Cards** (`.tile` em `pages.css`): thumb 16:10, título, meta mono, badges.

## Um tema claro no futuro

Preencher o bloco comentado `:root[data-theme='light']` em `tokens.css` e trocar
o atributo `data-theme` no `<html>`. Os componentes já leem apenas variáveis.
