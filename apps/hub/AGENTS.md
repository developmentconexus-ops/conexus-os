# apps/hub

The Hub: the Fastify control plane, its PostgreSQL migrations, and the Builder that drives the Mastra Factory. [`single-owner-map.md`](../../docs/reference/single-owner-map.md) says what the Hub owns and what Mastra owns.

## Traps

- Owners never deep-import one another, except the shared contracts `scripts/check-import-law.mjs` names (the session contract and the application-server manifest). `platform/` imports no application layer, and `server.ts` imports only module constructors. `npm run r1:s2:import-law` enforces it.
- A migration on `main` is never edited. Add the next number, pin its SHA-256 in `scripts/run-hub-migrations.mjs`, then run `npm run db:catalog:snapshot`. Running migrations against the pilot changes it for good, so it needs the operator's Aprovo ([WSL environment](../../.agents/skills/conexus-development/references/wsl-environment.md)).
- Generated application code never runs in the Hub process. It goes through the application runner (`src/app-runner/module.ts`).
- `@mastra/factory` 0.15.0 exports every `dist/` file, so an importable path is not a public API. Check [`mastra-boundary.md`](../../docs/reference/mastra-boundary.md) before you use one, and never write Mastra tables.

## Verify

```bash
npm run r1:s2:hub:typecheck
npm run r1:s2:import-law
npm run db:roles:check
npm run db:catalog:check     # needs PostgreSQL
```

Then the `tests/implementation/` suites for what you touched.
