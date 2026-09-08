# RB — governed verification and Change acceptance stage code packet

Status: `OPEN / OPERATOR AUTHORIZED`

## Observable outcome and invariant

After the first Builder writer places an exact candidate under Hub/Git custody,
Conexus independently materializes that immutable candidate in a fresh controlled
E2B sandbox, verifies it against the exact Change contract, records inspectable
Evidence and any blocking Finding, and lets only Builder-owned settlement create
the current `change_acceptance` fact.

```text
worker result or narration       -X-> acceptance
sandbox/model completion         -X-> acceptance
zero Findings                    -X-> acceptance
Evidence existence               -X-> acceptance

exact candidate + Baseline + contractRevision + Plan revision
+ every required assertion supported by admitted exact-subject Evidence
+ no unresolved blocking Finding
→ Hub-owned current change_acceptance
```

The ordinary Project Build surface shows whether the candidate is verifying,
verified, failed or inconclusive and lets an eligible reviewer inspect the exact
Findings/Evidence without exposing Mastra, E2B or ActorRun machinery as primary
Product UX.

## Exact envelope

- Product operations added to the realized surface: `BLD-11`, `BLD-12`,
  `BLD-14`, `BLD-15`. Existing `BLD-02/04/06/07/17` project the resulting owner
  truth.
- `BLD-03.intent` remains the accepted human meaning of a Change. Builder
  derives one immutable `contract_revision` whose required cognitive assertion
  binds the exact intent digest; the Plan links its only item to that assertion.
  Migration derives the same mapping for already-durable first-vertical Changes
  from their existing operation receipt and fails atomically if that provenance
  is absent; it does not manufacture a different contract meaning.
- Builder owns contract revision, verifier ActorRun, Finding and
  `change_acceptance`. Verification reports are immutable subordinate payloads
  of the verifier ActorRun, not a generic Evidence semantic owner.
- Project/Git supplies a fresh immutable candidate bundle from the exact
  `refs/conexus/changes/<changeId>` commit. The verifier never receives or
  reuses the writer's mutable sandbox.
- A Conexus-owned `CandidateVerificationRuntime` port uses the exact adopted
  Mastra and E2B packages. Its model admission is server-selected from the
  existing closed catalog for `BUILDER_VERIFICATION`, frozen on the verifier
  ActorRun and independent from browser/worker selection.
- The verifier sandbox is a fresh exact-build E2B instance with deny-all
  outbound networking and an empty guest environment. It receives no Hub,
  Project DB, Git remote, model-provider or Connection credential.
- The verifier model receives neither Mastra process tools nor a generic
  filesystem. One Conexus-owned Mastra `createTool` admits reads only for the
  exact changed-file manifest and `BASE | CANDIDATE` side, fetches bytes through
  the E2B SDK, verifies Git blob identity and length before disclosure, and
  enforces bounded read/byte budgets plus required-side coverage. This narrow
  adapter is the version-correct integration for the adopted Mastra `1.63.2`
  and `@mastra/e2b` `0.11.0`; it is not a parallel Product/domain abstraction.
- The verifier cannot mutate canonical Git or owner state. Mastra structured
  output is Evidence input only; schema validation, exact scope binding and Hub
  settlement remain mandatory. Internal verifier outcome/report and ActorRun
  purpose remain internal persistence details; public `Evidence` and
  `ActorRunProjection` responses keep the exact closed wire fields.
- `project.review` is rechecked independently from `project.build` and
  `project.source.read` for Findings/Evidence disclosure. It is a human
  disclosure/decision permission, not authority over system-owned verifier
  settlement.

## State and settlement

The current first-vertical states are preserved. This increment adds honest
post-custody states `VERIFYING`, `VERIFIED`, `VERIFICATION_FAILED` and
`UNVERIFIED`.

The verifier report outcome is exactly `PASS | FAIL | INCONCLUSIVE`.

- `PASS` may create acceptance only when the report binds the current candidate,
  Baseline, Plan, contract, assertion and verifier ActorRun and all current
  eligibility checks still hold.
- `FAIL` records immutable Evidence plus an open blocking Finding and leaves the
  Change unaccepted in `VERIFICATION_FAILED`.
- `INCONCLUSIVE`, verifier interruption, missing required Evidence, stale
  authority or stale subject leaves the Change unaccepted in `UNVERIFIED`.
- Late/replaced verifier output is quarantined and cannot settle current work.
- Restart interrupts an in-flight verifier honestly. A writer result not yet
  admitted to verification becomes `UNVERIFIED` while retaining its exact
  candidate and diff; neither case replays a writer or manufactures acceptance.

## RED falsifiers and proof

Targeted tests must first prove these failures:

1. generic green mechanical checks plus a failed intent assertion cannot accept;
2. missing contract/assertion mapping cannot accept;
3. candidate, Baseline, Plan, contract, ActorRun, sandbox or admission
   substitution cannot accept;
4. missing/inconclusive Evidence and an unresolved Finding cannot accept;
5. worker/runtime code cannot write Findings, Evidence or acceptance directly;
6. late/interrupted verifier output cannot mutate current acceptance;
7. the verifier receives a fresh exact candidate bundle, not writer workspace;
8. verifier guest credentials/network/Git remote authority remain absent;
9. `project.build` without `project.review` cannot disclose review material;
10. cross-Project Finding/Evidence references disclose nothing;
11. Evidence projection binds exact claim, candidate subject and provenance;
12. existing Changes without a contract revision remain unverified.

Nominal proof covers a new assertion-bearing Change, exact candidate custody,
fresh verifier ActorRun/materialization, typed PASS report, transactional Hub
settlement, durable acceptance, `BLD-11/12/14/15` read-back and browser-visible
verified state/Evidence. A FAIL report covers the visible blocking-Finding path.

Production-module fixtures prove orchestration/refusal only. The PostgreSQL test
proves owner roles, durability and transactional settlement. A live E2B/model
replay is a separate exact external proof and is required before claiming the
real cognitive verification composition.

## Completion and non-goals

Complete when the targeted module, PostgreSQL and browser paths are green; the
applicable clean Linux candidate floor is green; the exact external composed
replay is honestly classified; material review findings are adjudicated; and no
known blocker remains for this invariant.

This increment does not implement `BLD-05`, `BLD-13`, source tree/file or
Preview, successive correction WorkUnits, generic verification/eval/telemetry
infrastructure, ACP/private MCP, concurrent writers, R3, Budget Analyzer
artifacts, Change source integration, Release or deployment. `BLD-05` re-enters
when a non-DIRECT Plan actually requires a human checkpoint. `BLD-13` re-enters
with the first real correction/rerun path that can produce exact resolution
Evidence for the failed assertion; it must not be a decorative close command.

Stop only for a material Product/owner contradiction, inability to bind an
independent verifier to exact immutable candidate material, missing accepted
assertion meaning, persistent-data inventory conflict, security-isolation
falsifier or attributable required-CI regression.
