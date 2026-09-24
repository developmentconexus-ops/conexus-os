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

## 1. Overview

**Creative North Star: "Grafite e Ipê"**

Conexus is a governed enterprise workbench. A person describes the internal app they need in Portuguese, an agent builds it into a repository the company owns, and the app runs in the Preview. The interface is graphite: calm, flat, separated by hairlines, so that the person's own application is the most colorful thing on screen. Ipê, a warm gold, is the one accent. It marks focus, selection and the agent at work, and nothing else. PRODUCT.md owns the product truth and outranks this file on anything factual. `packages/brand/src/tokens.css` owns every value and outranks the frontmatter above if the two ever disagree.

Two readers share every screen: staff who are not technical, and the company's developers. The system serves both with one rule: prose in a sans face, facts in a mono face. Density comes from tight spacing, not from shrinking type.

The layout is a fixed frame: a full-width top bar (3.25rem) with the lockup, the breadcrumb trail, the theme toggle and the account; a scope rail on the left that collapses to a 56px icon rail; and the content column. Pages are 72rem wide, 40rem for forms and 46rem for settings. Construir splits into the stage, where the Preview sits edge to edge, and a resizable chat rail (380px by default, 320px to 60%). On a phone the two panes switch with a segmented control. Regions and panes take no radius.

The product components come from Mastra's `@mastra/playground-ui`, restyled through `apps/web/src/mastra-theme.css`. The interface is Portuguese only.

**Key Characteristics:**
- Graphite neutrals with one warm accent, ipê.
- Light and dark are both first class.
- Hairlines, not shadows.
- Prose is sans, facts are mono.
- One authored motion, "Encaixe", and everything stops under reduced motion.

## 2. Colors

Graphite neutrals carry the whole interface. One warm gold marks what is live.

### Primary
- **Ipê** (accent): the focus ring, the caret, text selection, the active lens underline, the slider fill and the composer glow. In dark it lightens to a brighter gold.
- **Ipê Text** (accent-text): ipê used as text on a surface, for hover text on round tools, nav rows and links.
- **Ipê Soft** (accent-soft): the hover ground of nav rows and round composer tools, the selection ground and the working chip.
- **Mark Gold** (mark): the Conexus mark and the "nexus" half of the wordmark.

### Neutral
- **Canvas** (canvas): the page ground and the scope rail.
- **Surface** (surface): cards, panels, the top bar, inputs and the composer.
- **Surface Three** (surface-3): hover fill, the active nav row, the user's chat bubble and neutral chips.
- **Surface Four** (surface-4): pressed fill, the rail badge and the slider track.
- **Hairline** (line): the 1px line that separates every region and card.
- **Strong Line** (line-strong): hovered borders and dashed empty states.
- **Graphite Text** (text) and **Muted Text** (text-2): body text and secondary text.
- **Ink** (ink, on-ink): the primary button, near-black in light and near-white in dark.
- **Preview Paper** (preview-paper) and **On Accent** (on-accent): white in both themes, for the Preview frame and the slider thumb on the ipê fill.

### Status
- **Success**, **Warning** and **Danger** mark status only. Their grounds are tints of 7 to 14% on the surface.

### Named Rules
**The One Accent Rule.** Ipê marks focus, selection, the active lens and the agent at work. It is never a resting button fill, a heading color or decoration. Only the composer's send button turns ipê, on hover.

**The Word Beside the Color Rule.** Color never carries meaning alone. Every status pairs a word with a mark, so it survives color blindness and a grayscale screenshot.

**The Two Themes Rule.** Light is the default and dark follows the operating system unless the person picks one. Neither is an afterthought: every change is checked in both.

## 3. Typography

**Display Font:** Bricolage Grotesque (with system-ui)
**Body Font:** Hanken Grotesk (with system-ui)
**Mono Font:** JetBrains Mono (with ui-monospace)

**Character:** A grotesque with some warmth for headings, a quiet and legible grotesque for everything read as language, and a mono that marks facts. All three are self-hosted from `packages/brand/fonts`.

### Hierarchy
- **Display** (600, clamp 1.6 to 2.1rem, 1.15): page titles. The home hero "O que vamos construir?" goes up to 2.6rem with -0.03em tracking.
- **Title** (600, 1.05rem, 1.3): section titles and card titles, in Bricolage Grotesque.
- **Body** (400, 15px, 1.55): chat and composer text. Page prose sits at 16px, 1.5.
- **Label** (500, 13px): buttons, meta, tool rows. Navigation, crumbs and lens tabs use 14px, 500.
- **Eyebrow** (700, 0.68rem, 0.08em, uppercase): small group labels only.
- **Fact** (400, 11 to 12px, mono): model ids, paths, commands, times, durations, revisions, error codes and counts.

### Named Rules
**The Prose and Facts Rule.** Everything a person reads as language is sans. Everything that is a fact is mono. Mono is never a costume.

