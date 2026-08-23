# 4C-F10 — Connection test applicability and diagnostics selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / GREEN`
> **Block:** `W-02B — Connections`
> **Selected alternative:** `F — preserve CON-08/09 and enrich qualification basis/result + current Connection test projection`.
> **Authority posture:** bounded Connections-owner recompile only; no Product implementation authority.

## 1. Operator decision

The operator accepted the F10 Global-Maximum candidate.

Selected semantic realization:

```text
CON-03 ListConnections
→ existing Connection[]
→ each Connection gains current derived connectionTest

CON-04 GetConnection
→ existing ConnectionDetail
→ carries the same current derived connectionTest

CON-07 SetConnectionCredential
→ remains write-only
→ successful credential replacement advances server-owned logical credential generation

CON-08 QualifyConnection
→ same Product operation
→ caller supplies connectionRevisionId + environment only
→ Connections resolves current logical credential generation server-side
→ returns enriched existing ConnectionQualification

CON-09 GetConnectionQualification
→ same exact qualification read
→ enriched exact basis + human diagnostic/remediation + Evidence
```

## 2. Exact wire properties

### Connection test summary

`Connection.connectionTest` and `ConnectionDetail.connectionTest`:

```text
state = NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
qualificationId? = exact qualification subject when a prior/current test exists
environment?     = exact tested environment
testedAt?        = server-owned test timestamp
```

The projection is derived. It is not a new durable record.

### ConnectionQualification

Existing detail gains:

```text
credentialGeneration = nullable non-secret logical credential-generation coordinate resolved by Connections
outcome              = PASSED | FAILED | INDETERMINATE
testedAt             = server-owned date-time
diagnostic           = human-readable exact-result projection
```

Diagnostic shape:

```text
title       = nonblank human label
message     = nonblank human explanation
remediation = optional nonblank corrective guidance
```

Existing `qualificationState` + `evidenceRefs` remain.

## 3. Applicability law

```text
latest available qualification basis
+ current ConnectionRevision
+ current logical credential generation
→ Connections derives connectionTest
```

Exact current match:

```text
outcome PASSED        → connectionTest PASSED
outcome FAILED        → connectionTest FAILED
outcome INDETERMINATE → connectionTest INDETERMINATE
```

No qualification:

```text
→ NOT_TESTED
```

Prior qualification but revision and/or logical credential generation changed:

```text
→ NEEDS_RETEST
```

Old Evidence is preserved; only current applicability changes.

## 4. Credential-generation boundary

`credentialGeneration` is a non-secret logical coordinate only.

```text
credentialGeneration -X-> credential bytes
credentialGeneration -X-> crypto key version
credentialGeneration -X-> transient provider access token
```

The browser never submits or chooses it for `CON-08`.

## 5. Human UX mapping

Backend operation names remain unchanged.

```text
CON-08 QualifyConnection → UI label: Test connection
CON-09 qualification detail → UI: Test result / View problem
```

Allowed card/detail wording:

```text
Not tested
Needs retest
Last test passed
Last test failed
Test result indeterminate
```

Forbidden inference:

```text
Active / Inactive
Connected
Ready
Healthy
Authorized
Project bound
```

## 6. Negative laws

Selected realization forbids:

```text
new TestConnection operation
new ConnectionHealth owner/domain
new durable current-test record
qualification history/list API
frontend evidenceRefs parsing as diagnostic authority
credential secret/token fields in any read
caller-supplied credentialGeneration
qualification pass becoming runtime-health/authorization/binding truth
```

## 7. Proof chronology

Historical selected state before the recompile:

```text
OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED
```

Executable proof:

```text
Verify #674 = EXPECTED RED
→ 78 tests / 77 pass / 1 fail
→ exact failure: lightweight Connection lacked connectionTest

Verify #677 = intermediate expected failure
→ F10 4A + wire + checker reached 4C projection stage
→ one historical F04 text guard required additive-safe repair
→ W-02 preflight had not yet projected F10 GREEN

Verify #680 = SUCCESS
→ bounded F10 recompile is whole-wire GREEN
→ fixed Product wire remains 113 ↔ 113
→ Connections remains 9 operations
→ ordinary Permissions remain 25
→ durable record inventory unchanged
```

## 8. Result

```text
F10 = OPERATOR ACCEPTED / GREEN
fixed Product operations = 113
fixed Product wire = 113 ↔ 113
Connections operations = 9
ordinary Permissions = 25
new durable records = 0
```

The next work is interaction-only recompilation of the W-02B P8: card-based browse, human-first labels, Sankhya API fixture, Test connection and exact failure troubleshooting. W-02B remains NOT LOCKED until operator re-walkthrough.