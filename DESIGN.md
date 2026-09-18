---
name: Conexus OS
description: Governed enterprise workbench where an AI agent builds and evolves business applications under explicit authority.
colors:
  accent: "#4FBE8E"
  accent-bg: "#142A20"
  accent-fg: "#07170F"
  bg: "#0F1311"
  panel: "#151A17"
  panel-2: "#1A201C"
  panel-3: "#212823"
  hover: "#28302B"
  line: "#2C3430"
  line-soft: "#232926"
  fg: "#EDF1EE"
  muted: "#9AA5A0"
  dim: "#939E98"
  amber: "#E0B266"
  amber-bg: "#2C2517"
  red: "#F08C80"
  red-bg: "#31201D"
  light-accent: "#0E7A51"
  light-accent-bg: "#E3F2E9"
  light-accent-fg: "#FFFFFF"
  light-bg: "#F3F2EE"
  light-panel: "#FFFFFF"
  light-panel-2: "#FAF9F6"
  light-panel-3: "#EFEEE8"
  light-hover: "#E7E6E0"
  light-line: "#DDDBD3"
  light-line-soft: "#EAE8E2"
  light-fg: "#181D1A"
  light-muted: "#5B655F"
  light-dim: "#8A938E"
  light-amber: "#875E13"
  light-amber-bg: "#F6EEDC"
  light-red: "#A63E35"
  light-red-bg: "#FAECE9"
typography:
  body:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  strong:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1.5
    letterSpacing: "-0.005em"
  title:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.4
    letterSpacing: "-0.02em"
  label:
    fontFamily: "Instrument Sans, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "0.08em"
  fact:
    fontFamily: "JetBrains Mono, ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "-0.02em"
rounded:
  xs: "5px"
  sm: "8px"
  md: "9px"
  lg: "11px"
  xl: "12px"
  pill: "99px"
spacing:
  xs: "4px"
  sm: "7px"
  md: "10px"
  lg: "14px"
  xl: "20px"
components:
  button:
    backgroundColor: "transparent"
    textColor: "{colors.fg}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.label}"
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.accent-fg}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
    typography: "{typography.label}"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    size: "32px"
  icon-button-active:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    size: "32px"
  nav-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  nav-item-active:
    backgroundColor: "{colors.accent-bg}"
    textColor: "{colors.accent}"
    rounded: "{rounded.sm}"
    padding: "7px 8px"
  badge:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.xs}"
    padding: "3px 7px"
  panel:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "11px"
  failure-block:
    backgroundColor: "{colors.red-bg}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "9px 11px"
  composer:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.fg}"
    rounded: "{rounded.lg}"
    padding: "10px 11px"
---

# Conexus OS design system

## Overview

Conexus is a governed enterprise workbench. A person states business intent, an AI agent builds and changes a real application, and the exact truth underneath (which revision, which authority, which evidence) stays inspectable without ever being in the way. PRODUCT.md owns that product truth and outranks this file on anything factual.

The visual world was chosen against measurement, not taste. Seven comparable products were inspected live on 2026-09-18.

| Product | UI face | Ground |
|---|---|---|
| Palantir | Alliance No.1 / No.2, licensed | white |
| Blueprint, Palantir's product system | system stack at 14px | light, very dense |
| Lovable | Camera Plain Variable, commissioned | light |
| Replit | ABC Diatype, licensed | warm light `#F6F5F4` |
| Cursor | CursorGothic, commissioned | warm black `rgb(20,18,11)` |
| v0 | Geist, in-house | pure black |
| Linear | Inter | neutral black `#08090A` |
| Mitra, the closest competitor | Inter | cool light `rgb(249,249,253)` |

Two facts drove the decisions here. Every product that takes its identity seriously commissioned or licensed a face, and only the two that did not use Inter, so Inter is the mark of a product that never decided. And nobody in this category uses green, while the Conexus that already exists in code was green-grey (`#18211d` on `#f4f6f2`), so the open space in the category happens to coincide with the product's own colour memory.

Instrument Sans is the free face closest in character to Palantir's Alliance. It is a deliberate ceiling, not a final answer. If Conexus ever wants the finish of Palantir or Replit, the next move is licensing a face, and this file changes at that point.

## Colors

Both themes are first class. Neither is "the" theme. The surface follows the operating system preference and a manual toggle overrides it and persists. Dark is warm-neutral with a green cast; light is warm off-white, never cool blue-grey.

