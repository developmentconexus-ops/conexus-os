# 4F(R1) — S2 Workspace foundation implementation result
> **Status:** `CLOSED / PASS / RECEIPT-LAST`
> **Boundary:** `S2 — Workspace foundation only`
> **Product operations realized:** `WS-01`, `WS-02`
> **Existing projection completed:** `IAM-01 Workspace summaries`
> **Later Product operations realized:** `0`

## 1. Admitted result

S2 realizes the smallest Workspace vertical admitted by the validated physical
plan. An authenticated platform operator can create one Workspace through
`WS-01`; the command derives creator authority from the current Conexus session,
creates the Workspace and creator membership, and settles the idempotency
receipt in one transaction. `WS-02` discloses a Workspace only through current
membership. `IAM-01` now returns the real membership-derived Workspace summary
projection and still returns no Project projection.

The React flow consumes only generated clients. It supports trusted Account
setup, first Workspace creation, immediate WS-02 confirmation, reload/re-entry,
selection of an existing Workspace and Conexus-only sign-out. A `401` removes
the complete authority-bearing Query cache while an external authority-loss
signal keeps the UI out of a false pending state. A successful fresh IAM-01 is
the only event that clears that signal.

## 2. Database, owners and authority

Migration `002_workspace_foundation.sql` preserves immutable migration `001`
and adds exactly:

- schema `workspace`;
- tables `workspace.workspace`, `workspace.operation_idempotency` and
  `iam.workspace_membership`;
- login roles `hub_ws01_command` and `hub_s2_read`;
- six bounded `SECURITY DEFINER` functions for reserve/create/complete and
  membership-shaped reads.

The migration runner owns lexical application order and SHA-256 ledger
integrity, refuses back-insert and changed applied bytes, validates the complete
live catalog for fresh/restart/legacy paths, and refuses excess migration files.
`hub_ws01_command` cannot read tables or assume owners; `hub_s2_read` receives
only the two admitted read functions. `PUBLIC` receives no schema/function
authority. No Permission, transferable admin, caller-selected Account or broad
SQL surface was added.

One shared read-pool object serves the operation-specific IAM-01 and WS-02 ports;
I&A does not own its lifecycle. WS-01 has its separate command capability. The
feature owners do not import each other, and the production import graph passes
the exact layer/import census.

## 3. HTTP, idempotency and disclosure law

WS-01 accepts only the generated body and one idempotency key. Same-key/same-
request replay returns the settled response; same-key/changed-request is `409`.
Any failure before terminal settlement rolls back Workspace, membership and
receipt together. The browser retains the exact key only for an ambiguous retry
of the same semantic name and mints a new key when that intake changes.

WS-02 is one read-only statement. Missing, unauthorized and malformed opaque
identifiers converge on detail-free `404`; the UI gives `403` and `404` one
non-oracular presentation. Uncaught driver/runtime failures are mapped to fixed
Problem Details without raw diagnostic leakage. Workspace creation advances
only when the server response confirms both `initialAccessEstablished === true`
and the exact current creator Account.

## 4. Qualification

Deciding qualification ran on Linux x64 with Node `24.20.0`, npm `12.0.2`,
PostgreSQL `17.10`, Keycloak `26.7.2` and Playwright `1.62.1`/Chromium. All
credentials and state were synthetic; the temporary containers, volumes and
network were removed after proof.

```text
npm ci                                      = PASS / 191 packages / 0 vulnerabilities
S2 migration + real PostgreSQL              = PASS
S2 generated projection + drift             = PASS / WS-01 + WS-02
Hub strict typecheck                         = PASS
Web strict typecheck / skipLibCheck=false    = PASS
S1 HTTP regression                           = PASS / 7 of 7
S2 HTTP                                      = PASS / 7 of 7
IAM-01 real reads                            = PASS / 4 of 4
Import law + RED controls                    = PASS / 26 of 26
Biome objective CI command                   = PASS / zero errors
real Keycloak + PostgreSQL + Chromium        = PASS / 1 of 1
npm run verify                               = PASS
```

The live journey proves first login/bootstrap, Account setup, Workspace
creation, immediate and reload re-entry, exact replay-body equality, `409` for
changed intake under the same key, sign-out and subsequent `401`, plus a second
Account that sees no Workspace, receives `403` on WS-01 and `404` on the first
Account's WS-02 identity.

## 5. Independent convergence and closure

The two established review lanes independently accepted the final P4 subject
with `MATERIAL_REMAINING=0` and `GLOBAL_MAXIMUM=CLEAR`. The canonical Lane 1
record retains the legacy reviewer label `Claude Code Fable`; by explicit
operator ratification its `sessionId` identifies the actual Opus session. The
label is not parametrized during S2 and may change only in a later P0-class
reopening.

Receipt-last closure publishes the P0–P5 chain, conformance result, ownership
manifest and generation receipt without mutating any historical G0/S1/A0
receipt. The admitted Product delta is exactly two new operations, one completed
existing projection, one schema, three tables, two login roles, zero new
Permissions and zero APP-OWNED mutations.

```text
G0 = CLOSED / PASS
S1 = CLOSED / PASS
A0 = CLOSED / PASS
S2 = CLOSED / PASS / RECEIPT-LAST
R1C-14 = REQUIRED IMMEDIATELY BEFORE S3
R1C-13 = REQUIRED IMMEDIATELY BEFORE S6
S3 / GIT SOURCE WORK = NOT AUTHORIZED BY S2
COGNITION / PROVIDER CALL = NOT AUTHORIZED BY S2
COMMIT / PUSH / PR / MERGE = UNAUTHORIZED
```

Any operation outside IAM-01..03/WS-01/02, owner-to-owner import, broad SQL,
new Permission/admin authority, cross-Workspace disclosure, orphan terminal
receipt, retained authority cache, historical receipt mutation, APP-OWNED
mutation or stale/non-firing proof reopens the smallest owning S2 authority.
