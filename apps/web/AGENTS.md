# apps/web

The Conexus web app: React, strict TypeScript, Vite, TanStack Router and Query, composed from `@mastra/playground-ui`. The Hub serves the built files. For any change here, load [`.agents/skills/conexus-frontend/SKILL.md`](../../.agents/skills/conexus-frontend/SKILL.md).

## Run and test

Run from the repository root, in WSL, after `source "$HOME/.nvm/nvm.sh"; nvm use`:

```bash
npm run typecheck:web         # TypeScript
npm run web:style:check             # every class has a CSS rule; the Mastra theme stays on brand tokens
npx --no-install biome check apps/web/src
npx --no-install playwright install chromium
node --test --test-concurrency=1 tests/implementation/project.browser.test.mjs   # also builder-, settings-
npm run hub:local                   # full Hub at https://hub.conexus.localhost:3443; needs CONEXUS_HUB_ENV (the Hub env file)
```

The browser suites serve this app through Vite and stub the API, so they need no Hub.

## Invariants

- Colors, fonts and the rest of the visual rules are in [`DESIGN.md`](../../DESIGN.md).
- `src/main.tsx` loads `@mastra/playground-ui/style.css`, then the brand tokens, then `src/styles.css`. Keep that order.
- Mastra's palette changes only in `src/mastra-theme.css`, by re-pointing its custom properties at tokens. Size and layout go in a `cx-*` class next to the screen.
- What the web app may own is in [architecture](../../docs/reference/architecture.md#the-web-app).

## Review

Review: load the guides [`areas.json`](../../docs/development/review/areas.json) maps your paths to.
