---
name: conexus-build
description: Build one unit of an approved Conexus spec from its unit card, or a small lane:fast change from its issue. Use when your instructions name a spec unit or an issue to build, before writing any product code for it, and for any change to a screen.
---

# Build one unit

You build one unit of an approved spec. Your instructions hold the unit card: what already exists,
what you create, the ACs, the files, the reference you copy, the guide sections, what you delete,
the proof, what is out of scope and when to stop. The card is your contract and the spec is the
design. Neither is reopened here.

The spec already learned the contract, named the target shape and designed it. Do not redo that
work. If the session has pstack's poteto mode, follow its Refactoring playbook from step 4 only. You
write the code yourself; do not hand code to a subagent.

A Claude session invokes a skill as `/<name>` (`/pstack:<name>` for pstack), a Codex session as
`$<name>`. Where this skill names a pstack skill the session does not have, follow the rule written
beside it.

## Steps

1. Read the card's action/proof map, baseline, the Summary and its AC lines. Compare the current head
   and dependencies with the mapped baseline. Do not redo the design or read unrelated rationale.
2. Go through "Before you write" in [the checklist](references/checklist.md). Anything the unit
   needs that is not at the head you started from and is not created by this unit stops the
   session: report it and end. Never write a temporary shape for a later unit to replace.
   Update observable path/caller drift within accepted scope and record it; only product, design or
   premise changes reopen approval. Do not create a new operator gate for ordinary path discoveries.
3. Read the files in the spec's `shape/` that the card names, the reference rows it copies at their
   `file:line`, the guide sections it cites, and the `AGENTS.md` of each area you touch. The
   guides and `shape/` win over the code around you. Copy a neighbor only when it already follows
   them. Under pstack, `typescript-best-practices` applies; without it,
   [guide C](../../../docs/development/codebase-principles.md) is the whole rule. No company data,
   secret or machine path goes into code, tests, fixtures or the commit
   ([S §7](../../../docs/reference/security-and-authority.md#7-data-protection-and-egress)).
4. Execute the mapped sequence: delete what the card deletes and move every caller, then build
   the new shape. Register native verifier consumers in this unit. No shim or parallel old path.
5. Close the full CI impact map under [delivery](../../../docs/development/delivery.md#proof-and-verification)
   and checklist item 20. Prove it: the tests the card names, one negative type test per type rule, the census number the
   card names, then `npm run verify:quick`. Then run pstack `deslop` and `no-comments`. Without
   pstack: reread the diff and remove what a careful engineer would not write (dead code, needless
   guards and casts, checks inside trusted code, style unlike the file), then delete every comment
   that does not state a why the code cannot show (C §9).
6. One commit in plain English, stacked on the batch branch `wave/<name>-loteN` your instructions
   name. The copy ends clean. Push the commit for the manager to read against the card. Do not open
   a per-unit pull request or send the unit for independent review or a Factory pass.
7. Report: the batch branch, the commit, the ACs it satisfies, each test and its result, the census
   number, what you could not prove. End with `## Checklist`: each checklist item, its evidence
   (`file:line` or a command and its result), and `ok` or `n/a`.

At the end of the batch, one independent review reruns the units' proofs and reviews the code.
Findings return to the builders. Then one pull request goes into `wave/<name>`, ready for CI and the
Dev Factory, as [delivery](../../../docs/development/delivery.md#waves) says. The manager merges it
after Factory approval, green CI and the diff read.

A review finding comes back to you as a message. Find its cause before you fix it, as the
[review loop](../../../docs/development/delivery.md#review-loop) says. For a wave, push the fix to the
same batch branch, and to the same pull request if it is already open. For a small change, push the
fix to the same pull request.

A screen change also follows [screens](references/screens.md).

## A small change

A `lane:fast` change inside accepted meaning has no study and no spec: its issue is the unit card.
The issue names the result, the non-goals and "done when"; a missing decision goes back to the
operator, never into code. Load the guides that
[`areas.json`](../../../docs/development/review/areas.json) maps to the paths you touch, and before
writing name the data shape and its one owner, read the whole lifecycle you touch, check the
[decision register](../../../docs/decisions/index.md), and take the native census
([native first](../../../docs/reference/architecture.md#native-first)). Then follow the steps above,
proving each "done when" item on the real surface with [`verify`](../verify/SKILL.md). The pull
request targets `main`: after the commit, push and open it ready for review, then include it in the
report. Its body says what the change deletes, measured by
`git diff --numstat origin/main...HEAD` with product code apart from tests, SQL and generated files.

## Stop and report when

- the card needs a type, contract, value or decision that the spec does not hold;
- the unit cannot end green without changing the design;
- the work changes the approved scope rather than correcting observable file/caller drift;
- a **must not** rule of [guide C](../../../docs/development/codebase-principles.md) would break, or a
  [stop condition](../../../docs/development/delivery.md#stop-then-escalate) holds.

Stop means no more code, a comment on the issue or a report with the evidence, and the question for
the operator.
