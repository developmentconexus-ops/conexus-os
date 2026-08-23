# 4C W-01 — Fable Adversarial Review Request

> **Status:** TEMPORARY REVIEW ARTIFACT / REVIEW BRANCH ONLY / NEVER MERGE
> **Candidate branch:** `agent/4c-frontend-interaction`
> **Exact candidate HEAD:** `89baef196b7ac9f567e645207b857de9adfb495a`
> **Exact review branch base:** same candidate HEAD; this file is the only intended review-branch delta.
> **Latest candidate proof:** Verify #525 = SUCCESS; 54/54 repository tests; fixed Product wire `113↔113`; Project=23; Permissions=25; Technical Ingress=3/Product impact 0; Kubb real-OAS=113; whole-4B GREEN.
> **Reviewer role:** INDEPENDENT CHALLENGER. Findings are Evidence, never Product/architecture authority.

## 1. Review question

Adversarially challenge whether the current Conexus Baseline visual-review direction is the smallest coherent Global-Maximum solution for the platform, rather than a frontend-local feature or premature generalization.

The candidate currently establishes:

```text
canonical Project/Baseline authority
→ exact immutable Baseline candidate
→ deterministic human review projection
→ candidate-local visual selection context
→ contextual Conexus explanation bound to the exact candidate
→ local/non-authoritative proposed refinements
→ explicit human Apply boundary
→ Project/Inception owner generates a new immutable candidate
→ re-review
→ approve exact reviewed candidate digest
```

Lavish is a reference for useful collaboration properties only. Mastra is future cognition/runtime mechanics only. Neither is Product authority.

## 2. Mandatory authority path

Read only what is needed, in this order:

```text
AGENTS.md
→ docs/index.md
→ docs/roadmap.md
→ docs/development/blueprint-harness-design.md
→ docs/reference/builder-and-harness.md §§7–9
→ docs/development/softwareforge-reference-assessment.md only where traceability/staleness/review properties are material
→ docs/product/operation-ledger.md current Project rows and 4C-F03 chronology
→ docs/product/permission-contract.md project.manage vs project.build
→ contracts/api/product/project-paths.yaml PRJ-07/08/09/23/24 only
→ docs/evidence/4c/w01-baseline-review-global-maximum-preflight.md
→ docs/evidence/4c/w01-reference-and-structural-hypotheses.md
→ docs/evidence/4c/w01-projects-inception-wireframe.html
→ tests/repository/4c-w01-baseline-review-loop.test.mjs
→ tests/repository/4c-w01-structural-wireframe.test.mjs
```

Current repository authority outranks this request.

## 3. Protected properties to attack

### R1 — Platform law, not frontend authority

Does the candidate preserve the correct authority direction?

```text
visual artifact / DOM / selected anchor / browser state / Mastra memory
-X-> Project/Baseline authority

explicit Project operation + current server revalidation
→ authority transition
```

Find any place where UI convenience becomes deciding authority.

### R2 — Baseline semantics remain Project-owned

Challenge whether `PRJ-07` exact-prior-candidate refinement and `PRJ-24` exact-candidate contextual read are genuinely the smallest Product correction.

Attack:
- hidden second Baseline owner;
- review-session/comment/thread CRUD by implication;
- accidental Builder ownership;
- candidate mutability;
- authority hidden in prompt prose;
- stale-candidate ambiguity;
- need for a new Permission that the current correction improperly avoids;
- any capability without a real human consumer.

### R3 — `project.manage` vs `project.build`

`PRJ-24` is Project/Baseline review under `project.manage`; `BLD-16 AskConexusAboutContext` remains Builder under `project.build`.

Attempt to falsify that separation. If the same semantic job truly belongs to Builder, say why. If combining them would create an over-broad universal assistant, say so.

### R4 — Lavish disposition

Current disposition:

```text
ADOPT Lavish directly as Product architecture = REJECT
ADAPT useful collaboration properties          = LEADING
BUILD a full Conexus review editor now          = REJECT / YAGNI
```

Challenge this against:
- portability;
- visual selection precision;
- feedback queue/apply boundary;
- diagrams;
- multi-user Hub-owned authority;
- file-path/local-server/polling assumptions;
- replacement/removal cost;
- dependency risk;
- whether direct reuse actually has a bounded viable role we prematurely rejected.

Do not recommend a technology by familiarity. Require a protected property and consumer.

### R5 — Mastra boundary

