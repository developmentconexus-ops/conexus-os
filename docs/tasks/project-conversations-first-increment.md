# Several conversations per Project

> **Status:** ready to start, not started. The integrated Factory test has run and the
> composition is chosen: [C-022](../decisions/index.md) selects Factory-centered
> development.
> **Authority:** [the roadmap](../roadmap.md) owns whether this runs.
> **Evidence it rests on:** [the Sessions and Work qualification](../evidence/sessions-work-qualification/report.md),
> sections 8 to 10 and 12.

A person opens a Project and finds the conversations they have had about it, rather than one
permanent chat. They start another, switch between them, and come back after a restart to
find both. Nothing about Work, boards or publication changes.

## Why this one first

It is the smallest change a person notices, and it exercises the primitive that every later
step depends on. Today a Project derives exactly one conversation from its id
([`threadIdForProject()`](../../apps/hub/src/builder/module.ts)), so there is nowhere to put
a second line of thought.

## What it delivers

- Create a conversation in a Project.
- List that Project's conversations, newest first, with their titles.
- Switch between them, and see each one's own messages.
- Resume any of them after a Hub restart.
- Rename one.

## What it does not touch

Work, work items, boards, the dispatcher and Goals: the Factory arrives with the
conversation surface, and its Work half stays unused in this increment. Per-person privacy
inside a Project, which the framework does not provide and which this increment does not
fake. Source admission, artifact health and publication, which keep the gates they have
today.

## The composition it uses

The Factory's, per [C-022](../decisions/index.md). Conversations are the Factory session's
own threads and the product adds no conversation store of its own. The model comes from the
Factory's own credential store and selection, not from Conexus model connections, and the
Conexus model subsystem named in
[section 15 of the report](../evidence/sessions-work-qualification/report.md#15-the-decision-that-followed-and-what-it-removes)
is removed as this path replaces it rather than left running beside it.

What stays Conexus's here: which Account may act on which Project, and therefore which
`resourceId` a request may act under; the Project's current source and its admission; and
the Preview. None of those changes in this increment.

## What must stay true

- The acting account's access to the Project is rechecked at the operation, and a
  conversation's author lends authority to nobody.
- Switching conversations changes neither the Project's current source nor its last good
  Preview.
- Today's derived conversation keeps its messages and stays reachable after the migration.
- A retry does not create a second conversation.

## How it ends

A person opens two conversations in one Project, switches between them, restarts the Hub,
and finds both with their messages. The derived-thread migration has run on the pilot. No
Work exists in the product, and the Conexus model subsystem this increment replaces has left
with it rather than survived beside it.

## What the qualification learned that this increment should carry

A session is scoped to a caller identity the host supplies, and the Factory refuses one
without it, so the Account-to-Project authorization is what fills that slot. The Factory's
default approval policy asks for nothing before a tool runs, and `session.permissions` is
where that changes. A work item needs an arrival stage when it is created. And the model is
selected per session and persisted per mode, not passed as an object.
