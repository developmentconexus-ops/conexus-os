# contracts

The wire contracts. `api/product/` is the Product HTTP API in OpenAPI, `api/technical/` the technical ingress, and `technical/` the Hub's database role register and catalog snapshot. [`wire-contract.md`](../docs/product/wire-contract.md) owns the rules these files follow.

## Traps

- `api/product/openapi.yaml` lists every path by an explicit `$ref`. An operation added to a `*-paths.yaml` file alone is invisible. `npm run wire:bijection` fails on it.
- A contract change and its [`operation-ledger.md`](../docs/product/operation-ledger.md) row go in one commit.
- The Hub routes in `apps/hub/src/generated/` and the web clients in `apps/web/src/generated/` come from `openapi.yaml`. Regenerate them in the same commit with `npm run r1:s1:generate`, `npm run r1:s2:generate` and `npm run r1:s3:p5:generate`.
- `technical/hub-catalog-snapshot.json` is written only by `npm run db:catalog:snapshot`. `technical/hub-database-roles.json` is the one role register. After you change it, run `npm run db:roles:generate`.

## Verify

```bash
npm run wire:verify
npm run r1:s2:check
npm run db:roles:check
npm run db:catalog:check     # needs PostgreSQL
```

## Review

Review: load the pages [`areas.json`](../docs/development/review/areas.json) maps your paths to. `api/` is [`contracts.md`](../docs/development/review/contracts.md), `technical/` is [`data-migrations.md`](../docs/development/review/data-migrations.md).
