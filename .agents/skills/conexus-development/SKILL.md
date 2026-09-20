---
name: conexus-development
description: Use when resuming, planning, implementing, verifying, reviewing, or handing off development in the Conexus OS repository.
---

# Conexus Development

Use this skill for every material Conexus OS development session.

## Bootstrap from zero

1. Read repository `AGENTS.md`. Do not trust chat or a handoff as authority.
2. Read `references/wsl-environment.md`, enter the pinned WSL Ubuntu environment, source NVM, and confirm the exact Node/npm pins.
3. Run `npm run conexus:preflight`. Use `-- --no-network` only when network access is intentionally unavailable.
4. Read `docs/roadmap.md`, then `docs/index.md` only as needed to locate the smallest current owner.
5. Read `references/slice-lifecycle.md` for any planned slice, implementation, implementation review, or correction.
6. Load the applicable engineering/repository/frontend method and the current task owner named by the roadmap.
7. For Mastra-sensitive work, read `.agents/skills/mastra/SKILL.md` before making version-specific claims.
8. Load the Poteto Mode skill available in the session, the playbook that matches the
   work, and the leaf of every principle you apply. Read them where they are installed;
   this repository does not copy them, restate them or hold a second methodology. Name
   the principles that changed a decision. If Poteto Mode is not available in the
   session, say so rather than claiming to have followed it.

Preserve every unowned or pre-existing working-tree path. Never reset, clean, stash, force-update, or absorb unrelated state.

## One task per actionable slice

A Product implementation slice does not start from chat or a long handoff. It starts from one dedicated `docs/tasks/*.md` owner.

The task must make implementation mechanical enough that the executor does not need to invent architecture. It names the protected result, relevant evidence and authority, code census, target shape, ordered implementation work, non-goals, falsifiers, proof, owner reconciliation, and stop law.

Do not create placeholder tasks for future slices whose exact contract depends on predecessor evidence. Create the task when that slice becomes the next actionable unit.

The roadmap owns status and grant. The task owns the bounded execution/review contract. Product, architecture, decisions, contracts, and technical references own durable meaning. Never copy the same decision into all three as independent prose.

## Role boundary

Follow `references/slice-lifecycle.md`.

When the operator assigns different roles:

- the planner/verifier investigates, closes decisions, prepares the task, and reviews the result;
- the executor implements the authorized task, verifies it, commits, pushes, and stops;
- the reviewer compares the remote candidate to the task and current owners before any next slice or correction is authorized.

Do not silently combine roles because doing so is convenient.

## Frontend and Builder wireframe

Before changing a web, Builder, or Preview surface:

1. read the current grant in `docs/roadmap.md`;
2. read `docs/reference/frontend-and-product-surfaces.md`, whose section 33.6 owns the Build surface's functional contract;
3. preserve the app-first composition, contextual Conexus interaction, and read-only Code/Diff lenses unless current Product authority explicitly changes them.

That functional contract is an interaction contract, not a styling mandate. The roadmap controls deferred surfaces. If current Product Experience authority conflicts with requested implementation, stop at the smallest owner instead of inventing a replacement UI in code.

## Execute an authorized slice

Before editing Product code, confirm that the task names:

- the user- or system-observable result and target invariant;
- exact owners and preserved decisions;
- affected modules/files and relevant data/dependency boundaries;
- KEEP, CHANGE, and DELETE candidates where applicable;
- failure behavior and forbidden effects;
- falsifiers, targeted proof, completion conditions, and explicit non-goals;
- documentation/authority reconciliation required after proof;
- an explicit STOP condition.

If a material item is missing, return to planning. Do not invent Product meaning in code.

Keep the implementation bounded:

```text
authority + explicit grant
→ current task
→ exact file/owner envelope
→ failing proof or falsifier where applicable
→ smallest sustainable implementation
→ targeted verification
→ broader verification required by the task
→ commit + push when authorized
→ STOP
```

Use affected checks during implementation and `npm run verify` when the task requires the complete current graph. Command success is technical Evidence. It does not declare Product acceptance.

## Review a completed slice

Review the remote candidate against the task, not against the implementer's summary.

Check, in order:

1. protected result and stated non-goals;
2. current semantic/technical owners;
3. actual remote diff and changed-file census;
4. required falsifiers and proof output;
5. accidental compatibility layers, duplicated authority, or new abstractions that did not earn their place;
6. required owner reconciliation and roadmap transition.

A review is read-only for Product implementation unless the operator explicitly authorizes a correction. Report the smallest failing invariant and route it back to the same slice task. Do not opportunistically fix the code while reviewing it.

## Delegation and independent review

Read `references/review-and-delegation.md` before delegating implementation or independent review. Use independent review when a material risk triggers it under the current Engineering Method. Collaborative design challenge and independent closure are different activities.

## Evidence and status

Keep durable Evidence only when it has a current or credible future consumer. Do not introduce a generic Evidence authority. Mutable stage/status/next-action truth lives only in `docs/roadmap.md`.

When a slice changes durable Product or architecture meaning, reconcile the smallest semantic/technical owner after proof. Do not leave the accepted decision only in the task, roadmap, review output, or chat.

## Handoff

A handoff is a pointer, not a second plan.

For an implementation handoff, prefer:

```text
repository + branch + expected HEAD
current task path
authority order
preserve-working-tree warning
execute only this task
STOP on its named material conditions
verify → commit → push → STOP
```

Add detail only when the repository cannot carry it. A fresh session still bootstraps from zero.
