# P11 — faithful assembled interactive Product composition plan

> **Status:** `CURRENT P12 BEHAVIORAL REASSEMBLY LOCKED / OPERATOR APPROVED / HISTORICAL LOCK PRESERVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **Contract:** `p11-faithful-assembly-contract.md`
> **Implementation authority:** none

This plan supersedes the rejected 12-block/card-summary composition. It fixed the assembly realization before authoring and now owns the exact candidate composition.

Historical operator-approved P11 identity: `536052096dd10dec2f604ccef49aa64ba52e4dac`.
Current transport-only behavioral approved identity: `45172fd437b0c3b0236b641bcb803c20f165959f`.

## 1. Entry state

```text
branch      = codex/4c-p02-integrations-ux
HEAD        = origin/main = 1619f14d9caed172b6cada9430e6b49ff77a4316
current PR  = none
main CI     = GREEN
4C          = OPEN / P11 faithful assembly authorized
coverage    = 127/127 browser-facing / N_platform=128
findings    = 0
```

Budget Analyzer remains only a Product/API proving instance and `FUTURE_PRODUCT_APP`. No application screen, flow or wireframe enters P11.

## 2. Exact locked inputs

| Block | Exact canonical HTML identity | P11 responsibility |
| --- | --- | --- |
| `T-01` | `4da586d8a421bb03413bc82ee5b2e82432d6f620` | trusted bootstrap → Account → explicit re-entry → first Workspace |
| `GF-01` | `603b47ccaba1fe6557e557b48efa4f40207d3724` | one adaptive Control Plane shell + Account/session |
| `W-01` | `d466d66a125605471f2f879bbe376e4de7681d95` | Projects, source onboarding, Inception and Baseline |
| `W-02A` | `f0a6902737a36217b081ff61768caa39c98c4734` | Workspace Brain Knowledge/Discovery/proposal/publication |
| `W-02B` | `f8a4be72cd5af86ea06b4dd82d8710e58edb203f` | Connection browse/detail/configuration/credential/qualification |
| `W-03` | `e9d630622d853d6e352737f46202f2765526fd6a` | People/Areas/access and immutable Audit in the re-locked GF-01 shell |
| `W-04` | `71e03432a0abd34ae35301094010fd670bb78b98` | Workspace Agent discovery catalog |
| `P-01` | `25e5077106892c4ff6aba6774987e73a12ccff51` | app-first Build + complete Agent Studio F05 |
| `P-02` | `fd23303ac71bbf256887bf361fb0f8c7cf9aae00` | Data/Capabilities/Integrations/Project Brain |
| `P-03` | `17d31534fac0e57a74f70202567b23d8a63cd3c0` | Agent workbench/Definition/Automations/Runs/decisions |
| `P-04` | `e036684e3e66d028361db2d708cf05811a367f4b` | Releases/serving/Promotion and Activity owner lenses |
| `P-05` | `d00b2126667a0a51317c653c57c237444a129dfb` | App access + bounded Project lifecycle |
| `PA-01` | `ffba5935d8fccd0fc5d7ad4d275fe38b09294674` | independent Published-App shell + Product Agents |

The canonical inputs are immutable during P11. Their in-artifact proof chrome may remain historical; lock authority lives in their Screen Contracts.

## 3. Competing assembly realizations

### A — reimplement all screens inside P11

Rejected. It creates a second frontend truth, invites drift and already produced the rejected card-summary artifact.

### B — iframe gallery

Rejected by itself. Exact screens would render, but cross-block coordinates and journeys would remain disconnected.

### C — exact locked-artifact mounts + P11 journey/coordinate adapters — SELECTED

```text
one P11 Evidence harness
→ one active exact locked HTML mount at a time
→ block-local interactions execute inside the original canonical artifact
→ P11 adapters connect only accepted cross-block exits/entries
→ parent URL records exact journey/block/coordinate navigation
```

This preserves every locked region/control/state without copying it, keeps only one Product shell visible at a time, allows T-01 and PA-01 to remain independent full-context shells and makes drift detectable through exact blob pins.

The harness is review Evidence, not Product IA. It may select journeys, inspect coordinates and move between exact blocks. It may not become a global workflow, authorization engine or normalized Product store.

## 4. Mount registry

```text
t01  → t01-trusted-setup-functional-wireframe.html
gf01 → gf01-global-frame-wireframe.html
w01  → w01-projects-inception-wireframe.html
w02a → w02a-brain-functional-wireframe.html
w02b → w02b-connections-functional-wireframe.html
w03  → w03-people-access-audit-functional-wireframe.html
w04  → w04-agent-catalog-functional-wireframe.html
p01  → p01-build-workspace-functional-wireframe.html
p02  → p02-project-resources-functional-wireframe.html
p03  → p03-product-agent-functional-wireframe.html
p04  → p04-release-operations-functional-wireframe.html
p05  → p05-project-lifecycle-and-published-app-access-functional-wireframe.html
pa01 → pa01-published-app-product-agent-functional-wireframe.html
```

P-01 admits exact `origin=NEW|EXISTING&agentId?`; P-04 admits `route=releases|activity&activity=timeline|jobs|effects|usage|audit`; P-05 admits `lens=access|lifecycle`. Other tabs/lenses remain controlled by their exact mounted artifact.

## 5. Coordinate custody

The P11 URL may carry only navigation/review coordinates:

```text
journey / step / block / workspaceId / projectId / agentId / origin / changeId
candidateBaselineDigest / brainRevisionId / connectionId / connectionRevisionId
releaseId / environmentId / pointerGeneration / agentRunId
originatingRunKind / originatingRunRef / approvalRequestId / auditRecordId
```

Every destination remains responsible for re-resolving and authorizing its owner truth. A coordinate, mounted screen, visible control or prior disclosure grants nothing.

## 6. Cross-block adapters

Adapters are allowlisted P11 Evidence transitions, not Product operations:

| Exit | Destination | Exact carried coordinate / law |
| --- | --- | --- |
| T-01 Ready | W-01 Projects | `workspaceId`; normal IAM-01 session already re-entered |
| W-01 approved Baseline | P-01 Build | `workspaceId + projectId`; Build re-resolves Project |
| W-02A publication | P-02 Project Brain | `workspaceId + projectId + brainRevisionId`; never auto-bind |
| W-02B qualified revision | P-02 Integrations | `projectId + connectionId + connectionRevisionId`; never auto-adopt |
| W-04 Agent | P-03 exact Agent | `workspaceId + projectId + agentId`; P-03 re-resolves PRJ-21 |
| P-03 New/Edit | P-01 Agent Studio | `projectId + origin + agentId?`; URL carries no definition truth |
| P-03 AgentRun | P-04 Effects | `projectId + originatingRun.kind/ref`; GW-01 filters server-side before pagination |
| P-01 verified candidate | P-04 Releases | `projectId + changeId`; Release/Promotion/serving remain distinct |
| P-04 served Release | PA-01 | review-harness deep-link only; no Control Plane launch operation is invented |
| P-05 duplicate success | explicit owner boundary | fixed `NO_DATA`; no destination navigation without owner-issued `workspaceId + projectId` |

P11 may adapt an exact boundary button when the standalone block intentionally stopped at a future block. It must not replace or bypass block-local controls.

## 7. Journey runner

```text
A  T-01 → GF-01/W-01
B  W-01 → P-01
C  P-01 → P-04 Releases
D  W-02A Discovery/proposal
E  W-02A publication → P-02 Brain binding
F  W-02B qualification → P-02 Integrations
G  P-02 Data/Capabilities/Analyze
H  P-04 Release/Promotion/serving → P-05 app access → PA-01 deep link
I  W-04 → P-03 → P-01 Agent Studio → P-04
J  PA-01 Conversation/clarification/AgentRun
K  P-03 or PA-01 approval → P-04 originatingRun Effects
L  P-04 Activity/Managed jobs
M  P-05 Lifecycle duplicate NO_DATA → W-01 destination
N  no UI; explicit FUTURE_PRODUCT_APP disposition only
O  P-01 maintenance Change + separately governed W-02A/P-02 Brain learning
```

The runner records only current step/coordinates. Block-local owner states remain inside each exact artifact; no generic global scenario replaces them.

## 8. Structural and accessibility obligations

- the active mount exposes exact block/blob identity outside the Product frame;
- the review harness is collapsible and keyboard operable;
- mount loading, failure and blocked navigation are distinct;
- iframe title identifies the mounted block;
- adapter focus moves to the new mount and remains keyboard reachable;
- wide/narrow testing resizes the actual mounted block;
- T-01 has no Control Plane rail;
- only one active Control Plane shell is visible for W/P blocks;
- PA-01 never appears inside the Control Plane shell;
- proof chrome is not promoted into Product navigation;
- reduced-motion and text/non-color state meaning are preserved.

## 9. Executable proof

The P11 test must pin the 13 blobs, prove all mounts, load each through localhost, operate representative protected interactions, traverse every adapter with exact URL coordinates, exercise owner-specific recovery controls, prove material controls were not replaced by summary cards or inert dialogs, verify focus and wide/narrow transformation, prove PA-01 independence and exclude Budget Analyzer app/4D/framework/SDK/runtime selection.

Targeted static tests supplement the browser walkthrough; they do not substitute for it.

## 10. Mount, adapter and state protocol

### 10.1 Localhost-only mount transport

P11 is operated from the repository root through a deterministic same-origin localhost server. `file://`, `srcdoc`, copied child markup and remote URLs are forbidden.

