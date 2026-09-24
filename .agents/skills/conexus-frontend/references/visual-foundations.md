# Visual foundations

The palette is "Grafite e Ipê": graphite neutrals and one warm accent, ipê gold. `packages/brand/src/tokens.css` holds every value named here. If this file and `tokens.css` disagree, `tokens.css` is right and this file is stale.

## Color roles

Reach every color through `var(--cx-*)`. `npm run web:style:check` fails on a raw hex anywhere outside `tokens.css`.

| Token | Role |
| --- | --- |
| `--cx-canvas` | Page ground, scope rail, pending cards. |
| `--cx-surface` | Cards, panels, top bar, inputs, the composer box. |
| `--cx-surface-3` | Hover fill, active nav row, user chat bubble, neutral chip. |
| `--cx-surface-4` | Pressed fill, rail badge, disabled send button, slider track. |
| `--cx-line` | The 1px hairline that separates everything. |
| `--cx-line-strong` | Hovered borders, dashed empty-state border, scrollbar thumb on hover. |
| `--cx-text` | Body text. |
| `--cx-text-2` | Secondary text, meta, placeholders, idle icons. |
| `--cx-ink` / `--cx-on-ink` | Primary button fill and its label. Near-black in light, near-white in dark. |
| `--cx-accent` | Ipê. Focus ring, caret, active lens underline, slider fill, composer glow. |
| `--cx-accent-text` | Ipê as text on a surface: hover text on round tools and nav rows, link hover. |
| `--cx-accent-soft` | Ipê tint: hover ground on nav rows and composer tools, selection, working chip. |
| `--cx-mark` | The mark and the "nexus" half of the wordmark. |
| `--cx-success`, `--cx-warning`, `--cx-danger` | Status only. Always with a word. |
| `--cx-on-accent` | White in both themes. The effort slider thumb on the ipê fill. |
| `--cx-preview-paper` | White in both themes. The Preview frame behind the person's own app. |

Rules:

- **One accent.** Ipê is reserved for the mark, focus, caret, selection, the active lens underline, hover tints on nav rows and round composer tools, the composer glow and the working chip. It is not a button color.
- **Primary buttons are ink,** never ipê.
- **Color never carries meaning alone.** Every status pairs a word with a mark (a dot, a square for done, a round mark for failed). A state must survive color blindness and a grayscale screenshot.
- **Status grounds are tints:** `color-mix(in srgb, var(--cx-danger) 8%, var(--cx-surface))`, 7–14% of the status color on the surface. Do not invent a new soft token per status.
- **Both themes are first class.** Light is the default; dark follows `prefers-color-scheme`, and the top-bar toggle overrides it per browser (`ThemeProvider`, storage key `conexus-theme`, sets `.light` or `.dark` on `<html>`). Every new rule must look right in both before it ships.
- **Mastra follows the brand.** `apps/web/src/mastra-theme.css` re-points every Mastra custom property at a `--cx-*` token. When a Mastra component shows a color that is not in the palette (its green, its blue), fix it there by re-pointing the property. Never override it per component.

## Type

| Face | Token | Use |
| --- | --- | --- |
| Bricolage Grotesque 600 | `--cx-font-display` | `h1`, `h2`, card titles, section titles, the wordmark. Tracking -0.02em (-0.03em for the hero and wordmark), `text-wrap: balance`. |
| Hanken Grotesk 400–700 | `--cx-font-body` | All prose and UI. |
| JetBrains Mono 400–600 | `--cx-font-mono` | Facts only: model ids, paths, commands, times, durations, revisions, error codes, counts. |

- Prose is sans, facts are mono. Mono is never decoration.
- Numerals are tabular everywhere (`font-variant-numeric: tabular-nums`).
- Dense UI sits at 13–15px. Functional text never goes below 12px for prose or 11px for mono stamps.
- The scale in use: 11 (mono stamps, lens count), 12 (hints, levels), 13 (meta, buttons, tool rows), 14 (nav, crumbs, lens tabs, notes), 15 (chat body, composer input), 16 (card titles, page body), 1.05rem (section title), 1.25rem (status headings), `clamp(1.6rem, 3.2vw, 2.1rem)` (page `h1`), `clamp(1.75rem, 4.2vw, 2.6rem)` (home hero "O que vamos construir?").
- The fonts are self-hosted from `packages/brand/fonts`. Never load a font from a CDN. `npm run web:style:check` fails on any `font-family` outside the three faces, `system-ui`, `ui-monospace` and `monospace`.

## Spacing and layout frame

The code has no named spacing scale. Spacing is in `rem` and follows the steps already in use: `.25`, `.4`, `.5`, `.75`, `1`, `1.25`, `1.5` and `2.5rem`. Pick the nearest existing step before inventing a new one. `px` is used on purpose for hairlines, icon boxes, control heights and the fixed frame, so the style check allows it.

