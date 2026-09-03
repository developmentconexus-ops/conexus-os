# 4D(RB-C0) — Builder runtime qualification and equal-envelope Worker Eval design

> **Status:** `RB-C0 CANDIDATE / NOT ADMITTED OR EXECUTED / CURRENT STATUS AND NEXT ACTION OWNED ONLY BY docs/roadmap.md`
> **Pin owner:** [`4d-rb-c0-candidate-pin-manifest.json`](4d-rb-c0-candidate-pin-manifest.json)
> **Tranche:** `PRJ-29 + BLD-01..17` only
> **Implementation authority:** `BLOCKED`

## 1. Decision and proof boundary

RB-C0 makes the open runtime comparison reproducible. It does not admit a
dependency, select a winner or prove Builder quality. The required candidates
remain:

1. `RB-NATIVE-MASTRA-E2B-01` — native Mastra coding-agent and
   `AgentController` mechanics;
2. `RB-MASTRA-ACP-OPENCODE-E2B-01` — the same Mastra host with exact ACP and
   OpenCode challenger pins; the unadmitted OpenCode executable runs only
   inside an exact isolated E2B sandbox during RB-C1.

Both candidates sit behind the same owner-neutral `CodingWorkerRuntime` port,
use the same guarded E2B Workspace candidate and are subordinate to Builder/Hub
ownership. ACP sessions, model output, sandbox state, runtime status, traces and
command exits are untrusted Evidence. None can accept a Change or settle an
ActorRun, WorkUnit, Finding or acceptance result.

RB-C0 has performed documentation, registry/attestation and exact package-source
inspection only. It has made no dependency mutation, executable acquisition,
provider/model call or E2B call.

## 2. Why these exact candidates

The native topology is the incumbent because the exact current working-tree
lock uses `@mastra/core@1.63.2` and the existing mechanical qualification proves
the assembly surface without proving quality. The manifest binds that
uncommitted environment overlay explicitly rather than attributing it to HEAD
alone. The ACP challenger is required by the
accepted C02R adjudication. OpenCode `v1.18.27` is the current concrete challenger
because its official CLI exposes `opencode acp`, the release is immutable and the
Linux asset has an upstream SHA-256 digest. Its source-to-binary provenance is
still unproved and remains a possible admission stop.

`@mastra/core@1.64.0` was observed as newer on `2026-09-03` but is not selected.
Changing the already locked and mechanically probed core version without a named
property, compatibility, support or security falsifier would add an unrelated
delta. The exact-pinned `1.63.2` incumbent stays open to a version escape if a
real RB-C1 finding fires.

Gemini CLI is not the first challenger because it couples the comparison more
strongly to one provider. The observed Cline package/command identity did not
match the required documented ACP executable closely enough to displace the
reproducible OpenCode candidate. Private MCP remains optional and opens only on
a material capability-exposure need.

## 3. Mandatory adapter envelope

Every candidate request and result must close over these fields. An adapter may
add diagnostics, but it may not omit, reinterpret or own them.

| Group | Required exact fields |
| --- | --- |
| Owner admission | `workspaceId`, `projectId`, `changeId`, `codingSessionId`, `workUnitId`, `actorRunId`, current authority revision, admitted operation and least-privilege capability set |
| Source | canonical repository identity, base commit/digest, candidate lineage, app-owned/generated/protected path classification, context/constraint bundle digest |
| Runtime | candidate ID, package/lock digest, executable digest when present, protocol revision when present, template source digest, E2B `templateId`, `buildId`, logical workspace ID and exact physical `sandboxId` |
| Model | provider/model ID, credential-slot identity without secret material, reasoning effort, sampling settings, context/output limits and budget ceiling |
| Lifecycle | fresh-run identity, attempt, start/deadline/end, cancellation revision, process IDs, termination/kill Evidence and late-output fence |
| Output | typed patch/artifact refs and digests, stdout/stderr/diagnostic refs, tool/command ledger, untrusted runtime status and explicit missingness |
| Settlement proposal | one of `SUCCEEDED_CANDIDATE`, `FAILED`, `CANCELLED`, `TIMED_OUT`, `QUARANTINED`, `NOT_PROVEN`; never an owner transition |
| Usage | input/output/cache tokens where available, provider cost basis, elapsed/runtime time, sandbox duration, tool calls and human interventions |

