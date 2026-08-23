# 4C W-02 — Workspace Brain + Connections Authority-Feasibility Preflight

> **Status:** `W-02 / 4C-7F / PREFLIGHT GREEN + 4C-F04 FOLLOW-UP RECOMPILED`
> **Inherited baseline:** `GF-01 H1-R2 = LOCKED`; `W-01 C1-R1 = LOCKED`; current Product/wire operation topology remains `113↔113` with 25 ordinary Permissions.
> **Scope:** Workspace Brain and Workspace/Project-scoped Connections human work only. No structural layout, Product implementation, 4D mechanism, SDK/runtime or final visual design is admitted here.

## 1. Decision question

Can current accepted Product/wire authority support truthful human interaction for Workspace Brain and Connections without inventing an aggregate Settings/resource owner, exposing secret material, conflating proposal with publication, or turning qualification/binding/health into one status?

This preflight answers operation/owner/trust feasibility. Later reference/structural study remains allowed to falsify missing **properties** inside an otherwise correct owner. That happened once in `4C-F04` for logical Connection human presentation identity.

## 2. Split decision

```text
W-02A — Workspace Brain
W-02B — Connections
W-02 split = REQUIRED
```

The split is structural-methodological, not a new Product domain. The two jobs have materially different human decisions, trust boundaries and failure semantics:

- Brain: inspect semantic knowledge, investigate sources, review provenance-bearing proposals, decide reviewed meaning, publish immutable revisions, inspect health;
- Connections: inspect Connector/Connection truth, create/revise configuration, cross a write-only credential boundary, qualify an exact revision/environment and keep use/binding/health distinct.

Forcing both into one homogeneous Workspace `Resources`/`Settings` editor would hide different owners and consequence classes. They may remain adjacent Workspace destinations through the locked GF-01 rail, but each needs its own later structural hypothesis/proof.

## 3. W-02A — Workspace Brain exact authority

Current human-facing operations:

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

Current Permissions materially consumed:

```text
brain.read
brain.propose
brain.discover
brain.review
brain.publish
```

`brain.bind` exists as a distinct Project-adoption authority, but the Project Brain binding surface belongs to P-02 rather than Workspace Brain W-02A.

Binding semantic law:

```text
proposal != reviewed meaning != published Brain revision
```

Machine discovery/proposal output is hypothesis/provenance-bearing input. It does not self-publish and does not become accepted semantic truth by being visible in the UI.

Health remains multi-valued truth:

```text
UNVERIFIED
VALID
SUSPECT
INVALID
CHECK_ERROR
```

The browser must not collapse those into a single green/red status or infer health from publication alone.

Explicit non-human/out-of-block dispositions:

```text
BRN-11 RunBrainHealthProbe = NOT-HUMAN-FACING / SYSTEM_OWNER_TRANSITION
BRN-12 RunAnalyticQuery = P-02 / NOT W-02
```

`BRN-11` may produce owner/proof Evidence but is not a caller Product command. `BRN-12` is an analytic consumer over an exact Project + Brain binding + curated dataset and therefore belongs with Project Data/Capabilities/Brain binding in P-02, not Workspace Brain administration/review.

No W-02A Product/owner/Permission gap has been found so far.

## 4. W-02B — Connections exact authority

Current human-facing operations:

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

Current Permissions materially consumed:

```text
connection.read
connection.manage
connection.qualify
connection.use
```

`connection.use` is a distinct authority condition used by Project binding / admitted Brain external-source work. W-02B may explain whether a Connection is eligible/qualified, but it must not turn mere visibility or qualification into caller use authority.

Binding state law:

```text
configured != qualified != bound != healthy != caller-authorized
```

Each state answers a different question:

- configured: a logical Connection/current revision exists;
- qualified: exact revision/environment has accepted qualification Evidence;
- bound: another owner has an explicit binding/use relationship;
- healthy: current owner/proof projection is healthy where defined;
- caller-authorized: current caller has the required Permission/scope/use authority now.

No single generic `Connected` badge may substitute for these meanings when a material decision depends on the distinction.

Credential boundary:

```text
credential write = write-only / no secret readback
```

`CON-07` may accept secret material through the protected credential boundary; W-02B must never render a stored secret, create a secret-read endpoint, cache credential bytes as reusable Product truth, or imply that successful write means qualification/use succeeded.

Rejected by accepted authority:

```text
arbitrary TestURL
secret fetch/readback
generic credential executor
cross-Workspace share by convenience
generic Connector/Connection mutation outside admitted fields/revision semantics
```

### `4C-F04` follow-up — human Connection identity

The operation/owner/trust preflight was initially sufficient, but reference/structural study then exposed a property-level falsifier:

```text
multiple same-provider logical Connections are valid
+ Connection had machine/operational identity only
→ no provider-independent server-owned human recognition source
```

