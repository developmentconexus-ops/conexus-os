# 4F(R1) Project cognition — Opus successor final confirmation brief

> **Mode:** two fresh isolated read-only lanes over one corrected frozen candidate
> **State:** `F1 CORRECTED / FINAL CONFIRMATION PENDING`
> **Claude lane:** actual alias `opus`, canonical `claude-opus-5`, effort `xhigh`
> **Authority:** reviewer output is Evidence; Lead owns adjudication

## Exact confirmation question

Confirm only whether the sole material finding from the prior Claude review is
genuinely corrected: the composed PostgreSQL 17.10 journey must no longer be a
status assertion contradicted by its frozen result. Determine whether the new
receipt and corrected result bind the exact tested candidate strongly enough to
remove the false-PASS route for protected claim 4.

Do not reopen production implementation or the five prior non-blocking findings
unless the correction itself makes an existing protected claim false.

## Frozen corrected candidate

```text
6e81482c4c003b0a69e34c1c494d76c32a1781a58220769e35416a7dd2fa7520  apps/hub/src/project/anthropic-oauth-provider.ts
8f17ac8a88e0cd74c05408746c768f49726d0c35882aeef8a33d7d09dd1c5b96  apps/hub/src/project/module.ts
6e707a665f8d01704cccf3e3cbec66a2c366005fa09adb8b74c090e1417ec211  tests/implementation/r1-s6-production-cognition.test.mjs
9336fc0d933684df265e25426c01203aff39905d7a3649bfe93411081333fe92  tests/implementation/r1-s6-composed-journey.test.mjs
a9567f70482cf5540900c1278c159e2cc6fe2097d9bd98826ca3517b36af0992  qualification/4f/r1-project-cognition-admission/anthropic-oauth-provider.mjs
7204d00c22c3045440eaae542e6d01f5e7e2b2f4455f6835f26b2c5973d5ec38  qualification/4f/r1-project-cognition-admission/p2-live-anthropic-oauth.mjs
dafd4563f74adeadcd8e824662f4f3a7ba7ba9cd9c12350293bf9d2f4c83fda7  qualification/4f/r1-project-cognition-admission/p2-anthropic-oauth-admission.test.mjs
9365c6c8a3cbc34d6761cb368744d551a39d06e98631fb609b943564b0bf25cd  qualification/4f/r1-project-cognition-admission/evidence/p2-live-opus-successor-receipt.json
9aac773fc820544ac07095345971dfa76baa379b3a90971265846f85d8e32576  docs/evidence/4f/4f-r1-project-opus-composed-proof-receipt.json
684e4be7d1fa8bd29bbe2a8892cfc64e7137b7fc61ac25aabf6340391ce96a8f  docs/evidence/4f/4f-r1-project-opus-model-switch-stage-packet.md
0da45668e2cfe574372a83c9d9b69a30b1e82c81a09e44c8252abfef98388871  docs/evidence/4f/4f-r1-project-opus-model-switch-result.md
9d186ea838284b94f3816f01aa5cef555b5447874a90740db113bf9d0fca929e  docs/evidence/4f/4f-r1-project-opus-model-switch-independent-review-result.md
```

## Correction and falsifiers

Prior F1 observed that the roadmap/brief said composed `PASS` while the frozen
result said unexecuted. The correction adds a receipt recording:

- WSL Ubuntu, Node 24.20.0 and npm 12.0.2;
- exact PostgreSQL 17.10 OCI digest and ephemeral tmpfs storage;
- exact command and subject hashes;
- observed test counts `1/1 PASS`, zero failures and duration;
- no provider call or credential disclosure.

The corrected result cites that receipt and its SHA-256. F1 survives if any
current status/result still says unexecuted, if receipt subject hashes do not
match, if the receipt cannot entail the named claim, or if the correction
silently changes production/test bytes.

## Preserved claims and non-goals

Claims 1–3 and 5–7 from the original brief remain protected and their subject
hashes are unchanged. F2/F3/F4/F6 remain `DEFER SAFELY` under the recorded
triggers. F5 is closed by completed Claude execution and deleted heartbeat.

Reviewers may use only installed read-only diagnostics. No OAuth credential,
provider call, container, dependency install, edit or Git effect is admitted.

## Output contract

Return one self-contained report ending in JSON with `verdict` (`PASS`,
`REVISE`, or `STOP`), `f1Corrected`, results for claims 1–7, concrete findings
using the repository classifications and `unresolvedMaterialFindings`.

Do not compare lanes, read the other lane, request another reviewer or widen
into generic recovery/framework work. A further round is forbidden unless this
specific correction still leaves a reproducible false-PASS route.