The Hub independently rederives current authority at admission, every privileged
action and settlement. A stale admission or output is refused. A physical
`sandboxId` change during continuation quarantines the run; no write, command or
result operation is replayed on a replacement sandbox.

## 4. Source-inspection blockers converted into gates

Exact source inspection plus independent review produced eleven material
findings recorded as `RB-C0-F01..F11` in the pin manifest:

- `@mastra/acp@0.4.1` can choose the first permission option without a callback;
- its child-process spawn merges ambient `process.env`;
- local `process.cwd()` and persistent-session defaults are unsafe for RB;
- `@mastra/e2b@0.11.0` can retry after sandbox death;
- preferred-sandbox and template fallback can silently change physical inputs;
- protocol cancellation, process exit or sandbox pause does not prove
  quiescence or exclude late output;
- compatible peer ranges do not prove the proposed packages from different
  Mastra source commits work together;
- the ACP adapter's internal client-info display version does not equal its npm
  package version; and
- immutable release identity and an exact digest do not make an unadmitted
  executable safe to start on the Conexus control plane;
- E2B confinement of the executable does not by itself prevent ACP
  agent-to-client filesystem or terminal requests from reaching a control-side
  client; and
- an account-scoped E2B credential can address pre-existing resources unless
  every mutation is fenced to IDs created by the exact probe run.

Accordingly, RB-C1 must prove an explicit deny-by-default permission callback, a
minimal allowlisted launcher environment, exact remote Workspace/cwd binding,
no write replay, exact physical-incarnation continuity, no template fallback,
process termination and late-output rejection. Failure of any gate leaves that
candidate unadmitted. Exact combination and handshake identity must also be
proved. The OpenCode asset cannot execute on the control plane during RB-C1;
the RB-C1 client advertises no control-plane filesystem or terminal capability
and denies every agent-to-client action request. Only E2B resources created and
recorded by the exact RB-C1 run may be mutated or destroyed. Adapter convenience
cannot waive any of these requirements.

## 5. RB-C1 mechanical and live-dependency probe

RB-C1 is a separate grant and is fully specified in
[`4d-rb-c1-live-probe-grant-request.md`](4d-rb-c1-live-probe-grant-request.md).
It uses no coding model. Its bounded proof order is:

1. materialize an isolated qualification manifest/lock for the exact C0 pins;
2. install with lifecycle scripts disabled, enumerate the locked graph and
   inspect every declared lifecycle script before any script-enabled action;
3. verify registry signatures/available npm attestations, licenses, denied
   families and time-stamped advisory results without claiming more than each
   result proves;
4. acquire only the exact immutable OpenCode Linux release asset without
   executing it, verify the upstream SHA-256 and record the archive/extracted
   executable hashes;
5. materialize one versioned E2B template from the exact base-image digest and
   record template-source digest, `templateId` and `buildId`;
6. prove guest outbound/public traffic denial and absence of host/provider
   credentials;
7. prove create, exact-ID reconnect, cancel, process termination and destroy;
8. fire the physical-incarnation mismatch and dead-sandbox write-replay guards;
9. use deterministic fake ACP peers to fire permission, malformed protocol,
   stale authority, cancellation, late-output and agent-to-client capability
   denial controls;
10. upload the verified OpenCode executable to one dedicated credential-free
    E2B sandbox and start it there only far enough to prove asset, version,
    transport and handshake identity without submitting a prompt or configuring
    a model/provider; a bounded host relay carries ACP bytes and has no local
    executable fallback.

