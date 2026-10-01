---
name: conexus-plan-change
description: Plans a change to a working app with the person before any code. Traces the request through the app as it is, finds what depends on it and which saved data is at risk, designs the change, interviews the person on what the change leaves open, writes the plan to `.conexus/plan.md` and gets approval with `submit_plan`. Use for a change to an app that already has its own screens when the request leaves open what the app must do, even a small one such as adding a field, a status or a kind of record.
---

# Planning a change

The plan is what you build from and what the person approves. Its top part is for them, in business words. The rest is for you: complete enough that you build without deciding again. Size it to the change: a small but unclear change gets a few lines, and a change that reshapes saved data or several screens gets every section. When unsure how long, take the longer one.

Work through the stages in order; each ends when its "done when" holds. As you go, keep a list of open decisions: every choice that neither the request, the app, its memory nor the data settles. The interview works through that list.

## 1. Explore the app as it is

Read the code; never judge it by file names. Follow the request through the app:
1. Start where the person meets it: the screen, the button, the field.
2. Trace the data from there to the `conexus/` handler, to the Conexão or the app's table, and back.
3. List what depends on it: other screens, handlers, tables and the data people saved in them.
4. Note what makes the code harder than it needs to be: dead code, a duplicate, a second way of doing one thing, flags or branches that stand in for a missing structure. The plan removes or reshapes these first.
5. Read the memory files about this part: the rules the person confirmed and the decisions made before.

Done when you can say, without guessing, how the part you will touch works, what depends on it and which saved data it holds, and you have named what you could not trace.

## 2. Find each piece of data

Each new value the change shows or computes needs a named source: a Conexão field, a table of the app, or a rule the person confirmed. For a value from a company system, find where it lives and prove it with a sample of real use, as the integrator's skill says. A field that exists but comes back empty is not a source. When the request is about a record the person knows, ask for one real example in the interview and read it before you write the plan.

Done when each new value has a source with its counts, or is on the open decisions list.

## 3. Design the change

Load `conexus-app` before you design a screen and `conexus-server` before you change a table or `conexus/`.

1. Design the app as it would be if this request had existed from the start, and what that deletes. Fixing in place is often right. Redesign when the request would otherwise need a patch: an extra branch, a second flag kept in step with the first, a second way of doing one thing.
2. Settle the data shape before the logic. For each saved thing that changes: what it holds now, what it will hold, and what the records saved before the change will hold.
3. For the part the change touches, what a good app gives it: its kinds, its statuses, who did what and when, how people find it, what needs their attention, what it says when empty. Keep what serves the person's work; drop what only fills the screen.
4. Each rule the change adds or alters: which records count, how a number is computed, who may see or change what.

Put each part of the design that came from you, and not from the request, the app or the data, on the open decisions list.

Done when you can describe what changes on each screen, in each table and in each rule, and every part that came from you is on the list.

## 4. Interview the person

The interview covers only what the change leaves open. What the app already does, and a rule in memory the person confirmed, are settled: do not ask them again.

Sort each open decision into one of three kinds:
- Yours to find: a fact you can learn by reading the files or the data, or by running something. Find it; never ask it.
- Yours to choose: how the app looks and works, such as layout, words, order and technical choices. Follow what the app already does, and record a new choice as an assumption. An addition beyond the request that serves the person's work goes in the plan as a suggestion, with its reason in a few words, and the person decides it by approving the plan. A value is never a suggestion: no company data, no figure such as a target or a limit, no rule about money.
- The person's: business rules, such as which records count, how a number is computed, and who may see or change what; what a saved thing holds when the request leaves it open, including what records saved before the change will hold; money, writing back to a company system, and sending anything outside the app; and a company fact no source holds. A rule that decides which records count, how a number is computed, or who may see or change a record is the person's, even when every answer gives the same screens: ask it.

A small change often leaves one or two of the person's decisions: ask those and nothing else. When none is the person's, skip the card.

Ask the person's decisions together in one `ask_user` card:
- Write each question about their work, in their words: business terms, never a table, a field or where something is stored. It reads alone and says what the answer changes.
- Give 2 to 4 options, each saying in a few words what the app will do, with your recommendation first. Base it on the request, what the app already does, the data and what this kind of work usually needs. Leave the options out only when you cannot guess the likely answers.
- When more than four decisions are the person's, ask the four that are hardest to undo: what is saved, what happens to saved records, and who may see or change them come before how something is shown. Take your recommendation for the rest and list it in the plan as an assumption, where the person reviews it.

Read the answers. When one opens a decision you did not have, or contradicts what you found in the app or the data, ask about that alone in one more card. Otherwise stop: the plan shows the rest for review.

An unanswered question, or "tanto faz", takes your recommendation as an assumption. "Pode fazer" takes every recommendation, each marked as an assumption. Unless the app or the person already decided otherwise, everyone with access to the app sees everything in it, and the app only reads its Conexões. Writing back, sending anything outside the app and rules about money are never assumed: until the person answers, they stay open in the plan and off in the app.

Done when each open decision is found, chosen and recorded, or answered, and no answer left a new one.

## 5. Write the plan

Read `references/plan-template.md` and write `.conexus/plan.md` in its shape, sized to the change, replacing any earlier plan, with no code in it.

Done when what changes, what stays the same, what happens to saved data and how each part is checked are in the plan, each assumption and suggestion is marked, and the person's part has no technical word.

## 6. Approval

Show the person's part of the plan in your message, in their words, with the suggestions marked. Then call `submit_plan` with `.conexus/plan.md`. The person sees the plan in a card, with "Aprovar e construir" and "Pedir ajustes". Change nothing in the app before they approve. When they ask for changes, edit the parts of the plan their feedback touches, show the person's part again, and call `submit_plan` again; editing the file alone does not resubmit it.

Done when the person approved. Then build from the plan.