The frame (`apps/web/src/app/shell.tsx`, `apps/web/src/app/frame.css`):

- A full-width top bar, `min-height: 3.25rem`: lockup, 1px divider, breadcrumb trail, theme toggle, account. No search and no notifications.
- A scope rail on the left, Mastra `MainSidebar`, collapsible to a 56px icon rail. Rows are 34px with 18px icons.
- The page column, `.cx-page`: `min(72rem, 100% - 2rem)`; `.cx-page--narrow` is 40rem for forms; settings pages use 46rem. The `2rem` keeps a 16px gutter on a phone.
- Construir splits into the stage (lens bar and an edge-to-edge Preview) and the chat rail: 380px by default, 320px minimum, 60% maximum, resizable (`construir.tsx`). On a narrow screen a segmented switch (`.cx-pane-switch`) toggles App and Conversa. Both panes stay mounted, so the draft, the scroll position and the lens survive the switch.
- Regions and panes (top bar, rail, panes) take radius 0. A 1px `--cx-line` separates them.

## Radii

`tokens.css` defines three steps. Use them.

| Value | Where |
| --- | --- |
| `--cx-radius-control` (6px) | Buttons, inputs, nav rows, icon buttons. |
| `--cx-radius-object` (10px) | Notes, result cards, panels, the Preview frame, popovers. |
| `--cx-radius-composer` (16px) | The composer. |
| `14px` | Project cards and the home prompt confirmation. |
| `999px` | Chips, pills, round icon buttons, the model button. |

The code still carries older literals (`.5rem`, `.6rem`, `.7rem`, `8px`, `12px`). They are drift, not precedent. When a change touches one of those rules, move it to the nearest step above.

## Elevation

Hairlines do the work. Cards do not float. A shadow appears only on:

- a hovered project card: lift 2px and `0 .6rem 1.6rem rgb(0 0 0 / .08)`;
- the home prompt composer, very soft: `0 1px 2px rgb(0 0 0 / .04), 0 .5rem 1.5rem rgb(0 0 0 / .05)`;
- popovers and menus: `0 .5rem 1.5rem rgb(0 0 0 / .12)`;
- dialogs: `0 1rem 3rem rgb(0 0 0 / .24)`, over the overlay `rgb(14 16 18 / .5)`;
- the effort slider thumb and the selected segment of a segmented control.

No glass. The only blur is the composer glow. No gradient surfaces, no textures. Two exceptions: the project thumbnail placeholder (135° hairline hatching with the mark at 70%) and the composer's conic ipê ring.

## Motion: Encaixe

The mark is two L pieces. "Encaixe" is the one authored motif:

- **Working:** the pieces slide 2px apart on the diagonal and fit back, 1.2s, `var(--cx-ease-fit)` (`cubic-bezier(.65, 0, .35, 1)`), looping while the agent works. Use `<ConexusMark working />`.
- **Arrival:** the pieces fit once, .9s after a .3s delay, `var(--cx-ease-arrive)` (`cubic-bezier(.22, 1, .36, 1)`), on the first shell mount of a page load only. Use `<ConexusMark arrive />`.

Everything else is quiet:

- Controls transition color, background and border in .15s.
- Arrivals rise 6px over .35s (`cx-rise`, `var(--cx-ease-arrive)`).
- Project cards lift in .2s.
- The composer ring rotates once per 11s, 2.8s while busy. The glow sits at .28 opacity, .45 on focus, .6 while busy. It never follows the cursor.
- Everything stops under `prefers-reduced-motion: reduce`. `apps/web/src/styles.css` zeroes durations globally, and the mark renders still. A new animation must stop there too, and its end state must make sense without it.

Do not add a second authored motif, a pulsing orb, a shimmer or a bounce.

## Hover, press and focus

- **Hover.** Surfaces go to `--cx-surface-3` with `--cx-line-strong`. Ghost and square icon buttons go to `--cx-surface-3`. Round composer tools and nav rows go to `--cx-accent-soft` with `--cx-accent-text`. Ink buttons drop to `opacity: .88`. Text links turn `--cx-accent-text`.
- **Press.** No shrink. A pressed state shows as a fill (`aria-pressed` maps to `--cx-surface` or `--cx-surface-3`).
- **Focus.** `:focus-visible` draws a 2px ipê outline with a 2px offset (`styles.css`). Inputs take an ipê border plus a 3px ring of ipê at 28% (`mastra-theme.css` re-points Mastra's focus ring to it). Never remove a focus style without replacing it.
- **Disabled.** Opacity .45–.6 and `cursor: not-allowed` or `default`. Say why nearby when the reason is not obvious.
- **Browser surfaces carry the brand:** selection, caret, focus ring, scrollbar and `accent-color` all come from tokens in `styles.css`.

## Imagery

None in the product chrome. The only image is the live Preview of the person's own app, always on `--cx-preview-paper` in both themes. The app inside the Preview belongs to that person and is not bound by this system.
