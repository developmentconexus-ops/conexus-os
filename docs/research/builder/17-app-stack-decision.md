# 17. The app stack the Builder builds on, the screen-to-server contract, design rules, and `conexus_check`

**Date**: 2026-09-28. **Branch read**: `feat/builder-own-harness` at `dd6103cb` in
a branch worktree (WT below). Read-only study, plus a throwaway probe app built in
the scratchpad. It supersedes study 15's Decision B (keep the stack) and revises its Decision A
(shell check now, tool later) at the operator's direction.

Path keys: `SP` is this session's scratchpad
(not kept).
`PROBE` is `SP/stack-proto` (the probe app). `ASK` is `SP/askills`, a shallow clone of
github.com/anthropics/skills at `3337550` (2026-09-24). `SHADCN` is `SP/shadcn`, a sparse clone of
github.com/shadcn-ui/ui at `db2db46` (2026-09-28), MIT (`SHADCN/LICENSE.md:1-3`). `HA` is
`docs/research/builder`. `SPEC` is
`docs/tasks/specs/0002-builder-own-harness/index.md`.

Marks: **[measured]** means I ran it in the probe. **[read]** means I read it in code or docs.
**[unproven]** means nobody has run it yet in the real E2B template or the Hub.

## Resumo para o Leandro

- A base continua React 19 + Vite + TypeScript. TanStack Router e Query rodam em cima do React.
  O que muda é o que vem instalado junto. Quase tudo já é o que o próprio Hub usa.
- Rotas: TanStack Router com as rotas escritas num arquivo só, como o Hub faz.
- Dados do servidor: TanStack Query, chamando um cliente tipado que a plataforma gera.
- Componentes: shadcn/ui sobre Base UI, com Tailwind 4 e ícones lucide. Testei no Chromium com a
  política de segurança da Prévia. O Base UI roda sem nenhum erro. O Radix gera um erro ao abrir um
  diálogo, porque injeta estilo na página, e a Prévia bloqueia isso. Minha recomendação é Base UI.
- Gráficos: Recharts, pelo `chart.tsx` do shadcn. O original é bloqueado pela mesma política, então
  vai no starter uma versão corrigida.
- Formulários: react-hook-form + zod. As regras de cada campo vêm do próprio `manifest.json`. Tabelas:
  TanStack Table.
- Contrato tela-servidor: o `manifest.json` já é o contrato, com um JSON Schema por operação. A
  plataforma gera dele os tipos e o cliente. Não recomendo gerar um OpenAPI agora, porque ninguém
  leria o arquivo. Ele entra quando outro sistema precisar chamar o app.
- O `tsc` entra no check. Sem ele o contrato não vale nada, porque o Vite apaga os tipos sem
  conferir. Provei isso: um erro de tipo que o Vite deixou passar, o `tsc` pegou.
- O check vira ferramenta nativa agora, a `conexus_check`, e o `check.sh` sai. Esperar não tem mais
  motivo: a troca de pilha já obriga a reescrever o check, e a ferramenta custa pouco a mais. A
  aceitação e a Prévia rodam o mesmo código.
- Custo na plataforma: imagem E2B nova, 2 constantes, 1 migração, um ajuste para os links diretos
  funcionarem na Prévia (hoje dão 404, testei) e starter novo. O app carrega uns 280 KB em vez de 60 KB.
- Regras de design: uma skill `conexus-app-ui`, com trechos da `frontend-design` da Anthropic
  (Apache 2.0). Para app interno vale o contrário do que ela prega: todo app segue o mesmo sistema
  visual, sem estética nova a cada vez.
- Decisões suas: (1) Base UI ou Radix; (2) react-hook-form ou TanStack Form; (3) um erro de tipo
  barra a aceitação (recomendo que sim) e o teste de abertura só avisa; (4) um visual Conexus neutro
  para todos os apps; (5) o eval da Q4 roda depois da pilha nova.

---

## 1. What was read and run

- Study 15 (`HA/15-app-stack-and-check.md`), study 14 (`HA/14-coding-agent-prompt-structure.md`
  sections 7-8), `SPEC` AC-1, AC-6, AC-10, AC-14, AC-27 and *Tool contract* (`SPEC:37-146, 204-219`).
- Hub web: root `WT/package.json` dependencies and `WT/apps/web/{AGENTS.md,vite.config.mjs,src/app/router.tsx}`.
  `@mastra/playground-ui` 55.0.0 dependencies (`WT/node_modules/@mastra/playground-ui/package.json`).
