# 28. Builder context audit (jm-audit lens)

Date: 2026-09-29. Read only. Author: HQ worker, unit AUDIT.

Question: what context does the Conexus Builder work in, judged by the standards of the
`jm-audit` skill (what belongs in a root `AGENTS.md`, what is noise, what is missing, what is in the
wrong layer), and what should change so the Builder does better on any app and any run.

Sources read:

- The app repositories the Builder made: `<branch-state>/git/*.git`, branch `main`, with
  `git show` and `git ls-tree` (10 repos, 6 with a Builder commit).
- The platform source at `<worktree>` head `47794034`: `apps/hub/src/builder/` (prompt assembly,
  modes, tools, starter, project knowledge), `apps/hub/starter-template/`, `builder-skills/`,
  `apps/hub/src/connectors/builder-brief.ts` and `sankhya/skill.ts`,
  `scripts/builder-model-input.mjs`.
- The model input captures `model-input-planejar.txt` and
  `model-input-construir.txt`.
- Run B: `<home>/cmp-2026-09-29-orcamentos/BRIEF.md` and `WORKLOG.md`.
- Mastra Code: `<mastra-clone>/mastracode/sdk/src/agents/prompts/` and `AgentsMDInjector` in
  `<mastra-clone>/packages/core/src/processors/tool-result-reminder.ts`.
- Earlier studies 07, 10 and 25 in this folder, for what is already known.

## Summary

1. The integrator guide reads as Project notes. `conexusInstructions` joins the connector brief
   after `## Project knowledge` with no heading of its own (`harness/prompt.ts`). So the Sankhya
   guide, the only place that teaches how to read the ERP, sits inside the block that the
   Precedence section calls "notes about this app ... facts, not rules", the lowest rank. The
   capture shows it plainly: the guide lands under the `## Verification` heading of whatever
   `AGENTS.md` came before it.
2. The project `AGENTS.md` mostly restates the code. The starter asks for Structure, Data sources and
   Decisions, and the build prompt asks to cover "its screens". Across the 6 apps with a Builder
   commit, a third to a half of the lines describe routes, files, operations and field limits that
   `router.tsx` and `manifest.json` already say. The domain knowledge the next run needs (which ERP
   field means what, what is confirmed and what is not, value shapes, gotchas) is mixed in and has
   no section of its own.
3. Nothing teaches how to explore an integrated system. The Sankhya guide gives one recipe for
   purchase orders. Run B found the cost, price, promotion and stock fields the Builder marked "not
   confirmed" by searching Sankhya's own data dictionary (`TDDCAM`) and confirming physical columns
   (`USER_TAB_COLUMNS`). That method is in no Builder context piece.
4. Nothing lets the Builder prove a handler with real data, and nothing tells it the contract
   between handler and screen. The check boots with empty answers. The canonical handler example in
   `conexus-server` is untyped, and typing the return with `Output<'op'>` is an optional aside.
   `dd54e404` returned an undeclared `items: []` and failed 10 of 14 real calls with
   `HANDLER_OUTPUT_REFUSED` (study 25); `04227454`, which typed its return, worked. No piece says how a
   handler reports an expected failure (not found, Conexão refused) to the screen, so each app
   invents an envelope (`{ ok, message }`, `{ sucesso, erro }`) or throws and loses the message.
5. There are 7 contradictions between pieces, and most rules appear 2 to 4 times. The worst: the
   starter `AGENTS.md` says the app "may import only" 7 named libraries while the system prompt
   lists 17 packages; `conexus-server` says to use a zod check in the handler while the same skill
   (and the server build) forbid any npm import in a handler.
6. The captures are not a faithful picture of production. They were taken with `--project` pointing
   at the `conexus-os` worktree, so its platform `AGENTS.md` (about 70 lines of WSL, npm and merge
   rules) appears as the app's Project knowledge. They also predate `78747137`, `c88db0f1` and
   `0a9c0ed3`, so they still teach `connectors.call`. This audit judges the current source files.

