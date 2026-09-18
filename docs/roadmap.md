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
| Claude Account connection | UNACCEPTED predecessor candidate `f9fbb655463aa24da1c3e902c20d555487ce9629`. Its corrections are incorporated in the current task. |
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

Execute only [builder-repair-program.md](tasks/builder-repair-program.md).
On 2026-09-18 the operator granted its six ordered PRs, P-01 through P-06. The
grant covers those units, their focused tests, bounded local provider/model/E2B/
browser proof, current contract updates, commit, push, and opening a pull request.
Mechanical steps and unit boundaries do not require another approval. Do not
reopen the approved layout or create another prototype.

The verification bar is the program's own. Tests alone are not sufficient. A PR is
verified only when its unit, live, and perf boxes each carry real evidence. The
operator merges every PR; each one stops at merge-ready. P-02 through P-06 also
stop for her review in chat with two screenshots and a 30-to-60-second video.

The predecessor task keeps its meaning. Its four units remain the delivered
shape, and its repair ledger is the record this program closes and reconciles.

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
containers, and existing data. No reset, clean, stash, force-push, credential
rotation, role-grant changes, or destructive migration is authorized here.

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
