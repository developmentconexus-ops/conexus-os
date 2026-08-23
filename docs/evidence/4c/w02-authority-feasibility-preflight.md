# 4C W-02 — Workspace Brain + Connections Authority/Data Feasibility

> **Status:** `W-02 / v2.2 P7 FEASIBILITY / GREEN AFTER F04+F05+F06 RECOMPILE`
> **Inherited baseline:** `GF-01 H1-R2 = LOCKED`; `W-01 C1-R1 = LOCKED`; fixed Product/wire topology `113↔113`; 25 ordinary Permissions.
> **Scope:** Workspace Brain and Workspace/Project-scoped Connections human work only. No Product implementation, 4D mechanism, SDK/runtime or final visual design is admitted here.

## 1. Decision question

Can current Product/wire authority supply the fields, identity, preview/content truth and material writes needed for honest W-02 functional P8 interaction without inventing an aggregate Settings owner, exposing secrets, conflating proposal/publication, or flattening Connection qualification/binding/authorization?

Under frontend method v2.2, every material P7 requirement must be `PRESENT-IN-AUTHORITY` or a `FINDING` before P8 LOCK.

## 2. Split decision

```text
W-02A — Workspace Brain
W-02B — Connections
W-02 split = REQUIRED
generic Workspace Settings = REJECTED
```

Brain and Connections remain separate because their human decisions, trust boundaries and failure semantics differ materially. A generic Workspace Settings editor is still rejected: it would flatten Brain semantic review/publication and Connection credential/qualification work into one false mutation domain.

Initial operation/Permission/owner/trust topology was sound. Later P7/reference work validly exposed bounded property/input/read-shape gaps inside those already-correct owners; F04–F06 therefore recompiled the affected semantics without replacing the Brain/Connections owner topology.

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
F06 Brain exact review-content inspectability = OPERATOR ACCEPTED / GREEN
```

## 3. W-02A — Workspace Brain

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

### F05 — Discovery-backed human resolution — GREEN

Operator-accepted `BRN-07` has two mutually exclusive forms:

```text
SOURCE_BACKED
candidateSourceRevision + provenanceRefs

DISCOVERY_BACKED
discoveryCandidateRef + nonblank humanResolution
→ Brain re-resolves Discovery provenance/context
→ Brain materializes candidateSourceRevision
→ same durable KnowledgeProposal
```

No intermediate resolve operation, BrainDraft, DiscoverySession, new Permission, owner or durable record is admitted.

### F06 — exact review-content inspectability — GREEN

P7 `preview/content truth` initially failed:

```text
BRN-03/06 had exact IDs/state/provenance
but no caller-readable exact-source meaning
```

The operator accepted `CURRENT STRUCTURE CONFIRMED`. Current exact detail reads now provide:

```text
BRN-03 BrainRevision
→ sourceRevision + nonblank reviewText

BRN-06 KnowledgeProposal
→ candidateSourceRevision + nonblank reviewText
```

`reviewText` is a deterministic Brain-owned human-readable projection of the exact named source revision. It survives refresh/re-entry and does not require browser-local Discovery state, Workspace Brain Git access or Builder source reads.

Protected negative laws:

```text
reviewText -X-> canonical Brain source
reviewText -X-> proposalRevision/candidateSourceRevision identity
reviewText -X-> BRN-08 decision input
reviewText -X-> BRN-09 publication input
DOM / generated anchor -X-> Brain authority
```

Rich rendering/sectioning/diff remains P8/4D mechanism unless a new semantic truth requirement is proven.

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
CON-08 QualifyConnection
CON-09 GetConnectionQualification
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

Qualification remains exact-subject truth. Current authority does **not** justify `latest qualification`, a qualification-history browser or a generic `Connected` badge merely for UI convenience.

## 5. v2.2 P7 feasibility matrix

| Requirement | W-02A Brain | W-02B Connections | Status |
| --- | --- | --- | --- |
| fields/summaries | overview/revision/proposal/discovery/health fields present | connector/connection/config/credential/qualification fields present | PRESENT-IN-AUTHORITY |
| identity sources | Workspace, revision, proposal, candidate source exact; reviewText non-authoritative | ConnectorDefinition + Connection.name + exact revision/qualification subjects | PRESENT-IN-AUTHORITY |
| pagination/scale | no unproved scale-driven new mechanism admitted; P8 may use bounded fixtures | same; no speculative pagination API | PRESENT-IN-AUTHORITY for current F1 / scale assumption remains bounded |
| sort/filter | no Product truth requires new sort/filter write authority; local view filtering may be EPHEMERAL_UI | same | PRESENT-IN-AUTHORITY for current block |
| preview/content truth | F06 reviewText supplies exact source-bound human meaning | Connection configuration/qualification projections already available; secrets never readable | PRESENT-IN-AUTHORITY |
| material writes | BRN-04/07/08/09 exact owner operations | CON-05/06/07/08 exact owner operations | PRESENT-IN-AUTHORITY |

Any P8 need outside this matrix becomes a new `FINDING`; it is not permission to fabricate fixture-only Product truth.

## 6. Surface / owner fit

```text
WS-S04 Brain overview              → BRN-01/02/03/10
WS-S05 Brain discovery/proposals   → BRN-04/05/06/07/08/09

WS-S06 Connections browse/detail   → CON-01/02/03/04/09
WS-S07 Connection create/revise    → CON-05/06
WS-S08 credential entry            → CON-07
WS-S09 qualification               → CON-08
```

Project Brain/Connection bindings remain P-02 responsibilities. Workspace placement never changes semantic ownership.

## 7. Client-state boundaries

```text
SERVER
→ Brain/revision/reviewText/proposal/health/Connection/qualification truth
→ Connection.name

URL_NAVIGATION
→ exact revision/proposal/Connection/Connector/qualification subjects when route identity is material

FORM_DRAFT
→ Discovery humanResolution before submit
→ Connection name/configuration draft
→ credential input before submit

EPHEMERAL_UI
→ tabs/filtering/expanded detail/local selection
```

Secret input remains transient. `reviewText` is server projection, not editable form authority.

## 8. Structural study / P8 boundary

```text
reference study = TRIGGERED
```

W-02A must make hypothesis → human resolution → exact proposal review → publication legible without a generic editor. W-02B must keep connector, Connection, credential, qualification and downstream binding meanings visually distinct.

Explicitly avoid:

```text
universal resource/settings workbench
secret readback
Brain editor/canvas just because references have one
generic Connected badge
shared ReviewProjection Product domain before repeated locked Evidence
4D SDK/runtime/package decisions
```

## 9. Current result

```text
F04 = OPERATOR ACCEPTED / GREEN
F05 = OPERATOR ACCEPTED / GREEN
F06 = OPERATOR ACCEPTED / GREEN
fixed Product operations = 113
fixed Product wire       = 113 ↔ 113
Brain operations         = 11
Connections operations   = 9
ordinary Permissions     = 25
new semantic owner       = 0
```

W-02A and W-02B are now eligible to resume v2.2 P7 structural hypothesis selection and **functional P8 HTML**. Eligibility is not LOCK.