The iframe has no HTML `sandbox` attribute: the exact hash-pinned same-origin P8 children require their locked native self-navigation and scripts. Safety comes from the immutable 13-entry `src` allowlist, marker/blob proof and child-destination allowlist; arbitrary or remote child URLs are rejected.

```text
parent P11 URL
→ create one iframe with an exact relative canonical P8 src
→ wait for child load
→ verify expected data-wireframe marker
→ install only the block's allowlisted boundary observers
→ focus the titled iframe

next mount
→ remove prior iframe and observers
→ create one new exact iframe
```

Mount states are `MOUNT_LOADING | MOUNT_READY | MOUNT_FAILED | NAVIGATION_BLOCKED`. Only one iframe and one Product shell may be visible/focusable. The iframe must have an exact human-readable `title`; the closed-by-default parent review controls stay outside Product IA.

### 10.2 Allowlisted adapter envelope

P11 never accepts arbitrary child messages or DOM events. Each adapter produces an Evidence-only envelope:

```text
sourceBlock
sourceEvent
ownerCoordinates
destinationBlock
destinationEntry
failureDisposition
```

The parent may observe an exact allowlisted boundary control, child `location` change or fixture-owned result. It may not manufacture owner identity, scrape unrelated child state or inject business authority. The parent updates its URL only after validating the event against the registry. The destination re-resolves its own fixture owner.

