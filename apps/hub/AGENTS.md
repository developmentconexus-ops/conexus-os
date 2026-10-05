# apps/hub

The Hub: the Fastify control plane, its PostgreSQL migrations and the Builder. [Architecture](../../docs/reference/architecture.md) says what the Hub owns and what Mastra owns.

## Traps

- Owners never deep-import one another, except the shared contracts `scripts/check-import-law.mjs` names (the session contract and the application-server manifest). `platform/` imports no application layer, and `hub.ts` imports only the module constructors and platform helpers the checker allowlists. `npm run test:import-law` enforces it.
- Migrations follow [database](../../docs/reference/database.md#migrations). Running them against the pilot changes it for good, so it needs the operator's Aprovo.
- Generated application code never runs in the Hub process. It goes through the application runner (`src/app-runner/module.ts`).
- An importable Mastra `dist/` path is not a public API. Check the [Mastra boundary](../../docs/reference/mastra/boundary.md) before you use one, and never write Mastra tables.

## Verify

```bash
npm run typecheck:hub
npm run test:import-law
npm run db:roles:check
npm run db:catalog:check     # needs PostgreSQL
```

Then the `tests/implementation/` suites for what you touched.

## Review

Review: load the pages [`areas.json`](../../docs/development/review/areas.json) maps your paths to.
