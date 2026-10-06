---
version: alpha
name: Conexus OS
description: Governed enterprise workbench where an AI agent builds and evolves business applications under explicit authority.
colors:
  canvas: "#F6F7F8"
  surface: "#FFFFFF"
  surface-3: "#EFF1F3"
  surface-4: "#E6E9EC"
  line: "#DDE1E5"
  line-strong: "#8A939C"
  text: "#121518"
  text-2: "#59616A"
  ink: "#121518"
  on-ink: "#FFFFFF"
  accent: "#B07A0C"
  accent-text: "#9A6A08"
  accent-soft: "#FBF1D9"
  mark: "#C08A12"
  success: "#1A7F4B"
  warning: "#B54708"
  danger: "#C0283D"
  on-accent: "#FFFFFF"
  preview-paper: "#FFFFFF"
  dark-canvas: "#0E1012"
  dark-surface: "#16191C"
  dark-surface-3: "#1D2125"
  dark-surface-4: "#262B30"
  dark-line: "#2C3237"
  dark-line-strong: "#6E7780"
  dark-text: "#EEF0F2"
  dark-text-2: "#A3ABB3"
  dark-ink: "#EEF0F2"
  dark-on-ink: "#121518"
  dark-accent: "#F2B53A"
  dark-accent-text: "#F2B53A"
  dark-accent-soft: "#3A2E12"
  dark-mark: "#F2B53A"
  dark-success: "#6FD39A"
  dark-warning: "#F5A25B"
  dark-danger: "#F28B9A"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "2.1rem"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.02em"
  title:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontSize: "1.05rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.01em"
  body:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.9375rem"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1
  eyebrow:
    fontFamily: "Hanken Grotesk, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.08em"
  fact:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
rounded:
  control: "6px"
  object: "10px"
  card: "14px"
  composer: "16px"
  pill: "999px"
spacing:
  xs: "0.25rem"
  sm: "0.5rem"
  md: "0.75rem"
  lg: "1rem"
  xl: "1.5rem"
  2xl: "2.5rem"
components:
  button-primary:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "34px"
    typography: "{typography.label}"
  button-default:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "34px"
    typography: "{typography.label}"
  button-default-hover:
    backgroundColor: "{colors.surface-3}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    padding: "0 0.9rem"
    height: "34px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    size: "32px"
  icon-button-round-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.accent-text}"
    rounded: "{rounded.pill}"
    size: "32px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.text-2}"
    rounded: "{rounded.control}"
    height: "34px"
    padding: "0 0.6rem"
  nav-item-hover:
    backgroundColor: "{colors.accent-soft}"
    textColor: "{colors.text}"
  nav-item-active:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.control}"
    padding: "0 0.75rem"
    height: "36px"
  chip:
    backgroundColor: "{colors.surface-3}"
    textColor: "{colors.text-2}"
    rounded: "{rounded.pill}"
    padding: "0 0.55rem"
    height: "1.5rem"
  panel:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.object}"
    padding: "1.5rem"
  project-card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.card}"
  composer:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text}"
    rounded: "{rounded.composer}"
    padding: "0.7rem 0.8rem 0.4rem"
---

# Design System: Conexus OS

How Conexus looks, moves and speaks. This guide follows the
[DESIGN.md format](https://github.com/google-labs-code/design.md) from Google Labs (Apache 2.0,
version alpha): the front matter holds the tokens, and the sections below give the rules, under the
format's section names and order so `npx @google/design.md lint DESIGN.md` can read them. Each rule
uses the words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and **must not** are
defects in review, **should** and **should not** need a stated reason to break, and **may** is a
free choice.

