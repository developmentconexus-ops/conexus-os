---
name: conexus-plan
description: Use before you change anything for a new app or a request that leaves open what the app must do, even one that sounds small and clear, such as adding a record, a field or a status. Explores the app and the Conexões, asks what is missing, writes the plan to `.conexus/plan.md` and gets the person's approval before you build.
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

## Ask

Ask only what the person alone can answer and what changes what you build. A fact you can learn by reading the files or the data, or by running something, is yours to find. When every answer gives the same app, choose, and record it as an assumption.

Write each question in the person's words: business terms, never a table, a field or where something is stored. Give 2 to 4 options, each saying in a few words what the app will do if chosen, your recommendation first. Put what you would add beyond the request in one question, "Posso incluir também?", with several choices allowed and "(recomendado)" on those you advise.

An unanswered question, or "tanto faz", takes your recommendation as an assumption. "Pode fazer" takes every recommendation, each marked as an assumption.

Defaults, unless the person chooses otherwise:
- Everyone with access to the app sees everything in it.
- The app only reads its Conexões; it never writes back to a company system.
- Writing back, sending anything outside the app, and rules about money are never assumed: until the person answers, they stay open in the plan and off in the app.

## Write the plan

Write `.conexus/plan.md`, replacing any earlier plan, with no code in it. For a new app, read `new-app.md`; for a change to a working app, read `change.md`.

## Approval

Show the person's part of the plan in your message, then ask with `ask_user`: "Posso construir assim?", with the options "Aprovar e construir" and "Pedir ajustes". Change nothing in the app before they approve. When they choose "Pedir ajustes", ask with `ask_user`, as free text, what to change, then edit the parts of the plan their words touch, show the person's part again, and ask again. Once approved, build from the plan.
