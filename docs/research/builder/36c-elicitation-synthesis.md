# 36c. Elicitation: synthesis of Opus (36) and GPT-6 Astra (36b)

Agreement (strong signal, two models, independent):
- firstmate is not an elicitation reference: intake asks little and forbids widening the request.
  Its decision model (durable decisions closed only by the person, escalation with a recommendation,
  one open decision at a time) is worth adopting later.
- superpowers brainstorming is the closest method: intent first, one question per message, options
  with a recommendation, approval before building. Its stop rule is weak.
- Questions alone miss unstated needs: the Builder needs an explicit category checklist
  (36: 11 dimensions; 36b: 10 categories, same ground).
- Explicit stop gates visible in the plan (7 in each), budgets of about 3 questions for a feature and
  5 for a new app as guardrails.
- A `Requisitos` section in `docs/planos/NNNN/plano.md`, each line with its origin and state.
- Test it as a component: A1 against A1 plus elicitation, everything else fixed.
- The bakeoff's precise requests cannot measure elicitation: add underspecified cases, and a scripted
  person who can say "não sei" and does not accept the first option by default.

Differences and how to merge:
- Proposing more vs overbuilding. 36: a quality floor always built, extras on one checkbox card.
  36b: every category gets a disposition (include, propose, defer, not applicable, with a reason);
  considering a category never authorizes a feature. Merge: disposition per category; the quality floor
  (empty and error states, full lists, Portuguese copy) is "include" by default; other extras go on
  the checkbox card as "propose".
- "Pode fazer". 36: take every recommendation as a marked assumption. 36b: an unanswered permission or
  external action is never assumed. Merge: display and logic defaults may become assumptions;
  permissions, external sending and money rules never do; they stay open and the behavior stays off.
- Order. 36b: ask the purpose first if unclear, before an expensive data search; then discovery.
  Today's rule is explore before asking. Merge: one purpose question first only when the purpose is
  unclear, then discovery, then business questions.
- Anchoring (36b): a novice may pick the recommended option because it sounds expert. Each question
  states the concrete consequence of each option.
- Extra eval cases (36b): misleading populated field (our R1 promotion columns), missing source,
  restrictive access rule, late correction, a person who accepts too easily. Extra metrics: unsupported
  commitments shown as confirmed; features added with no link to the job.