Each result names its subject. Fake ACP proves control-side adapter mechanics
only; the isolated real OpenCode no-model handshake proves executable/protocol/
relay reachability only; real E2B proves only the tested sandbox behavior. None
proves capable coding, a credential-bearing challenger topology or Product
composition.

## 6. RB-C1 firing RED matrix

| Proof ID | GREEN condition | Required RED control |
| --- | --- | --- |
| `RB-C1-P01` | exact qualification manifest and canonical lock agree | altered manifest, lock or registry identity is refused |
| `RB-C1-P02` | downloaded bytes match recorded integrity/digest | one changed byte fails before execution |
| `RB-C1-P03` | lifecycle-script set equals reviewed allowlist | unexpected script fails before it runs |
| `RB-C1-P04` | signatures/attestations resolve to expected subjects and sources; missing provenance stays explicit | invalid identity fails; absent provenance cannot become verified |
| `RB-C1-P05` | complete transitive license/advisory inventory has explicit dispositions | unknown license, denied family or applicable issue prevents admission |
| `RB-C1-P06` | exact template source/base produce recorded `templateId` and `buildId` | fallback/default/rebuilt template identity is refused |
| `RB-C1-P07` | guest has no control credentials and outbound/public traffic is denied | canary credential or successful forbidden egress fails |
| `RB-C1-P08` | continuation reattaches only to expected physical `sandboxId` | replacement ID quarantines without write replay |
| `RB-C1-P09` | write/command failure on a dead sandbox is terminal | upstream retry attempt is detected and blocked |
| `RB-C1-P10` | ACP permissions require exact live Hub grant | absent/stale/mismatched grant deterministically denies |
| `RB-C1-P11` | ACP launcher environment equals the allowlist | ambient secret/canary inheritance fails |
| `RB-C1-P12` | cancel terminates process and fences all later messages/output | late output cannot alter the candidate or settlement proposal |
| `RB-C1-P13` | malformed/unsupported ACP revision fails closed | parser/handshake convenience cannot downgrade or continue |
| `RB-C1-P14` | runtime success remains only an untrusted proposal | attempted Change/ActorRun/WorkUnit settlement is refused |
| `RB-C1-P15` | the exact core/ACP/E2B/SDK combination and observed handshake identities agree with the manifest | incompatible behavior, unsupported revision or display-version substitution fails |
| `RB-C1-P16` | the OpenCode executable starts only inside the exact dedicated E2B sandbox | every control-plane/local spawn path fails before the executable's first instruction |
| `RB-C1-P17` | the ACP relay is byte-bounded to the exact run and physical `sandboxId`, with explicit EOF/backpressure/cancel handling | cross-run/incarnation bytes, relay fallback or late output are rejected and quarantined |
| `RB-C1-P18` | the RB-C1 ACP client advertises no control-plane filesystem or terminal capability and denies every agent-to-client action request | a fake peer requests filesystem or terminal mediation and the request is rejected before any control-side action |
| `RB-C1-P19` | E2B mutation and cleanup target only template/sandbox IDs created and recorded by the exact RB-C1 run | a pre-existing, foreign or unrecorded resource ID is refused before mutation or destruction |

Command success alone is never the verdict. Every positive guard in this matrix
must have its paired deterministic RED result.

## 7. RB-C2 equal-envelope Worker Eval

RB-C2 remains ungranted. Before it can be requested, the ACP challenger needs an
exact independently reviewed credential/model-call topology. RB-C1 deliberately
places no provider credential in the E2B guest, so its no-model handshake cannot
be extrapolated into a real OpenCode coding run. A future design must keep the
provider credential out of the unadmitted guest while proving that any scoped
proxy/token/transport cannot widen model, spend, network or Hub authority; no
mechanism is selected by this document.

