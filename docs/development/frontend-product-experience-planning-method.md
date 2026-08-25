---
id: frontend-product-experience-planning-method
kind: methodology
owner: development
summary: Reusable authority-to-UX planning method for designing and proving frontend experience block-by-block with functional low-fidelity HTML before production implementation.
---

# Frontend Product Experience Planning Method

**Version:** 2.3 — OPERATOR-RATIFIED on 2026-08-23  
**Scope:** reusable across products and repositories  
**Purpose:** make production frontend implementation a realization of already-reviewed Product, UX, interaction and system decisions instead of a new design phase performed while coding.

## 1. Core idea

The frontend is the human-operable projection of accepted Product architecture, but good UX is not mechanically determined by backend structure.

The method moves the expensive questions earlier:

```text
accepted Product/system authority
→ actors + user needs
→ complete user flows
→ frontend coverage
→ candidate information architecture
→ material screen/surface inventory
→ block-by-block design
→ functional low-fidelity HTML
→ operator use / iteration / LOCK
→ exact screen/backend contract
→ pattern consolidation
→ assembled low-fidelity product
→ adversarial whole-product walkthrough
→ visual-design handoff
→ implementation readiness
```

Four distinctions are binding:

```text
backend coherence != UX coherence
current backend plan != immutable UX ceiling
static plausibility != interaction coherence
block coherence != whole-product coherence
```

## 2. Success condition

Planning is complete only when a production implementer can build the frontend without inventing material decisions in code.

For every material screen/interaction, the team can answer:

```text
who is the user?
what outcome do they need?
why does this screen/region exist?
why is the information organized this way?
what accepted Product capability does it serve?
what backend/system truth supplies it?
what operation owns each material action?
where does every required identity come from?
what is authoritative state?
what happens on success?
what happens on material failure?
what must the user understand after failure?
what interaction/state follows?
what changes responsively?
what accessibility constraints shaped the design?
what may the frontend NOT infer or own?
```

If a material answer is missing, the frontend is not implementation-ready.

# 3. Method laws

## 3.1 Human needs before screens

```text
actor
→ context
→ user need / job
→ desired outcome
→ end-to-end flow
```

Never start from backend nouns or endpoint inventory.

## 3.2 Coverage before layout

```text
accepted capability / human goal
→ semantic owner
→ admitted read/write contracts
→ candidate frontend context
```

Coverage says what must be representable, not how it should look.

## 3.3 IA before screen composition

Navigation, grouping, search and browse are Product-experience decisions. Do not expose backend topology as navigation merely because it exists.

## 3.4 References are evidence, not authority

For unfamiliar or consequential ambiguous blocks, study relevant mature products/design systems by task pattern, not visual fashion.

## 3.5 Competing hypotheses only when ambiguity is real

Compare 2–3 credible structures when there is a real choice. Do not manufacture alternatives for ceremony.

Static sketches, screenshots, ASCII, diagrams or rough HTML are allowed during hypothesis exploration. They are not P8 lock evidence.

## 3.6 Operator-only LOCK

```text
assistant / reviewer / tool
  may propose CANDIDATE / FINDING / REJECTED
  MUST NOT set LOCKED

operator / designated human Product decision owner
  alone may set LOCKED
```

No next material block becomes baseline before the current block is LOCKED, unless the operator explicitly authorizes parallel candidate work.

## 3.7 No all-at-once wireframing

Prohibited for non-trivial products:

```text
inventory all screens
→ generate all screens
→ review everything only at the end
```

Important blocks are designed, operated and LOCKED before downstream blocks inherit them.

## 3.8 P8 is functional low-fidelity

For a material interactive block, canonical P8 evidence is a **browser-operable low-fidelity HTML wireframe**.

Default medium:

```text
HTML
CSS
vanilla JavaScript when interaction exists
deterministic local fixtures/state simulation
```

A static image, screenshot, ASCII layout, markdown table, box diagram, prose description, non-interactive HTML mockup, or HTML page containing several static storyboard screens cannot receive P8 LOCK when material interactions exist.

## 3.9 Behaviorally truthful, technically disposable

P8 may simulate accepted server truth locally, but prototype code is Evidence only.

P8 must not become:

```text
production React code
real API integration
parallel Product state authority
parallel Authorization engine
production component/design-system authority
```

## 3.10 Hard no screen-shaped API

A difficult UI is not authority for a convenience endpoint.

```text
prove user need
→ identify missing semantic truth
→ find accepted owner
→ classify whether authority already exists
→ reopen only the smallest owning decision when evidence demands it
```

