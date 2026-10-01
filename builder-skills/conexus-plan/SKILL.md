---
name: conexus-plan
description: Designs an app with the person before any code. Explores the app and the Conexões, finds where each value comes from, designs the screens around the person's work, proposes what a good app of this kind has as suggestions, writes the plan to `.conexus/plan.md` and gets approval with `submit_plan`. Use for a new app, or for a request that leaves open what the app must do, even one that sounds small, such as adding a record, a field or a status.
---

# Planning

The plan is what you build from and what the person approves. The top part is for them, in business words. The rest is for you: complete enough that you build without deciding again. A plan is the set of decisions you cannot make alone while building.

Two kinds:
- New app: long and complete. Every screen, every piece of data and where it comes from, every table, and how you will prove each part works.
- Change to a working app: start from the code as it is. Prefer the design the app would have if this request had existed from the start over a patch on top. Make it as long as the change needs; a small but unclear change gets a few lines.

When unsure which kind or how long, take the heavier one.

## Explore first

Explore until you can say how the part you will touch works without guessing. Read the code; never judge it by file names.

For a change, follow the request through the app:
1. Start where the person meets it: the screen, the button, the field.
2. Trace the data from there to the `conexus/` handler, to the Conexão or the app's table, and back.
3. List what depends on it: other screens, handlers, tables and the data people saved in them.
4. Note what makes the code harder than it needs to be: dead code, a duplicate, a second way of doing one thing, flags or branches that stand in for a missing structure. The plan removes or reshapes these first.
5. Say what you could not trace instead of guessing.

For a new app, read the Project memory files that matter and `AGENTS.md`, and look for anything already built you can reuse.

## Find each piece of data

Every value the app will show or compute needs a named source: a Conexão field, a table of the app, or a rule the person confirmed. A value with no source is a gap to close now; never leave it for the build to invent.

For each thing the person asked for:
1. Find where it lives in the Conexão, as the integrator's skill says.
2. Prove it with a sample that looks like real use: recent records, and one list read to its end. An old or small sample hides lists with several pages, empty fields and repeated rows.
3. Count how many sampled rows have the field filled. A field that exists but comes back empty is not a source; look for another.
4. Before joining two sources, count the rows per key: several rows per key mean a history you must choose from.
5. When the request is about a record the person knows, such as a document or a customer, ask for one real example and read it.
6. When no source has it filled, ask the person; mark it "não encontrado" only when they do not know.

In the plan, give each piece its source and the counts.

## Design the app

The request says what the person wants to do. Design the app that does it well, as someone who knows this work would. Load `conexus-app` before you write the screens. For a change, design only the part the request touches.

1. Say who uses the app, at what moment of their work, and what they need to see first. The first screen answers that.
2. For each thing people will save in the app, list what a good app of this kind gives it that the request does not name: the kinds people sort it into, how it moves (its statuses), what happened to it (history, who and when), how people find it (search, filters with counts by status), what needs their attention (late, stuck, waiting), and what an empty app says. Keep what serves the person's work. Drop what only fills the screen.
3. Kinds and statuses change what a saved thing holds: offer them in one question with several choices, your proposal first and "nenhum" last. Every other addition goes in the person's part of the plan as a suggestion, with its reason in a few words, and the person decides it by approving the plan. A value is never a suggestion: no company data, no figures such as a target or a limit, no rules about money.
4. "Simples" in a request means easy to use. Keep the screens few and calm, not the work the app does for the person.

## Ask

Ask only what the person alone can answer, and never what the request already decides. A fact you can learn by reading the files or the data, or by running something, is yours to find. A rule that decides which records count, how a number is computed, or who may see or change a record is the person's, even when every answer gives the same screens: ask it. Choose how the app looks and works yourself, and record those choices as assumptions.

Write each question in the person's words: business terms, never a table, a field or where something is stored. Give 2 to 4 options, each saying in a few words what the app will do if chosen, your recommendation first.

An unanswered question, or "tanto faz", takes your recommendation as an assumption. "Pode fazer" takes every recommendation, each marked as an assumption.

Defaults, unless the person chooses otherwise:
- Everyone with access to the app sees everything in it.
- The app only reads its Conexões; it never writes back to a company system.
- Writing back, sending anything outside the app, and rules about money are never assumed: until the person answers, they stay open in the plan and off in the app.

## Write the plan

Write `.conexus/plan.md`, replacing any earlier plan, with no code in it. For a new app, read `new-app.md`; for a change to a working app, read `change.md`.

## Approval

Show the person's part of the plan in your message, in their words, with the suggestions marked. Then call `submit_plan` with `.conexus/plan.md`. The person sees the plan in a card, with "Aprovar e construir" and "Pedir ajustes". Change nothing in the app before they approve. When they ask for changes, edit the parts of the plan their feedback touches, show the person's part again, and call `submit_plan` again; editing the file alone does not resubmit it. Once approved, build from the plan.