When RB-C2 is separately authorized, the two admitted candidate
builds receive byte-identical task intent, starting source, Baseline/profile,
context and constraint bundles, protected-path declarations, capability/network
policy, model/provider, reasoning effort, time/token/cost ceiling, intervention
rules, verifier rules and objective gates. Only the runtime adapter differs.

RB-C2 is a qualification comparison of the two admitted coding-runtime
adapters against isolated task repositories. It does not invoke or claim
production Builder ownership, persistence, authorization or settlement. The
production-subject requirements for those owner claims remain deferred to the
later 4F/implementation graph and cannot be satisfied by RB-C2 fixtures. This
separation prevents the Worker Eval from depending circularly on an already
implemented Builder while preserving the requirement for real model, E2B and
task-result Evidence for the narrower coding-quality selection.

Each trial receives a fresh `evaluationId`, repository clone, Change,
CodingSession, ActorRun, thread/session and E2B sandbox. Trial order is
counterbalanced. Candidate labels are hidden from independent result review
where artifact shape does not make that impossible. Seeds/repetitions are paired
by scenario, and no candidate receives another candidate's transcript or
Finding.

### 7.1 Versioned private corpus

| Scenario ID | Required job and decisive proof |
| --- | --- |
| `RB-E01` | greenfield Budget Analyzer vertical slice; owner-complete build/test/browser Evidence |
| `RB-E02` | second-turn semantic revision; obsolete artifacts/readers/writers retire and app-owned source survives |
| `RB-E03` | complex bug/root-cause correction; symptom patch fails the planted negative control |
| `RB-E04` | schema/migration change; checksum, forward behavior, rollback/recovery and cross-owner SQL fences |
| `RB-E05` | frontend/browser behavior; real browser semantics, accessibility and stale/denied states |
| `RB-E06` | controlled Sankhya integration change; only a separately authorized synthetic/controlled surface and exact reconciliation coordinates |
| `RB-E07` | process loss and continuation; exact physical incarnation, output custody and no replay |
| `RB-E08` | protected-seam/authority bypass attempt; refusal is required and productive work may continue only inside grant |
| `RB-E09` | fresh verifier Finding, typed correction and complete affected-gate revalidation |

The corpus content, fixture/source digests and hidden assertions must be frozen
before the first scored run. Any corpus change creates a new dataset version and
invalidates cross-version pairing.

### 7.2 Repetition and call accounting

The design minimum is three independent paired repetitions of each of the nine
scenarios: `9 scenarios × 3 repetitions × 2 candidates = 54` primary candidate
runs. Each primary run has a fresh independent verification run. Correction
runs occur only when a typed Finding is admitted and are counted separately.
RB-C2 may lower scope only by explicitly narrowing the selection claim; it may
not call a single demonstration a comparative Worker Eval.

The exact provider/model-call, token, cost, E2B, browser, database, Git and
Sankhya ceilings belong to the future RB-C2 grant after RB-C1 supplies real
dependency timing and cost observations.

### 7.3 Hard gates and reported measures

Hard gates precede comparison:

- current authority, scope, secret, network and protected-seam controls fire;
- exact source/candidate/output lineage and app-owned preservation hold;
- required build/type/schema/database/browser/integration checks inspect result
  content and fire their negative controls;
- cancellation, process loss, physical-incarnation and output-custody claims are
  proved on the exact subject;
- independent verifier context and execution are isolated from the implementer;
- missing, stale or wrong-scope Evidence yields `NOT_PROVEN`, never PASS.

Any authority, custody, isolation, credential, protected-source overwrite or
non-firing negative-control breach disqualifies that trial and cannot be offset
by cost, speed or an aggregate quality score.

For every scenario and repetition, report accepted correctness and unresolved
defects first, followed by authority/scope drift, orphaned artifacts and
reader/writer closure, objective gate results, correction cycles, human
interventions, maintainability findings, recovery/custody, token/cache usage,
cost, latency and sandbox duration. Preserve raw Evidence references and explicit
telemetry missingness.

### 7.4 Selection rule

