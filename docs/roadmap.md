# Conexus OS roadmap

This file owns mutable status, allowed work, and the exact next action.

Current program: [Builder operational delivery](tasks/builder-first-app.md).
Current task: [Foundation review](tasks/foundation-review.md).
Paused behind it: [Builder repair program](tasks/builder-repair-program.md).
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
| Builder repair program | PAUSED. P-01 landed as #72 and #73 with unit proof and a green CI graph; its live lanes 6 and 10 and its perf box are outstanding. P-02 through P-06 have not started. The foundation review took the trunk in front of it. |
| Credential and role remediation | CLOSED ON 2026-09-19. All six PRs merged: #74 and #76 for steps 1 and 2, #79 the execution contract, #80 the role register, #81 provisioning plus the startup census, #82 the MAR excision and the census count, #84 the generated catalog snapshot, and #83 repairing two guarded suites #74 had left unable to run. The three rotted R1 Postgres suites were repaired and admitted to CI as #91. Credential consolidation stays deliberately outside the grant. |
| Foundation review | IN EXECUTION since 2026-09-19, and nearly closed. Twenty-nine PRs merged to trunk, #79 through #105 and #107. Migrations 051 through 055 are on trunk. The Product census went from 39 fixed operations to 25. Multi-account works end to end in CI: a second person can be invited, sign in and join a Workspace. M-01, provider-neutral model connections, is the one unit still open, as #106. Its execution contract is `docs/tasks/foundation-review.md`, which records what landed, what changed from the plan and what the operator must do before the next Hub start. |
| Broader platform and visual polish | DEFERRED. No requirement to finish them before operating the Builder. |

The initial accepted 7R-1 implementation remains
`3276f8fbf3ae8a38f6d0cab43fe540df221ebee9`.
The planning publication at `2e39f3ebd5db24838358671604f4b29c1583e4fa`
is predecessor evidence. Its earlier execution restriction is superseded only
within this operator-approved functional delivery and the current task's limits.

## Current grant

Execute [foundation-review.md](tasks/foundation-review.md). The credential and
role remediation described below is closed, and the Builder repair program is
paused behind the foundation review rather than cancelled; its grant below still
describes what it may do when it resumes.
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

### Credential and role remediation, closed

Its execution contract is [credential-and-role-remediation.md](tasks/credential-and-role-remediation.md).
That task owns the ordered pull requests, their file boundaries, and the evidence each one
carries. This section stays the grant and the authorized sequence, and the sequence is done.
All five steps merged on 2026-09-19. What remains of this section is history and the standing
refusals at its end, which are still in force.

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
task owns the ordered units, their bases and their migration numbers, and it
records what actually landed against what was planned. This section is the grant.
The remediation closed on 2026-09-19 and the foundation review is the current task.

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
precondition rather than a promise. Migration 055 does exactly that, and an
independent verifier reproduced its refusal by name on three separate tables.

### In flight

M-01, provider-neutral model connections and API keys, is #106 against trunk. It
renames the schema to `model_connection`, adds `provider_id` and
`credential_kind`, adds the operation that pastes an API key, and returns a
Mastra-native config object instead of a Conexus model abstraction. Its migration
is 056.

### Queued

Role naming by capability. The eight login roles still carry the program phase
that introduced them rather than what they permit. Renaming them changes pilot
secret file names and environment variable names, so it needs the operator before
it starts, not after.

M-02, ChatGPT account sign-in. Blocked on M-01, and gated on primary sources for
the client id, the token endpoint, the wire format and the terms. If a primary
source cannot be found for the client id or the terms, it stops and reports. API
keys from M-01 already cover OpenAI models.

Hardening follow-ups on the OCI Git container. `--pids-limit`, `--memory` and
`--cpus` are absent and were absent before #101 unified the three
implementations, so the unified port is the natural place to add them. A
`tmpfsBytes` value under one mebibyte renders as `size=0m`; no caller passes one
today. The mount-template assertion lost its pin on the `readonly` suffix, though
the credential mount is still pinned separately.

A browser test for the Members page. The page is one route, one query and four
mutations, all already stubbed at the HTTP level. The assertion worth having is
that the role toggle, remove, cancel and invite controls are absent for a viewer
whose role is `member`.

### Open Product questions for the operator

These are decisions about shipped behaviour. None of them blocks M-01.

1. What "Baseline" means in [contract.md](product/contract.md) Journey B now that
   Inception is gone. Journey B is still written as Inception then Baseline then
   approval, and section 5.5 still defines the Baseline as the pinned material
   intent the Builder's Change and Release gates read. The code behind both is
   deleted. Either Journey B is rewritten around what the Builder actually does,
   or the Baseline returns as a future feature and Journey B says so.
