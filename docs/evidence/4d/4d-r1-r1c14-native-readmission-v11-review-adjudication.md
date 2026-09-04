# 4D(R1) — R1C-14 native readmission v11 review adjudication

> **Status:** `DIVERGENCE ADJUDICATED / CORRECTED IN v12 / GATE STILL OPEN`
> **Reviewed subject:** `v11 / result bf2adbe3025d2171c306efd63e5ea703967a42041e6c4d518e2262587cb19424`
> **Brief SHA-256:** `b42b33e65d8e56cf58cc24f9af48d83b88886e69794d0c760927a02246c6efb5`
> **Successor candidate:** `v12 / result b108a08866fae4eb53bf6bbf66095bb93ae591f55387db9d4a9da1215754ef48`

## Independent lanes

- Claude Code: CLI `2.1.220`, requested model `opus`, resolved model
  `claude-opus-5`, effort `xhigh`, plan/read-only, session
  `f972d853-2dbb-45db-bcdb-9f0d813360b4`, external wrapper output SHA-256
  `9d116dcaed1561f77bbee6925ca213832aa4f9a0dc81654559857559233d6416`,
  raw verdict `REVISE BEFORE RECEIPT`.
- AGY: CLI `1.1.23`, model `gemini-3.1-pro-high`, effort `high`, plan plus
  sandbox, conversation `b495ba17-7b0c-4795-9f45-2c88f7b3a7d2`, external
  wrapper output SHA-256
  `a2232a55c691f7f8f2334cdbb05e32ec1830c140af63c0c7658a1f153fd48d4f`,
  raw verdict `CLEAR` with zero material findings.

The lanes were independent and neither saw the other's output before both
finished. Their divergence is Evidence, not a vote. The Lead applied the
Engineering Method against repository-current authority and accepted the Opus
counterexamples below because each reproduces a defect against an existing
invariant. Gemini's clean result did not falsify those observations.

## Finding dispositions

| Finding | Classification | Lead disposition | v12 correction / proof |
| --- | --- | --- | --- |
| F1 unrouted v10 PASS | `LOCAL EXECUTION GAP` | accepted; receipt stopped | v9→v10→v11→v12 digest chain plus directory census and orphan firing test |
| F2 request-target flag could not fire | `LOCAL EXECUTION GAP` | accepted | planted request-target canary is detected, its owned log entry scrubbed, and retained log rescanned clean; `REQUEST_TARGET_NEGATIVE` |
| F3 filesystem secret scan had no firing proof | `LOCAL EXECUTION GAP` | accepted | planted file is detected, removed and cleanly rescanned; `SECRET_SCAN_NEGATIVE` |
| F4 review-lane floor was prose-only | `LOCAL EXECUTION GAP` | accepted; receipt stopped | PASS now requires exact Opus/Gemini census, tool/model/effort/read-only posture, session/output identities, zero material findings and `ACCEPT`; incomplete census firing test |
| F5 finalizer tests rewrote historical fixture | `LOCAL EXECUTION GAP` | accepted | tests load the manifest-selected current candidate/census with no schema rewrite |
| F6 unattested build-context class remained reachable | `LOCAL EXECUTION GAP` | accepted as latent class defect | metadata admission refuses `COPY`, local `ADD` and build-context bind mounts; three firing fixtures |
| F7 stale v10 runner label | `LOCAL EXECUTION GAP` | accepted | neutral brief now names v12 and routes the complete retained chain |
| F8 deferred OCI custody lacked revisit trigger | `LOCAL EXECUTION GAP` | accepted | pending-actions owner now reopens before a daemon/host transition or immediately when the exact index no longer resolves |

No finding changes Product meaning, owner, Permission, schema or accepted S3
semantics. The smallest owner is the R1C-14 successor pack and its operational
pending record. Upstream planning remains closed. The correction changes the
reviewed property materially, so v11 cannot be accepted and fresh independent
review of v12 is required.

## Current evidence

```text
v12 result SHA-256          = b108a08866fae4eb53bf6bbf66095bb93ae591f55387db9d4a9da1215754ef48
v12 candidate SHA-256       = 228d603aea0dcd3d75295a7bf4c072c2adcd3c7accd3525bf64b0a8af7dcad60
admission-test SHA-256      = d5df9c402a20cf4a87f370bee402976a3c4e51c06cc86294730b8629a477d763
qualification controls      = 17 / 17 PASS
read-only consumer tests    = 18 / 18 PASS
Product delta               = 0
secret contamination        = 0 / 334 files
```

`R1C14_NATIVE_READMISSION` remains `CANDIDATE`. No receipt, S3 Product byte,
commit, push, PR, merge, provider call or external OCI publication is authorized
by this adjudication.
