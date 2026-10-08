# 36. Eliciting requirements from people who cannot plan software: firstmate, superpowers, and a proposal for the Builder

Study only. Nothing here is decided. Date: 2026-09-29. Author: worker (Opus 5.5, medium).

Read for this study:

- [firstmate](https://github.com/kunchenguid/firstmate) at `0a2cdf95` (2026-09-29): `README.md`, `VISION.md`, `AGENTS.md`
  sections 7, 9, 10 and 11, `bin/fm-brief.sh`, and the skills `ahoy`, `ask-user-authority`,
  `captain-hold-lifecycle`, `scout-completion`, `diagnostic-reasoning`, `validation-supervision`,
  `bearings`, `project-management`.
- [superpowers](https://github.com/obra/superpowers) at `8ca22dba` (2026-09-25): `skills/brainstorming/SKILL.md`,
  `skills/brainstorming/spec-document-reviewer-prompt.md`, `skills/writing-plans/SKILL.md`,
  `skills/executing-plans/SKILL.md`, `RELEASE-NOTES.md`.
- Ours: study 34 (planning stage and bakeoff), study 32 (planning harnesses), study 31 (held out
  cases), `apps/hub/src/builder/harness/prompt/v2/plan.md` at `f160f7e1`,
  `docs/research/mitra/full-study.md` and `influence-on-conexus.md` section 13, the
  Mastra `ask_user` tool in `@mastra/core` (`dist/tools-DDs4518b.js`) and our card
  `apps/web/src/features/builder/construir/ask-user-pt.tsx`.
- Web sources are linked where used.

## Answer first

firstmate is not an elicitation tool. It is an "agent distro" that lets one developer run a crew of
coding agents in parallel. Its user is a senior engineer who already knows what to build. It asks
almost nothing at intake, and its rules forbid widening the ask ("never widen the ask there into a
general goal"). So it gives us nothing for eliciting requirements from a manager. What it does give
us, for later, is a very disciplined model of decisions and authority: a decision is a durable record
that survives restarts, the person's own words close it, escalations always carry options and a
recommendation, and open decisions are cleared one at a time in order of impact.

superpowers' brainstorming is the closer match. Its method is: classify the request (spike, bounded,
architectural), find out why the person wants it before proposing features, write the understanding
back for correction, ask one question per message with multiple choice when possible, propose 2 or 3
approaches with a recommendation, present the design in sections and get approval after each, and
gate implementation on explicit approval. Its weak point for us: "enough" is the model's own belief
("once you believe you understand what you're building"), with no checklist. Its best new idea for
us is in writing-plans: a **Review Focus** list of the inputs and failure modes the spec implies but
nobody named. Their evals showed every implementer shipping the same crash on such an input.

The research agrees with the operator's instinct. A 2026 benchmark found LLM interviewers
[elicit less than half of users' implicit requirements](https://arxiv.org/abs/2602.18306). So the
Builder cannot rely on questions alone to find what a manager did not say. It needs a fixed checklist
of what every internal business app needs, which it fills itself from the data, the request and
sensible defaults, and then shows the person as proposals. Questions are for what only the person
knows.

The proposal (section 4) is an elicitation component for study 34, called **R (Requisitos)**. It
adds three things to Planejar: a checklist of eleven dimensions that the Builder fills for every new
app, a proposal card (one `ask_user` with `multi_select`, which our UI already renders) for the
extras beyond the request, and a `## Requisitos` section in `plano.md` where each requirement is
marked as asked, proposed or assumed. It stops on sufficiency gates, not on a feeling. It runs as a
factor crossed with arm A1 (arm A1+R), and it needs one new case in the bakeoff: a vague request
whose answer sheet holds hidden requirements, because the four current cases are already precise and
cannot measure elicitation.

## 1. firstmate

### What it is

"Talk to one agent. Ship with a crew." The person (the "captain") talks only to one agent (the
"first mate"). The first mate spawns worker agents in tmux or similar panes, each in its own git
worktree, supervises them with a zero token watcher, and returns finished PRs, local merges or
investigation reports ([README](https://github.com/kunchenguid/firstmate/blob/main/README.md)).
It is not an app. It is a folder of `AGENTS.md`, skills and shell scripts that any supported coding
harness (Claude Code, Codex, Pi, Grok and others) inhabits. The [VISION](https://github.com/kunchenguid/firstmate/blob/main/VISION.md)
states the audience plainly: "an individual operator whose ambitions outrun their attention".

### Architecture

- **One liaison, flat command.** Captain, first mate, workers. Optional "secondmates" are persistent
  first mates in their own homes, local or over SSH. Depth is capped on purpose.
- **Scripts own mechanics, agents own judgment.** About 300 scripts in `bin/` (spawn, brief, send,
  merge, teardown, holds, backlog). The rule is written in `VISION.md`: "A rigid script must never
  adjudicate meaning".
- **Everything durable is on disk.** Backlog (`data/backlog.md` through `tasks-axi`), briefs
  (`data/<id>/brief.md`), status files, decision holds. "A restart is a non event."
- **Two task shapes.** Ship (a change delivered through the project's mode) and scout (a report at
  `data/<id>/report.md`, never a PR).
- **Delivery modes per project.** `no-mistakes` (a separate validation pipeline: review, fixes,
  tests, docs, PR, CI), `direct-PR`, `local-only`. A `yolo` flag grants merge authority for green
  work.
- **Always loaded contract under 9,000 words.** Conditional procedures live in skills loaded at
  named triggers (`AGENTS.md` section 13).

### Flow from idea to plan to build

1. **Intake** (`AGENTS.md` section 7). Resolve the project. Ask "one concise question when multiple
   or no projects plausibly match". Consult existing reports before commissioning research.
   Classify ship or scout. A scout is justified only when "unresolved uncertainty could materially
   change whether or what to build".
2. **Brief** (`bin/fm-brief.sh`). The scaffold has two parts the first mate fills: `## Captain's
   intent` (the captain's own words plus the context to read them) and `## Firstmate spec` (build
   instructions only). The spawn script refuses leftover placeholders.
3. **Dispatch and supervision** (`bin/fm-spawn.sh`, section 8). Workers report sparse status lines
   (`working`, `needs-decision`, `blocked`, `done`, `failed`), each keyed so a later `resolved` line
   closes it.
4. **Validation** (`validation-supervision`). For `no-mistakes`, the pipeline owns review and CI. A
   reviewer finding that would change scope returns as `needs-decision` and goes through
   `ask-user-authority`.
5. **Landing** (`ship-landing`, `bin/fm-pr-merge.sh`). Merges are guarded and recorded. The captain
   approves unless `yolo` is on.

There is no planning stage in our sense. Planning happens either in the captain's head or in a scout
whose report the captain reads.

### Artifacts and templates

| Artifact | Where | Shape |
| --- | --- | --- |
| Ship brief | `bin/fm-brief.sh`, ship branch | Captain's intent, Firstmate spec, Setup, Rules, Definition of done by delivery mode (`bin/fm-dod-lib.sh`) |
| Scout brief and report | `bin/fm-brief.sh --scout` | The report "must stand alone: what you did, what you found, the evidence (commands run, output, file:line references), and what you recommend" |
| Backlog | `data/backlog.md`, `.tasks.toml` | Work items only. A decision is a task held for the captain |
| Captain hold | `bin/fm-captain-hold.sh`, `captain-hold-lifecycle` | Held task with the question and options in the reason. Closed only by `answer` with the captain's exact words, or `reconcile close` with evidence |
| Bearings digest | `.agents/skills/bearings`, `assets/board-template.html` | Four section "where did I leave off" report, optionally an interactive board |

### How it elicits requirements

Barely, and on purpose. The relevant rules:

- One concise question only when the project is ambiguous (`AGENTS.md` section 7).
- The brief keeps the captain's words and must not widen them: "a generalization, consistency sweep,
  or extra hardening the captain did not ask for is follow up work to note, not scope to add"
  (section 11).
- "Initiative beyond a stated request is legitimate only where the captain has committed a vision
  precise enough to adjudicate it" (`VISION.md`).
- Worker questions go up as `needs-decision` with options. The first mate decides what is
  unambiguous toward the accepted intent and escalates only real product calls
  (`ask-user-authority`).
- Every escalation has five parts: the original requirement, the proposed expansion, the smallest
  alternative that stays in contract, the consequences of accepting and declining, and a
  recommendation (`ask-user-authority`, "Captain facing escalation").
- `/ahoy` clears open decisions "one at a time in agent judged impact order", each with "the
  decision, why it matters, the options, and a recommendation" (`ahoy/SKILL.md` steps 8 and 9).

This is the opposite of what the operator wants for a manager. firstmate assumes the person has the
vision and protects it from scope creep. Our person does not have the vision, so the Builder must
bring it.

### How it verifies

- Workers are "supervised, not trusted". Validation belongs to `no-mistakes` and CI.
- Bug work goes through `diagnostic-reasoning`: reproduce on the real user path, separate trigger,
  masking condition and symptom, compare with a working path, run the smallest counterfactual, seek
  disconfirming evidence.
- Merges refuse a red PR or a missing required check (`bin/fm-pr-merge.sh`).
- The repo tests itself: 254 files in `tests/`, CI workflows in `.github/workflows/`, maintainer
  verification docs in `docs/verification/`, including one test for the decision policy
  (`tests/fm-ask-user-authority.test.sh`).

### Features worth adopting later

None of these is for the pilot. They are for after we prove a manager can build.

| Feature | Where in firstmate | What it would give the Builder |
| --- | --- | --- |
| Decision as a durable record, closed only by the person's words | `.agents/skills/captain-hold-lifecycle/SKILL.md`, `bin/fm-captain-hold.sh` | An open question or an approval survives a stop, a Hub restart or a new conversation. Our RC5 (a lost correction, study 27) is this failure |
| Five part escalation | `.agents/skills/ask-user-authority/SKILL.md` | A template for Construir's mid build questions: requirement, expansion, smallest alternative, consequences, recommendation |
| Decide what is in contract, escalate only expansions | same file, "Decide" and "Classification examples" | A rule for which Construir surprises need the person and which the Builder settles |
| Clear open decisions one at a time, by impact | `.agents/skills/ahoy/SKILL.md` steps 5 to 9 | A "pendências" view for a Project with several conversations |
| "Where did I leave off" digest | `.agents/skills/bearings/SKILL.md` | A Project summary for a manager who returns after days |
| Intent kept verbatim, apart from the build spec | `bin/fm-brief.sh` (`## Captain's intent`, `## Firstmate spec`), `bin/fm-dod-lib.sh` | Our `plano.md` could keep the person's request verbatim at the top, and reviewers grade against it |
| Scout versus ship, and promotion of a scout | `AGENTS.md` section 7, `.agents/skills/scout-completion/SKILL.md`, `bin/fm-promote.sh` | A "just investigate this" request that produces a report, promoted in place to a build |
| Diagnosis procedure | `.agents/skills/diagnostic-reasoning/SKILL.md` | A Builder skill for "the number on screen is wrong" reports |
| Outcome language and a list of internal words to translate | `AGENTS.md` section 9 | A mechanical check that Builder replies never say "worktree", "sandbox", "check", "commit" to a manager |
| Contract word ceiling | `VISION.md` ("stated ceiling of 9,000 words") | A size budget for our always loaded prompt, enforced in CI |

### Evidence that it works

- Adoption: 7,323 stars and 2,330 forks since 2026-06-12 (GitHub API, 2026-09-29), about 850
  commits, 1,855 open issues. Its validation tool `no-mistakes` has 8,681 stars.
- Engineering: 254 test files and CI on every change. The repo "ships through its own discipline"
  and "field incidents become regression coverage" (`VISION.md`).
- No published measure of outcomes (PR quality, time saved, decisions lost). The evidence is
  adoption and self testing, not a controlled result. Label: first party account.

## 2. superpowers: brainstorming, writing plans, executing plans

### The brainstorming method, exactly

From `skills/brainstorming/SKILL.md`:

1. **Establish shared understanding.** Discover intent: "the intended outcome, who it is for, and
   what success looks like". When missing, "ask one focused question about purpose or intended use
   before proposing features". "Knowing the app genre does not tell you why your partner wants it."
   Then write back a short note that separates "what they said from assumptions" and invite
   correction.
2. **Classify before the first question, out loud.** Spike (a feasibility question, output is an
   answer), bounded (a small change to a flow that already exists in the repo), architectural (new
   project or subsystem). "When in doubt between two paths, take the heavier one." Hidden complexity
   upgrades the path mid task, and nothing downgrades. A new app is always architectural: "Bounded
   measures the repo, not your familiarity."
3. **Assess scope first.** If the request is several independent subsystems, decompose into sub
   projects and brainstorm the first one only.
4. **Ask one question per message.** "Prefer multiple choice questions when possible, but open ended
   is fine too." Focus: purpose, constraints, success criteria.
5. **Propose 2 or 3 approaches** with trade offs, leading with the recommended one. "YAGNI
   ruthlessly."
6. **Present the design in sections** scaled to their complexity (a few sentences to 300 words),
   asking after each "whether it looks right so far". Cover architecture, components, data flow,
   error handling, testing.
7. **Hard gate.** No implementation action before the path's approval. "A reply approves the stage
   actually presented." Approval of scope is not approval of a spec that does not exist yet.
8. **Write the spec** to `docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, then a self review
   (placeholders, contradictions, scope, ambiguity), then the person reviews the file, then
   writing-plans.
9. **Visual companion, just in time.** A local browser page for mockups, offered only the first
   time a question "would genuinely be clearer shown than described", in its own message.

### Templates

- **Spec.** No fixed template in the skill. The structure comes from the design sections
  (architecture, components, data flow, error handling, testing). The reviewer prompt
  (`spec-document-reviewer-prompt.md`) checks completeness, consistency, clarity, scope and YAGNI,
  and "approve unless there are serious gaps".
- **Plan** (`skills/writing-plans/SKILL.md`). A header with Goal, Architecture, Tech Stack, Spec
  link, **Global Constraints** (project wide values copied verbatim from the spec) and **Review
  Focus**: "the five input classes or failure modes the spec implies but no task's tests exercise
  that are most likely to bite a person using this software". "Its silence on an input is not
  permission for that input to break the program." Then tasks, each with Files, Interfaces
  (consumes, produces), and checkbox steps: failing test, run it, implement, run it, commit.
- **Plan self review.** Spec coverage, step scan ("a line that decides nothing is a gap"), type
  consistency, Review Focus, proportion ("a plan several times longer than the spec it implements is
  a transcript of the program").
- **Execution** (`skills/executing-plans/SKILL.md`). "The plan already did the thinking." The
  executor does not stop to check in. Conflicts become ledgered rulings: "Ruling: what you decided,
  why, what it costs if wrong". Only four things stop it: irreversible, security sensitive, an
  outside side effect such as a push, or a plan so broken every path is a guess.

### How it decides it has enough

Weakly. The architectural path moves on "once you believe you understand what you're building". The
only explicit floor is step 1: intent, audience and success criteria must be known and written back.
There is no sufficiency checklist like Mitra's four gates, and no cap on questions. The gate that is
strict is approval, not sufficiency.

### Evidence

- Adoption: 292,794 stars, 26,213 forks (GitHub API, 2026-09-29).
- Eval results reported in `RELEASE-NOTES.md`, first party and without published data: "every
  implementer shipped the same crash on an input the spec implied but never named" (the reason for
  Review Focus, #2319). Brainstorming now "finds out why you want the thing before proposing
  features" because a session "took 'that scope is ok' as permission to scaffold" (#2258). A
  subagent spec review loop was replaced by an inline self review after "regression testing across
  5 versions with 5 trials each showed identical quality scores". Right sized tasks "needed one round
  of fixes where the control needed two to four".
- The acceptance test for a new harness is that "Let's make a react todo list" triggers brainstorming
  in a clean session.

### What fits a manager and what does not

| Fits | Does not fit |
| --- | --- |
| Intent first, written back for correction | Architecture, components and data flow sections. A manager cannot validate those |
| One question per message, multiple choice, with a recommendation | Approval after every design section. Too many gates for a manager (study 32, anti pattern 9) |
| Size classification with a one way ratchet | A new app is always "architectural": for us that means a written spec review the manager cannot do |
| Review Focus: implied inputs nobody named | "YAGNI ruthlessly". Right for a developer who knows what they need. A manager needs the Builder to add what they forgot |
| Rulings instead of stalls during execution | No link between the design and real data. Mitra and our R1 show the data is where plans go wrong |

## 3. Other proven elicitation methods for non technical people

| Method | What it does | Evidence | What we take |
| --- | --- | --- | --- |
| **Mitra Escopo, four sufficiency gates** (`docs/research/mitra/influence-on-conexus.md` section 13) | Ask until four dimensions are covered: goal, personas or actors, business rules, flows. Then ask the person whether to write the document. Then write it and emit `[ESCOPO_FINALIZADO]` | One observed run: 5 questions on the four axes in turn 1, then a 10 section document. It invented concrete values to close fast. The build stage then audited them against SQL and dropped a margin feature because the cost column was not cost (full study, section 14.1) | Gates as the stop rule. Mark every invented value as a hypothesis. Stage 2 audits stage 1 |
| **Jobs to be done, job stories** ([Intercom](https://www.intercom.com/blog/using-job-stories-design-features-ui-ux/), [Klement](https://medium.com/the-job-to-be-done/replacing-the-user-story-with-the-job-story-af7cdee10c27)) | "When (situation), I want to (motivation), so I can (outcome)" | Practitioner method, no controlled data | The purpose question: "quando você vai abrir este app, e o que vai fazer depois?" It finds the decision the app serves, which decides sort order, filters and alerts |
| **User story mapping** ([Patton, PDF](https://www.jpattonassociates.com/wp-content/uploads/2015/01/patton_story_mapping_bettersw_1109.pdf)) | A backbone of user activities left to right, stories under each, a first horizontal slice as the "walking skeleton" | Widely used, practitioner evidence | A flow line in `Requisitos` (who does what, in order), and the first slice for arm D |
| **Event storming lite** ([overview](https://en.wikipedia.org/wiki/Event_storming)) | List domain events in the past tense on a timeline: "orçamento criado", "orçamento aprovado", "pedido faturado" | Practitioner method, workshop based | The Builder can do this alone from the ERP: the status and date columns are the events. It turns into the app's states and its "what happens next" |
| **Volere template** ([template](https://www.volere.org/templates/volere-requirements-specification-template/)) | A checklist of requirement types: functional, look and feel, usability, performance, operational, maintainability, security, cultural, legal | Used for decades in industry, a checklist not a study | The idea of a fixed checklist the analyst fills, so nothing is forgotten. Section 4's eleven dimensions are a Volere for internal apps |
| **ClarifyGPT** ([arXiv 2310.10996](https://arxiv.org/abs/2310.10996), FSE 2024) | Detect ambiguity by generating several solutions and checking if they agree; ask only when they disagree | Data: GPT-4 Pass@1 70.96% to 80.80% on MBPP sanitized | Ask only when the answer would change what gets built |
| **ClarifyCodeBench** ([arXiv 2607.00711](https://arxiv.org/abs/2607.00711)) | Benchmark of ambiguous requirements with hidden answers | Data: strong coders are not good clarifiers, reasoning helps little in finding ambiguity, performance falls as ambiguities pile up. 11 categories (terminology, behavior, edge cases, ordering, units and others) | The categories are a checklist. The dense case is our vague manager request |
| **ReqElicitGym** ([arXiv 2602.18306](https://arxiv.org/abs/2602.18306)) | Interactive environment, 101 scenarios, seven LLMs as interviewers | Data: LLMs "elicit less than half of the users' implicit requirements", the good questions come late | Do not rely on the interview for implicit needs. Propose them from a checklist |
| **LLMREI** ([arXiv 2507.02564](https://arxiv.org/abs/2507.02564)) | An LLM runs requirements interviews | Data: 33 simulated interviews, up to 73.7% of requirements elicited, mistakes similar to a human interviewer | A scripted person with an answer sheet is an accepted way to measure this |
| **Follow up questions guided by interviewer mistakes** ([arXiv 2507.02858](https://arxiv.org/abs/2507.02858)) | GPT-4o generates follow ups using a list of common interviewer mistakes | Data: comparable to human questions; better than humans when guided by the mistake types | Put the common mistakes in the prompt as don'ts |
| **Elicitron** ([arXiv 2404.16045](https://arxiv.org/abs/2404.16045)) | Simulated users walk through the product and are interviewed for latent needs | Paper with a case study; I read only the abstract, not its numbers | Later: simulate the app's other users (the seller, the director) to find needs the requester forgot |

The common thread. Methods for non technical people do not ask the person to design. They ask about
purpose, people and events in the person's own words, and the analyst brings the checklist. The
LLM data says the checklist must be explicit, because models miss most implicit needs when they only
converse.

## 4. Proposal: the Builder's elicitation phase (component R, "Requisitos")

### Where it sits

Study 34's phases P0 to P8 already have P1 (Scope, Mitra's four gates, new app only) and P5
(Questions, about 5 for a new app). R replaces P1 and reshapes P5. It runs for a new app and for a
new feature; a small change skips it (study 34 size rule). Order inside Planejar:

1. P0 triage and size, as today.
2. **R1. Intent.** If the request does not say what decision or routine the app serves, ask one
   question about purpose (job story shape). If it does, write it back instead of asking.
3. P4 data discovery, as today. It must run before R3, because the data answers many of the
   dimensions (who the sellers are, which statuses exist, which companies are in the group).
4. **R2. Fill the checklist** (below), from the request, the data and defaults. Each line gets a
   source: pedido, dado, padrão.
5. **R3. Ask.** Business rules only, one per `ask_user`, with options and a recommendation. Then one
   proposal card for the extras.
6. P6 to P8 as today, with the `## Requisitos` section in `plano.md`.

### The checklist: what it proposes beyond the request

Eleven dimensions for an internal business app on ERP data. The Builder fills each one. It asks only
where the data and a sensible default cannot decide.

| # | Dimension | What the Builder fills | Default when nobody says |
| --- | --- | --- | --- |
| 1 | Purpose and decision | The job story: when, what they want, what they do next | Asked (R1) when missing |
| 2 | People and roles | Who uses it, who sees what. "Filtrar por vendedor para cada um cobrar a sua carteira" (H2) raises "should each seller see only theirs?" | Everyone with access sees everything; roles proposed, not assumed |
| 3 | Data model | ERP reads (from P4) and app owned tables: anything the person types that the ERP does not hold (a note, a follow up date, a status of the app's own) | Read only on ERP data; no app table unless a flow needs one |
| 4 | Business rules and definitions | Each term of the person mapped to a rule: "vencido", "parou de comprar", "orçamento aberto". Found in the data or asked | Asked when the data allows two readings |
| 5 | Flows and states | Event storming lite from the ERP statuses and dates. What happens after the person sees a row | The app shows; it does not write back to the ERP |
| 6 | Edge cases | Review Focus for the app: empty list, one huge customer, a record with no seller, several companies, history rows, pagination, a failed read | Always handled, never asked. Listed in the plan |
| 7 | Empty, loading and error states | What each screen says with no data, while loading, and when a Conexão fails | Always built, never asked (quality floor) |
| 8 | Reports and export | Totals on top, sort order, a CSV or print | Totals and the sort the request implies; export proposed |
| 9 | Notifications | "Avise quando um cliente passar de 90 dias" | Proposed only when the purpose is monitoring |
| 10 | Audit | Who changed what, when, for app owned tables | Proposed only when the app writes data |
| 11 | Imports | A spreadsheet the team keeps today that the app should absorb | Asked once for a new app: "vocês controlam isso hoje numa planilha?" |

Two kinds of item come out of this. **Quality floor** (6, 7, and the safe defaults of 2 and 3): the
Builder always does them and lists them, and the person never has to ask. **Scope proposals** (roles
beyond the default, 8, 9, 10, 11): shown to the person, who picks.

This answers the YAGNI tension. superpowers says remove unrequested features, and firstmate says
never widen the ask. Both are right for a developer. For a manager, the floor is not a feature, it is
what a competent builder does unasked. The proposals are offered, never slipped in.

### How it asks

- **Never what data can answer.** Keep today's rule, and make it checkable: a question may name a
  business term, never a table, a column or "onde fica".
- **One question per `ask_user`**, options plus a recommendation first, as today and as superpowers.
  Plain Portuguese, the person's own words.
- **Ask only when the answer changes what gets built** (ClarifyGPT). If both options produce the same
  app, pick one and list it as an assumption.
- **One proposal card**, a single `ask_user` with `selectionMode: 'multi_select'` (Mastra's tool
  supports it and `ask-user-pt.tsx` renders checkboxes): "Posso incluir também:", each option with a
  one line description and "(recomendado)" on the ones the Builder advises. This is the "look for more
  than the person asks" step, and it costs one card instead of five questions.
- **Budget**: about 3 rule questions plus the proposal card for a new app, 1 or 2 for a feature. An
  unanswered or "tanto faz" answer takes the recommendation and becomes an assumption.
- **Guided by common mistakes** ([arXiv 2507.02858](https://arxiv.org/abs/2507.02858)): no leading
  questions, no two questions in one, no technical words, no asking again what was answered.

### When it stops

Sufficiency gates, checked by the Builder and visible in the plan, instead of "once you believe":

1. Purpose written as a job story (asked or taken from the request).
2. Every person or role named, with what they see.
3. Every requested item has a source row (P4) with its status.
4. Every business term has a rule, confirmed or marked assumed.
5. The flow after the screen is stated (what the person does next).
6. Every one of the eleven dimensions has a line, even if the line is "não se aplica".
7. The proposal card was answered or skipped.

When all seven hold, write the plan and submit. If the person says "pode fazer" early, the Builder
takes every recommendation, marks them assumed, and submits: the gate is shown as assumptions, not
enforced as more questions. This keeps "never block on the human" and Mitra's lesson (invented values
are fine if they are labeled and audited by discovery).

### The artifact: `## Requisitos` in `plano.md`

Placed in study 34's template between `## Para a pessoa` and `## Fontes`. The person reads it on the
card as part of their half.

```
## Requisitos

Pedido original: <a frase da pessoa, sem mudar nada>
Para quê: Quando <situação>, quero <ação>, para <resultado>.

Quem usa
- Gerente comercial: vê tudo.                                   [perguntado]
- Vendedor: vê só a própria carteira.                           [proposto, aceito]

Regras
- "Parou de comprar" = comprou nos últimos 12 meses e não compra há mais de 90 dias.  [pedido]
- Todas as empresas do grupo.                                   [suposição]

Depois de ver a lista
- O gerente abre o cliente e liga; o app não grava nada no Sankhya.  [padrão]

O app também vai ter (sempre)
- Mensagem quando não há clientes, e quando o Sankhya não responde.
- Lista completa, página por página.
- Cliente sem vendedor aparece como "Sem vendedor".

Propostas
- Exportar para planilha.                                        [aceita]
- Aviso por e-mail quando um cliente passar de 180 dias.         [recusada]
- Importar a planilha de metas.                                  [não se aplica]
```

Each line carries its origin: pedido, perguntado, proposto (aceito or recusada), suposição, padrão.
A scorer can count them. Construir reads the section as part of the approved plan (study 34's
`activePlanInBuild`). The "sempre" lines become acceptance checks in `## Estrutura`, which is the
Review Focus idea applied to an app.

### As an arm or a component in the study 34 bakeoff

R is a component, not a new execution method. Cross it with arm A1 as **A1+R**, the same way study 34
treats research depth as a factor. That keeps one axis per comparison: A1+R against A1 measures
elicitation only.

The current cases cannot measure it. Q and H1 to H3 are precise requests (study 31 wrote them "as a
manager writes it", but with columns, buckets and sort order already spelled out). An elicitation arm
can only lose on them, by asking more. So stage 1 needs:

1. **One vague case, V1**, written by someone who did not write R. Example shape: "Quero um app para
   acompanhar as visitas dos vendedores aos clientes." Its answer sheet has the visible answers and a
   list of **hidden requirements** the person holds but did not say (for example: each seller sees
   only their own visits; the director wants a weekly total; visits are today in a spreadsheet; a
   customer with no visit in 60 days is a problem). The scripted person reveals a hidden requirement
   only when a question or a proposal touches it.
2. **Metrics added to study 34's table.** Hidden requirement recall (surfaced by question or proposal,
   out of all hidden, as in ReqElicitGym). Proposal precision (accepted proposals out of all proposed,
   by the answer sheet). Quality floor coverage (empty, error, pagination states present in the
   Preview). Question count and data location questions stay as guardrails. The primary metric stays
   Preview completeness.
3. **The scripted person** of study 34 item 3 gains two behaviors: answer a `multi_select` card from
   the sheet, and hold hidden requirements.

On H2 the role question is already a hidden requirement in disguise ("para cada um cobrar a sua
carteira"). Its answer sheet should add the answer, so H2 also scores R.

## 5. Open decisions for the operator

1. **Floor versus proposals.** Should empty, error and pagination states, and a "Sem vendedor" row,
   always be built without asking? Recommendation: yes. They are quality, not scope, and asking about
   them teaches the manager nothing.
2. **The proposal card.** One `multi_select` card with recommendations marked, or proposals as one
   question each? Recommendation: one card. It is the cheapest way to offer more than was asked.
3. **Roles in v1.** Roles need login identity mapped to the ERP seller. Propose them now, or only
   after the pilot? Recommendation: propose on the card, and when accepted, build the filter and list
   "visibilidade por pessoa" under limitations until identity mapping exists.
4. **Add the vague case V1 to stage 1.** Recommendation: yes, plus the H2 role answer. Without it the
   bakeoff cannot see elicitation at all.
5. **R as a factor on A1 only, or on the stage 1 winner too.** Recommendation: A1+R in stage 1; cross
   R with the winner in stage 2 if A1+R beats A1 on V1 without losing on H1 to H3.

## Principles applied

- **Experience first.** The manager should get an app with the states and roles a competent builder
  adds unasked. That is why the floor is not asked and the proposals cost one card.
- **Exhaust the design space.** R enters the bakeoff as a crossed factor against A1, measured on a
  case built to show it, instead of being written into the prompt on belief.
- **Model the domain.** The eleven dimensions and the origin tags (pedido, perguntado, proposto,
  suposição, padrão) are one structure a scorer can read, instead of rules scattered in prose.
- **Never block on the human.** "Pode fazer" takes every recommendation and marks it assumed; the
  gates show, they do not trap.
- **Prove it works.** No claim that R helps. The ReqElicitGym data argues for it; V1 and the hidden
  requirement metric are how we would know.

## Limits of this study

- Nothing was run. The checklist and the gates are a proposal to test, not a result.
- firstmate was read at the level of its contract, skills and brief script, not its 300 scripts. I
  found no planning or elicitation feature, but I did not read `docs/architecture.md` in full.
- superpowers' eval claims come from its release notes. The eval data itself is not in the repo I
  read.
- The research papers were read at the abstract level. ClarifyCodeBench's category list comes from a search summary of its repository.
- The V1 example and its hidden requirements are illustrations. The real case must be written by
  someone who did not write R, and checked against study 31's denylist and feasibility gate.