2. The `project.manage` Permission has no consumer. Its Published-App access and
   archive and duplicate consumers were contract for surfaces never built and were
   removed, and the candidate-review, explanation and binding consumers went with
   Inception, Baseline, Brain and the bindings.
   [permission-contract.md](product/permission-contract.md) already records this.
   Either a consumer is owed or the Permission is retired.
3. Whether a plain member, and not only an owner, may share their own model
   connection into a Workspace. The design default was yes and A-02 built it, so
   this is a question about behaviour that ships today, not about a plan.

## Recorded environment limits

The last reported local proof had HTTPS and `hub_iam_runtime` working after the
previously authorized `hub_rb_executor` reconciliation. `hub_prj03_command` and
`hub_rb_ingress` still reported `28P01`.

That `28P01` is gone. On 2026-09-18 a read-only census opened one session per
configured role against the pilot cluster at `conexus_s7` through the Hub's own
`createPostgresPool`, and every configured role authenticated, including
`hub_prj03_command` and `hub_rb_ingress`. Postgres reported the expected
`conexus-hub:<capability>` for each one. No role is in a blocked state today.

The Hub now connects as eight roles, not eleven.
[hub-database-roles.md](reference/hub-database-roles.md) is the register and
matches `contracts/technical/hub-database-roles.json`. `hub_r2_project_binding`,
`hub_r2_brain_read`, `hub_r2_brain_attester` and `hub_r2_key_conformance_subject`
were removed from it by #98 when the pools that opened them went with the Brain
and the bindings; they are not live roles and the pilot never had password files
for them. Four more, `hub_s4_baseline_read`, `hub_s4_baseline_command`,
`hub_s6_inception_command` and `hub_r2_brain_bootstrap`, are equally inert. All
eight still exist in the cluster, holding no privilege after 055.

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

Land M-01 (#106), then take the operator steps below and run the foundation
review's live lanes on the pilot. P-01's live proof and P-02 follow after that.

## Before the next Hub start on this trunk

Nothing here is optional. The Hub refuses to start if step 3 is skipped, and the
migration runner aborts if step 2's precondition does not hold.

1. The pilot database is at migration 050, read read-only on 2026-09-19. The next
   start applies 051 through the current head in one runner invocation. That is
   051, 052, 053, 054 and 055 together. Verifiers have staged this exact sequence
   on pilot-shaped copies, from 050 to head, and it commits.
2. Migration 055 asserts that every table it drops is empty and aborts with
   `MIGRATION_055_TABLE_NOT_EMPTY_REFUSED`, naming the table and its count, if one
   is not. The pilot count of 2026-09-19 read zero rows in all of them, but that
   was one day's reading and the migration decides on the day it runs. An abort
   leaves nothing half-applied.
3. The Hub config refuses retired variables rather than ignoring them, so delete
   `CONEXUS_DB_S4_BASELINE_READ_PASSWORD_FILE`,
   `CONEXUS_DB_S4_BASELINE_COMMAND_PASSWORD_FILE` and
   `CONEXUS_DB_S6_INCEPTION_COMMAND_PASSWORD_FILE` from the pilot environment
   first. `readHubConfig` throws `RETIRED_CONFIG_<name>` while any of the three is
   set, and the pilot environment file still sets all three.
4. Once M-01 lands, the model catalog file will need `officialHttpsOrigin` removed
   from each entry, because the provider registry answers it. Do not remove it
   before then; the field is still read today.
5. For multi-account, an invited person must already exist in Keycloak with that
   exact email address, marked verified. The Hub reads `email_verified` from the
   validated ID token and accepts only the boolean `true`. Nothing is emailed, and
   an address that is not verified at the provider is refused.
6. Eight database login roles are now inert: `hub_r2_brain_attester`,
   `hub_r2_brain_bootstrap`, `hub_r2_brain_read`, `hub_r2_key_conformance_subject`,
   `hub_r2_project_binding`, `hub_s4_baseline_command`, `hub_s4_baseline_read` and
   `hub_s6_inception_command`. Migration 055 revoked every privilege they hold and
   deliberately did not drop them, because a role is cluster-global and `DROP ROLE`
   answers `2BP01` while any other database on the cluster still grants to it. They
   can be dropped from the cluster by hand, and only after every database on that
   cluster is at 055.

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
through 055 exist only on that branch; main still stops at 022. Consolidating the
analysis branch into main is a separate pull request, and it no longer waits on the
migration defect, which is fixed.

### Running alongside

Nothing runs alongside. The credential and role remediation closed on 2026-09-19
with all five steps merged, and the foundation review holds the trunk until M-01
lands. The repair program resumes after that.

### What proof to run

Use the existing first-delivery environment and runner; no new qualification
framework. Do not re-run locally what CI already proves at the same commit. The
lanes that earn their cost are the ones CI cannot reach: the operator's pilot
database, a running Hub, and a browser holding a real session.
