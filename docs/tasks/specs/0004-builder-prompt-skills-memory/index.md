# 0004. The Builder runs one mode on the new prompt, with plan and build skills and an app memory

**Date**: 2026-09-30
**Status**: Proposed

## Summary

The Builder gets the system prompt written with Leandro on 2026-09-30, one mode instead of Planejar
and Construir, and two new skills: `conexus-plan` (plan before a new app or a big change, approved
through the question card) and `conexus-build` (build step by step and prove each step). `AGENTS.md`
goes back to being the instructions people write, and what the Builder learns goes to an app memory
in `.conexus/memory/`, one fact per file with an index that enters the prompt. The new Builder
replaces today's in one change: no prompt variants, no second mode, nothing kept side by side.

This spec amends spec 0002: AC-1 to AC-9 and AC-23 there are replaced by the criteria below
(see *Criteria of spec 0002 this spec changes*).

## Rationale

Reasoning and options: see [rationale.md](rationale.md).

## Requirements

**User stories**:
- As a person at a company, I ask for an app in the chat and the Builder plans it when it is new or
  big, shows me the plan in plain words and builds only after I approve it on the card.
- As a person, I ask for a small change and the Builder makes it without a plan, and tells me what it
  proved and what I should try in the Prévia.
- As a developer of the company, I write instructions for the Builder in the app's `AGENTS.md`, and
  the Builder follows them.
- As a person coming back weeks later, possibly someone else from the company, I ask for a change and
  the Builder already knows the rules and decisions from earlier conversations.

**Acceptance criteria** (the contract; each is checked on its own):

The prompt and the skills
- **AC-1**: The Builder receives one Conexus prompt, `prompt/builder.md`, holding the approved text
  of the HQ file `docs/research/builder/system-prompt-v2.md` (copied into the repo, so the repo is
  the source of truth from then on), with its placeholders filled by the Hub at the start of each
  turn: the Project's name, today's date in `America/Sao_Paulo`, the model's knowledge cutoff (the
  clause drops when the model is not in the cutoff table), the Conexões list, the Project
  instructions and the Project memory index. `conexus.md`, the mode prompts, `plan-checklist.md`
  and every prompt variant folder are gone.
- **AC-2**: The Builder has one mode, `build`. Its tools are today's Construir tools without
  `submit_plan`. The mode route, the mode chip, the plan card and reader, `plan-sections.ts`,
  `plan-file.ts`, the prompt variant switch (and the variant field on the public route) and the
  `.conexus/plans/` exclusion are deleted. With one mode, `harness/modes.ts` and `harness/guard.ts`
  go too: the Builder's mode sets no `availableTools` allowlist, so every tool Mastra registers is
  available, including the `recall` tool of AC-11; the workspace tools the Builder must not have are
  turned off where the workspace is built, through the Workspace `tools` option. No text, tool or
  screen names Planejar or Construir as modes.
- **AC-3**: `builder-skills/` holds `conexus-plan` (`SKILL.md`, `new-app.md`, `change.md`),
  `conexus-build` (`SKILL.md`) and `conexus-sankhya` (`SKILL.md`), with the approved text of the HQ
  drafts and, for Sankhya, the guide text that lives today in `apps/hub/src/connectors/sankhya/skill.ts`,
  which is deleted. All three are in `BUILDER_SKILL_NAMES`, so the Hub refuses to start when one is
  missing.
- **AC-4**: For a new app, the Builder writes `.conexus/plan.md` before any other file, shows the
  person's part of the plan in its message and asks with `ask_user` "Posso construir assim?" with the
  options "Aprovar e construir" and "Pedir ajustes". On "Pedir ajustes" it asks, as free text, what to
  change. No file outside `.conexus/` changes before the approval. This is behavior the prompt and the
  skill ask for and the eval measures, not a guard in code.
- **AC-5**: The approval is the person's answer on the card, kept in the conversation. When a turn
  resumes after an interruption and the Builder finds a plan without that answer, it asks again
  before building. `.conexus/plan.md` and `.conexus/memory/` are committed with the version like any
  app file.
- **AC-6**: The prompt's Conexões section lists each bound Conexão as
  `` `<name>`: <integrator> (skill `conexus-<integrator>`) ``. The integrator guide no longer enters
  the prompt. When the bindings cannot be read, or none is bound, the section says so in one line.
- **AC-7**: The rules the prompt moved out live in the tool descriptions: `conexus_check` says to run
  it at the end of each step and what it does not prove; the task tools say to use the list for three
  or more steps, keep one task in progress and mark each done once it is proven. The `ask_user`
  description changes with HQ scope item 9 (question card), not here.

