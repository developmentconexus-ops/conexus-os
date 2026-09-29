---
name: conexus-app-ui
description: Use before building or restyling any screen of an app. Covers the design system (components and tokens), layout patterns, charts, the words on screens, the quality floor and the platform limits that fail the check.
---

# Designing app screens

Every Conexus app looks like one family of company tools. The platform fixes the system. You apply it and never invent a new look. A visit schedule is not a place for a distinctive brand, and a person who uses five company apps is served by consistency.

The code side (routes, data, forms, tables) is in the `conexus-app-code` skill.

## The system

- Look in `app/src/components/ui/` before you write a component, and compose from what is there. Do not hand-roll a lookalike of a component that exists.
- Colors, radius and fonts come only from the tokens in `app/src/styles.css`. Use the classes that read them: `bg-background`, `text-muted-foreground`, `border`, `bg-primary`, `rounded-md`. Never write a hex, rgb or oklch value, a palette class such as `text-red-700`, or an arbitrary value such as `bg-[#fff]` in a component. Errors use `variant="destructive"` or `text-destructive`.
- A need for a color the tokens lack means a new token in `styles.css`, not a literal in a component.
- Keep one neutral look. No per-app palette, typeface, gradient or radius. Change the accent only when the person asks: edit `--primary` and `--ring` in the `@theme` block of `styles.css`, nowhere else, and keep text on the accent readable.
- For a one-off spacing or width, pass `className`. Do not edit a file in `components/ui/` to change one screen.
- The components sit on Base UI, not Radix. There is no `asChild`. To make a trigger render another element, pass `render`: `<DialogTrigger render={<Button />}>Novo chamado</DialogTrigger>`. `Select` takes an `items` array of `{ label, value }`. The type check reports both mistakes.

## Layout patterns

- **App shell.** A sidebar with the app's own sections, 3 to 7 items named with the person's words, and a content area. Each page starts with an `h1` and the one primary action on its right. The shell lives in the root route of `router.tsx`. An app with a single screen needs no shell.
- **List with filters, then detail.** Filters in one row above the table, the search field first. The table below, with the count of results. Filters live in the URL search params. A row opens `/visitas/$id`, or a `Sheet` for a quick look. Past about 25 rows, paginate.
- **Form.** One column, at most `max-w-xl`. Each input is a `Field` with the label above, the hint in `FieldDescription` and the error in `FieldError`. Long forms split into `FieldSet` groups with a `FieldLegend`. Up to four fields fit a `Dialog`. More get their own page. The submit button names the action and sits at the end of the form.
- **Dashboard.** First a row of 3 or 4 KPI cards, each with one number and a short label. Then one or two charts. Then the detail table that explains them. Lead with what the person decides on.

## Charts

Recharts through `@/components/ui/chart`. `references/tickets-chart.tsx` is a complete example.

- Pick the form by the question. Bars compare categories, and lie on their side when labels are long. A line shows change over time. One number is a KPI card, not a chart. A pie or donut shows parts of a whole only with 2 to 5 parts, otherwise use bars. Two measures with different units are two charts, not two axes.
- Color comes from the `--chart-1` to `--chart-5` tokens: `color: 'var(--chart-1)'` in the `ChartConfig`, and `fill="var(--color-<key>)"` on the series. One series uses `--chart-1`. Never give meaning by color alone.
- Format for pt-BR with `lib/format.ts` (see `conexus-app-code`). Axes take `tickFormatter`. The tooltip default calls `toLocaleString` with the browser locale, so pass a `formatter` to `ChartTooltipContent` that returns the whole row, as the example does. Big axis numbers can use `Intl.NumberFormat('pt-BR', { notation: 'compact' })`.
- Recharts adds about 100 KB gzip. Put screens with charts on a lazy route so the first load stays small, and never import `recharts` from the home route.
- The chart file in `components/ui/chart.tsx` sets colors on the container's `style`. shadcn's original `ChartStyle` writes a `<style>` element, which the Prévia blocks. Do not restore it.
- Show a message instead of an empty plot when there is no data.

## Writing on screens

Words on a screen exist to make it easier to understand and use. Bring the same restraint to them as to spacing and color.

- Write for the person using the app, in the vocabulary of their request and the plan. They manage "visitas", not "registros da tabela".
- Use active voice. A button says exactly what happens: "Salvar chamado", not "Enviar". An action keeps its name through the flow. The button "Salvar chamado" produces the message "Chamado salvo".
- Failure and emptiness give direction. Say what happened and what to do next. An error does not apologize, does not say "Ops", and never shows a code. "Não foi possível carregar as visitas. Tente de novo em instantes." An empty screen invites an action: "Nenhuma visita ainda. Crie a primeira."
- Plain verbs, sentence case, no filler. Each written element does one job. Dates read `dd/mm/aaaa`, money reads `R$ 1.234,56`.

## Quality floor

Build to it without announcing it.

- Works down to a phone width. The sidebar collapses, wide tables sit in an `overflow-x-auto` wrapper.
- Keyboard focus stays visible. Never remove an outline. Every input has a label. One `h1` per screen.
- Text has readable contrast on its background. Motion respects `motion-reduce:`.
- Spend emphasis in one place per screen, usually the primary action. Keep the rest quiet.
- Check your work by reading the code of each screen against this list, since you never see the Prévia.

## Tells to avoid

These mark a generated screen. They are defaults, not choices.

- Content chopped into identical cards, one radius and one soft shadow on everything, gradient washes as decoration.
- A tracked-out, all-caps label above every heading. Numbered markers (01, 02, 03) on content that is not a sequence.
- One word of a heading in a different color or italic.
- Labels joined with middle dots, or an arrow appended to every button.
- A big number with a gradient accent as the hero of every page.
- A centered layout for a tool, purple gradients, an icon before every heading, emoji.
- Fade-and-slide entrances on every section and hover motion on every card. Motion that answers a click, such as opening a dialog, is fine.

## Platform limits

The Prévia serves the app under a policy that allows only its own origin. The check's `boot` step reports every violation, and you fix them.

- No `<style>` element, no `dangerouslySetInnerHTML` with CSS, no inline `style` attribute in `index.html`. React's `style` prop is allowed.
- No external fonts, CDN scripts, remote images or `@import url(...)`. The font is the system stack in the tokens.
- Put images and other files under `app/src` and import them: `import logo from '@/assets/logo.svg'`. Icons come from `lucide-react`.
- `main.tsx` wraps the app in Base UI's `CSPProvider`. Leave it.

## Sources and license

The sections "Writing on screens", "Quality floor" and "Tells to avoid" adapt passages of `skills/frontend-design/SKILL.md` (the writing section, the list of generated-design traits and the restraint paragraph) and one line of `skills/web-artifacts-builder/SKILL.md`, both from https://github.com/anthropics/skills and licensed under the Apache License, Version 2.0 (http://www.apache.org/licenses/LICENSE-2.0). Changed: cut down to what applies to internal business tools, with Portuguese examples, and the aim of a distinctive identity replaced by the fixed Conexus look.
