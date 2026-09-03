# 4F(R1) S6-P4 — Project first-use Inception browser result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-07 FIRST-USE BROWSER INCEPTION REALIZED`
> **Stage posture:** `S6 OPEN`; refinement browser composition awaits one operator choice

## Delivered result

One currently disclosed Project now exposes a focused Inception route. Its
labeled form accepts one explicit non-blank human intent and invokes PRJ-07 only
through the generated client. Source, provider, model, policy and credentials
remain server-owned and are not selectable in the browser.

The form binds retries of unchanged normalized intent to one opaque browser
idempotency key and mints a new key after intent changes. It prevents synchronous
double submission, preserves the draft through every failed outcome, and never
creates optimistic candidate truth. Only a successful server response supplies
the candidate digest for navigation; the destination then performs a fresh
PRJ-23 read rather than seeding the Candidate cache from PRJ-07.

The contract generator now exports the already-closed PRJ-07 response type to
the web client. Product OAS and route projection digests remain unchanged:

```text
Product OAS digest  = 67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3
S3 route projection = 1b568887e36cfa37576905de38eb751d6d190738976ae1b10c4bd8d4048ec9aa
route census        = 8
```

## Deciding proof

| Proof | Result |
| --- | --- |
| real Chromium Project → PRJ-07 → candidate navigation | PASS, 1/1 |
| blank-intent and exact-body falsifiers | PASS; zero request / exact `{ intent }` |
| unchanged retry idempotency | PASS; same opaque key |
| changed-intent idempotency | PASS; distinct key |
| synchronous double-submit | PASS; one request |
| failure draft/no-navigation truth | PASS |
| server-issued digest + fresh PRJ-23 read | PASS; PRJ-07 response text not displayed |
| S6-P3 browser regression | PASS, 1/1 |
| S6-P2 backend/Agent regression | PASS, 1/1 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| changed-file Biome and workflow YAML | PASS |
| dependency floor | prior same-turn `npm ci` PASS; no dependency/lock bytes changed |
| required repository verification | `npm run verify` PASS; current-state check 387 changed paths before receipt docs |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |

The initial packet omitted the generated PRJ-07 response export. Before changing
the generator, the packet ceiling was amended to admit only that mechanical
projection. The canonical OAS, method/path, request/response schema and Product
meaning did not change.

## Lead adjudication and bounded decision

`CLEAR` for first-use Inception. The mechanical type export did not change W-01,
Product authority, provider custody or deciding-proof reliability, so no new
Fable/AGY round is justified.

Refinement cannot proceed honestly without one operator W-01 conformance choice.
The current wire requires both a renewed human `intent` and exact-candidate
`reviewFeedback`, while the locked low-fidelity queue showed only feedback and
the current candidate does not re-disclose original intent. The recommended
bounded realization is two explicit inline fields beside the exact Candidate;
the alternative is reopening the smallest Product/wire owner to retain and
re-disclose original intent. No refinement bytes were written.

Real provider execution, production/multi-user OAuth custody, review-context
projection, external OCI/input custody and publication remain blocked.

No commit, push, PR or merge was performed.