Complete admitted Evidence includes `candidateSubjectDigest`, `draftRevision`, `planRevision`, `proposalDigest`, `expectedSubjectDigest`, `findingId` and `evidenceId` in addition to §5. `effectAttemptId` is never transported; it remains a Gateway/P-04 owner result.

### 10.3 Honest boundary laws

- P-03 → P-04 Effects must mount `route=activity&activity=effects` and apply an exact fixture-equivalent `originatingRun.kind/ref` filter inside the P-04 child before its loaded page is presented. Filtered empty means no currently disclosable matching EffectAttempt, not proof of no effect. No PAR-07 client join/retry/reconcile.
- P-01 → P-04 carries Project/Change context only as a journey boundary. It never infers a Release identity from a Change.
- P-04 → PA-01 exists only as a review-harness deep-link with explicit fixture coordinates followed by PA-01/IAM-13 recheck. No Product `Open app` action or serving-derived URL exists.
- P-05 duplicate → W-01 may continue only from an owner-issued simulated destination result. Otherwise it ends at an explicit destination boundary; the parent never invents `workspaceId/projectId`.
- W-02A publication never binds P-02 automatically; W-02B qualification never adopts a Project Connection revision automatically.

### 10.4 State custody across mounts

```text
parent owns     = journey/step, active block, exact navigation coordinates
child owns      = all block-local fixture/server projections and ephemeral UI
neither owns    = authorization or normalized cross-owner Product state
```

