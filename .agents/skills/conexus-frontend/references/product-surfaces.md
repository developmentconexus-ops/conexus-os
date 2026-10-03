# New product surfaces

Read this before designing a surface that does not exist yet: a new route, a new region of a screen, or a new material interaction. A change to an existing screen does not need it.

Production code realizes decisions already made; it is not where navigation, workflows or missing capabilities get invented.

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

## Keep these distinctions honest

Each pair below is two different states. The surface must show which one it is in.

- Unknown is not known-empty. A failed load is not "no Projects yet".
- A projection is not a mutation authority. A list the client holds does not decide what exists.
- A hidden control is not authorization. The server refuses; the UI only reflects it.
- An ambiguous outcome is not a known failure. A timed-out request says it does not know yet.
- A stale write is not a silent overwrite. When someone else changed the thing first, say so and keep both.
- Provider success is not product success. A model reply or a frame load is not proof that the app works.

## The frontend never becomes business authority

Unless an owner explicitly accepts it, the frontend does not own a business lifecycle or state machine, authorization decisions, a parallel schema or DTO registry, a normalized mirror of business entities, history or audit presented as current truth, or a provider's internal state presented as product truth.

## No screen-shaped API, no backend-shaped UX

Both hold at once:

- **No screen-shaped API.** A hard screen does not justify a convenience endpoint. Prove the person's need, find the semantic owner of the missing truth, and reopen the smallest owning decision only when evidence demands it.
- **No backend-shaped UX.** A missing endpoint does not justify dropping a proven need. When the current API lacks something the person materially needs, record it as a finding for the owner and get it ratified, deferred or rejected with a product reason. "The API does not have it" is not a product reason.

Look for the smallest cause of a screen problem first: the interaction structure, the navigation, the wrong pattern, an unanswered question above, an allowed read composition, and only then a missing backend capability.

## Use references as evidence

Study mature products when the job is unfamiliar or the choice is consequential, and compare them by task pattern (hierarchy, actions, collection shape, search and filter, disclosure, failure states, phone behavior, density), not by fashion. Keep what you observed apart from what you infer and from what you decide, and give each capability that matters a verdict: irrelevant, already owned, rejected or deferred for a product reason, or a finding for the owner. `docs/research/functional-references/` holds the references already studied. Compare two or three structures only when the choice is real.

## Let the operator operate it

Only the operator approves the structure of a new surface. An agent proposes. A pull request that ships a screen the operator asked to see carries `needs:aprovo`, per the [delivery rules](../../../../docs/development/delivery.md).

When the surface has material interaction, the operator approves something they can use, not a picture of it: a clickable prototype (plain HTML, CSS and JavaScript with local fixtures) or the real screen behind stubbed data. A screenshot, a static mockup or a written description cannot approve an interaction. The controls that could prove the structure wrong must work: open and close, tabs and lenses, drawers and dialogs, disclosure, selection, local forms, empty, error and conflict states, and the phone layout.

A prototype is evidence, not production: it does not become production code, call the real API or hold state the product will trust. Where it reaches an undesigned area, end it at an explicit boundary ("continua em Configurações").

Get the structural piece approved first, then build the pieces that inherit from it; do not generate every screen of a large change and review them at the end.

## Accessibility, responsive behavior and density are structure

A structure with no plausible accessible and phone-sized form is not approvable. Decide, before building:

- the keyboard path and focus order, labels, semantic controls, meaning that does not depend on color, and an alternative to every drag;
- on a phone: what stays primary, what stacks, what collapses, what becomes a drawer or a sheet, what scrolls, what must stay visible, and how collections change shape.

Density follows the task, not taste, and disclosure never hides a fact the person needs for the decision in front of them.

## Shared patterns come from repetition

Share a component or pattern only after two surfaces show the same protected behavior. Looking alike is not enough. Before building a new shared piece, check whether a Mastra basic part already does it (C-031).

## Visual work cannot silently redesign

Styling may change how a surface looks. It may not change, without the operator's approval, the reading order, the priority of regions, where actions sit, the interaction model, the density, what navigation means, which information is visible, or how the surface behaves on a phone.
