# 0003. The app stack v2 and the platform check as a Builder tool

**Date**: 2026-09-29
**Status**: In Progress
**Amends**: spec 0002 (built, in Git history) AC-6, AC-10, AC-14 and the Tool contract; the REACT_VITE_V1 profile of C-028.

## Summary

Every app the Builder makes gets a richer, fixed toolkit: React with TanStack Router and Query,
shadcn components on Base UI with Tailwind, Recharts for charts, react-hook-form with zod for forms,
and TanStack Table. The screens talk to the app's server through a typed client that the platform
generates from `manifest.json`. The old `conexus/check.sh`, which the Builder could edit, is replaced
by one check owned by the Hub. The Builder calls it as the tool `conexus_check`, admission runs the
same code, and it now also type checks the code and opens the app to catch screen errors. Apps share
one neutral Conexus look built only from design tokens (named colors, fonts and sizes), so a company
style can be added later without touching the apps.

## Requirements

**User stories**:
- As a person asking for an app, I want dashboards, tables and forms that look finished and behave
  like one family of company tools, so the app is usable on the first try.
- As the Builder, I want a fixed set of libraries, a typed way to call my server operations and a
  check that tells me each error by file and line, so I fix problems before I say I am done.
- As the Conexus operator, I want the gate that admits an app to be platform code the Builder cannot
  change, so an admitted revision always passed the same rules.

**Acceptance criteria**:
- **AC-1**: The compiler template pins exactly the packages in *App stack*, with a committed lockfile
  whose digest the E2B recipe records. An app may import only the *Import allowlist*; any other bare
  specifier, including a package present only as a dependency of an allowed one, fails `build` and
  `typecheck` with the specifier named. The Builder cannot install packages.
- **AC-2**: A new Project's starter (profile `REACT_VITE_V2`) holds `app/src/main.tsx` (Base UI
  `CSPProvider disableStyleElements`, `QueryClientProvider`, `RouterProvider`, toast provider),
  `app/src/router.tsx`, `app/src/routes/home.tsx`, `app/src/styles.css` with the Conexus tokens,
  `app/src/lib/utils.ts`, the curated `app/src/components/ui/*` set (listed in *Starter components*)
  with a CSP safe `chart.tsx`, and `conexus.json` `{ "shape": "REACT_VITE_V2" }`. It has no `conexus/check.sh`. The starter passes
  `conexus_check` with zero problems.
- **AC-3**: The starter's look comes only from tokens (CSS variables in `styles.css` `@theme`: colors,
  radius, font stack, `--chart-1..5`), whose values are the neutral subset of the Conexus brand tokens
  in `packages/brand/src/tokens.css` (neutrals, one accent, radius, the system font stack; no web
  fonts, since the CSP allows only `'self'`). Starter components use no raw color value outside
  `styles.css`. The
  `conexus-app-ui` skill tells the Builder to use `@/components/ui` and the tokens and never to
  invent a new visual identity; it changes the accent only when the person asks.
- **AC-4**: Before `typecheck`, the platform generates `app/src/conexus/api.gen.ts` (per operation:
  zod `input` and `output` schemas with the manifest's bounds, `Input<K>`, `Output<K>`, and
  `api.<op>(input)` that posts to `/__conexus/api/<op>` and throws `ConexusError { code, detail }` on
  a non 2xx answer) and `conexus/types.gen.ts` (plain types, no imports) from `conexus/manifest.json`.
  The mapping is the table in *Generated client*. Generated files never enter Git: the candidate
  pull excludes `*.gen.ts` (as it excludes `.conexus/plans`), and every check and Hub build
  regenerates them from the manifest being checked, so a stale or edited copy can never be admitted.
  A screen or handler that disagrees with the manifest fails `typecheck`.
