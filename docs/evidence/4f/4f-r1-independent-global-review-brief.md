# 4F(R1) — Independent whole/global implementation-plan review brief

> **Status:** `NEUTRAL REVIEW INPUT / NO VERDICT`
> **Candidate under review:** [`4F(R1) implementation slice plan`](4f-r1-implementation-slice-plan.md)
> **Review authority:** Evidence only; reviewers edit no repository files
> **Implementation/install/provider/4G/push/PR/merge authority:** `0`

## 1. Repository and exact candidate state

```text
repository = developmentconexus-ops/conexus-os
branch = codex/4c-p02-integrations-ux
HEAD = 1eb096f6748c4bca45f096ac678e1a0902bab0c6
origin/main = 1619f14d9caed172b6cada9430e6b49ff77a4316
ahead/behind = 2/0
PR = none
main Verify = GREEN at origin/main
worktree = intentionally dirty; 4D/4E/4F planning plus preserved unrelated/unowned state
```

Review the current working tree, not HEAD alone. Preserve `.wireframe-preview/`,
`PRODUCT.md` and every unrelated/unowned path. Do not edit, install, execute a
provider/model, push or create a PR.

## 2. Stage and authority bootstrap

Start from:

1. `AGENTS.md`;
2. `docs/roadmap.md`;
3. `docs/index.md`;
4. `docs/development/engineering-method.md`;
5. `docs/development/repository-method.md`;
6. `docs/phases/4-implementation-readiness-program.md` §9;
7. `docs/evidence/4f/4f-r1-implementation-slice-plan.md`;
8. only the exact 4D/4E owners routed by the index for a material question.

Current accepted state:

```text
4E(R1) = CLOSED / OPERATOR APPROVED / 13↔13 / INDEPENDENT CONVERGENCE CLEAR
4F(R1) = OPEN / SEVEN-SLICE CANDIDATE / PLANNING ONLY
4G(R1) = NOT STARTED
Product implementation and dependency installation = BLOCKED
```

Closed Product meaning, operations, Permissions, owners, wire and interaction
semantics are inputs. Reopen only the smallest owner on a reproduced material
falsifier. Do not add prose-status guards.

## 3. Candidate purpose

The candidate attempts to make implementation mechanical by ordering:

```text
F0 admitted root/profile/wire projection
→ F1 I&A Account/session/bootstrap
→ F2 Workspace + initial authority
→ F3 Project + canonical Git source custody
→ F4 immutable candidate/Baseline custody and decision
→ F5 Control Plane browser composition
→ F6 Project cognition + complete R1 proof (last)
```

It attaches `R1C-14` Git pin/probe to F3 and `R1C-13` safe Mastra pin/provider/
telemetry-off admission to F6. It consumes the exact correction:

```text
configured bootstrap identity → normal Account/session → sole F1 platform_operator
WS-01 → Workspace membership/access + project.create
PRJ-03 → direct grant + project.read/manage + canonical sourceRevision
```

## 4. Why this review is material

The operator requires more than a plausible work breakdown. The plan must leave
implementation with no material design freedom while still letting the operator
test meaningful increments against the locked wireframes/interactions. It must
also create a codebase that can evolve through R2/RB and later tranches without
turning R1 into throwaway scaffolding or premature generalized infrastructure.

The review must independently decide whether the current seven slices are the
smallest sustainable Global Maximum or a local optimum.

## 5. Required attack lenses

### A. Slice topology and testability

- Is the graph divided along independently failing invariants, or merely along
  technical layers/owners?
- Does delaying browser composition to F5 prevent real human validation after
  F1/F2/F3/F4?
- Should browser interaction/projection be completed inside each owner slice,
  kept as a separate cross-cutting slice, or represented by a different two-axis
  graph?
- Which checkpoints can the operator actually exercise with the locked
  wireframe semantics, and which are necessarily engineering-only proofs?
- Does every slice produce a stable, integration-safe increment, or are there
  long-lived half-products/fake states?

### B. Completeness and implementation ambiguity

For every slice, test whether a coding agent can derive without Product/design
judgment:

```text
exact scope and non-scope
exact operation or protected property
canonical request/response schema
module/owner and allowed dependency direction
database schema/record/transaction ownership
process/config/secret boundary
GENERATED / PLATFORM-CONTRACT / APP-OWNED path mutation set
positive scenarios + negative controls
test fixtures and real-dependency floor
Definition of Ready / Definition of Done
operator acceptance checkpoint where applicable
rollback/recovery/re-entry expectation
stop/reopen condition and smallest owner
```

