# 4C W-02 — Workspace Brain + Connections Authority/Data Feasibility

> **Status:** `W-02 / v2.2 P7/P8 FEASIBILITY / GREEN AFTER F04+F05+F06+F09+F10 RECOMPILE`
> **Inherited baseline:** `GF-01 H1-R2 = LOCKED`; `W-01 C1-R1 = LOCKED`; `W-02A Brain = LOCKED`; fixed Product/wire topology `113↔113`; 25 ordinary Permissions.
> **Scope:** Workspace Brain and Workspace/Project-scoped Connections human work only. No Product implementation, 4D mechanism, SDK/runtime or final visual design is admitted here.

## 1. Decision question

Can current Product/wire authority supply the fields, identity, preview/content truth, test diagnostics and material writes needed for honest W-02 functional P8 interaction without inventing an aggregate Settings owner, exposing secrets, conflating proposal/publication, or flattening Connection qualification/binding/health/authorization?

Under frontend method v2.2, every material P7/P8 requirement must be `PRESENT-IN-AUTHORITY` or a `FINDING` before P8 LOCK.

## 2. Split decision

```text
W-02A — Workspace Brain
W-02B — Connections
W-02 split = REQUIRED
generic Workspace Settings = REJECTED
```

Brain and Connections remain separate because their human decisions, trust boundaries and failure semantics differ materially. A generic Workspace Settings editor is still rejected: it would flatten Brain semantic review/publication and Connection credential/qualification work into one false mutation domain.

Initial operation/Permission/owner/trust topology was sound. Later P7/P8/P9 work validly exposed bounded property/input/read-shape gaps inside those already-correct owners; F04–F07, F09 and F10 therefore recompiled only the affected semantics without replacing the Brain/Connections owner topology. F08 was interaction-only.

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact review-content inspectability = OPERATOR ACCEPTED / GREEN
F09 Connection current non-secret configuration = OPERATOR ACCEPTED / GREEN
F10 Connection test applicability + diagnostics = OPERATOR ACCEPTED / GREEN
```

## 3. W-02A — Workspace Brain — LOCKED

Human-facing operations:

```text
BRN-01 GetWorkspaceBrain
BRN-02 ListBrainRevisions
BRN-03 GetBrainRevision
BRN-04 StartBrainDiscovery
BRN-05 ListKnowledgeProposals
BRN-06 GetKnowledgeProposal
BRN-07 SubmitKnowledgeProposal
BRN-08 DecideKnowledgeProposal
BRN-09 PublishBrainRevision
BRN-10 GetBrainHealth
```

Permissions:

```text
brain.read
brain.propose
brain.discover
brain.review
brain.publish
```

Explicit out-of-block dispositions:

```text
BRN-11 RunBrainHealthProbe = NOT-HUMAN-FACING / SYSTEM_OWNER_TRANSITION
BRN-12 RunAnalyticQuery = P-02 / NOT W-02
```

Binding laws:

```text
machine hypothesis != KnowledgeProposal
proposal != reviewed meaning != published Brain revision
BRN-04 Discovery = read-only hypothesis/provenance work
BRN-08 = exact proposalRevision review decision
BRN-09 = exact candidateSourceRevision publication
reviewText != source/decision identity
```

Health remains:

```text
UNVERIFIED | VALID | SUSPECT | INVALID | CHECK_ERROR
```

### Brain bounded corrections now inherited GREEN

```text
F05 → Discovery-backed explicit human resolution reaches the same KnowledgeProposal owner
F06 → exact Brain revision/proposal detail exposes nonblank source-bound reviewText
F07 → BRN-03 exact revision detail exposes structured source-bound knowledgeBrowse
F08 → Discovery makes PRJ-01 Project context explicit before BRN-04 without backend change
```

W-02A is operator LOCKED through its exact Screen Contract and P10. This preflight preserves that result rather than reopening Brain by symmetry while Connections proceeds.

## 4. W-02B — Connections

Human-facing operations:

```text
CON-01 ListConnectorDefinitions
CON-02 GetConnectorDefinition
CON-03 ListConnections
CON-04 GetConnection
CON-05 CreateConnection
CON-06 ReviseConnection
CON-07 SetConnectionCredential
CON-08 QualifyConnection       ← human UX: Test connection
CON-09 GetConnectionQualification ← human UX: Test result / View problem
```

Permissions:

```text
connection.read
connection.manage
connection.qualify
connection.use
```

Binding state law:

```text
configured != qualified != bound != healthy != caller-authorized
```

Credential boundary:

```text
credential write = write-only / no secret readback
logical credential generation = non-secret server-owned coordinate only
```

### F04 — human Connection identity — GREEN

```text
Connection.name
→ creation-time provider-independent human identity
→ canonical Connection read projection
→ stable across ConnectionRevision changes
→ no rename authority in current F1
```

Connections remain 9 operations; Permission/trust topology is unchanged.

### F09 — current non-secret configuration — GREEN

P7 revalidation falsified the previous preflight assumption that current configuration values were already inspectable. The operator-accepted bounded correction keeps:

```text
CON-03 → lightweight Connection[]
CON-04 → ConnectionDetail + exact currentRevisionId-bound current non-secret configuration
CON-05 → lightweight Connection
CON-07 → write-only secret ingress
```

Protected negative laws:

```text
configuration -X-> credential material
configuration presence -X-> qualification
credentialConfigured -X-> qualification
configuration -X-> binding / health / authorization
```

### F10 — current test applicability + human diagnostics — GREEN

The first functional P8 walkthrough proved that raw qualification coordinates/Evidence were not enough for the human job “does this Connection work now, and if not why?”. The accepted bounded correction preserves `CON-08/09` and the existing `ConnectionQualification` durable owner.

```text
CON-03 / CON-04
→ Connections-derived connectionTest
→ NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE

