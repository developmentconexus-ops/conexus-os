# Several conversations per Project

> **Status:** proposed, awaiting a decision. Not started.
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

Work, work items, boards, the dispatcher and Goals. The Factory, which is not installed.
Per-person privacy inside a Project, which the framework does not provide and which this
increment does not fake. Source admission, artifact health and publication, which keep the
gates they have today.

## The composition it uses

One controller over the product's own storage, with the Project's source reached through
the workspace resolver the Builder already has
([`resolveBuilderWorkspace`](../../apps/hub/src/builder/runtime.ts)). Conversations are
Mastra threads through `SessionThread`; the product adds no conversation store of its own.
Authorization stays where it already is: Conexus decides which `resourceId` a request may
act under, and a tool still stops for approval before it touches source.

This is the composition the qualification ran end to end. It is not a decision to stay away
from the Factory: its coding session is a `@mastra/code-sdk` mount that accepts a host
workspace, so adopting that mount later changes the mount, not the design.

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
Work exists in the product, and no dependency was added for this increment.

## Open before it starts

Nothing blocks this increment. If the product later drives its coding surface through the
`@mastra/code-sdk` mount, the qualification has already run a whole turn through it against a
local provider, and
[section 9 of the report](../evidence/sessions-work-qualification/report.md#9-the-minimal-integration-and-what-could-disappear)
names the two things to carry into that decision. A custom provider reaches that mount only
through a subpath export rather than through its documented settings option, and a
host-supplied workspace keeps the raw workspace tool names.
