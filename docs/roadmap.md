# Conexus OS roadmap

This file owns mutable status, allowed work, and the exact next action.

Current program: [Builder operational delivery](tasks/builder-first-app.md).
Current task: [Builder repair program](tasks/builder-repair-program.md).
Task after the remediation: [Foundation review](tasks/foundation-review.md).
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
| Builder repair program | IN EXECUTION. P-01 landed as #72 and #73 with unit proof and a green CI graph; its live lanes 6 and 10 and its perf box are outstanding. P-02 through P-06 have not started. The operator lifted the merge gate on 2026-09-18. |
| Credential and role remediation | IN EXECUTION beside the repair program. Steps 1 and 2 landed as #74 and #76. Its execution contract is #79. Step 3 is #80, the role register, and #81, provisioning plus the startup census. Step 4 is #82, the MAR excision and the census count. Step 5 is #84, which replaces the schema oracle with a generated catalog snapshot and is proven read-only against the pilot. #83 repairs two guarded suites #74 left unable to run. All six are verified and wait at merge-ready for the operator. Next is repairing the three R1 Postgres suites that rotted outside the candidate graph. Credential consolidation is deliberately outside the grant. |
| Foundation review | GRANTED ON 2026-09-19. Its four scope decisions are recorded below under Foundation review. Its execution contract is `docs/tasks/foundation-review.md`. It is the task after the remediation, not beside it. |
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

Its execution contract is [credential-and-role-remediation.md](tasks/credential-and-role-remediation.md).
That task owns the ordered pull requests, their file boundaries, and the evidence each one
carries. This section stays the grant and the authorized sequence.

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
   variables the Hub config already reads, as a separate installation step rather than a
   power the Hub holds at startup. The Hub's own startup check stays read-only and reports
   which connection is invalid, so `28P01` surfaces as a named census rather than
   mid-journey.
4. Finish the MAR excision and reconcile the census against itself. Decide delete or
   restore for migrations 024 and 025, `mar-paths.yaml`, `hub_mar_runtime` and
   `check-wire-mar`. Move the retained checkers behind an explicit target or delete them.
   Correct the trailer that claims a 31-operation census while section 5 holds more.
5. Reduce `scripts/run-hub-migrations.mjs` from a hand-maintained schema oracle to
   generated catalog snapshots, so a role change costs one migration instead of a proof
   this oracle imposes. Schema and migration tooling only.

Step 3 changes credentials, to the values the existing secret files already hold. It is
authorized here. No step changes a role's grants or its ability to assume another role.

Credential consolidation is deliberately not authorized. An earlier draft proposed one
login role that could `SET ROLE` into every capability. That is the opposite of what
`docs/reference/data-and-persistence.md` requires: its negative property for owner-scoped
capabilities forbids `SET ROLE into unrelated owner authority`, and selecting a role at
connect time does not remove the session user's ability to select another. The pattern in
`qualification/4f/r3-root-tuple/run.mjs` is also the reverse of what that draft claimed:
it creates one login per capability, each granted only its own role. Reducing the number
of credentials remains worth doing, and it needs a design that keeps the negative property
rather than trading it for convenience.

What still stops. Existing Product data is never destroyed; the pilot database holds real
work and no step may drop, truncate or recreate it. A step that would require destroying
it returns to the operator instead. Grants keep their current meaning, and no capability
gains the ability to assume another.

Keep Mastra as the coding runtime and the existing encrypted credential backend.
The operator authorized local account OAuth after being informed of provider
restrictions. Record that risk honestly. Do not represent operator consent as
provider endorsement. Do not evade a provider refusal. An API key is an
authorized credential kind that the user chooses on purpose, and it is never
substituted for an account whose provider refused. Real sign-in is performed by
the user in the application.

The pilot is single-Hub and local. No secret services, cloud telemetry, business
integrations, production publication, deployment, or merge. Providers are no
longer closed. On 2026-09-19 the operator reversed the refusal this line used to
carry, and granted two additions to the foundation review's units M-01 and M-02.
The first is an API key for any provider Mastra already routes. The second is a
ChatGPT account sign-in beside the Anthropic one. Model selection stays
Mastra-native, and Conexus adds only credential custody and sign-in. The grant
reaches those two units and nothing else.

The planner prepares/reconciles this plan and verifies candidates. Codex executes
Product changes and their proofs. Do not silently combine those roles.

