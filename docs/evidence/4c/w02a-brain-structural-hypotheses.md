# 4C W-02A — Workspace Brain P7 Structural Decision

> **Status:** `LOCKED / OPERATOR APPROVED` · functional P8 operated and re-approved after F07/F08 · exact Screen Contract owns P9/P10 closure
> **Block:** `W-02A — Workspace Brain`
> **Method:** Frontend Product Experience Planning Method v2.2 through the Conexus 4C profile.
> **Authority posture:** locked interaction-structure Evidence only. This record does not create Brain Product meaning, operations, permissions, Product implementation or physical Brain-Git topology.

## 1. Decision question

How should a human navigate canonical organizational knowledge **and** govern how that knowledge evolves without exposing Conexus internal content classes or source mechanics as the user's primary mental model?

Current Product authority already fixes:

```text
one canonical Workspace Brain
namespaces/domains organize content
SEMANTIC + KNOWLEDGE + EVIDENCE_SPEC are canonical content classes
Discovery = machine-propose / human-decide
KnowledgeProposal != reviewed meaning != published Brain revision
Project adoption remains explicit by exact Brain revision binding
Brain != memory/RAG/vector index
```

## 2. Compared structural hypotheses

### A — content-class first

```text
Brain
├── Semantic
├── Knowledge
└── Evidence Specs
```

**REJECTED as primary IA.** It is ontology-clean but makes users learn Conexus content-class internals before locating a business concept.

### B — governance-workflow first

```text
Brain
├── Overview
├── Discovery
├── Proposals
├── Revisions
└── Health
```

**REJECTED as primary IA.** It supports authority evolution but poorly answers the primary human question: "What does this organization know?"

### C — domain/concept first + separate governance work

**LOCKED / OPERATOR APPROVED.**

```text
Brain
│
├── Knowledge                         ← primary mental model
│   └── business-aligned domains
│       └── business concepts
│
├── Discovery                         ← authority evolution
├── Proposals                         ← authority evolution
├── Revisions                         ← publication history
└── Health                            ← operational overlay
```

The structure separates two dimensions:

```text
WHAT THE ORGANIZATION KNOWS
→ Knowledge → Domain → Business concept

HOW THAT KNOWLEDGE EVOLVES
→ Discovery → Proposal → Review → Publication
```

Health remains an operational overlay and never rewrites an immutable Brain revision.

## 3. Human concept law

The human unit is a **business concept**, not a technical source object or content-class object.

Example fixture only:

```text
Commercial
→ Sales
→ Net Revenue
```

A concept detail may present human sections such as:

```text
Definition
Business meaning
Calculation / grain / relationships
Business rules
Caveats
How this is verified
Provenance
```

Those sections may project canonical classes underneath:

```text
SEMANTIC
→ definitions, entities, dimensions, measures, metrics, grain, relationships

KNOWLEDGE
→ glossary, rules, caveats, processes, policies/context

EVIDENCE_SPEC
→ required proof, assertions, verification requirements, golden cases
```

The frontend does not make `SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC` the mandatory global navigation hierarchy merely because they are canonical content classes.

## 4. Domain / namespace law

Business-aligned domains/namespaces organize content inside the one canonical Workspace Brain. They do not create multiple Brain authorities.

Fixture domain names such as `Commercial`, `Products`, `Finance` or `Logistics` are **demonstration data only**. W-02A does not ratify one universal domain taxonomy for every Workspace.

Search is a findability mechanism over currently disclosable Brain knowledge. It is not a new semantic owner, retrieval authority or vector/RAG truth source.

## 5. Governance-flow law

The functional P8 makes this progression operable and visually distinct:

```text
source reality
→ Discovery hypothesis
→ explicit human resolution
→ durable KnowledgeProposal
→ exact proposal review
→ APPROVE | REJECT
→ separate publication action
→ canonical published knowledge
```

Protected laws:

```text
hypothesis != KnowledgeProposal
proposal approval != publication
reviewText != source/decision identity
BRN-08 decision subject = exact proposalRevision
BRN-09 publication subject = exact candidateSourceRevision
browser fixture state != Product authority
```

F08 adds the locked entry law:

```text
PRJ-01 disclosed ProjectSummary[]
→ explicit human Project context
→ untrusted projectId
→ BRN-04
→ Brain resolves admitted source / Connection context server-side
```

No hidden/default Project, source selector, Connection selector or credential choice is admitted.

## 6. P8 proving interaction

The locked P8 is a deterministic unbranded HTML/CSS + bounded vanilla-JS artifact inheriting the locked GF-01 shell grammar where applicable. It lets the operator actually exercise at least:

```text
Knowledge → Domain → Concept detail
search/findability over fixture concepts
explicit Project context before Discovery
Discovery → inspect hypothesis
enter explicit human resolution
submit the Discovery-backed proposal
open the durable proposal after submission
inspect exact reviewText + provenance
APPROVE or REJECT the exact proposal revision
keep Publish as a separate action after approval
inspect revision history
inspect Brain health separately from immutable content
responsive navigation / keyboard-plausible controls
```

The fixture mutates deterministic local state only to make the flow inspectable. It does not claim backend, authorization, persistence, codegen or runtime proof.

Locked artifact:

```text
docs/evidence/4c/w02a-brain-functional-wireframe.html
approved blob = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e
```

TDD/proof chronology:

```text
Verify #599 = EXPECTED RED
→ P7 law green; 2 P8 tests failed only because HTML did not exist

Verify #601 = functional candidate repository/wire GREEN
Verify #604 = SUCCESS on pre-walkthrough authority/status

F07 P9 falsifier
→ Verify #615 = EXPECTED RED
→ Verify #619 = GREEN after exact BRN-03 structured browse correction

F08 P9 falsifier
→ Verify #631 = EXPECTED RED / 70 tests / 69 pass / 1 fail
→ Verify #633 = revised P8 GREEN
→ Verify #636 = final pre-lock GREEN

operator then re-operated/re-approved revised P8
→ W-02A LOCKED
```

Mechanical GREEN never substituted for operator approval; the final lock is the explicit operator decision after the revised P8 walkthrough.

## 7. Physical representation boundary

4C does **not** select a canonical Brain-Git folder/file format from the UI hierarchy.

Forbidden inference:

```text
Knowledge → Commercial → Sales in UI
-X->
Brain Git must be commercial/sales/*.yaml
```

Physical source/package representation remains a later realization decision constrained by the accepted Product semantics and real generated/runtime consumers.

## 8. Operator disposition

```text
P7 structural hypothesis C = LOCKED / OPERATOR APPROVED
P8 revised functional artifact = OPERATED / OPERATOR APPROVED
W-02A = LOCKED
P9/P10 = CLOSED BY w02a-brain-screen-contract.md
NEXT = W-02B Connections P7
```

Only a later material falsifier may reopen W-02A. Visual preference, framework convenience or speculative scale does not.