- **AC-5**: The platform check is one Hub owned script, `/opt/conexus/check.mjs`, written at run
  start as root, mode 0555, together with the compiler root, neither writable by `conexus-agent`. It
  runs the steps `generate`, `typecheck`, `build`, `server`, `boot` in order, skips the steps after a
  failed blocking step, and prints one `CheckReport` (see *Check contract*). Every step that executes
  app code runs as `conexus-agent` with a fixed environment and the absolute Node path, in admission
  too. Each step has a wall time limit (*Check limits*); a step past it fails with the problem
  `STEP_TIMEOUT` and its process group is killed.
- **AC-6**: `generate`, `typecheck`, `build` and `server` are blocking. `boot` is recorded and shown
  but never blocks admission; admitted source stays repairable when the Prévia fails (C-020
  amendment).
- **AC-7**: `boot` serves the build with the Prévia's production CSP and the deep link fallback,
  stubs the API as the smoke does today, loads `/`, and reports uncaught errors, `console.error`
  calls, CSP violations and failed same origin requests as problems with their text.
- **AC-8**: `conexus_check` is a Mastra `createTool` with no input whose output is the
  `CheckReport`. It runs `check.mjs` in the run's sandbox as `conexus-agent`. It exists only in
  Construir; Planejar does not list it. The web shows "Verificando o app" while it runs and
  "Verificou o app" when it ends.
- **AC-9**: At the end of Construir, admission runs the Hub's `check.mjs` as root on the candidate's
  tree, never a file from the candidate. A refusal carries the failed step's `problems` list to the
  next turn and to the run record, redacted as today and bounded only by *Check limits* (no 400
  character cut).
- **AC-10**: The Prévia, the app host and the `boot` server share one path classifier. A GET or HEAD
  for a decoded path with no declared file, whose last segment has no `.`, outside `conexus-server/`
  and `/__conexus/`, is answered with the app's `index.html`; a trailing slash is treated the same; a
  path whose last segment has a `.` and no declared file stays 404. A deep link such as `/notas` opens
  the app. The CSP is unchanged.
- **AC-11**: `builder-skills/` holds two new agent skills: `conexus-app-ui` (design: the system,
  layout patterns, charts, writing on screens, quality floor, tells to avoid, platform limits) and
  `conexus-app-code` (construction: code structure, routes in `router.tsx`, data through `api.<op>`
  with TanStack Query keys `[operationId, input]` and invalidation after writes, forms with
  `zodResolver`, TanStack Table v9 with a worked example, pt-BR formatting, lazy chart routes). The
  `conexus-server` skill's browser section points to the generated client and drops the sentence
  that claims the check runs operations. Copied passages keep their license notice and name their
  source.
- **AC-12**: Artifacts built with the old template stay readable after the switch (`READABLE_*`
  pins), and a new build uses only the new template pins.
- **AC-13**: The Builder never says an app was "validado" beyond what the check did: it reports the
  steps that ran and the counts (operations, migrations) as counts.

## Decision

**Chosen option**: Option 2: a fixed, richer stack aligned with the Hub, a generated typed client,
and one Hub owned check exposed as a native tool now.

The Builder builds on React 19 with TanStack Router and Query, shadcn on Base UI with Tailwind 4,
Recharts, react-hook-form with zod and TanStack Table, calls the server through a client generated
from the manifest, and verifies with `conexus_check`, which is the same code admission runs.

**Implementation skills**: `shadcn` (`shadcn-ui/ui`, installed in slice 6) · `frontend-design`
(`anthropics/skills`, installed in slice 6) · `mastra` (`.agents/skills/mastra/`)

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Design

### App stack (pinned, AC-1)

