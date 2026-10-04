# 0011. The Builder run as one state machine: a question waits inside the run

**Date**: 2026-10-04
**Status**: Approved (approved by the operator on 2026-10-04)
**Lane**: `lane:shaped`
**Depends on**: spec 0009 (merged in #499). Its closed `FailureCode` is the type every run write takes.

References to "spike S-N" name facts measured before the build with real `@mastra/core` 1.71.0,
`@mastra/pg`, Postgres and E2B, on throwaway scripts that are not in this repository. Each slice
proves again, in its own tests, the fact it relies on.

## Summary

Today, when the Builder asks the person a question, its run stops and the answer starts a new run
leg that rebuilds everything ("Preparando o ambiente" on every answer), and an unanswered question
can hold the whole Project for seven days. After this spec, a question is a wait inside the same run
on the same live Mastra session, and it ends with that session. Each conversation has one Mastra
session. The whole "parked run" path goes, and the code gets smaller.

## Requirements

**User stories**:
- As a person building an app, I want to answer the Builder's question and see it continue at once,
  without the environment being prepared again.
- As a person building an app, I want to type a message while a question card is open, and have the
  Builder take my message and go on.
- As the operator, I want a question nobody answers to end on its own after a configured time, so it
  never holds the Project for days.

**Acceptance criteria**:
- **AC-1**: When the Builder calls `ask_user` or `submit_plan`, the run's phase becomes `WAITING`. The
  row keeps its owner and heartbeat. No new `builder_run` row is created by the answer.
- **AC-2**: An answer on the card resumes the same Mastra `Session` object through
  `respondToToolSuspension`, on the same E2B sandbox id. An answer inside the 5 minute VM window shows
  no `PREPARING` work beyond the incarnation check (no sandbox start, no seed, no checkout rebuild).
- **AC-3**: A message sent while a question is open ends the question (stored `output-denied`) and the
  same Builder run continues with the message as a plain user turn. The message always reaches the
  model (0 lost in 100 runs). The added delay is at most 2 s.
- **AC-4**: A question unanswered for the configured wait ends the run `INTERRUPTED` with
  `BUILDER_QUESTION_EXPIRED`. The value is configuration (`CONEXUS_BUILDER_QUESTION_WAIT_MS`): 30
  minutes by default; a local run sets a shorter wait in its own env file. The Project is free right after.
- **AC-5**: Stop during a question ends the run `INTERRUPTED` `USER_CANCELLED`, and the question is
  denied.
- **AC-6**: After a Hub restart during a question, the takeover ends the run `INTERRUPTED`
  `HUB_RESTART`. After a reload the card is not shown. An answer to the old card is refused with
  `QUESTION_ENDED`. The next message works, and the model's prompt holds the denied question.
- **AC-7**: A conversation has one Mastra session, scope `conversation:<id>`. The browser and the run
  use the same `Session` object. The browser's stream stays open before, during and after a run. The
  idle sweep never retires a conversation whose run is open, `WAITING` included.
- **AC-8**: Every question that ends without an answer (message, expiry, Stop, restart) leaves no
  Mastra leftovers: the `agentic-loop` registration is released, the suspended snapshot rows are
  gone, and `listSuspendedRuns` no longer lists the run. After 200 such endings the Hub heap is within
  5 MB of a control run with no questions.
- **AC-9**: The Hub never pauses the VM explicitly. When the Builder stops (end of turn or a question)
  the sandbox gets a 5 minute idle timeout and E2B pauses it on its own. The next command after a
  pause resumes it.
- **AC-10**: The candidate gate judges a revision once per run, and the red budget (3) counts across a
  question. No per conversation counter survives a run.
- **AC-11**: The run summary JSON is built in one SQL function, `builder.run_summary`. Every write of a
  failure or interruption code takes `FailureCode`. `BUILDER_SOURCE_ADMISSION_FAILED` and
  `BUILDER_RUN_SETTLE_LOST` are rows of the failure table, or their writers use an existing row.
- **AC-12**: The Hub process exits when it loses the instance lock connection, so one Hub per database
  holds.
- **AC-13**: Telemetry shows each run as a span with one child span per phase, `WAITING` included,
  with its duration. Run events carry their fields (run id, conversation id, phase, durations) as
  exported attributes, not only the event code.
- **AC-14**: The census script reaches the targets in section 7 and runs in CI.
- **AC-15**: On screen, while a question waits, the composer is open and Enter sends. Stop is a
  control separate from Send. The waiting state has a word, not only a color. Text says "Projeto".
- **AC-16**: The docs that state the old behavior change in the same pull request: spec 0002 AC-16
  and its invariant line, decision C-036 (seven days), `docs/reference/builder-c020-mastra-native.md`,
  and the comments in `idle-machine-sweep.ts`.

## Decision

**Chosen option**: Option 1: the run as one coroutine with a one slot inbox (see
[rationale.md](rationale.md)).

A run is one async function in the Hub, from its claim to its last write. Where it is in its code is
its state, and the row's phase mirrors it. Routes, the wait timer and Stop only drop a `WaitEnd` into
the run's inbox. Whether a question is open is read from Mastra's session, never copied. One function
ends every question that is not answered.

**Implementation skills**: `mastra` (`.agents/skills/mastra/`) · `conexus-development`
(`.agents/skills/conexus-development/`) · `conexus-frontend` (`.agents/skills/conexus-frontend/`)

## Rationale

See [rationale.md](rationale.md).

## Feature design

### 1. States and who writes them

The row keeps `state` and `phase`. The vocabulary replaces `PARKED` with `WAITING`. The run is the
only writer of a `RUNNING` row while it lives. Three SQL entry points write the rest (create, Stop,
takeover). `builder_run_phase_boundary` stays and still makes a Stop beat a late phase write.

| From | Event | Next | Owner |
| --- | --- | --- | --- |
| none | message, conversation has no live run | `QUEUED` | `service.message` then `create_builder_run` (the Project lock stays) |
| `QUEUED` | dispatched | `RUNNING` / `PREPARING` | run (`claim_builder_run`) |
| `QUEUED` | Stop | `INTERRUPTED` `USER_CANCELLED` | SQL `request_builder_run_cancellation` |
| `PREPARING` | sandbox, checkout and gate ready | `AGENT` | run |
| `AGENT` | the question call is stored on the thread | `WAITING` (owner and heartbeat kept; VM idle window starts) | run |
| `WAITING` | `ANSWER` | `AGENT`, `respondToToolSuspension` | run, woken by `service.answer` |
| `WAITING` | `MESSAGE` | `AGENT`, `endQuestions` then `sendMessage` | run, woken by `service.message` |
| `WAITING` | `EXPIRED` | `INTERRUPTED` `BUILDER_QUESTION_EXPIRED` | run (its own timer) |
| `WAITING` | `STOPPED` | `INTERRUPTED` `USER_CANCELLED`, or `HUB_RESTART` when the Hub stops | run |
| `AGENT` | done, gate red, budget left | `COMPILING` then `AGENT` (up to 3 per run) | gate inside Mastra's `isTaskComplete` |
| `AGENT` | complete, nothing changed | `FINALIZING` then `SUCCEEDED` `RESPONSE_ONLY` | run |
| `AGENT` | complete, verdict red | `FAILED` (table row) | run |
| `AGENT` | complete, green | `SOURCE_ADMISSION` then `FINALIZING` then `SUCCEEDED` | run |
| `SOURCE_ADMISSION` | `main` moved under it | `FAILED` `BUILDER_SOURCE_BASE_MOVED` | run |
| any `RUNNING` | failure | `FAILED` `<FailureCode>` | run |
| any `RUNNING` | heartbeat stale | candidate settled by `main`, else `INTERRUPTED` `HUB_RESTART` | takeover (SQL and Git only) |

In code the `RUNNING` rows are the step loop in `run/run.ts` and an exhaustive `switch` over
`WaitEnd`. No transition list is generated and no transition trigger is added.

### 2. The key types

Ids stay plain `string`, as everywhere else in the Hub; the database and the routes check them at
the boundary.

```ts
/** Every way a wait ends. A fifth kind is a compile error in the run's switch. */
type WaitEnd =
  | Readonly<{ kind: 'ANSWER'; toolCallId: string; resumeData: unknown }>
  | Readonly<{ kind: 'MESSAGE'; content: string }>
  | Readonly<{ kind: 'EXPIRED' }>
  | Readonly<{ kind: 'STOPPED'; reason: 'USER_CANCELLED' | 'HUB_STOPPING' }>

/** The one handle the service holds per conversation. Nothing else reaches the run's session, sandbox or row. */
type LiveRun = Readonly<{
  builderRunId: string
  answer(toolCallId: string, resumeData: unknown): 'ACCEPTED' | 'ALREADY_ANSWERED' | 'UNKNOWN_CALL' | 'ENDED'
  /** A known key is taken once; the run is the one owner of that dedup. */
  message(content: string, idempotencyKey: string): 'ACCEPTED' | 'BUSY'
  stop(reason: 'USER_CANCELLED' | 'HUB_STOPPING'): void
  tools(): RunTools
}>

/** Ends every open question without an answer. Idempotent. The only caller of abort, deny and the release of Mastra's leftovers. */
declare function endQuestions(session: ControllerSession, bound: { ms: number }): Promise<void>
```

The service holds `runs: Map<string, LiveRun>`, keyed by conversation id, the only map of runs in the Hub.

### 3. The question, step by step

1. `takeStep` returns `suspended`. The run waits until `readOpenCalls(session)` returns the stored
   call, because `agent_end` fires 13 to 19 ms before Mastra saves it (spike S-2). Then it writes
   `WAITING`, releases the VM hold (5 minute idle window) and arms the inbox timer.
2. The inbox takes the first `WaitEnd`. A late second one is refused (`ENDED` or `BUSY`).
3. `ANSWER`: the run holds the VM again, checks the incarnation, writes `AGENT` and calls
   `respondToToolSuspension` on the same session. The first command after an E2B pause resumes the
   VM (2.3 to 2.5 s, spike S-1 E2B); inside the window it is warm (0.3 s).
4. `MESSAGE`: `endQuestions` (abort once the call is stored, then wait until Mastra releases the
   thread), then `sendMessage`. About 1 s (spike S-2). `Session.steer` is not used: it waits Mastra's
   5 s abort grace and tags the message as sent while active.
5. `EXPIRED` and `STOPPED`: the run exits. `endQuestions` runs at exit, before the final row frees the
   Project.
6. Restart: the takeover writes the row and touches no Mastra state. The leftover call stays `call`
   on the thread. The card is drawn only from the session's pending suspensions, so it is not shown.
   The conversation's next send runs `endQuestions`, which denies it with
   `session.runEngine.settleSuspendedToolCallsAsDenied` (idempotent, spike S-3).

Rules the code makes hard to break:
- The Hub has one `sendMessage` call site, inside `takeStep`, after `endQuestions`. A bare send with a
  question open loses the message silently (spike S-1).
- `endQuestions` has a time bound. If Mastra does not release the thread in time it throws
  `BUILDER_QUESTION_NOT_RELEASED`, the run fails, and the next send runs it again.
- The Mastra leftovers release (AC-8) is called only from `endQuestions`. The release path is the one
  spike S-8 proves; section 8 records it.

### 4. One session per conversation

`conversation.ts` owns the one session and the one sandbox instance per conversation. The workspace
resolver is a lookup by `controller.scope`, never a factory, because Mastra calls it on every agent run
(spike S-4: a factory built 11 sandboxes for one turn). The sandbox instance starts no VM until the
first command. The idle sweep (10 minutes) skips a conversation when the run is open, when the session
is running, or when it has pending suspensions; it deletes with plain `deleteSession`. Gone:
the `builder:` scope, `runContexts`, `conversationWorkspaces`, the `runTools` map, `owners`, the
session swap in the stream route.

### 5. API surface

| Endpoint | Method | Key inputs | Key outputs | Auth | Key errors |
| --- | --- | --- | --- | --- | --- |
| `builder-session/messages` | POST | content, idempotency key | 201 new run, or 200 the waiting run that took the message | session, Project member | `PROJECT_BUSY`, `BUILDER_BUSY` |
| Mastra `tool-suspension` (intercepted) | POST | toolCallId, resumeData | `{ ok: true }` | same | `QUESTION_ENDED` (409), `TOOL_ANSWER_REFUSED` |
| Mastra abort (intercepted) | POST | | | same | `BUILDER_RUN_STOP_REFUSED`: Stop goes through the Hub's cancel |
| run cancel | POST | builderRunId | run summary | same | unchanged |

### 6. Value sourcing

| Action | Value | Source |
| --- | --- | --- |
| wait timer | how long a question waits | `CONEXUS_BUILDER_QUESTION_WAIT_MS` in the Hub's typed loader (`apps/hub/src/platform/config.ts`), default 30 min; a local run sets a shorter wait in its own env file |
| VM idle window | 5 minutes | `CONEXUS_BUILDER_SANDBOX_IDLE_MS` in the same loader, default 5 min |
| card shown | whether a question is open | the session's `pendingSuspensions` |
| answer accepted | the open call id | the session's suspension registry, checked by the inbox |
| expiry row | failure code | the table row `BUILDER_QUESTION_EXPIRED` |
| waiting label | phase | the run summary's `phase` |

### 7. Census targets

The census is a script that finds each item by mechanism. The first build slice puts it in this
repository and in CI with today's numbers, and the build works until the targets hold.

| Item | Today (main d449a339) | Target |
| --- | --- | --- |
| SQL functions in force writing `state` or `phase` | 11, plus 1 trigger | 9, plus the same trigger |
| `jsonb_build_object` literals with `builderRunId` | 10 in 9 functions, 8 are the summary | 1 summary literal, in `run_summary` |
| `PARKED` or `parked_at` references | 93 in 27 files | 0 outside the immutable migrations and the new migration's drops |
| Calls that undo Mastra's abort (`suspensions.clear`, `requestAbort`, `letGoOfParked`, `deleteSessionLeavingParked`, `suspensions.register`) | 7 | 0 |
| `sendMessage` call sites in the Hub | 1 | 1, behind `endQuestions` |
| Session scope strings | `builder:` and `conversation:` | `conversation:` only |
| `Map` or `Set` passed across a module boundary in `apps/hub/src/builder` | 3 | 0 |
| Function length suppressions in the run files | 7 | 0 |
| Failure codes written without a table row | 2 | 0 (enforced by the `FailureCode` type) |

### 8. Mastra leftovers on a question that ends without an answer

`@mastra/core` 1.71 keeps the `agentic-loop` workflow registered for a resume that never comes, and
keeps two suspended snapshot rows (spike S-6: about 0.14 MB per question, never released). The
release path is chosen by spike S-8 and recorded here before approval.

`endQuestions` releases them right after the deny, in this order (spike S-8, N=100, heap after
forced GC against a control of 4.7 MB):

1. `session.abort()` once the call is stored, then wait until Mastra releases the thread.
2. `controller.getMastra().__unregisterInternalWorkflow('agentic-loop', runId)`. Only `agentic-loop`
   is registered. This is an internal Mastra call; it is the one place the Hub uses one.
3. `getStore('workflows').deleteWorkflowRunById` for the run's `agentic-loop` and
   `executionWorkflow` snapshot rows (public API).

Result: 3.3 MB, no registration, no snapshot rows, `listSuspendedRuns` empty. Without it: 15.1 MB,
100 registrations, 200 rows, 100 dead runs listed. After a restart the same function runs at the next
send: `settleSuspendedToolCallsAsDenied`, then step 3 (a crash between the two is safe; heap of the
new process unaffected).

Rejected: resuming the question with Mastra Code's skip value (`'(skipped)'`). It makes the model
answer the skip in an extra call before it reads the message, and Stop or expiry would still spend
that call.

An answered question leaves about 0.1 MB in Mastra's thread registry until its warm TTL
(`MASTRA_SUSPENDED_RUN_TTL_MS`, 30 minutes by default) passes. That is bounded, so the Hub does not
change the TTL. A test asserts that Mastra still leaves the registration after an abort; when an
upgrade fixes it, the test fails and the release goes.

An upstream issue to Mastra describes the defect; the Hub's release is removed when Mastra fixes it.

### 9. SQL (one new migration)

- Rows in `PARKED` become `INTERRUPTED` `HUB_RESTART` (development data, no compatibility).
- Phase CHECK and vocabulary: `PARKED` becomes `WAITING`; `parked_at` is dropped.
- Dropped: `resume_builder_run`, `expire_parked_builder_runs`.
- New `builder.run_summary(builder.builder_run) RETURNS jsonb STABLE`, called by every function that
  returns the run.
- `set_builder_run_phase` keeps the owner and answers the summary, or NULL when refused.
- `take_over_stale_builder_runs` no longer skips a waiting run.
- `request_builder_run_cancellation` loses its `PARKED` branch.
- Kept: `builder_run_phase_boundary`, the Project row lock, the one active run per Project index.
- Not added: a revision column, a transition trigger, owner checks on writes. One Hub per database
  holds (AC-12), so the run is the one writer.

### 10. Screen

One scope, `conversation:<id>`. The card is drawn from the session's pending suspensions. The phase
`WAITING` shows "Esperando a sua resposta", with no countdown. The composer is open during the wait
and Enter sends. Stop is its own control; the model picker stays locked. A refused card answer shows
the `QUESTION_ENDED` text from the table. Gone: `isParked`, the 15 s parked poll, `NOT_PARKED`, the
`builder:` session handle, the time heuristic in `transcript.ts` that guesses which run owns a card.

Frontend rules this changes (`conexus-frontend`, `docs/reference/frontend-and-product-surfaces.md`
33.6.2). The Composer row ("Enter to send ... clear sending/stopping feedback") gains one case: while
a question waits, Enter sends the message, which ends the question, and Stop is its own control
instead of the one submit button turning into Stop (`composer.tsx:114`, `:199-204`). The Progress row
("actual facts, no fabricated timers") applies to the wait: no countdown, since the Hub sends no
deadline. The Model row stays: the picker is locked while the run waits. The test
`tests/live/builder-typing-while-parked.test.mjs` changes from "typing does nothing" to "typing
answers".

### 11. Outcomes, races and edge cases

**Answer outcomes.** `LiveRun.answer` returns `ACCEPTED | ALREADY_ANSWERED | UNKNOWN_CALL | ENDED`.

| Outcome | When | HTTP | Failure row |
| --- | --- | --- | --- |
| `ACCEPTED` | the call is pending on the live session and the inbox is empty | 200 | |
| `ALREADY_ANSWERED` | the same call id was already taken by the inbox | 409 | `TOOL_ANSWER_ALREADY_GIVEN` (kept) |
| `UNKNOWN_CALL` | the call id is not pending on the session | 409 | `QUESTION_ENDED` |
| `ENDED` | no live run for the conversation, or the wait already ended | 409 | `QUESTION_ENDED` |

**Who takes a message.** Only a run in `WAITING` takes a message (it goes to the inbox). Once the
inbox has taken a `WaitEnd`, the run leaves `WAITING`: a later message gets `BUILDER_BUSY` and the
composer is back to Stop only, as today. Stop in `AGENT` or `PREPARING` goes through the run's abort
signal, not the inbox. A Stop in `WAITING` only marks the request in SQL (the `PARKED` branch of
`request_builder_run_cancellation` goes, so `WAITING` falls in the `RUNNING` branch that only marks)
and drops `STOPPED` in the inbox. The run writes the final row after `endQuestions`, and the
service removes the conversation from `runs` only after that write.

**A resent message.** The `LiveRun` keeps the idempotency keys of the messages it took; a resend with
a known key returns the same 200 body and adds no user turn. `request_text` and `trigger_message_id`
keep the run's first message; the later messages live in the Mastra thread.

**More than one question.** The wait timer is armed per question. If one step suspends more than one
call (`readOpenCalls` returns several), the run stays in `WAITING` until every call is answered or
the wait ends; a message or an expiry ends all of them through `endQuestions`. `submit_plan` and
`ask_user` follow the same path; each keeps its own `resumeData` shape, an approved plan continues in
the same run, and a plan that expires writes `BUILDER_QUESTION_EXPIRED` too.

**After a restart.** Until the takeover runs (stale heartbeat, about 30 s), the row is still
`RUNNING` / `WAITING` with no live run in this Hub: a message gets `BUILDER_BUSY` and an answer gets
`QUESTION_ENDED`. A `WAITING` run has no candidate (the candidate is recorded only after the agent
completes), so the takeover writes `INTERRUPTED` `HUB_RESTART`. At the conversation's next send,
`endQuestions` finds the dead Mastra runs with `agent.listSuspendedRuns({ threadId, resourceId })`,
denies their calls with `settleSuspendedToolCallsAsDenied`, and deletes their snapshot rows. No
unregister is needed in a new process.

**Hub stop.** `stopRuns` drops `STOPPED` (`HUB_STOPPING`) in every waiting inbox; each run ends its
questions within the `endQuestions` bound and exits, so shutdown never waits for a 30 minute wait.
The heartbeat lists the run ids of `runs`.

**Capacity.** The heap refusal that exists today (`BUILDER_CAPACITY_FULL` before a run is created)
stays and counts every live run, `WAITING` included. `evictParked` goes; nothing is evicted.

**The VM during a long wait.** After the 5 minute idle window E2B pauses the VM and keeps its id; the
next command resumes it. If the VM was replaced or deleted instead, the existing incarnation check
(`run-runtime.ts:461-466`) fails the run with `BUILDER_SANDBOX_INCARNATION_CHANGED`, as today, and the
person resends.

**The gate across a question.** One gate per run: verdicts by revision and the red budget of 3 live in
the run and survive the wait and a message continuation. `redFinishes` goes.

**Telemetry.** The run span starts at the claim and ends at the final write, the wait included. Each
phase is a child span; `WAITING` gets a span event when it starts, so a long wait is visible before
its span ends. Run events export their fields as attributes.

**The two idle sweeps.** The conversation session sweep (`conversation.ts`, 10 minutes) is the one
with the new skip rules. The paused VM sweep (`idle-machine-sweep.ts`, 7 days) already skips a
conversation with an open run, `WAITING` included; only its comments change.

**Failure table rows.** New rows, with their text (the message never says "tente" and never gives an
order; the action is separate):

| Code | Category | Status | Message | Action |
| --- | --- | --- | --- | --- |
| `BUILDER_QUESTION_EXPIRED` | `USER` | | A pergunta ficou sem resposta e foi encerrada. A sua próxima mensagem continua o trabalho. | `NONE` |
| `QUESTION_ENDED` | `USER` | 409 | Esta pergunta já foi encerrada. A resposta pode ir na próxima mensagem. | `NONE` |
| `BUILDER_QUESTION_NOT_RELEASED` | `SYSTEM` | | O Builder não conseguiu encerrar a pergunta. A falha foi registrada. | `NONE` |
| `BUILDER_SOURCE_ADMISSION_FAILED` | `SYSTEM` | | A mudança não entrou no app. A falha foi registrada. | `NONE` |
| `BUILDER_RUN_SETTLE_LOST` | `SYSTEM` | | O Conexus perdeu o fim deste trabalho. A falha foi registrada. | `NONE` |

Rows that go when the census finds no writer left: `BUILDER_RUN_PARKED_EXPIRED`,
`BUILDER_SUSPENSION_NOT_FOUND`, `BUILDER_PARKED_DISCARD_FAILED`, `PARKED_CALL_NOT_FOUND`,
`BUILDER_ANSWER_UNAVAILABLE`, `BUILDER_SESSION_NOT_READY`, and the event
`BUILDER_PARKED_SESSION_EVICTED`. The event `BUILDER_RUN_TIMING` stays: the eval reads it.

**The census in CI.** `scripts/census-builder-run.mjs` runs in the quick group of
`.github/workflows/verify.yml`. It compares each count with `contracts/technical/census-builder-run.json`
and fails when a count goes up. Slice 1 commits today's numbers; the last slice commits the targets of
section 7. It skips the immutable migrations and generated files.

**Tests.** Deleted: `tests/implementation/builder-parked-run.test.mjs`. Rewritten:
`tests/live/builder-park-and-answer`, `builder-reload-while-parked`, `builder-typing-while-parked`,
`builder-second-question` (renamed for the wait). Changed: `builder-run-runtime`,
`builder-run-dispatch`, `builder-session-routes`, `builder-session-lifecycle`, `builder-run-lease`,
`builder-transcript`, `builder-failure-rows`. New: `builder-run-question.test.mjs` on the real
`startRun`, real `@mastra/core`, a scripted model and a fake sandbox, porting the spike cases; and a
test that fails when a Mastra upgrade no longer leaves the `agentic-loop` registration after an abort.

**Key invariants**:
- One live run per conversation in the Hub, one active run per Project in the database.
- A question is open if and only if the session lists it as pending.
- No `sendMessage` while a question is pending.
- Every question ends exactly once: answered, or ended by `endQuestions`.

**Security model**: unchanged. Only a member of the Project reaches the session routes; the
conversation owner check stays in the preHandler.

**Configuration required**:
- `CONEXUS_BUILDER_QUESTION_WAIT_MS`: how long a question waits. Default 30 minutes; a local run sets
  a shorter wait in its own env file.
- `CONEXUS_BUILDER_SANDBOX_IDLE_MS`: the VM idle window. Default 5 minutes.

Spec 0008 sorts both as installation settings with editor `operator`. Its registry is slice 1 of
0008, not built yet, so this wave reads them through the typed loader, which fails closed on a bad
value. Slice 1 of 0008 moves them into the registry.

**Critical test scenarios**:
- Happy path: question, answer inside the window, the run continues and admits a change, on the real
  `startRun` with real `@mastra/core`, a scripted model and a fake sandbox. Verifies **AC-1**, **AC-2**,
  **AC-10**.
- Message during a question, 100 runs, plus a message fired inside the 13 to 19 ms window. Verifies
  **AC-3**.
- Expiry at a short `questionWaitMs`, and Stop during the wait. Verifies **AC-4**, **AC-5**.
- Restart: kill the Hub during a question, start a new one on the same Postgres, reload, answer the old
  card, send a message. Verifies **AC-6**.
- 200 questions ended each way, heap and snapshot rows against a control. Verifies **AC-8**.
- Live E2B, one question answered at 2 minutes and one at 6 minutes. Verifies **AC-2**, **AC-9**.
- Drop the instance lock connection; the Hub exits. Verifies **AC-12**.
- Browser: the composer during a question, Enter sends, Stop separate, reload hides an ended card.
  Verifies **AC-7**, **AC-15**.

## Build plan

One pull request, one green commit per slice. Removal comes before construction.

1. Put the census in the repository and in CI with today's numbers. Satisfies **AC-14**.
2. Move `run-runtime.ts` into `run/` by subject (`turn`, `checkout`, `judge`, `mirror`, `admit`,
   `phase`), with no behavior change and no test change. Satisfies **AC-14** (function length).
3. The question as a wait: `WAITING`, the inbox, `endQuestions`, the Mastra leftovers release, the one
   `sendMessage` call site; delete the parked path (warm map, legs, answer as a new run, seven day
   expiry, `redFinishes`), and the migration of section 9. Satisfies **AC-1** to **AC-6**, **AC-8**,
   **AC-10**, **AC-11**.
4. One session per conversation: `conversation.ts`, the resolver lookup, the sweep rules, one scope in
   the routes and the web. Satisfies **AC-7**.
5. The VM idle window and the Hub exit on a lost instance lock. Satisfies **AC-9**, **AC-12**.
6. Telemetry: the run span, phase spans, exported event fields. Satisfies **AC-13**.
7. The screen and the docs. Satisfies **AC-15**, **AC-16**.

## Consequences

**Positive**:
- An answer no longer prepares the environment again.
- A question never holds the Project longer than the configured wait.
- About 640 lines of product code go and about 320 come, net about 320 fewer, plus about 650 lines
  moved into files by subject.

**Negative / tradeoffs**:
- A question unanswered before a restart or past the wait is lost. The person writes the answer as a
  message; the model sees the denied question.
- The Hub depends on one internal Mastra call to release the leftovers until Mastra fixes it upstream.
- The VM can stay on up to 5 minutes per stop.

**Neutral**:
- Two conversations of one Project still run one at a time. A per conversation lock is a later wave.

## Migration plan

**Strategy**: no migration needed beyond one SQL migration in the same deploy.
**Phases**:
1. The migration turns rows still in `PARKED` into `INTERRUPTED` `HUB_RESTART`, swaps the phase
   CHECK, drops `parked_at`, `resume_builder_run` and `expire_parked_builder_runs`, and adds
   `run_summary`. Development data only; no old shape is read after it.
2. The new Hub starts on it. A question that was parked before the deploy is gone; the person writes
   the answer as a message.
**Rollback**: revert the pull request and restore the database from the backup taken before the
deploy; migrations are forward only and pinned by digest.
**Risks**: a pinned migration digest or catalog snapshot out of date fails the check; regenerate both
in the same commit.

## Follow-up

- [ ] The per conversation lock as its own wave, with the per person conversations.
- [ ] Mastra issue #25903 (https://github.com/mastra-ai/mastra/issues/25903): remove the leftovers release when a Mastra upgrade fixes it.
- [ ] Slice 1 of spec 0008 moves the two Builder settings into the settings registry.
