# 4C W-02 — Workspace Brain + Connections Authority-Feasibility Preflight

> **Status:** `W-02 / 4C-7F / PREFLIGHT GREEN + F04/F05 FOLLOW-UP RECOMPILED`
> **Inherited baseline:** `GF-01 H1-R2 = LOCKED`; `W-01 C1-R1 = LOCKED`; current Product/wire operation topology remains `113↔113` with 25 ordinary Permissions.
> **Scope:** Workspace Brain and Workspace/Project-scoped Connections human work only. No structural layout, Product implementation, 4D mechanism, SDK/runtime or final visual design is admitted here.

## 1. Decision question

Can current accepted Product/wire authority support truthful human interaction for Workspace Brain and Connections without inventing an aggregate Settings/resource owner, exposing secret material, conflating proposal with publication, or turning qualification/binding/health into one status?

This preflight answers operation/owner/trust feasibility. Later reference/structural study may still falsify a missing **property or input expressibility** inside an otherwise correct owner. That happened in `4C-F04` for Connection human identity and in `4C-F05` for Brain Discovery-backed proposal intake.

## 2. Split decision

```text
W-02A — Workspace Brain
W-02B — Connections
W-02 split = REQUIRED
```

The split is structural-methodological, not a new Product domain. The two jobs have materially different decisions, trust boundaries and failure semantics:

- Brain: inspect semantic knowledge, investigate sources, resolve machine hypotheses, review provenance-bearing proposals, decide reviewed meaning, publish immutable revisions, inspect health;
- Connections: inspect Connector/Connection truth, create/revise configuration, cross a write-only credential boundary, qualify an exact revision/environment and keep use/binding/health distinct.

They may remain adjacent Workspace destinations through the locked GF-01 rail, but each needs its own structural proof.

## 3. W-02A — Workspace Brain exact authority

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

`brain.bind` likewise belongs to Project adoption in P-02 rather than Workspace Brain administration.

Binding laws:

```text
machine hypothesis != KnowledgeProposal
proposal != reviewed meaning != published Brain revision
BRN-04 Discovery = read-only hypothesis/provenance work
BRN-08 = exact proposal review decision
BRN-09 = exact reviewed-candidate publication
```

Health remains:

```text
UNVERIFIED | VALID | SUSPECT | INVALID | CHECK_ERROR
```

### `4C-F05` follow-up — Discovery-backed human resolution

Reference/interaction derivation exposed a caller-expressibility falsifier after the initial topology preflight:

```text
accepted journey:
BRN-04 machine hypothesis
→ explicit human resolution
→ durable KnowledgeProposal
→ BRN-08 review decision
→ BRN-09 publication

pre-F05 wire:
BRN-04 → candidateRef + hypothesis + provenanceRefs
BRN-07 ← pre-existing candidateSourceRevision + provenanceRefs
```

The browser could not honestly manufacture the missing Brain source revision, and Builder/Project Git could not be reused without owner inversion.

Global-Maximum analysis confirmed the existing Brain owner and the existing `BRN-07 SubmitKnowledgeProposal` semantic job. Operator-accepted realization keeps two mutually exclusive proposal-intake forms:

```text
SOURCE_BACKED
→ candidateSourceRevision + provenanceRefs

DISCOVERY_BACKED
→ exact discoveryCandidateRef + explicit non-blank humanResolution
→ Brain re-resolves discovery provenance/context
→ Brain materializes candidateSourceRevision
→ same durable KnowledgeProposal
```

No `ResolveBrainDiscoveryCandidate`, `BrainDraft`, `DiscoverySession`, new Permission, new owner or new durable record class is admitted.

## 4. W-02B — Connections exact authority

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

Rejected by accepted authority:

```text
arbitrary TestURL
secret fetch/readback
generic credential executor
cross-Workspace share by convenience
generic Connector/Connection mutation outside admitted fields/revision semantics
```

### `4C-F04` follow-up — human Connection identity

Reference study exposed a property-level falsifier:

