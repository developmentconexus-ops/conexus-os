# P-01 P8 — App-first Build root revision

> **Status:** `OPERATOR ACCEPTED / P8 APP-FIRST REVISED CANDIDATE / NOT LOCKED`
> **Authority impact:** interaction-only; no Product/wire/Permission/owner change
> **Current P8 blob:** `54e5daef1ff76652ea9841421ff9713c832adaff`

## Operator falsifier

The focused P8 still made `Change` a prerequisite navigation concept: Build opened a Change overview and required the user to choose or create a Change before seeing the program. That is backwards for an AI software builder.

The user enters Build to see and evolve the application, not to administer Builder work records.

## Selected invariant

```text
Build → current application + Conexus

initial state
→ current Project application Preview
→ Conexus chat sidebar
→ no active Change required

Build instruction → BLD-03 CreateChange
→ authored instruction becomes exact Change.intent
→ Change emerges from the work
→ current/last-good application remains visible while candidate builds

Plan instruction → no Change mutation
```

`Change` remains durable work truth behind the interaction. It is not removed from the architecture and does not become browser-derived.

## Product truth separation

```text
chat = human interaction surface
Change = durable work truth
Plan = governed execution intent
Hub progress = execution truth
Evidence = verification truth
Preview = product result
```

The root remains simple while exact Plan, Findings, Evidence and execution detail stay available on demand.

## Authority preserved

```text
conversation != Change
conversation != Plan truth
conversation != Progress truth
conversation != verification
project.build != project.review != project.source.read
current != candidate
Preview ready != verified != live
```

Chat history in this P8 is `EPHEMERAL_UI` fixture evidence only; durable Builder conversation/thread persistence is not admitted by this revision.

## Artifact lineage

```text
first P8                 0abcde6902a1540aabb07e54ff08d59ad430e7ab
shell-coherent revision  43ec72ec7443e6d28cbd3abcd0cb79f2d1955db7
focused-work revision    02a07c7f8fd654a75eb066ee914247f0160a64f8
app-first revision       54e5daef1ff76652ea9841421ff9713c832adaff
```

## Proof chronology

```text
Verify #836 — app-first selected RED
111 tests / 109 pass / 2 exact expected failures

Verify #837 — app-first behavior realized; 2 predecessor assistant-panel guard failures only

Verify #839 — app-first functional GREEN
111 / 111 tests

Verify #841 — status RED
112 tests / 111 pass / 1 exact expected failure
```

Current gate: `APPROVE | REVISE`.

P-01 remains NOT LOCKED. P-02+, P11, 4D and Product implementation remain blocked.
