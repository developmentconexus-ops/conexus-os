# Stage 2 Q2 — Data programming model qualification

**Status:** CLOSED, **ACCEPT** on 2026-09-23 ([evidence](../evidence/stage2-q2/README.md#q21-attempt-2)). Amended the same day for a pilot fault rerun (section 14).  
**Type:** Builder programming-model qualification. It is not a trust-boundary gate, so it has no
adversarial review rounds.  
**Execution owner:** executor named by the operator  
**Review:** the coordinator reads the evidence and the diff

## 1. Authority route

```text
C-028 managed-application direction
+ docs/reference/stage2-managed-application-platform.md (section 5, Q2 row)
+ Q1 verdict ACCEPT_WITH_BOUNDARY (docs/evidence/stage2-q1/README.md#verdict)
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation
```

## 2. Protected question

Is parameterized SQL through `pg` sufficient for the Builder, or does measured evidence justify
Kysely or a typed Data API?

Prove or falsify this statement:

> Through ordinary product-language requests, the Builder builds a small data application and then
> changes it three times with parameterized SQL and forward SQL migrations, with no named failure
> that repeats.

## 3. Baseline hypothesis: SQL-first

The baseline is the contract Q1 left in `conexus/SERVER.md`, which
`apps/hub/src/builder/application-starter.ts` writes into every BUILD checkout:

- a handler receives `{ db }`, where `db.query(text, values)` returns `{ rows: any[] }`;
- values always pass as `$1`, `$2` parameters;
- `conexus/migrations/NNN_name.sql` are forward-only, and editing an applied migration resets the
  Preview data;
- the manifest's output schema validates what a handler returns;
- a handler imports only files inside `conexus/` and `node:` built-ins.

Q1 is the prior evidence. Four Builder runs wrote parameterized SQL with no SQL error, 2.7 to
3.0 KB of server source, no repair message, and one manifest refusal that the Builder repaired in
the same run. Q1 only built an application. It never changed one, and that is the question Q2 adds.

## 4. Preserve

Q2 does not change the Q1 runtime boundary. The runner, the bubblewrap worker, the relay, the
Project roles and grants, the language revoke, the migration rules, the manifest schema and the
Preview API stay as Q1 accepted them. The Q1 boundaries in the evidence stay in force.

## 5. Application and requests

Use the Stage 2 lie detector's first fragment, the purchasing follow-up notebook. Write every
request in Portuguese product language. Do not name files, tables, SQL or libraries.

| Step | Kind | Request, in substance |
| --- | --- | --- |
| R1 | Build | Follow-up notes on a purchase order: enter an order number, write a note, save it, see the saved notes after reloading. |
| R2 | Add a field | Each note gets a status: open, waiting for the supplier or resolved. Existing notes become open. |
| R3 | Restructure | Each purchase order gets a person responsible and an expected delivery date. Notes belong to the order. Existing notes stay. |
| R4 | Filter and list | A list of orders that have open notes, filtered by status and by person responsible, with the most overdue order first. |

R1 creates the Project. R2 to R4 run on that Project with `--project <id>`, which opens a fresh
conversation. The Builder must learn the current schema from the source, which is the harder case
for SQL-first.

## 6. Steps

### Q2.0 — Where the guidance lives

Q1 delivers the paved road as a Conexus-written file, `conexus/SERVER.md`, plus one host instruction
line. `@mastra/code-sdk` 1.7.2 has its own skills mechanism. `agents/workspace.js` collects skills
from `<projectPath>/<configDir>/skills`, `.claude/skills` and `.agents/skills` (and their home
equivalents), and it injects a skills catalog whose instructions load on demand. In the Factory
mount, `initialState` sets `projectPath` to `""` and the workspace is the E2B sandbox. Nobody has
verified that repository skills are discovered there.

Verify it before any Builder run. Read the installed `@mastra/code-sdk` source, then run one probe
that sends no model request, such as a mounted session that lists its skills catalog.

- If the Builder in E2B discovers a repository skill, deliver the paved road as a Mastra skill in
  the Project source instead of `conexus/SERVER.md`. Carry the same content. Stop writing
  `conexus/SERVER.md`, and point the host-instruction line at the skill, so no second copy exists.
  `conexus/check.sh` keeps enforcing the contract. The runs of Q2.1 measure that delivery.
- If it does not, record why, with the file and line, and keep `conexus/SERVER.md`.

This step changes where the guidance lives. It does not change what the guidance says.

### Q2.1 — The SQL baseline sequence

Run R1 to R4 in order with `scripts/builder-eval/run.mjs` on the pilot, against the real Builder
path, with `--model google-ai-pro/gemini-3.8-flash-high` and `--max-repairs 1`.

Write each case file under `scripts/builder-eval/cases/q2/` before its run. The checks of each case
also assert that data written in an earlier step is still present. If a check misreads a reasonable
app, as run-4 showed in Q1, regrade with `--grade-only` and a corrected case. Record both grades. A
regrade spends no Builder run.

### Q2.2 — Record each step

For each of R1 to R4, record:

- the outcome, and whether the step needed a repair message;
- the Builder steps, the tool calls and the failing check runs, from `factory.mastra_messages`
  summarized into `turns.json`, as Q1 did (Mastra's span store is empty on the pilot);
- each error by class: type (a handler result refused by its output schema, or a wrong shape that
  breaks the app), query (a SQLSTATE in the runner log), or migration (a refused migration, an
  edited applied migration, or data lost across the change);
- unsafe SQL, meaning input values concatenated or interpolated into query text;
- duplicated SQL or row mapping across handlers, and whether a change updated one copy and left
  another stale;
- the generated server source size, and the files changed.

Keep the server source of each step as read back through the Hub's source API.

## 7. Run budget

At most six Builder runs. A request and a repair message each count as one run. R1 to R4 use four
runs, and two remain for repairs. When the budget runs out, stop and record the steps that did not
run. Q1 left 11 of the operator's runs.

## 8. Decision rule

A failure is **repeated** when the same class appears in two or more steps, or reappears in one
step after the Builder's own repair. A single failure is recorded, and it decides nothing.

- No repeated failure: SQL-first stands. Neither Kysely nor a typed Data API is qualified.
- A repeated failure: name it, with the steps and the evidence. Then name which challenger addresses
  that failure. Kysely addresses query shape and column names. A typed Data API addresses schema and
  migration. The challenger probe runs only after the planner prepares it with its own run grant, on
  the same R1 to R4 sequence, and compares against this baseline.

A Kysely challenger costs more than a dependency. Handlers cannot import npm packages today, so the
platform would have to bundle it.

## 9. Non-goals

- no Kysely, Prisma, Drizzle or typed Data API code in this task;
- no change to the Q1 runtime boundary (section 4);
- no application identity, Connector or Publish work;
- no migration rule for Published data, which is owed to Q5;
- no port of the eval to Mastra scorers or datasets; another lane qualifies them;
- no performance targets.

## 10. Falsifiers of SQL-first

Any of these, repeated under section 8, falsifies the baseline:

1. a query error, such as a column or table that the migrations did not create, or a wrong
   parameter count;
2. a type error, where the handler result and the manifest or the browser disagree;
3. a migration error, including an edited applied migration or lost data across a change;
4. unsafe SQL;
5. drift, where a change updates one copy of duplicated SQL and leaves another stale.

## 11. STOP law

STOP and return to the planner on:

- a repeated failure; report it under section 8 and do not start a challenger;
- a need to change the Q1 runtime boundary;
- a need for a new dependency;
- an exhausted run budget;
- a pilot fault: the Hub not serving, or the Applications cluster full or in a restart loop, because
  boundary 9 of Q1 leaves its recovery to the operator;
- less than 20 GB free on D: before a run.

After the evidence, commit, push and STOP. Do not start Q3.

## 12. Verdict

Return one:

- **ACCEPT**: SQL-first is sufficient, and the Q1 handler contract becomes the durable programming
  model;
- **ACCEPT_WITH_BOUNDARY**: SQL-first is sufficient under a named, narrow condition, such as one
  guidance or check change that stays inside `pg` and the Q1 contract;
- **CHALLENGER_REQUIRED**: a named repeated failure, the challenger that addresses it, and the probe
  the planner must prepare;
- **INSUFFICIENT_EVIDENCE**: a named pilot, model or tool prerequisite prevented the sequence.

Record the evidence in `docs/evidence/stage2-q2/README.md`.

## 13. Owner reconciliation

After the verdict, reconcile only what Q2 proved:

- `docs/reference/stage2-managed-application-platform.md`: in section 6, the handler contract
  stops being qualification-only; in section 7, the `pg` and Kysely rows; the guidance location
  from Q2.0;
- `docs/roadmap.md`: the Q2 status and the exact next action;
- C-028 only if the evidence changes its boundary.

## 14. Amendment 2026-09-23 — pilot fault rerun

The first Q2.1 sequence returned **INSUFFICIENT_EVIDENCE**, not a challenger. The pilot Hub ran
without `CONEXUS_APP_RUNNER_SOCKET`, so every build that carried a server tree failed with
`APPLICATION_RUNNER_UNAVAILABLE`. R1's first run wrote a correct parameterized handler and migration
and hit that fault. The Hub named it a build failure, the eval sent "o build falhou, corrija", and
the repair deleted the server tree for browser `localStorage`. The reload check passed on
`localStorage`, and R2 and R3 built on the browser-only app. Their "data loss" is that app's storage
missing in a fresh browser. No step exercised SQL against the runner. The evidence is kept as
[attempt 1](../evidence/stage2-q2/README.md).

Before the rerun:

- the Hub maps `APPLICATION_RUNNER_UNAVAILABLE` to `ENVIRONMENT_PREPARATION_FAILED`, a platform
  failure, not a build the author can repair;
- the eval repairs only `APPLICATION_BUILD_FAILED`, and its reload check clears the Preview origin's
  browser storage first, so browser-only storage cannot pass as saved data;
- R1's request states the real need: the whole purchasing team sees the same notes from any
  computer;
- the pilot Hub runs with the runner socket. R1's first server-backed build proves the wiring; a
  platform failure there stops the sequence without spending a repair.

The operator granted a fresh budget of six Builder runs for R1 to R4. Sections 5 to 13 apply
unchanged. Record the rerun as attempt 2 under `docs/evidence/stage2-q2/attempt-2/`.