The proposals favor removal and restructure: give the brief its own heading, delete the starter's
Structure section and replace it with a domain map, move use case recipes out of the integrator
guide and put a discovery method in, ship `lib/format.ts` and `lib/errors.ts` in the starter, and
make the typed handler the only example. One tool addition (run an operation for real in Construir)
is the strong fix for verification.

## 1. Inventory

Token counts are estimates (characters divided by 4) from the source files at `47794034`, comments
stripped as the Hub strips them. Portuguese text tokenizes a little worse, so the Sankhya guide is
likely at the top of its range.

| # | Piece | Source | When it loads | Lines | Tokens (est.) |
|---|---|---|---|---|---|
| 1 | Conexus prompt | `apps/hub/src/builder/harness/prompt/v2/conexus.md` | Every turn, system message 1 | 150 | 2,300 |
| 2 | Mode prompt | `plan.md` or `build.md` beside it | Every turn, after 1 | 57 / 56 | 670 / 720 |
| 3 | Project knowledge | the Project's `AGENTS.md` read from `main` (`project-knowledge.ts`, cut at 8 KB) | Every turn, after 2, under `## Project knowledge` | starter 17; real apps 15 to 28 | starter 130; real apps 240 to 430 |
| 4 | Connector brief | `apps/hub/src/connectors/builder-brief.ts`, one of 3 texts: bound, unbound, unavailable | Every turn, after 3, no heading | 3 paragraphs | 310 bound; 60 unbound |
| 5 | Integrator guide (Sankhya) | `apps/hub/src/connectors/sankhya/skill.ts`, appended to 4 when a Sankhya Conexão is bound | Every turn with a bound Sankhya | 23 paragraphs, Portuguese | 2,100 to 2,600 |
| 6 | Task list note | Mastra (`AgentController`) | Every turn, system message 2 | 1 | 120 |
| 7 | Sandbox note | `sandbox.ts:113` plus Mastra's workspace text ("Use absolute workspace paths like /src/index.ts") | Every turn, system message 3 | 3 | 70 |
| 8 | Skills catalog and skill rules | Mastra, from `builder-skills/*/SKILL.md` front matter | Every turn, system messages 4 and 5 | 3 skills | 490 |
| 9 | Tool descriptions | Ours: `submit_plan`, `conexus_check`, `connector_fetch`; the rest are Mastra's | Every turn, per mode | 19 tools in Planejar, 23 in Construir | 2,200 to 2,500, schemas not counted |
| 10 | Codex wire instructions | `openai-codex/model.ts:22` ("You are an interactive CLI tool ...") | Every call on a ChatGPT subscription model only | 3 | 40 |
| 11 | `conexus-server` skill | `builder-skills/conexus-server/SKILL.md` | On demand, `skill` tool | 136 | 1,800 |
| 12 | `conexus-app-ui` skill | `builder-skills/conexus-app-ui/SKILL.md` (+ 1 reference, 630) | On demand | 82 | 2,000 |
| 13 | `conexus-app-code` skill | `builder-skills/conexus-app-code/SKILL.md` (+ 6 references, 2,800) | On demand | 90 | 2,000 |
| 14 | Starter files | `apps/hub/starter-template/files/app/` (main, router, home, styles, lib/utils, lib/zod, 30 plus `components/ui`) | Written once into a new Project; read by tools | about 40 files | only what the agent reads |
| 15 | Plan file | `.conexus/plans/*.md`, written in Planejar | Read in the same run; never committed, so gone for the next conversation | varies | varies |
| 16 | Conversation memory | `Memory({ lastMessages: 40, semanticRecall: false })`, `module.ts:345` | Every turn | last 40 messages | varies |

Always on in Construir with a bound Sankhya: about 8,500 to 9,500 tokens before the first user
message, plus tool schemas. With all three skills and the references read: about 14,000 more. The
project `AGENTS.md` is 3 to 5 percent of the always on context. The 8 KB cap has never been close:
the largest real file is 1,698 bytes.

### Duplicates