## 3.10A Hard no backend-shaped UX / local-maximum trap

During pre-implementation planning, accepted Product/backend authority is a **falsifiable baseline**, not an immutable ceiling on Product experience.

Frontend planning must not degrade a materially better whole-Product experience merely because the current Product/API/backend plan does not yet expose a required capability.

The symmetric laws are:

```text
NO screen-shaped backend
  UI convenience alone does not justify an API.

NO backend-shaped UX
  current API absence alone does not justify removing a proven user need.
```

When user, operator or reference evidence exposes a potentially material capability:

```text
prove the human job / desired outcome
→ test whether the capability materially improves the whole Product
→ compare credible alternatives and YAGNI pressure
→ identify the semantic owner
→ classify current authority

  SUFFICIENT
    → continue with current authority

  INSUFFICIENT + material need proven
    → UPSTREAM FINDING
    → reopen the smallest Product/backend/wire authority
    → adjudicate Global Maximum

  useful but not justified for current scope
    → explicit DEFERRED or REJECTED
    → record Product reasoning, not merely API absence
```

Forbidden reasoning shortcuts:

```text
current API lacks X
→ therefore omit X from the experience

reference product has X
→ therefore invent endpoint X

backend plan is already written
→ therefore preserve it despite stronger pre-implementation evidence
```

Until implementation-readiness closure, frontend planning is deliberately allowed to falsify earlier Product/backend planning. A resulting authority change uses the bounded-rebaseline law in §5.3 rather than restarting unrelated valid work.

## 3.11 Frontend never becomes parallel business authority

Unless explicitly accepted, frontend planning does not own:

```text
business lifecycle state machine
authorization evaluation
parallel DTO/schema registry
normalized business-entity truth mirror
history/audit as current-resource truth
provider mechanism state as Product truth
```

## 3.12 Patterns are derived from locked evidence

Shared patterns graduate only after repeated protected behavior is observed. Cosmetic similarity is insufficient.

## 3.13 Accessibility/responsive are structural

A block cannot LOCK if its interaction model has no plausible accessible/responsive realization.

## 3.14 Visual design cannot silently redesign UX

Visual design may change aesthetics. It may not silently change navigation, material fields/actions, reading order, region priority, interaction model, density class or workflow.

## 3.15 P8 proves the block; P11 proves the product

```text
P8
  one bounded block
  material local interactions work
  operator uses / revises / LOCKs it

P11
  assembles already-LOCKED blocks
  cross-block navigation works
  complete journeys are testable
```

P11 is not the first time the Product becomes clickable.

# 4. Evidence and decision vocabulary

Inputs:

```text
ACCEPTED AUTHORITY
USER / OPERATOR EVIDENCE
REFERENCE EVIDENCE
ASSUMPTIONS
```

Material assumptions must be registered and later validated, rejected or carried as FINDING.

Decision vocabulary:

```text
LOCKED
CANDIDATE
FINDING
REJECTED
DEFERRED
NOT-HUMAN-FACING
```

When rejecting an artifact, record why:

```text
REJECTED — wrong structure
REJECTED — wrong representation medium
REJECTED — insufficient interaction evidence
REJECTED — missing backend truth
```

Rejecting one wireframe does not automatically reject its underlying Product requirement.

# 5. Frontend Planning Program

The `P0–P14` method defines **how** to plan frontend experience.

Each consuming repository should separately define **where it is** through a frontend program in its sole status/roadmap authority.

Recommended macro-program:

```text
FP0 — Frontend Foundation
      P0–P5

FP1 — Block-by-block Product Experience
      B01...Bnn using P6–P10

FP2 — Integrated Low-Fidelity Product
      P11

FP3 — Whole-Product Adversarial Review
      P12

FP4 — Visual Handoff + Implementation Readiness
      P13–P14
```

`FP*` is a recommended naming scheme, not universal Product ontology.

## 5.1 Enumerate the blocks

For a non-trivial product, name the real future blocks before deep execution when they are already knowable.

Example only:

```text
B01 App shell + global IA
B02 Primary discovery
B03 Primary resource detail
B04 Authoring
B05 Personal work queue
B06 Governance/decision
B07 History/evidence
B08 Notifications inbox
B09 Audit
B10 Organization administration
...
```

Avoid opaque roadmap entries such as `B04+ NOT OPEN` when the block inventory is already knowable.

## 5.2 Status ownership

The methodology is not a project status authority.

The consuming repository roadmap should answer:

