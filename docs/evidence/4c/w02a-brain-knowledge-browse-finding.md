# 4C-F07 — Brain structured knowledge-browse finding

> **Status:** `F07 = OPEN / MATERIAL P9 FINDING` · P8 UX direction operator-approved · Product/wire correction not admitted.
> **Block:** `W-02A — Workspace Brain`
> **Trigger:** exact P9 Screen-Contract trace after operator approval of the functional P8 candidate.
> **Authority posture:** finding Evidence only. This file does not add Product operations, DTO fields, Permissions, owners, records or implementation authority.

## 1. Trigger

The operator approved the W-02A functional P8 direction:

```text
Knowledge
→ Domain / namespace
→ Business concept
```

with governance work remaining separate:

```text
Discovery → human resolution → Proposal → exact review → decision → publication
```

The P8 artifact can demonstrate this honestly as fixture interaction, but P9 must now trace every material surface back to accepted Product/wire truth.

## 2. Current exact wire

`BRN-03 GetBrainRevision` currently returns `BrainRevision` with exactly the material content carrier:

```text
brainRevisionId
brainDigest
sourceRevision
availability
reviewText
```

`reviewText` is a nonblank deterministic Brain-owned human-readable projection of the exact `sourceRevision` and is intentionally not canonical source or decision identity.

It is, however, a plain string. The current `BrainRevision` wire exposes no source-bound structured domain/concept browse projection.

## 3. Material falsifier

The approved P8 requires the browser to let a human:

```text
open current published Brain knowledge
→ recognize business domains/namespaces
→ browse business concepts
→ open a concept detail
→ understand definition / business meaning / grain / relationships / rules / caveats / verification / provenance
→ search/filter already disclosed knowledge locally when useful
```

With the current wire, the browser can only receive `reviewText` for the exact revision. Therefore a production frontend would have to choose one invalid substitute:

```text
parse reviewText headings/prose into semantic structure
OR parse generated HTML/DOM as semantic truth
OR read Workspace Brain Git/source directly
OR reuse a different Product regime as catalog authority
OR maintain a parallel frontend concept/domain model
```

All violate the accepted ownership model.

Binding law:

```text
frontend must not parse reviewText into Brain semantic authority
```

## 4. Root cause

The Brain owner and exact revision read remain plausible. The missing property is not currently proven to be a new semantic owner or a new user command.

Root cause:

```text
BRN-03 exact revision read
→ exact human content exists
→ but the source-bound review projection is too weakly shaped for the approved knowledge-browse consumer
```

This is a projection/read-shape sufficiency problem inside the existing Brain owner until disproved.

## 5. Target invariant

A valid correction must make all of the following simultaneously true:

```text
human can browse Knowledge → Domain → Concept from exact published Brain truth
+ browse structure is derived by Brain from the exact sourceRevision
+ concept/detail meaning is source-bound and human-readable
+ frontend does not infer semantic hierarchy from prose or DOM
+ canonical content classes SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC remain Brain authority
+ projection never becomes canonical source or decision identity
+ physical Brain-Git folder topology remains hidden/not selected by 4C
+ local search/filter may operate only over already-disclosed structured projection
+ Project adoption remains separate exact Brain-revision binding
+ no vector/RAG/index becomes meaning authority
```

## 6. Approved P8 preservation law

The operator's P8 approval remains valid as UX direction:

```text
P8 operator approval remains valid as UX direction
```

P9 does not erase that human decision. It prevents the repository from declaring the block fully `LOCKED` while the approved structure cannot yet be implemented without invented frontend authority.

Therefore:

```text
W-02A P8 = OPERATOR APPROVED
W-02A = NOT LOCKED pending F07
```

## 7. Reopen boundary

Reopen only the smallest real owner/property needed to make the approved structure caller-expressible.

Do not reopen:

```text
one canonical Workspace Brain
domain/concept-first human mental model
machine-propose / human-decide
proposal approval != publication
health overlay != immutable content
Project Brain binding independence
GF-01 / W-01 locks
Connections W-02B
```

unless a later material falsifier specifically reaches them.