One accent, used in exactly three places: the active navigation item, the primary action, and the authorized subject. It appears nowhere else. An accent that decorates has stopped meaning anything.

Green is the brand, not a status. It can be the brand precisely because status never depends on colour. Amber marks attention and red marks failure, and both always carry a mark and a word beside them.

Colour never carries meaning alone, in either theme. Every state pairs a shape with a label: a square mark for completed, a round mark for failed, and the word that names it.

## Typography

Instrument Sans for everything a person reads as language. JetBrains Mono for everything that is a fact: revision, artifact digest, run id, duration, file path, error code, model id.

That split is the system's governing rule and the single strongest carrier of the product's character. Prose is sans, facts are mono. It reads as accountable and as agentic at the same time, and it costs nothing.

Numerals are tabular everywhere, so a column of durations or amounts never shifts under a re-render.

Functional text never falls below 12px. Dense is not the same as small, and the density comes from tight spacing, not from shrinking type.

## Layout

A fixed three-column workbench: project navigation, the application, the agent. The application is the centre and the largest thing on screen. The agent is a right rail. Neither swaps sides.

The left rail retracts to a 52px icon rail by an explicit control, and collapses to that automatically below 1020px. The right rail narrows below 1240px.

The application is the work. Nothing chrome-like sits between the operator and it: no browser frame, no address bar, no status strip under it. The preview surface holds the application edge to edge.

## Elevation & Depth

There is no elevation. Separation is a one-pixel line, never a shadow, and never a tint doing a shadow's job.

The only permitted depth is a single soft drop under a genuinely floating layer, such as the agent rail when it overlays at narrow widths. Cards do not float. Panels do not float.

## Shapes

Radius runs 5px for small marks, 8px for controls, 9px for buttons, 11px for panels and blocks, and 12px for the application frame. Nothing is a perfect circle except a status dot and an avatar corner.

Icons are drawn as SVG at a single 1.6 stroke weight with round caps and joins, on a 20px grid. No icon font, no emoji, no unicode glyph standing in for a drawn icon.

Browser-owned surfaces are themed, not left to defaults: text selection, the focus ring, the caret, and the scrollbar all come from these tokens.

## Components

**Failure block.** When a run fails, it renders the operator's own request verbatim in quotes, the reason in plain product language, and the internal code in mono, with the recovery action beside it. The request never disappears because the run failed. This is the single most important component in the system, and it is what most competitors get wrong.

**Activity group.** The agent's tool calls render as an ordered list with the action, the path in mono, and the duration, collapsed behind a summary that counts them. A failed step keeps its round mark and red label inside an otherwise successful run, because a run that recovered is not a run that never stumbled.

**Result card.** After a run changes the application, one card names the application, its preview version, and the ways into it. It is the landing place of the turn.

**Composer.** Free text with the model named beside the send control. No context chips above it; the breadcrumb already says which Project is in hand.

**Conversation picker.** The rail's header carries a picker naming the current conversation, and a new-conversation control beside it. There is no visible list of past conversations taking vertical space.

## Do's and Don'ts

Do put the application at the centre and keep it the largest thing on screen.

Do set every fact in mono and every sentence in sans.

Do give every state a mark and a word, so it survives colour blindness, a bad monitor, and a screenshot in a report.

Do keep the accent to the active item, the primary action, and the authorized subject.

Don't use violet or a purple-to-cyan gradient. It is the category's tell and Linear already owns the restrained version of it.

Don't use glass, blur, glow, or a pulsing orb. Modern does not mean atmospheric.

Don't use Inter for the product interface. It is what Mitra uses and what the earlier Conexus prototype used, and it is the largest single reason the result read as generic.

Don't reintroduce an address bar, a status strip under the application, or a context chip above the composer. All three were removed deliberately on 2026-09-18 for saying nothing the operator needed.

Don't use monospace as a costume. It marks facts and only facts.

Don't let a card carry a shadow.

## Declared deviations

The mechanical detector reports three findings that are deliberate.

The application frame has no inner padding, because a preview surface shows the application edge to edge. Insetting it would put chrome between the operator and the work.

Instrument Sans is reported as a common face. That is accurate and it is the accepted ceiling of a free family. The path past it is licensing, recorded in Overview.

Inter is reported inside the demonstration application rendered in the preview. That is a different product's interface, authored by the agent, and it is correctly not bound by this system.
