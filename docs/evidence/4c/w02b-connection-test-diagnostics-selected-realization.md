# 4C-F10 — Connection test applicability and diagnostics selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED`
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

## 7. Proof target

Selected RED must fail while any of these remain absent:

```text
Connection.connectionTest
ConnectionDetail.connectionTest
stable five-state current-test vocabulary
ConnectionQualification credentialGeneration
ConnectionQualification outcome
testedAt
human diagnostic/remediation
CON-08 server-resolved credential generation semantics
CON-09 exact diagnostic read semantics
```

Then bounded 4A/4B recompile must restore whole-wire GREEN with:

```text
fixed Product operations = 113
fixed Product wire = 113 ↔ 113
Connections operations = 9
ordinary Permissions = 25
new durable records = 0
```