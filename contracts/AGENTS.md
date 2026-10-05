# contracts

The wire contracts. `api/product/` is the Product HTTP API in OpenAPI, `api/technical/` the technical ingress, and `technical/` the Hub's database role register and catalog snapshot. [`wire-contract.md`](../docs/product/wire-contract.md) owns the rules these files follow, and [database](../docs/reference/database.md) the role register.

## Traps

- `api/product/openapi.yaml` lists every path by an explicit `$ref`. An operation added to a `*-paths.yaml` file alone is invisible. `npm run wire:bijection` fails on it.
- `technical/builder-run-vocabulary.json` is the one list of Builder run states, phases and result kinds. The Hub and the web import the copies `node scripts/generate-builder-run-vocabulary.mjs` writes into their `src/generated/`; a change also needs a migration for the matching `builder_run` CHECK constraint, and `tests/repository/builder-run-vocabulary.test.mjs` names every list still behind.
- `technical/hub-catalog-snapshot.json` is written only by `npm run db:catalog:snapshot`. `technical/hub-database-roles.json` is the one role register. After you change it, run `npm run db:roles:generate`.

## Verify

```bash
npm run wire:verify
npm run generate && git status --short   # nothing may change
npm run db:roles:check
npm run db:catalog:check     # needs PostgreSQL
```

## Review

Review: load the guides [`areas.json`](../docs/development/review/areas.json) maps your paths to.
