# 4C W-02B — Connections P7 Structural Decision

> **Status:** `P7 OPERATOR APPROVED / P8 FUNCTIONAL CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED`
> **Block:** `W-02B — Connections`
> **Method:** Frontend Product Experience Planning Method v2.2 through the Conexus 4C profile.
> **Selected hypothesis:** `A — Connection-first browse → focused detail → explicit configuration / credential / qualification tasks`.
> **Authority posture:** interaction-structure Evidence only. This record does not create Connection Product meaning, operations, permissions, wire authority, Product implementation or final visual design.

Historical P7 marker preserved: `P7 OPERATOR APPROVED FOR FUNCTIONAL P8 / NOT LOCKED`.

## 1. Decision question

How should a human manage external-system relationships without collapsing logical Connection identity, non-secret configuration, write-only credential material, qualification Evidence, Project binding, runtime health and caller authorization into one false `Connected` lifecycle?

Current authority fixes:

```text
Connection = logical Connections-owned resource
Connection.name = provider-independent human presentation identity
Connection.ownerScope = WORKSPACE | PROJECT
currentRevisionId = exact current immutable revision coordinate
CON-04 detail = current non-secret configuration after 4C-F09
credentialConfigured = non-secret presence fact only
credential write = CON-07 write-only / no secret readback
qualification = exact ConnectionRevision + exact environment + provenance
configured != qualified != bound != healthy != caller-authorized
```

## 2. Compared hypotheses

### A — Connection-first browse + focused detail

**OPERATOR APPROVED FOR P8.**

```text
exact current owner scope
→ Connections collection
→ recognize by Connection.name
→ focused Connection detail
   ├── Connector / owner / current revision
   ├── current non-secret configuration
   ├── credential presence + explicit write-only update task
   └── qualification task/result for exact revision + environment
```

The logical Connection is the primary human object. Provider is metadata/filtering context, not the semantic owner.

### B — setup wizard first

```text
choose provider
→ configure
→ credential
→ qualify
→ done
```

**REJECTED as root architecture.** It implies a false single linear lifecycle and encourages `done ≈ connected ≈ ready`, contradicting the accepted truth-state separation. A bounded onboarding assistant may be reconsidered later inside Create Connection if a real operator-use finding proves it useful.

### C — provider-first tree

```text
provider
→ environment / connection instances
```

**REJECTED as primary mental model.** It displaces `Connection.name`, overweights provider identity and becomes fragile when multiple logical Connections share one provider but differ by purpose, owner scope or configuration.

## 3. Locked-for-P8 human structure

The P8 candidate must prove this structure without yet setting `LOCKED`:

```text
CONNECTIONS
→ browse exact current owner scope
→ Connection.name is primary recognition
→ open one exact Connection

CONNECTION DETAIL
→ Connector identity/version
→ owner scope
→ currentRevisionId
→ current non-secret configuration
→ credentialConfigured
→ explicit tasks

TASK: REVISE CONFIGURATION
→ initialize from exact CON-04 current configuration
→ FORM_DRAFT
→ CON-06 expectedCurrentRevisionId + complete new configuration
→ successful result creates new immutable revision
→ stale current revision cannot silently overwrite

TASK: UPDATE CREDENTIAL
→ provider-specific credential input from ConnectorDefinition credentialInputSchema
→ transient FORM_DRAFT only
→ CON-07 write-only ingress
→ clear secret input after submit
→ no plaintext/ciphertext/token/handle readback

TASK: QUALIFY
→ exact current ConnectionRevision
→ environment selected only from ConnectorDefinition environments
→ CON-08 creates exact qualification result
→ result can re-enter through exact qualificationId + CON-09
```

## 4. Collection / detail law

`CON-03 ListConnections` remains a lightweight collection read. P8 may locally filter only already-disclosed rows.

Allowed collection truth includes:

```text
Connection.name
connectorDefinitionId / connectorVersion
ownerScopeKind / ownerId
currentRevisionId
credentialConfigured
```

The collection must not invent:

```text
Connected
Ready
Healthy
Qualified
latest qualification
qualification history
Project-bound status
caller-authorized status
```