| Concern | Package and version | License |
|---|---|---|
| Base | `react` and `react-dom` 19.2.8, `vite` 8.2.2, `typescript` 6.0.2 | MIT, Apache 2.0 |
| Vite plugins | `@vitejs/plugin-react` 6.1.1, `@tailwindcss/vite` 4.3.3 | MIT |
| Routing | `@tanstack/react-router` 1.170.32, code routes in one `app/src/router.tsx` | MIT |
| Server state | `@tanstack/react-query` 5.102.8 over `api.gen.ts` | MIT |
| Components | shadcn/ui source on `@base-ui/react` 1.8.0, `class-variance-authority` 0.7.1, `clsx` 2.1.1, `tailwind-merge` 3.7.0 | MIT, Apache 2.0 |
| Styling | `tailwindcss` 4.3.3, tokens in `app/src/styles.css` | MIT |
| Charts | `recharts` 3.10.1 through a CSP safe `chart.tsx` (colors on the container `style`, no inline `<style>`) | MIT |
| Tables | `@tanstack/react-table` 9.2.4 | MIT |
| Forms | `react-hook-form` 7.89.0, `@hookform/resolvers` 5.9.1, `zod` 4.6.5 | MIT |
| Dates | `date-fns` 4.4.0 (pt-BR), `react-day-picker` at the exact 9.x version the shadcn base `calendar.tsx` of the pinned shadcn revision requires, recorded in the lockfile in slice 4; money and numbers through `Intl` | MIT |
| Icons | `lucide-react` 1.47.0 | ISC |
| Toasts | Base UI toast from the shadcn base set | MIT |

The platform owns `/opt/conexus/compiler/tsconfig.json` (strict, `moduleResolution: bundler`,
`jsx: react-jsx`, `types: ['vite/client']`, `paths: { '@/*': ['<app>/src/*'] }`). `vite.config.mjs`
adds `react()`, `tailwindcss()`, the `@` alias and the allowlist resolver below.

