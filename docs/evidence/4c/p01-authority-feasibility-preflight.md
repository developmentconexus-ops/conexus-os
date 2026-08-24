# 4C P-01 — Builder Authority / Feasibility Preflight

> **Status:** `OPEN / OPERATOR AUTHORIZED / AUTHORITY PREFLIGHT / F14 FINDING / P7 BLOCKED / P8 BLOCKED / NOT LOCKED`
> **Block:** `P-01 — Build + Plan/Preview/Code/Diff/Findings/Evidence/assistant`
> **Product implementation authority:** none.

The operator explicitly authorized opening P-01 after W-04 lock. P-01 must derive a human-operable Builder workspace from accepted Product/wire authority before any functional P8 is created.

## 1. Accepted Builder job

Current Product authority already fixes the core direction:

```text
user states bounded Change intent
→ Change pins current accepted Baseline
→ proportional planning / checkpoint when warranted
→ Hub-owned live progress
→ Builder executes bounded work
→ Preview / Code / Diff remain inspectable
→ Findings / Evidence remain durable trust surfaces
→ contextual Conexus assistance helps the operator understand current work
→ Release work remains later Project scope
```

Build is agent-first but not agent-only, and is explicitly not an IDE as the primary Product experience.

Binding laws carried into P-01:

```text
model narration != Hub progress
0 Findings != verified
working != blocked != waiting-for-user != completed
building next candidate != currently inspectable last-good Preview
Preview ready != verified != Release AVAILABLE != live
conversation != Change truth
conversation != Plan truth
conversation != verification
```

## 2. Current exact operation surface

P-01 currently consumes only existing Builder authority:

```text
BLD-01 ListChanges
BLD-02 GetChange
BLD-03 CreateChange
BLD-04 GetChangePlan
BLD-05 DecideChangePlanCheckpoint
BLD-06 GetChangeProgress
BLD-07 GetChangeDiff
BLD-08 ListProjectSourceTree
BLD-09 GetProjectSourceFile
BLD-10 GetRunPreview
BLD-11 ListChangeFindings
BLD-12 GetFinding
BLD-13 CloseFinding
BLD-14 ListChangeEvidence
BLD-15 GetEvidence
BLD-16 AskConexusAboutContext
BLD-17 GetChangeExecutionDetail
```

Permissions remain split:

```text
project.build
→ BLD-01..04 / BLD-06 / BLD-10 / BLD-16 / BLD-17

project.review
→ BLD-05 / BLD-11..15

project.source.read
→ BLD-07..09
```

Visible placement must never collapse these authority classes.

## 3. Reference evidence — August 2026

References are Evidence only, never Conexus Product authority.

### Replit Agent

Source: `https://docs.replit.com/features/agent/overview`

Current documentation preserves a natural-language Agent entry, a separate Plan mode that creates an ordered task list for review before code/data changes, visible task lifecycle, Preview, and Project Editor tools around the build experience.

Useful inference for Conexus:

```text
plain-language intent + reviewable plan + visible build progress
```

Mismatch:

```text
Replit chat/project editor may carry more of the experience than Conexus may safely treat as authority.
```

### Lovable Build / Plan modes

Source: `https://docs.lovable.dev/features/agent-mode`

Current documentation explicitly separates Plan mode for deciding an approach from Build mode for implementing/verifying it, while exposing visible tasks, file diffs, summaries and detail during execution.

Useful inference:

```text
decision mode != execution mode
progress/diff should be inspectable while autonomous work proceeds
```

Mismatch:

```text
Conexus cannot make the chat transcript or task narration operational truth; Hub owner facts remain authoritative.
```

### OpenAI Codex app

Source: `https://openai.com/index/introducing-the-codex-app/`

Current Codex app emphasizes directing/supervising long-running agent work, task/thread context, review of agent changes and diff inspection rather than forcing all work through a traditional IDE.

Useful inference:

```text
agent work benefits from durable task context + reviewable outputs + progressive technical depth
```

Mismatch:

```text
Conexus has stronger Product-owner / Plan / Evidence / Release semantics and must not flatten them into one coding-agent thread.
```

## 4. Material authority findings before layout

### F14-A — Change human meaning is lost after creation

Current `BLD-03 CreateChange` accepts required `intent`, but current `ChangeSummary` and `Change` projections do not return it.

Therefore a returning Build surface can identify current Changes only by machine identity + owner state unless the frontend invents parallel labels.

That violates the accepted meaning:

```text
Change = bounded/verifiable Project evolution describing what must become true
```

### F14-B — contextual assistant cannot bind an exact current Change

Current Product/ledger language says `BLD-16 AskConexusAboutContext` serves selected current authorized Project context. Current wire request contains only `question` under exact `projectId`.

For a Project with multiple Changes, the server cannot distinguish:

```text
Project-level question
vs
question about exact current Change A
vs
question about exact current Change B
```

Encoding `changeId` only inside user prose would make browser/model text carry a semantic subject that current server contract does not bind.

## 5. P8 block

P8 is blocked until F14 resolves both findings inside the existing Builder owner with no Product topology expansion.

```text
P-01 = OPEN
F14 = OPERATOR ACCEPTED DIRECTION / SELECTED REALIZATION PENDING RED
P7 = BLOCKED UNTIL F14 GREEN
P8 = BLOCKED
```
