# L5 — Managed automations task plan

## Goal and design

Applications can run admitted operations as managed jobs with observable
progress and defined duplicate, cancellation and restart behavior. Existing MAR
owns occurrence truth; Gateway owns external effects; Project owns business
data. Jobs are not Product Agents or a new generic workflow product.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
The roadmap alone owns status/grants. Effectful-job contract reconciliation is
an explicit prerequisite, not a behavior silently inherited from read-only sync.

## Required context and existing source

- [MAR](../reference/managed-execution.md),
  [Gateway effect semantics](../reference/integrations-and-gateway.md),
  [job operations](../product/operation-ledger.md),
  [MAR wire](../../contracts/api/product/mar-paths.yaml),
  [operations/recovery](../reference/release-deployment-and-operations.md).
- [R3 task](r3.md), particularly P4-B; follow its accepted owner and evidence
  routes without reclassifying the candidate as accepted.
- Existing source: `apps/hub/src/mar/admission.ts`,
  `apps/hub/migrations/024_mar_pg_boss_projection.sql`,
  `apps/hub/migrations/025_mar_admission_function.sql`,
  `apps/hub/src/project/read-model.ts`.
- Proof starting points: `tests/implementation/r3-mar-admission.test.mjs`,
  `tests/implementation/r3-mar-migration.test.mjs` and
  `tests/implementation/r3-project-read-model.test.mjs`.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L5.1 MAR | [managed execution](../reference/managed-execution.md), §§27.2–27.4; [R3](r3.md), P4-B and P1 reconciliation matrix | MAR owns occurrence; queue delivery is not authority. Close current-occurrence/settlement/quiescence, preserving unaccepted candidate status |
| L5.1 effect recovery | Same §27.4 effect-capable job reopen trigger; [Gateway](../reference/integrations-and-gateway.md), §§19.3–19.4 | Define correlation to unresolved external effects and exact safe continuation; do not generalize read-only freshness-based catch-up to messages or invoices |
| L5.2–3 technology | [R3](r3.md), “Exact dependency boundary” and P2/P3 decision; [MAR wire](../../contracts/api/product/mar-paths.yaml) | Validate adopted pg-boss configuration and actual transition behavior from source/tests; historical Package-D pins do not replace root pins |
| Comparative scheduling | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §2 cron/job patterns; [Factory influence](../research/factory-ai/influence-on-conexus.md), §9.6 | A task/job can stay bounded. Neither embedded cron nor parallel-worker machinery answers Conexus effect settlement or authorizes a generic scheduler |

Use exact installed pg-boss types/source/configuration and current official
PostgreSQL/pg-boss docs for concurrency, cancellation or retry uncertainty.
Queue guarantees must be distinguished from owner transaction guarantees in
the resulting test. No framework re-evaluation is needed unless a named
failure falsifies the selected mechanism for this consumer.

## Implementation work breakdown

### L5.1 — Reconcile occurrence and effect recovery

- [ ] Resolve MAR's current occurrence, single-flight, settlement and positive
  quiescence contract from R3/P4-B before replacement work can write.
- [ ] Close the already-declared first effect-capable MANAGED_JOB reopen route:
  define how the exact JobRun relates to Gateway unresolved effects and what
  evidence permits continuation, refusal or human reconciliation.
- [ ] Determine the real automation's recurrence and missed-run meaning.
  Read-only freshness-derived one-catch-up semantics are not automatically
  correct for invoices, email or messaging; accept exact owner semantics first.
- [ ] Record artifact inputs, immutable Release pins, operation capability,
  SDK/worker interfaces, files and failing-proof commands in this packet.
  Preserve queue tables as private mechanics, not business truth.

### L5.2 — Execute admitted jobs through production wiring

- [ ] Wire manual and the admitted scheduled trigger through MAR occurrence
  admission, then exact L2/L4 capabilities. Caller data cannot choose another
  Project, Release, Connection or arbitrary privileged job code.
- [ ] Implement the accepted single-flight and settlement transitions; thread
  cancellation through work without equating signal delivery with rollback.
- [ ] Expose accepted job status/history/errors so users can distinguish queued,
  running, blocked, completed and unresolved external outcomes as defined by
  the actual owner contracts.

### L5.3 — Prove failure recovery and useful automation

- [ ] Exercise duplicate delivery, overlapping triggers, stale worker completion,
  cancel/timeout and process loss. Withhold quiescence in a negative case and
  prove that replacement cannot admit concurrent writes.
- [ ] Exercise provider acceptance followed by response loss and worker restart;
  prove the same intent is not repeated by a new JobRun or transport attempt.
- [ ] Run one exact authorized real automation and show its durable owner
  result. Record explicit blocked/unknown behavior where reconciliation cannot
  establish an outcome; no queue completion is a substitute for it.

## Dependencies and exit

Consumes L3 served Release and L4 governed operations; data-only jobs consume
L2 without inventing a provider dependency. Contract preparation can precede
these deliveries, but execution cannot consume unaccepted prerequisites.

Exit requires useful job execution plus concurrency/restart/effect proof under
the selected contract. Apply the roadmap's candidate graph and independent
review requirements; historical Package-D or synthetic admission alone cannot
close a real effectful-job claim. Broad event engines and universal schedulers
remain outside the admitted mechanism unless a separate real requirement
reopens their existing owner.