```text
current FP stage
current Bxx block
which blocks are LOCKED
which findings block progression
next exact gate
whether implementation is allowed
```

## 5.3 Bounded rebaseline after authority change

When accepted Product/backend authority changes during frontend planning:

```text
new material authority
→ bounded FP0 rebaseline
→ update only affected flows/coverage/surface inventory/program mapping
→ preserve valid LOCKED blocks unless new evidence falsifies them
```

Do not restart the whole frontend automatically.

# 6. P0 — Recover accepted authority

Recover the smallest authority pack required:

```text
Product scope
actors/capabilities
semantic owners
state/lifecycle
identity
permissions/disclosure
API/read models
concurrency/idempotency
runtime/external-effect constraints
accepted route/lens constraints
```

Exit: every frontend requirement traces to authority or is explicitly unknown/assumed.

# 7. P1 — Actors, jobs and user needs

Recommended format:

```text
When <context>,
I need to <goal>,
so that <outcome>.
```

Capture frequency/urgency, information needed to decide, common friction and handoffs.

Exit: human goals are independent from proposed components/pages.

# 8. P2 — End-to-end user flows

For each goal:

```text
entry
→ understand state
→ decide
→ act
→ system response
→ handoff if any
→ outcome
→ next likely task
```

Capture material failure/alternate branches.

Exit: each accepted human goal has a complete flow.

# 9. P3 — Frontend Coverage Matrix

Minimum:

| User need/capability | Owner | Flow | Candidate context | Reads | Writes | Access/security | UX obligations | Status |
|---|---|---|---|---|---|---|---|---|

Cross-cutting obligations may include:

```text
unknown != known-empty
projection != mutation authority
hidden control != authorization
ambiguous outcome != known failure
stale write != silent overwrite
provider success != Product success
```

A human-class backend operation with no user need must be:

```text
mapped to a real user need
or NOT-HUMAN-FACING / DEFERRED
or an UPSTREAM excess-capability finding
```

Conversely, a material human need with no sufficient backend capability must become an **UPSTREAM FINDING** rather than being silently removed from the experience.

Never invent UI merely to reach zero orphans, and never preserve zero backend gaps by degrading a proven Product need.

# 10. P4 — Candidate Information Architecture

Design:

```text
global navigation
context navigation
home/default landing
work queues
browse hierarchy
search/filter entry
cross-links
breadcrumbs when real
```

Maintain a user-language terminology glossary.

P4 exits `CANDIDATE`, never LOCKED.

Global IA LOCK occurs through the first global-frame block after functional P8 review.

# 11. P5 — Screen/material-surface inventory

Derive surfaces from flows + IA, not endpoints.

Distinguish:

```text
route/page
material sub-surface
drawer/modal
inline region
alternate collection view
material state variant
```

Create a distinct material surface when semantic truth, safe action, owner/write, identity, concurrency, disclosure, recovery or editor/viewer mode materially changes.

# 12. P6 — Reference Study (conditional, per block)

Use relevant references when uncertainty justifies it.

Analyze:

```text
user problem
hierarchy
primary/secondary actions
collection representation
search/filter strategy
progressive disclosure
selection behavior
failure states
responsive behavior
density
mismatch/risk
```

Separate:

```text
SOURCE OBSERVATION
INFERENCE
PRODUCT DECISION
```

Every materially relevant capability surfaced by reference evidence must receive an explicit disposition:

```text
IRRELEVANT TO THE USER JOB
REJECTED — Product reason
DEFERRED — justified current-scope reason
PRESENT-IN-AUTHORITY
UPSTREAM FINDING — current authority insufficient
```

`Current backend/API does not provide it` is **not**, by itself, a valid rejection reason during pre-implementation planning.

Stop when additional references stop changing the decision space.

# 13. P7 — Layout Hypotheses + lightweight feasibility

When ambiguity is real, compare credible alternatives against:

```text
task completion
scanability
recognition/comparison
density
cognitive load
context preservation
accessibility
responsive viability
scale
preview needs
error recovery
backend truth fit
```

Static exploration is allowed here.

Before P8, the leading hypothesis states required:

```text
fields/summaries
identity sources
pagination/scale assumptions
sort/filter needs
preview/content truth
material writes
```

Each requirement must be dispositioned as one of:

```text
PRESENT-IN-AUTHORITY
UPSTREAM FINDING
REJECTED — evidence-backed Product reason
DEFERRED — evidence-backed scope reason
```

A materially preferred experience must not be weakened solely to convert `UPSTREAM FINDING` into `PRESENT-IN-AUTHORITY`.

