# Flows

Copy the flow's steps into your notes and tick them. A step you skip stays with `skip: <reason>`.
Each step says what to do, then the skill that does it when the session has it (`/pstack:*` from
Poteto's pstack, `/jm-*` from the jm suite). Without the skill, do the step by hand.

## Investigate

1. State the question and what answer would settle it.
2. Read the evidence first: [evidence.md](evidence.md). Telemetry before logs, logs before guesses.
3. How the code works today: `/pstack:how`. Why it is shaped this way and what patched it:
   `/pstack:why`.
4. Answer with file:line, trace ids and rows. Say what you proved and what you did not.

## Fix

1. Reproduce on the surface where it was seen, with telemetry on. `/jm-debug` runs the loop.
2. Find the premise under the bug with `/pstack:why`. Two earlier fixes on that premise turn this
   into a Redesign.
3. Write the failing test first: `/pstack:tdd`. It asserts behavior with literal values.
4. Make the smallest fix at the root, then run the checklist in [SKILL.md](../SKILL.md#before-writing-code).
5. Prove it on the same surface; the reproduction now passes.

## Build

1. The issue or spec names the result, the non-goals and "done when". A missing decision goes back
   to the operator; never invent product meaning in code.
2. Take the native census in [Mastra native](../../../../docs/development/review/mastra-native.md#proof-required)
   before adding any mechanism.
3. Build it with `/jm-develop`, failing tests first, under `/pstack:typescript-best-practices`.
4. Prove each "done when" item: `/jm-check verify` on the real surface, then `/jm-test`.
5. Before review: `/pstack:deslop` and `/pstack:no-comments`.

## Redesign

For a roadmap wave or a shape that keeps breaking. The census, the redesign, the blast radius and
the spec are done before code by the session that plans the work, and the operator approves the
spec. Here you build it.

1. Read the approved spec in `docs/tasks/specs/`: what it deletes, what stays and why. It is the
   contract; do not redesign it.
2. Build as in Build: the failing tests the spec names first, then the code.
3. A gap or a contradiction in the spec stops the work and goes back as a report, with the evidence.
4. The pull request body says what the change deletes, and a diagnosis-only
   review (`/pstack:thermo-nuclear-code-quality-review`) checks that the code got smaller.

## Review

1. Review the pushed head against its issue or spec and the current owners, not the author's
   summary. Load the pages the [review checklist](../../../../docs/development/review-checklist.md#load-the-pages)
   names from `origin/main` and give its verdict.
2. Check the change against [shapes.md](shapes.md) and the stop signals in the skill. A fix that
   adds far more than it deletes, or keeps a premise alive, is a finding.
3. A second opinion: `/jm-check review` or `/pstack:interrogate`. A bot finding is evidence, not
   a requirement: fix, dismiss with a reason, or ask.
4. Report the smallest failed item. A review does not fix the code it reviews.

Which reviews a pull request needs at its head follows the
[merge gate](../../../../docs/development/delivery.md#merge-gate). An independent reviewer has seen
no draft of the work; a timeout or a missing report is an incomplete review, not a pass.

## Frontend

On top of the flow above: load [`conexus-frontend`](../../conexus-frontend/SKILL.md), read
[`frontend-and-product-surfaces.md`](../../../../docs/reference/frontend-and-product-surfaces.md)
(section 33.6 owns the Build surface), and prove the screen in a browser with the `verify` skill.
One pattern per need: a second way to do the same thing is a defect.