Project instructions and memory
- **AC-8**: A new Project starts with the new starter `AGENTS.md` (short, in Portuguese: the file is
  for the people's instructions to the Builder) and `.conexus/memory/MEMORY.md` with four empty
  headings, one per memory type (Regras, Fontes, Decisões, Preferências).
- **AC-9**: At the start of every turn, the Hub reads `AGENTS.md` and `.conexus/memory/MEMORY.md` from
  `main` in the Conexus Git, not from the sandbox, and places them last in the prompt as "Project
  instructions" and "Project memory". `AGENTS.md` is cut at 8 KB; `MEMORY.md` at 200 lines or 16 KB,
  whichever comes first; each cut at a character boundary with a note saying it was cut. A missing,
  unreadable or non UTF-8 file reads as empty with a one line note.
- **AC-10**: The Hub no longer refuses a version for `AGENTS.md`. `AGENTS.md` changes only when a
  person asks the Builder, which the prompt says.
- **AC-11**: Observational memory keeps its thread scope (one conversation's observations) and adds
  `retrieval: true`, whose recall tool browses the conversations of the same Project (resource
  `project:<id>`), with no vector store and no embedder. The recall tool never reaches another
  Project's conversations.

Models
- **AC-12**: A conversation's model is the model in its Mastra session, set and read through the
  session's own model API, never by copying Mastra's thread keys (`modeModelId_<mode>`,
  `currentModeId`) in our code. The person changes it between messages; a new conversation starts on
  the installation default. The installation defaults become two, Builder and memory, both persisted
  and read. The session routes refuse a model change while a turn is active (the model route joins
  the idle only routes), and the web no longer switches a running session's model.
- **AC-16**: The observational memory model is the installation's memory default and nothing else.
  The per person memory settings (`BuilderMemorySettings`) and their screen are deleted.
- **AC-17**: No mode survives in storage or code: a migration drops the run's `mode` column (and its
  place in the idempotency hash) and the `plan` default model role; the reload after a run, the
  planning turn path and `removeStaleServerSkill` lose their mode branches; one function reads
  `AGENTS.md`.

Eval and proof
- **AC-13**: Before any code changes, the Builder eval runs three requests on today's Builder (a new
  app, a new feature on it, a small edit) and the result is kept; after the change the same three run
  on the new Builder. For each: whether it planned when it should (not applicable to the small edit),
  app files changed before the approval, the person's clicks, the time to the first Prévia, and the
  check and operations that ran. The comparison is written in the HQ research folder.
- **AC-14**: The eval recognizes the approval card by its options, answers "Aprovar e construir"
  (or "Pedir ajustes" when the case says so), tells each card call apart by its tool call, and scores
  "plan file written before the first app file" and "approval through `ask_user`" in place of the
  `submit_plan` and `plan-checklist.md` task ids, which are deleted.
- **AC-15**: The test Projects that exist today are deleted before the new Builder runs for anyone,
  with Leandro's go-ahead at that moment.

### Criteria of spec 0002 this spec changes

| 0002 | Now | Replaced by |
| --- | --- | --- |
| AC-1 | Conexus prompt plus mode prompts, and the model input script | AC-1 (one prompt); the script is deleted |
| AC-2 to AC-6 | Two modes, Planejar writes only plans, `submit_plan`, approval switches mode, manual switch | AC-2, AC-4, AC-5 |
| AC-7 | Starter `AGENTS.md` of project knowledge | AC-8 |
| AC-8 | `AGENTS.md` from `main` as project knowledge | AC-9 |
| AC-9 | Construir updates `AGENTS.md`; the Hub refuses a bad one | AC-10, and memory in AC-9 |
| AC-23 | Three default models: Planejar, Construir, memory | AC-12 |

Unchanged: AC-10 (skills from `builder-skills/`, now six), AC-11 to AC-22, AC-24 to AC-31, and the
2026-09-29 amendment.

## Decision

**Chosen option**: Option 2: replace in one change.

Measure today's Builder on three requests, then replace its prompt, modes, plan flow, project notes
and integrator guide with the new ones in one change, and measure again.

**Implementation skills**: `mastra` (`~/.claude/skills/mastra/`) for the observational memory
`retrieval` option, the skills processor and the session model setting.

## Design

### Shape of the change