| Rule | Where it appears |
|---|---|
| The fixed package list | `conexus.md` (17 packages), starter `AGENTS.md` (7 names), `conexus-app-ui` Platform limits, `conexus-app-code` intro |
| Never write `api.gen.ts`, never call an operation with `fetch` | `conexus.md`, `conexus-server`, `conexus-app-code` |
| What `conexus_check` does and does not prove, never say "validados" | `build.md`, `conexus_check` tool description, `conexus-app-code` "Finish with the check", `conexus-server` last paragraph |
| Loading, empty and error states | `conexus.md`, `conexus-app-code` Data, `conexus-app-ui` layout and writing |
| No Conexão for the system: tell the person to bind one in Integrações and stop | `conexus.md` data section, `plan.md` first step, brief (`TO_BIND` twice) |
| `RESPONSE_TOO_LARGE`, `CALL_LIMIT` and refused reads | brief paragraph, Sankhya guide investigation part, Sankhya guide code list |
| Connector failure codes and what to tell the person | Sankhya guide (11 codes), `conexus-server` ("handle both"), `connector_fetch` description (13 codes) |
| Postgres `numeric` and `bigint` arrive as strings | `conexus-server` Handlers, `conexus-app-code` Data |
| Never edit a migration that ran | `conexus.md`, `conexus-server` |
| Task list rules | `conexus.md` Tools, `build.md` Working style, system message 2, 4 tool descriptions |

### Contradictions

1. Packages. Starter `AGENTS.md` line 9: "React 19 with TanStack Router and Query, shadcn ... Recharts,
   react-hook-form with zod, TanStack Table. It may import only those packages." `conexus.md` lists
   17 packages including `date-fns`, `lucide-react` and `react-day-picker`, which the skills and
   `references/format.ts` use.
2. Zod in handlers. `conexus-server`: "Use a plain `string` and a zod check in the handler for anything a
   pattern would describe." Same skill: "A handler may import only files inside `conexus/` and
   `node:` built-ins. There are no npm packages." The server build enforces the second
   (`application-server-build.ts:63`).
3. Money. `conexus-app-code`: alias `numeric` as `total::float8 AS total` to match a `number` schema,
   and `references/format.ts` formats money from a `number`. The Sankhya guide: decimal values stay
   text, never sum them as floats. One app can hold both kinds of money under two opposite rules.
4. Precedence of the guide. `conexus.md` says "Follow that guide", and calls it "the last part of these
   instructions". The assembly puts it inside `## Project knowledge`, which Precedence ranks last and
   calls "facts, not rules" (finding 1).
5. Paths. The sandbox note says files are at `/workspace/repo` and to use paths like `/src/index.ts`.
   `conexus.md` says files are at the root of the workspace, and every skill writes `app/src/...`.
6. Commands. `conexus.md`: "Use the file tools, not commands" and "You cannot add packages". Mastra's
   `execute_command` description, shown in Construir, opens with `npm install && npm run build`.
7. Identity on the Codex path. The wire instructions say "You are an interactive CLI tool"; the system
   prompt says the people "have no terminal and no files".

### Noise

- "Your memory may hold notes in a terse, compressed style" (`conexus.md`). It comes from Mastra
  Code's observational memory. The Builder's `Memory` has no observational memory configured, and
  `AgentController` adds none (no `observationalMemory` in its bundle).
- The starter's intro line ("What the Builder has confirmed ... Keep it short (under 8 KB)"). It is
  an instruction to the Builder, already in `build.md`, and two of six runs dropped it anyway.
- Use case recipes inside an always on integrator guide: the purchase order entities and
  `TIPMOV = 'O'`, and the follow up notes table. They cost tokens on every run with a Sankhya
  Conexão, and they point the model at the wrong document type for quotes (run B found quotes are
  `TIPMOV = 'P'`, TOP <orçamento>).
- The Structure section of every project `AGENTS.md` (finding 2).

## 2. Judged by jm-audit's standards

jm-audit's rules, applied here: root context stays short and global; it holds what a newcomer needs
in week one (stack, commands, rules, gotchas) and discards implementation detail and anything that
churns; nested docs exist only where an area has distinct conventions; each fact has one owner and
is never duplicated; a doc that the code disproves is a contradiction, worse than a gap.

For the Builder there are three owners, and each should hold one kind of fact.

