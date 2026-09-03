# 4F(R1) S6-P5 — Exact-candidate refinement browser result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-07 EXACT-CANDIDATE REFINEMENT BROWSER REALIZED`
> **Stage posture:** `S6 OPEN`; final whole-S6/R1 completion proof remains separate

## Delivered result

The exact Candidate route now consumes the already-realized PRJ-07 refinement
path with the operator-approved W-01 option A. Two labeled inline fields keep
renewed business `intent` distinct from exact-candidate `reviewFeedback`; the
browser supplies neither value from source text, DOM, assistant state, cache or
an undisclosed original intent.

The command body binds both explicit meanings to the exact route Candidate
digest. Retries of the same normalized pair reuse one opaque browser
idempotency key, while changing either field mints a new key. Synchronous double
submission remains single-flight. Every failure preserves both drafts and
navigates nowhere.

Candidate A remains immutable. Only the successful PRJ-07 response supplies the
Candidate B digest used for navigation; Candidate B is then re-read through
PRJ-23, and no response text is admitted into the Candidate cache. The keyed
route remount clears Candidate-A drafts, failures and effect state.

No Hub, database, generated contract, Mastra, OAuth, provider or canonical
Product/wire byte changed. No Product/provider call or credential was used.
Product OAS and generated route projection identities remain:

```text
Product OAS digest  = 67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3
S3 route projection = 1b568887e36cfa37576905de38eb751d6d190738976ae1b10c4bd8d4048ec9aa
route census        = 8
```

## Deciding proof

| Proof | Result |
| --- | --- |
| real Chromium exact-candidate refinement | PASS, 1/1 |
| blank intent / blank feedback falsifiers | PASS; zero request and exact missing-field focus |
| exact three-field body and Candidate-A digest | PASS |
| unchanged-pair idempotency | PASS; same opaque key |
| changed feedback and changed intent | PASS; distinct keys for either change |
| synchronous double submit | PASS; one request |
| failure draft/no-navigation truth | PASS |
| server-issued Candidate B + fresh PRJ-23 read | PASS; response text not cached |
| Candidate A → B local-state separation | PASS |
| narrow viewport no-overflow | PASS |
| S6-P4/P3 browser regressions | PASS, 2/2 |
| S6-P2 backend/Agent regression | PASS, 1/1 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| changed-file Biome and workflow YAML | PASS |
| dependency floor | dependency/lock identity unchanged by P5; prior clean `npm ci` remains applicable |
| required repository verification | `npm run verify` PASS; current-state check 387 changed paths |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |

## Lead adjudication and remaining boundary

`CLEAR`. The realization implements the operator-selected two-meaning
conformance without reopening W-01 or creating original-intent authority. No
correction changed Product meaning, credential custody, trust boundaries or
deciding-proof reliability, so Engineering Method 1.1 does not justify an
additional Fable/AGY round.

S6-P5 is `CLOSED PASS`. S6 itself remains open until one bounded final closure
packet reproduces the whole-S6/R1 completion floor named by the approved 4F
graph, including clean dependency reconstruction and applicable real-PostgreSQL
journeys. Production/multi-user OAuth custody, real Product/provider execution,
review-context projection, external OCI/input custody and publication remain
blocked.

No commit, push, PR or merge was performed.