Blocking law:

```text
material user need
+ current authority insufficient
= blocking UPSTREAM FINDING

P8 MUST NOT begin until that finding is:
  ratified into authority
  OR explicitly REJECTED by the Product decision owner
  OR explicitly DEFERRED by the Product decision owner
```

Exit: one leading hypothesis has no unresolved blocking upstream finding and is ready for functional P8 exploration.

# 14. P8 — Functional Low-Fidelity HTML Wireframe

## 14.1 Goal

P8 is the **design-learning loop for one block**.

The operator does not approve an imagined interaction. The operator operates the candidate.

P8 must not conceal an unresolved upstream Product/backend finding behind a local fixture. If a material interaction requires truth or a capability not yet accepted upstream, stop and resolve the finding first.

## 14.2 Canonical medium

For web applications:

```text
.html
CSS
vanilla JavaScript for material behavior
deterministic local fixtures/state simulation
```

No production framework is required or desired.

## 14.3 Material controls must work

Any local interaction capable of falsifying the structure must work, e.g.:

```text
open/close
tabs/lenses
drawers/modals
progressive disclosure
selection
local forms
typeahead/mention
deep-link/anchor
viewer entry/exit
empty/error/conflict state switching
responsive menu/sheet behavior
```

A destination belonging to a future unopened block may terminate at an explicit boundary:

```text
[Open work]
→ "continues in B04"
```

Do not secretly design unopened blocks.

## 14.4 Low-fidelity discipline

P8 does not freeze:

```text
final palette
final typography
final spacing/radius/shadow
final iconography
design tokens
production components
production animation
```

It freezes interaction structure only after operator LOCK.

## 14.5 Iteration loop

```text
leading hypothesis
→ functional low-fi HTML
→ operator uses it
→ discuss failures/friction
→ revise same block
→ operator uses it again
→ repeat
→ operator LOCK
```

## 14.6 Exit

```text
functional HTML exists
material local interactions work
important local states are inspectable
responsive/accessibility structure is plausible
no blocking finding remains
operator explicitly LOCKS
```

# 15. P9 — Screen Contract + bidirectional backend trace

After P8 LOCK, bind each material region/control to accepted authority:

```text
GOAL / FLOW
ROUTE / SURFACE
INFORMATION ROLE
OWNER + READ TRUTH
WRITE CONTROL
IDENTITY SOURCE
CLIENT STATE CLASS
WIRE MECHANICS
MATERIAL FAILURES
FAILURE MESSAGE INTENT
SUCCESS CONSEQUENCE
AUTHZ / DISCLOSURE
FORBIDDEN FRONTEND AUTHORITY
BACKEND SUFFICIENCY
```

Bidirectional law:

```text
Product/backend → frontend
capability → owner → operation/read model → screen/control

frontend → Product/backend
screen/control → operation/read truth → owner → capability
```

If P9 exposes a contradiction that invalidates the P8 lock, reopen only the smallest affected P7/P8 scope. If the contradiction proves accepted upstream authority insufficient, apply §3.10A and reopen the smallest owning Product/backend decision rather than weakening the locked user need by default.

# 16. P10 — Pattern consolidation

After each block LOCK:

```text
observe local patterns
→ compare with prior locked blocks
→ share only repeated semantic/protected behavior
```

Do not create a speculative design system upfront.

Before final closure, reconcile duplicate/false abstractions globally.

# 17. P11 — Assembled Interactive Low-Fidelity Product

P11 assembles already-LOCKED block prototypes.

```text
B01 locked P8
+ B02 locked P8
+ B03 locked P8
+ ...
→ integrated low-fi product
```

P11 proves:

```text
cross-block navigation
complete journeys
deep links
shared shell/overlay behavior
cross-block negative/recovery flows
cross-block responsive behavior
```

P11 does not redesign every block.

If integration falsifies a lock:

```text
FINDING
→ smallest affected block/phase or upstream owner
→ adjudicate whether current authority is sufficient
→ revise
→ operator re-LOCK
→ reassemble affected path
```

# 18. P12 — Adversarial UX + Architecture Walkthrough

Attack the assembled product as:

```text
target user
Product owner
Principal Product Designer
Information Architect
Senior Frontend Architect
backend/domain owner
accessibility reviewer
adversarial architecture reviewer
```

Look for:

