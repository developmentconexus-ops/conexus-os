# Delivery rules

This file owns how a change moves from an issue to `main`: lanes, gates, labels, proof, merge, Git
and pull requests. The [engineering method](engineering-method.md) owns how a decision is reasoned,
the [decision register](../decisions/index.md) and the product contract own meaning, and
[the roadmap](../roadmap.md) owns status. Bets and ideas live in the private `conexus-hq`
repository. Units of work live here, as issues from the [templates](../../.github/ISSUE_TEMPLATE/).
The operator ratified this file on 2026-09-24. It replaces the repository method and engineering rules.

## Pick the lane by risk

A change is in the qualification lane when any Q trigger is true:

- **Q-a.** The roadmap names the work as a program gate with a verdict.
- **Q-b.** It creates or moves authority or a trust boundary, changes a structural runtime,
  database or service boundary, or has an external effect that is hard to undo.
- **Q-c.** Its proof must outlive the pull request: a real Builder run as evidence, a pilot run,
  or files in `docs/evidence`.
- **Q-d.** A new dependency or framework enters, under the [technology rule](#technology-rule).

| Lane | Entry: all must hold | Path | Gates | Merge |
| --- | --- | --- | --- | --- |
| `lane:fast` | Inside accepted product meaning. No Q trigger. One pull request. Appetite P | issue, Factory triage, plan, build, pull request | CI green; Factory review `approve`; Codex on request; diff read | see Decision D1 |
| `lane:shaped` | New user-visible capability, a change across modules, or more than one pull request. Inside accepted direction. No Q trigger | bet from `conexus-hq`, sub-issues here, each one through the fast-lane path | fast-lane gates and the Opus review on each pull request, and the bet's "done when" checked on the real artifact | operator |
| `lane:qualification` | Any Q trigger | bet, task in `docs/tasks`, implementer, evidence, independent review | CI green; Factory review `approve`; evidence; independent review; operator verdict: ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK | operator |

Decision D1 (2026-09-25): the manager merges a `lane:fast` pull request of `effort:low` or `effort:medium`, without `needs:aprovo`, once Factory review approved it, `verify` is green at its head, and the merge gate passes.
The operator merges `effort:high`, `lane:shaped`, `lane:qualification` and any `needs:aprovo` pull request. The Factory never merges. Step M9 turns this rule from a manually checked one into a CI-enforced lane guard.

Only the qualification lane writes a task in `docs/tasks`. Other lanes track work in the issue.

## Ask for "Aprovo" on three kinds of change

`needs:aprovo` is orthogonal to the lanes. Add it in any lane to:

- a migration that touches real data;
- a security or authentication change;
- a screen the operator asked to see.

The label blocks auto-merge. Nothing else needs a per-pull-request "Aprovo" or a live pilot test by
the operator. `needs:operator` marks an issue that waits on the operator for a fact or an action.

## Stop, then escalate

Stop before building when the work creates a product requirement, a semantic owner or a trust
boundary, changes a structural runtime, database, service or module boundary, deletes accepted
meaning without a destination, needs an unauthorized production effect or secret, or contradicts
authority needed for correctness. Take the decision first: Factory triage routes it to
"Await approval". A downstream finding reopens the smallest upstream owner. Never invent authority to
make a downstream artifact work.

If a higher-lane trigger appears mid-work, stop, comment on the issue, and change the lane label. The
manager reshapes the bet.

## Size work by appetite and limit work in progress

- **P** (pequeno): up to 1 calendar day.
- **M** (médio): up to 1 week.
- **G** (grande): up to 2 weeks. Split anything larger.

A bet that passes its appetite stops. The manager records what was learned on the issue and returns
it, reshaped, to the queue. It gets more time only through a new bet.

At once, run at most 1 qualification bet and 2 shaped bets. The fast lane needs no bet and holds at
most 5 open pull requests.

## Working rules

- **Lean delivery.** The operator does not test pull requests on the pilot. CI runs once per ready head.
- **Mastra first.** Prefer a Mastra, Keycloak or PostgreSQL primitive over a Conexus-built
  mechanism. The reviewer redoes the [native census](review/mastra-native.md#proof-required). Every
  subagent prompt for Conexus work loads [the Mastra skill](../../.agents/skills/mastra/SKILL.md).
- **Best evidence over past decisions.** Code that exists is not a reason to keep it. When you see a
  better alternative than what is implemented or decided, bring it to the operator with evidence.
  Reopen the owner. Do not work around it.
- **Laptop first, then server.** Make each capability work on the WSL laptop pilot. Server
  installation and infrastructure migration follow validation there.
- **The Factory targets `main`.** Factory pull requests use `main` as their base.
- **Codex never authors.**
- **CodeRabbit is off** for this repository.
- **Tests serve the product.** Never reshape a design to keep a test or fixture passing. Fix every
  test that exercised real behavior. Delete every test whose subject is gone.

## Technology rule

Research does not select a dependency. A dependency or framework enters the stack only with a
current consumer, a named limitation, the exact API and version examined, a falsifiable probe, and
evidence against a credible alternative. Existing repository dependencies win when sufficient; the
roadmap records the baseline and deferred candidates. A pinned dev-only check tool (knip) is exempt.

## Builder proof rule

A hand-written example can prove a platform mechanism. It cannot close an application-architecture
gate. Where a gate concerns the generated-application programming model, the deciding proof includes
a real Project, a normal product-language request to the Builder, the current real model path, the
Builder finding the paved-road guidance, Builder-generated or materially Builder-modified source, the
Project's own check, a Conexus build and Preview, browser interaction, and the gate's negative proof.
Record repair iterations and failures. The Builder must use the platform reliably without the
operator dictating filenames or implementation.

## Proof and verification

- Required CI protects objective properties that hold for every change. It does not judge
  architecture quality, UX quality or document shape.
- A mock proves only the mocked boundary. A claim about a real provider, model, E2B, Sankhya,
  browser, persistence or runtime needs evidence from that dependency.
- A live provider, model, E2B or Sankhya run needs explicit authority for that proof. A green
  repository gate never implies it.
- Verification is a flat graph of leaf checks in `scripts/conexus-verify.mjs`, each run once. Never regenerate expected
  output to hide drift; use the explicit generation command. Only an `opt-in:` reason may skip a test or leave it todo.
- A change to workflow events or concurrency needs evidence that the `main` rulesets and trigger
  coverage stay equivalent.
- In the qualification lane, freeze the candidate, the protected claims and the deciding-proof route
  first. The Opus review never sees the other reviews. The lead adjudicates every finding against
  current owners. A valid non-blocker gets DEFER SAFELY with a revisit trigger. Run another round
  only when a correction invalidated a protected property or the deciding proof.
- Keep evidence that has a current or credible future consumer. Review rounds and handoffs belong
  to Git history once their obligations are absorbed.

## Merge gate

A pull request is ready when these hold at its exact head SHA, plus the lane's gates above:
- CI `verify` is green. GitHub skips the workflow silently when a pull request conflicts with its
  base. If no run exists at your head, merge `main` into your branch and push again.
- The Factory's review verdict is `approve`, in every lane. It follows [the review checklist](review-checklist.md) from `origin/main`, with the census
  redone by the reviewer.
- A serious change (`needs:aprovo`, `lane:qualification` or `lane:shaped`) also has an independent
  Claude Opus review. The manager runs it without showing it the Factory's verdict.
- The person who merges has read the diff. A plan, an artifact or a Preview grant is not product acceptance.

## Git and pull requests

- Trunk is `main`. Its rulesets require a pull request and the `verify` check with no bypass, and
  only an administrator updates it, so the Factory never merges. Open every pull request against
  `main`. Squash merge is the normal shape.
- Work in an Ubuntu WSL2 worktree on the Linux filesystem, one writer per worktree. Concurrent
  writers get disjoint file sets and report to one named integrator.
- Preserve state you do not own. Never reset, clean, stash, force-push or discard work you did not
  create. Never rewrite shared history.
- An approved increment includes its routine reversible implementation and checks. Do not ask for
  approval of each mechanical step.
- One coherent increment per pull request. Link the issue. Use conventional commits.
- Migrations are forward-only. After a migration change, run `npm run db:catalog:snapshot` and
  commit the snapshot. See the [baseline rules](../reference/data-and-persistence.md#baseline-and-forward-migrations).
- A contract change and its [operation ledger](../product/operation-ledger.md) change go in one
  commit. `npm run wire:bijection` gates on an exact count.
- `scripts/check-agent-context.mjs`, run by `npm run repository:check`, enforces what a script can
  check in these documents: cited scripts exist, links resolve, the trunk is `main`, size caps.