Today `prompt.ts` joins `conexus.md`, a mode file, `plan-checklist.md`, the approved plan, merge
conflicts, the connector brief and "Project knowledge". After the change it reads one file,
`prompt/builder.md`, fills its placeholders and appends "Merge conflicts" when the turn brought in a
moved `main`, as today. The plan lives in `.conexus/plan.md` and the skill says how to use it.

| Piece | Today | After |
| --- | --- | --- |
| Prompt | `conexus.md` + mode file + checklist, five variants | `prompt/builder.md`, filled |
| Modes | `plan`, `build` | `build` only |
| Plan | `.conexus/plans/<file>`, not committed, `submit_plan`, plan card | `.conexus/plan.md`, committed, `ask_user` |
| Project notes | `AGENTS.md`, Builder writes it, refused over 8 KB | `AGENTS.md` people's; `.conexus/memory/` Builder's |
| Integrator guide | text in `sankhya/skill.ts`, pasted in the prompt | skill `conexus-sankhya` in `builder-skills/` |
| Models | one per mode per conversation | one per conversation, the session's |

### Placeholders and value sourcing

| Placeholder | Value | Source |
| --- | --- | --- |
| `{project name}` | the Project's display name | the Projects table, read at turn start |
| `{date}` | today, `YYYY-MM-DD` | the Hub clock in `America/Sao_Paulo` |
| `{cutoff}` | the model's knowledge cutoff, `Month YYYY` | a table in code keyed by model id; no entry, the clause drops |
| Conexões list | name, integrator, skill name per binding | the Project's bindings (`builder-brief.ts`) |
| Project instructions | `AGENTS.md` text, cut at 8 KB | `main` blob; `readProjectKnowledge` becomes `readProjectInstructions` |
| Project memory | `MEMORY.md` text as the Builder grouped it, cut at 200 lines or 16 KB | `main` blob, `.conexus/memory/MEMORY.md` |

The cutoff table holds the models the installation offers today with their published cutoffs.

### Tool contract

Today's Construir list without `submit_plan`, plus Mastra's recall tool from `retrieval: true`. The
skills processor lists `conexus-server`, `conexus-app-ui`, `conexus-app-code`, `conexus-plan`,
`conexus-build` and `conexus-sankhya`. The mode guard keeps its sandbox and write root checks; the
plan only rule goes.

### Key invariants

- The Builder never exposes `submit_plan` and has no mode to switch.
- Project instructions and memory come from `main`, never from the sandbox, so a turn cannot put its
  own text into the next turn's prompt before a version is saved.
- `prompt/builder.md` holds the approved text; a test checks that every placeholder is filled and
  that no Planejar, Construir as a mode, or `submit_plan` appears in the model input.
- No company value enters the prompt from the Hub: the placeholders carry names, dates and files
  people or the Builder wrote.

### Security model

Unchanged from spec 0002: the sandbox holds no secret and admission never runs candidate code.
`AGENTS.md` and `MEMORY.md` enter the prompt with the same trust as `AGENTS.md` today, read from
`main`. The recall tool reads only conversations of the same Project, which every member of the
Project can already see (0002 AC-18).

### Configuration required

A database migration: drop the run `mode` column and the `plan` default model role, and persist the
Builder and memory installation defaults (AC-12, AC-16, AC-17). No new environment variable.

### Critical test scenarios

- Model input: a Project with one Sankhya binding, an `AGENTS.md` and a `MEMORY.md`; the prompt holds
  the approved text with every placeholder filled and no mode words. Verifies **AC-1**, **AC-2**,
  **AC-6**, **AC-9**.
- Skills guard: remove `conexus-build/SKILL.md`; the Hub refuses to start naming it. Verifies **AC-3**.
- New app, driven in Chromium: the first file written is `.conexus/plan.md`, the card asks "Posso
  construir assim?", no app file changes before "Aprovar e construir", the version holds
  `.conexus/plan.md`. Verifies **AC-4**, **AC-5**.
- Interrupted approval: stop the turn while the card waits; the next turn asks again before building.
  Verifies **AC-5**.
- Instructions: a developer commits "Responda sempre em inglês" to `AGENTS.md`; the next turn answers
  in English. Verifies **AC-9**, **AC-10**.
- Memory across conversations: conversation one confirms a rule and saves it; conversation two,
  started by another member, applies it without asking. Verifies **AC-9**, **AC-11**.
- Recall stays inside the Project: a second Project's conversation is not listed. Verifies **AC-11**.
- Cut limits: a 9 KB `AGENTS.md` and a 250 line `MEMORY.md` enter cut, with the notes; a non UTF-8
  `AGENTS.md` enters as empty with the note. Verifies **AC-9**.
