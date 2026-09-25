# Review: Data and migrations

## Scope

The Hub database: forward-only migrations, the baseline, the catalog snapshot, database roles, the stores that issue SQL, and the scripts that generate or apply them. Paths, as [`areas.json`](areas.json) lists them:

- `apps/hub/migrations/**`
- `contracts/technical/**`
- `apps/hub/src/*/store.ts`
- `apps/hub/src/registry/application-artifact-store.ts`
- `apps/hub/src/platform/postgres.ts`
- `apps/hub/src/platform/hub-roles.generated.ts`
- `apps/hub/src/platform/connection-census.ts`
- `scripts/run-hub-migrations.mjs`
- `scripts/generate-hub-baseline.mjs`
- `scripts/generate-hub-catalog-snapshot.mjs`
- `scripts/hub-catalog.mjs`
- `scripts/generate-hub-role-register.mjs`
- `scripts/provision-hub-roles.mjs`
- `scripts/cutover-hub-role-names.mjs`