CON-08 QualifyConnection
→ caller still supplies exact connectionRevisionId + environment only
→ Connections resolves current logical credential generation server-side
→ existing ConnectionQualification binds revision + credential generation + environment + testedAt

CON-09 GetConnectionQualification
→ exact qualificationState + outcome + diagnostic/remediation + evidenceRefs
```

Applicability law:

```text
no prior qualification
→ NOT_TESTED

prior qualification + current revision/credential-generation mismatch
→ NEEDS_RETEST

exact current basis
→ PASSED | FAILED | INDETERMINATE from exact qualification outcome
```

Changing non-secret configuration or replacing credential does not delete old Evidence. It makes that older basis non-current.

Protected negative laws:

```text
connectionTest -X-> Active / Inactive lifecycle
qualification passed -X-> Connected / Ready / Healthy
qualification passed -X-> Project binding
qualification passed -X-> caller authorization
frontend evidenceRefs parsing -X-> diagnostic authority
credentialGeneration -X-> secret/token readback
```

No new `TestConnection`, ConnectionHealth owner, qualification-history/list API, Permission, durable record or background monitor is admitted.

## 5. v2.2 feasibility matrix

| Requirement | W-02A Brain | W-02B Connections | Status |
| --- | --- | --- | --- |
| fields/summaries | locked Brain overview/revision/proposal/discovery/health fields | connector/Connection/config/credential-presence/current-test/qualification fields | PRESENT-IN-AUTHORITY |
| identity sources | Workspace, revision, proposal, candidate source exact; reviewText/projection coordinates non-authoritative | ConnectorDefinition + Connection.name + exact currentRevisionId/qualification subjects | PRESENT-IN-AUTHORITY |
| pagination/scale | locked block; no speculative new mechanism | no unproved scale-driven new mechanism; P8 may use bounded fixtures | PRESENT-IN-AUTHORITY for current F1 / scale assumption remains bounded |
| sort/filter | locked local findability only over disclosed truth | local filtering/card layout may be EPHEMERAL_UI; no new Product write authority | PRESENT-IN-AUTHORITY |
| preview/content truth | F06/F07 supply exact source-bound human meaning/browse | F09 supplies current non-secret config; F10 supplies current test applicability + exact human diagnostic/remediation; secrets never readable | PRESENT-IN-AUTHORITY |
| material writes | locked BRN-04/07/08/09 owner operations | CON-05/06/07/08 exact owner operations | PRESENT-IN-AUTHORITY |

Any P8 need outside this matrix becomes a new `FINDING`; it is not permission to fabricate fixture-only Product truth.

## 6. Surface / owner fit

```text
WS-S04 Brain overview              → BRN-01/02/03/10
WS-S05 Brain discovery/proposals   → BRN-04/05/06/07/08/09

WS-S06 Connections browse/detail   → CON-01/02/03/04/09
WS-S07 Connection create/revise    → CON-05/06
WS-S08 credential entry            → CON-07
WS-S09 test/qualification          → CON-08
```

Project Brain/Connection bindings remain P-02 responsibilities. Workspace placement never changes semantic ownership.

## 7. Client-state boundaries

```text
SERVER
→ Brain/revision/reviewText/proposal/health truth
→ Connection / Connection.name / current non-secret configuration
→ credentialConfigured / connectionTest / exact qualification + diagnostic truth

URL_NAVIGATION
→ exact revision/proposal/Connection/Connector/qualification subjects when route identity is material

FORM_DRAFT
→ Connection name/configuration draft
→ credential input before submit
→ qualification environment before CON-08

EPHEMERAL_UI
→ tabs/filtering/cards/expanded technical detail/local selection
```

Credential input remains transient. Current configuration becomes a form draft only after server truth initializes an explicit revise interaction; browser draft never replaces `currentRevisionId` or successful `CON-06` truth. Browser state never decides whether a qualification remains current.

## 8. Structural study / P8 boundary

```text
reference study = TRIGGERED
```

W-02A is locked. W-02B must present connector, logical Connection, configuration, access/credential and test result in human language while keeping the technical subjects available only where useful for troubleshooting/proof.

Explicitly avoid:

```text
universal resource/settings workbench
secret readback
generic Connected / Active / Healthy badge
frontend-derived test applicability
qualification history browser without a real consumer
revision-history/rollback UI without a real consumer
4D SDK/runtime/package decisions
```

## 9. Current result

```text
F04 = OPERATOR ACCEPTED / GREEN
F05 = OPERATOR ACCEPTED / GREEN
F06 = OPERATOR ACCEPTED / GREEN
F07 = OPERATOR ACCEPTED / GREEN
F08 = OPERATOR ACCEPTED / GREEN / INTERACTION-ONLY
F09 = OPERATOR ACCEPTED / GREEN
F10 = OPERATOR ACCEPTED / GREEN
fixed Product operations = 113
fixed Product wire       = 113 ↔ 113
Brain operations         = 11
Connections operations   = 9
ordinary Permissions     = 25
new semantic owner       = 0
new durable record       = 0
```

W-02A is LOCKED. W-02B must now revise its functional P8 from the operator walkthrough: card-based browse, human-first labels, Sankhya API fixture rather than Oracle-like database configuration, `Test connection`, current test applicability and failure diagnostics. The revised P8 still requires operator re-walkthrough and is **not LOCKED**.