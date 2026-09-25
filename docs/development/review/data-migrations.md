# Review: Data and migrations

## Scope

The Hub database: forward-only migrations, the baseline, the catalog snapshot, database roles, the
stores that issue SQL, and the scripts that generate or apply them. Paths, as
[`areas.json`](areas.json) lists them:

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

## What to check

- [ ] A migration is a new, next-numbered file. No applied migration or the baseline is edited by
      hand. Owner: [Baseline and forward migrations](../../reference/data-and-persistence.md#baseline-and-forward-migrations).
- [ ] The catalog snapshot is regenerated with `npm run db:catalog:snapshot` and committed in the
      same pull request. Owner: [Git and pull requests](../delivery.md#git-and-pull-requests).
- [ ] A function a later migration recreates keeps every invariant the earlier definition enforced.
      The reviewer diffs the old body against the new one, not only the signature.
- [ ] A migration that touches real data carries `needs:aprovo`. Owner:
      [Ask for "Aprovo"](../delivery.md#ask-for-aprovo-on-three-kinds-of-change).
- [ ] A store connects as the capability role the
      [Hub database role register](../../reference/hub-database-roles.md) names for its module. A
      new role is a row in `contracts/technical/hub-database-roles.json`, and the projection is
      regenerated. `npm run db:roles:check` refuses drift.
- [ ] A rule PostgreSQL enforces (CHECK, `SECURITY DEFINER` function, partial index) is not
      repeated in TypeScript beyond boundary parsing.

## Proof required

- Every PostgreSQL leaf the change touches ran at the head SHA with zero skipped cases. The
  reviewer opens the `verify` run for the exact head SHA, finds each leaf, and reads its
  `skipped` count. A case skipped with "real PostgreSQL configuration not supplied" is a failed
  item, whatever the check's color.
- A local or sandbox run with skipped PostgreSQL cases proves nothing about them. In #243 the
  Factory's sandbox skipped all five cases of `application-access-postgres.test.mjs`, and a green
  `verify` badge did not say whether CI ran them.
- `db-catalog-snapshot`, `db-baseline-file` and `db-role-register` passed at the head.

## Traps from history

- Migration 047 recreated a function migration 040 had created, without `CREATE OR REPLACE`, so
  every fresh install failed. Fixed by #72 (`c0328ca3`). The single definition now lives in the
  baseline at `apps/hub/migrations/0001_baseline.sql:1547`.
- Migration 038 recreated three Builder functions and silently dropped their authorization,
  staleness and settlement checks. Fixed by `5de60585`, which restored them in migration 039. Now
  at `apps/hub/migrations/0001_baseline.sql:582-600`.
- The migration runner compared the database to the finished catalog after each migration, so any
  install or upgrade of more than one file failed. Fixed by #117 (`1d8d7abb`), which checks once
  after the loop. Now at `scripts/run-hub-migrations.mjs:149-165`.
- Role register drift named "line 3" instead of the drifted role, and role invariants were forced
  rather than read from `pg_roles`. Fixed by #96 (`35642050`). Now at
  `scripts/generate-hub-role-register.mjs:93-104`.

## Principles

- **Make Operations Idempotent.** A migration and a provisioning script converge from any partial
  prior run.
- **Model the Domain.** The database owns the invariant. TypeScript parses input and calls the
  function that enforces it.
- **Boundary Discipline.** A row is external data until the store parses it into the typed model.
- **Prove It Works.** A migration claim needs PostgreSQL cases that ran, not ones that skipped.
- **Fix Root Causes.** A failing install is reproduced against a fresh database before it is fixed.
