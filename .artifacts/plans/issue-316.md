# Plan: Delivery rules — three work modes and one required review (#316)

## Goal

`docs/development/delivery.md` states, as the single source of truth, the operator's
2026-09-27 decision: work runs in three modes (Factory, Exploration, Implementer build),
and an implementer's pull request needs exactly one required review (independent GPT-6 Sol
for `needs:aprovo`/`lane:shaped`/`lane:qualification` work, the Factory's review otherwise,
with Factory findings on an implementer PR blocking only for a leak or security gap). The
agent-facing route and review documents point at that rule instead of repeating or
contradicting it. Done when `git grep -n "in every lane" docs/development/delivery.md`
returns nothing, `delivery.md` states the one-required-review rule and the exploration
guardrails, and `npm run repository:check` passes.

## Scope

**In:**
- `docs/development/delivery.md`: lane table `lane:fast` path column, the merge gate's
  Factory-approval bullet, and a new short section stating the exploration guardrails.
- `.agents/skills/conexus-development/references/work-routes.md`: fast-lane step 2, to name
  both executors by linking to the lane table instead of only naming the Factory.
- `.agents/skills/conexus-development/references/review-and-delegation.md`: the "gate in
  every lane" sentence in "Review by lane", to stop asserting a universal Factory gate.

**Out:**
- `.agents/skills/conexus-development/SKILL.md` — verified clean; it already defers to
  `delivery.md` and `work-routes.md` without repeating or contradicting the review/lane
  rule. No edit needed.
- Any CI/workflow change, label change, or new automation. This is a documentation-only
  alignment; no runtime behavior changes.
- Renaming or restructuring lanes, appetites, or the Decision D1 merge-ownership rule.

## Phases

### Phase 1 — `docs/development/delivery.md`: name both fast-lane executors

Edit the `lane:fast` row's "Path" cell (currently
`issue, Factory triage, plan, build, pull request`) to name both executors instead of
only the Factory:

```
issue, Factory triage and plan; the Factory builds work that blocks no product gate, an
implementer builds work that blocks a gate; pull request
```

**Verify:** `view` the table row renders as one Markdown table row (no stray pipes/newlines
breaking cells).

### Phase 2 — `docs/development/delivery.md`: replace the universal Factory-approval bullet

In `## Merge gate`, replace:

```
- The Factory's review verdict is `approve`, in every lane. It follows [the review checklist](review-checklist.md) from `origin/main`, with the census
  redone by the reviewer.
- A serious change (`needs:aprovo`, `lane:qualification` or `lane:shaped`) also has an independent
  GPT-6 Sol review. The manager runs it without showing it the Factory's verdict.
```

with:

```
- A pull request the Factory built has the Factory's review verdict `approve`. On an
  implementer's pull request, one review is required: the independent GPT-6 Sol review for
  `needs:aprovo`, `lane:shaped` or `lane:qualification` work, and the Factory's review
  otherwise. The Factory still reviews every implementer pull request; a finding there
  blocks the merge only for a leak or a security gap, and any other finding goes to the
  author once, without a second approval round. Every review follows
  [the review checklist](review-checklist.md) from `origin/main`, with the census redone by
  the reviewer. The manager runs the independent review without showing it the Factory's
  verdict.
```

This removes the literal phrase "in every lane" and folds the old second bullet's ordering
rule (independent review runs blind to the Factory's verdict) into the merged rule so the
two bullets no longer say two different things about the same review.

**Verify:** `git grep -n "in every lane" docs/development/delivery.md` returns nothing.

### Phase 3 — `docs/development/delivery.md`: add the exploration guardrails

Add a new section after the lane table's `D1` decision paragraph and the "Only the
qualification lane writes a task…" line, before `## Ask for "Aprovo" on three kinds of
change`:

```
## Exploration spikes

An implementer spike answers one question, on its own branch and worktree, and never
merges. It reports what it tried and what it recommends.

- One question per spike, on its own branch, never merged.
- Reused code is rebuilt on a fresh branch and fully reviewed.
- No customer data enters this repository.
- On the pilot, record what changed and restore it.
- A run counts as gate proof only when declared so before it runs.
```

**Verify:** section renders as valid Markdown; no existing anchor links broken (grep for
`#ask-for-aprovo` and `#pick-the-lane-by-risk` references elsewhere in the repo still
resolve to the same headings).

### Phase 4 — `work-routes.md`: name both fast-lane executors without repeating the rule

Replace fast-lane step 2:

