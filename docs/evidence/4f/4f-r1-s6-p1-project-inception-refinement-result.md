# 4F(R1) S6-P1 — Project inception refinement result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-07 EXACT-CANDIDATE REFINEMENT REALIZED`
> **Stage posture:** `S6 OPEN`; `PRJ-24` remains a separate outcome

## Delivered result

PRJ-07 now realizes the accepted refinement path end to end. The Project owner
requires the all-or-nothing prior-digest/feedback pair, resolves the exact
current Candidate A inside the Project, supplies Candidate A as immutable
server-built context to the existing stateless ProjectInceptionAgent, and
settles a distinct immutable Candidate B only after rechecking current
authority, source revision and Candidate-A CAS. Candidate A remains unchanged.

Migration `010_project_inception_refinement.sql` binds the reservation to the
prior digest without granting table access to the runtime role. Unknown and
stale subjects refuse; a concurrent current-candidate advance refuses at
settlement; an unchanged canonical candidate cannot masquerade as successful
refinement. A completed idempotent request replays its exact Candidate B even
after A is no longer current.

The bounded Mastra profile remains unchanged: two invocation-local read tools,
four steps, three tool calls, concurrency one, zero retries, 8192 output tokens
and 180000/60000 ms timeouts. There is no memory, workflow, storage, transcript,
background execution or new model profile. The proof used only the fake model;
no OAuth/API-key bytes or Product/provider call were used.

## Deciding proof

| Proof | Result |
| --- | --- |
| S6-P1 HTTP → Mastra → Project vertical | PASS, 1/1 |
| explicit-pair and no-change falsifiers | PASS |
| exact Candidate-A content reaches the Agent | PASS |
| real PostgreSQL unknown/stale/CAS/replay proof | PASS, 1/1 |
| S6-P0 directed regression | PASS, 2/2 |
| S6-P0 PostgreSQL regression through migration 010 | PASS, 1/1 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| changed-file Biome and workflow YAML | PASS |
| clean dependency reconstruction | `npm ci` PASS; 336 packages; 2 known low-severity advisories |
| required repository verification | `npm run verify` PASS; current-state check 387 changed paths |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |

The first PostgreSQL invocation preceded service readiness and failed by
connection; the unchanged proof passed after readiness. A later catalog check
correctly rejected an over-parenthesized expected `pg_get_constraintdef` string;
the exact PostgreSQL-emitted signature replaced that false expectation and the
unchanged Product/database behavior then passed.

## Lead adjudication and deferrals

`CLEAR`. The implementation exposed and corrected one material false-PASS risk:
currentness was initially checked before an existing idempotency receipt, which
would have rejected valid replay after A→B. The corrected owner function checks
authorization and the exact receipt first, then applies currentness only to a
new reservation. Real PostgreSQL proof now fixes that reliability property.

The correction did not change Product meaning, authority, provider custody or
the protected Mastra profile. A further independent Fable/AGY round is therefore
not justified. PRJ-24, browser wiring, real provider proof, production and
multi-user OAuth custody remain safely deferred to their own grants.

No commit, push, PR or merge was performed.