```text
findability failure
unnecessary depth
hidden decision-critical facts
wrong density/pattern
block-local optimum that fails globally
missing source/identity
screen-shaped API
backend-shaped UX / local-maximum preservation
frontend AuthZ
fixture state masquerading as Product truth
broken concurrency/idempotency/recovery semantics
```

Every material assumption becomes `VALIDATED`, `REJECTED`, or `FINDING`.

# 19. P13 — Visual Design Handoff + conformance

Handoff contains:

```text
locked IA
locked functional P8 blocks
assembled P11 prototype
terminology glossary
pattern vocabulary
Screen Contracts
material state/failure intent
responsive structure
```

After visual design, verify no silent structural change in:

```text
reading order
region priority
action placement
interaction model
density class
navigation meaning
material information visibility
responsive behavior
```

# 20. P14 — Implementation-Readiness Closure

Close only when:

```text
accepted human goals                           complete
end-to-end flows                               complete
IA                                             locked where applicable
block roadmap                                  complete/dispositioned
functional P8 blocks                           operator-locked
Screen Contracts                               complete
material controls                              100% bound
navigation identities                          100% sourced
patterns                                       reconciled
assembled P11                                  complete
negative/material states                       represented
failure message intent                         defined
frontend ↔ backend trace                       complete
backend human ops without disposition          0
material human needs suppressed by API absence 0
invented Product operations                    0
screen-shaped APIs                             0
material assumptions OPEN                      0
unresolved material UX/architecture findings   0
post-design conformance defects                0
```

# 21. Block operating protocol

For each `Bxx`, record:

| Field | Requirement |
|---|---|
| Block | stable planning ID |
| User goals | explicit |
| Authority pack | bounded |
| Dependencies | explicit |
| Assumptions | linked |
| References | when triggered |
| Reference capability dispositions | explicit for materially relevant evidence |
| Hypotheses | 1–3 when justified |
| Data feasibility | PRESENT-IN-AUTHORITY / UPSTREAM FINDING / REJECTED / DEFERRED |
| Global-Maximum check | current authority tested as baseline, not assumed ceiling |
| Canonical P8 HTML | required after blocking findings are dispositioned |
| Material interactions | working |
| Operator walkthrough | explicit |
| Findings | explicit |
| Decision | LOCKED / CANDIDATE / FINDING / REJECTED |
| P9 Screen Contract | after LOCK |
| P10 pattern pass | after LOCK |
| P11 integration path | when assembled |

# 22. Phase scope

| Phase | Scope |
|---|---|
| P0–P3 | global/bounded foundation |
| P4 | global candidate IA |
| P5 | global candidate surface inventory |
| P6–P8 | per-block iterative design loop + upstream finding discovery/adjudication |
| P9 | per-block exact contract after LOCK |
| P10 | incremental + terminal |
| P11 | assembled product from LOCKED blocks |
| P12–P14 | global closure |

Recommended program mapping:

```text
FP0 = P0–P5
FP1 = Bxx loops using P6–P10
FP2 = P11
FP3 = P12
FP4 = P13–P14
```

# 23. Minimum artifact inventory

Logical artifacts where triggered:

```text
authority map
need/assumption register
user-flow inventory
coverage matrix
candidate IA + glossary
Frontend Planning Program / block roadmap
block ledger
reference notes + capability dispositions
hypothesis comparison
upstream finding / bounded replan decision when triggered
functional P8 HTML
Screen Contract/trace
pattern vocabulary
assembled P11 prototype
P12 findings
post-design conformance result
```

The method does not require one file per artifact.

# 24. Accessibility, responsive and density

Accessibility is structural. P8 must consider keyboard path, focus order, semantic controls, labels, non-color-only meaning, non-drag alternatives and screen-reader plausibility.

Responsive behavior is structural. Define and, when material, demonstrate:

```text
what stays primary
what stacks
what collapses
what becomes drawer/menu/sheet
what becomes scrollable
what must stay visible
how collections transform
```

Density is task-driven, not aesthetic. Progressive disclosure must never hide facts required for the current decision.

# 25. Search/browse and collection patterns

```text
known-item lookup      → search may dominate
exploratory discovery  → browse/group may dominate
large structured set   → filter/sort may dominate
mixed use              → combine carefully
```

Presentation patterns:

```text
table           comparable dense attributes
cards/grid      recognition/preview
structured list compact records
master-detail   repeated sequential inspection
```

Offer alternate views only when distinct important tasks justify them.

These task-pattern observations are allowed to expose an upstream capability gap. If search/filter/sort materially serves the proven collection job but current authority lacks it, classify an UPSTREAM FINDING; do not silently degrade the collection to whatever the current endpoint happens to support.