```
2. The dev Factory triages the issue and writes a plan. A plan routed to "Await approval" waits for the operator.
```

with:

```
2. The dev Factory triages the issue and writes a plan. A plan routed to "Await approval" waits for the operator. The Factory builds work that blocks no product gate; an implementer builds work that blocks a gate, per [the lane table](../../../../docs/development/delivery.md#pick-the-lane-by-risk).
```

**Verify:** the link resolves (same anchor used elsewhere in this file already, e.g. line 3).

### Phase 5 — `review-and-delegation.md`: stop asserting a universal Factory gate

In "Review by lane", replace:

```
The [review checklist](../../../../docs/development/review-checklist.md) and the pages it loads from `origin/main` apply to every pull request. The Factory's verdict at the head SHA is a gate in every lane, per the [merge gate](../../../../docs/development/delivery.md#merge-gate).
```

with:

```
The [review checklist](../../../../docs/development/review-checklist.md) and the pages it loads from `origin/main` apply to every pull request. Which review is required at the head SHA follows the [merge gate](../../../../docs/development/delivery.md#merge-gate).
```

Leave the "Fast lane" / "Shaped lane and `needs:aprovo`" / "Qualification lane" bullets
below it unchanged — they already describe *which* review runs per lane and remain
accurate under the new rule (fast lane still has no independent review beyond the
Factory's; the merge gate now says why).

**Verify:** `git grep -n "gate in every lane"` returns nothing repo-wide.

### Phase 6 — Repository-wide verification

Run, from the repo root, after sourcing NVM and confirming the Node/npm pins per
`AGENTS.md`:

```bash
git grep -n "in every lane" docs/development/delivery.md   # expect: no output
git grep -rn "gate in every lane" .                          # expect: no output
npm run repository:check
```

`repository:check` is the script that validates cited scripts exist, links resolve, the
trunk is `main`, and document size caps — it is the acceptance check named in the issue.
Do not run `npm run verify`; this change touches no code path `verify` exercises, and the
issue's "Done when" does not name it.

## Risks

- **Broken internal anchors.** Adding the `## Exploration spikes` heading must not collide
  with an existing anchor. Check: `git grep -n "#exploration"` across `docs/` and
  `.agents/` before and after the edit to confirm no dangling reference either way.
- **Merge-gate rule contradicts Decision D1.** D1 says the manager merges a `lane:fast`
  PR of `effort:low`/`effort:medium` once Factory review approved it. The rewritten merge
  gate bullet must keep "a pull request the Factory built has the Factory's review verdict
  `approve`" as an unconditional requirement so D1's precondition still holds after the
  edit. Re-read D1 after Phase 2 to confirm no conflict.
- **`repository:check` size caps.** The new exploration section adds ~8 lines to
  `delivery.md`. If `repository:check` enforces a per-file size cap, confirm the file stays
  under it (check `scripts/check-agent-context.mjs` for the exact limit before finalizing
  wording, and trim guardrail bullets to match the issue's wording exactly if the cap is
  tight).

## Assumptions

- Classification carried over from triage: `docs`, `Await approval` route, medium
  severity/effort/impact — confirmed by re-reading the issue; nothing in the current file
  contents changes that call.
- "One required review" is implemented exactly as the issue's Context/Constraints state it
  (GPT-6 Sol for `needs:aprovo`/shaped/qualification, Factory otherwise, Factory findings on
  an implementer PR block only for leak/security) — this is the operator's stated decision,
  not a design choice made here.
- The old merge-gate bullet about independent review running "without showing it the
  Factory's verdict" is preserved by folding it into the new merged bullet rather than
  leaving a now-redundant second bullet — minimizes text per the issue's "prefer removing
  words to adding rules" constraint while keeping that ordering rule stated somewhere.
- `SKILL.md` needs no edit: verified it contains no "every lane", "Factory builds", or
  "implementer" text that would contradict the new rule; it already defers entirely to
  `delivery.md` and `work-routes.md`.
- The exploration guardrails are added to `delivery.md` (the file the issue names as owner)
  rather than to `work-routes.md`, matching the issue's minimal-source-of-truth direction:
  one document states the rule, others link to it.
- No `needs:aprovo` label is needed on the resulting pull request — the issue states the
  operator approved this change in chat on 2026-09-27, and it is a `docs` change with no
  migration, security/auth change, or requested screen.

## Open questions

None. The issue records the operator's decided policy, the exact replacement wording for
the merge gate and fast-lane path, and the acceptance checks. No further human decision is
needed to execute this plan.
