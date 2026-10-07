---
name: conexus-decide
description: Analyze a load-bearing choice before it reaches the operator - find the real question and its root cause, check every fact on the live code, measure today's code against reference code bases and the guides instead of trusting it, and bring complete options with one recommendation. Use when you are about to ask the operator a technical choice, and when you relay or audit one someone else raised.
---

# Decide

The operator decides the load-bearing choices, and is not a software specialist. A recommendation
is only as good as its analysis: one built on today's code repeats today's mistakes, and one built on
an unchecked fact sends the operator the wrong question. Write it in
[references/decision.md](references/decision.md).

A Claude session invokes this skill as `/conexus-decide`, a Codex session as
`$conexus-decide`. This skill stands alone without pstack.

## Rules

1. **Find the real question.** Ask why the choice exists until the root cause. The best answer is
   sometimes that the choice disappears: the thing it protects is not there, or it can be removed.
2. **Check every fact on the live code, now.** The census at `main`, the installed package version,
   the database catalog, a run. Not history, not an earlier report, not memory. A fact you can
   observe is never a question for the operator: observe it.
3. **Today's code is evidence, never the reason.** "It is what we have" does not support an option.
   Name which option keeps today's shape, and test it against the references like any other.
4. **The references decide the target.** For each option: which reference does it this way, in its
   code (`file:line`, version), and which do it otherwise. Read the references the subject needs
   (database and access: PostgREST, Supabase, Basejump, Better Auth; app and product: cal.com,
   Documenso; agent and execution: the installed `@mastra`, the Mastra fork, the Factory), and the
   industry rule with its source. An option no reference uses says so.
5. **The guides measure, and can be wrong.** Name the guide section each option follows or breaks.
   When the references show the guide itself is wrong, say so: the wave changes the guide.
6. **Complete options.** Include removing the thing, and every way a reference solves it, even if
   nobody listed it. For each option: what it costs (a migration, `needs:aprovo`, a lane change, code
   to keep), what it deletes, what it risks.
7. **One recommendation, and what is not proven.** The option the references and the guides support
   with the least new machinery. State plainly what was not verified.
8. **Plain words for the operator.** What the thing is, in one or two sentences a non-specialist
   understands; today's number; the options with their references; the cost; the recommendation;
   one question.

## When you relay or audit a decision

Rerun the fact the recommendation rests on and check rules 1, 3, 4 and 6. If the audit changes the
options or the recommendation, say so and why, to the operator and to the one who raised it.
