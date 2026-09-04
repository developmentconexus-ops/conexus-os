# 4B Evidence — Gateway schema closure

> **Status:** CLOSED / BOUNDED EVIDENCE  
> **Phase:** 4B — Executable Wire Contract  
> **Slice:** `GW-01 → GW-02`  
> **Implementation:** BLOCKED

## 1. Authority compiled

This slice compiles only the accepted Gateway Product inspection surface:

```text
GW-01 ListEffectAttempts
GW-02 GetEffectAttempt
```

Both are Control Plane read/provenance operations under current `audit.read` and exact Project/originating-effect disclosure. The underlying Gateway effect admission, semantic effect/replay identity, idempotency claim, provider transport retry, reconciliation execution and external-effect budget mechanics remain owner-internal.

No Product operation was added for retry, replay, execute, resume, reconcile, resolve, status marking or manual effect completion.

## 2. Canonical wire

The canonical entrypoint now routes only the two Gateway Path Items through:

```text
contracts/api/product/gateway-paths.yaml
```

Routes:

```text
GET /api/control/projects/{projectId}/effect-attempts
GET /api/control/projects/{projectId}/effect-attempts/{effectAttemptId}
```

`GW-01` supports the existing bounded continuation law plus one exact owner-coordinate filter accepted by `4C-PRE11-F04`:

```text
originatingRun = optional exact owner-issued { kind, ref } filter
pageToken      = optional opaque continuation bound to Project + filter + ordering
nextPageToken  = optional opaque continuation
```

The exact filter is applied server-side before pagination. Results are ordered by `attemptedAt DESC`, then `effectAttemptId DESC`. No generic filter/sort/status/provider/date query language was admitted.

## 3. EffectAttempt projection

The list projection closes only audit-useful identity/provenance:

```text
effectAttemptId
originatingOperationId
originatingRun?       = owner-issued kind/ref when applicable
effectIdentity        = opaque Gateway semantic effect/replay identity
outcome               = owner-issued Gateway truth
attemptedAt
```

The exact detail adds only the bounded provenance needed by the accepted operation:

```text
projectId
effectSubjectDigest
receipt?              = recordedAt + safe externalReference? + evidenceRefs
reconciliation?       = owner-issued state + observedAt + evidenceRefs
evidenceRefs
```

Raw provider request/response payloads, credentials, claim/resume tokens, caller idempotency controls and effect mutation fields are absent.

## 4. `OUTCOME_UNKNOWN` law

4B deliberately does not invent a universal closed Gateway outcome enum from conceptual architecture language. `outcome` remains owner-issued, but its executable contract explicitly preserves:

```text
possible external acceptance + ambiguous response
→ OUTCOME_UNKNOWN
→ reconciliation / Evidence
-X-> false FAILED
-X-> false SUCCESS
-X-> blind replay
```

This keeps Gateway truth independent from runtime completion. In particular:

```text
AgentRun COMPLETED
!= every external effect succeeded
```

and a successful/finished runtime cannot overwrite an unresolved Gateway effect fact.

## 5. Executable negative controls

`scripts/check-wire-gateway.mjs` rejects, among other drift:

```text
GW method/path changes
non-SCHEMA_CLOSED GW rows
request bodies on GW reads
If-Match / Idempotency-Key on GW inspection
invented collection filters beyond pageToken + exact originatingRun
incomplete originatingRun or continuation-token/filter mismatch without 422
universal outcome/reconciliation enums
loss of explicit OUTCOME_UNKNOWN semantics
raw provider payload/credential exposure
retry/replay/execute/resume/reconcile/resolve/mark/set-effect Product commands
caller-visible claim/resume/idempotency control tokens
```

## 6. TDD proof

RED was opened before the Gateway schema existed:

```text
Verify #321 = FAILURE
Error: GW-01 is not SCHEMA_CLOSED
```

All already-closed owner gates reached that exact failure first.

Minimal GREEN then added `gateway-paths.yaml` and changed only the two canonical Gateway `$ref` targets:

```text
Verify #323 = SUCCESS
Gateway = 2 / 2
fixed 4A↔OAS = 111 / 111
schema-closed = 103 / 111
missing / extra / duplicate = 0
literal IF_MATCH = { PRJ-12, PAR-14 }
Budget Analyzer positive + negative proof = green
```

## 7. Closure result

```text
Gateway Product inspection = CLOSED
Gateway Product operations = exactly 2
Product effect-control operations added = 0
schema-closed total = 103 / 111
```

The next bounded owner slice is Managed Application Runtime only:

```text
MAR-01 ListManagedJobRuns
MAR-02 GetManagedJobRun
MAR-03 RunManagedJobNow
```

This Evidence does not begin MAR, 4C, runtime/Paved Road selection, persistence design or Product implementation.
