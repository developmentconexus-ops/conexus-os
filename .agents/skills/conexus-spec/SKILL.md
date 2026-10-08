---
name: conexus-spec
description: "Write the spec of a Conexus wave from its approved study: an index.md the builders read, with a compiled code shape and one card per unit, and a rationale.md with the why. Also the standard for a sweep with no wave. Use when your instructions name a spec to write, or a mechanical change across the code."
---

# Write a wave's spec

A spec turns an approved study into units a fresh builder can finish one at a time. It lives in
`docs/specs/NNNN-title/` as two files and a folder:

- `index.md`, what the builder reads: [`references/index-template.md`](references/index-template.md);
- `rationale.md`, the why, which the builder does not read:
  [`references/rationale-template.md`](references/rationale-template.md);
- `shape/`, the code shape as TypeScript that compiles.

A mechanical change across the code (arrow to `function`, branded ids, one `isRecord`) is a sweep,
not a wave, and has no spec: its issue carries [the sweep standard](references/sweep.md).

Claude invokes `/<name>` or `/pstack:<name>`; Codex uses `$<name>`. If pstack is absent, follow
its fallback beside the named skill.

## Rules for the writer

1. **Copy, then adapt.** Every mechanism the spec introduces names the reference it copies: the
   repository, `file:line`, what is kept as is and what is adapted, with the reason. A mechanism with
   no reference says "not found", where it looked, and why it is built anyway. References, by
   subject: database and access (PostgREST, Supabase, Basejump, Better Auth), app and product
   (cal.com, Documenso), agent and execution (the installed `@mastra`, the Mastra fork, the Factory).
2. **Design from the target, never from today's code.** Today's code is what the wave replaces. It
   enters the spec only as the census and the delete list.
3. **No compatibility.** No shim, no flag, no old and new side by side, no export kept for a test.
   The unit that brings the new shape deletes the old one and moves every caller.
4. **The code shape is code.** Before approval, compile signatures and a negative test per type rule.
   For uncertain contracts or architecture, compile and run a minimal representative using actual
   repository owners and pinned installed libraries, including negative call sites. Declaration stubs
   and invented owner types do not prove native APIs. Record head, command, result and limits.
   Keep contracts and decisive logic in `shape/`, not a second full implementation.
5. **Each unit uses only what already exists or what it creates.** Check this unit by unit before
   the gate. A unit that needs a later unit's type is not a unit: merge the two or reorder.
6. **One unit, one map.** Use [the unit template](references/index-template.md#unit-cards) to settle
   file actions, callers, owners, decisive logic and proof. Register native verifiers when their new
   owner is first consumed, apart from later census installation. Size for one fresh builder and green commit.
7. **The pin comes first.** In a wave that changes structure, the first unit is the pin:
   characterization tests or an equivalence harness that capture today's behavior of every surface
   the wave touches, written and green on `main` before any structure moves. If today's tests
   already pin a surface, the card says which tests and the pin unit covers only the rest.
8. **The guides decide.** Read in full [guide C](../../../docs/development/codebase-principles.md)
   and the guides [`areas.json`](../../../docs/development/review/areas.json) maps to the paths the
   wave touches. Where the design
   changes a guide rule, the spec states the new rule text in one sentence, and a unit edits the
   guide.
9. **Everything checkable becomes a check.** The census is a script or a lint rule, not a list. The
   spec states today's number and the target, and the unit that reaches the target adds the check to
   CI.
10. **The operator decides the load-bearing choices.** Each one goes to the operator through the
    planning session, one at a time, with the options, the recommendation and its reference, before
    the spec is written. The operator may also answer you directly in your session. The spec records
    the answer and does not reopen it.
11. **Size.** A wave holds at most 8 units or 70 product files. Past that it splits into two waves.
12. **`shape/` is temporary.** The wave's last unit deletes `shape/`: once the code exists, it is the
    only owner of the shape.
13. **The repository is public.** The spec follows
    [the company data rule](../../../docs/reference/security-and-authority.md#7-data-protection-and-egress).

## Engines, by need

- **The shape, when it crosses modules**: pstack `architect`, with `arena` for competing shapes.
  Without pstack: write the types and signatures as compiled TypeScript before any body, and when
  two shapes compete, write each one in full and compare them on the same call sites.
- **A fact the design rests on**: pstack `blast-radius`. Without it: find what the change could
  break outside the diff and prove the one fact it is safe because of by running real code.
- **The finished spec, before the operator reads it**: pstack `interrogate`. Without it: two fresh
  reviewers on different models read the spec against the study and the guides, independently, and
  every finding carries its evidence.

## How the stage runs

1. Turn the approved study's reference table and draft into the spec's references and first draft.
2. Bring the open load-bearing choices to the operator (rule 10) before writing the units.
3. Write `shape/` and run `npx tsc --noEmit -p shape` until it exits 0. Then write `index.md` and
   `rationale.md`.
4. Create the wave branch `wave/<name>` from `main`, commit the spec there, push it, and open the
   wave's pull request into `main` as a draft. The operator merges that pull request at the end of
   the wave.
5. The operator reads and approves the spec. The planning session writes the approval line in
   `index.md`: `**Status**: Approved by the operator on <date>, commit <sha>`. That line opens the
   build of every unit in the spec; no other command is needed.
6. Each unit is then built from its card with [`conexus-build`](../conexus-build/SKILL.md), and the
   wave is proved with [`conexus-prove`](../conexus-prove/SKILL.md), as
   [delivery](../../../docs/development/delivery.md#waves) says.