Global-Maximum analysis confirmed the **existing logical Connection** as the correct owner and rejected provider/configuration heuristics, rename-now machinery and a new presentation domain.

Operator-accepted realization:

```text
Connection.name
→ explicit creation-time human presentation identity
→ canonical Connection read projection
→ stable across ConnectionRevision changes
→ no rename authority in current F1
```

This is a bounded 4A property + 4B projection correction. It does not change the 9-operation Connections topology or the Permission/trust model established by this preflight.

## 5. Surface / owner fit

Current 4C surface inventory routes:

```text
WS-S04 Brain overview              → BRN-01/02/03/10
WS-S05 Brain discovery/proposals   → BRN-04/05/06/07/08/09

WS-S06 Connections browse/detail   → CON-01/02/03/04/09
WS-S07 Connection create/revise    → CON-05/06
WS-S08 credential entry            → CON-07
WS-S09 qualification               → CON-08
```

Project-scoped Connection lifecycle may reuse the Connections owner through `PRJ-S15` later, but W-02B must not turn Workspace placement into universal Workspace ownership. `ownerScope` remains current server truth.

`Connection.name` improves human recognition inside the existing surfaces; it does not create another screen or owner merely because a new property is present.

## 6. Generic Settings rejection

```text
generic Workspace Settings = REJECTED
```

Reason:

- Brain semantic review/publication is not generic settings mutation;
- Connection identity/configuration/secret/qualification work is not generic settings mutation;
- current 4A explicitly lacks generic Workspace/Area metadata update authority after `4B-F01`;
- grouping consequential owner-specific operations under a generic editor would create screen-shaped authority and obscure Permission differences.

The locked GF-01 rail may expose `Brain` and `Connections` as adjacent Workspace destinations without introducing a generic Workspace owner.

## 7. Authority sufficiency / falsifier result

### Initial 4C-7F result

The operation, Permission, owner, principal, durable-record and trust-boundary sets were sufficient. No new operation/Permission/owner was required.

That part remains GREEN.

### Later W-02B reference-study falsifier

The later human-recognition study validly falsified one **property** inside the existing Connection owner. Therefore the old broad statement:

```text
4A/4B upstream correction = NOT REQUIRED
```

is superseded for this exact property only.

Current result:

```text
operation/Permission/owner/trust correction = NOT REQUIRED
Connection human presentation property      = 4C-F04 OPERATOR ACCEPTED
exact 4B Connection projection             = RECOMPILE REQUIRED
```

No current falsifier shows that a human must:

- directly invoke `BRN-11`;
- perform `BRN-12` from Workspace Brain administration;
- read back a Connection secret;
- use a Connection merely because it is qualified;
- mutate generic Workspace settings;
- merge Brain and Connections lifecycle under one Product owner;
- rename a Connection after creation.

If later structural work demonstrates such a need, stop and reopen only the exact owner/property rather than hiding it in frontend state.

## 8. Client-state boundaries carried into hypotheses

Likely state classes remain sufficient:

```text
SERVER        → Brain/revision/proposal/health/Connection/qualification truth, including Connection.name
URL_NAVIGATION→ exact revision/proposal/Connection/Connector subjects where route identity is material
FORM_DRAFT    → proposal text, Connection name/configuration draft, credential input before submit
EPHEMERAL_UI  → tabs/filtering/expanded detail/local selection
```

A secret field is transient form input; it must not become cached/server-read Product state after submission.

## 9. Reference-study trigger

```text
reference study = TRIGGERED
```

Both sub-blocks are structurally ambiguous/high-impact enough to justify bounded current references before hypotheses.

### W-02A Brain study questions

- how mature knowledge/governance products separate machine suggestion from human-reviewed/published meaning;
- how revision/provenance/health are made inspectable without turning semantic review into a generic document editor;
- whether overview and proposal-review should be one route with material regions or distinct focused surfaces.

### W-02B Connections study questions

- how mature integration platforms separate connector definition, logical connection/configuration, credential entry, qualification/test and downstream use/binding;
- how write-only credential UX communicates update success without readback;
- how to present qualification/current-revision status without flattening configured/qualified/bound/healthy/authorized semantics;
- how a stable human Connection name and provider-specific secondary facts should cooperate without configuration becoming identity authority.

Reference observations remain Evidence only. They cannot add Conexus Product meaning, provider-specific Product vocabulary or new operations.

## 10. Global-Maximum / YAGNI boundary before P8

Leading methodological direction:

```text
W-02A and W-02B studied separately
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
shared review framework generalized from Baseline + Brain before repeated locked evidence
4D SDK/runtime/package decisions
```

No structural candidate is selected by this preflight. After F04 recompilation is GREEN, continue bounded reference/hypothesis work rather than reopening Product by taste.