**The Floor Rule.** Functional prose never goes below 12px and mono stamps never below 11px. Numerals are tabular everywhere.

## 4. Elevation

The system is flat. Separation is a 1px hairline, and cards do not float. A shadow appears only as a response to state or on a layer that genuinely floats.

### Shadow Vocabulary
- **Card lift** (`box-shadow: 0 .6rem 1.6rem rgb(0 0 0 / .08)`): a hovered project card, which also rises 2px.
- **Prompt** (`box-shadow: 0 1px 2px rgb(0 0 0 / .04), 0 .5rem 1.5rem rgb(0 0 0 / .05)`): the home prompt composer.
- **Popover** (`box-shadow: 0 .5rem 1.5rem rgb(0 0 0 / .12)`): menus and popovers.
- **Row lift** (`box-shadow: 0 .35rem 1rem rgb(0 0 0 / .06)`): a hovered Workspace list row, which also rises 1px.
- **Thumb** (`box-shadow: 0 1px 3px rgb(0 0 0 / .3)`): the effort slider thumb.

### Named Rules
**The Hairline Rule.** If a card needs a shadow to separate from its ground, the ground is wrong. Use the hairline.

## 5. Components

Production components are Mastra primitives restyled through tokens. The entries below describe the Conexus result.

### Buttons
- **Shape:** gently squared (6px).
- **Primary:** ink fill with the on-ink label, 34px high. Hover drops to .88 opacity. Never ipê.
- **Default and outline:** surface or transparent with a hairline; hover goes to Surface Three with the strong line.
- **Ghost:** transparent, muted text; hover goes to Surface Three.
- **Press:** no shrink. A pressed state shows as a fill.

### Chips
- **Style:** a 1.5rem pill in Surface Three with muted text. Status chips tint their ground and always carry a word, and a dot when live or working.

### Cards / Containers
- **Corner Style:** 10px for panels, notes and result cards; 14px for project cards.
- **Background:** Surface, on the Canvas ground.
- **Shadow Strategy:** none at rest. Project cards and Workspace rows lift on hover.
- **Border:** 1px hairline.
- **Internal Padding:** 0.8 to 1.5rem.

### Inputs / Fields
- **Style:** Surface with a hairline, 6px radius, 36px high.
- **Focus:** an ipê border and a 3px ipê ring at 28%.
- **Error:** a danger border and the reason in words below the field.

### Navigation
- **Top bar:** lockup, divider and a breadcrumb trail at 14px, 500; the last crumb is current. No search and no notifications.
- **Scope rail:** 34px rows with 18px Lucide icons. Hover tints Ipê Soft; the active row is Surface Three. It collapses to a 56px icon rail.
- **Lenses:** Prévia, Código, Alterações and Sobre as text tabs 1.5rem apart. The active lens is 600 weight with a 2px ipê underline.

### Composer
The chat input shared by the home prompt and Construir. A 16px radius, one input, the model and reasoning pill, the microphone and a round ink send button. A slow conic ipê ring turns once per 11 seconds (2.8 seconds while the agent works) with a soft blurred glow. No context chips above it.

### The Mark and Encaixe
The mark is two L pieces in Mark Gold. While the agent works, the pieces slide 2px apart on the diagonal and fit back (1.2s, `cubic-bezier(.65,0,.35,1)`). On the first page load they fit once (.9s, `cubic-bezier(.22,1,.36,1)`). Controls transition in .15s, arrivals rise 6px over .35s, and all of it stops under reduced motion.

### Icons
Lucide only, at stroke 2 with round caps, drawn at 13 to 18px in `currentColor`.

## 6. Do's and Don'ts

### Do:
- **Do** reach every color through a `--cx-*` token. `npm run web:style:check` fails on a raw hex outside `tokens.css`.
- **Do** keep ipê for focus, selection, the active lens and the agent at work.
- **Do** make primary buttons ink.
- **Do** set every fact in JetBrains Mono and every sentence in Hanken Grotesk.
- **Do** give every state a mark and a word.
- **Do** keep the Preview edge to edge on white paper, the largest thing on screen.
- **Do** check every change in light, in dark and under reduced motion.
- **Do** write every string in pt-BR, sentence case, with verbs on buttons.

### Don't:
- **Don't** use ipê as a resting button fill or as decoration.
- **Don't** use any font other than Bricolage Grotesque, Hanken Grotesk and JetBrains Mono.
- **Don't** put a shadow on a card at rest.
- **Don't** use violet or a purple-to-cyan gradient.
- **Don't** use glass, a pulsing orb or a second authored animation. The composer glow is the only blur.
- **Don't** reintroduce an address bar, a status strip under the application or a context chip above the composer.
- **Don't** use monospace as a costume.
- **Don't** invent customers, testimonials or metrics.
- **Don't** show branches, pull requests or pipeline steps to the person.
