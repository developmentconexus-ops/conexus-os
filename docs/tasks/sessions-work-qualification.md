# Qualify the native composition for Project conversations and delegated Work

> **Status:** prepared, not started. [The roadmap](../roadmap.md) owns the grant.
> **Authority:** [C-021](../decisions/index.md), [product contract section 12](../product/contract.md#12-approved-destination).
> **Technical owner of what exists:** [C-020 reference](../reference/builder-c020-mastra-native.md).

This is a qualification. It ends in evidence and a recommendation. It authorizes no
migration, no product implementation and no removal.

## The question

Which native composition serves several persistent conversations in one Project and
allows delegated Work, with the least Conexus logic, while preserving authorization and
the product's effects?

The two candidates are named in C-021 and neither is chosen in advance.

- Reuse the Factory composition for both interaction and Work.
- A native Controller for interaction, integrated with the Factory for Work.

## What it must establish

The initial target is small and concrete. In one Project, create, switch between and
resume two conversations, and preserve across that: the conversation's own context, the
acting account's access, the Project's current source, and the last good Preview.

Beyond that, inspect the contracts where Work meets a conversation, and test only the
doubts capable of invalidating the choice. Do not build two complete systems to compare
them. Reading an API, its version and its stated guarantees is evidence; a desired API
is not a proven one.

## Non-goals

- Installing or activating the Factory.
- Migrating existing Threads, runs or history.
- Removing `BuilderRun`, or anything it carries, on the strength of this task.
- Choosing the physical sandbox lifecycle, the data schema, hosting, the scheduler or
  the Brain mechanism.
- Building a Conexus conversation store, a wrapper over the framework, or a second
  implementation of a mechanism the framework already offers adequately.

## What the answer must not cost

These hold whatever the recommendation is, and a composition that cannot keep them is
disqualified rather than patched.

- Authorization is rechecked at the operation, against current membership and current
  owner state. A conversation's author never lends authority to whoever continues it.
- An effect stays idempotent under retry, and a reconnect never doubles work already
  performed.
- Source custody survives: an admitted revision is the one that was reviewed, and a
  change built on an older revision does not silently overwrite later work.
- The last good Preview is protected. A failed build or boot keeps the source and keeps
  the previous Preview.
- Privacy covers messages, persisted requests, diagnostics, recovered memory and
  delegation, not only a list.

## How it ends

Evidence for each claim, with the API and version it rests on. A recommendation naming
one composition and why the other lost. The Conexus-owned responsibilities the
recommendation would let us delete, named individually. The scope of a first usable
increment that would follow, which is not started here.

Open questions that this task does not close stay open and are listed in
[product contract section 12.11](../product/contract.md#1211-what-is-still-open). Do not
invent an answer, and do not create an empty task for each of them.

## Stop

Stop and report on: a material product requirement that is not written down, an
authorization or trust-boundary contradiction, a limitation that forces a Conexus-owned
mechanism, or missing authority needed to be correct. Report the smallest contradiction
rather than widening the scope.

## Before starting

Read `AGENTS.md`, then the roadmap, then this task. Read
`.agents/skills/mastra/SKILL.md` and confirm the installed version before any
version-specific claim. The repository, not a chat, carries the authority.
