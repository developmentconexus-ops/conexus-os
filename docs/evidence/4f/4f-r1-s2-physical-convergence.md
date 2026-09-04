# 4F(R1) — S2 physical convergence

> **Status:** `CLOSED / FABLE + GEMINI ACCEPT / MATERIAL 0 / GLOBAL MAXIMUM CLEAR`
> **Authority:** operator-granted `R1/S2` only
> **Production mutation:** permitted only after the P0 custody plan is published and independently validated

## 1. Bounded question

This convergence closes only the physical mechanics that the approved 4F graph,
the closed A0 architecture boundary and the operator's S2 grant left for
realization:

- WS-01 atomic Workspace creation plus creator access and `project.create`;
- IAM-01 disclosure of the creator's Workspace access;
- WS-02 authorized Workspace summary read;
- exact SQL capability, migration and receipt custody needed to make those three
  paths mechanical.

It does not reopen Product planning. It creates no new Permission or role,
does not infer Workspace administration and does not authorize R1C-14/S3,
R1C-13/cognition, provider calls, commit, push, PR or merge.

## 2. Selected physical contract

### 2.1 Tables and owner boundary

Migration `002_workspace_foundation.sql` adds exactly:

```text
workspace.workspace(
  workspace_id uuid primary key,
  name text nonblank,
  created_at timestamptz
)

workspace.operation_idempotency(
  operation_id = 'WS-01',
  account_id,
  key_digest,
  request_digest,
  reserved_workspace_id,
  outcome = RESERVED | SUCCEEDED,
  response_status,
  response_digest,
  response_body,
  created_at,
  completed_at,
  primary key(operation_id, account_id, key_digest)
)

iam.workspace_membership(
  account_id,
  workspace_id,
  can_create_project,
  created_at,
  primary key(account_id, workspace_id)
)
```

`iam.workspace_membership.workspace_id` uses the already accepted Tier-2
foreign key to `workspace.workspace.workspace_id` with `ON DELETE RESTRICT`.
The narrow `REFERENCES` privilege belongs to `iam_owner`; no application login
receives table privilege. I&A never mirrors the Workspace name.

### 2.2 Exact functions

All six functions are `SECURITY DEFINER`, have fixed safe search paths,
fully-qualified static SQL, owner-local table access and `PUBLIC` execution
revoked:

1. `workspace.reserve_or_replay_create_workspace(uuid,text,text,uuid)` returns
   `(state text, workspace_id uuid, response_status integer, response_body jsonb)`;
2. `workspace.create_workspace(uuid,text)` returns `void`;
3. `iam.establish_workspace_creator_access(uuid,uuid)` returns `void` and inserts
   only `can_create_project = true` creator membership;
4. `workspace.complete_create_workspace_receipt(uuid,text,integer,text,jsonb)`
   returns `void`;
5. `iam.list_workspace_memberships(uuid)` returns `TABLE(workspace_id uuid)`;
6. `workspace.list_workspace_summaries(uuid[])` returns
   `TABLE(workspace_id uuid, name text)`.

No function may read or mutate the other owner's schema. The application composes
owner functions through enumerated execute capability only.

### 2.3 Roles and transaction shapes

`hub_ws01_command` is `LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS`, has schema
usage and execute on exactly functions 1–4, and has zero table privilege. One
checked-out client runs one transaction in the exact order 1→2→3→4. Replay
short-circuits after function 1; changed request under the same key rolls back
and maps to `409`; failure at any boundary exposes no orphan Workspace.

`hub_s2_read` is one shared capability because IAM-01 and WS-02 require the same
two grants. It is `LOGIN NOINHERIT NOSUPERUSER NOBYPASSRLS`, has schema usage
and execute on exactly functions 5–6, and has zero table privilege. A standing
catalog census refuses a third execute grant. One pool is injected through two
operation-specific store ports; sharing a platform pool does not create an
owner-to-owner import.

IAM-01 uses one checked-out `hub_s2_read` client, `BEGIN READ ONLY`, exactly one
statement, then commit:

