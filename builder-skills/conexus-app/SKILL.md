---
name: conexus-app
description: How an app's screens look and are built. Covers the fixed design system, how a page is composed, the shell, list, record, dashboard and form patterns with complete example pages, the four data states, words on screen, and the code (routes, TanStack Query, Table v9, forms, pt-BR formats, charts). Use before designing or building any screen, including when a plan describes its screens.
---

# App screens

Every Conexus app looks like one family of company tools. The look is fixed: you never invent a palette, a typeface or a radius. The design is yours, and it comes from the person's work: what they must see first, how a record moves, what needs their attention. A person who uses five company apps is served by the same look and by screens that each fit their job.

## Designing a screen

1. Ground it in the work. Name who opens the screen, at what moment, and what they decide or do there. The work's own objects and words, such as a repair request, a visit or a delivery, are where the screen's choices come from.
2. Open with the most characteristic thing in that work: the records waiting on this person, today's visits, what is late. The first screen of an app answers why the person opened it.
3. Before code, write the screen in a few lines: what sits at the top, what needs attention, and the work itself. Then read it against the plan's part for the person, and revise any part that reads like the default you would produce for any app.
4. After building, read each screen's code against this skill. You never see the Prévia, so the code is what you check.

## Composing a page

- The top says where the person is and what they can do: the `h1`, one line on what the page is for when the name does not say it, and the primary action on the right.
- Then what needs attention, when the app has it: counts by status that filter the list, or the few records that are late or waiting. A count of zero says so.
- Then the work itself: the list, the record or the chart.
- Every part that reads data shows its four states (see Data).

## Patterns

Each file in `references/` is a complete, type-checked page of one pattern. Read the one your screen's pattern names and follow its structure. Its fields and words are only an example; yours come from the plan.

- **Shell.** `references/shell.tsx`, which becomes `router.tsx`: the kit's `Sidebar` with 3 to 7 sections named in the person's words, every route, and the first screen at `/`. An app with a single screen needs no shell.
- **List.** `references/list.tsx`, in `routes/`: counts by status as tabs that filter, search, a v9 table with a status `Badge` and a link to each record, pagination past 25 rows, and empty text that tells "none yet" from "none match". The statuses live in one shared module, `references/ticket-status.tsx`, in `components/`.
- **Record.** `references/record.tsx`, in `routes/`: one record with its fields, its status change as a form, and its history with who and when.
- **Dashboard.** `references/dashboard.tsx`, in `routes/` as a lazy route: a row of 3 or 4 KPI cards, one chart, then the table that explains the numbers. Lead with what the person decides on.
- **Form.** `references/form.tsx`, in `routes/`: one column, at most `max-w-xl`, the label above each input, hints in `FieldDescription`, errors in `FieldError`, and a submit button that names the action. Long forms split into `FieldSet` groups. Up to four fields fit a `Dialog`; more get their own page.

## The look

- Look in `app/src/components/ui/` before you write a component, and compose from what is there. Do not hand-roll a lookalike of a component that exists.
- Colors, radius and fonts come only from the tokens in `app/src/styles.css`, through the classes that read them: `bg-background`, `text-muted-foreground`, `border`, `bg-primary`, `rounded-md`. Never write a hex, rgb or oklch value, a palette class such as `text-red-700`, or an arbitrary value such as `bg-[#fff]` in a component. Errors use `variant="destructive"` or `text-destructive`. A color the tokens lack means a new token in `styles.css`.
- Change the accent only when the person asks: edit `--primary` and `--ring` in both `:root` blocks of `styles.css` (light and dark), and keep text on the accent readable.
- For a one-off spacing or width, pass `className`. Do not edit a file in `components/ui/` to change one screen.
- The components sit on Base UI, not Radix. There is no `asChild`: pass `render`, as in `<Button render={<Link to="/chamados/novo" />}>`. `Select` takes an `items` array of `{ label, value }`. The type check reports both mistakes.

## Code

```
app/src/
  main.tsx            providers, and lib/zod.ts loaded first. Leave both.
  router.tsx          the shell and every route
  routes/             one file per screen
  components/ui/      the kit. Do not edit.
  components/         your components shared by two or more screens
  lib/                utils.ts, zod.ts (leave it), format.ts and errors.ts (use and extend them)
  conexus/            api.gen.ts (when the manifest has operations) and failures.gen.ts, generated on every check. Never edit or write them.
  styles.css          the design tokens
```

**Routes.** All routes are code routes in `router.tsx`. Paths use the person's word in Portuguese, such as `/chamados`. Link with `Link` from `@tanstack/react-router`, never a plain `<a href>`; a path that does not exist fails the type check. A record route has a path like `/chamados/$id` and reads it with `getRouteApi('/chamados/$id').useParams()`. Filters, search text, sort and the selected tab live in search params, validated with `validateSearch: z.object({ ... })` where the route is declared. Screens with charts load lazily, as the dashboard does, so the first screen never imports `recharts`. Opening any path directly serves the app.

