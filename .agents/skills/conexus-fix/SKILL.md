---
name: conexus-fix
description: Fix a Conexus bug at its root cause - reproduce it where it was seen with telemetry on, find the cause, write the test that fails, fix it there, and look for the same cause elsewhere. Use when your instructions name a bug or a broken behavior outside a wave's unit cards.
---

# Fix

A fix without its cause comes back. Inside a wave a bug is not a fix: a failed AC becomes a unit
card (`conexus-build`) and a review finding follows the
[review loop](../../../docs/development/delivery.md#review-loop). The pull request body follows
[references/fix-report.md](references/fix-report.md).

## Steps

1. **Reproduce first**, on the surface where it was seen (the web app with the
   [`verify`](../verify/SKILL.md) skill, the Hub API, the Builder) with telemetry on. If it does not
   reproduce, stop and report what you tried. Never fix a guess.
2. **Read the evidence**, cheapest first ([evidence](../conexus-study/references/evidence.md)): the
   log code, its trace, Mastra's spans, the rows. Quote what you find.
3. **Find the root cause**: ask why until the answer is a line of code and the decision behind it.
   The place of the symptom is often not the cause. Name the guide section the cause breaks.
4. **The test first**: write the test that would have caught it and see it fail on the base. With
   pstack, `tdd`; without it, the same: red before the fix, green after.
5. **Fix it at the cause**, not at the symptom. No fallback, no try/catch around it, no
   compatibility with the broken shape.
6. **The same cause elsewhere**: search for the same pattern (a grep or a census command, written in
   the report). Fix the others in this pull request when they are in the same area and small;
   otherwise list them as a follow-up issue. When a check can tell the defect from correct code,
   propose the check.
7. **Stop if** the fix at the cause crosses modules or changes a contract (types shared between
   packages, the database schema, an API): it is a wave. Report the cause and what the fix needs.
   If it needs a choice from the operator, analyze it with
   [`conexus-decide`](../conexus-decide/SKILL.md) before asking.
8. **Prove it**: the test red then green, the reproduction now passes on the same surface, the
   telemetry shows no error code for it, `npm run verify:quick` green. One commit, one pull request.
