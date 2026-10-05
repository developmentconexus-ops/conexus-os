# Database

How Conexus stores data and changes its schema: the stores, the roles, where a rule lives, and
migrations. Owners next door: [security](security-and-authority.md) for who may act and the session
model, [architecture](architecture.md) for which store owns which concept, and
[backup](backup.md) for the restore runbook. Exact facts have machine owners: the role register
[`contracts/technical/hub-database-roles.json`](../../contracts/technical/hub-database-roles.json),
the table register `contracts/technical/hub-catalog-census.json`, the catalog snapshot and the
generated [function callers](function-callers.md).

## Stores

- Hub PostgreSQL holds the Conexus schemas. Mastra's storage lives in the schema `factory`, owned by
  `hub_factory`, the one login role that runs DDL; no other role holds a grant on `factory`.
  Enforced by `npm run db:catalog:check` and `tests/implementation/builder-conexus-git.postgres.test.mjs`.
- Project Git is the authoring truth of a Project's source, never authorization or serving truth.
  Stored bytes with the same digest are not the same identity or the same authorization. Review.
- Keycloak's persistence is provider-owned. Conexus keeps only `(issuer, subject)` on `iam.account`
  and mirrors no Keycloak role, group or claim. A restore brings back one consistent PostgreSQL
  generation with the Keycloak state that keeps each subject stable, and never remaps an Account.
  Review.
- The Applications cluster holds `conexus_apps`, one schema per Project and environment, each with a
  migration role and a runtime role. A Project role has no usable password and is admitted only over
  TLS with the runner's client certificate, and a Project session cannot raise its own bounds. The
  Applications cluster refuses any Hub role (`APPLICATION_CLUSTER_HOLDS_HUB_ROLES`); that the Hub's
  cluster holds no application role is review. A privilege given to a `NOINHERIT` role says
  `WITH INHERIT TRUE` or is used through `SET ROLE`. Enforced by
  `scripts/confine-application-cluster.mjs`, `scripts/provision-application-database.mjs` and the
  runner's PostgreSQL tests.

## Roles

`hub_runtime` is the one login role for the Hub's data. It runs no DDL, holds nothing on `factory`
and no `BYPASSRLS`, and executes only the functions the older capability roles held. Each
Product transaction switches to `hub_reader` or `hub_command` (`NOLOGIN NOINHERIT NOBYPASSRLS`)
right after `BEGIN`; its authority is that role, the row policies and the admission proof. The
readers not yet ported (`unportedPool`) and the instance-lock session still run as `hub_runtime`,
with the grants and the `legacy_runtime` policy the census lists under its `runtimePrivileges`
ceiling. A store reaches the
database only through `apps/hub/src/platform/db.ts`. No Hub role is a member of another, except
`hub_runtime` in the two transaction roles. A new role is a row in the register with its
projection regenerated; `npm run db:roles:provision`, an installation step, supplies the passwords.
A role is cluster-global: it is created in an idempotent `DO` block, and a
test never changes a role on a cluster that hosts a protected database. Enforced by
`npm run db:roles:check`, `assertRoleInvariants` in `scripts/hub-catalog.mjs`,
`tests/implementation/protected-cluster.mjs` and review.

## Where a rule lives

- Integrity stays in PostgreSQL: keys, CHECK, partial indexes, row policies. A business rule is a
  pure TypeScript function over rows the command locked, behind an admission proof; a new
  `SECURITY DEFINER` function that holds a rule is refused, and TypeScript does not re-implement a
  rule PostgreSQL enforces. Enforced by `ruleFunctions` (only falls) and review.
- A foreign key across owners is admitted only where it protects stable structural identity or
  containment whose dangling state would be invalid; any other cross-owner reference is an id or a
  digest without a key. Review.
- A security-sensitive write that consumes authority owned elsewhere serializes with a concurrent
  revoke through its commit. Review.
- A split table has `ENABLE` and `FORCE ROW LEVEL SECURITY`, a `reader` policy `TO hub_reader` built
  on the `rls.*` helpers if and only if `hub_reader` reads it (plus `reader_admin` where the row says), one `command` policy `TO hub_command FOR ALL USING (true) WITH CHECK (true)`,
  a `legacy_owner` policy for each owner role whose functions still read it, and exactly the grants
  its table register row lists. Enforced by `npm run db:catalog:check`.
- A write keeps its filter in the SQL template: `update` and `delete` have a top-level `where`, no
  `merge`, an upsert's `do update` has its own `where`, and the `where` on a split table compares a
  key column its register row names: `sqlWrites` in `scripts/census-boundaries.mjs`. Values are bind
  parameters by construction of the `sql` tag in `platform/db.ts`.
- A ceiling in `hub-catalog-census.json` only falls; the reviewer reads its diff for a number that
  went up, which the lint cannot tell from a legitimate one. Review.
- A change to the output of `packages/canonical-json` is a data change: stored request digests stop
  matching. Review.

## Migrations

- A migration is a new file, numbered after the last (review), pinned by SHA-256 in `scripts/run-hub-migrations.mjs`
  and recorded in `iam.schema_migration`. An applied migration and the baseline are never edited by
  hand. After a migration change, run `npm run db:catalog:snapshot` and commit the snapshot. Enforced
  by the runner, which refuses a changed checksum and a catalog that differs from the snapshot.
- Rollback is forward only: a new migration undoes one that reached a database. A change that drops
  a function or table says what the new migration would restore. Review.
- A function a later migration recreates keeps every invariant the earlier body enforced; the
  reviewer diffs the bodies. Review.
- A dropped function leaves no caller, and the regenerated function callers file is in the same
  commit: `npm run db:callers:check`. It names its exact signature, without `CASCADE`: review.
- The baseline is pinned by digest in the runner, and `npm run db:baseline:check` proves it is what
  `scripts/generate-hub-baseline.mjs` renders. It changes only by the operator's explicit squash
  decision, with a digest-equality proof and an adoption path for every installation behind it:
  review.
- A migration carries `needs:aprovo` ([delivery](../development/delivery.md#ask-for-aprovo-on-three-kinds-of-change)).
