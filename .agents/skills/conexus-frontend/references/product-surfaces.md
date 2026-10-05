# New product surfaces

The procedure for a surface that does not exist yet: a new route, a new region of a screen, or a new material interaction. A change to an existing screen does not need it. The rules it applies live in [`DESIGN.md`](../../../../DESIGN.md) (approving a surface), the [product contract](../../../../docs/product/contract.md) (the truths a screen keeps) and [architecture](../../../../docs/reference/architecture.md#the-web-app) (what the web app may own).

## Start from the person, not the backend

1. Name who uses the surface and the job they are doing: the context, the goal, and the outcome they need.
2. Walk the whole flow before drawing a screen: where they come from, how they understand the current state, what they decide, what they do, what the system answers, and where they go next. Include the failure branches that matter.
3. Only then decide what the surface shows. Never start from endpoint lists or backend nouns.

Navigation, grouping, search and browse are product decisions: never expose backend topology as navigation, or add navigation for an unapproved surface because the shell looks empty.

## Before building, answer these

A surface is ready to build when every material question has an answer. If one is missing, stop and find the owner instead of deciding it in code.

- Who is the person, and what outcome do they need?
- Why does each region exist, and why is its information in this order?
- Which product capability does it serve, and which owner in `docs/` defines it?
- Which server read supplies each fact, and which operation owns each action?
- Where does every identity on the screen come from (Workspace, Project, conversation, run)?
- What is the authoritative state, and what is only a local preference?
- What happens on success, and what does the person see next?
- What happens on each material failure, what must the person understand afterwards, and what is preserved?
- What changes on a phone, and what must stay visible?
- Which accessibility constraints shaped the design?
- What must the frontend not infer or own?

## Use references as evidence

Study mature products when the job is unfamiliar or the choice is consequential, and compare them by task pattern (hierarchy, actions, collection shape, search and filter, disclosure, failure states, phone behavior, density), not by fashion. Keep what you observed apart from what you infer and from what you decide, and give each capability that matters a verdict: irrelevant, already owned, rejected or deferred for a product reason, or a finding for the owner. Compare two or three structures only when the choice is real.

## Accessibility, responsive behavior and density are structure

A structure with no plausible accessible and phone-sized form is not approvable. Decide, before building:

- the keyboard path and focus order, labels, semantic controls, meaning that does not depend on color, and an alternative to every drag;
- on a phone: what stays primary, what stacks, what collapses, what becomes a drawer or a sheet, what scrolls, what must stay visible, and how collections change shape.

Density follows the task, not taste, and disclosure never hides a fact the person needs for the decision in front of them.

## Shared patterns come from repetition

Share a component or pattern only after two surfaces show the same protected behavior. Looking alike is not enough. Before building a new shared piece, check whether a Mastra basic part already does it (C-031).