`CON-04 GetConnection` is the exact detail read and may display the current non-secret configuration bound to its exact `currentRevisionId` after F09.

## 5. Owner-scope law

The P8 must not fabricate an all-Workspace/all-Project aggregate. `CON-03` operates on one exact owner scope:

```text
WORKSPACE
→ reusable organizational Connection

PROJECT
→ private Project Connection
```

Workspace placement and Project Integrations placement may share future visual grammar only after repeated LOCKED Evidence. One P8 consumer does not graduate a reusable component/Product abstraction.

## 6. Credential law

Credential is not configuration metadata.

```text
credentialConfigured = SERVER non-secret presence fact
credential input      = transient FORM_DRAFT
credential bytes      = never readable Product truth
CON-07 success        = credential accepted/stored only
```

Forbidden P8 claims after credential submit:

```text
Connected
Qualified
Healthy
Ready
Authorized
```

## 7. Qualification law

Qualification is an exact proof subject, not a generic status badge.

```text
CON-08
→ exact connectionRevisionId
+ exact admitted environment
→ ConnectionQualification

CON-09
→ exact connectionId + qualificationId
→ exact qualification state + evidenceRefs
```

Current authority does not admit a latest-qualification relation, a qualification-history list or a closed qualification-state enum merely for UI convenience.

## 8. Client-state law

```text
SERVER
→ ConnectorDefinition
→ Connection collection/detail
→ current non-secret configuration
→ credentialConfigured
→ exact qualification result

URL_NAVIGATION
→ exact Connection / Connector / qualification subjects where re-entry is material

FORM_DRAFT
→ Create Connection name/configuration
→ revised configuration before CON-06
→ credential input before CON-07
→ qualification environment before CON-08

EPHEMERAL_UI
→ local filters
→ expanded panels
→ selected local task/tab
```

No fifth client-state class is admitted.

## 9. P8 proving interaction

The functional low-fi HTML must let the operator actually exercise at least:

```text
browse Connections by Connection.name
local filter over disclosed Connection rows
open exact Connection detail
inspect current non-secret configuration
enter Edit configuration with current values prefilled
save a new immutable fixture revision
simulate stale-revision conflict and recovery
open write-only credential task
submit credential and prove secret input is cleared / never readable
run qualification only after selecting an admitted ConnectorDefinition environment
inspect exact qualificationId / revision / environment / evidenceRefs
re-enter exact qualification within the fixture
create a new Connection from ConnectorDefinition-driven configuration fields
return to detail without a fake Connected/Ready/Healthy status
responsive navigation / keyboard-plausible controls
```

Fixture mutation is deterministic local Evidence only. It must not use `fetch`, `localStorage` or `sessionStorage`, and refresh must reset the demonstration state.

Functional candidate now exists at:

```text
docs/evidence/4c/w02b-connections-functional-wireframe.html
```

Proof chronology:

```text
Verify #663 = EXPECTED RED
→ P7 Evidence green
→ 2 P8 tests failed only because HTML did not exist

Verify #664 = intermediate test-harness mismatch
→ functional structure passed
→ one capitalization-only stale-revision guard mismatch

Verify #665 = SUCCESS
→ P8 repository contract + whole wire green
```

Mechanical GREEN does not set `LOCKED`.

## 10. Out of block / forbidden inference

W-02B does not decide:

```text
ProjectConnectionBinding UI semantics beyond preserving it as separate Project owner truth
runtime Gateway health/effect admission
caller authorization
Connection rename/delete/rollback
revision history browser
qualification history / latestQualification
final brand / typography / spacing / iconography
final SDK/query/cache abstractions
Product implementation
```

## 11. Operator disposition

```text
Hypothesis A = OPERATOR APPROVED FOR FUNCTIONAL P8
W-02B = NOT LOCKED
P8 = NEXT
```

`P8 = NEXT` above is the preserved P7 transition law. The candidate now exists and the current gate is operator walkthrough/adjudication.

Only the operator may later set W-02B `LOCKED` after operating and adjudicating the functional P8 candidate.