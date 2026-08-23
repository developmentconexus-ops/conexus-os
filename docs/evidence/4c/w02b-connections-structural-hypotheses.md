# 4C W-02B — Connections P7/P8 Structural Decision

> **Status:** `P7 OPERATOR APPROVED / P8 CONTEXT-PANEL CANDIDATE / OPERATOR RE-WALKTHROUGH / NOT LOCKED`
> **Block:** `W-02B — Connections`
> **Method:** Frontend Product Experience Planning Method v2.2 through the Conexus 4C profile.
> **Selected hypothesis:** `A — Connection-first browse → focused detail`, refined to a context-preserving Connection panel with inline maintenance.
> **Authority posture:** interaction Evidence only; no Product implementation or final visual-design authority.

Historical P7 marker preserved: `P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / NOT LOCKED`.

## 1. Structural decision

```text
exact current owner scope
→ Connections collection
→ recognize by Connection.name
→ select one Connection
→ focused contextual Connection panel
→ inspect / edit configuration inline
→ inspect / replace credentials inline
→ test / diagnose in the same Connection context
```

The logical Connection remains the primary human object. Provider is context, not identity. Hypothesis B (wizard-first) and C (provider-first) remain rejected as root architecture.

The operator's second P8 walkthrough did **not** falsify Connection-first structure. It falsified the navigation cost of expressing routine maintenance as repeated page/task round-trips.

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

Exact qualification carries:

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

## 4. Operator interaction finding and selected revision

The first P8 walkthrough had already accepted these local improvements:

```text
card-based Connection browse
human-first labels
Sankhya API distinct from Oracle Database
obvious Test connection
human failure diagnostic + remediation
Needs retest after configuration/credential change
technical coordinates behind collapsed Technical details
```

The second operator walkthrough returned `REVISE` on interaction efficiency:

```text
structure is sound
BUT
routine edit / credential / test work causes repeated enter → task screen → return loops
→ user loses collection context
→ maintenance feels heavier than the underlying task
```

Root-cause classification:

```text
Product meaning gap         = NO
4A operation gap            = NO
4B wire gap                 = NO
Permission/owner gap        = NO
interaction architecture    = YES
```

Alternatives considered:

```text
A. preserve separate detail/task views
   → rejected: preserves avoidable navigation round-trips

B. make Connection cards directly editable
   → rejected: overloads browse/comparison surface and increases accidental-edit risk

C. card browse + broad contextual Connection panel + inline maintenance
   → SELECTED / OPERATOR APPROVED FOR P8 REVISION
```

Selected interaction law:

```text
routine work on one Connection
→ preserve the Connections collection, search and browse context
→ open one contextual Connection panel
→ edit configuration inline
→ replace credentials inline
→ test and diagnose inline
→ close panel back to the unchanged collection context
```

The panel is a focused Connection detail surface, not a new semantic owner. The same accepted operations remain responsible for every material read/write.

## 5. Context-preserving P8 human model

```text
Connections
→ card grid
→ human Connection name + provider
→ credentials added/needed
→ Not tested | Needs retest | Last test passed | Last test failed | Indeterminate
→ Open | Test connection | View problem when relevant

Open
→ contextual Connection panel over the collection
→ Connection test first
→ Configuration read + inline Edit / Save / Cancel
→ Access read + inline Update credentials / Save / Cancel
→ Technical details collapsed

configuration save
→ panel stays open
→ current revision advances
→ Needs retest
→ “Connection updated. Test again”
→ Test connection remains in the same panel

credential save
→ secret remains write-only
→ panel stays open
→ logical credential generation advances server-side in Product semantics
→ Needs retest
→ “Credentials updated. Test again”
→ Test connection remains in the same panel

failure
→ View problem in the same panel
→ human diagnostic
→ remediation
→ exact qualification coordinates remain under Technical details
```

The fixture continues to distinguish:

```text
Sankhya API
→ API URL + Company
→ Client ID + Client secret credential input

Oracle Database
→ host + port + service
```

Those fixture fields prove UI distinction only; concrete connector auth/configuration realization remains later authority.

## 6. Client-state law

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
→ Connection panel open/close
→ inline editor expansion
→ expanded Technical details
```

No fifth state class is admitted. The panel does not create independent Product truth. No network/runtime or browser persistence mechanism is claimed by P8 Evidence.

## 7. Proof chronology

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

First user-friendly revision:

```text
Verify #683 = EXPECTED RED
→ 80 tests / 78 pass / 2 expected failures
Verify #684 = SUCCESS
→ operator re-walkthrough = REVISE on navigation/context switching
```

Context-preserving revision:

```text
Verify #687 = EXPECTED RED
→ 82 tests / 80 pass / 2 expected failures
→ missing contextual panel + inline maintenance

Verify #688 = SUCCESS
→ context-preserving P8 + existing repository/wire proof GREEN

candidate blob = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
```

Mechanical GREEN does not set `LOCKED`.

## 8. Out of block

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

## 9. Operator disposition

```text
Hypothesis A = OPERATOR APPROVED FOR FUNCTIONAL P8
context-preserving panel direction = OPERATOR APPROVED FOR P8 REVISION
W-02B = NOT LOCKED
P8 = NEXT
```

`P8 = NEXT` is the preserved historical P7 transition marker. The current gate is **operator walkthrough/adjudication of the new context-preserving P8 candidate**. Only the operator may later authorize `LOCKED`, after which P9/P10 may run.