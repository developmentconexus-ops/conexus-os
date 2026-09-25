# apps/hub

The Hub: the Fastify control plane, its PostgreSQL migrations, and the Builder that drives the Mastra Factory. [`single-owner-map.md`](../../docs/reference/single-owner-map.md) says what the Hub owns and what Mastra owns.

## Traps

- Owners never deep-import one another, except `identity-access/current-session.ts`. `platform/` imports no application layer, and `server.ts` imports only module constructors. `npm run r1:s2:import-law` enforces it.
- A migration on `main` is never edited. Add the next number, pin its SHA-256 in `scripts/run-hub-migrations.mjs`, then run `npm run db:catalog:snapshot`. Never run migrations against the pilot.
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

## Review

Review: load the pages `docs/development/review/areas.json` maps your paths to. `src/identity-access/` is `identity-session.md`, `migrations/` is `data-migrations.md`, `src/builder/` and `compiler-template/` are `builder-factory.md`, except `model-accounts.ts`, `google-ai-pro/` and the GitHub files, which are `connectors.md`. The rest is `platform.md`.
