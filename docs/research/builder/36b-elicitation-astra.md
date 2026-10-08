# 36b. Requirements elicitation for the Conexus Builder

Study only. Independent second opinion by GPT-6 Astra. September 29, 2026.

The Builder should own software planning. The manager should own business intent and business choices. Test a short interview that discovers a real workflow, checks the ERP, and proposes necessary supporting behavior. Do not make the manager approve database design.

Firstmate offers useful delivery discipline for later. Superpowers offers a useful conversation pattern now. Neither repository establishes that a nontechnical manager can produce a usable internal app. The strongest local warning is Mitra. Its scoping agent filled the required categories while inventing consequential rules.

## Scope and evidence

I cloned both repositories with `git clone --depth 1` into separate directories in `planning-research`. I did not inspect the other researcher's report.

| Source | Snapshot inspected |
| --- | --- |
| [Firstmate repository][fm] | `0a2cdf952898e495cfd47c24c181fa228ca4c8aa` |
| [Superpowers repository][sp] | `8ca22dba9a94f28898bbce59f2537ff4d87c747d`, local `superpowers-astra/` |
| [Study 32](32-planning-harnesses-study.md) | Comparative planning study. Its results remain attributed observations. |
| Historical study 34 (not published here) | Planning artifacts, methodology arms, and evaluation design. |
| Current Planejar prompt (`apps/hub/src/builder/harness/prompt/v2/plan.md`) | Exploration, about three business questions, two plan sections, approval. |
| Mitra influence register (`docs/research/mitra/influence-on-conexus.md:697`) | Captured scoping prompt and observed scope and discovery runs. |

The task's decided points take precedence over Study 34's older wording about open decisions. Plans use per change folders under `docs/planos/`. Planning turns and individual tasks do not become versions. Missing sources remain visible and do not prevent plan approval. The experiment keeps the scripted person, browser checks, run operation tool first, prompt loop, two stages, gpt-6-luna first, Opus control, and capped research.

This is a source study and proposal. A repository instruction describes intended behavior. A fixture test proves a narrower implementation property. A user study would establish whether the method helps managers. Those are different evidence levels.

## 1. What Firstmate actually provides

### Architecture

Firstmate calls itself an agent distribution. A terminal agent loads `AGENTS.md`, conditional skills, helper scripts, and local state conventions. It supervises workers in separate sessions and worktrees. It is not an application generator with a fixed requirements pipeline. See its [overview][fm-readme] and [architecture][fm-architecture].

The supervisor talks to the user. Workers inspect or change projects. Bash helpers manage dispatch, state, messages, and supervision. A watcher detects actionable events without asking a model on each poll. Runtime adapters connect supported coding agents and terminal backends. Persistent secondmates can supervise scoped work from separate local or remote homes.

The important boundary is between user intent, supervisor instructions, and worker execution. User intent remains distinct from the supervisor's interpretation. Delivery modes determine what completion means. State lives on disk so a restarted session can recover.

### Flow from request to delivery

The [task lifecycle][fm-agents] does not require every idea to pass through a separate plan.