**Data.** Call the server only through `api` from `@/conexus/api.gen`, never with `fetch`. It is generated from `conexus/manifest.json` and exports `api.<operation>(input)`, `schemas.<operation>.input`, the types `Input<'op'>` and `Output<'op'>`, and `ConexusError`.
- Read with `useQuery`. The key is `[operationId, input]`, and the input object is the whole cache identity.
- Write with `useMutation({ mutationFn: api.<operation> })`. On success, invalidate every read the write changes by its operation id, which covers every filter already cached. Do not copy server data into `useState`.
- Every part that reads data shows four states: loading (`Skeleton`), error (`Alert` with `errorMessage(error)`), empty (`Empty` that says what to do next) and data.
- `errorMessage(error)` from `lib/errors.ts` turns a thrown `ConexusError` into the sentence of its row in the Conexus failure table. `connectionMessage(data.failure)` does the same for a failed Conexão read that the handler returned (`conexus-server`, Failures). Never show a code, the `detail` or a stack, and never write a retry sentence of your own.

**Forms.** `useForm` with `resolver: zodResolver(schemas.<op>.input)`, typed with `Input<'op'>`, so the browser checks the limits the runner enforces. Register inputs with `form.register('name')`, a number with `{ valueAsNumber: true }`; a `Select`, radio group or checkbox goes through `Controller`. Disable the submit button while `mutation.isPending`, show `errorMessage(mutation.error)` on failure, and after success invalidate the reads and confirm with `toast.add({ title, type: 'success' })`. Never put an author or a person's name in an input; the server reads the person from `caller`.

**Tables.** The installed TanStack Table is v9, and the v8 API that models know fails the type check.
- `useTable`, not `useReactTable`, and no `getCoreRowModel`.
- `tableFeatures({ ... })` declares what the table uses. Sorting, filtering and pagination do nothing until `rowSortingFeature`, `columnFilteringFeature` or `rowPaginationFeature` is registered there, with each row model as a slot of the same object, such as `sortedRowModel: createSortedRowModel()`.
- `createColumnHelper<typeof features, Row>()`, then `helper.columns([...])`. Render with `<table.FlexRender header={header} />` and `<table.FlexRender cell={cell} />`.
- Read state with `table.state`; there is no `getState()`.
- Keep `features`, `columns` and the empty fallback at module scope, or the table rebuilds on every render.

**Formats.** `lib/format.ts` prints money (`R$ 1.234,56`), numbers, percentages and dates (`dd/MM/yyyy`) for pt-BR, from a number or decimal text. Use it instead of `toLocaleString` or a new `Intl` call. `calendar.tsx` takes `locale={ptBR}` from `date-fns/locale`. A native `type="date"` input gives `yyyy-mm-dd`, which is what an operation should receive.

**Charts.** Recharts through `@/components/ui/chart`, as the dashboard does.
- Pick the form by the question. Bars compare categories, and lie on their side when labels are long. A line shows change over time. One number is a KPI card. A pie shows parts of a whole only with 2 to 5 parts. Two measures with different units are two charts.
- Color comes from `--chart-1` to `--chart-5`: `color: 'var(--chart-1)'` in the `ChartConfig` and `fill="var(--color-<key>)"` on the series. Never give meaning by color alone.
- Pass a `formatter` to `ChartTooltipContent`, since its default formats with the browser locale. Show a sentence instead of an empty plot when there is no data.
- `components/ui/chart.tsx` sets colors on the container's `style`. shadcn's original `ChartStyle` writes a `<style>` element, which the Prévia blocks. Do not restore it.

## Writing on screens

- Write for the person using the app, in the vocabulary of their request and the plan. They manage "chamados", not "registros da tabela".
- A button says exactly what happens, and the action keeps its name through the flow: "Abrir chamado" produces "Chamado aberto".
- Failure and emptiness give direction. Say what happened and what to do next, without apologizing and without a code: "Não foi possível carregar os chamados. Tente de novo em instantes." "Nenhum chamado ainda. Abra o primeiro."
- Plain verbs and sentence case. Dates read `dd/mm/aaaa`, money reads `R$ 1.234,56`.

## Quality floor

- Works down to a phone width: the sidebar collapses, and wide tables sit in an `overflow-x-auto` wrapper.
- Keyboard focus stays visible. Every input has a label. One `h1` per screen.
- Text has readable contrast on its background. Motion respects `motion-reduce:`.

## Platform limits

The Prévia serves the app under a policy that allows only its own origin. The check's `boot` step reports every violation, and you fix them.

- No `<style>` element, no `dangerouslySetInnerHTML` with CSS, no inline `style` attribute in `index.html`. React's `style` prop is allowed.
- No external fonts, CDN scripts, remote images or `@import url(...)`. Put images under `app/src` and import them. Icons come from `lucide-react`.
- `main.tsx` wraps the app in Base UI's `CSPProvider`. Leave it.

## Sources and license

"Designing a screen" and "Writing on screens" adapt passages of `skills/frontend-design/SKILL.md` (grounding in the subject, opening with the most characteristic thing, planning then reviewing against the brief, and the writing section), and the platform limits adapt one line of `skills/web-artifacts-builder/SKILL.md`, both from https://github.com/anthropics/skills and licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0). Changed: cut down to internal business tools, with Portuguese examples, and the aim of a distinctive identity replaced by the fixed Conexus look.
