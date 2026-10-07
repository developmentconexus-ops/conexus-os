# Study 32: How harnesses plan a software project

Study only. Nothing here is a decision. Date: 2026-09-29. Author: worker (Sonnet 5.5).

The goal is to shape, later, a planning skill for the Conexus Builder. The Builder serves managers who do not code. A manager describes an app in Portuguese. The Builder plans, asks, builds and checks.

## How to read the evidence

I mark every claim of results with one of three labels.

- **Data.** A paper or a measurement with numbers.
- **First party account.** The vendor says it worked, with a concrete example but no controlled test.
- **Marketing.** A claim of results with no data.

Almost every product source below is marketing or a first party account. The only hard data is in a few papers, and they are about developer agents, not app builders for non coders. I say so each time.

Note on the historical brief. Its "study 12 plan display" pointer was incorrect. The study used
historical study 26 (P5) instead; that retired study is not published in this reference set.

## 1. Approaches, one by one

### 1.1 jm-scope (local skill)

Sources: SKILL.md (`jm-scope/SKILL.md`), scope-template.md (`jm-scope/scope-template.md`), modes/plan.md (`jm-scope/modes/plan.md`), approaches/tracer-bullet.md (`jm-scope/approaches/tracer-bullet.md`).

- **Artifacts.** One living file, `docs/scope/scope.md`. It has an "At a glance" table (number, feature, phase, status) and one section per feature. Each section has an intent of one or two lines, one `Done when:` line, and checkbox steps. Large products split into an `index.md` plus one file per epic. It also has a header with a build approach and a workflow tier.
- **Phases.** Three behaviours, inferred from context: plan (no scope yet), replan (scope exists, no argument), add (one named feature). Plan runs: detect greenfield, brownfield or monorepo; ask; choose a build approach; decompose; order; write.
- **Who asks.** The skill asks. It asks a generated walk of questions, batched up to four per panel, and never stops while a load bearing dimension is unasked. Every panel has 2 to 4 options and exactly one marked recommended. The skill infers what it can and asks only what the person alone knows.
- **Build approach.** The engineer picks one of four: Tracer Bullet, Skateboard, Facade, Journey. Each has a persona file that decides how to slice. Default for production is Tracer Bullet: the thinnest real thread through every layer first, then thicken.
- **Rule worth noting.** The scope never names a tool. A feature that implies a tool choice is marked "needs a decision" and goes to jm-architect.
- **Link to build and verify.** Each feature carries commands as checkboxes: design it, build it, verify it, test it. A workflow tier (Prototype, Alpha, Beta, GA) sets how much verification runs after the build. The next step is always the first unticked box.
- **Evidence.** None published. It is a personal skill. Treat as design, not as validated.

### 1.2 jm-architect (local skill)

Sources: SKILL.md (`jm-architect/SKILL.md`), spec-template.md (`jm-architect/spec-template.md`), internal/design-conversation.md (`jm-architect/internal/design-conversation.md`).

- **Artifacts.** One spec per decision in `docs/specs/NNNN-title.md`, or a directory with `index.md` (the build spec) plus `rationale.md` (the decision record). Sections include Summary, Requirements with numbered acceptance criteria (AC-1 and so on), Options considered, Decision, Feature design, Build plan, Consequences, Follow-up, References. Status: Proposed, In Progress, Accepted, Assumed, Superseded.
- **Phases.** Pre-flight (read repo context, find the scope row, check overlap), scope validation, framing, a staged design conversation (stages a to f), write, then a check of the spec, a cross model critique, confirmation, and linking back into the scope.
- **Who asks.** The skill. It sorts every question into infer, ask or recommend. Ask only what the engineer alone knows. Recommend anything expertise settles, with a runner up. It never bundles a full data model or full acceptance criteria into one accept panel.
- **Shown and approved.** The spec is confirmed by the engineer. The optional cross model critique looks for "decision completeness": values the builder would otherwise invent.
- **Link to build.** The spec's Build plan is ordered by the build approach. Only a 2 to 5 item milestone rollup goes into the scope. Atomic tasks stay in the spec.
- **Evidence.** None published.

### 1.3 poteto-mode and pstack (local plugin)

Sources: poteto-mode SKILL.md (`poteto-mode/SKILL.md`), feature playbook (`poteto-mode/playbooks/feature.md`), architect (`architect/SKILL.md`).