- Model: a model change during an active turn is refused. Verifies **AC-12**.
- Eval: the scorers score a recorded run of the new Builder, with the approval card answered.
  Verifies **AC-14**.

## Build plan

Skateboard (the HQ scope's approach): measure first, then the whole new Builder in one change, built
in slices that each end green, then measure again.

1. Baseline: run the three requests on today's Builder with the eval and keep the result. Satisfies
   **AC-13**.
2. Subtract: delete the prompt variants and their switch, the plan mode, `submit_plan`, the plan card
   and reader, `plan-sections.ts`, `plan-file.ts`, the plan only guard, the mode route and chip,
   `plan-checklist.md`, the `.conexus/plans/` exclusion, the `AGENTS.md` refusal, the model input
   script and its test, `modes.ts`, `guard.ts`, the per person memory settings and their screen, the
   mode column and `plan` role (migration), and every test and eval path that only served them.
   Satisfies **AC-2**, **AC-10**, **AC-16**, **AC-17**.
3. The prompt: `prompt/builder.md`, the placeholder filling, `MEMORY.md` read from `main` beside
   `AGENTS.md`, the shorter Conexões section, the new starter files. Satisfies **AC-1**, **AC-6**,
   **AC-8**, **AC-9**.
4. The skills and tools: `conexus-plan`, `conexus-build`, `conexus-sankhya` in `builder-skills/`,
   `BUILDER_SKILL_NAMES`, the `conexus_check` and task tool descriptions, `retrieval: true`, the
   session model and the two installation defaults, the model change refusal. Satisfies **AC-3**,
   **AC-5**, **AC-7**, **AC-11**, **AC-12**.
5. The eval reads the new flow, the test Projects are deleted with Leandro's go-ahead, and the three
   requests run again on the new Builder; the comparison is written. Satisfies **AC-4**, **AC-13**,
   **AC-14**, **AC-15**.
6. Mark spec 0002's replaced criteria and update `docs/reference/builder-c020-mastra-native.md`,
   `docs/roadmap.md` and spec 0003's tool table. Satisfies the amendment table.

## Migration plan

**Strategy**: big bang for code, with no data migration.
**Phases**:
1. Baseline measured on today's Builder (step 1).
2. The change lands as one pull request built in slices (steps 2 to 4).
3. The test Projects are deleted, then the new Builder runs (step 5).
**Rollback**: revert the pull request; the baseline stays valid for a second attempt.
**Risks**: a regression only a run shows appears after the merge; the baseline and the eval rerun in
step 5 are the check, and the Chromium scenarios above run before the merge.

## Consequences

**Positive**:
- The Builder reads about 2,000 tokens of Conexus prompt instead of about 8,700, and loads the plan,
  build and Sankhya guidance only when it needs them.
- One mode removes the mode chip, the plan card, `submit_plan`, the per mode models, the mode route
  and five prompt variants from the product and the code.
- The app keeps what the Builder learned across conversations and people, in files developers can
  read in the Código tab and that travel with the app's versions.

**Negative / tradeoffs**:
- Planning now depends on the model loading `conexus-plan` from a prompt line, not on a mode that
  forces it. The eval measures whether it does.
- The plan card goes; the person reads the plan's person part as a chat message, which reads worse
  than the card's reader for a long plan.
- A turn waiting on the approval card holds the conversation's sandbox and the Project's run lock
  with no deadline, and every new app now waits on the card. Measure the waits in the eval and the
  pilot before adding a timeout (HQ study 54, F10).
- Nothing stops the Builder from writing a company value into a memory file except the prompt. The
  bakeoff scans for it (HQ study 49).
- The four experiment variants leave with their measurements; the bakeoff of study 34 compares the
  new Builder with the kept baseline, not with those variants.

**Neutral**:
- The plan file is now committed, so each app version carries the plan it was built from.
- No data migration: the test Projects are deleted instead.

## Follow-up

- [x] HQ study 54 reviewed the Builder code (Mastra native, poteto-mode); its findings F1 to F4, F10
  and the persisted default model are in this spec. F5 to F9 are separate HQ scope work.
- [ ] HQ scope item 9 (question card, several questions in one pause) changes the `ask_user`
  description and the card.
- [ ] HQ scope item 8 (the Builder sees the Prévia) changes the screen proof in `conexus-build`.
- [ ] Measure `conexus_check` time per step; if a check per step is too slow, revisit the
  `conexus-build` proof section with Leandro.
- [ ] The bakeoff adds a privacy scan: a planted fake company value must not appear under
  `.conexus/memory/` (HQ study 49).