- App platform: `WT/apps/hub/compiler-template/*`, `WT/scripts/builder-e2b-template.mjs`,
  `WT/apps/hub/src/builder/{application-starter,application-artifact-runtime,run-runtime}.ts`,
  `WT/apps/hub/src/registry/application-artifact-store.ts`, `WT/apps/hub/migrations/0014_agent_user_template.sql`,
  `WT/apps/hub/src/mar/preview-routes.ts`, `WT/builder-skills/conexus-server/SKILL.md`,
  `WT/apps/hub/src/builder/harness/{modes,tools,controller}.ts`,
  `WT/apps/web/src/features/builder/construir/tool-sentences.ts`.
- Mastra: `createTool` execution context (`WT/node_modules/@mastra/core/dist/docs/references/reference-tools-create-tool.md:36-88`;
  `WT/node_modules/@mastra/core/dist/tools/types.d.ts:520-529`, `context.workspace` with `.sandbox`).
- Anthropic: `ASK/skills/frontend-design/SKILL.md` (9,390 bytes, Apache 2.0 in
  `ASK/skills/frontend-design/LICENSE.txt`), `ASK/skills/web-artifacts-builder/SKILL.md`. Claude
  Design: [Introducing Claude Design](https://www.anthropic.com/news/claude-design-anthropic-labs) and
  [Set up your design system in Claude Design](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design).
- shadcn: `SHADCN/apps/v4/registry/bases/{base,radix}/ui/*.tsx`, `bases/README.md`,
  `new-york-v4/examples/data-table-demo.tsx`, `SHADCN/apps/v4/package.json`.
- Probe: `PROBE/package.json` pins the candidate stack. `PROBE/app/src/main.tsx` is a two-route
  dashboard (chart, table, dialog form, generated-style client). `PROBE/csp-probe.mjs` serves a build
  with the Preview's exact CSP and drives Playwright's Chromium.

## 2. The stack

### 2.1 What stays

React stays the base framework. TanStack Router and Query are libraries for React (or Solid). They do
not replace it. Vite 8.2.2 stays the bundler, TypeScript 6.0.2 the language, and the pinned compiler
in the E2B image stays the only source of packages (`compiler-template/package.json:9-16`). The server
half under `conexus/` does not change: handlers still import only `conexus/` and `node:`
(`application-server-build.ts:57-72`).

### 2.2 The picks

| Concern | Pick (pinned) | License | Hub web today | Alternative and trade-off |
|---|---|---|---|---|
| Base | React 19.2.8, react-dom, Vite 8.2.2, TypeScript 6.0.2 | MIT, Apache-2.0 | same (`WT/package.json`) | none |
| Vite plugins | `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3 | MIT | same (`apps/web/vite.config.mjs:1-7`) | none |
| Routing | `@tanstack/react-router` 1.170.32, **code-based routes** in one `app/src/router.tsx` | MIT | same version, code routes (`apps/web/src/app/router.tsx:1-47`) | File-based routes. Needs `@tanstack/router-plugin` and a generated `routeTree.gen.ts` that must exist before `tsc`, plus path strings the plugin rewrites. For apps of a handful of screens the one explicit file is easier for the model to read and edit. Revisit past about 10 screens |
| Server state | `@tanstack/react-query` 5.102.8 over the generated client (section 3) | MIT | same | Plain `useEffect` fetches, which is what apps do now. Query gives cache, loading and error states, and invalidation after a write for free |
| Components | **shadcn/ui source on Base UI** (`@base-ui/react` 1.8.0), copied into the starter, with `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0 | MIT (shadcn source, Base UI), Apache-2.0 (cva) | Base UI through `@mastra/playground-ui` (`playground-ui/package.json` deps `@base-ui/react ^1.7.0`); cva, clsx and tailwind-merge installed | shadcn on Radix (`radix-ui` 1.6.7). Models have seen more `asChild` code. But Radix's scroll lock injects a `<style>` element that the Preview CSP blocks (section 2.3). Base UI has `CSPProvider disableStyleElements` for exactly this case (`@base-ui/react/csp-provider/CSPProvider.d.ts`) |
| Styling | Tailwind CSS 4.3.3 with a token sheet in `app/src/styles.css` (`@theme`) | MIT | same | Plain CSS. Tailwind is what shadcn source assumes |
| Charts | **Recharts 3.10.1** through a CSP-safe `chart.tsx` (shadcn's API, colors set on the container's `style` instead of an inline `<style>`) | MIT | same version via playground-ui | ECharts (Apache-2.0). More chart types (heatmap, sankey, large data on canvas), a bigger bundle, and no shadcn wrapper. Take it only when a dashboard case needs a chart Recharts lacks |
| Tables | `@tanstack/react-table` 9.2.4 | MIT | not used | v8.21.3, the version models know. shadcn's own data-table demo is already on v9 (`useTable`, `tableFeatures`; `SHADCN/apps/v4/registry/new-york-v4/examples/data-table-demo.tsx:4-22,200`). I got v9 wrong on my first try in the probe, and `tsc` caught it. So v9 needs a worked example in the skill (section 5) |
| Forms | `react-hook-form` 7.89.0 + `@hookform/resolvers` 5.9.1 + `zod` 4.6.5, with each form's schema imported from the generated client | MIT | zod 4.6.5 | TanStack Form 1.33.5 (MIT). Same family as Router and Query and takes Standard Schema, but younger and less present in what models have seen. shadcn's `field.tsx` works with either |
| Dates | `date-fns` 4.4.0 (pt-BR locale), `react-day-picker` 9.x for shadcn's `calendar.tsx`; money and numbers through `Intl` | MIT | date-fns via playground-ui | `Intl` only, without a date picker |
| Icons | `lucide-react` 1.47.0 | ISC | same | none |
| Toasts | Base UI toast (shadcn `bases/base/ui/toast.tsx`) | MIT | n/a | `sonner`. I did not run sonner under the CSP. It is left out so the kit has one toast |

**Resulting compiler `package.json`**: the six current entries plus `@vitejs/plugin-react`, `tailwindcss`,
`@tailwindcss/vite`, `@tanstack/react-router`, `@tanstack/react-query`, `@tanstack/react-table`,
`@base-ui/react`, `class-variance-authority`, `clsx`, `tailwind-merge`, `lucide-react`, `recharts`,
`zod`, `react-hook-form`, `@hookform/resolvers`, `date-fns`, `react-day-picker`. Every license is MIT,
ISC or Apache-2.0 **[read]** (`PROBE/node_modules/*/package.json`).

Why align with the Hub. The Hub already builds with this exact React, Vite, TypeScript, Tailwind,
Router, Query, zod, lucide and Recharts set. That means one set of versions to upgrade, and the HQ
and the Factory already review this code. The one place the apps differ is the component layer.
The Hub composes `@mastra/playground-ui`, which is a product-specific kit. The apps get shadcn
source. Both sit on Base UI.

### 2.3 What the probe showed

All measured in `PROBE` on the WSL workstation, not in E2B.

| Question | Result |
|---|---|
| Does the stack build with the pinned Vite and TypeScript? | Yes. `tsc -p` 1.4 s wall, `vite build` 0.6 s, 3,711 modules **[measured]** |
| First-load JS, gzip | React-only app: 59.9 KB. Full stack without charts: 168.7 KB. With Recharts: 270.4 KB. With Base UI instead of Radix: 277.5 KB **[measured]** (`PROBE/dist-*`) |
| Does anything break under the Preview CSP (`preview-routes.ts:53`, `style-src 'self'`)? | shadcn's original `ChartStyle` (`SHADCN/.../bases/base/ui/chart.tsx:82-110`, `<style dangerouslySetInnerHTML>`) is refused by Chromium: "Applying inline style violates ... 'style-src 'self''". The Radix dialog logs one violation on open, from `react-style-singleton` (`PROBE/node_modules/react-style-singleton/dist/es2015/singleton.js`). The Base UI dialog under `CSPProvider disableStyleElements`, the CSP-safe chart, Router, Query and the table log **zero** violations. Bars render (2), cells render (4), and the dialog opens **[measured]** |
| Deep links (`/notas` loaded directly) | **404 today.** The Preview serves only declared files (`preview-routes.ts:92-99,191-194`), and the smoke server does the same (`application-artifact-runtime.ts:242-249`). With an `index.html` fallback for extensionless paths, `/notas` returns 200 and renders **[measured]** |
| Does `tsc` catch what Vite lets through? | Yes. `<Dialog.Trigger asChild>` on Base UI fails `tsc` (TS2322 "Property 'asChild' does not exist"), and `vite build` of the same file succeeds **[measured]**. A wrong field in a call to a typed operation fails the same way (follows from the same mechanism, not separately run) |
| Compiler `node_modules` size (E2B image growth) | 66 MB today, 232 MB with the new set. The largest are lucide-react 45 MB, date-fns 27 MB and typescript 24 MB **[measured]** |

The bundle grows about 4.6 times. For internal tools on a company network I judge 280 KB acceptable.
The first cut is to lazy-load chart routes (`createLazyRoute`), and the skill should teach it. A
second cut is `zod/mini` for the generated schemas. Its saving is **[unproven]**.

## 3. The contract between screens and server operations

### 3.1 Today

The contract already exists, and it is schema-first. Each operation in `conexus/manifest.json` has a
closed JSON Schema for `input` and `output`, drawn from a small subset: string, integer, number,
boolean, closed object and array (`builder-skills/conexus-server/SKILL.md:18-36`). The runner admits
the manifest (`app-runner/server-manifest.ts:35`) and refuses any value that does not match
(`SKILL.md:36`). The browser calls `POST /__conexus/api/<op>` with raw `fetch` and an untyped JSON
answer (`SKILL.md:93-105`). Nothing types the screen side. A renamed field in a handler or a
manifest shows up only when a person uses the Preview.

### 3.2 The choice: generate a typed client from the manifest, no OpenAPI document

OpenAPI earns its keep when there are many HTTP routes with different methods, paths, parameters and
headers. That is why the Hub uses it (`contracts/api/product/openapi.yaml` feeds
`scripts/generate-r1-s3-contracts.mjs`, which writes `apps/web/src/generated/project-client.ts:1`).
An app has one route shape: a POST with a JSON body to `/__conexus/api/<op>`. Wrapping the manifest in
OpenAPI adds a file nobody reads and a second generator. The manifest *is* the OpenAPI-style
contract, in a smaller format. **Recommendation**: the platform generates the typed client straight
from the manifest. An OpenAPI document can be derived in about 30 lines when a consumer exists, for
example app-to-app calls or exposing an app to an agent. That need is not on the roadmap for Q4.

Zod cannot be the source of truth on the server. Handlers may not import npm packages, and the
resolver refuses them (`application-server-build.ts:57-72`). JSON Schema stays the source, and
generated code derives from it, per Type System Discipline ("derive from authoritative schemas").

### 3.3 Who writes what

| File | Written by | Rule |
|---|---|---|
| `conexus/manifest.json` | Builder | The single contract. Unchanged format |
| `conexus/handlers/*.ts` | Builder | Unchanged, but they now type their signature with the generated `conexus/types.gen.ts` (`Input<'listItems'>`, `Output<'listItems'>`) |
| `conexus/types.gen.ts` | Platform, generated | Plain TypeScript types, no imports, so the handler resolver admits it. It is overwritten by every check and every Hub build |
| `app/src/conexus/api.gen.ts` | Platform, generated | For each operation: a zod `input` and `output` schema (the same bounds as the manifest), `Input<K>` and `Output<K>`, and `api.<op>(input)`, which POSTs, parses the error body and throws `ConexusError { code, detail }` on a non-2xx answer. It is overwritten by every check and every Hub build, so an edit by the model has no effect. That rule is encoded, not written in the prompt |
| Screens | Builder | `useQuery({ queryKey: ['<op>', input], queryFn: () => api.<op>(input) })`. A write calls `useMutation` and then invalidates the operation's key. A form uses `zodResolver(schemas.<op>.input)`, so the browser checks the same limits the runner enforces |

The generator is about 80 lines. The schema subset is tiny (study 15 section 1.3), and the smoke
already walks it (`application-artifact-runtime.ts:211-220`). It runs as the first step of the check
(section 6), so `tsc` always sees a client that matches the manifest. The probe's
`PROBE/app/src/conexus/api.ts` is a hand-written sample of the output, and it typechecks and runs.

## 4. What changing the stack costs in the platform

| Surface | Change | Evidence |
|---|---|---|
| Compiler template | New `package.json` and lockfile (section 2.2). `vite.config.mjs` gains `plugins: [react(), tailwindcss()]` and `resolve.alias['@'] = <root>/src` | `compiler-template/package.json:9-16`, `vite.config.mjs:1-17` |
| Platform `tsconfig.json` | New and platform-owned, in `/opt/conexus/compiler/`. Strict, `moduleResolution: bundler`, `jsx: react-jsx`, `types: ['vite/client']`, `paths: { '@/*': ['<app>/src/*'] }`. It is not in the app, so the model cannot relax it. TypeScript 6 refuses `baseUrl` (TS5101) **[measured]** | `PROBE/tsconfig.json` |
| E2B template | Rebuilt from the recipe. The image grows by about 170 MB of `node_modules` (section 2.3). The effect on sandbox start is **[unproven]** | `scripts/builder-e2b-template.mjs:14-49` |
| Constants | New `TEMPLATE_REF` and `RECIPE_SHA256` in `application-artifact-runtime.ts:6-7` and `registry/application-artifact-store.ts:5-6`. The old pair moves to `READABLE_*` (`:8-9`) so retained artifacts still read | read |
| Migration | `0037`, replacing the payload admission function with the new pins, as `0014` did (`0014_agent_user_template.sql:48-50`). If the profile is renamed `REACT_VITE_V2`, the `profile` pin (`0014_agent_user_template.sql:42`) changes in the same migration | read |
| Profile name | Recommend `REACT_VITE_V2` in `conexus.json` and the payload pin. It is a different contract (new libraries, generated client, type check). The starter writes `conexus.json` (`application-starter.ts:64`). I found no build code that reads `shape` (grep of `application-build.ts` and `run-runtime.ts`) | read |
| Starter | Replaced (section 4.1) | `application-starter.ts:13-78` |
| Preview and app host | An `index.html` fallback for a GET with no declared file whose last segment has no `.`, outside `conexus-server/` and `/__conexus/`, in `preview-routes.ts` `serve` and `application-host-routes.ts:178`. The CSP stays as it is | measured (section 2.3) |
| Smoke | The same fallback in its static server. It should also serve the production CSP header and record console errors and CSP violations. Today it records only `Runtime.exceptionThrown` (`application-artifact-runtime.ts:190-194`) | read |
| Runner and data plane | None. Handlers and migrations are untouched | read |
| Artifact limits | 256 files and 12 MiB (`application-artifact-store.ts`, `MAX_FILES`, `MAX_TOTAL_BYTES`). The probe emits 3 files, about 0.9 MB. Lazy routes add a few chunks. Well within the limits | measured |
| Existing Projects | Only branch test Projects exist. Recreate them instead of migrating their source. `materializeApplicationCheck` writes only missing files (`application-starter.ts:135-151`), so an old repo would keep its `check.sh` and react-only `main.tsx` | read |

### 4.1 The new starter

| Path | Owner | Content |
|---|---|---|
| `app/index.html` | app | As today, `lang="pt-BR"` |
| `app/src/main.tsx` | app | `CSPProvider disableStyleElements` > `QueryClientProvider` > `RouterProvider`, plus the toast provider |
| `app/src/router.tsx` | app | Root route with the app shell and one `/` route, plus the `Register` declaration (the probe's shape) |
| `app/src/routes/home.tsx` | app | An empty state that says what the app will do |
| `app/src/styles.css` | app | `@import "tailwindcss"`, the Conexus app tokens in `@theme` (color, radius, font stack, `--chart-1..5`) |
| `app/src/lib/utils.ts` | app | `cn()` |
| `app/src/components/ui/*.tsx` | app | A curated shadcn Base UI set, generated once in the Hub repo by the shadcn CLI (base `base`, icons lucide) and committed as starter files: button, card, input, label, textarea, select, checkbox, switch, radio-group, field, dialog, alert-dialog, sheet, dropdown-menu, popover, tooltip, tabs, table, badge, skeleton, separator, empty, alert, spinner, pagination, breadcrumb, calendar, toast, sidebar, and a CSP-safe `chart.tsx`. Each file keeps the MIT notice |
| `AGENTS.md` | app | As today, plus one line naming the stack |
| `conexus.json` | app | `{ "shape": "REACT_VITE_V2" }`. The `check` field goes (section 6) |
| `conexus/check.sh` | removed | Replaced by the platform check (section 6) |

The components are seeded into the app, not shipped as a package. That is how shadcn works. It lets
the Builder read and adapt the source, and it costs nothing at run time. The price is that a later
kit fix does not reach old apps by itself. That is acceptable while only test Projects exist.

## 5. Design rules

### 5.1 What the sources say

- **Anthropic `frontend-design`** (Apache 2.0, `ASK/skills/frontend-design/SKILL.md`). It is written
  for distinctive marketing and brand pages: "Approach this as the design lead at a design studio ...
  take aesthetic risk" (`:9`), with the hero as the first thing viewers see (`:17`) and typefaces
  chosen away from the defaults (`:21`). About half of it does not fit internal business tools. The
  parts that transfer are the calibration list of generated-design tells (`:38-45`), the
  two-pass plan and review (`:47-53`), the CSS specificity warning (`:55`), restraint plus a quality
  floor ("responsive down to mobile, visible keyboard focus, reduced motion respected", `:59`), and
  the whole writing section (`:61-71`: the user's vocabulary, active verbs, one name per action,
  errors that say what happened and how to fix it, empty screens as an invitation to act).
- **Anthropic `web-artifacts-builder`** (Apache 2.0). It uses the same shadcn and Tailwind stack. Its
  design line: "avoid ... excessive centered layouts, purple gradients, uniform rounded corners, and
  Inter font" (`ASK/skills/web-artifacts-builder/SKILL.md:18`).
- **Claude Design** (help-center guidance; no license to copy text, so only the idea is used). A
  design system is built once, as "colors, typography, components, and layout patterns", and is
  "applied automatically to every new design". It advises "Include real examples, not just specs"
  ([support article](https://support.claude.com/en/articles/14604397-set-up-your-design-system-in-claude-design);
  [announcement](https://www.anthropic.com/news/claude-design-anthropic-labs)).

The conclusion for Conexus is the Claude Design model, not the `frontend-design` model. A company's
apps should look like one family. The platform fixes the design system: the tokens in `styles.css`,
the components in `components/ui` and the layout patterns in the skill. The Builder applies it and
never invents a new aesthetic per app. Distinctiveness is the wrong goal for a purchase-approval
screen. That follows Experience First: the person using five company apps is served by consistency.

### 5.2 `conexus-app-ui` skill outline

It lives in `WT/builder-skills/conexus-app-ui/SKILL.md` (AC-10: versioned with the Hub, loaded as an
agent skill, never copied into an app). The passages adapted from `frontend-design` carry the Apache
2.0 notice and name their source file (AC-25 applies the same rule to copied files). About 8 to 10k
characters, plus two example files.

1. **The system.** Use `@/components/ui` before writing a new component. Colors, radius and fonts
   come only from the tokens in `styles.css`, with no raw hex. The Hub already has a check for this,
   `web:style:check` (`WT/package.json`). The same rule can become a check step later. Change the
   accent only when the person asks.
2. **Layout patterns**, each with a real example file: the app shell (sidebar with the app's
   sections, content area), list with filters then detail, create or edit form, and a dashboard
   (KPI row, then charts, then a detail table).
3. **Data on screens.** A Query key is `[operationId, input]`. After a mutation, invalidate the key.
   Every screen that loads data shows a loading, an empty and an error state (the error from
   `ConexusError.code`, in plain Portuguese).
4. **Forms.** `useForm` with `zodResolver(schemas.<op>.input)`, shadcn `Field`, and the submit label
   naming the action ("Salvar pedido"). One worked example.
5. **Tables.** TanStack Table v9 (`tableFeatures`, `createColumnHelper<typeof features, Row>`,
   `useTable`), with sorting and a text filter. One worked example, because models know v8.
6. **Charts.** Choose the form (bar for comparing categories, line for time, a KPI tile for one
   number, pie only for 2 to 5 parts of a whole), color from `--chart-*`, format axis and tooltip
   values with `Intl` pt-BR (R$, `.` for thousands), and lazy-load a chart route. Uses the CSP-safe
   `chart.tsx`.
7. **Routing.** Add a route in `router.tsx`, use `Link`, and keep filters in validated search params.
8. **pt-BR.** `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, `dd/mm/aaaa`,
   and `date-fns/locale/ptBR`.
9. **Writing on screens.** Adapted from `frontend-design:61-71`.
10. **Quality floor and tells to avoid.** Adapted from `frontend-design:38-45,59` and
    `web-artifacts-builder:18`, filtered to what applies to tools: no identical card grid for
    everything, no gradient washes, no all-caps eyebrow labels, no decorative numbering.
11. **Platform limits.** No inline `<style>`, no external fonts, CDN or images (the CSP allows only
    `'self'`, `preview-routes.ts:53`), assets imported from `app/src`, and no package installation.

### 5.3 Prompt versus skill

| Rule | Where | Why |
|---|---|---|
| The fixed package list, and "you cannot add packages" | prompt | Always true. A platform fact, which AC-1 allows (study 15 section 4.3) |
| Call operations through `api.<op>` from `@/conexus/api.gen`, never raw `fetch`. Do not edit `*.gen.ts` | prompt (the first half). The second half is not needed, because regeneration enforces it | Applies to every run that touches data |
| Use `@/components/ui` and the tokens; do not invent a visual identity | prompt, one sentence | It must hold even when the skill is not loaded |
| Loading, empty and error states on every data screen | prompt, one sentence | The same reason |
| Patterns, examples, charts, tables, forms, copy rules, tells | skill | Long, and needed only when building screens |
| CSP limits | skill, and the check reports violations | Enforced by the check (section 6), so the prompt does not carry it |

## 6. `conexus_check` as a native tool, now

### 6.1 Design

One Hub-owned script, `/opt/conexus/check.mjs`, written as root at run start the way
`server-build.mjs` is today (`run-runtime.ts:185-194`). Because it ships with the Hub and not the
image, changing the check needs no new E2B template. Only a dependency change does. It prints one
JSON report.

```ts
type CheckStepId = 'generate' | 'typecheck' | 'build' | 'server' | 'boot'
type Problem = Readonly<{ file?: string; line?: number; column?: number; code?: string; message: string }>
type CheckStep = Readonly<
  | { step: CheckStepId; status: 'passed'; durationMs: number }
  | { step: CheckStepId; status: 'failed'; durationMs: number; problems: readonly Problem[] }
  | { step: CheckStepId; status: 'skipped'; reason: string }>
type CheckReport = Readonly<{
  ok: boolean                       // every blocking step passed
  steps: readonly CheckStep[]
  facts: Readonly<{ operations: number; migrations: number; jsGzipBytes: number }>
}>
```

Steps, in order. A failed blocking step skips the ones after it.

1. `generate`: manifest to `api.gen.ts` and `types.gen.ts`. A manifest refusal is a problem with the
   runner's own message (`admitManifest`).
2. `typecheck`: `tsc -p /opt/conexus/compiler/tsconfig.json --noEmit --pretty false`, parsed into
   `{file, line, column, code, message}`. Covers `app/` and `conexus/`.
3. `build`: `vite build`, the same command as the Hub build (`application-artifact-runtime.ts:9`).
4. `server`: the existing `server-build.mjs` steps (`application-server-build.ts:13-101`).
5. `boot`: the existing Chromium smoke, extended. It serves the production CSP and the SPA fallback,
   stubs the API as today (`:205-229`), loads `/`, and reports uncaught errors, `console.error`, CSP
   violations and failed same-origin requests as problems. Visiting every static route is a later
   step.

The tool is a `createTool` in the Builder's tool set, beside `connector_fetch`
(`harness/controller.ts:118-122`). It has no input, and `outputSchema` is the `CheckReport` zod
schema. It runs `node /opt/conexus/check.mjs --json /workspace/repo` through
`context.workspace.sandbox` (`@mastra/core` `tools/types.d.ts:520-529`), as `conexus-agent`, in the
same sandbox the shell tools use. So it adds no new authority. The model gets `file:line` problems,
not 300 lines of tail. Budget: the probe's compile steps took about 2 s locally, and the full check in
E2B's 2 vCPU is estimated under 15 s **[unproven]**.

### 6.2 Admission and the Preview build reuse the same code

- **Admission** (`run-runtime.ts:241-249`) runs the same `check.mjs` as root on `CHECK_ROOT`, not
  the candidate's `conexus/check.sh`. That closes study 15's defect 1: the candidate can no longer
  edit its own gate. The refusal evidence becomes the failed step's `problems`, not the first 400
  characters of stdout. That closes defect 2 (`application-starter.ts:84-94`). The smoke's `detail` is
  a problem message, which closes defect 3.
- **Blocking set**: recommend `generate`, `typecheck`, `build` and `server` block admission. `boot` is
  recorded and shown but does not block, which keeps the C-020 amendment that admitted source stays
  repairable when the Preview fails (`docs/decisions/index.md:16`). Operator decision 3.
- **Preview build**: the post-admission compile (`application-artifact-runtime.ts:414-464`) calls
  `check.mjs --out /workspace/dist`, so the Preview is built by the exact steps the model saw. Folding
  admission and the Preview build into one compile is possible later. It is not needed now.

### 6.3 Spec amendments

- **AC-6** and *Tool contract*: add a row, `conexus_check` | Planejar: no | Construir: yes | Conexus.
  Add it to `BUILDER_MODES.build.availableTools` (`harness/modes.ts:77-85`) and to the guard. The
  AC-6 test asserts the new list.
- **AC-14**: replace "When `conexus/check.sh` passes" with "When the platform check (the Hub's
  `check.mjs`, the code `conexus_check` runs) passes its blocking steps on the candidate".
- **AC-1**: unchanged. The package fact is platform information (study 15 section 4.3).
- **AC-10**: `conexus-app-ui` joins `builder-skills/`. The `conexus-server` skill changes its browser
  section to the generated client and drops the false smoke sentence (`SKILL.md:108-111`).
- **AC-27**: unchanged cases. The eval also records each run's last `CheckReport`.
- **New AC**: the app stack is the pinned list in section 2.2. A deep link on the Preview opens the
  app. The generated client matches the manifest, and a mismatch fails `typecheck`.
- **Decision record**: a new entry amending the REACT_VITE_V1 profile of C-028 to REACT_VITE_V2.

### 6.4 What the UI can show

`tool-sentences.ts` gets `conexus_check`: "Verificando o app" and "Verificou o app". From the
structured result, a card can show five steps with pass or fail, the first problems by file and line
in plain words, and "3 operações, 1 migração" as counts, never as "validated". Study 15 section 2.6
records the overclaim this prevents. The card can come in a later slice. The sentence is enough for
the first one.

### 6.5 Why not now: the honest answer

Study 15 held the tool back for two reasons: AC-6 fixes the tool list, and the UI can already show
the shell call. Neither holds up now. The spec is being amended for the stack anyway. And the stack
change forces a rewrite of the check, because it adds codegen, `tsc` and a CSP-aware boot. The tool
is a thin wrapper, about 60 lines plus two table rows and one UI sentence, around a script we must
write regardless. The reasons to do it now are structural. A report with one schema feeds the model,
admission, the Preview build and the UI. The editable `check.sh` disappears (Subtract Before You Add,
and Encode Lessons in Structure: the gate is the platform's code, not a prompt line). And `file:line`
type problems are what make the typed contract usable.

What the tool does not buy is honest too. Nobody else wraps the compile in a tool (study 15 section
3). The model can still run `vite` by hand through the shell, which is harmless. And one fact is
still **[unproven]**: headless Chromium running as `conexus-agent`, since today the smoke runs as root
(`run-runtime.ts:405`). That is the first thing slice 1 must prove. If it fails, `boot` runs only in
admission and the tool reports it as skipped, with the reason.

## 7. Build order

Each slice ends in a check, and the check itself comes first, so every later slice is verified by
it (Sequence Work into Verifiable Units).

| Slice | What | Ends when |
|---|---|---|
| 1. Platform check | `check.mjs` (`generate` is a no-op until slice 4, then `typecheck`, `build`, `server`, `boot` with CSP, console and fallback). Admission and the Preview build call it. `check.sh` and the `check` field leave the starter. Prove Chromium as `conexus-agent` | An edited `check.sh` no longer passes admission. A handler contract error reaches the next turn in full. A thrown error on mount shows its text |
| 2. `conexus_check` tool | `createTool`, mode table, guard, AC-6 test, UI sentence, AC-6 and AC-14 text | The AC-6 test passes with the new list. A Construir turn calls it and gets `CheckReport` |
| 3. Deep links | SPA fallback in `preview-routes.ts`, `application-host-routes.ts` and the smoke | A Preview deep link returns the app (browser test) |
| 4. Compiler v2 | Compiler `package.json`, lockfile, `vite.config.mjs`, platform `tsconfig.json`, E2B template build, constants, migration `0037`, `REACT_VITE_V2`, and the manifest-to-client generator | `rb:e2b:template:check` passes. The probe app, as a Project, passes the check in E2B. Measure the check time and sandbox start |
| 5. Starter v2 | `main.tsx`, `router.tsx`, `styles.css` tokens, curated `components/ui` with the CSP-safe chart, AGENTS.md line | A new Project's starter passes `conexus_check` with zero problems |
| 6. Knowledge | `conexus-app-ui` skill with examples, `conexus-server` browser section, prompt v2 stack facts | The AC-1 printout shows the facts. Leandro reads it (AC-30) |
| 7. Proof | Recreate test Projects, then run AC-27's three cases and AC-28 in the browser | The gate passes |

Slices 1 to 3 do not depend on the new packages and could land before the template work. Slices 4
and 5 must land together, because a starter that imports Base UI fails on the old image. Slice 6
follows 5, because the prompt must not state a stack the image lacks.

### 7.1 What prompt v2 can state as stable after slice 6

- `app/` is React 19 with TypeScript, built by Vite. The only packages are the ones listed, and none
  can be added. An import of any other package fails the check.
- Screens call the server only through `api.<op>` from `@/conexus/api.gen`. Its types and schemas
  come from `conexus/manifest.json` and are regenerated on every check.
- Routes are declared in `app/src/router.tsx`. Deep links work in the Prévia.
- Build screens from `@/components/ui` and the tokens in `app/src/styles.css`. The `conexus-app-ui`
  skill has the patterns.
- Every screen that loads data shows loading, empty and error states.
- Call `conexus_check` after the last edit. The turn is not done while a blocking step fails. Report
  what it checked in plain words. It compiles, type-checks, builds the server half and opens the app
  once with empty answers. It does not run handlers or touch data.
- Put images and files under `app/src` and import them (`vite.config.mjs:6`, unchanged).

The line "do not edit `conexus.json` or `conexus/check.sh`" goes, because the file is gone and the
gate ignores the candidate.

## 8. Decisions left for the operator

1. **Components on Base UI or Radix.** Recommend Base UI. It is measured clean under the Preview CSP,
   it aligns with the Hub's kit, and `tsc` catches `asChild` habits. Radix has more model familiarity
   and a measured CSP violation on every dialog. Relaxing the CSP to `'unsafe-inline'` styles would be
   a security decision of its own, and I do not recommend it.
2. **Forms with react-hook-form or TanStack Form.** Recommend react-hook-form, for model familiarity.
   An eval can reopen this.
3. **What blocks admission.** Recommend: a type error blocks, as a build error does today, and a boot
   failure is reported but does not block (C-020 amendment).
4. **One neutral Conexus app design system for every app**, with no per-app aesthetic, and company
   branding later through tokens. Recommend yes.
5. **Sequencing against Q4.** Recommend running AC-27 after slice 6, since the operator wants the
   stack now and `erp/sales-dashboard` is the case that measures it. Slices 1 to 3 can start at once.

## 9. Unproven and gaps

- Everything under [measured] ran on the workstation, not in E2B. Check time, template build time,
  sandbox start with a larger image, and Chromium as `conexus-agent` are **[unproven]**.
- Tailwind 4's automatic source detection with `app/node_modules` as a symlink to the compiler was
  not tested. The probe had a real `node_modules`, not the symlink. Tailwind ignores `node_modules`
  by default, so I expect no problem **[unproven]**.
- The Base UI scroll lock under `disableStyleElements` was not checked visually. Only "zero CSP
  violations, dialog opens" was measured.
- `sonner` and the other shadcn dependencies not in the probe (`react-day-picker`, the sidebar) were
  not run under the CSP. The curated set must pass the check in slice 5 before it ships.
- Model familiarity with Base UI, TanStack Table v9 and the generated client is a judgment, not a
  measurement. AC-27 and the recorded `CheckReport`s are the measurement.
- No OpenAPI consumer was looked for beyond the roadmap files already read in studies 14 and 15.