- **Artifacts.** No planning file format. The plan lives in a todolist copied from a playbook, a throughput checkpoint (four items: blocking first steps, independent workstreams, shared state, smallest safe decomposition), and for long runs a decision trail (TSV).
- **Phases.** Playbook per task type (feature, bug fix, investigation, and so on). Feature: understand with `how`, design with `architect`, checkpoint, delegate, verify on the real surface, small ordered commits. Architect has five phases: ground, sketch (two structurally distinct designs), agree (opt in), implement, scrap.
- **Who asks.** Rule "never block on the human": reversible work proceeds and the human corrects after. One key rule: if a "which approach" fork can be settled by running something, run a prototype instead of asking. Ask only for real product or preference calls.
- **Link to verify.** Strong. "Prove it works" against the real artifact, and small units that each end in a check.
- **Evidence.** None published.

### 1.4 Our current Planejar mode

Sources: `apps/hub/src/builder/harness/prompt/v2/plan.md`, studies 26, 27, 28, 29 in `docs/research/builder/`.

- **Artifacts.** One Markdown file under `.conexus/plans/`, with two exact headings: `## Para a pessoa` and `## Para Construir`. The first part has what the person will see in the Prévia, each requested thing marked confirmed (with its source) or not found, assumed business rules, and what is left out. The second part has screens, routes, server operations, tables, Conexão reads and acceptance checks. "Construir makes no new decisions."
- **Phases.** Triage the message (question, greeting, request that needs a missing Conexão, or build request). Explore files and Project knowledge. Read real samples from each Conexão. Ask at most about three business questions. Write the file. Call `submit_plan`.
- **Who asks.** The model, through `ask_user`, one question per call, with options and a recommendation. Rule: never ask what the files or data can answer.
- **Shown and approved.** A plan card with "Aprovar e construir" and "Pedir ajustes". On changes the model edits the same file and calls `submit_plan` again.
- **Known weaknesses, from our own study 27.** The plan format had no place where an unconfirmed source blocks the build. The run approved a plan with 4 of 6 sources unconfirmed. The person-facing part softened a gap into "when the data is accessible". The flow lost the person's correction. Study 26 says the card shows the plan as raw monospace text, and proposes rendering Markdown with the person's part first.
- **Evidence.** One traced run (the quote app), recorded in study 27. It is a case study, not a benchmark.

### 1.5 Mastra Code plan mode (the source of our prompt)

Source: `mastracode/sdk/src/agents/prompts/plan.ts` and `sdk/src/processors/plan-rejection-abort.ts`.

- **Artifacts.** A plan file under a plans directory, with Overview, Complexity Estimate, Steps (file, change, why), Verification.
- **Phases.** Explore (read only), write the file, `submit_plan`, approve or request changes.
- **Approval.** Three choices: approve (switches to build mode), start as goal (keeps working until a judge says done), request changes. On rejection a processor aborts the loop at once, so the model waits for feedback. Revisions edit the same file and the user sees a diff.
- **Link to build.** The build prompt puts the approved plan at its top (`activePlan`). The plan is written "goal ready": verifiable outcome, ordered steps, verification criteria.
- **Who asks.** Nothing in the prompt about questions. The prompt has no ask step, unlike ours.
- **Evidence.** None published.
- **Factory variant.** The `factory-plan` skill (`mastracode/factory/factory-skills/factory-plan/SKILL.md`) is the opposite. It never asks a human mid run. Every fork becomes a recorded assumption, and only real product calls stay as open questions. Its phases: verify the understanding, design, write (goal, scope, phases with tests, risks, assumptions, open questions), transition.

### 1.6 Claude Code plan mode and Anthropic guidance