# 26. Findings and smallest-reopen law

Classify failures in order:

```text
1. P8 interaction/structure?
2. IA?
3. wrong pattern?
4. incomplete Screen Contract?
5. missing read composition already allowed?
6. excess/misaligned backend capability?
7. genuinely missing Product/API capability?
```

For category 7:

```text
prove material user need
→ identify semantic owner
→ open UPSTREAM FINDING
→ compare Global-Maximum alternatives
→ reopen only the smallest evidence-backed Product/backend/wire scope
→ ratify / reject / defer
→ bounded rebaseline
→ resume the frontend block
```

Do not reinterpret a missing capability as a frontend constraint merely to avoid reopening prior planning.

# 27. Independent review

For material methodology/program changes, an independent adversarial review is recommended where repository governance supports it.

Attack:

```text
missing user-centered discovery
weak IA
static approval before interaction learning
poor operator loop
all-at-once generation
screen-shaped API
backend-shaped UX / local-maximum preservation
frontend authority duplication
YAGNI / overengineering
untracked assumptions
accessibility/responsive deferral
visual-design drift
program/roadmap ambiguity
```

Severity:

```text
MATERIAL
IMPORTANT
OPTIONAL
UNSUPPORTED PREFERENCE
```

Reviewer output is Evidence, never authority.

# 28. Compact process

```text
FP0 — GLOBAL FOUNDATION
P0 Authority
→ P1 Needs
→ P2 Flows
→ P3 Coverage
→ P4 Candidate IA
→ P5 Surface inventory
→ enumerate B01...Bnn

FP1 — BLOCK-BY-BLOCK EXPERIENCE
For each Bxx:
  P6 References when triggered
       → disposition material reference capabilities
  → P7 Hypotheses + feasibility
       → if material authority gap:
           UPSTREAM FINDING
           → smallest Product/backend reopen
           → operator ratify/reject/defer
           → bounded rebaseline
           → resume P7
  → P8 FUNCTIONAL LOW-FI HTML
       build → operate → discuss → revise → operate
       → OPERATOR LOCK
  → P9 Screen Contract / backend trace
  → P10 pattern pass
  → next block only after LOCK

FP2 — INTEGRATED LOW-FI PRODUCT
P11 assemble already-LOCKED blocks
→ test cross-block journeys

FP3 — WHOLE-PRODUCT CHALLENGE
P12 adversarial walkthrough

FP4 — HANDOFF / READINESS
P13 visual design + conformance
→ P14 implementation-readiness closure
```

# 29. Adoption guidance for other repositories

A consuming repository should:

1. cite `Frontend Product Experience Planning Method v2.3`;
2. keep mutable status in its own roadmap, not this method;
3. define FP0–FP4 or an equivalent non-conflicting program;
4. enumerate real `B01...Bnn` blocks;
5. use functional low-fi HTML/CSS/JS as canonical P8 evidence for interactive web blocks;
6. require explicit operator LOCK;
7. treat prototype fixtures/code as Evidence, never Product authority;
8. treat current Product/backend authority as a falsifiable baseline during pre-implementation planning, never an automatic UX ceiling;
9. route material missing-capability findings to the smallest owning authority before P8;
10. record justified local deviations rather than silently forking the method.

Recommended onboarding statement:

```text
Frontend planning follows Frontend Product Experience Planning Method v2.3.

For material interactive web blocks:
current Product/backend authority is a baseline to test, not an immutable UX ceiling;
material authority gaps become upstream findings before P8;
P8 canonical evidence = functional low-fidelity HTML/CSS/JavaScript;
P11 = assembled integration of already-LOCKED blocks.

Project status and block sequence are owned by this repository's roadmap.
```

# 30. Final principle

A strong frontend plan should make production coding feel almost boring.

Production implementation should mostly be:

```text
realize operator-locked interaction structure
→ bind accepted contracts
→ implement reviewed patterns
→ preserve responsive/accessibility behavior
→ prove states and failures
```

not:

```text
invent navigation
→ invent screens
→ discover interaction only after static approval
→ invent missing APIs
→ let current APIs suppress proven Product needs
→ redesign workflows in production
→ reconcile backend/frontend after the fact
```

> **Frontend implementation readiness means the important Product, IA, layout, interaction and system-contract decisions have already been made in a functional low-fidelity browser experience, deliberately reviewed, operator-locked, assembled across blocks, tested against Global-Maximum evidence rather than frozen by earlier backend planning, and traced to evidence.**
