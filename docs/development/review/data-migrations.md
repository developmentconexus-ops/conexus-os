# Review: Data and migrations

## Scope

The Hub database: forward-only migrations, the baseline, the catalog snapshot, database roles, the
stores that issue SQL, and the scripts that generate or apply them. [`areas.json`](areas.json) owns the paths.

## What to check

- [ ] A migration is a new, next-numbered file. No applied migration or the baseline is edited by
      hand. Owner: [Baseline and forward migrations](../../reference/data-and-persistence.md#baseline-and-forward-migrations).
- [ ] The catalog snapshot is regenerated with `npm run db:catalog:snapshot` and committed in the
      same pull request. Owner: [Git and pull requests](../delivery.md#git-and-pull-requests).
- [ ] A function a later migration recreates keeps every invariant the earlier definition enforced.
      The reviewer diffs the old body against the new one, not only the signature.
- [ ] A migration that touches real data carries `needs:aprovo`. Owner:
      [Ask for "Aprovo"](../delivery.md#ask-for-aprovo-on-three-kinds-of-change).
- [ ] A store reaches the database only through `platform/db.ts`, as `hub_runtime`. A new role is a
      row in `contracts/technical/hub-database-roles.json` with the projection regenerated, and
      `npm run db:roles:check` refuses drift. No migration gives `hub_runtime` DDL, `BYPASSRLS` or a
      grant on `factory`.
- [ ] Integrity stays in PostgreSQL (keys, CHECK, partial indexes, row policies); a business rule is a
      pure TypeScript function over rows the command locked, behind an admission proof. A new
      `SECURITY DEFINER` function that holds a rule is refused: `ruleFunctions` in
      `contracts/technical/hub-catalog-census.json` may only fall.
- [ ] A migration that polices a table adds `FORCE ROW LEVEL SECURITY`, one policy per command
      `TO hub_runtime` where read and write authority differ (a `WITH CHECK` is never `true`, and a
      `DELETE` or `UPDATE` is gated by `USING`), a `legacy_owner` policy for the owner role of every
      function that still reads the table, and the grants the policies allow and no more. It removes
      the table's row from `UNSCOPED_TABLES`. A command `hub_runtime` holds no grant for needs no policy. `npm run db:catalog:check` derives the bridge owners from
      the function bodies and fails on any table that is neither policed nor listed.
- [ ] A migration that drops a function names its exact signature, without `CASCADE`, and
      `npm run db:callers:check` shows no caller left in another function's body or in the SQL text of
      `apps/hub/src`. The regenerated `docs/reference/function-callers.md` is in the same commit.
- [ ] A change to the output of `packages/canonical-json` is a data change: the idempotency tables
      store `request_digest`, the SHA-256 of those bytes, so a retry of a request made before the
      deploy fails with `IDEMPOTENCY_CONFLICT`. See [its AGENTS.md](../../../packages/canonical-json/AGENTS.md).

## Proof required

- `db-catalog-snapshot` (which includes the catalog lint), `function-callers`, `db-baseline-file` and `db-role-register` passed at the head.

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
- **Model the Domain.** The database keeps integrity; the rule is a pure function over rows the command
  locked, and only an admission function makes the proof the command needs.
- **Boundary Discipline.** A row is external data until the data module parses it with a schema into
  the typed model.
- **Fix Root Causes.** A failing install is reproduced against a fresh database before it is fixed.