Sources: [Best practices](https://code.claude.com/docs/en/best-practices), [Common workflows](https://code.claude.com/docs/en/common-workflows), [Permission modes](https://code.claude.com/docs/en/permission-modes), [Effective harnesses for long running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents).

- **Artifacts.** A plan the user can open and edit in a text editor (Ctrl+G). Optionally a `SPEC.md` written after an interview.
- **Phases.** Explore, plan, implement, commit. In plan mode Claude reads and proposes but does not edit until approval.
- **Who asks.** For larger features, the user prompts Claude to "interview me" with the `AskUserQuestion` tool: ask about the hard parts the user might not have considered, then write the spec. Then start a fresh session to build, so implementation has clean context.
- **Approval.** The user approves the plan or edits it.
- **Verify.** The strongest line in the guide: "Give Claude a check it can run." A spec is best when it names files and interfaces, states what is out of scope, and ends with an end to end verification step.
- **When to skip.** "If you could describe the diff in one sentence, skip the plan."
- **Evidence.** First party account. The page says the patterns "have proven effective across Anthropic's internal teams" with no numbers. The long running agents post is stronger: it says a frontier model without a structured feature list (with pass or fail flags), a progress file and an init script failed to build production quality apps, and names four failure modes the artifacts fixed. It is a case description, not a controlled test.

### 1.7 OpenAI Codex ExecPlans

Source: [Using PLANS.md for multi hour problem solving](https://raw.githubusercontent.com/openai/openai-cookbook/main/articles/codex_exec_plans.md) and the [cookbook page](https://developers.openai.com/cookbook/articles/codex_exec_plans).

- **Artifacts.** One living file, an ExecPlan. Required sections: Purpose and big picture, Progress (checkboxes with timestamps), Surprises and discoveries, Decision log, Outcomes and retrospective, Context and orientation, Plan of work, Concrete steps (exact commands and expected output), Validation and acceptance, Idempotence and recovery.
- **Rules.** The plan is self contained: a novice with only the file can restart. It must be updated as work proceeds. Milestones are independently verifiable. Acceptance is phrased as behaviour a human can check.
- **Who asks.** The plan is written for autonomous execution. Questions are not a designed part.
- **Evidence.** First party account. The page cites one example that let Codex work for more than seven hours. No comparison against no plan.

### 1.8 Kiro spec driven development

Sources: [Specs overview](https://kiro.dev/docs/specs/), [Feature specs](https://kiro.dev/docs/specs/feature-specs/).

- **Artifacts.** Three files per feature: `requirements.md` (user stories with acceptance criteria in EARS form, "WHEN condition THE SYSTEM SHALL behaviour"), `design.md` (architecture, data flow, error handling), `tasks.md` (trackable tasks with live status). Bugs use a separate bugfix spec.
- **Phases.** Requirements, design, tasks, in order. Two entry paths: requirements first or design first. Review gates sit between phases. Tasks can run one by one or in parallel waves.
- **Approval.** The user reviews each document before the next phase.
- **Evidence.** Marketing for results. The one outside view I found is a critique on Martin Fowler's site ([Understanding Spec Driven Development](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)). Kiro turned a small bug into "4 user stories with a total of 16 acceptance criteria". The author calls this a sledgehammer for a nut. Same critique below for Spec Kit.

### 1.9 GitHub Spec Kit

Sources: [repo](https://github.com/github/spec-kit), [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md), and the Fowler critique above.

- **Artifacts.** Files under `.specify/`: a constitution (project principles), a spec, a plan, tasks. Templates force structure and keep implementation detail out of the spec.
- **Phases.** Constitution (once), specify, plan, tasks, implement, converge (verify against the spec).
- **Who asks.** The spec template makes uncertainty explicit with `[NEEDS CLARIFICATION]` markers so the model does not guess plausibly. The agent asks iteratively.
- **Gates.** Pre implementation gates check simplicity, anti abstraction and test first.
- **Evidence.** Marketing. The methodology doc has no data. It claims documentation time falls from about 12 hours to 15 minutes, with no source. Fowler's author found "a LOT of markdown files", repetitive with each other and with the code, and agents that ignored the notes and made duplicates. He prefers "small, iterative steps".

### 1.10 BMAD method

Source: [repo](https://github.com/bmad-code-org/BMAD-METHOD).

- **Artifacts.** Briefs, specifications, architecture and durable product and technical decisions carried between phases. The wider method (from outside knowledge, not confirmed on this page) uses role agents such as analyst, PM, architect and scrum master, and story files. I could not confirm that list from the page I read.
- **Phases.** Clarify, plan, build and verify, learn and adjust. It says it is right sized: "Small changes go straight to build."
- **Evidence.** None. The page has stars and forks only. Marketing.

### 1.11 Cursor plan mode

Sources: [Plan Mode docs](https://cursor.com/docs/agent/plan-mode), [Agent best practices](https://cursor.com/blog/agent-best-practices).

- **Artifacts.** An editable Markdown plan with file paths and code references. Saved in the home directory by default, with "Save to workspace" to keep it.
- **Phases.** Research the codebase, ask clarifying questions, write the plan, wait for approval, build from the plan.
- **Evidence.** Marketing plus one outside citation. Cursor says "The most impactful change you can make is planning before coding" and cites a University of Chicago study that experienced developers plan more before generating code. That is a study of what experts do, not a test that planning improves results. Cursor also says not every task needs a plan.

### 1.12 Devin interactive planning

Sources: [Devin 2.0](https://cognition.com/blog/devin-2), [Devin docs](https://docs.devin.ai/work-with-devin/interactive-planning). The docs page I fetched did not describe the mechanics, so the account below comes from the search summary of the Devin 2.0 post.

- At session start Devin researches the codebase and returns relevant files, findings and a preliminary plan in seconds. The user can edit the plan before Devin works on its own.
- **Evidence.** Marketing. No numbers found.

### 1.13 Lovable

Sources: [Plan mode docs](https://docs.lovable.dev/features/plan-mode), [Chat mode and follow up questions](https://lovable.dev/blog/chat-mode-and-questions).

- **Modes.** Chat (talk, cheap), Plan (investigate and write a plan, never changes code), Agent or Build (implement).
- **Plan contents.** Approach, key decisions, assumptions and constraints, components, data models and APIs, step by step sequencing, optional diagrams.
- **Who asks.** Lovable "often asks clarifying questions" before proposing. Follow up questions exist because "most AI mistakes happen because the AI doesn't fully understand what you want to build".
- **Approval.** Plans are fully editable. The user can comment on selected text, edit in the Plan view or ask in chat. There is version history. On approval it switches to Build and starts at once.
- **Cost.** A Plan message is one credit, so planning is cheap to try.
- **Evidence.** Marketing. The blog claims "fewer iterations" with no metrics.

### 1.14 Bolt

Sources: [Plan and Discussion mode](https://support.bolt.new/best-practices/discussion-mode), [Discussion mode](https://support.bolt.new/docs/discussion-mode).

- A Plan toggle (earlier called Discussion mode). No code is generated. It sees the codebase and recent messages and can search the web. After a reply, buttons such as "Implement this plan" switch to Build. A separate "Enhance prompt" control interviews the user with guided questions and rewrites the prompt.
- The stated benefit is saving tokens. Evidence: marketing.

### 1.15 v0

Sources: [Community post on Plan Mode](https://community.vercel.com/t/from-prompt-to-plan-building-with-intention-in-v0/31022), [search results on the "Use Advanced Planning" option and complaints](https://community.vercel.com/t/v0-agent-repeats-same-plan-despite-new-requirements-in-planning-mode/34088).

- Plan Mode is a preset. The agent outlines its approach with no code, and implementation starts only after approval. "Use Advanced Planning" changes how much v0 interrogates the request.
- A planning question streams only the question and makes no preview.
- Evidence: user testimonials only. One community thread reports the agent repeating the same plan despite new requirements. That is the same failure as our study 27 (RC5, corrections lost).

### 1.16 Replit Agent

Sources: [Plan Mode docs](https://docs.replit.com/core-concepts/agent/plan-mode), [launch post](https://replit.com/blog/introducing-plan-mode-a-safer-way-to-vibe-code).

- A Plan toggle. The agent can read the repo and docs but cannot change files. It produces an ordered task list. "Start Building" (or "Build in background") approves the plan and runs it as a separate task. Plan mode is billed like other Agent work.
- Evidence: marketing. The launch post gives no numbers.

### 1.17 Mitra (reference in `docs/research/mitra`)

Sources: full-study.md (`docs/research/mitra/full-study.md`) sections 5, 13, 14.1, 15 and the influence register (`docs/research/mitra/influence-on-conexus.md`).

- **Two stages.** "Mitra Escopo" is a separate tool that turns "I want a CRM" into a functional spec. Elicitation runs against four sufficiency gates (goal, personas, rules, flows). There is a human gate before the document is generated. A completion sentinel marks the end. It uses a different model from the builder.
- **Build stage.** The build agent works through eight phases: discovery (query the ERP), architecture, alignment (confirm canonical definitions with the user), checkpoint (contract approved before code), planning documents, implementation, test, review.
- **Central finding.** Stage 2 audits stage 1 against real data. The scope stage invents values to close fast. The build agent checks them with SQL and stops on business decisions. Example: the plan assumed a rule that the data contradicted (most open quotes were older than the assumed limit), so the agent recorded a business decision and blocked the build. A margin feature was cancelled because the cost field was not cost in most rows.
- **Planning documents are memory.** The agent writes `integracao-sankhya.md`, `featuresearquitetura.md`, `ux.md`, `design.md`, `tasks.md` in the repo and rereads them turns later.
- **Honesty.** The project states what it could not do, with numbers, and acceptance criteria are checkable ("Pending on screen = n / R$ x, matches the ERP").
- **Evidence.** One observed project run and a captured scoping conversation. A case study of an existing product, not a controlled test. Our own study calls the pipeline result "the most important finding".

## 2. Academic and engineering evidence on planning

| Source | What it tested | Result | Fit to us |
|---|---|---|---|
| [An Empirical Study of Harness Design for Coding Agents (arXiv 2609.20804)](https://arxiv.org/abs/2609.20804) | Planning, action space and context management ablations, 176 matched settings, four models, SWE-Bench Verified and Terminal-Bench 2.1 | Planning "shifts from an accuracy scaffold for weaker models to a cost saver for stronger models, with little change in accuracy". The abstract gives no numbers. I did not read the full paper. | Weak: it studies bug fix benchmarks in a coding harness, not app creation. Still the best data that planning is not a free win for strong models. |
| [Self-planning Code Generation (arXiv 2303.06689)](https://arxiv.org/abs/2303.06689) | Plan first, then implement, on function level code generation | Up to 25.4 percent relative gain in Pass@1 over direct generation, up to 11.9 percent over chain of thought | Old models, small tasks. Shows the direction only. |
| [Agentless (arXiv 2407.01489)](https://arxiv.org/abs/2407.01489) | A fixed three step pipeline (localize, repair, validate) versus open agents on SWE-bench Lite | 27.33 percent at 0.34 dollars, best and cheapest of the open source agents at that time | A fixed process can beat freeform agent planning. Old result. |
| [Anthropic, long running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) | Structured feature list, progress file, one feature at a time, end to end test before ticking | Says an unstructured run failed to deliver production quality apps and names four fixed failure modes | First party, no numbers. Most relevant to whole app builds. |
| [Fowler site critique](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | Hands on use of Kiro and Spec Kit | Spec size does not match problem size, review load rises, agents ignore specs | One author's hands on report. No data. |

Honest reading. There is no published controlled test that shows a plan step improves the outcome for non coders building internal apps. The evidence is for structure that survives long runs and for verification, and against ceremony that does not match the task size.

## 3. What app builders for non coders do differently

Lovable, Bolt, v0, Replit and Mitra differ from developer tools on these points.

- **Planning is a mode the person toggles, not a process the tool imposes.** Lovable has Chat, Plan and Build. Bolt and Replit have a Plan toggle. v0 has a preset. The default is to build at once, and planning is opt in. Our Planejar mode is one of these modes.
- **The plan is short and readable, not a document set.** Lovable's plan has approach, decisions, data model, steps. Replit's is an ordered task list. Developer tools such as Kiro and Spec Kit write several files with formal notation (EARS, constitutions).
- **Questions are a product feature.** Lovable shipped follow up questions on purpose because misunderstanding is the main failure. Bolt's "Enhance prompt" turns an interview into a better prompt. Mitra's scoping tool runs a conversation against four gates before it writes anything. Developer tools mostly assume the developer writes a precise prompt.
- **Plans are editable in place.** Lovable allows comments on selected text and version history. Developer tools open a text editor.
- **Cost is part of the design.** Planning is priced at one credit (Lovable) or promoted as token saving (Bolt) because every failed build costs the person money.
- **They almost never link the plan to a check.** In the public material I read, the plan hands off to build with a button. I found no acceptance checks tied to the plan in Lovable, Bolt, v0 or Replit. Mitra is the exception, and Conexus already copies that (acceptance checks in `Para Construir`).
- **They do not face company data.** A generic builder plans screens and data it can invent. Conexus plans against real systems through Conexões. That is why our plan must say "not found" and why Mitra's discovery step (stage 2 audits stage 1) matters more to us than to Lovable.

## 4. Patterns that repeat, and anti patterns

### Patterns across the sources that have some evidence

1. **Read before planning, and ground the plan in real state.** Every tool explores first. Mitra and our study 27 show the failure when the plan names things the data does not have.
2. **A visible approval gate between plan and build.** Claude Code, Cursor, Lovable, Replit, v0, Mastra Code and ours all have one. Cheap to build. Its value against results is not measured anywhere.
3. **One living plan file that survives the session.** ExecPlans, Anthropic's feature list and progress file, Mitra's planning docs, Mastra's plan file. The stated reason is context loss and drift in long runs.
4. **Acceptance stated as behaviour a person can check, with a check the agent can run.** Claude Code best practices, ExecPlans, Anthropic's feature list (pass or fail per feature), Mitra (numbers that match the ERP).
5. **Small verified slices.** Anthropic (one feature at a time), jm-scope (tracer bullet), ExecPlans (independently verifiable milestones), Fowler's author (small iterative steps).
6. **Explicit uncertainty instead of silent guesses.** Spec Kit markers, our "assumptions" list, Factory plan "record as an assumption", Mitra's finding that an assertive spec must mark invented values as hypotheses.
7. **Scale the ceremony to the task.** Claude Code ("one sentence diff, skip it"), Cursor, BMAD ("small changes go straight to build"), Fowler's critique of Kiro.
8. **Ask what only the person knows.** jm-architect (infer, ask, recommend), our Planejar prompt ("never ask what the files or data can answer"), Claude Code interview ("dig into the hard parts").
9. **Fresh context for the build step.** Claude Code advises a new session after the spec. Mastra puts the approved plan at the top of the build prompt.

### Anti patterns

1. **Ceremony that does not match the size.** Kiro on a small bug: 4 stories, 16 criteria. Spec Kit: many repetitive files.
2. **A plan the builder can ignore.** Fowler's author saw agents ignore notes and make duplicates. In our study 27 the flow approved a plan with 4 of 6 sources not found.
3. **Softening a gap.** "When the data is accessible" hid a blocker (study 27). The plan format needs a place where "not found" is loud and can block.
4. **Losing the person's correction.** Ours (RC5) and the v0 forum report of a repeated plan.
5. **Planning that invents.** Mitra's scoping stage guessed values to close fast. Fine only if a later stage audits it.
6. **Asking what can be looked up.** Study 27 shows the model asked because it could not read the data.
7. **Upfront specification of everything.** Fowler's author doubts big up front specs against small steps.
8. **Planning as a cost or accuracy win for every model.** The harness paper says planning mostly saves cost for strong models. Do not assume it lifts accuracy.
9. **Reviewer fatigue.** More text for a non technical person to approve. Study 26 already shows our card is raw monospace text.

## 5. How jm-scope, jm-architect and poteto-mode map onto an in product Builder

| Idea | Transfers as is | Needs adapting | Does not transfer |
|---|---|---|---|
| **jm-scope: coarse living scope, phases, "Done when" lines** | The shape of a feature entry (intent, one done line) reads well for a manager. A living file that is reconciled, not rewritten. | The scope covers a whole product across weeks. A Builder app is small and one conversation. It maps to a plan with one to three slices, not an epic split. | Command checkboxes (`/jm-develop`), workflow tiers named Prototype to GA, epics and file splitting. |
| **jm-scope: build approach personas** | Tracer bullet fits: one real thin thread first, then thicken. Fits our "slice 1 proven" work. | Pick the approach once, inside the Builder, without asking the person. | Asking a non coder to choose between Facade and Skateboard. |
| **jm-scope: "never name a tool"** | Good: the person plan says what they will see, and only the Construir part names routes and tables. | Already close to our two part plan. | Nothing. |
| **jm-architect: infer, ask, recommend** | The core. It matches our Planejar rule and Claude Code's interview. Panels with one recommended option fit `ask_user` with options. | Questions must be in business words and few. jm-architect asks until every load bearing dimension is asked, which is too long for a manager. | Generated question walks in unlimited rounds. |
| **jm-architect: numbered acceptance criteria and Build plan** | Numbered criteria give a check for each thing the person asked (study 27 P5). | Criteria must be runnable by `conexus_check`, not prose. | Options considered, Rationale, References, Superseded status: a decision record is for engineers. |
| **jm-architect: cross check of the spec for invented values** | Idea transfers well. Our Mitra study says stage 2 must audit stage 1 against real data. | Run it as a mechanical check of the plan against Conexão samples, not a second model review. | Cross model critique as a required step. |
| **jm-architect: Assumed status and ratify** | Assumptions listed in the plan for the person to confirm. | Simplify to a list with a confirm action. | The status lifecycle. |
| **poteto-mode: prove it works on the real surface** | The best fit. The build must be checked on the running app. | Already our Construir and `conexus_check` direction. | Nothing. |
| **poteto-mode: throughput checkpoint, arena, subagent fan out** | Inside the Builder, only if the Builder ever splits work. | Not for a manager facing plan. | Model tiering, worktree rules, commit stacks. |
| **poteto-mode: never block on the human** | Reversible steps proceed. | Approval of the plan stays, since a manager approves what will be built. | Skipping the approval gate. |
| **poteto-mode: prototype instead of asking** | Fits: read the real data instead of asking. Same as our first rule. | A visible Prévia can act as the prototype the person judges. | Nothing. |

Short version. What transfers is the discipline (ground first, ask only what the person alone knows, recommend, one thin slice, check on the real thing). What does not transfer is the engineer facing machinery (commands, epics, tiers, spec status, decision records).

## 6. Open questions for the operator

Written as questions. I recommend nothing here.

1. **Who is the reader of the plan?** The manager alone, or the manager and Construir? Today one file serves both. Do we keep two parts or split into two artifacts?
2. **Should the plan survive the conversation?** Today the plan lives in `.conexus/plans/` and is gone for the next conversation (study 28, row 15). Do we keep acceptance checks and assumptions as Project memory?
3. **What may stop a build?** If a requested source is "not found", may the person still approve? Study 27 (RC5, P5) shows the current gap.
4. **How many questions is right?** Today about three. Lovable and Mitra ask more. Where is the limit for a manager?
5. **Is the scoping stage separate from the plan?** Mitra splits scope from build and uses different models. Do we want a short "what are we building" step before the Conexão discovery, or one step?
6. **When is planning skipped?** Claude Code says skip when the diff fits in one sentence. Do we want the Builder to decide (small change, no plan) or always plan in Planejar?
7. **Do we want planning to be measured?** The public evidence is thin. Do we build an eval (with and without the planning skill, on the quote app) before we commit? Study 20 has an eval plan.
8. **Multi slice apps.** Does the Builder plan one slice at a time (tracer bullet) and re-plan after each, or plan the whole app up front? Fowler's critique argues for the first.
9. **Who audits the plan?** A mechanical check against Conexão samples, a second model, or the person?
10. **Where does the plan appear?** Study 26 P5 proposes a Markdown card with the person's part first and the technical part collapsed. Is that enough for editing in place (Lovable) or do we want comments on selected text?

## 7. Candidate shapes for a Builder planning skill

These are shapes, not a choice. Each lists a reference set, a template and phases.

### Shape A: Sharpen the current two part plan

- **Reference.** A short guide next to `plan.md`: how to find each thing in a Conexão, how to mark not found, how to write an acceptance check.
- **Template.** The current two parts plus, per requested item, a status line (confirmed with source, or not found) and a "Limitações conhecidas" block (Mitra). Assumptions as a list to confirm.
- **Phases.** Triage, explore with real samples, ask at most about three questions, write, submit, revise.
- **Cost.** Smallest change. Fixes study 27 P5 without new machinery.
- **Risk.** Does not add a scoping step or memory across conversations.

### Shape B: Two stage plan (scope then discovery)

- **Reference.** Mitra's four sufficiency gates (goal, people, rules, flows) as a checklist for the scoping step. A discovery guide for stage 2.
- **Template.** Stage 1: a one page scope in business words with hypotheses marked. Stage 2: the same file audited against real data, each hypothesis marked confirmed, contradicted or blocking.
- **Phases.** Scope conversation, human confirmation, discovery against Conexões, audit, plan, approval, build.
- **Cost.** More turns. Matches Mitra's strongest finding.
- **Risk.** Kiro and Spec Kit style overhead for small apps. Needs a size rule to skip stage 1.

### Shape C: Living plan file with progress (ExecPlan or Anthropic style)

- **Reference.** The ExecPlan required sections, cut down.
- **Template.** One file with Purpose, Progress checkboxes, Decisions, Acceptance, Surprises. It is updated during Construir and read at the start of the next conversation.
- **Phases.** Plan, approve, build with ticking, verify each item, record discoveries.
- **Cost.** Needs the plan stored with the Project, not under a folder that disappears.
- **Risk.** Longer text for the person unless the person only sees the Purpose and Progress parts.

### Shape D: Slice by slice (tracer bullet)

- **Reference.** The tracer bullet persona from jm-scope, reworded for one app.
- **Template.** The plan names slice 1 (the thinnest real thread, real data and real screen) and lists later slices as "next", not planned in detail.
- **Phases.** Plan slice 1, build, verify, show, ask what next, plan the next slice.
- **Cost.** Fits small, iterative steps and the Fowler critique. Needs a rule for when a whole app fits one slice.
- **Risk.** More approvals for the person.

Shapes can combine. A is a base for the others. B adds the front step. C adds memory. D adds slicing. The choice depends on questions 2, 5 and 8 above.

## 8. Sources

Historical local sources, identified by subject; personal paths are omitted:

- jm-scope SKILL.md (`jm-scope/SKILL.md`), scope-template.md (`jm-scope/scope-template.md`), modes/plan.md (`jm-scope/modes/plan.md`), tracer-bullet.md (`jm-scope/approaches/tracer-bullet.md`)
- jm-architect SKILL.md (`jm-architect/SKILL.md`), spec-template.md (`jm-architect/spec-template.md`), design-conversation.md (`jm-architect/internal/design-conversation.md`)
- poteto-mode (`poteto-mode/SKILL.md`), feature playbook (`poteto-mode/playbooks/feature.md`), architect (`architect/SKILL.md`)
- Planejar prompt (`apps/hub/src/builder/harness/prompt/v2/plan.md`)
- Study 26 (`docs/research/builder/26-builder-chat-compact-ui.md`), 27 (`docs/research/builder/27-builder-root-cause-quote-app.md`), 28 (`docs/research/builder/28-builder-context-audit.md`), 29 (`docs/research/builder/29-builder-improvement-plan.md`)
- Mitra full study (`docs/research/mitra/full-study.md`), influence register (`docs/research/mitra/influence-on-conexus.md`)
- Mastra Code plan prompt (`mastracode/sdk/src/agents/prompts/plan.ts`), plan rejection processor (`mastracode/sdk/src/processors/plan-rejection-abort.ts`), factory-plan skill (`mastracode/factory/factory-skills/factory-plan/SKILL.md`)

Web:

- [Claude Code best practices](https://code.claude.com/docs/en/best-practices), [common workflows](https://code.claude.com/docs/en/common-workflows), [permission modes](https://code.claude.com/docs/en/permission-modes)
- [Anthropic: effective harnesses for long running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- [OpenAI cookbook: ExecPlans](https://developers.openai.com/cookbook/articles/codex_exec_plans), [raw file](https://raw.githubusercontent.com/openai/openai-cookbook/main/articles/codex_exec_plans.md)
- [Kiro specs](https://kiro.dev/docs/specs/), [feature specs](https://kiro.dev/docs/specs/feature-specs/)
- [GitHub Spec Kit](https://github.com/github/spec-kit), [spec-driven.md](https://github.com/github/spec-kit/blob/main/spec-driven.md)
- [Fowler site: Understanding Spec Driven Development](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html)
- [BMAD method](https://github.com/bmad-code-org/BMAD-METHOD)
- [Cursor plan mode](https://cursor.com/docs/agent/plan-mode), [agent best practices](https://cursor.com/blog/agent-best-practices)
- [Devin 2.0](https://cognition.com/blog/devin-2), [Devin docs](https://docs.devin.ai/work-with-devin/interactive-planning)
- [Lovable plan mode](https://docs.lovable.dev/features/plan-mode), [chat mode and questions](https://lovable.dev/blog/chat-mode-and-questions)
- [Bolt plan and discussion mode](https://support.bolt.new/best-practices/discussion-mode)
- [v0 community post](https://community.vercel.com/t/from-prompt-to-plan-building-with-intention-in-v0/31022), [v0 repeated plan report](https://community.vercel.com/t/v0-agent-repeats-same-plan-despite-new-requirements-in-planning-mode/34088)
- [Replit plan mode](https://docs.replit.com/core-concepts/agent/plan-mode), [launch post](https://replit.com/blog/introducing-plan-mode-a-safer-way-to-vibe-code)
- [Harness design study, arXiv 2609.20804](https://arxiv.org/abs/2609.20804), [Self planning, arXiv 2303.06689](https://arxiv.org/abs/2303.06689), [Agentless, arXiv 2407.01489](https://arxiv.org/abs/2407.01489)

## 9. Limits of this study

- I read the abstract of the harness paper, not the full text, and it gives no numbers for planning.
- The Devin docs page did not load its mechanics. The Devin account comes from a search summary of the Devin 2.0 post.
- The BMAD role list is not confirmed on the page I read.
- Cursor, Lovable, Replit and Bolt pages were read through a summarizer. Quotes are as returned.
- I did not run any of these tools. All behaviour is from documentation.
- The Fowler critique is one author's hands on report.