```text
multiple same-provider logical Connections are valid
+ Connection had machine/operational identity only
→ no provider-independent server-owned human recognition source
```

Global-Maximum analysis confirmed the existing logical Connection owner. Operator-accepted realization:

```text
Connection.name
→ explicit creation-time human presentation identity
→ canonical Connection read projection
→ stable across ConnectionRevision changes
→ no rename authority in current F1
```

The Connections topology remains 9 operations and the Permission/trust model is unchanged.

## 5. Surface / owner fit

Current 4C inventory routes:

```text
WS-S04 Brain overview              → BRN-01/02/03/10
WS-S05 Brain discovery/proposals   → BRN-04/05/06/07/08/09

WS-S06 Connections browse/detail   → CON-01/02/03/04/09
WS-S07 Connection create/revise    → CON-05/06
WS-S08 credential entry            → CON-07
WS-S09 qualification               → CON-08
```

Project Brain binding and Project Connection binding remain P-02 responsibilities. Workspace placement never changes semantic ownership.

## 6. Generic Settings rejection

```text
generic Workspace Settings = REJECTED
```

Brain semantic review/publication and Connection identity/configuration/secret/qualification are owner-specific consequential work, not generic settings mutation.

## 7. Current authority-feasibility result

Initial operation/Permission/owner/trust topology was sound. Later reference/interaction work found two bounded defects inside correct existing owners:

```text
F04 Connection human presentation identity = OPERATOR ACCEPTED / GREEN
F05 Brain Discovery proposal intake         = OPERATOR ACCEPTED / GREEN
```

Preserved after both recompiles:

```text
fixed Product operations = 113
fixed Product wire       = 113 ↔ 113
Brain operations         = 11
Connections operations   = 9
ordinary Permissions     = 25
new semantic owner       = 0
```

No current falsifier shows that a human must directly invoke BRN-11, run BRN-12 from Workspace Brain administration, read Connection secrets, gain Connection use merely from qualification, mutate generic Workspace settings, rename Connection after creation, or create a separate Brain draft/session domain.

## 8. Client-state boundaries

```text
SERVER
→ Brain/revision/proposal/health/Connection/qualification truth
→ Connection.name
→ KnowledgeProposal produced by either BRN-07 intake

URL_NAVIGATION
→ exact revision/proposal/Connection/Connector subjects when route identity is material

FORM_DRAFT
→ Discovery human-resolution input before submit
→ source-backed proposal input before submit
→ Connection name/configuration
→ credential input before submit

EPHEMERAL_UI
→ tabs/filtering/expanded detail/local selection
```

A secret field remains transient form input. Human-resolution draft text is not Brain authority until successful BRN-07 submission.

## 9. Reference-study trigger

```text
reference study = TRIGGERED
```

Remaining structural questions:

### W-02A Brain
- how to make hypothesis/provenance → explicit human resolution → proposal review → publication legible without a generic document editor;
- how revision/provenance/health remain inspectable;
- whether overview and focused review need separate routes/material regions.

### W-02B Connections
- how connector definition, logical Connection, write-only credential entry, qualification and downstream binding remain visually distinct;
- how credential-update success is communicated without readback;
- how qualification/current-revision facts remain honest without a generic `Connected` badge;
- how `Connection.name` and provider-specific secondary facts cooperate without configuration becoming identity authority.

Reference observations remain Evidence only.

## 10. Global-Maximum / YAGNI boundary before P8

```text
W-02A and W-02B studied separately
→ resolve any further authority falsifier first
→ compare only real structural alternatives
→ preserve owner-specific truth
→ render bounded HTML candidates
→ operator adjudicates each material structure
```

Explicitly avoid:

```text
universal resource/settings workbench
secret manager UI with readback
Brain canvas/editor because competitors have one
integration marketplace semantics without accepted consumer
shared review framework generalized before repeated locked evidence
4D SDK/runtime/package decisions
```

F04/F05 are proof that the preflight does not freeze downstream inquiry. Any further material falsifier returns to its real owner and Global-Maximum decision before P8.