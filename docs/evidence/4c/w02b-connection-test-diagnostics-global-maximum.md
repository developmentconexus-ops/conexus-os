# 4C-F10 — Connection test applicability and diagnostics Global Maximum

> **Status:** `GLOBAL MAXIMUM / OPERATOR ACCEPTED`
> **Block:** `W-02B — Connections`
> **Finding:** `w02b-connection-test-diagnostics-finding.md`

## 1. Decision problem

Provide a user-friendly answer to “does this Connection work now, and if not why?” while preserving:

```text
configured != qualified != bound != healthy != caller-authorized
write-only credential semantics
exact revision/environment qualification
no browser authority
no generic runtime-health owner drift
```

## 2. Credible alternatives

### A — UI-only status from browser-local qualification history

Reject.

```text
CON-08 result
→ browser remembers last test
→ card renders pass/fail
```

Refresh/other-device re-entry loses truth, and credential/config changes can leave a stale pass looking current.

### B — Treat credentialConfigured as connection health

Reject. Presence of secret material proves neither provider acceptance nor current usability.

### C — Create a new `TestConnection` Product operation

Reject. `CON-08 QualifyConnection` already owns the exact real provider/source proof job. A second operation would duplicate semantics for UI naming convenience.

### D — Create generic Connection health/Active lifecycle

Reject. This collapses qualification, binding, Gateway health and authorization into one false state and introduces an owner/domain broader than the human job.

### E — Add qualification history/list APIs now

Defer. The current consumer needs one current/applicability projection and one exact diagnostic detail, not generic browsing/history/pagination.

### F — Keep CON-08/09; enrich qualification basis/result and derive a small current Connection test projection

**Selected Global Maximum.**

```text
CON-08 QualifyConnection
→ same operation
→ qualification binds exact current logical credential generation server-side
→ returns existing ConnectionQualification with exact basis/result semantics

CON-09 GetConnectionQualification
→ same exact detail read
→ returns human-readable diagnostic/remediation + Evidence

CON-03 / CON-04
→ expose small derived `connectionTest` projection
→ never a new durable owner/record
```

## 3. Selected current-test semantics

The current Connection projection uses exactly five human-safe states:

```text
NOT_TESTED
NEEDS_RETEST
PASSED
FAILED
INDETERMINATE
```

Meaning:

```text
NOT_TESTED
= no prior qualification is available for the Connection

NEEDS_RETEST
= prior qualification exists but its exact configuration revision and/or logical credential generation no longer match current Connection truth

PASSED | FAILED | INDETERMINATE
= the projected qualification basis still matches current Connection revision + logical credential generation
```

This is **test applicability**, not Connection lifecycle.

## 4. Existing durable owner reused

No new durable record is admitted.

Existing:

```text
con.connection
con.connection_revision
con.connection_qualification
```

`connection_qualification` gains only missing result/basis properties required by the already-real human consumer.

## 5. Exact qualification basis

The server records on the qualification result:

```text
connectionRevisionId
credentialGeneration   // nullable when no logical credential generation applies
environment
testedAt
```

The caller continues to supply only:

```text
connectionRevisionId
environment
```

The caller never selects `credentialGeneration`. Connections resolves it from current logical Connection credential truth at qualification admission.

## 6. Human outcome and diagnostic

The exact qualification detail additionally carries:

```text
outcome = PASSED | FAILED | INDETERMINATE

diagnostic
→ title
→ message
→ remediation (optional)
```

`qualificationState` may remain owner-specific detail. `outcome` is the stable Product presentation category and does not attempt to freeze every provider/qualification internal state.

`evidenceRefs` remain exact technical provenance and are not parsed by the frontend to invent the diagnostic.

## 7. Current Connection projection

`Connection` and `ConnectionDetail` gain one small read projection:

```text
connectionTest
→ state = NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
→ qualificationId?    // exact subject when one is relevant
→ environment?
→ testedAt?
```

It is derived by Connections from current Connection truth + existing qualification records. It is not a new durable record and it does not expose credential material.

## 8. UI consequence

Allowed human copy:

```text
Not tested
Needs retest
Last test passed
Last test failed
Test result indeterminate
Test connection
View problem
```

Forbidden as an inference from this projection:

```text
Active
Inactive
Connected
Ready
Healthy
Authorized
Project bound
```

## 9. YAGNI boundary

Not admitted by F10:

```text
new Product operation
new Permission
new semantic owner
new durable record
qualification history/list/pagination
provider-generic health service
background continuous monitoring
Active/Inactive lifecycle
automatic retry
credential readback
raw provider DTO mirroring
```

## 10. Topology result

```text
fixed Product operations = 113
Connections operations   = 9
ordinary Permissions     = 25
new durable records      = 0
```

Operator disposition: **ACCEPT F10 candidate F**.