Preserve unowned working-tree and untracked files, private configuration, secrets,
containers, and existing data. No reset, clean, stash, force-push, or destructive
migration is authorized here. Credential rotation and role-attribute changes are
authorized only inside the credential and role remediation above, and only to the
values the existing secret files already hold; no new credential is generated.

### Foundation review

Its execution contract is [foundation-review.md](tasks/foundation-review.md). That
task owns the ordered units, their bases and their migration numbers. This section
is the grant. The foundation review starts after the credential and role
remediation closes, and it does not run beside it.

On 2026-09-19 the operator decided its scope in four parts.

1. Project Inception and Baseline may be deleted.
2. Brain, bindings and Sankhya come out now. They return only as future features on
   a solid base.
3. Multi-account lands now, at the minimum that is correct.
4. Model selection stays Mastra-native. Conexus adds credential custody and sign-in
   for an Anthropic account, API keys for any provider Mastra routes, and later a
   ChatGPT account sign-in.

The same day the operator authorized one read-only row count against the pilot with
the root credential, and then said "você roda e deleta o que precisar". That is the
operator's word the plan's A-02 waits on before it drops the derived grant tables,
and the word F-07 waits on before it drops the empty Inception and R2 tables. The
counts are recorded in the plan.

Destroying real Product data is still refused. The plan's migrations assert that
each table they drop is empty and abort otherwise, so the count stays a
precondition rather than a promise.

## Recorded environment limits

The last reported local proof had HTTPS and `hub_iam_runtime` working after the
previously authorized `hub_rb_executor` reconciliation. `hub_prj03_command` and
`hub_rb_ingress` still reported `28P01`.

That `28P01` is gone. On 2026-09-18 a read-only census opened one session per
configured role against the pilot cluster at `conexus_s7` through the Hub's own
`createPostgresPool`, and all eleven configured roles authenticated, including
`hub_prj03_command` and `hub_rb_ingress`. Postgres reported the expected
`conexus-hub:<capability>` for each one. No role is in a blocked state today.

Four roles have no password file in the pilot and so no pool is created for them
there. They are `hub_r2_project_binding`, `hub_r2_brain_read`,
`hub_r2_brain_attester` and `hub_r2_key_conformance_subject`. Unconfigured is not
the same as invalid, and the remediation's step 3 census reports them apart.

Report a surviving operational block without declaring the entire code path
proven, and continue independent implementation/offline tests.

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

Finish P-01's live proof, then start P-02.

### What P-01 has and has not

The verification floor is restored and CI runs the whole graph. Landed on
2026-09-18 as `c0328ca3` (#72) and `e2d400b3` (#73), because the floor had three
holes rather than the one the program assumed:

1. Migrations 040 and 047 both created `reg.matches_application_artifact`, so every
   from-scratch install halted at step 2 of 28.
2. `builder-application-runtime.test.mjs` called `mkdtempSync` under a
   `node_modules/.cache` that does not exist on a clean checkout.
3. Six Claude connection operations carried no `x-conexus-4a-id` and no census row,
   so `wire:bijection` failed. That gate had been red since 2026-09-17 at 10:26.
   The migration defect landed at 14:01 the same day and buried the signal until it
   was fixed.

Against P-01's own bar, unit is met and live is not. Six of ten live lanes passed
with evidence. Lanes 6 and 10, the two that need a browser and an operator session,
never completed. The perf box never ran. `npm run verify` completes 28 of 28 on a
clean CI runner at the merged SHA, which is stronger evidence than the six lanes it
repeats.

So P-01's next action is lanes 6 and 10 plus the perf probe, not another attempt at
the migration.

### Then P-02

P-02 keeps a failed request visible and named. It depends on P-01 and on nothing
else that is outstanding. P-03, P-04 and P-05 branch from P-01 as before; P-06
follows P-03.

### Topology

The stack's trunk is `analysis/internal-mvp-2026-09-12`, not main. Migrations 023
through 050 exist only on that branch; main still stops at 022. Consolidating the
analysis branch into main is a separate pull request, and it no longer waits on the
migration defect, which is fixed.

### Running alongside

The credential and role remediation is current work beside the repair program.
Step 1 landed as `9251e4ec` (#74), step 2 as `1318c2bf` (#76). Step 3, provisioning,
is next there and is independent of P-02.

### What proof to run

Use the existing first-delivery environment and runner; no new qualification
framework. Do not re-run locally what CI already proves at the same commit. The
lanes that earn their cost are the ones CI cannot reach: the operator's pilot
database, a running Hub, and a browser holding a real session.
