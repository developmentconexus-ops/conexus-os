# packages/brand

Design tokens, self-hosted fonts, and the Encaixe mark for the Conexus brand
(Grafite e Ipê), taken from the approved design page. This is a plain source
folder (no `package.json`, matching `packages/canonical-json`); consumers
import the files by relative path.

## Files

- `tokens.css`: CSS custom properties for light (`:root`), OS-driven dark
  (`@media (prefers-color-scheme: dark)`), and forced dark
  (`:root[data-theme="dark"]`). Copied verbatim from `conexus-marca.html`.
- `fonts.css`: `@font-face` rules pointing at the woff2 files in `fonts/`.
  Nothing loads from Google Fonts at runtime.
- `fonts/`: latin-subset woff2 files for Bricolage Grotesque (500, 600),
  Hanken Grotesk (400, 500, 600, 700), and JetBrains Mono (400, 500), copied
  from the `@fontsource/*` npm packages. To add a weight, `npm pack` the
  relevant `@fontsource` package, copy the matching `files/*-latin-*.woff2`
  file in, and add its `@font-face` block to `fonts.css`.
- `mark.svg`: the Encaixe symbol as a two-path SVG using `fill="currentColor"`,
  so a consumer sets its color (ink or ipê) via CSS `color`.

## Provenance

This package was created from `apps/keycloak-theme` (branch
`feat/keycloak-theme`) because `feat/brand-foundation` had not yet added
`packages/brand/` when this branch started. It holds exactly the token
values, fonts, and mark from the approved design page's `:root` and dark
blocks, nothing more. The coordinator reconciles the two branches at merge;
keep file names identical (`tokens.css`, `fonts.css`, `fonts/`, `mark.svg`)
so either branch's copy can replace the other without touching importers.
