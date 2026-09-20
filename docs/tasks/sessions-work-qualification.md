# Qualify the native composition for Project conversations and delegated Work

> **Status:** under way, not closed. Evidence and the corrected report live in
> [`docs/evidence/sessions-work-qualification/`](../evidence/sessions-work-qualification/README.md).
> [The roadmap](../roadmap.md) owns the grant.
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

Two things, and it stops there.

**Conversations.** In one Project, create, switch between and resume two conversations,
and preserve across that: each conversation's own context, the acting account's access,
the Project's current source, and the last good Preview.

**Work.** Conversations alone cannot separate the candidates, because both can carry
them. The properties below are what makes Work different, and each needs evidence that
the composition provides it rather than a plan to build it. Read the contract, and prove
only what reading cannot settle.

| Property | What evidence looks like |
| --- | --- |
| Work is bounded and delegable | a unit of work can be described, handed off and tracked without the originating conversation staying alive |
| It produces a reviewed, validated candidate | the mechanism carries a candidate and a verdict on it, rather than applying changes as it goes |
| Applying it is explicit | nothing in the mechanism applies a candidate to the Project on its own |
| It never publishes | completing Work triggers no production effect |
| It carries authorization | the acting identity and what it may do travel with the work, and do not default to whoever started it |

This is not a demand to build a working SDLC before the first increment. The question is
whether the mechanism's own contracts can hold these properties, which is answered by
reading its API and its version and by testing only the doubts that reading leaves open.

Do not build two complete systems to compare them. A desired API is not a proven one.

## What may and may not be done

Inspecting packages is allowed and expected. So is standing a throwaway proof up in an
isolated environment, reading source and type declarations, and running a scratch script
against a scratch store.

Not allowed:

- incorporating or activating anything in the product, including the Factory;
- changing the product's dependencies, its data, or its runtime;
- touching the pilot's database, its Hub or any operator session beyond what an
  authorized live lane already permits.

A cost, a credential or an effect that leaves this machine needs its own authorization
before it is incurred. That covers paid model calls, provider accounts, sandboxes billed
to the operator and anything written outside a scratch environment.

**Minimal integration of authorization is not a parallel engine.** Binding a Conexus
authorization to a native id, so that the mechanism knows which account acts, is the
kind of integration this qualification is allowed to propose. Re-implementing the
mechanism's triage, planning, coordination, review or lifecycle on the Conexus side is
the kind it may not, and finding that the native mechanism lacks something is a finding
to report, not a licence to build the replacement.

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