1. Resolve the project from the request, current work, and registry. Ask a concise question if the match is ambiguous.
2. Consult existing evidence before commissioning research.
3. Choose `ship` for an authorized change. Choose `scout` for a separate investigation or uncertainty that could change what to build.
4. Generate a brief. Preserve the user's words under `Captain's intent`. Put derived instructions under `Firstmate spec`.
5. Resolve the delivery mode and dispatch profile. Launch a worker in an isolated worktree.
6. Supervise execution. Deliver corrections through a durable inbox. Preserve unresolved decisions under stable keys.
7. For a scout, retain `data/<id>/report.md`. A recommendation does not authorize implementation. Separately authorized work can promote that scout.
8. For a ship, follow the selected delivery contract. Present the result for the configured merge authority.

This is a request, brief, execution, validation, and delivery flow. A scout can produce a plan. There is no mandatory product requirements document between every request and every build. Sources are [the lifecycle][fm-agents], [brief generator][fm-brief], and [scout completion][fm-scout].

### Artifacts and templates

The [home layout][fm-layout] distinguishes durable records from runtime state.

| Artifact | Role |
| --- | --- |
| `data/projects.md` | Project registry and delivery posture. |
| `data/backlog.md` | Work queue, dependencies, and completion pointers. |
| `data/<id>/brief.md` | Generated task contract. |
| `data/<id>/report.md` | Self contained scout result that survives teardown. |
| `data/captain.md` and `data/learnings.md` | Curated preferences and operational facts. |
| `state/` | Runtime records, task metadata, messages, and supervision state. |
| `config/` | Runtime, dispatch, and policy settings. |

`bin/fm-brief.sh` contains the templates. Ship and scout briefs contain the original request, Firstmate instructions, setup, rules, instruction inbox, and definition of done. A scout report must explain work, findings, evidence, and recommendations. Ship completion comes from `bin/fm-dod-lib.sh` and varies by delivery mode.

These are agent work contracts. They are not templates for business actors, domain entities, application screens, or functional requirements. The generated scout and ship sections are at [fm-brief.sh lines 499 onward][fm-brief].

### How it elicits requirements

Firstmate clarifies project ambiguity and escalates unresolved product decisions. Its [ask-user policy][fm-ask] reconstructs accepted intent before judging a proposed change. It can resolve an unambiguous correction itself. It escalates a new guarantee, broader subsystem, unsettled product choice, or destructive action.

An escalation states the original requirement, proposed expansion, smallest compliant alternative, consequences, and recommendation. This is a useful decision format. It is mainly a policy for findings during delivery, not a discovery interview for a manager.

The brief rules explicitly forbid expanding the user's request into a wider acceptance contract. That protects scope. It also means Conexus cannot copy Firstmate intake unchanged. A manager's omitted permissions or failure behavior still need investigation. The Builder should propose those requirements with visible provenance, then include only necessary or accepted behavior.

### How it verifies

Verification is mode specific. `no-mistakes` invokes a separate validation pipeline. The worker drives its gates. The supervisor handles decision authority. `direct-PR` skips that pipeline. `local-only` ends in a committed local branch before an authorized merge. See [completion contracts][fm-dod] and [validation supervision][fm-validation].

The completion machinery checks concrete delivery facts. Examples include the published head and whether a review is still a draft. The supervisor reads resolved current state rather than trusting a stale `done` event. A live process is not evidence that the intended result exists.

Do not infer that Firstmate always performs an independent review or proves a business outcome. The delivery mode changes its guarantees. The external `no-mistakes` implementation was not part of this study.

### Features worth considering later

| Feature | File paths | Conexus use and reason to defer |
| --- | --- | --- |
| Separate original intent from generated instructions. | [`AGENTS.md` section 11][fm-agents], [`bin/fm-brief.sh`][fm-brief], [`bin/fm-dod-lib.sh`][fm-dod] | Preserve what the manager said alongside inferred requirements. The distinction can inform the first experiment. Full briefing machinery can wait. |
| Durable corrections and keyed decisions. | `bin/fm-send.sh`, `bin/fm-task-inbox-lib.sh`, `bin/fm-classify-lib.sh` | Prevent a correction from disappearing during a long build or restart. Adopt once the basic manager loop works. |
| Decisions that survive a completion message. | `.agents/skills/captain-hold-lifecycle/SKILL.md`, `bin/fm-captain-hold.sh` | Keep unresolved business choices visible after partial delivery. Avoid importing its fleet state system. |
| Evidence based completion. | [`bin/fm-dod-lib.sh`][fm-dod], `bin/fm-crew-state.sh` | Tie claims to the actual approved artifact and checked build. Conexus needs operation and browser evidence, not forge readiness alone. |
| Scout promotion. | [`scout-completion/SKILL.md`][fm-scout], `bin/fm-promote.sh` | Reuse investigation evidence without treating research as permission to build. Useful for difficult integrations later. |
| Event driven supervision and recovery. | `bin/fm-watch.sh`, `.agents/skills/session-start-recovery/SKILL.md` | Reduce supervision cost in long builds. Adds little to validating the first usable app. |
| Curated durable memory. | `.agents/skills/stow/SKILL.md`, [`operational-home-layout/SKILL.md`][fm-layout] | Preserve confirmed vocabulary and ERP pitfalls. Avoid making inferred company policy permanent. |
| One liaison over isolated workers. | `bin/fm-spawn.sh`, `.agents/skills/harness-adapters/SKILL.md` | Hide execution complexity if builds later need parallel workers. Premature for the elicitation experiment. |

Paths without individual links resolve within the [pinned Firstmate tree][fm]. They are identified by the inspected lifecycle, layout, or architecture documents. They have not all received a function by function implementation review.

### Evidence that it works

Firstmate has executable regression tests, CI definitions, and maintainer verification records. I ran `bash tests/fm-brief.test.sh` in the isolated clone. It exited zero and emitted **35 passing checks**. The historical test covered brief generation and contract guards; its raw output is not published here. Both clones remained clean.

The repository's [isolation record][fm-proof] reports a historical run of 24 candidates with zero failures. Its [supervision verification][fm-supervision] records actual runtime probes and explicit limits. For example, one Grok hook ran without delivering its stdout to model context. This is more useful than a blanket success claim.

I did not reproduce those integration records. I did not run a live Firstmate fleet. I found no controlled evidence in the inspected material that Firstmate helps nontechnical managers elicit requirements or build business apps. Infrastructure reliability and requirements quality must be measured separately.

## 2. The exact Superpowers method at this snapshot

### Brainstorming

The [brainstorming skill][sp-brain] starts with intent. It identifies the desired outcome, audience, and success criteria. It reflects that understanding and distinguishes assumptions. It does not ask again when context already answers a question.

The current skill has three paths. A spike investigates a feasibility question. A bounded change gets a short design in chat. New projects and interface changes use the architectural path. Every path requires its specified approval before implementation.

The architectural conversation proceeds as follows.

1. Read the project context and assess scope. Split independent subsystems before discussing their details.
2. Ask one question per message. Prefer multiple choice where useful. Open questions are allowed.
3. Clarify purpose, constraints, and success criteria.
4. Offer two or three approaches. Lead with the recommendation and explain the tradeoffs. Remove unnecessary features.
5. Present the design in sections. Each section can be a few sentences or up to 200 to 300 words. Seek confirmation after each.
6. Cover architecture, components, data flow, errors, and testing. Return to clarification when needed.
7. Write `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md` and commit it.
8. Check placeholders, contradictions, scope, and ambiguity. Ask the user to review the written specification.
9. Only after that approval, invoke writing plans. Implementation still waits for the written plan review and execution choice.

The visual companion is optional and offered only when showing something would clarify a real question. It is not a default step for every conversation.

There is no fixed requirements template in this brainstorming file. It names design topics and a destination. There is also no quantified sufficiency test or interview length limit. The transition to design depends on the agent believing it understands the request. User approval and document checks follow. Those checks establish procedural completion, not that the user understood every implication.

### Writing plans

The [writing plans skill][sp-write] writes for an engineer unfamiliar with the codebase. It first maps files and responsibilities. A task is a deliverable that can be tested and reviewed independently. Individual steps are smaller actions.

Its actual template contains a title, worker instruction, goal, architecture, technology stack, specification path, global constraints, and review focus. Each task names files, consumed and produced interfaces, test assertions, implementation signatures, verification commands, expected output, and a commit step. See [the header and task template][sp-write].

Self review checks specification coverage, unambiguous steps, consistent interfaces, tests for risky input classes, and plan length. It rejects both vague instructions and plans that transcribe the whole implementation. The plan goes under `docs/superpowers/plans/YYYY-MM-DD-<feature-name>.md`.

The user reviews the written plan and chooses native or delegated execution unless that choice already exists. This engineering handoff should remain internal to Conexus. A manager should not choose an execution architecture.

### Executing plans

The [executing plans skill][sp-execute] now specifies continuous inline execution. It does not use the older pattern of stopping after an arbitrary batch for feedback.

It reads the plan and specification, checks shared interfaces, and records progress in `.superpowers/sdd/<plan-basename>/progress.md`. Each task starts from its exact brief. It runs the planned test cycle and compares observed output with every expected result. Deviations become recorded rulings. A task completes only after its required checks pass.

The executor normally continues across tasks. Destructive actions, security sensitive actions, certain external side effects, or a plan with no defensible path forward require a stop. A final branch review follows execution. The skill preserves rulings and deferred findings in the final report.

The transferable elements are small testable units, durable progress, and explicit deviations. The risks are a confidently wrong specification and late discoveries from real users. An executor can follow a detailed plan perfectly and still build the wrong business workflow.

## 3. Established elicitation methods and their limits

These methods have practitioner or institutional backing. The sources below do not prove that an AI chat using them will succeed with Conexus managers. Treat them as components to test, not a validated combined recipe.

| Method | What to borrow | Limit for this audience |
| --- | --- | --- |
| [Volere requirements checklist](https://www.volere.org/templates/volere-requirements-specification-template/) | Check purpose, stakeholders, constraints, vocabulary, business data, functions, and quality requirements. Give each requirement a measurable fit criterion. | The full checklist is too large for a chat interview. Use it internally to detect omissions. The public extract is the source here, not the paid full template. |
| [NASA requirement checklist](https://www.nasa.gov/reference/appendix-c-how-to-write-a-good-requirement/) | Check that a requirement is clear, necessary, feasible, traceable, and verifiable. Keep the required behavior distinct from implementation. | A document quality check cannot discover a missing stakeholder or validate an invented business rule. |
| [Jobs to be Done](https://www.christenseninstitute.org/theory/jobs-to-be-done/) | Understand the progress someone needs in a specific situation. Ask about the work and current workaround before assuming an app feature. | A desired outcome does not specify permissions, data meaning, or recovery behavior. |
| [Jeff Patton's story mapping guide](https://jpattonassociates.com/wp-content/uploads/2015/03/story_mapping.pdf) | Arrange activities and tasks in the order a person performs them. Choose a small release that supports a complete useful journey. | A manager may describe the official process and omit actual operator workarounds. A feature list sorted by priority is not a story map. |
| [EventStorming](https://www.eventstorming.com/) and [incremental notation](https://www.eventstorming.com/patterns/incremental-notation/) | Reconstruct business events and handoffs. Introduce notation gradually for first time participants. | A chat with one manager cannot replace a collaborative workshop with conflicting perspectives. “Lite” below is our adaptation, not a proven official variant. |
| [Example mapping](https://agilealliance.org/user-story-conversations/) | Connect each rule to concrete examples and unresolved questions. Use normal and exceptional cases to expose ambiguity. | The agent can invent examples that merely agree with its own rule. User or independent evidence must anchor consequential cases. |
| [Contextual research](https://www.gov.uk/service-manual/user-research/contextual-research-and-observation) | Observe people doing real work with their existing documents and devices. Ask about the activity while it happens. | A scripted person cannot reproduce hidden workarounds, embarrassment, or organizational conflict. Real participants remain necessary. |

For a manager, combine these as one short work story. Establish what triggers the work, who does it, what decision follows, and how success becomes visible. Then examine one exception. Let the Builder derive functions and storage from that story.

### What Mitra's sufficiency gates actually establish

The captured prompt (`docs/research/mitra/influence-on-conexus.md:724`) requires sufficient information about four categories. They are the system goal, actors, main business rules, and expected flows. The agent then asks permission to generate the scope document. Completion uses a sentinel marker.

The exact embedded document skill was not extracted in that study. Do not treat the later observed document as the original mandatory template. The observed output (`docs/research/mitra/influence-on-conexus.md:789`) had ten sections, including alternatives, acceptance criteria, and open points.

In the observed conversation, Mitra asked five questions together. The user requested recommendations. The agent then supplied scoring weights, identity mapping, conversion linkage, and a snooze interval. Some assumptions appeared as settled rules. This is direct counterevidence to equating category coverage with trustworthy requirements.

Later discovery (`docs/research/mitra/influence-on-conexus.md:869`) found that the proposed conversion field did not exist and that the data distribution challenged a scoring premise. The builder recorded business decisions rather than silently changing the rule. The study reports seven blocking open points and five resolved points.

This supports auditing scope against data. It does not establish that the complete pipeline worked for a novice. The starting prompt had 23 sections and substantial technical direction. The four categories should remain a coverage checklist, with a separate evidence state for every claim.

## 4. Proposed Builder elicitation component

### Own the planning burden

Begin with the job, people, core flow, and observable result. Use business nouns in Portuguese. Derive data structures, functions, and screen logic internally. A source dictionary can reveal a field. It cannot decide whether the company's policy should use that field.

Treat elicitation and discovery as a short loop inside Planejar. Read existing project knowledge and available source metadata first. If the business purpose is unclear, ask that one question before an expensive data search. Then inspect the sources needed for the emerging workflow. Reopen only questions that new evidence changes.

This preserves the current prompt's “explore before you ask” intent. It avoids a rigid sequence where the agent exhaustively explores irrelevant ERP tables before learning the job.

### Proactively consider more than the initial request

Every category below gets an internal disposition. Include, propose, defer, or not applicable. A reason accompanies deferred and inapplicable items. Considering a category does not automatically authorize a new feature.

| Category | Builder responsibility | Business choice to ask only if unresolved |
| --- | --- | --- |
| Functional workflow | Identify trigger, actor, action, rule, result, and next step. Distinguish viewing from changing data. | What action should the person take after seeing this information? |
| Data model | Derive entities, relationships, identifiers, history, and ownership. Separate ERP facts from app authored records. | Should a note belong to the customer or to one transaction, when the workflow leaves that unclear? |
| Roles and permissions | Reuse established identity and access policy. Check company and team boundaries. Never infer authority from the connector's broad technical access. | Who may see or change another team's records? |
| Audit | Consider actor, time, action, prior state, and correction history for app changes. | Does this action need formal approval or a reason? |
| Notifications | Identify event, recipient, channel, repeat behavior, and failure handling. Default to no external sending unless accepted. | Would an in app reminder suffice, or does someone need an external notice? |
| Reports | Define measure, period, status filters, grouping, totals, and data freshness. Prove joins and pagination. | Which business interpretation applies when two valid definitions differ? |
| Edge cases | Consider duplicates, partial records, cancellation, concurrent edits, repeated submission, and unavailable sources. | What business consequence should follow the ambiguous exception? |
| Empty and error states | Distinguish no matching records, no access, incomplete source data, and a failed load. Do not render all as zero. | Usually no question. State the chosen behavior in the plan. |
| Imports | Check whether a copy is needed. Design source identifiers, retry behavior, deduplication, update strategy, and freshness display. | How stale may data be before the decision becomes unsafe or useless? |
| Quality and operation | Consider Portuguese copy, dates, currency, accessibility, device use, recovery, and expected volume. | Ask only about a material constraint absent from existing policy and evidence. |

For an analytical app, do not create a second editable customer database merely because the checklist contains “data model.” For a view only workflow, custom approval chains and audit screens may be unnecessary. Existing platform guarantees should be referenced, not rebuilt.

### Ask one decision at a time

Each question should explain a concrete consequence. Offer a recommended option and one or two meaningful alternatives. Support “I do not know” and a free answer. Do not preselect a choice and later describe it as user confirmation.

For example, ask in Portuguese who may view the team's customers. Explain that the proposed restricted view limits each salesperson to their assigned customers, while managers see the team. Recommend it only when that fits verified policy. Otherwise say it is a proposal that needs the responsible person's decision.

Avoid questions about table names, SQL, database type, function signatures, or where a field lives. Inspect those. Ask about meaning when evidence leaves multiple valid business interpretations. A populated field proves that a value exists, not what policy should apply.

When an answer arrives, reflect its consequence in one short sentence and update the requirements record. Validate the emerging flow incrementally. Do not ask the manager to approve separate architecture, specification, and execution documents.

A real example can help. Ask for a business reference only when the manager must identify the intended case. Retrieve its details through the authorized connection. Do not ask the person to paste records the Builder can read.

### Stop on sufficient coverage for a useful first build

There is no reliable numerical completeness score yet. Test the following explicit conditions.

1. The intended outcome and primary actor are known. At least one end to end business flow is described.
2. Every requested item appears in the requirements section. Its origin, scope disposition, business decision state, source state, and acceptance check are explicit.
3. The Builder has considered each supporting category above. It has explained inclusions and omissions.
4. Each included source dependent requirement has evidence of a usable source, or a visible limitation and defined fallback. Counts cover population, pagination, and duplicate keys where relevant.
5. Material rules have a normal example and a boundary or exception example. Important unknown rules remain unknown rather than becoming invented constants.
6. Every included behavior is decidable by Construir. An unresolved authority or consequential policy choice excludes or disables that behavior until settled.
7. The person sees a short description of the useful result, assumptions, omissions, and missing items before approval.

Distinguish readiness to approve a limited plan from readiness to execute every requested behavior. Missing data never disables the approval button. The plan states what will work and what will remain unavailable. Approval of that limited plan does not invent permission, source data, or a business rule.

Use Study 34's roughly three feature questions and five new app questions as initial budgets. They are experimental guardrails, not sufficiency criteria. Ask fewer when context settles the choices. At the budget, draft the useful safe subset and expose unresolved items. Let the person refine it without requiring an endless interview.

An unanswered question remains unanswered. A low consequence display default can be a labeled assumption. An unanswered permission or external action question cannot become permission. Reopen the interview only for new evidence or a requested scope change.

### Write the requirements into the existing plan

Write `docs/planos/NNNN-slug/plano.md`. Keep `Para a pessoa` and the technical structure already proposed in Study 34. Put a `Requisitos` section within the person's part. Preserve stable requirement identifiers across revisions. Detailed source proofs stay in `Fontes`; operations and screens stay in `Estrutura`.

The following is an original template for the experiment. The study uses English. The actual plan and question cards use Portuguese.

```markdown
# <Change title>