```sql
SELECT s.workspace_id, s.name
FROM workspace.list_workspace_summaries(
  ARRAY(SELECT m.workspace_id
        FROM iam.list_workspace_memberships($1) m)
) s
ORDER BY s.name, s.workspace_id
```

WS-02 uses the same transaction shape and one statement:

```sql
SELECT s.workspace_id, s.name
FROM workspace.list_workspace_summaries(
  ARRAY(SELECT m.workspace_id
        FROM iam.list_workspace_memberships($1) m
        WHERE m.workspace_id = $2)
) s
```

The single statement gives membership and summary projection one MVCC snapshot.
Zero rows map to `404` for both nonexistent and unauthorized Workspace, avoiding
an existence oracle. Unauthenticated remains `401`.

## 3. Migration and custody law

- `001_iam_foundation.sql` is byte-immutable.
- `002_workspace_foundation.sql` is the only S2 Product migration.
- The runner applies files lexically, stores SHA-256 in the existing
  `iam.schema_migration` ledger, refuses changed applied bytes and refuses an
  unapplied version below the highest applied version.
- A legacy database may backfill the `001` ledger row only when the migration
  digest equals the A0-bound digest and the live I&A catalog census passes.
- Pinned Atlas validates migration checksums/order; the runner and ledger own
  application ordering.
- P0 binds the A0 generation receipt, declares every authorized path and
  mutation window, and validates bootstrap bytes before Product mutation.
- P1–P5 each publish a canonical part-PASS only after named proof and two
  independent accepts. P5 emits conformance, ownership manifest and generation
  receipt last. Historical G0/S1/A0 receipts remain immutable.

## 4. Ordered parts

| Part | Outcome | Main falsifiers | Stop condition |
| --- | --- | --- | --- |
| P0 | JSON custody schema, plan, validator, recorders and RED controls; no Product byte | tampered plan/bootstrap, unlisted path, noncanonical JSON, broken A0 chain | any prior receipt/standing guard mismatch |
| P1 | migration, runner, ledger and live catalog conformance | migration reorder/back-insert, digest drift, broad grant, PUBLIC execute, table privilege | any catalog or ledger excess |
| P2 | complete Workspace Hub module, WS-01/WS-02 routes and one generator event for server route plus web client | replay mismatch, boundary orphan, 401/404 matrix, second WS-02 query, import-law RED | generic SQL/composition, owner import, generated hand edit |
| P3 | IAM-01 real Workspace projection and creator re-entry | stale empty projection, revoked membership disclosure, second read query, authority excess | I&A stores Workspace name or grants new authority |
| P4 | web setup/create/re-entry flow and CI objective proof | browser negatives, cache retained after 401/sign-out, feature import, dormant/unconsumed behavior | browser authority persistence or prose-status guard |
| P5 | full deciding-runtime proof and receipt-last closure | proof census drift, historical receipt mutation, operation/class census mismatch | any unresolved conflict or APP-OWNED mutation |

The deterministic S2 generator emits both
`apps/hub/src/generated/s2-routes.ts` and
`apps/web/src/generated/workspace-client.ts` once in P2. P4 consumes the client
without reopening its generated mutation window.

## 5. Independent convergence

Claude Code Fable session `8793974d-82af-4461-9eb4-3fafd0bb2e8e` and AGY Gemini
Pro conversation `413018ce-d130-446b-ba66-a10985e74727` independently challenged
the physical contract and then completed directed convergence. The Lead refused
their first nominal accepts because their role topologies disagreed, and refused
the second nominal convergence because generated-client timing still disagreed.
The final directed round closed both discrepancies:

```text
CONVERGENCE = ACCEPT
MATERIAL_REMAINING = 0
GLOBAL_MAXIMUM = CLEAR
READ_ROLE = hub_s2_read
GENERATED_CLIENT_PART = P2
S2_PRODUCTION_MUTATION = AUTHORIZED_AFTER_VALIDATED_CUSTODY
```

## 6. Lead adjudication

`CLEAR AFTER VALIDATED P0 CUSTODY`.

The contract is now specific enough for implementation to be mechanical. The
first permitted action is P0 governance bootstrap and validation. Production
mutation remains stopped until that validation record exists and both reviewers
accept its exact subject.
