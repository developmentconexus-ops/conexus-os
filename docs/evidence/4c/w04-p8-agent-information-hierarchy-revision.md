# 4C W-04 — P8 Agent Information Hierarchy Revision

> **Status:** `OPERATOR ACCEPTED / INTERACTION-ONLY REVISION / P8 REVISED CANDIDATE / NOT LOCKED`
> **Block:** `W-04 — Workspace Agent catalog`.
> **Authority impact:** none. `4C-F13`, `PRJ-22`, Project ownership, operation count and Permission topology remain unchanged.
> **Implementation authority:** none.

## 1. Operator falsifier

The first W-04 P8 correctly proved the Workspace Agent catalog as a human-first, access-filtered `PRJ-22` discovery surface, but the operator found the Agent presentation too information-thin and the handoff too generic.

The material questions raised were:

```text
Is this surface only where I see Agents?
Can I edit an Agent?
Can I talk to it?
Can I inspect its tools?
Can I inspect/evolve its instructions/system behavior?
How does this relate to an Agent Studio such as Mastra?
```

The root issue was not missing W-04 Product authority. It was that the first P8 under-communicated the distinction between the Workspace discovery catalog and the richer Project-owned Agent work surface already preserved for later frontend planning.

## 2. Research evidence

Reference products are Evidence only, never Conexus authority.

Current Mastra Studio / Agent Editor experience demonstrates the value of treating an Agent as a rich work subject rather than only a row of metadata: instructions/prompt blocks, tools/MCP, versions/draft-publish, testing, traces, datasets/evals and related authoring/inspection work are brought together around one Agent.

Current Microsoft Copilot Studio similarly separates Agent discovery from a richer build/test experience containing instructions, knowledge/tools and preview/test interaction.

Conexus adopts the human-product lesson but not their authority model.

```text
Mastra/Copilot lesson
→ Agent should feel like a rich work subject

Conexus constraint
→ authored Agent evolution still follows Builder/Change → candidate/diff/proof → immutable revision → Release
→ W-04 project.read catalog must not expose project.source.read content by convenience
```

## 3. Canonical experience distinction

The accepted product-direction invariant is:

```text
WORKSPACE AGENTS
= DISCOVER

PROJECT-OWNED AGENT WORKSPACE
= UNDERSTAND + COMPOSE + TEST + VERIFY + OPERATE

PUBLISHED-APP AGENT
= USE
```

This is a destination/ownership invariant only. It does **not** open or lock the future P-03 block and does not select its final tabs, component tree, URL or exact layout.

The current candidate surface inventory already preserves the deeper owner-specific boundaries:

```text
PRJ-S16 Agents
PRJ-S17 Agent triggers
PRJ-S18 Agent runs
PA-S03 Product Agent conversation
```

W-04 must make the existence of deeper Agent work understandable without implementing any of those surfaces inside the Workspace catalog.

## 4. Rejected revision directions

### A — put system prompt/tools/editor controls directly in Workspace Agent cards

**REJECTED.** This would leak or imply `project.source.read` semantics under a `project.read` catalog and turn W-04 into a second Agent owner/editor.

### B — make Workspace Agents a fleet dashboard

**REJECTED.** Runtime health, runs, triggers, approvals and operational evidence have exact Project/PAR owners. W-04 remains discovery, not fleet management.

### C — keep the first P8 unchanged and defer all explanation to P-03

**REJECTED.** The catalog then materially understates what an Agent is and gives a weak handoff, causing the exact operator confusion observed during walkthrough.

### D — richer discovery cards + explicit `Open Agent` destination boundary

**ACCEPTED GLOBAL MAXIMUM for this interaction revision.**

## 5. Revised P8 contract

The revised Workspace card hierarchy is:

```text
Agent name
→ Purpose / what this Agent is for
→ Owning Project
→ Authored revision
→ Release reference count
→ Project-owned Agent workspace cue
→ Included in active Release | No active Release
→ optional Technical coordinates
→ Open Agent
```

`Purpose` is promoted from secondary small copy to a material human explanation.

The card must communicate:

```text
This catalog is for discovery; it is not the Agent editor.

Instructions, tools, testing, verification and operations
continue in the owning Project.
```

`Open Agent` terminates at a P-03 destination boundary in this P8. It does not render an editor, call `PRJ-21`, or imply that the current user possesses `project.source.read`.

## 6. Preserved authority

```text
PRJ-22 Workspace catalog → project.read
PRJ-20 / PRJ-21 authored Agent inspection → project.source.read

project.read != project.source.read
catalog visibility != authoring authority
catalog visibility != runtime authority
```

Still forbidden in W-04:

```text
Create Agent
Edit Agent
Run Agent
system-prompt editor
Tools editor
runtime-health inference from activeReleaseId
fleet dashboard
Workspace Agent owner
frontend-derived Agent identity/purpose
```

The richer presentation uses only fields already present in the accepted `WorkspaceProductAgentCatalogItem` projection.

## 7. Proof chronology

```text
first P8 approved-for-walkthrough blob
= a744a50c778b25feeaa4fe575d14390eb792312a

initial revision RED
= Verify #775
= 99 tests / 98 pass / 1 fail
= new information-hierarchy contract missing only

final selected revision RED after rebaselining the superseded Open-in-Project guard
= Verify #776
= 99 tests / 97 pass / 2 fail
= Open Agent boundary + revised information hierarchy only

revised P8 GREEN
= Verify #777 SUCCESS

revised P8 exact blob
= 65073eb5f532f2675f04ec307eb0d9b91fd1b69d
```

No upstream Product/wire correction was required.

## 8. Current gate

```text
W-04
= OPEN
= P7 OPERATOR APPROVED
= P8 REVISED CANDIDATE
= OPERATOR WALKTHROUGH
= NOT LOCKED
```

The next operator decision is **APPROVE | REVISE** the revised exact HTML artifact. Approval may then authorize W-04 LOCK/P9/P10 as a separate step. It does not open P-01/P11/4D, authorize Product implementation or authorize merge.
