---
name: conexus-plan-new
description: Plans a new app with the person before any code. Explores the Project, finds where each value comes from, designs the screens and what people will save, interviews the person on the decisions only they can make, writes the plan to `.conexus/plan.md` and gets approval with `submit_plan`. Use when the app is new, with only the starter screen, whatever verb the request uses.
---

# Planning a new app

The plan is what you build from and what the person approves. Its top part is for them, in business words. The rest is for you: complete enough that you build without deciding again.

Work through the stages in order; each ends when its "done when" holds. As you go, keep a list of open decisions: every choice that neither the request, the Project nor the data settles. The interview works through that list.

## 1. Explore

Read the Project memory files that matter, `AGENTS.md` and the list of Conexões, and look for anything already built you can reuse. Then list what the person asked for, item by item, in their words.

Done when you can say what the Project already gives this app and what each requested item is.

## 2. Find each piece of data

Every value the app will show or compute needs a named source: a Conexão field, a table of the app, or a rule the person confirmed. For each value from a company system, find where it lives and prove it with a sample of real use, as the integrator's skill says. A field that exists but comes back empty is not a source. When the request is about a record the person knows, such as a document or a customer, and the data cannot show which one or what it looks like, ask for one real example in the interview and read it before you write the plan.

Done when each value has a source with its counts, or is on the open decisions list. Never leave a value for the build to invent.

## 3. Design the app

Design the app that does the request well, as someone who knows this work would. Load `conexus-app` before you design screens and `conexus-server` before you design tables.

1. Who uses the app, at what moment of their work, and what they need to see first. The first screen answers that.
2. For each thing people will save, what a good app of this kind usually gives it: the kinds people sort it into, how it moves (its statuses), what happened to it (who and when), how people find it, what needs their attention, and what an empty app says. These are ideas to weigh, not features to add: keep what serves the person's work and drop what only fills the screen.
3. Each rule the app applies: which records count, how each number is computed, who may see or change what.
4. "Simples" in a request means easy to use: few, calm screens, not less work done for the person.

Before the interview, check what the design covers. Walk each of these for this app and mark it settled, open or not applicable:
- The goal: what the person must get done, and how they will know the app does it.
- Who uses it, and who else its records affect.
- Their flows: what each person does, step by step, including when something is missing or goes wrong.
- The data: for each thing people save, what it holds and how it changes over time; for each value from a company system, its source.
- The rules: which records count and how each number is computed.
- The access: who may see or change what.

An item is settled when the request, the Project, the data or the person decided it. Each open item is an open decision. The open decisions come from this walk, not from the list of what a good app usually gives.

Done when you can describe every screen, every saved thing and every rule, and every item of the walk is marked.

## 4. Interview the person

Sort each open decision into one of three kinds:
- Yours to find: a fact you can learn by reading the files or the data, or by running something. Find it; never ask it.
- Yours to choose: how the app looks and works, such as screens, layout, words, order and technical choices. Choose, and record the choice as an assumption. An addition beyond the request that serves the person's work goes in the plan as a suggestion, with its reason in a few words, and the person decides it by approving the plan. A value is never a suggestion: no company data, no figure such as a target or a limit, no rule about money.
- The person's: business rules, such as which records count, how a number is computed, and who may see or change what; what a saved thing holds when the request leaves it open, such as its kinds and its statuses; money, writing back to a company system, and sending anything outside the app; and a company fact no source holds. A rule that decides which records count, how a number is computed, or who may see or change a record is the person's, even when every answer gives the same screens: ask it.

Ask the person's decisions in `ask_user` cards of up to four questions, the most costly to get wrong first, with related questions in the same card:
- Write each question about their work, in their words: business terms, never a table, a field or where something is stored. It reads alone and says what the answer changes.
- Give 2 to 4 options, each saying in a few words what the app will do, with your recommendation first. Base it on the request, the data and what this kind of work usually needs. Leave the options out only when you cannot guess the likely answers.
- What is saved and who may see or change it come before how something is shown.

Read the answers before the next card. Another card exists only because a decision is still the person's: one not asked yet, one an answer opened, or an answer that contradicts what you found in the data. Never ask again what an answer settled. Continue until each of the person's decisions is answered, or left open in the plan with what it leaves off.

Silence is not an answer: a question the person skips leaves its decision open. When the person hands a decision to you, with words such as "tanto faz", "pode fazer" or "você decide", take your recommendation and record it in the plan as an assumption, with what it changes in the app. A business rule left open keeps the behavior that depends on it off in the app, and the plan says what stays off.

Some things are never yours to decide, even when the person hands them to you. Never infer a company fact; it stays open until the person gives it. Until the person chooses otherwise, everyone with access to the app sees everything in it, and the app only reads its Conexões. Writing back, sending anything outside the app and rules about money are never assumed: until the person answers, they stay open in the plan and off in the app.

Done when each of the person's decisions is answered, handed to you and recorded, or left open with what it leaves off, and no answer left a new one.

## 5. Write the plan

Read `references/plan-template.md` and write `.conexus/plan.md` in its shape, replacing any earlier plan, with no code in it.

Done when every requested item, screen, saved thing, rule and check is in the plan, each assumption and suggestion is marked, and the person's part has no technical word.

## 6. Approval

Show the person's part of the plan in your message, in their words, with the suggestions marked. Then call `submit_plan` with `.conexus/plan.md`. The person sees the plan in a card, with "Aprovar e construir" and "Pedir ajustes". Change nothing in the app before they approve. When they ask for changes, edit the parts of the plan their feedback touches, show the person's part again, and call `submit_plan` again; editing the file alone does not resubmit it.

Done when the person approved. Then build from the plan.