**Import allowlist (AC-1).** Allowed bare specifiers: each package in the table above and its
documented subpaths (for example `react/jsx-runtime`, `react-dom/client`, `date-fns/locale`,
`zod/mini`), plus `@/` (the app's `src`). Anything else is refused by a Vite `resolveId` plugin in
`build` and by a generated `tsconfig` `paths` map that points unknown specifiers at nothing in
`typecheck`. Handlers keep today's rule (only `conexus/` and `node:`).

**Starter components (AC-2).** Generated once in the Hub repo by the shadcn CLI at a pinned shadcn
revision (base `base`, icons lucide), each file keeping its MIT notice: button, card, input, label,
textarea, select, checkbox, switch, radio-group, field, dialog, alert-dialog, sheet, dropdown-menu,
popover, tooltip, tabs, table, badge, skeleton, separator, empty, alert, spinner, pagination,
breadcrumb, calendar, toast, sidebar, and a patched `chart.tsx`.

**CSP note.** `style-src 'self'` blocks `<style>` elements and `style` attributes written in HTML
markup. React's `style` prop sets properties through the CSSOM (`element.style`), which the policy
allows; study 17 measured zero violations with the chart colors set that way. So: no `<style>`
element, no `dangerouslySetInnerHTML` style, no inline `style` attribute in `index.html`; the React
`style` prop is allowed. `boot` reports any violation, so a wrong assumption fails the check.

### Check contract (AC-5 to AC-9)

```ts
type CheckStepId = 'generate' | 'typecheck' | 'build' | 'server' | 'boot'
type Problem = Readonly<{ file?: string; line?: number; column?: number; code?: string; message: string }>
type CheckStep = Readonly<
  | { step: CheckStepId; status: 'passed'; durationMs: number }
  | { step: CheckStepId; status: 'failed'; durationMs: number; problems: readonly Problem[] }
  | { step: CheckStepId; status: 'skipped'; reason: string }>
type CheckReport = Readonly<{
  ok: boolean
  steps: readonly CheckStep[]
  facts: Readonly<{ operations: number; migrations: number; jsGzipBytes: number }>
}>
```

- `ok` is true when every blocking step passed.
- One core, three callers: today's `buildApplicationInSandbox` (`application-artifact-runtime.ts`)
  is reshaped around `CheckReport` and becomes `check.mjs`'s engine; `conexus_check`, admission and
  the Prévia build all call it. No second copy of the steps.
- `generate` refuses a bad manifest with the runner's own `admitManifest` message, and also refuses
  an unsatisfiable bound (`minimum` above `maximum`, `minLength` above `maxLength`).
- `typecheck` is `tsc -p /opt/conexus/compiler/tsconfig.json --noEmit --pretty false`, parsed into
  problems; it covers `app/` and `conexus/`.
- `build` is the same `vite build` the Hub build runs.
- `server` is today's `server-build.mjs` steps.
- `boot` is today's Chromium smoke, extended per AC-7. If Chromium cannot run as `conexus-agent`,
  the tool reports `boot` as `skipped` with the reason and admission still runs it as root.
- The post admission Prévia build calls `check.mjs --out /workspace/dist`, so the Prévia is built by
  the steps the model saw.
- Parsing: `typecheck` problems come from `tsc --pretty false` lines (`file(line,col): error TScode:
  message`); `build`, `server` and `boot` problems carry the tool's message and, when present, the
  file and line it names. Output that cannot be parsed becomes one problem with the text.
- `skipped.reason` is either `after failed <step>` or the named cause (for example
  `BOOT_BROWSER_UNAVAILABLE`).
- `facts.operations` is the number of operations in the admitted manifest; `facts.migrations` the
  number of files in `conexus/migrations/`; `facts.jsGzipBytes` the gzip size of the JavaScript files
  in the build output; `durationMs` is wall time, rounded to milliseconds.
- `boot` stubs answer each operation with a deterministic value built from its output schema: the
  lower bound when set, otherwise `0`, `''`, `false`, `[]`, or an object with its required keys.

**Check limits.** Per step wall time: `generate` 10 s, `typecheck` 60 s, `build` 60 s, `server` 60 s,
`boot` 45 s. At most 50 problems per step and 2,000 characters per message; the report says how many
were dropped. Redaction as today (`commandEvidence`) before anything leaves the sandbox. The check
makes no network call outside the sandbox.

### Generated client (AC-4)

| Manifest schema | zod (`api.gen.ts`) | TypeScript (`types.gen.ts`) |
|---|---|---|
| `string` with `minLength`, `maxLength` | `z.string().min(a).max(b)` (bounds only when set) | `string` |
| `integer` with bounds | `z.number().int().min(a).max(b)` | `number` |
| `number` with bounds | `z.number().min(a).max(b)` | `number` |
| `boolean` | `z.boolean()` | `boolean` |
| `object` (closed) | `z.strictObject({...})`; a key not in `required` is `.optional()` | `{ k: T; o?: T }` |
| `array` with `maxItems` | `z.array(T).max(n)` | `readonly T[]` |

Operations are emitted in sorted id order. Operation ids and property names are already limited to
identifier characters by `admitManifest`, so no escaping is needed. `api.<op>` throws
`ConexusError { code, detail }`: from the JSON error body when it parses, else `code: 'HTTP_<status>'`
and `detail` the first 500 characters of the body.

### Tool contract amendment to spec 0002

| Tool | Planejar | Construir | Source |
|---|---|---|---|
| `conexus_check` | no | yes | Conexus, `createTool` beside `connector_fetch` |

`BUILDER_MODES.build.availableTools` and the mode guard list it.

### Value sourcing

| Action | Value | Source |
|---|---|---|
| `generate` | operation ids, input and output schemas | `conexus/manifest.json` in the checkout |
| `typecheck` | problems | `tsc` output parsed per line |
| `boot` | the CSP served | the Prévia's production CSP constant (`preview-routes.ts`) |
| `boot` | API answers | the smoke's empty stubs per output schema |
| `conexus_check` | `CheckReport` | stdout JSON of `check.mjs` |
| admission | refusal evidence | the failed step's `problems` |
| `facts.operations`, `facts.migrations` | counts | manifest and `conexus/migrations/` |
| `facts.jsGzipBytes` | size | the built `dist` assets |
| starter tokens | colors, radius, fonts, chart colors | the neutral Conexus app token set committed with the starter |
| payload admission | template pins | new `TEMPLATE_REF` and `RECIPE_SHA256`, migration 0037 |

### Data model

- Migration `0037`: replaces the payload admission function with the new template pins and the
  profile `REACT_VITE_V2`, as `0014` did. The V2 `TEMPLATE_REF` and `RECIPE_SHA256` are the values
  the slice 4 template build produces; they and every V1 value that stays readable live in one table
  that the migration, the registry (`registry/application-artifact-store.ts`) and the runtime
  (`application-artifact-runtime.ts`) all use.
- The builder run record keeps the refusal `problems` it already stores as evidence, now uncut.

### Key invariants

- The gate is platform code: admission never executes a file from the candidate.
- Generated files are regenerated before every `typecheck`; the candidate's copy never counts.
- The tool and admission run the same `check.mjs` from the same Hub release.
- No inline style element anywhere in the starter; the CSP stays `style-src 'self'`.

### Security model

- In a Construir turn the tool runs as `conexus-agent` inside the run's sandbox, with the same
  authority the shell tools have. In admission, root only prepares the Hub's copy of the candidate
  tree and starts `check.mjs`; every step that executes app code drops to `conexus-agent`.
- `check.mjs` and the compiler root are root owned and read only for `conexus-agent`, so neither the
  model nor app code can change the gate.
- `check.mjs` makes no network call outside the sandbox; `boot` answers the API with stubs and never
  touches the Prévia database.

### Configuration required

None. No new environment variables.

### Critical test scenarios

- Happy path: a new Project's starter passes `conexus_check` with `ok: true` and five `passed`
  steps; verifies **AC-2**, **AC-5**.
- Generated contract: renaming an output field in the manifest makes a screen that reads the old
  field fail `typecheck` with its file and line; verifies **AC-4**.
- Gate ownership: a candidate that replaces `check.mjs` inputs or adds a `conexus/check.sh` that
  exits 0 is still refused on a type error; verifies **AC-9**.
- Uncut evidence: a server step error longer than 400 characters reaches the next turn whole;
  verifies **AC-9**.
- Boot: a component that throws on mount yields a `boot` problem with the thrown text, and the
  revision is still admitted; verifies **AC-6**, **AC-7**.
- CSP: the starter's dialog and chart produce zero CSP violations in `boot`; verifies **AC-2**,
  **AC-7**.
- Tool table: Planejar lists no `conexus_check`, Construir lists it; verifies **AC-8**.
- Allowlist: an import of a transitive package (present in the compiler `node_modules` but not in
  the table) fails `build` and `typecheck` naming the specifier; verifies **AC-1**.
- Stale generated file: a candidate whose committed tree would carry an old `api.gen.ts` has none in
  Git after admission, and the Prévia build regenerates it; verifies **AC-4**.
- Privilege: during admission, a handler or screen that writes to `/opt/conexus` fails with a
  permission error; verifies **AC-5**.
- Timeout: a build step that hangs ends as `STEP_TIMEOUT` and its processes are gone; verifies
  **AC-5**.
- Deep link: loading `/notas` on the Prévia returns the app; verifies **AC-10**.
- Old artifact: an artifact built on the V1 template still reads after the switch; verifies
  **AC-12**.

## Build plan

Slices 1 to 3 do not need the new packages and land first; slices 4 and 5 land together.

1. Platform check: reshape `buildApplicationInSandbox` into the `check.mjs` engine with
   `typecheck`, `build`, `server`, `boot` (`generate` is a no op until slice 4), the limits, the
   parsers, root owned read only placement and app code as `conexus-agent`; admission and the Prévia
   build call it; `check.sh` and the `check` field leave the starter; the candidate pull excludes
   `*.gen.ts`; prove Chromium as `conexus-agent`. Satisfies **AC-4**, **AC-5**, **AC-6**, **AC-7**,
   **AC-9**.
2. `conexus_check` tool: `createTool`, the mode table, the guard, the 0002 AC-6 test, the UI
   sentences. Satisfies **AC-8**.
3. Deep links: one shared path classifier with a test matrix (GET, HEAD, encoded path, trailing
   slash, dotted missing file) used by `preview-routes.ts`, `application-host-routes.ts` and the
   `boot` server. Satisfies **AC-10**.
4. Compiler v2: compiler `package.json` and lockfile, `vite.config.mjs` with the allowlist
   resolver, the platform `tsconfig.json`, the E2B template build, the one pin table with the V1
   readable values, migration `0037`, `REACT_VITE_V2`, and the manifest to client generator per
   *Generated client*. Measure the check time and sandbox start in E2B. Satisfies
   **AC-1**, **AC-4**, **AC-12**.
5. Starter v2: `main.tsx`, `router.tsx`, `routes/home.tsx`, `styles.css` tokens, the curated
   `components/ui` set with the CSP safe chart, the AGENTS.md stack line. Satisfies **AC-2**,
   **AC-3**.
6. Knowledge: the `conexus-app-ui` and `conexus-app-code` skills with examples, the `conexus-server`
   browser section, the prompt v2 stack facts and the "report counts, not validated" rule; install
   the `shadcn` and `frontend-design` skills for the dev agents, plus React patterns and TanStack
   skills after checking TanStack Intent. Satisfies **AC-3**, **AC-11**, **AC-13**.
7. Proof: recreate the branch test Projects, then run spec 0002's AC-27 cases and AC-28 in the
   browser, recording each run's last `CheckReport`. Satisfies **AC-1** to **AC-13** end to end.

## Migration plan

**Strategy**: no live migration. Only branch test Projects exist; they are recreated on the new
starter, not migrated.
**Rollback**: the old template pins stay readable; reverting the slice 4 and 5 commits restores V1
builds.
**Risks**: a larger E2B image may slow sandbox start (measured in slice 4); headless Chromium may not
run as `conexus-agent` (slice 1 proves it, with the skipped path as fallback).

## Consequences

**Positive**:
- Dashboards and forms get real components and charts, which the `erp/sales-dashboard` case needs.
- One report feeds the model, admission, the Prévia build and the UI; errors arrive by file and line.
- The Builder can no longer weaken its own gate.
- Screens and server share one typed contract, so a renamed field fails before the person sees it.

**Negative / tradeoffs**:
- First load JavaScript grows from about 60 KB to about 280 KB gzip; chart routes should load lazily.
- The E2B image grows by about 170 MB of `node_modules`; sandbox start time is unmeasured.
- Models know Base UI and TanStack Table v9 less than Radix and v8; the skills carry worked examples.
- Components are copied into each app, so a later kit fix does not reach old apps by itself.
- Each check adds a type check and a browser boot to the turn (estimated under 15 s, unproven).

**Neutral**:
- The server half under `conexus/` is unchanged.
- Spec 0002's AC-27 eval runs after slice 6, on the stack and prompt that will stay.

## Follow-up

- [ ] Company style: an installation level setting (colors, font, logo) that becomes the app tokens,
      and in Planejar the Builder asks "seguir o padrão da empresa ou um visual novo para este app?".
      After Q4.
- [ ] A structured check card in the UI (five steps, first problems) once the sentences prove too
      thin.
- [ ] Revisit ECharts only if a dashboard case needs a chart Recharts lacks.
- [ ] Derive an OpenAPI document from the manifest when something outside the app calls it.
- [ ] Record decision C-032 (Builder off the Factory) and this profile change in `docs/decisions/index.md`.
- [ ] Add the installed dev skills to the `## Agent skills` section of `AGENTS.md` (via `/jm-sync`).
