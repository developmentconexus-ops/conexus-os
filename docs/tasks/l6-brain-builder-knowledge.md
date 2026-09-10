# L6 — Brain Discovery and Builder knowledge task plan

## Goal and design

Conexus investigates source structure, interviews the human, proposes business
knowledge and publishes only through Brain review authority. During app work,
Builder also recognizes reusable knowledge and initiates a proposal without
requiring the user to start a separate enrichment session. Projects adopt exact
published revisions explicitly; learned content never silently changes them.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
Status/grants belong only to roadmap. Prompt/skill/model comparisons are part
of this delivery by operator choice, not a prerequisite to all earlier work.
Business Product Agents remain a separate phase; platform cognition is included.

## Required context and existing source

- [Brain owner](../reference/brain-and-knowledge.md),
  [Product feedback](../product/contract.md#11-journey-e--brain-publish--bind--feedback),
  [BRN-04..09 and proposal intake](../product/operation-ledger.md#55-brain--13),
  [permission contract](../product/permission-contract.md),
  [Brain wire](../../contracts/api/product/brain-paths.yaml).
- [Mastra mapping](../reference/mastra/index.md) and
  [Mastra skill](../../.agents/skills/mastra/SKILL.md): inspect adopted package
  source/types/docs first, then Context7/current official documentation for
  unresolved API choices. Historical qualification pins are not installed pins.
- Existing source: `apps/hub/src/brain/{module,routes,store}.ts`,
  `apps/hub/src/brain/context.ts`, `packages/brain-contract/`,
  `apps/web/src/features/brain/components/workspace-brain.tsx`,
  `apps/hub/src/builder/runtime.ts` and `apps/hub/src/builder/service.ts`.
- Existing proof: `tests/implementation/r2-p2-brain.test.mjs`,
  `tests/implementation/r2-p4-brain-context.test.mjs`,
  `tests/implementation/r2-p4-brain-binding-validation.test.mjs`.
  Current composed Brain registration covers BRN-01/02/03/10/14; it does not
  establish Discovery/proposal/publication implementation.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L6.1–2 knowledge | [C-011](../decisions/index.md); [Brain owner](../reference/brain-and-knowledge.md), §§20.2–20.7 and 21 | Workspace Brain authority, explicit adoption and machine-propose/human-decide are fixed. Select discovery tool/candidate/provenance interfaces within those boundaries |
| L6.1 intake | [operation ledger](../product/operation-ledger.md), §5.5.1; [permissions](../product/permission-contract.md), Brain permissions | Resolve automatic Builder proposal initiation versus existing human submission/resolution route; state exactly which operation/caller contract needs amendment |
| L6.3 recognition | [Product](../product/contract.md), Journey E feedback and Journey O; [Builder owner](../reference/builder-and-harness.md), §§9.2–9.3 | Preserve reusable-learning proposals and Hub ownership. Select prompt/skill/context composition using missed/irrelevant/duplicate/conflicting-proposal cases |
| L6.3 comparison | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §§4 and 7; [Factory influence](../research/factory-ai/influence-on-conexus.md), §§12–15 | Use directed source discovery, focused context and instruction-versus-enforcement distinctions; neither vendor study defines Conexus Brain semantics or justifies copying its runtime |
| L6.4 semantic reads | [Brain owner](../reference/brain-and-knowledge.md), §22; [operation ledger](../product/operation-ledger.md), BRN-12/13 | Decide the actual local-release semantic-query consumer separately; static queries and guided Discovery do not silently implement AnalyticQuery |

Before a Mastra choice, load its skill and inspect installed docs/types for
instructions, tools, structured output, skills and interruption/continuation.
Ask Context7 about only the unresolved API and reconcile version differences.
Do not borrow PAR persistence/approval mechanics or install memory/workflow
packages merely because an example uses them. Runtime placement, current
authority and interview continuity must be decided against this Brain consumer.

## Implementation work breakdown

### L6.1 — Close the two proposal-entry contracts

- [ ] Map directed Discovery and Builder-originated knowledge to the existing
  BRN-04/07/08/09 operations and Brain-owned source/provenance.
- [ ] Reconcile automatic Builder proposal generation with BRN-07's existing
  HUMAN_ACCOUNT_SESSION route, source-backed form and Discovery-backed explicit
  human resolution. Define the authorized bridge before giving a worker a tool;
  Project Git is not Workspace Brain source authority.
- [ ] Select interview continuity/candidate handling without introducing a new
  durable DiscoverySession/BrainDraft domain by convenience. If required
  persistence cannot fit the accepted contract, reopen that exact owner.
- [ ] Freeze runtime placement/isolation, bounded read tools, source scope,
  structured candidate types, files and executable proof commands. Reuse the
  admitted Mastra mechanisms rather than importing the deferred PAR surface.

### L6.2 — Realize guided Discovery and human publication

- [ ] Read source dictionary/catalog before bounded profiling through the
  trusted Hub/Gateway. ERP credentials and real row payloads must not enter
  Brain Git or become E2B discovery credentials.
- [ ] Present hypotheses, provenance and prioritized questions; materialize
  only the exact human-resolved candidate through the Brain owner.
- [ ] Implement proposal review/decision, validation and immutable publication,
  then explicit Project revalidation/adoption. Existing operational health
  remains distinct from immutable knowledge and publication authority.
- [ ] Verify rejected hypotheses, unsupported meaning, unavailable source,
  access revocation, candidate drift and duplicate/stale decisions.

### L6.3 — Shape Builder recognition and proposal behavior

- [ ] Compare bounded instruction/skill variants against the same task/context
  set. Stable instructions describe the responsibility; a skill may carry
  detailed criteria/examples; tools register only authorized candidate data.
- [ ] Evaluate reusable business rules, project-only exceptions, existing Brain
  duplicates, conflicting rules and malicious instructions in source material.
  Measure missed useful proposals and irrelevant proposals as well as success.
- [ ] Verify that proposals retain origin/scope/uncertainty, do not publish
  automatically and cannot widen permissions. App development continues unless
  its own correctness depends on resolving the knowledge ambiguity.
- [ ] Prove the two journeys: explicit Discovery → reviewed publication, and
  app development → Builder proposal → reviewed publication → another Project's
  explicit adoption. No prompt can alone prove dependable recognition.

### L6.4 — Close platform knowledge coverage

- [ ] Reconcile contextual assistance and current Brain inspection with L1's
  remaining census. Decide the local-release applicability of AnalyticQuery
  separately from static Query; never expose arbitrary SQL as its shortcut.
- [ ] Review the roadmap's cross-delivery local-release criteria, including
  usage/progress truth and outstanding Product scope dispositions. A Brain
  success does not declare unrelated F1 families implemented.

## Dependencies and exit

Consumes existing R2 Brain/binding foundations, L1 Builder context and L4
read-only source tools. L5 is only needed if a specific Discovery consumer
actually requires admitted background jobs. A fixed workflow or additional
agent is selected only for a demonstrated control-flow need.

Exit requires both real proposal-entry journeys, exact human-reviewed
publication and Project adoption, plus behavior/boundary proof. Prompt variant
selection, model calls and live source tests require the exact execution/proof
grant; installing a skill or registering a tool alone cannot close this claim.