| Layer | Owns | Today it also holds |
|---|---|---|
| System prompt (conexus.md, mode, brief, guide) | Who the Builder serves, data rules, the fixed stack, the loop, the Conexões of this Project and how to investigate each integrator | Use case recipes (purchase orders), duplicated check semantics |
| Skills (on demand) | How to write screens, handlers, migrations; the handler and screen contract | Check semantics (again), a zod rule that cannot work, a float rule that contradicts the decimal rule |
| Project `AGENTS.md` | What this app knows about its business and its systems that the code does not show | The package list (wrong), a file and route tour (derivable) |

### What is missing

1. A discovery method for an integrated system. The Builder is told to "read a small sample" and
   given field names for one use case. It is not told how to find where a business concept lives.
   Run B's method generalizes: search the system's own metadata by the person's words (Sankhya's
   `TDDCAM` labels), confirm the physical column exists (`USER_TAB_COLUMNS`, since the dictionary
   lists fields that do not exist), probe the dialect once (`V$VERSION`: Oracle, <version>), take a census
   before trusting a join (cost history rows per product, price table versions, lots with
   `RESERVADO > ESTOQUE`), and cross check one value through a second service. Every integrator
   guide should carry the equivalent for its system. The budget matters too: a run has 50
   `connector_fetch` calls (`BUILDER_RUN_TERMS`, `builder-tool.ts:16`), and nothing tells the model
   the number.
2. Value shapes per service. Run B found that `executeQuery` returns decimals as JSON numbers and dates
   as `DDMMYYYY HH:MM:SS`, that the session's decimal separator is a comma unless `TO_CHAR` sets
   it, and that `loadRecords` pages at 50 rows with `total` counting the page, not the whole. The
   guide covers the `f0`, `f1` decoding and says to "confirm" types; it names none of these traps.
   `references/format.ts` has no formatter for an ERP date or a decimal string.
3. The contract between screen and handler. Three rules are missing or optional today: type every
   handler as `(input: Input<'op'>, ctx) => Promise<Output<'op'>>` so an extra or missing field
   fails the type check (`dd54e404` would have failed `typecheck` instead of failing in front of the
   person); an expected failure is part of the output schema and the screen renders it, while a
   throw means a bug and becomes the generic `HANDLER_FAILED` message (`worker.ts:160`,
   `supervisor.ts:105`); and `errorMessage` must name `HANDLER_FAILED` and `HANDLER_OUTPUT_REFUSED`,
   which `references/errors.ts` omits.
4. A way to verify with real data, and a definition of done that asks for it. Construir's check proves
   build and boot with empty answers. The walk in `build.md` asks the model to trace code, not to
   observe a real answer. Run B's brief gave a real key (quote <número real>) and said done means the real
   analysis shows for it, checked against raw answers. The Builder is never asked to get one real
   example key from the person or from `connector_fetch`, so it has nothing concrete to check against.
5. Domain memory across conversations. The plan's acceptance checks live in `.conexus/plans/`, which
   is never committed, so the next conversation starts with `AGENTS.md` only. Today that file keeps
   a route tour and some field lists. It does not keep a glossary from the person's words to system
   fields with a confirmation status, the rules the person confirmed and when, the gotchas found, or
   the open questions. `dd54e404` is the one app that wrote "Not confirmed: ..." and it is the most
   useful file of the six.

### What the project AGENTS.md should accumulate

Keep the file short (the real ones are under 2 KB; the cap is 8 KB). Everything below is a fact the
code cannot show, written as shapes and names, never company values.

- **Termos e fontes.** The person's word, the system concept, the field, and its status: confirmed by
  which read (service and entity, not values), or not confirmed. Example shape from run B:
  "custo variável: `TGFCUS.CUSVARIAVEL`, latest `DTATUAL` per product and company; confirmed against
  the cost stamped on the quote line."
- **Regras confirmadas.** Business rules the person stated, with the conversation they came from:
  "preço alvo = <fator> x custo, nada mais".
- **Armadilhas.** Shapes and traps the next run would otherwise rediscover: a number repeats across
  document types, decimals come as numbers in one service and text in another, lots can have
  reservations above stock.
