# 4F(R1) S6-P3 — Baseline explanation browser-consumption result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-24 CANDIDATE-WIDE BROWSER CONSUMPTION REALIZED`
> **Stage posture:** `S6 OPEN`; PRJ-07 browser Inception remains separate

## Delivered result

The existing exact Candidate Baseline route now consumes PRJ-24 through the
generated client. A labeled form keeps the human question as local draft,
submits exactly `{ question }` once, and displays the server-issued answer and
both provenance references without treating them as candidate, Baseline or
approval truth. The browser verifies the response candidate digest equals the
current route subject before admitting the answer.

The interaction is deliberately candidate-wide. No DOM text, selection anchor
or `reviewContext` is sent while no server-owned projection resolver/version
exists. Changing the route candidate remounts the component, clearing the prior
candidate's question, response and failure state. No conversation, history,
thread, memory, Product record or query-cache authority was introduced.

PRJ-07 refinement browser wiring remains deferred. Its distinct required
`intent` and `reviewFeedback` inputs may not be collapsed or fabricated by the
frontend merely to reproduce the historical low-fidelity queue.

## Deciding proof

| Proof | Result |
| --- | --- |
| real Chromium PRJ-24 candidate-wide flow | PASS, 1/1 |
| request method/path/body exactness | PASS; POST and exact `{ question }` only |
| blank and synchronous double-submit falsifiers | PASS; zero/one request |
| server refusal truth | PASS; `422`, draft retained, prior success absent |
| Candidate A → Candidate B local-state separation | PASS |
| answer + candidate/source provenance rendering | PASS |
| narrow viewport no-overflow | PASS |
| S6-P2 backend/Agent regression | PASS, 1/1 |
| S4 approval/re-entry browser regression | PASS, 2/2 |
| S5 browser boundary regression | PASS, 5/5 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| changed-file Biome and workflow YAML | PASS |
| dependency floor | prior same-turn `npm ci` PASS; no dependency/lock bytes changed |
| required repository verification | `npm run verify` PASS; current-state check 387 changed paths before receipt docs |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |

## Lead adjudication and deferrals

`CLEAR`. The implementation realizes the locked W-01 contextual-assistant seam
without creating a generic assistant or weakening current server authority. No
correction changed the locked Product Experience, credential boundary or
deciding-proof reliability, so Engineering Method 1.1 does not justify another
Fable/AGY review round.

Candidate projection context, PRJ-07 first-use/refinement browser wiring, real
provider execution, production/multi-user OAuth custody, external OCI/input
custody and publication remain deferred to their named packets or decisions.

No commit, push, PR or merge was performed.