Challenge the mapping:

```text
Mastra Agent / streaming / RequestContext / thread memory = cognition/mechanics
Hub / Project / accepted artifacts                         = authority
```

Look for accidental persistence, authorization or currentness transfer into model/thread/runtime state.

### R6 — Methodology alignment

The candidate must remain aligned with the accepted Engineering Method / Blueprint Harness:

```text
repository-current authority
→ bounded context
→ decision question/protected property
→ material research only
→ smallest coherent candidate
→ falsifier/negative cases
→ durable artifact
→ independent challenge
→ Lead adjudication
→ operator decision
→ smallest-owner reopen
```

Attack ritual, overengineering, missing falsifiers, unfalsifiable claims, hidden assumptions and premature mechanism choice.

### R7 — Baseline review vs Plan visualization

**Critical anti-generalization check.**

The current Builder authority says a Visual Plan may expose:

```text
Work Units / work items
dependency graph
acceptance/assertion links
known blockers/unknowns
current progress
```

It does **not** yet select the visual grammar for Plan.

Current candidate intentionally does NOT decide whether Plan is:

```text
DAG
cards
outline
canvas
Mermaid
timeline
matrix
or a hybrid representation
```

Adversarially determine whether W-01 accidentally implies a shared rendering architecture that should instead remain deferred until the real Plan/Builder consumer is worked in 4C (`P-01`) and later realized mechanically in 4D.

If a reusable `Review Projection` primitive can already be proved from Baseline alone, show the exact protected property that justifies admitting it now. Otherwise prefer repetition-first/YAGNI and keep Plan rendering deferred.

### R8 — Future Plan interaction premise

Without designing the Plan now, challenge whether this future principle is coherent:

```text
Hub-owned exact Plan revision
→ visual projection of exact Plan truth
→ human navigates/selects WorkUnit/dependency/assertion/blocker context
→ contextual Conexus explanation may help
→ conversation/proposed edits do not mutate Plan
→ explicit admitted Plan/checkpoint operation crosses authority boundary
→ UI reprojects new Hub-owned Plan/current state
```

The review should say whether this is a sound future premise or whether Baseline and Plan are semantically too different for even this common interaction law.

### R9 — Global Maximum / YAGNI

Compare at minimum:

```text
A. direct Lavish mechanism
B. Conexus-native adaptation of Lavish properties
C. custom generic review framework now
D. Baseline-specific minimum now, generalize only after second real consumer
```

Prefer no option by default. State what survives adversarial comparison and why.

## 4. Explicit non-goals

Do NOT:
- redesign final visual style/colors/component library;
- begin 4D/runtime implementation;
- choose exact Plan drawing grammar;
- create Product code;
- reopen GF-01 without a material falsifier;
- merge the review branch;
- create Product requirements from reviewer taste;
- require universal PRD/BRD/Missions/Milestones/fleet orchestration;
- make HTML, DOM, Mermaid, Lavish, Mastra or model memory authority.

## 5. Required output

Create one bounded review result on this review branch, preferably:

`docs/evidence/4c/w01-fable-review-result.md`

Use this structure:

```text
VERDICT = SURVIVES | SURVIVES WITH BOUNDED CORRECTIONS | MATERIAL REOPEN REQUIRED

MATERIAL FINDINGS
FBL-4C-W01-01 ...
- claim/property attacked
- exact repository Evidence
- failure mode
- smallest owner to reopen
- proposed correction boundary

MINOR FINDINGS
...

GLOBAL-MAXIMUM DISPOSITION
- Lavish direct / adapt / build / defer
- Baseline-specific vs reusable review primitive
- Plan visualization timing
- Mastra authority boundary

METHODOLOGY CHECK
- adversarial independence
- falsifiability
- YAGNI
- smallest-owner reopen
- operator gate

FINAL RECOMMENDATION
- LOCK candidate
- BOUNDED REVISE
- REJECT / REOPEN <smallest owner>
```

Every material finding must cite a concrete contradiction, missing invariant, real consumer/capability gap, or falsifier. Preference alone is not a material finding.

## 6. Review-branch law

This branch is temporary Evidence infrastructure only:

```text
candidate exact HEAD
→ isolated Fable challenge
→ review output Evidence
→ Lead adjudicates on candidate branch
→ accepted corrections land on candidate branch
→ second Fable round only if material correction changes reviewed property
→ review branch never merges
```