## Para a pessoa

<Three to seven lines about the usable result.>
<Visible count and effect of missing or contradicted items.>

### Requisitos

#### Outcome and workflow

Outcome: <the decision or work this enables>
People: <actors and their permitted scope>
Main flow: <trigger, action, result, next step>
Success: <observable result for the person>

#### Requirements

| ID | Behavior in business words | Origin | Scope | Decision | Source status | Acceptance |
| R1 | <one behavior> | <user request, derived need, or suggestion> | <included, deferred, excluded> | <confirmed, assumed, unresolved> | <confirmed, contradicted, not found, not applicable> | <observable check> |

#### Rules and examples

| Requirement | Rule | Normal example | Exception example | Evidence or decision reference |
| R1 | <rule> | <synthetic or protected reference> | <boundary and expected result> | <answer or source pointer> |

#### Supporting behavior

| Category | Disposition and reason | Requirement IDs |
| Permissions | <existing policy, proposal, or excluded behavior> | <IDs> |
| Audit | <decision> | <IDs> |
| Notifications | <decision> | <IDs> |
| Reports | <decision> | <IDs> |
| Errors and empty states | <decision> | <IDs> |
| Imports and freshness | <decision> | <IDs> |
| Quality constraints | <decision> | <IDs> |

#### Assumptions, missing items, and exclusions

