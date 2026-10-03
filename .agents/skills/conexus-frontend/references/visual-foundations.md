# Visual foundations

The intent of the visual system. Every value lives in `packages/brand/src/tokens.css` (color, font, radius, easing) or in the CSS that owns the screen (`apps/web/src/styles.css`, `app/frame.css`, the feature's own CSS); when this file and the code disagree, the code is right. `DESIGN.md` summarizes the system for the design tools.

"Grafite e Ipê": graphite neutrals and one warm accent, ipê gold.

## Color

- Reach every color through `var(--cx-*)`; `npm run web:style:check` fails a raw color.
- Surfaces step from canvas (the page ground) to surface (cards, panels, the composer box) to the hover and pressed fills. A `--cx-line` hairline of 1px separates regions; a stronger line marks hover.
- Text is `--cx-text`, secondary text and idle icons `--cx-text-2`. Check contrast (4.5:1) before putting secondary text on a pressed fill or a status tint.
- Ipê (`--cx-accent`, with its text and soft tint) is the only accent: focus, caret, selection, the active lens, hover tints, the agent at work. It is never a button fill; the primary button is ink (`--cx-ink`, `--cx-on-ink`).
- Success, warning and danger are for status only, always beside a word. A status ground is a low percentage tint of its color on the surface, not a new token.
- Light and dark are both first class. Light is the default and dark follows `prefers-color-scheme`, with the top-bar toggle overriding. Check every rule in both.
- Mastra follows the brand: `apps/web/src/mastra-theme.css` re-points its custom properties at tokens. Fix a color the palette lacks there, never with a per-component override. Size and layout go in a `cx-*` class next to the screen.

## How styling is built

- `apps/web/src/styles.css` imports Tailwind and the Mastra theme (`@mastra/playground-ui/theme.css`), and `@tailwindcss/vite` builds them. Mastra parts arrive styled by Tailwind utilities that read the Mastra theme's custom properties; `apps/web/src/mastra-theme.css` re-points those properties at our `--cx-*` tokens.
- Conexus structure and screens use `cx-*` classes in a CSS file next to the screen; the shell frame's own classes (`shell-*`) live in `app/frame.css`.
- Where we compose a Mastra part, the code adds Tailwind utilities in the TSX (`ask-user-pt.tsx`, `task-list-pt.tsx`, a `max-w-full` or `p-0` on a part). A screen's own structure is `cx-*`, not utilities; `sr-only` for visually hidden text is the one utility on our own elements.
- `npm run web:style:check` fails a class that none of three places defines: our CSS, the Mastra package's CSS, or what the app's Tailwind build generates.

## Type

- **Bricolage Grotesque** (`--cx-font-display`): headings, card and section titles, the wordmark.
- **Hanken Grotesk** (`--cx-font-body`): all prose and UI.
- **JetBrains Mono** (`--cx-font-mono`): facts only, never decoration.
- Numerals are tabular. Dense UI sits at 13 to 15px and prose never goes below 12px; mono stamps and group labels may go to 11px.
- The fonts are self-hosted from `packages/brand/fonts`; never load one from a CDN.

## Layout and shape

- A full-width top bar, a collapsible scope rail on the left, a page column. Construir splits into a stage (lens bar and an edge-to-edge Preview) and a resizable chat rail; on a phone a segmented switch swaps App and Conversa, and both stay mounted. `app/frame.css` owns the sizes.
- Spacing is in `rem` on the steps already in use; take the nearest existing step before inventing one. `px` is for hairlines, icon boxes and fixed controls.
- Radius comes from the `--cx-radius-*` scale. Regions and panes (top bar, rail, panes) take none.
- Hairlines do the work; cards do not float. A shadow is the exception: a hover lift, a popover, a menu. It is black at low alpha in both themes, the one color that is not a token.
- No glass, no gradient surfaces, no textures. Imagery is none: the only image is the live Preview of the person's own app, always on `--cx-preview-paper`.

## Motion

- **Encaixe** is the one authored motif. The mark is two L pieces: while the agent works they slide apart and fit back in a loop (`<ConexusMark working />`); on the first shell mount of a page load they fit once (`<ConexusMark arrive />`).
- Everything else is quiet: color and border transitions, a small rise on arrival, the composer ring.
- Everything stops under `prefers-reduced-motion: reduce` (`styles.css` zeroes durations), and the end state must make sense without the animation. No second motif: no pulsing orb, shimmer or bounce.

## Hover, press, focus

- Hover moves a surface one step up, round tools and nav rows to the ipê tint, ink buttons slightly lighter, links to `--cx-accent-text`.
- Press never shrinks; it shows as a fill.
- `:focus-visible` draws a 2px ipê outline with an offset; never remove a focus style without replacing it.
- Disabled is dimmed and says why nearby when the reason is not obvious.