Identify every phrase that would force implementation to invent topology,
table/transaction meaning, module layout, failure semantics, recovery,
observability, API behavior or acceptance truth. Ordinary local naming and
private function decomposition are acceptable degrees of freedom.

### C. First-version Product sufficiency

- Does the plan realize the complete operator-approved R1 outcome and all three
  4E representative flows, not only endpoint availability?
- Are NEW and EXISTING_GIT both first-version requirements with independently
  complete happy/failure/recovery paths?
- Can a person authenticate, bootstrap, leave/re-enter, create/import, refine,
  ask, approve and recover without hidden client/model state?
- Are loading/empty/unknown/partial/stale/refused/retryable/non-retryable states
  bound to exact owner truth?
- Is any required wireframe/interactions Evidence missing from slice acceptance?

### D. Evolutionary code structure

- Does R1 establish stable inward dependencies and owner-local module seams that
  R2/RB can extend without rewriting the foundation?
- Are F0/profile/compiler responsibilities confused with Hub Product source?
- Is one modular monolith still coherent, with owner boundaries executable but
  without premature service/plugin/repository abstractions?
- Does the plan prevent generated types, Fastify, PostgreSQL, Git, Mastra,
  TanStack or browser state from becoming semantic authority?
- Are schema migrations, compatibility, conformance invalidation and APP-OWNED
  preservation practical slice by slice?

### E. Testing and proof architecture

- Is there a per-slice proof pyramid/portfolio: deterministic unit/property,
  owner-store integration, contract/schema, real dependency, browser and
  operator walkthrough only where each claim requires it?
- Can every material control be shown to fire?
- Are tests attached to objective invariants instead of implementation details
  or prose status?
- Does the plan define test data/fixtures without allowing mocks to prove real
  Git/Keycloak/PostgreSQL/browser/provider claims?
- Does the final R1 proof compose earlier Evidence without ceremonially rerunning
  unchanged subjects or hiding a stale PASS?

### F. Git, cognition and cross-mechanism settlement

- Is PRJ-03 atomicity/recovery across PostgreSQL + filesystem Git sufficiently
  specified to implement without inventing a saga/outbox/new record class?
- Does the plan adequately split NEW, EXISTING_GIT, CAS race, crash points,
  credential/protocol denial and bundle restore?
- Is cognition genuinely last while its Project-owned schemas, settlement and
  browser interaction remain implementable without fake earlier success?
- Does the R1C-13 entry gate fully bind safe exact Mastra repin, provider/model
  admission, response ceiling, telemetry-off, secrets, limits and separate real
  provider authority?

### G. Global-Maximum and proportionality

Compare at least:

1. current seven mostly owner/layer slices;
2. vertical operator-testable slices with frontend/backend/data/proof together;
3. a two-axis plan separating engineering foundation gates from Product
   increments/checkpoints;
4. another credible shape discovered by the reviewer.

Reject both extremes: one giant R1 slice that hides failure and one-slice-per-
operation ceremony that fragments shared invariants. State the smallest
sustainable selected shape and why it minimizes total implementation ambiguity,
feedback latency, rework and future structural cost.

## 6. External research lens

Use current credible primary/official sources where useful. Compare the plan
against evidence-backed properties such as small batches, continuous testing,
loosely coupled/evolvable architecture, staged real-dependency proof and
executable architectural fitness functions. External practice is comparison
Evidence only; it cannot override Conexus owners.

## 7. Required output contract

Return:

```text
REVIEWER / exact model + CLI version + effort
VERDICT = APPROVE | REVISE | HOLD
GLOBAL_MAXIMUM = current seven | revised graph | unresolved
MATERIAL FINDINGS ordered by severity
  evidence/reproduction
  failure mode
  materiality
  smallest owner/stage
  target invariant
  stop/reopen scope
  what must not reopen
AMBIGUITY LEDGER
  exact candidate section/phrase
  decision implementation would otherwise invent
  minimum planning closure
RECOMMENDED GRAPH
  ordered slices/gates/checkpoints
  exact operation/property coverage
  operator-testable outcome per checkpoint
  dependency/evolution rationale
REQUIRED PLAN DELTAS
STRONGEST COUNTERARGUMENT TO OWN RECOMMENDATION
RESIDUAL UNKNOWNS / deferred items with trigger
```

Classify each finding as `METHOD FINDING`, `PRODUCT / PLAN GAP`, `LOCAL
EXECUTION GAP` or `NO FINDING`. Reviewer output is Evidence, not authority. Do
not edit files or pre-author new Product meaning.
