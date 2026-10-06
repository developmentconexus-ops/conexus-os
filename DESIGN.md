---
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
    fontSize: "clamp(1.6rem, 3.2vw, 2.1rem)"
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
    fontSize: "0.68rem"
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

How Conexus looks, moves and speaks. `packages/brand/src/tokens.css` owns every value and outranks
the frontmatter above; the [product contract](docs/product/contract.md) owns what screens mean;
[testing](docs/development/testing.md#8-screens) owns how a screen is proved. Rules marked "check" fail
`npm run web:style:check` or a test; the rest are judged in review.

## 1. Overview

**"Grafite e Ipê".** Graphite neutrals, flat and separated by hairlines, so the person's own app is
the most colorful thing on screen. Ipê, a warm gold, is the one accent. Prose is sans and facts are
mono. A full-width top bar, a scope rail that collapses to icons, and a page column; Construir splits
into the stage, with the Preview edge to edge on white paper, and a resizable chat rail; on a phone a
segmented switch swaps the two and both stay mounted. Regions and panes take no radius.

Conexus designs its screens, structure and page patterns. `@mastra/playground-ui` supplies parts
only, repainted through `apps/web/src/mastra-theme.css`; its structure blocks are not adopted by new
screens and no part is forked (C-031). One way per need: a native `title` beside `Tooltip`, a raw
color or a raw font is a defect.

## 2. Color

- Every color is a `--cx-*` token; only `tokens.css` holds a raw value. Review: `web:style:check`
  checks class names and the Mastra re-pointing, not values. A new token goes in
  light, OS-dark and chosen-dark with the same name; `brand-tokens.test.mjs` fails when the names
  differ and pins the ink and accent values. Check. Updating this file and `.impeccable/design.json`
  with a token change is review.
- **One accent.** Ipê marks focus, caret, selection, the active lens and the agent at work. It is
  never a resting button fill, a heading or decoration; only the send button turns ipê, on hover.
- **Ink primary.** The primary action is `--cx-ink` with `--cx-on-ink`.
- **Never color alone.** Success, warning and danger mark status only, always with a word and
  usually a mark; their grounds are low tints of the surface. Secondary text keeps 4.5:1 contrast.
- **Two themes.** Light is the default, dark follows the system unless the person picks one, and
  every change is checked in both.
- Mastra parts follow the brand through `mastra-theme.css`, never a per-component override.

## 3. Type

Bricolage Grotesque for headings, Hanken Grotesk for everything read as language, JetBrains Mono
for facts only: model ids, paths, commands, times, revisions, error codes, counts. Mono is never a
costume. Numerals are tabular; prose never goes below 12px, mono stamps and group labels not below
11px. The fonts are self-hosted from `packages/brand/fonts`; no other family and no CDN.

## 4. Shape, elevation and layout

Hairlines, not shadows: a card at rest does not float. A shadow appears only on a hover lift, a
popover or a menu, black at low alpha. Radius comes from the scale; spacing takes the nearest
existing `rem` step. No glass, gradient surface, texture or imagery besides the Preview. A brand
component sizes itself with a `cx-*` class, never a `style` attribute, so it renders under the
sign-in theme's strict CSP. Check for the wordmark (`brand-wordmark-csp.browser.test.mjs`); review
for the rest. A screen's own structure
uses `cx-*` classes; Tailwind utilities only adjust a composed Mastra part.

## 5. Motion

**Encaixe** is the one authored motion: the mark's two pieces slide apart and fit back while the
agent works, and fit once on the first load. Everything else is quiet. All motion stops under
`prefers-reduced-motion`, and the end state makes sense without it. No second motif: no orb,
shimmer or bounce.

## 6. Interaction and accessibility

- Hover moves a surface one step up; press shows a fill and never shrinks; `:focus-visible` draws a
  2px ipê outline, never removed without a replacement; disabled says why when it is not obvious.
- Tab reaches every action in reading order, Esc closes what opened, and no drag lacks a keyboard
  path. Every input has a label and every icon-only button a pt-BR `aria-label`.
- A screen reflows at 390px and at 200% zoom with no sideways scroll, and its console shows no error
  or CSP violation.

## 7. Icons

Lucide only, from `lucide-react`, with its defaults (outline, stroke 2, round caps) and color from
`currentColor` set by a token on the parent. Size follows the neighbor (16px inline, 14px toolbars,
18px rail). The stop control is the one filled icon. One icon, one meaning, never status alone. A
decorative icon is `aria-hidden`. Provider logos appear only in model pickers. No icon font, emoji,
glyph or second set.

## 8. Voice

- pt-BR only, everywhere a person reads, including `aria-label` and placeholders; no English left by
  a Mastra part (replace it in `builder-copy.ts`). Sentence case; capitals only in small group
  labels. Buttons are verbs ("Permitir", "Ver aplicativo"), never a bare "OK".
- Simple, calm and responsible: no exclamation, no empty apology, no emoji; the only symbols are `·`
  and `…`. The product says **você**; in chat the agent is **Conexus** and speaks in the first
  person; in system text it is **o agente**. Product nouns are capitalized: Workspace, Projeto,
  Prévia, Construir, and the lenses Prévia, Código, Alterações, Sobre.
- A failure's words come from the failure table (`failures.json`, read by `app/failure.ts`): it says what went wrong and what
  still stands, shows the request again, and puts the internal code in mono. A Conexus failure never
  asks to try again. What the person can fix says what to change.
- Each tool becomes a sentence while it runs and when it ends (`tool-sentences.ts`), never its
  technical name; three or more calls fold into one line. Reasoning shows only as "Pensando…".
- What is not built says "em breve". Numbers use Brazilian format ("8,4 s"). Examples are real
  company requests, never invented customers or figures.

## 9. Approving a surface

Only the operator approves the structure of a new surface, from something usable: a clickable
prototype or the real screen on stubbed data, never a static picture. The structural piece is
approved before the pieces that inherit it. Styling may not change reading order, region priority,
where actions sit, density, navigation or phone behavior without that approval. Values on a screen
match the issue's literal numbers and copy. A screen the operator asked to see carries
`needs:aprovo`.

## 10. The Build surface

The app is the main area and the conversation sits beside it; both survive resizing, collapsing and
a narrow screen. Enter sends, Shift+Enter breaks a line, and input methods are safe. While a
question waits, Enter answers it, Stop is its own control, and the screen says "Esperando a sua
resposta" with no countdown. The conversation follows new messages only while the reader stays at
its end. A model change never touches an active run. The Preview stays usable while new work runs,
and an older launch never replaces a newer one. A failed source stays current with a safe
diagnostic, and there is no automatic repair loop. Code and Changes are read-only, and Changes
compares a run's base with its result. Reload reconciles conversation, run, source and Preview from
the server.
