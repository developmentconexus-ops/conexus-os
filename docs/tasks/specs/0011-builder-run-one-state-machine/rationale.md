# 0011. Rationale

## Context

> Premise note: the old design assumed a question must survive a Hub restart and any delay. That
> premise was patched eight times (#382, #437, #442, #452, #472, #473, #474, #481): each patch fixed a
> side effect of treating the answer as a new run leg. The decision of 2026-10-03 drops the premise: a
> question whose session ended ends with it, as in Claude Code, and the next message carries the
> answer. This spec redesigns the run as if that had been true from day one.

How the run works today on main d449a339. A question (`ask_user` or `submit_plan`) suspends the
Mastra run. The Hub writes phase `PARKED`, releases the owner, pauses the VM, keeps the session warm
for 30 minutes in a module map, and lets the run leg end. The answer comes through Mastra's
`tool-suspension` route, which the Hub intercepts; the Hub resumes the row with
`resume_builder_run` and dispatches a new leg. The new leg reopens the sandbox, the checkout and, if
the warm entry is gone, a new session, reads the open call from the thread and registers it in
Mastra's suspension registry before it resumes. To keep the warm session from denying the question,
the Hub clears Mastra's registry and marks the abort as done (`letGoOfParked`,
`deleteSessionLeavingParked`). A question unanswered for seven days expires.

What that costs. Every answer prepares the environment again (3.2 to 4.7 s measured per turn on an
existing conversation). The run has two state machines, the SQL one and an in-memory one made of
flags (`parking`, `answered`, `endPublished`, `candidateRecorded`). Each conversation has two Mastra
sessions (`builder:` for the run, `conversation:` for the browser) tied by three maps. The gate is
built again per leg, so a revision can be judged twice; the red budget crosses legs through a map a
restart clears. The run summary JSON is copied in 8 SQL literals. A question holds the whole Project
for up to seven days. Two failure codes are written without a table row (`service.ts:107`, `:465`),
because `failBuilderRun` takes a `string`, against spec 0009's rule.

What Mastra 1.71 already does, by source and by spike. A suspended tool waits on the live session
and `respondToToolSuspension` resumes it, past Mastra's 30 minute warm TTL too, from the Postgres
snapshot (S-1). `abort()` denies the open suspensions and stores them as `output-denied`; after the
thread is released the next `sendMessage` starts a clean run whose prompt holds the denied call
(S-2). After a crash, `settleSuspendedToolCallsAsDenied` denies a leftover call once (S-3). A session
resolves its workspace through the controller's resolver keyed by scope (S-4). What Mastra does not
do: end a question on a timer (its TTL only frees memory), release the `agentic-loop` registration
and snapshot of a question that ends without a resume (S-6), or keep one Hub per database.

## Options considered

### Option 1: the run as one coroutine with a one slot inbox

A run is one async function from claim to last write. Its position in the code is its state; the
row mirrors it. Routes, the timer and Stop drop one `WaitEnd` into the inbox; the first wins. One
idempotent function, `endQuestions`, ends every question that is not answered, before every send and
at exit. The takeover touches only SQL and Git.

**Pros**:
- One actor owns the session, the sandbox and the row while the run lives, so the two compare and set
  machines of earlier drafts are not needed.
- The races are closed by construction: one `sendMessage` call site behind `endQuestions`, one inbox
  with a synchronous first wins check, the deny only after the call is stored.
- Deletes the most: about 640 product lines go and 320 come.

**Cons**:
- The transition table lives in code (the step loop and one exhaustive switch), not as data a test
  can diff.

### Option 2: the run as a reducer with effects as data

The run is a value with nine kinds. A pure `transition(state, event)` returns the next state and a
list of effects; a thin actor persists, then runs the effects. A generated transition table is
diffed in CI.

**Pros**:
- The transition table is data, testable without Mastra.
- Restart is the same table: the row becomes a state and an `ORPHANED` event.

**Cons**:
- Adds an interpreter layer (effects as data, an actor that runs them) between the run and Mastra,
  which is itself the stateful system; the effects mirror Mastra calls one to one.
- Deletes less: net about 250 to 300 lines, with about 1,400 lines in the new folder.

### Option 3: fix in place

Keep `PARKED` and the leg, and remove only the preparation on answer: keep the started sandbox and
the session across legs.

**Pros**:
- The smallest diff.

**Cons**:
- Keeps the premise that was patched eight times, the two sessions, the expiry, the warm map and the
  moves against Mastra's own abort. The next side effect would be the ninth patch.

## Rationale

Option 1. The run is a single actor with a short life, and Mastra's session already holds the state
that matters (whether a question is pending). A coroutine reads top to bottom like the person's
experience: prepare, work, maybe wait, finish. Its one exhaustive switch over `WaitEnd` makes a fifth
ending a compile error, which is the part of Option 2's table that carries weight. Option 2's effect
interpreter would sit between the run and Mastra and repeat Mastra's calls as data; it adds a layer
for testability that the real run test (real `@mastra/core`, scripted model, fake sandbox) already
gives. Option 3 keeps the premise.

Two grafts from Option 2: a time bound on `endQuestions`, because a hang there would hold the
Project lock; and the extra census rows (one `sendMessage` call site, one session scope, failure codes
typed).

Choices settled while designing:
- No revision column and no transition trigger. The run is the one writer, a Stop already beats a
  late phase write through `builder_run_phase_boundary`, and one Hub per database holds once the Hub
  exits on a lost instance lock (S-3 showed the lock can be lost while the Hub keeps running).
- A message with the card open uses abort, wait for release, then send (about 1 s), not
  `Session.steer` (5 s grace, message tagged as sent while active). Both delivered every message in
  240 runs.
- The deny waits until the call is stored. `agent_end` fires 13 to 19 ms before Mastra saves the
  call; a deny in that window is overwritten (99 of 100 runs left the call open forever).
- After a restart the takeover does not open a Mastra session. The leftover call is denied by the
  conversation's next send, and the card is drawn only from pending suspensions, so nothing stale
  shows.
- The VM is never paused by the Hub. A 5 minute idle window lets E2B pause it (warm answer 0.3 s,
  paused 2.3 to 2.5 s, S-1 E2B).
- The Project lock stays. Removing it was measured (about 215 product lines plus the web read and an
  application migration ordering fix) and is a later wave; with a short wait, a question no longer
  holds the Project for days.

## Evidence from the spikes

| Spike | Fact | Result |
| --- | --- | --- |
| S-1 | 5 minute wait, answer on the same session; answer past the TTL from Postgres | verified |
| S-1 | after the TTL sweep, a message sent without abort is lost silently | verified |
| S-1 E2B | warm answer 0.3 s; paused answer 2.3 to 2.5 s; same sandbox id; files kept | verified, one sample per policy |
| S-2 | message delivery with steer and with abort plus release: 0 lost of 240 | verified |
| S-2 | deny inside the 13 to 19 ms window before the call is stored is overwritten | verified |
| S-3 | after a crash the call stays open; `settleSuspendedToolCallsAsDenied` denies it once | verified |
| S-3 | the instance lock can be lost while the Hub runs | verified |
| S-4 | resolver called on every agent run; must be a lookup | verified |
| S-4 | same `Session` object for browser and run with one scope | verified |
| S-6 | an aborted question keeps about 0.14 MB (registration and snapshot) | verified, retainer path found |
| S-7 | per conversation lock: about 215 product lines, Postgres test 5 of 5 | verified, deferred by decision |
| S-8 | abort, release, delete snapshot: heap at control level, no rows; skip resume costs an extra model call | verified |