`packages/brand/src/tokens.css` **must** define every color and radius the front matter names, with
the same value. The front matter's type, spacing and component sizes are the values the stylesheets
use. The format's `primary` is our `ink`, and the front matter does not repeat it under a second
name. The guide states the target. Code that departs from it is listed in
[architecture section 11](docs/reference/architecture.md#11-risks-and-technical-debt) with the wave
that removes it. Owners next door: the [product guide](docs/product/contract.md) for what a screen
means, [testing](docs/development/testing.md#8-screens) for how a screen is proved,
[delivery](docs/development/delivery.md#approve-a-new-surface-from-something-usable) for who approves
a new surface, and [architecture](docs/reference/architecture.md#the-web-app) for what the web app
may own.

## Overview

**"Grafite e Ipê".** Graphite neutrals, flat and separated by hairlines, so the person's own app is
the most colorful thing on screen. Ipê, a warm gold, is the one accent. Prose is sans, and facts are
mono.

- A screen's regions (the top bar, the scope rail, the page column and the panes) **must** take no
  radius and no shadow. Hairlines separate them.
- Conexus designs its own screens, structure and page patterns. `@mastra/playground-ui` supplies
  parts only (C-031).
- Each need **must** have one way. A second way beside the first, such as a native `title` beside
  `Tooltip`, is a defect.

**Why.** The person's app is the content. The frame around it stays quiet so it never competes, and
one way per need makes every screen read the same.

**Right.** The Projects page: hairline cards on the canvas, with color only in the thumbnails.

**Wrong.** A gradient header and a shadow under the scope rail.

## Colors

- Every color **must** be a `--cx-*` token. Only `tokens.css` holds a raw value, including shadows
  and overlays.
- A new token **must** be defined in the light, OS-dark and chosen-dark blocks under one name, and
  in the front matter.
- Ipê (`accent`) **must** mark only focus, the caret, selection (including the chosen value of a
  control), the active lens and the agent at work. It is never a resting button fill, a heading or
  decoration. The send button turns ipê on hover.
- The primary action **must** be `ink` with `on-ink`.
- Success, warning and danger **must** mark status only, always beside a word. Their grounds are low
  tints of the surface.
- Text **must** keep 4.5:1 contrast with its ground in both themes.
- Light is the default. Dark follows the system unless the person picks a theme.
- Mastra parts **must** follow the brand through `apps/web/src/mastra-theme.css`, never through an
  override per component.

**Why.** One accent sends the eye to what is happening now. Tokens let both themes change in one
file.

**Right.** `border-bottom: 1px solid var(--cx-line)`.

**Wrong.** `box-shadow: 0 8px 24px rgb(0 0 0 / .06)` written in a screen's stylesheet.

## Typography

- Headings **must** use Bricolage Grotesque (`display`, `title`). Everything read as language uses
  Hanken Grotesk (`body`, `label`, `eyebrow`).
- JetBrains Mono (`fact`) **must** be used for facts only: model ids, paths, commands, times,
  revisions, error codes and counts.
- Numerals **must** be tabular.
- Prose **must not** go below 12px. Mono stamps and group labels **must not** go below 11px.
- The fonts **must** be self-hosted from `packages/brand/fonts`. No other family and no CDN.
- `display` shrinks from 2.1rem to 1.6rem on narrow screens (`clamp(1.6rem, 3.2vw, 2.1rem)`). The
  front matter gives its largest size.

**Why.** Mono marks what a person may copy or compare exactly. Used as decoration, it stops meaning
that.

**Right.** A failed run shows its code, `SOURCE_MOVED`, in mono after the sentence.

**Wrong.** A section title in mono to look technical.

## Layout

- Spacing **must** come from the `spacing` scale.
- A screen's own structure **must** use `cx-*` classes. Tailwind utilities **may** only adjust a
  composed Mastra part.
- A brand component **must** size itself with a `cx-*` class, never a `style` attribute, so it
  renders under the sign-in theme's strict Content Security Policy.
- A screen **must** reflow at 390px wide and at 200% zoom with no sideways scroll.

**Why.** A class keeps the structure in a stylesheet, where one change reaches every screen. An
inline style escapes both the stylesheet and the policy.

**Right.** `<div className="cx-page">`, with its rule in `frame.css`.

**Wrong.** `<div className="grid gap-[13px] p-5">` in a Conexus screen.

## Elevation & Depth

- Surfaces **must** be separated by hairlines (`line`), not shadows. A card at rest does not float.
- A shadow **may** appear only on a hover lift, a popover or a menu, from a token.
- There **must not** be glass, a gradient surface, texture or imagery, except the Preview.

**Why.** A flat screen reads faster. Depth appears only where something sits above the page.

**Right.** A menu opens with a shadow, and the card under it keeps its hairline.

**Wrong.** A card placeholder filled with a repeating gradient.

## Shapes

- Every radius **must** come from `rounded`: `control` for buttons and inputs, `object` for windows,
  popovers and panels, `card` for Project cards, `composer` for the composer, and `pill` for chips.
- Regions and panes take no radius.

**Why.** A short scale lets shape say what a thing is.

**Right.** `border-radius: var(--cx-radius-control)`.

**Wrong.** `border-radius: 14px` written by hand.

## Components

The front matter names each component and its tokens: the buttons (`button-primary`,
`button-default`, `button-ghost`, `icon-button`), navigation items, inputs, chips, panels, Project
cards and the composer. A state such as hover is its own entry.

- A component **must** take its colors, radius and type from tokens.
- A new component **must** enter the front matter in the same change.
- A Mastra part **must** be used as shipped and painted through `mastra-theme.css`. New screens
  **must not** adopt its structure blocks, and no part is forked.

**Why.** Mastra keeps improving its parts. A painted part takes each improvement, and a forked or
patched one loses it.

**Right.** A Mastra button that takes the brand's colors from `mastra-theme.css`.

**Wrong.** `[data-slot="composer-box"] { border-radius: 16px }` in a screen's stylesheet.

## Motion

- **Encaixe** is the one authored motion: the mark's two pieces slide apart and fit back while the
  agent works, and fit once on the first load. There **must not** be a second motif, such as an
  orb, a shimmer or a bounce.
- All motion **must** stop under `prefers-reduced-motion`, and the end state makes sense without it.

**Why.** With one motion tied to the agent, movement always means that Conexus is working.

**Right.** The mark moves while a run works and rests when it ends.

**Wrong.** A shimmer on "Pensando…" beside the moving mark.

## Interaction and accessibility

- Hover **must** move a surface one step up its scale: `surface`, `surface-3`, `surface-4`. Press
  shows a fill and never shrinks.
- `:focus-visible` **must** draw a 2px `accent` outline.
- A disabled control **should** say why when the reason is not obvious.
- Tab **must** reach every action in reading order, Esc closes what opened, and every drag has a
  keyboard path.
- Every input **must** have a label, and every icon-only button a pt-BR `aria-label`.
- The console **must** show no error and no Content Security Policy violation.

**Why.** A person on a keyboard or a screen reader uses the same product as everyone else.

**Right.** The effort slider moves with the arrow keys and shows the outline on focus.

**Wrong.** A button that shows focus only with a lighter fill.

## Iconography

- Icons **must** come from `lucide-react` with its defaults: outline, stroke 2 and round caps, colored
  by `currentColor` from a token on the parent.
- Size follows the neighbor: 14px in toolbars, 16px inline and 18px in the rail.
- The stop control is the one filled icon. An icon has one meaning and never shows status alone. A
  decorative icon is `aria-hidden`.
- Provider logos **may** appear only in model pickers.
- There **must not** be an icon font, an emoji, a text glyph or a second icon set.

**Why.** One set at one stroke reads as one product.

**Right.** `<Square fill="currentColor" />` on the stop control.

**Wrong.** `'✓ '` typed into a button's text.

## Voice

- Everything a person reads **must** be in pt-BR, including `aria-label` and placeholders. English
  left by a Mastra part is replaced in `builder-copy.ts`.
- Text **must** use sentence case, with capitals only in small group labels. Buttons are verbs
  ("Permitir", "Ver aplicativo"), never a bare "OK".
- Text **must** be simple, calm and responsible: no exclamation, no empty apology and no emoji. The
  only symbols are `·` and `…`.
- The product says **você**. In chat the agent is **Conexus** and speaks in the first person. In
  system text it is **o agente**. Product nouns are capitalized: Workspace, Projeto, Prévia,
  Construir, and the lenses Prévia, Código, Alterações and Sobre.
- One action **must** have one text everywhere.
- A failure's words **must** come from `contracts/technical/failures.json`, read by
  `apps/web/src/app/failure.ts`, with the internal code in mono. A failure Conexus caused never asks
  the person to try again. A failure the person can fix says what to change.
- A tool **must** show as a sentence while it runs and when it ends (`tool-sentences.ts`), never as
  its technical name. Reasoning shows only as "Pensando…".
- What is not built says "em breve". Numbers and dates use the Brazilian format ("1.234,5",
  "5 de out."). Examples are real company requests, never invented customers or figures.

**Why.** A non-technical person reads every word as a promise. Plain, calm Portuguese is what earns
their trust.

**Right.** The same verb on every button that does the same thing.

**Wrong.** "Tentar novamente" on one screen and "Tentar de novo" on another.

## The Build surface

- The app **must** be the main area, with the conversation beside it. Both survive resizing,
  collapsing and a narrow screen. On a phone a segmented switch swaps the two, and both stay
  mounted.
- Enter **must** send and Shift+Enter break a line, safely with input methods.
- While a question waits, Enter **must** answer it, Stop stays its own control, and the screen says
  "Esperando a sua resposta" with no countdown.
- The conversation **must** follow new messages only while the reader stays at its end.
- A model change **must not** touch an active run.
- The Preview **must** stay usable while new work runs, and an older launch never replaces a newer
  one.
- A failed source **must** stay current with a safe diagnostic, with no automatic repair loop.
- Code and Changes **must** be read-only. Changes compares a run's base with its result.
- A reload **must** rebuild the conversation, the run, the source and the Preview from the server.

**Why.** The person builds by watching the app change while they talk. Losing either side, or their
place in it, breaks the work.

**Right.** A person reloads during a run and finds the same run, messages and Preview.

**Wrong.** The conversation jumps to the end while the person reads an earlier answer.
