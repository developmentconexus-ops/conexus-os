# packages/brand

The Conexus brand: color and font tokens in `src/tokens.css`, the self-hosted fonts, the mark and wordmark components, and the exported asset set. `apps/web` and `apps/keycloak-theme` both import it through `src/index.ts`. [`DESIGN.md`](../../DESIGN.md) owns the visual language.

## Traps

- `src/tokens.css` is the only file that may hold a raw color. A new token goes in light, in the OS-dark block and in the chosen-dark block, with the same names in all three.
- The Hub and Keycloak both block inline styles, so a component here sizes itself with a `cx-*` class in `tokens.css`, never a `style` attribute.
- The lockups and PNGs in `assets/` are generated. After you change a source SVG or the lockup constants, rerun `packages/brand/scripts/render-assets.mjs` and commit its output.
- Only the three self-hosted families exist: Bricolage Grotesque, Hanken Grotesk and JetBrains Mono. Consumers import `src/index.ts`, never a deeper path (`npm run r1:s2:import-law`).

## Verify

```bash
node --test tests/implementation/brand-tokens.test.mjs
node --test tests/implementation/brand-wordmark-csp.test.mjs
npm run web:style:check
npx --no-install biome check packages/brand/src
```

## Review

Review: load the pages `docs/development/review/areas.json` maps your paths to (mostly `frontend.md`).
