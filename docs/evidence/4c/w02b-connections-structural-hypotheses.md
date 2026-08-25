# 4C W-02B — Connections P7/P8 Structural Decision

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED
> **Block:** `W-02B — Connections`
> **Method:** Frontend Product Experience Planning Method v2.2 through the Conexus 4C profile.
> **Selected hypothesis:** `A — Connection-first browse → focused detail`, refined and locked as `Connection-first browse → contextual Connection panel` with inline maintenance.
> **Authority posture:** interaction authority only; no Product implementation or final visual-design authority.

Historical P7 marker preserved: `P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / NOT LOCKED`.
Historical P7 selected wording preserved: `A — Connection-first browse → focused detail`.

## 1. Locked structural decision

```text
exact current owner scope
→ Connections collection
→ recognize by Connection.name
→ select one Connection
→ contextual Connection panel over the collection
→ inspect / edit configuration inline
→ inspect / replace credentials inline
→ test / diagnose in the same Connection context
→ close back to the unchanged collection context
```

The logical Connection remains the primary human object. Provider is context, not identity. Hypothesis B (wizard-first) and C (provider-first) remain rejected as root architecture.

The operator's second P8 walkthrough did **not** falsify Connection-first structure. It falsified the navigation cost of expressing routine maintenance as repeated page/task round-trips. The exact context-preserving candidate blob was then operated and explicitly approved by the operator.

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

No generic lifecycle/health or caller-authorization status is inferred from Connection configuration or qualification.

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
   → SELECTED / OPERATOR APPROVED
```

Locked interaction law:

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

## 5. Locked P8 human model

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

approved candidate blob = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
→ operator walkthrough = APPROVED
```

The approved HTML snapshot remains unchanged after lock. P9/P10 authority is recorded separately in [the locked Screen Contract](w02b-connections-screen-contract.md).

## 8. Out of block

```text
ProjectConnectionBinding UI semantics
runtime health monitoring
Active/Inactive lifecycle
Connection rename/delete/rollback
revision-history browser
qualification-result list/history/pagination
background monitoring
automatic retry
final visual design
4D SDK/runtime realization
Product implementation
```

## 9. Operator disposition

Historical transition markers are intentionally retained for chronology and old proof guards:

```text
W-02B = NOT LOCKED
P8 = NEXT
```

Current binding disposition is:

```text
Hypothesis A = LOCKED
context-preserving panel direction = LOCKED / OPERATOR APPROVED
W-02B = LOCKED / OPERATOR APPROVED
approved P8 blob = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
P9 exact Screen Contract = CLOSED
P10 graduated shared patterns = 0
P11 = LATER ASSEMBLED PRODUCT
```

Only a later material falsifier may reopen the smallest affected W-02B scope. The next material block is `W-03 — People/access + audit`; no 4D or Product implementation authority is implied.