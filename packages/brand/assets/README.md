# Brand assets

Generated from `packages/brand/src/tokens.css` and `packages/brand/src/conexus-mark.tsx`, the
source of truth for every color and shape here. Rerun `node packages/brand/scripts/render-assets.mjs`
after editing any of the source SVGs to refresh the PNG exports.

| File | Use | Background |
| --- | --- | --- |
| `mark.svg` | Standalone mark, ipê on light grounds | transparent |
| `mark-dark.svg` | Standalone mark, ipê on dark grounds | transparent |
| `mark-mono.svg` | Mark that inherits `currentColor`, for single-color contexts | transparent |
| `mark-animated.svg` | Encaixe motion loop (matches the app's `.cx-mark--working` timing), static under `prefers-reduced-motion` | transparent |
| `lockup-light.svg` | Mark + wordmark for light grounds. Needs "Bricolage Grotesque" 600 (`@font-face` inside the file points at `../fonts/BricolageGrotesque-latin.woff2`); falls back to a system sans-serif if that font can't load | transparent |
| `lockup-dark.svg` | Mark + wordmark for dark grounds, same font requirement as `lockup-light.svg` | intended for dark canvas `#0E1012` |
| `favicon.svg` | Adaptive favicon: switches mark color via `prefers-color-scheme` | transparent |
| `mark-16.png`, `mark-32.png`, `mark-48.png` | Small favicon fallbacks | transparent |
| `mark-180.png` | Apple touch icon | paper `#FFFFFF`, mark padded to the iOS safe area |
| `mark-192.png`, `mark-512.png` | PWA manifest icons | transparent |
| `mark-512-maskable.png` | PWA maskable icon | ink `#121518`, mark kept inside the platform safe zone |
| `lockup-light@2x.png`, `lockup-dark@2x.png` | Lockup exports for docs | transparent (dark export intended for a dark page background) |

## Not included

- `favicon.ico`: no ICO encoder is available in the existing toolchain (no ImageMagick, no `to-ico`
  or similar already installed) and adding one just for this felt like the wrong tradeoff. Every
  browser that still needs an `.ico` falls back gracefully; `favicon.svg` plus the PNG sizes above
  cover the rest.
- Outlined lockup paths: `lockup-light.svg` and `lockup-dark.svg` use `<text>`, not paths converted
  to outlines. Converting "Bricolage Grotesque" text to real path data needs a font-parsing library
  (e.g. `opentype.js`) that isn't a dependency of this repo, and the task brief's own fallback for
  that case is to ship `<text>` plus a documented font requirement, which is what these two files
  do. If a truly font-independent lockup is needed later, that's a small follow-up: install a
  font-outlining tool (or fetch `@fontsource/bricolage-grotesque` once it's an actual dependency)
  and regenerate these two files.