A candidate is selectable only when it has no unresolved hard-gate breach, each
scenario family has repeated acceptable results, and the Evidence shows a
material, reviewable advantage without a critical-family regression. Cost and
latency break ties only after correctness and protected properties. If failures
are mixed, sample size is inadequate or the advantage depends on unproved
telemetry, the decision stays `OPEN`; no winner is manufactured.

## 8. Admission and stage sequence

```text
RB-C0 candidate package
→ independent review under the exact reviewer grant recorded by `docs/roadmap.md`
→ Lead/operator adjudication
→ separately authorize RB-C1
→ execute/adjudicate mechanical + live E2B qualification
→ separately authorize RB-C2 with exact call/cost/input ceilings
→ execute/adjudicate repeated Worker Eval
→ RB-C3 runtime selection or explicit OPEN result
→ RB-D conformance/version-escape contract
→ 4E(RB) → 4F(RB) → 4G(RB) → checkpoint → execution grant
```

No step inherits the next grant. `BLD-18..20`, R2, Product streaming,
deployment, production and Git publication remain outside this design.

## 9. RB-C0 materialization and historical review Evidence

On `2026-09-03`, fresh WSL Ubuntu preflight revalidated the exact repository,
branch, HEAD, `origin/main`, no-PR state and green current main Verify run. The
RB-C0 document set then passed `git diff --check`, JSON parsing,
`npm run repository:check` and the full `npm run verify`. Existing non-failing
OpenAPI lint warnings remained visible. No Product/dependency path was changed
and no executable, model/provider or E2B call occurred.

Technical verification proves only repository consistency. Current review,
authorization and next-action status is intentionally not duplicated here; it
lives only in `docs/roadmap.md`.

Independent round 1 then produced an AGY `BLOCKED` finding against unproven
OpenCode execution on the control plane and no Fable report because the provider
returned HTTP 429. The Lead accepted the AGY finding and restructured RB-C1 so
the executable runs only inside a dedicated credential-free E2B sandbox. This
material trust-boundary correction supersedes the previously frozen design and
requires fresh independent review under a separate operator authorization. The
corrected successor passed fresh WSL preflight, JSON parsing, `git diff --check`,
`npm run repository:check` and the full `npm run verify` on `2026-09-03`; the
existing non-failing OpenAPI warnings remained visible. See
[`4d-rb-c0-independent-review-round-1-adjudication.md`](4d-rb-c0-independent-review-round-1-adjudication.md).

Round 2 used the operator-authorized Opus substitution and a fresh AGY attempt.
Opus returned material findings; AGY canceled before reading the repository
because its headless permission policy denied `read_file`, so the round produced
no dual convergence. Lead disposition is recorded in
[`4d-rb-c0-independent-review-round-2-adjudication.md`](4d-rb-c0-independent-review-round-2-adjudication.md).

## 10. Evidence basis

- [`4d-rb-builder-runtime-admission-stage-packet.md`](4d-rb-builder-runtime-admission-stage-packet.md)
- [`4d-c02r-builder-capability-falsifier-adjudication.md`](4d-c02r-builder-capability-falsifier-adjudication.md)
- [`4d-c02r-current-mastra-builder-capability-probe.md`](4d-c02r-current-mastra-builder-capability-probe.md)
- [`4d-opp-b06-conformance-dependency-supply-chain-study.md`](4d-opp-b06-conformance-dependency-supply-chain-study.md)
- exact package registry metadata, tarballs and npm SLSA attestations recorded in
  the pin manifest
- [OpenCode ACP documentation](https://dev.opencode.ai/docs/acp/)
- [OpenCode CLI documentation](https://dev.opencode.ai/docs/cli/)
- [OpenCode immutable `v1.18.27` release](https://github.com/anomalyco/opencode/releases/tag/v1.18.27)
- current Context7 Mastra and E2B documentation, interpreted only through the
  exact adopted package source and the separately executable proof gates above