A remount intentionally reloads owner truth. P11 must never claim that an ephemeral Change, draft, reviewed proposal, promotion, grant, Conversation or approval survived unless the exact destination/read coordinate can re-resolve it. Journeys that require continued local fixture state remain within the mounted child until their accepted boundary is reached. Denied/stale/expired/archived states cannot silently reset to READY while a journey claims continuity.

### 10.5 Per-edge behavioral proof

| Journey | Required executable edge proof |
| --- | --- |
| A | T-01 bootstrap/retry/re-entry/Workspace → W-01 with exact Workspace coordinate |
| B | W-01 source/Inception/candidate/refinement/exact approval → P-01 Project boundary |
| C | P-01 Build/Plan/Preview/diff/Evidence → P-04 Releases without inferred Release |
| D/E | W-02A Knowledge/Discovery/resolution/decision/publication → separately explicit P-02 binding |
| F | W-02B revise/credential/NEEDS_RETEST/qualify → separately explicit P-02 adoption |
| G | P-02 Data/Structure/row/Analyze + Capability detail without invocation |
| H | P-04 Release Overview/Composition/Proof/conformance/Promotion/currentness → P-05 access → independent PA-01/IAM-13 entry |
| I | W-04 exact Agent → P-03 Definition → P-01 NEW/EXISTING complete draft/diff → P-04 boundary |
| J | PA-01 full/panel/inline host → Conversation/new turn/clarification → AgentRun detail and session/access states |
| K | P-03/PA-01 queue → sealed request → digest-guarded decision → exact P-04 originatingRun Effects/GW detail |
| L | P-04 MAR served catalog including never-run → history/detail → idempotent run-now/conflict |
| M | P-05 duplicate authority + fixed NO_DATA → owner-issued destination boundary; no copied protected state |
| N | explicit no-UI `FUTURE_PRODUCT_APP` disposition only |
| O | P-01 maintenance Change and separately governed W-02A/P-02 learning path |

Browser proof must inspect actual child controls/state changes, not parent labels. It must fail on inert boundary adapters, missing locked regions, wrong coordinates, duplicate shells, focus traps, false READY after remount or scaled/screenshot-only responsive proof.

## 11. Humane operator walkthrough

The default P11 review surface is a visible 13-step guided walkthrough, not the A–O methodology runner. Each step mounts one exact locked block and states in plain language:

```text
what to click now
what result to expect
what is outside this step
PASS | FAIL | BLOCKED + optional note
```

The operator may highlight the next named child control. Results remain in-memory Evidence only; they do not write Product state, persist in browser storage, submit externally or auto-LOCK P11. Fail/Blocked may continue so the whole Product can be reviewed, then the summary routes back to the first affected block.

Review order:

```text
T-01 → GF-01 → W-01 → W-02A → W-02B → W-03 → W-04
→ P-01 → P-02 → P-03 → P-04 → P-05 → PA-01
```

The A–O runner, direct block selector, exact hashes/coordinates, reload and mounted responsive-width control remain under collapsed `Advanced inspection`. They supplement the guided review and do not prove a guided step complete.

Guided instructions explicitly tell the operator to test only named controls. The guide uses explicitly labelled direct-review ingress and never claims cross-block continuity. The advanced A–O runner moves only after a validated same-origin owner event. P-05 duplicate stops at the admitted `NO_DATA` boundary because no owner-issued destination Project coordinate exists.

## 12. Exit

The re-authored P11 satisfied and closed the following operator-only gate:

```text
13/13 exact mounts load
journeys A–O dispositioned and operable
cross-block coordinates exact
representative block interactions preserved
inert material controls = 0
wide/narrow walkthrough GREEN
blocking finding = 0
npm ci + npm run verify + repository tests GREEN
operator explicitly LOCKS
```

The operator locked the current P11 on 2026-08-28. P12/4C closure reconciliation is next; 4D, merge and Product implementation remain unauthorized.