- **Fora desta versão e em aberto.** What was left out on purpose, and what is still unknown.
- **Como conferir.** Two to five checks that stay true across versions: an action in the Prévia and
  the shape of the expected result. This is the part of the plan that should outlive the run.

What it should stop holding: the package list, the route and file tour, component names, field
length limits and enum values already in `manifest.json`, retry settings, and anything else that
reading the code answers.

jm-audit's nested doc rule does not apply yet. An app has two halves, `app/` and `conexus/`, but their
conventions are platform wide and live in the skills. One root file is right. Mastra's
`AgentsMDInjector` is available in the installed `@mastra/core` 1.71.0 if that ever changes.

### What is in the wrong place

| Content | Is in | Belongs in |
|---|---|---|
| Package list | Starter `AGENTS.md` | `conexus.md` only |
| Route, file and operation tour | Project `AGENTS.md` | Nowhere; the code |
| Connector brief and integrator guide | Under `## Project knowledge` | Its own heading, before Project knowledge |
| Purchase order recipe, follow up notes table | Sankhya guide, every run | The `AGENTS.md` of the Project that confirmed them |
| Failure code to message table | Sankhya guide | `conexus-server` and a starter `lib/errors.ts`, since the codes are the platform's |
| `lib/format.ts`, `lib/errors.ts` as "copy from references" | `conexus-app-code` instructions | Starter files; `dd54e404` never copied them |
| Typed handler (`Output<'op'>`) | One optional sentence in `conexus-server` | The canonical example itself |
| Check semantics | 4 places | `conexus_check` description and `build.md` |

## 3. Comparison

### Mastra Code

- **Assembly.** Mastra Code builds the prompt as labeled sections: base, host instructions, one
  section per `AGENTS.md` or `CLAUDE.md` source, model specific, mode
  (`buildFullPromptSections`, `prompts/index.ts`). Every section has a label and a provenance, and a
  `/context` audit (`context-audit.ts`) measures each one's tokens from the exact text sent.
  Conexus joins four strings with no labels, so the missing heading of finding 1 went unnoticed, and
  the capture script prints the join without attribution.
- **Instruction files.** Mastra Code loads project and global `AGENTS.md`/`CLAUDE.md` into the prompt
  and can read them from a trusted git ref instead of the working tree
  (`createGitRefInstructionReader`). Conexus does the same thing its own way: it reads `AGENTS.md`
  from `main`, never from the sandbox. That part is sound. Mastra Code adds `AgentsMDInjector` for
  nested files the agent touches; Conexus does not need it yet.
- **Plan to build.** Mastra Code's build prompt puts the approved plan at its top (`activePlan`,
  `buildModePromptFn`). Conexus relies on the plan staying in the conversation and on the file in
  `.conexus/plans/`, which is fine inside one run and lost after it.
- **Verification.** Mastra Code's build mode says to run the tests and `tsc`, and to "actually run
  it". It can, because it has a shell over a real project. Conexus replaced that with
  `conexus_check`, which cannot run a handler. The words "The burden of proof is on you" survived the
  port; the means to carry it did not.
- **Skills.** Both use Mastra's skill catalog. Conexus keeps skills platform owned and deletes any
  project copy (`removeStaleServerSkill`). That is right for a product whose users do not edit
  skills.

### Claude Code in run B

- **Context given.** A 61 line brief: the goal in the person's words, one clarification, a real test
  key, a data handling rule, "keep a WORKLOG as you go", and a done criterion on real data. It also
  had the same Sankhya guide as a reference, a shell, unrestricted read calls and web search. It had
  no skills, no design system and no check.
- **What it did with it.** It built one small Sankhya client used by both its probe CLI and its app
  server, "so the investigation calls and the app calls are the same code". It used the data
  dictionary to map every concept in the request to a column. It proved each mapping (the promotion
  formula against a real discounted line, the variable cost against the cost stamped on the quote
  line). It verified <N> field values and <N> totals against raw reads through a second service,
  drove the built screen in headless Chromium, and wrote the assumptions down.