<Each unresolved item, its consequence, and the planned fallback.>
<The business owner needed for any outstanding decision.>
<No company values or secrets.>

## Fontes

<Study 34 source table, keyed by requirement ID.>

## Estrutura

<Entities, operations, screens, and runnable checks keyed by requirement ID.>
```

Origin, decision state, and source state are separate columns for a reason. The user can confirm a desired metric while the ERP source remains not found. The Builder can verify a source while the rule using it remains unapproved.

## 5. Fit into the Study 34 bakeoff

Use this as an elicitation component attached to A1, the improved durable plan. Compare A1 with A1 plus this component. Keep storage, build execution, source discovery capability, research budget, and approval behavior identical. This isolates the value of the interview and coverage checklist.

Do not add Firstmate orchestration, another planning agent, or another approval tool for this comparison. The study requires no new Mastra mechanism. I loaded the repo's Mastra and development skills and checked that `@mastra` packages are installed. I made no version specific API proposal.

| Candidate comparison | Benefit | Cost or confound |
| --- | --- | --- |
| A1 against A1 plus elicitation | Tests questions, inferred supporting requirements, and sufficiency rules. | The checklist and question strategy change together. If it wins, a later ablation can separate them. |
| B against B plus elicitation | Tests the component inside scope then discovery. | Extra scope approval may explain differences in effort or correction. Keep this for a later test. |
| Full Superpowers process | Tests extensive incremental approvals and engineering plans. | Changes too many variables and burdens a manager with technical reviews. Do not use as the first comparison. |

Keep the decided two stage screening and confirmation process. Use gpt-6-luna first and an Opus control afterward. Preserve capped research. Build the run operation tool before evaluating execution outcomes. Planning turns and tasks remain distinct from app versions.

Keep the scripted person and browser checks. Strengthen the answer sheet so the simulated person has a business goal, known rules, unknown facts, and a permission boundary. It must answer “I do not know” when appropriate. It must not invent the missing software plan or approve the first option by position.

Add cases that expose elicitation failures. Include an underspecified request, a misleading populated field, a missing source, a restrictive access rule, and a late correction. Include a person who accepts suggestions too easily. Use held out wording. Keep the oracle and hidden expected results out of the Builder and scripted person's context.

Record these measures in addition to Study 34's source correctness and Preview completeness.

1. Required business behaviors recovered, against an independently written case rubric.
2. Unsupported commitments presented as confirmed facts.
3. Unnecessary features included without a link to the job or explicit acceptance.
4. Questions that data or existing context could answer.
5. Material unknowns that survive visibly through approval and build.
6. User answer time, question count, abandonment, and corrections after the first Preview.
7. Permission and external action violations, including violations hidden by a convincing happy path.
8. Whether the person can explain what the app will and will not do after reading the plan.

Do not reward the number of requirements or questions. A longer plan can score better on coverage while making the product less usable. Correctness and useful task completion should lead. Time and token cost break ties. Consequential authority violations should disqualify a run.

The scripted evaluation checks consistency under controlled answers. It cannot establish novice usability. After screening, observe actual Portuguese speaking managers performing their own work. Include at least one daily operator whose workflow differs from the manager's description. Watch whether they correct a bad recommendation, notice a missing item, and complete the intended task in the Preview. Treat that as a separate validation stage, not a simulated score.

## 6. Where this approach can fail

The manager may not know the process they are commissioning. Approval by the requester does not replace input from operators or the owner of permissions. Record that missing perspective.

A recommendation can anchor the answer. A novice may select it because it sounds expert. Use concrete consequences and measure whether people can reject a deliberately unsuitable suggestion in a controlled usability test.

One question per turn reduces immediate load but can make the whole interview slow. Reuse known answers. Show a short evolving flow. Do not turn each checklist row into a separate question.

The checklist can inflate scope. Audit, notifications, imports, and reports are candidates to consider. They are not mandatory custom subsystems for every app.

ERP facts can mislead. A field may exist but be mostly empty. A join may duplicate records. Historical records may use different semantics. Source confirmation needs population and relationship checks, not just schema discovery.

A plausible plan can hide a wrong rule. Both the planner and executor may share the same misconception. Independent business examples and the oracle matter more than another prose review by the same model.

An approval button can produce false confidence. The person may understand the desired screen but miss a source limitation. Show the limitation's practical effect near approval. Test comprehension instead of assuming it.

The first working Preview can reveal needs the interview missed. Keep requirements revisable and make exclusions easy to reopen. Do not promise that one planning conversation can discover everything a platform needs.

## Evidence and unproven claims

The deliverable is this study. No Builder code changed. No issue, pull request, push, or live fleet was created. The research directory and output directory are not Git repositories, so this study has no commit. The two clone SHAs above identify the source evidence.

The fresh executable result is 35 passing Firstmate brief checks in one suite. This is not a count of app builds or user studies. No screenshots were produced because no user interface was exercised. Historical Firstmate integration results and Mitra observations remain attributed to their records.

The proposed question budgets, stop conditions, requirements template, and paired experiment have not been run. Their effect on app quality, time, and manager comprehension is unproven. The exact Mitra embedded document template remains unavailable in the inspected record.

The Experience First principle changed the proposal toward one short business conversation and one plan approval. The Prove It Works principle changed the evidence standard toward observed behavior and explicit limits. I read both leaf skills in full. I performed the study and final review myself because the task forbids delegation. There was no independent review within this run.

[fm]: https://github.com/kunchenguid/firstmate/tree/0a2cdf952898e495cfd47c24c181fa228ca4c8aa
[fm-readme]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/README.md
[fm-architecture]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/docs/architecture.md
[fm-agents]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/AGENTS.md#L160
[fm-brief]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/bin/fm-brief.sh#L499
[fm-dod]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/bin/fm-dod-lib.sh#L341
[fm-scout]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/.agents/skills/scout-completion/SKILL.md
[fm-layout]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/.agents/skills/operational-home-layout/SKILL.md
[fm-ask]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/.agents/skills/ask-user-authority/SKILL.md
[fm-validation]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/.agents/skills/validation-supervision/SKILL.md
[fm-proof]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/docs/fm-test-isolation-proof.md
[fm-supervision]: https://github.com/kunchenguid/firstmate/blob/0a2cdf952898e495cfd47c24c181fa228ca4c8aa/docs/verification/supervision.md
[sp]: https://github.com/obra/superpowers/tree/8ca22dba9a94f28898bbce59f2537ff4d87c747d
[sp-brain]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/brainstorming/SKILL.md#L193
[sp-write]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/writing-plans/SKILL.md#L51
[sp-execute]: https://github.com/obra/superpowers/blob/8ca22dba9a94f28898bbce59f2537ff4d87c747d/skills/executing-plans/SKILL.md
