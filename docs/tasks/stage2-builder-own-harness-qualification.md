# Builder own harness qualification

**Status:** PREPARED on 2026-09-29. The candidate is the branch `feat/builder-own-harness`. The
states in section 5 are those of the integration head `40d9671d` (merge base with `main`
`eb564cfe`).\
**Type:** runtime, dependency and Builder-evidence qualification. Q-a: it is the Builder half of the
Q4 gate's "builds and changes a useful application". Q-b: it moves source custody and model
credentials into Conexus and changes the Hub database. Q-c: live Builder runs are its proof. Q-d: 20
dependencies enter (`S21:111`; [delivery rules](../development/delivery.md#pick-the-lane-by-risk)).\
**Execution owner:** executor named by the operator\
**Review:** Factory review of the pull request. An independent GPT-6 Sol review runs when the
operator asks ([proof and verification](../development/delivery.md#proof-and-verification)).\
**Aprovo:** required, for two reasons. Migrations `0032` to `0038` touch real data at the switch,
which drops every test Project and conversation. The change also touches security and
authentication: model credentials, the ChatGPT device-code sign-in and the secret envelope
(`S21:113`).

## Sources

Spec 0002 (the Builder on its own harness) and spec 0003 (the app stack v2) are in the operator's
study notes, outside this repository. This task carries their acceptance criteria and cites their
rationale without copying it. Citations use these short forms, with line numbers as of 2026-09-29:

| Short form | File |
| --- | --- |
| `0002:N` | spec 0002, `specs/0002-builder-own-harness/index.md` |
| `0002-R:N` | spec 0002 rationale, `specs/0002-builder-own-harness/rationale.md` |
| `0003:N` | spec 0003, `specs/0003-app-stack-v2/index.md` |
| `0003-R:N` | spec 0003 rationale, `specs/0003-app-stack-v2/rationale.md` |
| `S17:N` | study 17, the app stack decision and its probe app |
| `S21:N` | study 21, the census of the open work at `40d9671d` |
| `name:N` | the test titled at line N of `tests/implementation/name.test.mjs` |

## 1. Authority route

```text
C-020 the Builder's ordinary coding path; Mastra owns the harness mechanics
+ C-022, C-025, C-027 model accounts and the Factory (C-032 supersedes C-022 and C-025 and amends C-027)
+ C-028 managed application platform (C-033 amends its generated-application profile)
+ C-030 one integrator per external system; connector_fetch
+ the Q4 task amendment of 2026-09-28, closure items 4 and 5
+ the Builder proof rule and the technology rule (docs/development/delivery.md)
+ spec 0002 and spec 0003, with their rationale
        ↓
this qualification
        ↓
evidence + verdict (docs/evidence/builder-own-harness/README.md)
        ↓
C-032, C-033 and the roadmap's Technology baseline
```

Repository authority beats this task when they conflict. The operator accepted C-032 and C-033 on
2026-09-29. The [decision register](../decisions/index.md#decided-on-2026-09-29-the-builder-off-the-factory-c-032-and-the-app-stack-v2-c-033)
records both decisions as current.

## 2. Protected claim

> The Builder runs on a Conexus harness built on Mastra's engine (`AgentController` and
> `createCodingAgent` of `@mastra/core`), off the Mastra Factory and Mastra Code. Each Project's
> source is a Git repository on the Hub whose `main` is the admitted revision, and model accounts
> live in Conexus tables. Every new app is built on the REACT_VITE_V2 stack and admitted only by the
> Hub-owned check. A person who does not code describes an app in Portuguese, approves a plan, and
> sees the app work in the Preview. The Builder passes the three fixed eval cases. Nothing calls
> GitHub, the Builder has no Factory tool, and a run's sandbox holds no secret.

Sources: `0002:8-15`, `0002:153-158`, `0003:9-16`, `0003:95-100`.

### Why

The Factory was chosen under C-022 for model credential custody, the GitHub App and its Work engine.
The prompt was not part of that choice (`0002-R:12-16`). The rendered prompt opens as "Mastra Code, an
interactive CLI coding agent". It spends most of its 16,000 characters on git, pull requests, `gh`
and npm, and puts Conexus's rules last, at about 6 percent, below a repository's own `AGENTS.md`. No
configuration of that stack changes the identity, and 17 Factory `source_control_*` tools carry a
real installation token outside the Builder's deny list (`0002-R:18-25`). The Factory's Work, boards
and pull request surface have no consumer in the Hub (`0002-R:27-30`). Spec 0002 compares four
options and keeps Mastra as the engine (`0002-R:37-99`). Keeping Mastra Code as a library still
keeps its identity, because Mastra Code never passes a product name to `buildBasePrompt`, and it
still means rebuilding the credential store, the GitHub path and the skills loader
(`0002-R:57-64`, `0002-R:81-85`). C-022's own reopen trigger is the reversal of the custody decision
that puts a Project's source on a forge (`0002-R:106-108`).

The V1 app profile has no component, chart, router or form library (`0003-R:5-10`). Admission runs
the candidate's own `conexus/check.sh`, which the Builder can edit. It cuts the refusal reason at 400
characters, and the model never sees screen errors. Nothing type checks the code (`0003-R:12-16`).
Screens call the server with untyped JSON, and deep links answer 404 (`0003-R:18-22`). Under the
Preview's `style-src 'self'`, a Radix dialog logs a CSP violation on every open, and the Base UI set
logs none (`S17:122`, `0003-R:60-62`; `builder-app-starter-v2:171`). The manifest already is the
contract, so the generated client adds no second source, and a renamed field fails `typecheck`
(`0003-R:69-71`; `builder-client-generator:230`).

## 3. What the candidate changes

- **Harness.** `BuilderController` is an `AgentController` over `createCodingAgent`, with the Conexus
  prompt, the mode prompt, the Project's `AGENTS.md` from `main` and the connector brief, in that
  order (`0002:169-189`).
- **Modes and tools.** Two modes, `plan` (Planejar) and `build` (Construir), stored in the Mastra
  thread settings. The tool contract lists what each mode exposes. A mode guard in the tools' hook
  enforces it on every call, because `availableTools` is lost when a suspended run resumes
  (`0002:204-224`). Spec 0003 adds `conexus_check` to Construir only (`0003:212-218`).
- **Source custody.** Each Project's repository is `<CONEXUS_GIT_ROOT>/<project_id>.git`. The Hub
  seeds a fresh E2B sandbox from `main`, commits the run's change itself, pulls it back as a bundle,
  and fast forwards `main` when the check passes (`0002:83-93`, `0002:279-280`).
- **Model accounts.** `model.model_account` and `model.installation_default` replace the Factory's
  credential store and model packs. Secrets use the copied Conexus envelope and never leave the Hub
  (`0002:226-234`, `0002:296-299`).
- **Removal.** `@mastra/factory`, `@mastra/code-sdk`, the `factory` schema, the `hub_factory` role
  and the GitHub App code leave the Hub (`0002:124-133`).
- **App stack v2.** The compiler template pins React 19 with TanStack Router, Query and Table,
  shadcn components on Base UI with Tailwind 4, Recharts, and react-hook-form with zod, behind an
  import allowlist (`0003:111-136`). The pinned list is in
  `apps/hub/compiler-template/package.json:10-35`.
- **Generated client.** The platform generates `api.gen.ts` and `types.gen.ts` from
  `conexus/manifest.json` before every type check. They never enter Git (`0003:46-53`,
  `0003:196-210`).
- **Platform check.** One Hub-owned `/opt/conexus/check.mjs` runs `generate`, `typecheck`, `build`,
  `server` and `boot`, and prints one `CheckReport`. The `conexus_check` tool, admission and the
  Preview build all run it. `boot` never blocks admission (`0003:54-74`, `0003:150-194`).

Migrations `0032_conexus_git.sql` to `0038_builder_run_model_accounts.sql` carry the database side.

## 4. Invariants the verdict checks

- `main` is the admitted revision, with no second copy. Only the Hub moves it, only by fast forward,
  only from the run's own base (`0002:279-280`).
- The mode has one home, the thread setting (`0002:281`).
- The sandbox holds no secret. Model calls, Git writes and connector calls happen in the Hub
  (`0002:282`, `0002:94-95`).
- One active run per Project, including a run that waits on the person (`0002:96-98`).
- Admission never executes a file from the candidate. The tool and admission run the same
  `check.mjs` from the same Hub release (`0003:246-248`).
- The CSP stays `style-src 'self'` (`0003:249`; `apps/hub/src/platform/application-csp.ts:4`).
- Artifacts built on the V1 template stay readable (`0003:88-89`).

## 5. Closure set

This task closes on spec 0002 AC-1 to AC-31 and spec 0003 AC-1 to AC-13, and nothing smaller. The
states come from the census at `40d9671d` (`S21:27-79`). "Met" means a test or proof at that head
shows it. "Partly" names the missing piece. "Not proven" means a live proof that has not run yet.

### Spec 0002: the Builder on its own harness

| AC | Criterion | State | Evidence, or what is missing |
| --- | --- | --- | --- |
| AC-1 | The text Conexus authors for the model names no "Mastra Code" and no git, pull request, `gh` or package guidance. A script prints the model's real input (`0002:37-41`) | met | `scripts/builder-model-input.mjs:1-9` prints the model input; `tests/implementation/builder-model-input.test.mjs:41-60` checks both modes and the printed tool lists |
| AC-2 | Exactly two modes, stored only in the thread settings. A new conversation starts in Planejar (`0002:42-44`) | met | `apps/hub/src/builder/harness/modes.ts:66-89`, `builder-session-routes:339` |
| AC-3 | Planejar runs no command, writes only under `.conexus/plans/`, and ends with `submit_plan` (`0002:45-47`) | met | `builder-harness:254`, `builder-harness:310`, `builder-run-runtime:558` |
| AC-4 | An approved plan continues the same run in Construir. A rejected plan stays in Planejar. A run settles by what it changed (`0002:48-50`) | met | `builder-harness:510`, `builder-run-runtime:547`, `builder-run-recovery-postgres:134` |
| AC-5 | A manual mode switch works only while the Project has no active run (`0002:51-52`) | met | `builder-session-routes:157` |
| AC-6 | Each mode's tools are exactly the tool contract, with no git, GitHub, subagent or agent connection tool (`0002:53-55`) | met | `builder-harness:27` |
| AC-7 | Every new Project starts with the starter `AGENTS.md` (`0002:58-59`) | met | `builder-conexus-git:69`, `builder-conexus-git-postgres:204` |
| AC-8 | The Hub reads `AGENTS.md` from `main` at run start, cut at 8 KB with a note (`0002:60-63`) | met | `builder-run-runtime:765` |
| AC-9 | Construir updates `AGENTS.md`. A candidate whose `AGENTS.md` is missing, not UTF-8 or over 8 KB is refused (`0002:64-67`) | met | `apps/hub/src/builder/harness/prompt/v2/build.md:50`, `builder-run-runtime:624` |
| AC-10 | Platform skills load as agent skills from `builder-skills/` and are never copied into an app (`0002:68-70`) | met | `builder-harness:160`, `builder-skills-guard:13` |
| AC-11 | Both modes can search the web and read a page, on every pilot model. Company data never goes into a query, a URL or a network command (`0002:73-77`) | partly | Prompt rule: `apps/hub/src/builder/harness/prompt/v2/conexus.md:79`. Google AI Pro and ChatGPT models have no `web_search` (`builder-harness:421`, `builder-harness:439`), and the common search tool is not built |
| AC-12 | `connector_fetch` keeps the Q-5 behavior. The Builder refuses only a request that needs a system the Project has no binding for (`0002:78-81`) | partly | `builder-harness:450`, `connector-builder-tool:208`. The eval refusal case has not run |
| AC-13 | Creating a Project makes its repository under the Conexus Git root, idempotently, with no GitHub call (`0002:84-86`) | met | `builder-conexus-git:69`, `builder-conexus-git:86`, `builder-conexus-git:103` |
| AC-14 | A run seeds a fresh sandbox from `main`. The Hub commits the change, pulls it back as a bundle and fast forwards `main` at admission (`0002:87-93`) | met | `builder-run-runtime:242`, `builder-run-runtime:473`, `builder-conexus-git:146` |
| AC-15 | The sandbox holds no model credential, Git write credential or Hub secret (`0002:94-95`) | partly | Empty sandbox environment: `builder-composition:58`, `builder-run-runtime:574`. No scan of the sandbox and the stored thread yet (`S21:45`) |
| AC-16 | One active run per Project, including a waiting run. A new message gets the busy answer (`0002:96-98`) | met | `builder-harness:468`, `apps/hub/src/builder/routes.ts:131` |
| AC-17 | A run that fails or outlives a Hub restart ends failed, or admitted if `main` holds its candidate (`0002:99-102`) | met | `builder-run-recovery-postgres:99`, `builder-run-recovery-postgres:116` |
| AC-18 | Several shared conversations per Project, stored in Postgres, listed by title or first message and last activity (`0002:105-107`) | partly | `builder-session-routes:133`. Storage is still schema `factory` (`apps/hub/src/builder/module.ts:188-189`). The list shows no first message and no last activity |
| AC-19 | Observational memory with Mastra Code's settings, on the installation's memory model (`0002:108-109`) | not built | `apps/hub/src/builder/module.ts:342` is `lastMessages: 40` with no observational memory |
| AC-20 | API key, ChatGPT subscription, Claude subscription and Google AI Pro, from Modelos de IA (`0002:112-113`) | partly | ChatGPT: `builder-openai-codex:93`. Google AI Pro: `builder-google-ai-pro:344`. API keys and the Claude subscription are not built (`apps/hub/src/builder/model-accounts.ts:42-45`) |
| AC-21 | Two sharing levels. Only an installation administrator sets `everyone`. One account per person per provider, one shared per provider (`0002:114-116`) | partly | Database rule: `model-account-postgres:47`. No sharing route and no 403 or 409 test |
| AC-22 | Secrets are sealed before storage, never reach the browser or the sandbox, and a refreshed token is written back first (`0002:117-119`) | met | `secrets-envelope-interop:20`, `builder-openai-codex:180`, `model-account-postgres:113`. The sandbox half waits on AC-15 |
| AC-23 | Three installation defaults, the model router catalog, a per-conversation pick, and the connect-a-model message (`0002:120-123`) | partly | `builder-openai-codex:272`, `model-account-postgres:165`, `builder-session-routes:174`. No route or screen for the defaults |
| AC-24 | `@mastra/factory`, `@mastra/code-sdk`, the `factory` schema, the `hub_factory` role, the GitHub App code and model packs are gone (`0002:126-129`) | not built | `package.json` still lists both packages. `/settings/installation/github` is still routed (`apps/hub/src/http/app.ts:120`) |
| AC-25 | Every copied file carries the Apache 2.0 notice and names its source and version (`0002:130-131`) | partly | Notices in `apps/hub/src/builder/openai-codex/model.ts:1-11` and the other copied files. Complete when AC-24 finishes the copy list |
| AC-26 | C-032 is recorded, superseding C-022 and C-025 and amending C-027 (`0002:132-133`) | met | The operator accepted C-032 on 2026-09-29. The [register](../decisions/index.md#decided-on-2026-09-29-the-builder-off-the-factory-c-032-and-the-app-stack-v2-c-033) records it as current |
| AC-27 | The eval passes `todo-reload`, `erp/sankhya-not-connected` and `erp/sales-dashboard`, one run each and one rerun per failed case (`0002:136-141`) | not proven | Declared in section 6. `erp/sales-dashboard` is blocked (section 7, limit 1) |
| AC-28 | Driving Chromium as a person: create a Project, ask for an app, approve the plan, see the app in the Preview (`0002:142-143`) | not proven | Declared in section 6. The run is in progress |
| AC-29 | An app built by the new Builder reads the pilot's Sankhya and shows the data in the Preview, values masked (`0002:144-145`) | not proven | The branch Hub has no gateway origin and no Connection (`S21:59`) |
| AC-30 | The operator reads the model input the AC-1 script prints, for both modes, and his yes is recorded in the pull request (`0002:146-147`) | not proven | The operator's reading of both printed inputs and his yes are not recorded in the pull request |
| AC-31 | A backup of the Conexus Git folder with the database dump exists, and one restore was tested, before the switch (`0002:148-149`) | partly | `scripts/conexus-backup.sh:8,32-76` and `scripts/conexus-restore-check.sh:8,22-67` exist. A branch-environment rehearsal passed with `PASS tables=72 repositories=3`; the pilot backup has not been taken |

### Spec 0003: the app stack v2

| AC | Criterion | State | Evidence, or what is missing |
| --- | --- | --- | --- |
| AC-1 | The compiler template pins exactly the stack, with a committed lockfile. Any import outside the allowlist fails `build` and `typecheck`, naming it (`0003:29-32`) | met | `builder-compiler-recipe-stack:11`, `builder-compiler-allowlist:67`, `builder-template-pins:23` |
| AC-2 | The REACT_VITE_V2 starter has the listed files, no `conexus/check.sh`, and passes `conexus_check` with zero problems (`0003:33-38`) | met | `builder-app-starter-v2:147`, `builder-application-check:95` |
| AC-3 | The starter's look comes only from tokens, the neutral subset of the Conexus brand tokens (`0003:39-45`) | met | `builder-app-starter-v2:229`, `builder-skills-guard:59` |
| AC-4 | The platform generates `api.gen.ts` and `types.gen.ts` from the manifest before `typecheck`. They never enter Git (`0003:46-53`) | met | `builder-client-generator:100`, `builder-client-generator:230`, `builder-run-runtime:722` |
| AC-5 | One root-owned `check.mjs`, mode 0555, runs five steps with time limits. App code runs as `conexus-agent` (`0003:54-60`) | met | `builder-run-runtime:691`, `builder-application-check:308`. Live: `builder-sandbox-e2b-live:109` (opt-in) |
| AC-6 | `generate`, `typecheck`, `build` and `server` block. `boot` never blocks admission (`0003:61-63`) | met | `builder-application-check:238`, `builder-run-runtime:743` |
| AC-7 | `boot` serves the production CSP and deep links, and reports errors, CSP violations and failed requests (`0003:64-66`) | met in tests | `builder-application-check:251`, `builder-application-check:263`. The live half waits for the declared runs |
| AC-8 | `conexus_check` is a `createTool` in Construir only. The web shows "Verificando o app" and "Verificou o app" (`0003:67-70`) | met in tests | `builder-harness:46`, `builder-tool-sentences:47`. The live half waits for the declared runs |
| AC-9 | Admission runs the Hub's `check.mjs` as root on the candidate's tree. A refusal carries the whole problem list (`0003:71-74`) | met | `builder-application-check:179`, `builder-application-check:203` |
| AC-10 | One path classifier for the Preview, the app host and `boot`. A deep link such as `/notas` opens the app (`0003:75-79`) | met in tests | `app-path-classifier:15`, `builder-application-check:274`. The live half waits for the declared runs |
| AC-11 | `builder-skills/` holds `conexus-app-ui` and `conexus-app-code`. `conexus-server` points to the generated client (`0003:80-87`) | met | `builder-skills-guard:37`, `builder-skill-examples:69` |
| AC-12 | Artifacts on the old template stay readable. A new build uses only the new pins (`0003:88-89`) | met | `builder-template-pins:14`, `builder-template-pins:27` |
| AC-13 | The Builder never says an app was "validado" beyond what the check did, and reports counts as counts (`0003:90-91`) | partly | Prompt rule: `apps/hub/src/builder/harness/prompt/v2/build.md:68-69`. Behavior is provable only in the live runs |

## 6. Deciding-proof route

The operator's night run declared these runs as gate proof on 2026-09-29, before any of them ran. A
run counts only on the head that the run's decision trail records when it starts. A run on any other
head does not count ([exploration spikes](../development/delivery.md#exploration-spikes)).

1. **The AC-28 browser run.** On the branch Hub, driven in Chromium as a person, under the
   [Builder proof rule](../development/delivery.md#builder-proof-rule). A normal product request,
   the plan card with the plan text, the approval, a build on the v2 starter, `conexus_check` with
   counts, a skill loaded, the Preview used, a deep link rendered, and zero CSP violations. The same
   run covers the Planejar interview: `ask_user` cards, an answer that resumes the run, and an
   unanswered question that becomes an assumption.
2. **The AC-27 eval.** `todo-reload`, `erp/sankhya-not-connected` and `erp/sales-dashboard`, one run
   each, one rerun per failed case. The driver approves plans. The gate passes when all three pass.
   Each run records its last `CheckReport`. There is no baseline on the old Builder, by the
   operator's choice of 2026-09-28 (`0002:136-141`).

These two runs also prove the live halves of spec 0003 AC-7, AC-8, AC-10 and AC-13 (`0003:319-320`).
AC-29, AC-30 and AC-31 are not yet declared. Declare each one here before it runs. The results, the
screenshots with every business value masked, and the `CheckReport`s go to the
[evidence](../evidence/builder-own-harness/README.md).

## 7. Open limits

1. **`erp/sales-dashboard` cannot pass on any branch today.** An app handler can only call
   `sankhya.purchase-order.read`. The handler `connectors.fetch` (Q4 closure item 2) is not built
   (`apps/hub/src/app-runner/worker.ts:42-49`; `S21:15-17`). The same gap limits AC-29 to one
   purchase order.
2. **Factory pull request #373 collides with the branch.** It adds
   `0032_application_thumbnail.sql` and edits `factory-runtime.ts`, which the branch deletes. Merging
   it first forces seven renamed migrations (`S21:141-148`). #370 overlaps the Modelos de IA screen
   (`S21:137-140`).
3. **Issue #342 contradicts spec 0003.** It asks the project check to refuse a handler that imports
   `node:fs`. Spec 0003 lets handlers import `node:` modules (`builder-application-check:122`,
   `builder-compiler-allowlist:81`). One of the two must change.
4. **Not built at the census head:** observational memory (AC-19), the removal of the Factory and
   Mastra Code (AC-24), API keys and the Claude subscription (AC-20), the sharing routes (AC-21), the
   installation defaults route (AC-23), the common search tool (AC-11), and the sandbox secret scan
   (AC-15).
5. **Unmeasured in E2B:** the check's wall time (estimated under 15 s), sandbox start with a larger
   image, and the effect of the first-load JavaScript growth from about 60 KB to about 280 KB gzip
   (`S17:120-129`, `S17:433-445`; `0003:340-344`).
6. **Model familiarity is a judgment.** Base UI, TanStack Table v9 and the generated client are less
   familiar to models than Radix and v8. The skills carry worked examples. The AC-27 runs and their
   `CheckReport`s are the measurement (`S17:444-445`).
7. **Waiting for the operator:** the Sankhya credential on the branch Hub (AC-29), the pass rule for
   `erp/sales-dashboard`, his reading of the model input (AC-30), the search provider and its key
   (AC-11), the Claude subscription sign-in (AC-20), the drop of the `factory` schema on the branch
   database (AC-24) (`S21:183-199`). C-032 and C-033 were accepted on 2026-09-29.
8. **Packaging.** No issue covers this work, and the pull request must link one
   ([Git and pull requests](../development/delivery.md#git-and-pull-requests); `S21:112`).

## 8. Non-goals

- A personal GitHub mirror of a Project's repository, private conversations (`PER_USER`), and
  sandbox egress limits. Each is follow-up work of spec 0002 (`0002:425-438`).
- A company style for apps, a structured check card, ECharts, and an OpenAPI document derived from
  the manifest. Each is follow-up work of spec 0003 (`0003:350-358`).
- The Dev Factory in `~/dev-factory`, which is a different system (`0002:422`).
- A Q4 verdict. This task qualifies the Builder that runs Q4 closure items 4 and 5. It does not close
  Q4.

## 9. Owner reconciliation

The operator accepted and recorded the decisions on 2026-09-29. The implementation follow-ups
remain after the verdict:

- Done on 2026-09-29: `docs/decisions/index.md` records C-032 and C-033 as current, removes C-022
  and C-025 from the in-force table, and records the C-027 and C-028 amendments.
- Done on 2026-09-29: `docs/roadmap.md` records the stack v2 and ChatGPT model path as accepted.
- The documents that state C-022 as current, as slice 7 of spec 0002 requires (`0002:376-380`).
- `docs/reference/builder-c020-mastra-native.md`, which names the REACT_VITE_V1 profile at line 184.
- The Q4 task's closure item 4, which says "a real Factory session" (`S21:92`).
