# 4C pre-P11 global coherence + assembly-readiness review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Stage:** terminal P10 coherence review before any new P11 assembly
> **Review target:** current Conexus platform frontend-planning package through the operator-locked blocks `GF-01`…`PA-01`
> **Method:** DevelopmentConexus Engineering Method + Frontend Product Experience Planning Method v2.3 + Blueprint Harness §10.4–10.6
> **Implementation authority:** none

## 1. Decision question

> Do the accepted Product authority, executable wire, 4C foundation/IA/surface inventory, twelve locked functional block prototypes, Screen Contracts and P10 results form one coherent, sufficiently complete and non-overengineered input for faithful P11 assembly, or do material method, Product/plan or local-execution findings require bounded correction first?

This is not a request to approve the prior P11 candidate. That artifact is negative interaction Evidence after the operator found that it summarized rather than assembled locked blocks.

## 2. Repository bootstrap

Start independently from:

```text
AGENTS.md
→ docs/roadmap.md
→ docs/index.md
→ docs/development/engineering-method.md
→ docs/development/repository-method.md
→ docs/development/frontend-product-experience-planning-method.md
→ docs/phases/4c-frontend-interaction-and-authority-realization.md
```

Then load only the exact current owners required by a named question. At minimum, inspect:

```text
docs/evidence/4c/foundation-and-coverage.md
docs/evidence/4c/candidate-information-architecture.md
docs/evidence/4c/candidate-screen-surface-inventory.md

GF-01, W-01, W-02A, W-02B, W-03, W-04,
P-01, P-02, P-03, P-04, P-05 and PA-01
Screen Contracts + canonical functional HTMLs

docs/product/contract.md
docs/product/operation-ledger.md
docs/product/permission-contract.md
docs/product/wire-contract.md
```

Consult exact finding/selected-realization Evidence, Git history, OpenAPI fragments or reference owners only when a concrete uncertainty, contradiction, dependency, falsifier or proof need requires it.

## 3. Current state and limits

```text
4A = CLOSED / 127 fixed Product operations
4B = CLOSED / 127↔127
4C = OPEN / platform blocks individually locked through PA-01
Budget Analyzer frontend = OUT OF CURRENT PLATFORM SCOPE / FUTURE_PRODUCT_APP
4D+ = NOT STARTED
Product implementation = BLOCKED
```

The current worktree contains later 4C work not yet represented by an immutable GitHub commit. Treat the files and exact locked blob identities pinned by Screen Contracts as the review candidate; report any provenance risk this creates instead of silently assuming GitHub `main` contains all current work.

Do not:

- edit files;
- begin or design a replacement P11;
- select design system, component library, SDK, router, state library, generator or runtime;
- invent a Product operation, Permission, owner, identity or backend composition;
- add a Budget Analyzer screen;
- require speculative future capability;
- treat a mature reference product as authority.

## 4. Protected properties

Attack whether the package preserves:

1. human needs and accepted Journeys A–O without endpoint-shaped UX;
2. Workspace, Project and Published-App context/authority separation;
3. exact Product owner, identity, Permission, concurrency and outcome truth for every material interaction;
4. `Connection != Integration`, Workspace Brain publication != Project Brain binding/context, and authored Agent != Release != runtime truth;
5. Preview != verified != Release AVAILABLE != promoted != pointer-switched != `SERVED_VERIFIED`;
6. Activity/Audit/Evidence/projection != current owner truth;
7. exact contextual ApprovalRequest rather than a universal approval center;
8. owner-specific loading/empty/partial/denied/non-disclosable/dependency/stale/unknown recovery distinctions;
9. accessibility/responsive structure and context-preserving overlays/panels;
10. P10 patterns derived from repeated protected semantics rather than cosmetic similarity;
11. no frontend authorization, lifecycle, DTO/schema or durable-state co-authority;
12. no material human need suppressed only because current backend authority lacks a convenient capability;
13. no unnecessary abstraction, ceremony, premature implementation choice or speculative future machinery;
14. every cross-block handoff has an exact source for its route coordinates and a truthful destination/revalidation boundary;
15. the full locked interaction structure can be assembled without replacing blocks with summaries.

## 5. Required review lenses

### A. Product and journey coherence

Trace accepted actors and Journeys A–O through entry, understanding, decision, action, response, recovery, outcome and next likely task. Identify missing links, duplicated surfaces, unjustified destinations and journeys that exist only in prose.

### B. IA and terminology coherence

Challenge scope hierarchy, route grouping, default landings, cross-links, breadcrumbs, collection entry, user language and the Control Plane / Published Application split. Distinguish a material IA gap from ordering or visual preference.

### C. Authority and state coherence

Trace material reads/writes, identities, disclosure, owner state, concurrency/idempotency, exact failures and forbidden frontend inference across blocks. Look for cross-block coordinates or read compositions that are claimed but not admitted.

### D. Interaction and pattern coherence

Compare the twelve locked P8 structures, Screen Contracts and P10 results. Identify real repeated protected patterns, false abstractions, inconsistent shell/overlay/tab/collection semantics and block-local optima that fail globally.

### E. Global Maximum / proportionality

For each surviving issue, determine root cause, target invariant, credible alternatives, Local versus Global Maximum, essential versus accidental complexity, YAGNI/future cost, smallest real owner, proof strategy and reopen trigger. Prefer no change when evidence does not justify one.

### F. Assembly readiness and proof

Determine the minimum trace/proof matrix required before P11:

```text
locked block
→ protected surface/region
→ protected control/interaction
→ material owner-specific states
→ cross-block entry/exit coordinates
→ assembled destination
→ journey/proof that exercises it
```

Challenge whether existing tests and Evidence can prove this property or merely detect strings/artifact existence.

## 6. Conditional external reference research

Use current primary sources only when a named material ambiguity benefits from comparison. Likely task-pattern families include:

- agent-first application building with live Preview and governed inspectors;
- organizational knowledge/semantic catalog browse and proposal governance;
- connection/integration administration with write-only credentials and qualification diagnostics;
- deployment/release/promotion/serving-state separation;
- embedded application Agent experiences across full-page, contextual-panel and inline hosts;
- accessible responsive shells, drawers, master-detail and dense data explorers.

For every external observation state:

```text
SOURCE OBSERVATION
INFERENCE
CONEXUS DISPOSITION:
  IRRELEVANT | REJECTED | DEFERRED | PRESENT-IN-AUTHORITY | FINDING
```

Stop researching when new sources stop changing the decision space. Do not import visual fashion or provider ontology.

## 7. Finding contract

Classify every concrete finding as exactly one:

```text
METHOD FINDING
PRODUCT / PLAN GAP
LOCAL EXECUTION GAP
NO FINDING
```

For each material finding provide:

```text
ID + severity: MATERIAL | IMPORTANT | OPTIONAL | UNSUPPORTED PREFERENCE
evidence with path:line or primary-source URL
known / inferred / unknown / deferred
reproducible failure mode
why material
root cause
target invariant
smallest real owner/stage
credible alternatives
Global-Maximum recommendation
what must stop
what must be re-evaluated
what must NOT reopen
proof/falsifier
```

Also provide:

1. contradictions that are only apparent and why;
2. current decisions that survive attack;
3. explicit unresolved unknowns requiring operator judgment;
4. readiness verdict: `READY FOR P11 | BOUNDED CORRECTION BEFORE P11 | STOP / REOPEN OWNER`;
5. the smallest sustainable next action.

Reviewer output is Evidence, never authority. The Lead will independently adjudicate every finding.
