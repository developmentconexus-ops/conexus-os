---
name: conexus-build
description: Use before you change the code of an app, to build an approved plan or a small change with nothing left to decide. Covers working step by step, proving each step with the check and real operations, what to do when a step fails or the work leaves the plan, keeping the code clean, and finishing.
---

# Building

Build in small steps and prove each one before the next. A step is done when you saw it work; code that compiles is not proof.

## Start
- First, decide whether this needs a plan. Do not judge it by whether the request feels clear: list what the change needs (each screen, what each record holds, its kinds and statuses, who sees what, each rule). If the app is new, or any of these is named by neither the request nor the app, and the person has not approved a plan for this request in this conversation, load `conexus-plan` and build nothing yet.
- With an approved plan: read `.conexus/plan.md` and turn "Ordem" into your task list, one task per step. If the list already has proven steps from an earlier run, continue from the first open one; never redo a proven step.
- Without a plan, for a small change with nothing left to decide: before you edit, decide how you will prove the change works (which check, which operation, which count), then make it.

## Prove each step

`conexus_check` proves the app type checks, builds and opens. It does not run operations, touch data or show you the screen. Run it at the end of each step, then prove the step with what can show it:
- An operation that reads: run it with `conexus_run_operation` and a realistic input, such as the example the person gave or a key you read from the Conexão. Compare the counts with what the screen must show. A field the person asked for with no filled values is not a source.
- A screen: you cannot see it yet. Trace each value it shows to the operation that returns it, and tell the person which screen to try in the Prévia and what they should see there.
- An operation that saves: never run it, because it writes into the Prévia's real data. Read it against its input, its table and its errors, check that what it saves comes back after a reload, and say it was not run.
- A new table or migration: Conexus applies it only when it saves the version, so an operation that needs it fails in this run. Read the migration against how the table is used, and say it is proven only once the person tries it in the Prévia.

## When a step fails

- Read the whole error before you change anything. Find the cause and fix it where it starts, in the app's code. A guard, a cast or a suppression that makes an error go away only hides it.
- Test one idea at a time, and undo a change that did not help before you try the next.
- When you fix a cause, look for the same mistake elsewhere in the app.
- Never change the check, the environment or the platform's files to get past an error.
- When fixes keep failing, suspect the design, not the line; say so when you stop.

## When the work leaves the plan

- A technical difference, such as a name, a structure or a component: decide, update the plan, and list it in your final message.
- A difference the person would notice or has to decide, such as a source without the data, a rule the data contradicts, or work bigger than planned: finish the parts that do not depend on it, then update the plan and ask with `ask_user`. Never make the work smaller on your own.
- Without a plan, split the request the same way.

## Keep the code clean

- When you replace something, find every use of the old one, in code and in text, move them all, and delete the old one in the same step.
- Keep a comment only for a why the code cannot show.
- Handle the cases that can happen; add no checks for states that cannot.
- Before a step is done, remove what it left behind: debug output, unused files, imports and code.

## Finish

1. Read the plan again, or the request without one, and check each item against what you proved. Mark done only what you proved.
2. Make the plan match what you built.
3. Save what lasts to the app's memory: decisions with why, rules the person confirmed, and where each piece of data lives.
4. Write the final message in a few short sentences: first what failed or was not proven, then what is ready and what to try in the Prévia (it updates once Conexus saves this version), then the decisions you made and the assumptions for the person to confirm. Say what ran as facts, such as "o app compilou e abriu; 3 operações conferidas". Do not end by offering more help.