- **What it wrote.** `WORKLOG.md` is close to the ideal project `AGENTS.md`: a concept to field map
  with how each was confirmed, payload shapes, gotchas, decisions with reasons, assumptions. It has
  timestamps and narrative that a durable file would drop.
- **Where the Builder was behind.** Not the prompt's tone or length. The Builder lacked three things
  run B had: a discovery method, a way to run its own server code against real data, and a concrete
  done criterion with a real example. Its `AGENTS.md` for the same request recorded the missing
  fields honestly as "not confirmed", which is the right reflex with the wrong tools.

## 4. Proposals

Ordered by expected effect per unit of change. Each one names the layer, the change, the expected
effect and the proof. None adds a new mechanism where a Mastra one exists; P7 is the only new tool.

**P1. Give the Conexões their own heading, above Project knowledge.**
Layer: prompt assembly (`harness/prompt.ts`, `builder-brief.ts`).
Change: emit the brief and guides under one heading such as `## Conexões deste Project`, placed after
the mode prompt and before `## Project knowledge`. Reword Precedence so it names three parts: these
instructions (including the Conexões), the request, then the notes. No new text beyond the heading.
Effect: the integrator guide is read as instructions, and no `AGENTS.md` content can swallow it.
Proof: rerun `node scripts/builder-model-input.mjs --project <an app repo, e.g. <branch-state>/git/04227454-....git> --revision main`;
the output shows the heading before `## Project knowledge`. A unit test on `conexusInstructions`
asserts the order.

**P2. Make the project AGENTS.md a domain map, not a code tour.**
Layer: starter `AGENTS.md` and the "Update AGENTS.md" paragraph of `build.md`.
Change: delete the intro line and the Structure section (including the package line). Replace the
three sections with Termos e fontes, Regras confirmadas, Armadilhas, Fora desta versão e em aberto,
Como conferir, as in section 2. Rewrite the `build.md` paragraph to name these sections and to say
what not to write (anything the code shows). Same length as today.
Effect: removes contradiction 1; the next conversation starts with what was confirmed and what was
not; the plan's acceptance checks survive the run.
Proof: an eval pair. Conversation 1 builds a lookup on a bound Conexão. Conversation 2, a new
conversation, adds one column. Measure in conversation 2 the `connector_fetch` calls spent on
fields already listed as confirmed (target: none) and whether a rule confirmed in conversation 1 is
kept. Grep the eval apps' `AGENTS.md` for file paths and component names (target: near zero).

**P3. Teach discovery in the integrator guide, and move the use cases out.**
Layer: `apps/hub/src/connectors/sankhya/skill.ts`, and the `connector_fetch` description.
Change: delete the purchase order entities, the document number paragraph's purchase wording, and the
follow up notes paragraph. Keep request format, decoding and the SQL rules. Add a short discovery
part from run B: find a concept by its label in `TDDCAM`, confirm the column in `USER_TAB_COLUMNS`,
probe the dialect once, count before joining history tables, cross check one value through the other
service. Add the value shapes run B met (decimals as numbers in `executeQuery`, the date format, the
comma separator and `TO_CHAR`, pages of 50 with `total` per page). Move the failure code list to P4.
State the budget in the `connector_fetch` description: 50 calls per run.
Effect: the guide becomes true for any Sankhya request, not one; it likely gets shorter.
Proof: rerun the "Análise de orçamento" request on a fresh Project with the same model. Pass when its
`AGENTS.md` lists average cost, variable cost, price table, promotion and stock fields as confirmed,
and the four columns that read "Não disponível" in `dd54e404` show values, within the 50 call budget.
Check first that the `TDDCAM` and `USER_TAB_COLUMNS` reads pass the Hub's SQL guard.

