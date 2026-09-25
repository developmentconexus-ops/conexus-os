# apps/web

The Conexus web app: React, strict TypeScript, Vite, TanStack Router and Query, composed from `@mastra/playground-ui`. The Hub serves the built files. For any change here, load [`.agents/skills/conexus-frontend/SKILL.md`](../../.agents/skills/conexus-frontend/SKILL.md).

## Run and test

Run from the repository root, in WSL, after `source "$HOME/.nvm/nvm.sh"; nvm use`:

```bash
npm run r1:a0:web:typecheck         # TypeScript
npm run web:style:check             # no raw hex, only the three brand fonts
npx --no-install biome check apps/web/src
npx --no-install playwright install chromium
node --test --test-concurrency=1 tests/implementation/project-browser.test.mjs   # also builder-, settings-
npm run hub:local                   # full Hub at https://hub.conexus.localhost:3443; needs .audit/slice7/hub.env
```

The browser suites serve this app through Vite and stub the API, so they need no Hub.

## Invariants

- Every color is a `var(--cx-*)` token from `packages/brand/src/tokens.css`. Every font is a `--cx-font-*` token.
- `src/main.tsx` loads `@mastra/playground-ui/style.css`, then the brand tokens, then `src/styles.css`. Keep that order.
- Mastra's palette changes only in `src/mastra-theme.css`, by re-pointing its custom properties at tokens. Size and layout go in a `cx-*` class next to the screen.
- The client shows server truth. It never decides authorization or invents a state the server did not report.

## Review

Review: load the pages [`areas.json`](../../docs/development/review/areas.json) maps your paths to (mostly [`frontend.md`](../../docs/development/review/frontend.md)).
