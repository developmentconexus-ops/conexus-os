---
name: conexus-development
description: Use when resuming, implementing, verifying, reviewing, or handing off development in the Conexus OS repository.
---

# Conexus Development

Use this skill for Conexus OS development sessions, including a fresh resume,
an authorized implementation slice, verification, material independent review,
or a session handoff.

## Bootstrap from zero

1. Read the repository `AGENTS.md`; do not trust chat or a handoff as authority.
2. Read [wsl-environment.md](references/wsl-environment.md), enter WSL Ubuntu,
   source NVM explicitly and confirm the exact `.nvmrc`/`package.json` Node/npm
   pins. Windows is a launcher only, never the local deciding environment.
3. From that WSL shell run `npm run conexus:preflight` (use `-- --no-network`
   only when network access is intentionally unavailable).
4. Read `docs/roadmap.md`, then route through `docs/index.md` to the applicable
   method and smallest current owner.
5. Compare the requested action with the exact current grant. Stop before any
   unopened Product slice, provider call, dependency change, production effect,
   commit, push, PR, or merge unless the repository authority and operator grant
   permit that exact action.
6. Preserve every unowned or pre-existing working-tree path. Never reset, clean,
   stash, force-update, or absorb unrelated state.

`conexus:preflight` reports facts. It does not approve a stage, clean a dirty
tree, or replace the roadmap.

## Frontend and Builder wireframe

Before changing a web, Builder, or Preview surface:

1. Read the current grant in [`docs/roadmap.md`](../../../docs/roadmap.md).
   The grant selects the slice that is allowed now; it does not reopen older
   Product work.
2. Read [`frontend-and-product-surfaces.md`](../../../docs/reference/frontend-and-product-surfaces.md)
   for the current semantic surface.
3. Read the locked [P-01 Build workspace screen contract](../../../docs/evidence/4c/p01-build-workspace-screen-contract.md)
   and operate its [canonical P8 wireframe](../../../docs/evidence/4c/p01-build-workspace-functional-wireframe.html)
   before changing production UI. This is the approved app-first composition:
   the current Project application is the dominant Preview, Conexus is the
   contextual right-side interaction, and Code and Diff are read-only lenses.
4. Preserve the wireframe's load-bearing behavior: the Build entry shows the
   current application without requiring a Change, and the last-good Preview
   stays inspectable while a candidate is built.

The P-01 wireframe is an interaction contract, not a reason to copy its
low-fidelity styling or implement every surface it contains. The current
roadmap still controls deferred surfaces such as Agent Studio. P11 assembly
artifacts and R1–R7 or L1–L6 plans are not current UI authority. If a request
conflicts with the P-01 contract or the current grant, stop at the smallest
owning Product Experience document; do not invent a replacement UI in code.
Verify the allowed path in the real browser before calling the UI complete.

## Execute an authorized slice

Before editing, bind the slice to exact operations/owners, prerequisites,
dependencies, affected schemas/tables/processes, ownership-class mutations,
proof/falsifiers, completion conditions, and stop conditions. If an essential
item is absent, return to the smallest owner; do not invent Product meaning in
code.

### Delivery and progress law

Describe the next observable increment in the current task before Product editing.
Keep it in the smallest current owner; do not create a separate planning
artifact without a durable consumer. The packet must name:

- the user- or system-observable vertical outcome and target invariant;
- exact owners, operations, files/modules and dependency/data boundaries;
- intended functions or responsibilities, failure behavior and forbidden
  effects;
- RED falsifiers, targeted proof, completion conditions and explicit non-goals;
- the executed proof subject class: production composition, production module,
  contract fixture or stand-in. A fixture/mock may prove its local contract but
  MUST NOT satisfy a production-composition or end-to-end journey claim.

Make the current increment concrete enough to implement and test. Resolve only
unknowns that affect it. An approved increment includes routine reversible
implementation and verification steps; do not request approval per file or part.
R1–R7 and L1–L6 are historical plans, not the MVP queue or admission requirements.

Progress means one of:

- executable stage behavior or a protected repository property advanced;
- an explicitly qualification-only claim closed with a current consumer;
- a material blocker reduced to the smallest owner with the exact missing
  authority or external dependency named.

Activity, additional prose, repeated reviews and a larger Evidence envelope are
not progress by themselves. A method/review/Evidence finding blocks the current
stage only when it demonstrates a concrete false-PASS, false-STOP, protected-
property violation, unauthorized effect, or missing authority required for
correctness. Route recovery improvements, generic framework hardening and
non-claim defects through `DEFER SAFELY` with why-safe, revisit trigger and
later owner; do not silently add them to the gate.

Apply the Engineering Method's periodic-assurance triggers and termination law.
Conexus's exact lane, model and delegation routing lives only in
[review-and-delegation.md](references/review-and-delegation.md).

Every work cycle must end with the next measurable delivery checkpoint and its
remaining blocker census. Before starting a cycle whose intended output is only
method, review, documentation or Evidence bytes, name the concrete blocker it
removes; otherwise pause and re-plan the stage code packet. Qualification-only
stages count their named qualification output, not unbounded improvements to
the qualification framework.

Keep each implementation task bounded enough that coding is mechanical:

```text
authority + explicit grant
→ exact file/owner envelope
→ failing proof or falsifier where applicable
→ smallest sustainable vertical implementation
→ targeted verification
→ scope verification
→ deciding repository verification when required
→ operator checkpoint or next authorized part
```

Use affected checks during implementation and `npm run verify` for the complete
current graph. Ordinary working-tree edits are allowed; CI alone checks checkout
cleanliness. Historical custody commands apply only to their named subjects.
Do not regenerate old receipts to pass current verification. The
command result is technical Evidence only; it never declares a
Product or gate `PASS`. `scope final` must execute in Linux; for local work that
means the pinned WSL Ubuntu environment.

## Delegation and independent review

Read [review-and-delegation.md](references/review-and-delegation.md) before
delegating implementation or independent review. Do not load it for a simple
read-only status answer.

Use independent review when a concrete material risk triggers it under the
locally amended Engineering Method, not merely because a stage closes. Collaborative
design challenge may compare alternatives; independent closure lanes must
remain fresh and isolated. Neither mode replaces Lead adjudication or operator
authority.

## Evidence and status

Use the slice's existing receipt/finalizer when one exists. Do not introduce a
generic Evidence authority or write `PASS` from command success alone. Record
only deciding proof with a current consumer. Mutable stage/status/next-action
truth remains exclusively in `docs/roadmap.md`.

## Handoff

At a session boundary, re-run preflight and provide a concise handoff containing:

- repository identity, branch, exact HEAD, `origin/main`, ahead/behind, PR and
  deciding CI;
- WSL distribution and exact deciding Node/npm versions;
- dirty-state warning and explicit preservation obligations;
- current roadmap stage, exact allowed work and blocked boundaries;
- completed work and changed paths owned by this session;
- verification actually run, with failures or unrun required proof stated;
- exact next action, its smallest authority route, prerequisites and stop law;
- any pending operator decision or external dependency.

The handoff accelerates orientation. A fresh session must still bootstrap from
zero.