**P4. Encode the handler and screen contract in the examples and the starter.**
Layer: `conexus-server` skill, `conexus-app-code` skill, starter files.
Change: (a) make the canonical handler example typed from `types.gen` (`Input<'op'>`,
`Promise<Output<'op'>>`) and delete the sentence that calls it optional. (b) Replace "handle both"
with one rule: an expected failure is a field of the output schema that the screen renders; a throw
is a bug and the person sees the generic message. (c) Ship `lib/errors.ts` (covering
`HANDLER_FAILED`, `HANDLER_OUTPUT_REFUSED` and the connector codes once, for every integrator) and
`lib/format.ts` (with a formatter for decimal text and one for ISO dates) in
`starter-template/files`, and delete "Start `lib/format.ts` and `lib/errors.ts` from references".
(d) Delete the zod in handler sentence and the `float8` alias advice; say decimals stay text end to
end.
Effect: extra or missing output fields fail `typecheck` instead of failing for the person; each app
stops inventing its own error envelope; contradictions 2 and 3 go away.
Proof: apply the typed signature to `dd54e404`'s handler in a scratch checkout and run the check: the
`typecheck` step must name `items`. In the next eval runs, grep for handlers without `Output<`
(target: none) and for `new Intl.NumberFormat` outside `lib/format.ts`.

**P5. One owner per rule.**
Layer: all text pieces.
Change: keep check semantics in `build.md` and the `conexus_check` description, and delete them from
both skills. Keep the package list in `conexus.md` only. Keep "no Conexão, bind one in Integrações" in
`conexus.md` and the brief, and drop the copy in `plan.md`. Keep the `RESPONSE_TOO_LARGE` and
`CALL_LIMIT` advice in the guide only, and drop the brief's copy. Delete the memory style line.
Effect: a few hundred tokens less on every turn, and one place to edit each rule.
Proof: the model input dump shrinks; the slice 7 eval pass rate does not drop.

**P6. Fix the framing that comes from Mastra and Codex.**
Layer: sandbox and tool configuration, `openai-codex/model.ts`.
Change: check whether Mastra's workspace lets us set the filesystem instructions and the
`execute_command` description; if it does, say paths are relative to the Project root and drop the
`npm install` example. Test whether the Codex endpoint accepts a Conexus identity line in
`instructions`; if it refuses anything but the stock text, leave it.
Effect: removes contradictions 5, 6 and 7.
Proof: the model input dump; a Construir run that calls no `npm install`.

**P7. Let Construir run one operation for real, and ask for a real example.**
Layer: tools (new) and mode prompts (reworded, not extended).
Change: in Planejar, when a screen looks something up by a key, get one real example key, from the
person as one of the three questions or from a `connector_fetch` read, and name it in the plan
without its value in `AGENTS.md`. In Construir, add a tool that invokes one manifest operation of the
candidate in the Prévia runner with that input, spending the run's call budget, and returns the
output or the refusal code. Replace the "walk each promise" paragraph of `build.md` with: call each
operation once with the example and compare what comes back with what the screen expects.
Effect: `HANDLER_OUTPUT_REFUSED`, wrong field names and wrong value shapes surface inside the run,
where the Builder can fix them, not in front of the person.
Proof: replay `dd54e404`'s candidate with the tool: the first call must return
`HANDLER_OUTPUT_REFUSED`. Then rerun the quote request and count real operation calls that
succeed in the Prévia after the run (target: all).

**P8. Make the context measurable.**
Layer: `scripts/builder-model-input.mjs`.
Change: refuse a `--project` without `conexus.json` at the revision, and print each part with a label
and a token estimate, the way Mastra Code's `buildFullPromptSections` and `context-audit.ts` do.
Effect: this audit can be rerun on every prompt change, and a capture can no longer show the
platform's `AGENTS.md` as an app's notes.
Proof: the script's test asserts the labels and the refusal.

## Unproven and open

- Token counts are estimates. Tool input schemas were not measured.
- I did not read the `dd54e404` run's trace, so I do not know how many of its 50 reads it spent or
  whether its Hub head had the SQL consult (`0a9c0ed3` landed at 10:39 -03:00; its Builder commit is
  at 10:40 -03:00).
- Whether the Codex endpoint accepts other `instructions` text, and whether Mastra exposes the
  workspace instruction and tool description text, needs a check before P6.
- The glossary in P2 and the discovery part in P3 are drawn from one run B on one company's
  Sankhya. The eval in P3 is the test that they generalize.
