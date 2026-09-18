# Conexus OS roadmap

This file owns mutable status, allowed work, and the exact next action.

Current program: [Builder operational delivery](tasks/builder-first-app.md).
Current task: [Builder repair program](tasks/builder-repair-program.md).
Predecessor task: [Approved interactive Builder](tasks/builder-interactive-delivery.md),
whose repair ledger this program closes.
Technical authority: [C-020](reference/builder-c020-mastra-native.md).
Interaction authority: [Frontend section 33.6](reference/frontend-and-product-surfaces.md#336-build-surface).

## Current direction

On 2026-09-17 the operator approved `conexus_builder_interativo.html` as the
functional reference for the ordinary Builder. Functionality and interaction
matter now. Colors, typography, theme fidelity, and pixel matching do not gate
implementation. Preserve the app-first workspace and contextual chat.

Deliver one real path: connect Claude from the chat, select a model, send a
request, see native activity, use Preview, change the model for the next request,
and continue through a failed build or reload. Keep Code/Diff read-only and
execution details safe. Demo playback controls and artificial metrics are not
Product features.

## Current state

| Work | Disposition |
| --- | --- |
| 7R-0 | CLOSED. Preserve adopted native Mastra findings. |
| 7R-1 | ACCEPTED. Preserve live-state and reconnect behavior. |
| 7R1-LIVE-01 | CLOSED. Accepted correction is `fb1b1d4fe77e5a60e1d8bf78adacbf1e11ffad57`. |
| 7R-2 | REPLAN. Partial evidence at `ed658c65152db27390dc1c5c88ff6d1b5cfa406e` remains partial; it is not a universal gate. |
| First operational delivery | UNACCEPTED predecessor evidence. Its remaining guarantees are integrated into the current task, not waived. |
| Claude Account connection | Predecessor candidate `f9fbb655463aa24da1c3e902c20d555487ce9629` was never accepted as a delivery, and its corrections are incorporated in the current task. The connection surface itself is CURRENT PRODUCT: the approved journey requires connecting Claude and selecting a model, so its six Control Plane operations are current Product authority and belong in the fixed Product census. |
| Interactive HTML | FUNCTIONAL REFERENCE APPROVED BY OPERATOR. Exact artifact identity is in frontend section 33.6. This is not Product implementation acceptance. |
| Interactive Builder delivery | APPROVED FOR EXECUTION under the current task. Four ordered units form one integrated candidate. |
| Builder repair program | APPROVED FOR EXECUTION. Six ordered PRs close the repair ledger. The operator merges each one. |
| Broader platform and visual polish | DEFERRED. No requirement to finish them before operating the Builder. |

The initial accepted 7R-1 implementation remains
`3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`.
The planning publication at `2e39f3ebd5db24838358671604f4b29c1583e4fa`
is predecessor evidence. Its earlier execution restriction is superseded only
within this operator-approved functional delivery and the current task's limits.

## Current grant

Execute [builder-repair-program.md](tasks/builder-repair-program.md) and the
credential and role remediation described below. Both are current.
On 2026-09-18 the operator granted its six ordered PRs, P-01 through P-06. The
grant covers those units, their focused tests, bounded local provider/model/E2B/
browser proof, current contract updates, commit, push, and opening a pull request.
Mechanical steps and unit boundaries do not require another approval. Do not
reopen the approved layout or create another prototype.

The verification bar is the program's own. Tests alone are not sufficient. A PR is
verified only when its unit, live, and perf boxes each carry real evidence. The
operator merges every PR by default; each one stops at merge-ready. On 2026-09-18
she lifted that gate for the remediation work and authorized merging directly.
P-02 through P-06 also
stop for her review in chat with two screenshots and a 30-to-60-second video.

The predecessor task keeps its meaning. Its four units remain the delivered
shape, and its repair ledger is the record this program closes and reconciles.

### Credential and role remediation

On 2026-09-18 the operator authorized this explicitly, including the parts the
preservation clause below previously refused, and instructed that legacy be removed
rather than worked around.

The cause of the long-standing `28P01` was found that day and is no longer unknown.
Twenty Postgres suites run `ALTER ROLE` on cluster-global `hub_*` roles. The throwaway
database each suite creates does not contain that change, so running them against the
pilot cluster replaces the live Hub credentials with test fixture values. The roles were
found holding `invariants-executor` and `invariants-ingress`, the fixtures from
`builder-run-invariants-postgres.test.mjs`. `builder-first-operational-delivery.md`
records an earlier reconciliation of the same role and states the cause was never found.

The authorized sequence, smallest and least risky first, each step ending verifiable:

1. Refuse role-altering suites against a cluster that hosts a live Hub. Test tooling only.
2. Set `application_name` per connection pool and write a role register naming each role,
   its capability, its grants, its password-file variable, and the module that connects as
   it. No database change.
3. Provision the Hub role credentials idempotently from the same `*_PASSWORD_FILE`
   variables the Hub config already reads, and report a connection census at startup so
   `28P01` surfaces as a named census rather than mid-journey.
4. Finish the MAR excision and reconcile the census against itself. Decide delete or
   restore for migrations 024 and 025, `mar-paths.yaml`, `hub_mar_runtime` and
   `check-wire-mar`. Move the retained checkers behind an explicit target or delete them.
   Correct the trailer that claims a 31-operation census while section 5 holds more.
5. Reduce `scripts/run-hub-migrations.mjs` from a hand-maintained schema oracle to
   generated catalog snapshots, then consolidate credentials by making the capability
   roles `NOLOGIN` and having one login role `SET ROLE` per pool. The repository already
   uses that pattern in `qualification/4f/r3-root-tuple/run.mjs`.

Steps 3 and 5 change credentials and role attributes. Both are authorized here.

What still stops. Existing Product data is never destroyed; the pilot database holds real
work and no step may drop, truncate or recreate it. A step that would require destroying
it returns to the operator instead. Grants themselves keep their current meaning: the
consolidation moves where a capability is held, never what it permits.

Keep Mastra as the coding runtime and the existing encrypted credential backend.
The operator authorized local account OAuth after being informed of provider
restrictions. Record that risk honestly; do not represent operator consent as
provider endorsement. Do not evade provider refusal or silently switch to an API
key/another runtime. Real sign-in is performed by the user in the application.

The pilot is single-Hub and local. No new providers, secret services, cloud
telemetry, business integrations, production publication, deployment, or merge.
The planner prepares/reconciles this plan and verifies candidates. Codex executes
Product changes and their proofs. Do not silently combine those roles.

Preserve unowned working-tree and untracked files, private configuration, secrets,
containers, and existing data. No reset, clean, stash, force-push, or destructive
migration is authorized here. Credential rotation and role-attribute changes are
authorized only inside the credential and role remediation above, and only to the
values the existing secret files already hold; no new credential is generated.

## Recorded environment limits

The last reported local proof had HTTPS and `hub_iam_runtime` working after the
previously authorized `hub_rb_executor` reconciliation. `hub_prj03_command` and
`hub_rb_ingress` still reported `28P01`. These are historical observations and were
not reverified during this planning. Check the current state read-only as required
by the task. Report a surviving operational block without declaring the entire
code path proven, and continue independent implementation/offline tests.

The approved HTML bytes are supplied in the handoff package. Import their exact
hash-verified copy in the first implementation unit. Do not substitute screenshots
or regenerate a similar file.

## Acceptance

Acceptance requires real application interaction and the same execution's source,
model, Thread, and native trace evidence. A prototype, green unit suite, model
label, issued Preview grant, or generated artifact alone is not sufficient.

Use the pinned WSL environment, isolated test PostgreSQL, and current `npm run
verify` graph. Include targeted authorization, model, cancellation, failure/repair,
reload, and browser proofs from the current task. Run risk-triggered independent
review under the existing method. Neither self-review nor this plan is that review.
Do not mark the Product accepted while a deciding live path remains blocked.

## Exact next action

Fetch/status, load the current task, and execute P-01. It makes migration 047
replace `reg.matches_application_artifact` instead of creating it a second time.
Migration 040 already creates that signature, neither uses `CREATE OR REPLACE`, and
no migration drops it, so every from-scratch install halts at step 2 of 28. CI runs
`npm run verify` against an empty database on every pull request, so this defect
fails any PR opened today, including one that would land the outstanding work.

The stack's trunk is `analysis/internal-mvp-2026-09-12`, not main. Migrations 023
through 050 exist only on that branch; main still stops at 022, so the file P-01
edits is not there to edit. P-01 is the root of the stack and targets the analysis
branch. P-02 through P-05 branch from P-01. P-06 follows P-03.

Consolidating the analysis branch into main is a separate pull request that waits
for P-01, because it carries both colliding migrations and would fail CI without
the fix.

Use the existing first-delivery environment and runner; no new qualification
framework. Reconcile the owners, commit and push the candidate, then STOP at
merge-ready for the operator's review and her merge.
