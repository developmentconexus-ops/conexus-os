# 4C P-01 F14 — Builder Human Context Finding

> **Status:** `FINDING / OPERATOR ACCEPTED DIRECTION / REALIZATION NOT YET APPLIED`
> **Owner:** Builder (`bld.change` + existing `BLD-16` assistant interaction)
> **Scope:** human-recognizable Change meaning + exact optional Change context for Builder assistant.

## Finding

The current Builder wire is schema-closed but not sufficient for a truthful human P-01 experience in two bounded ways.

### F14-A — Change intent disappears from reads

`BLD-03 CreateChange` already accepts:

```text
intent = bounded statement of what must become true
```

But `ChangeSummary` and `Change` currently omit that same semantic field. A frontend returning to Build would therefore need to present opaque `changeId` values or invent a parallel title/name store.

Target invariant:

```text
accepted Change intent
→ remains present on ChangeSummary + Change
→ human can recognize the exact Change later
→ intent stays presentation/meaning, not authorization or mutable metadata CRUD
```

### F14-B — assistant has Project context but no exact Change anchor

`BLD-16 AskConexusAboutContext` is an existing Builder interaction under `project.build`, but the request currently carries only `question` beneath exact `projectId`.

Target invariant:

```text
question only
→ Project-level Builder assistance

question + optional changeId
→ exact current Change context inside the same Project
→ server validates containment/disclosure/current authority
```

`changeId` is an untrusted semantic reference. Possession never grants source/review/runtime authority.

## Non-goals

F14 must not create:

```text
Change.title
Change.name
RenameChange
UpdateChange
Change metadata CRUD
AssistantThread owner
assistant memory authority
arbitrary ContextRef union
generic resource attachment blob
DOM selector / prompt text as Product identity
project.source.read through BLD-16
project.review through BLD-16
new Product operation
new Permission
new durable record class
```

## Reopen classification

This is a bounded frontend-discovered authority insufficiency inside the current Builder owner.

```text
4A Builder semantics → bounded recompile
4B Builder wire      → bounded recompile
other owners         → unchanged
N_platform           → stays 116
Builder operations   → stays 17
ordinary Permissions → stays 25
records              → stays 46
```
