# 4C W-02B — Connections P7/P8 Structural Decision

> **Status:** `P7 OPERATOR APPROVED / P8 REVISED CANDIDATE / OPERATOR RE-WALKTHROUGH / NOT LOCKED`
> **Block:** `W-02B — Connections`
> **Method:** Frontend Product Experience Planning Method v2.2 through the Conexus 4C profile.
> **Selected hypothesis:** `A — Connection-first browse → focused detail → explicit configuration / credential / qualification tasks`.
> **Authority posture:** interaction Evidence only; no Product implementation or final visual-design authority.

Historical P7 marker preserved: `P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / NOT LOCKED`.

## 1. Structural decision

```text
exact current owner scope
→ Connections collection
→ recognize by Connection.name
→ focused Connection detail
→ separate configuration / access credential / connection-test tasks
```

The logical Connection is the primary human object. Provider is context, not identity. Hypothesis B (wizard-first) and C (provider-first) remain rejected as root architecture.

Binding law remains:

```text
configured != qualified != bound != healthy != caller-authorized
```

Credential law remains:

```text
credential write = CON-07 write-only / no secret readback
```

## 2. Exact owner boundaries

```text
Connection.name
→ provider-independent human identity

CON-04
→ exact current non-secret configuration

CON-07
→ write-only credential replacement

CON-08 QualifyConnection
→ human UX label: Test connection

CON-09
→ exact test result + human diagnostic/remediation + Evidence

ProjectConnectionBinding
→ separate Project owner truth

Gateway/runtime health
→ separate runtime truth
```

No generic `Connected`, `Active`, `Ready`, `Healthy` or caller-authorization status is inferred.

## 3. F09 + F10 consequences

F09 makes current non-secret configuration inspectable after refresh/re-entry.

F10 makes current test applicability honest:

```text
NOT_TESTED
NEEDS_RETEST
PASSED
FAILED
INDETERMINATE
```

A previous test becomes `NEEDS_RETEST` when either current configuration revision or server-owned logical credential generation changes. Old qualification Evidence remains durable.

Exact qualification now carries:

```text
connectionRevisionId
credentialGeneration
environment
testedAt
qualificationState
outcome
diagnostic.title
diagnostic.message
diagnostic.remediation?
evidenceRefs
```

The browser never chooses credential generation and never parses raw Evidence into diagnostic authority.

## 4. Revised P8 human model

The operator's first P8 walkthrough returned `REVISE` with these accepted observations:

```text
browse should feel like modern cards, not infrastructure rows
technical identifiers should not dominate normal use
Sankhya must be represented as an API connector, not Oracle DB configuration
Test connection must be obvious
failure must explain what happened and what to fix
configuration/credential change must visibly require retest
```

The revised candidate therefore proves:

```text
Connections
→ card grid
→ human Connection name + provider
→ credentials added/needed
→ Not tested | Needs retest | Last test passed | Last test failed | Indeterminate
→ Open | Test connection | View problem when relevant

Connection detail
→ Connection test first
→ human Configuration
→ human Access / credentials
→ Technical details collapsed

Failure
→ human diagnostic
→ remediation
→ Update credentials / Test again
→ exact qualification coordinates remain under Technical details
```

The fixture now distinguishes:

```text
Sankhya API
→ API URL + Company
→ Client ID + Client secret credential input

Oracle Database
→ host + port + service
```

Those fixture fields prove the UI distinction only; concrete connector auth/configuration realization remains later authority.

## 5. Client-state law

```text
SERVER
→ ConnectorDefinition
→ Connection collection/detail
→ configuration
→ credentialConfigured
→ connectionTest
→ exact qualification + diagnostic

URL_NAVIGATION
→ exact Connection / qualification subjects where re-entry is material

FORM_DRAFT
→ create/revise configuration
→ write-only credential input
→ test environment

EPHEMERAL_UI
→ local filtering
→ card interaction
→ expanded Technical details
```

No fifth state class is admitted. No `fetch`, `localStorage` or `sessionStorage` is used by P8 Evidence.

## 6. Proof chronology

First P8:

```text
Verify #663 = EXPECTED RED before HTML
Verify #665 = SUCCESS
→ operator walkthrough = REVISE
```

F10:

```text
Verify #674 = EXPECTED RED
→ lightweight Connection lacked connectionTest
Verify #680 = SUCCESS
→ 113↔113 / Connections=9 / Permissions=25
```

User-friendly revised P8:

```text
Verify #683 = EXPECTED RED
→ 80 tests / 78 pass / 2 fail
→ only card-grid + actionable failure/retest revision absent

Verify #684 = SUCCESS
→ revised HTML satisfies repository + whole-wire proof
```

Revised functional candidate:

```text
docs/evidence/4c/w02b-connections-functional-wireframe.html
blob = 99dc5b1413e0ad0ae79727ce857340b9cc9178bf
```

Mechanical GREEN does not set `LOCKED`.

## 7. Out of block

```text
ProjectConnectionBinding UI semantics
runtime health monitoring
Active/Inactive lifecycle
Connection rename/delete/rollback
revision history browser
qualification history/list/pagination
background monitoring
automatic retry
final visual design
4D SDK/runtime realization
Product implementation
```

## 8. Operator disposition

```text
Hypothesis A = OPERATOR APPROVED FOR FUNCTIONAL P8
W-02B = NOT LOCKED
P8 = NEXT
```

`P8 = NEXT` is the preserved historical P7 transition marker. The current gate is **operator re-walkthrough of the revised P8**. Only the operator may later authorize `LOCKED`, after which P9/P10 may run.