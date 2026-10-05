# Delivery rules

How approved work ships: lanes, waves, specs, review, merge, Git and CI. Subject rules live in the
other guides ([code](codebase-principles.md), [testing](testing.md),
[architecture](../reference/architecture.md) and their neighbors); general method lives in pstack;
[the roadmap](../roadmap.md) owns status. Workstreams and ideas live in the private `conexus-hq`
repository; units of work live here as issues from the [templates](../../.github/ISSUE_TEMPLATE/).
Each rule names how it is enforced; "review" means the reviewer judges it.

## Pick the lane by risk

A change is in the qualification lane when any Q trigger is true:

- **Q-a.** The roadmap names the work as a program gate with a verdict.
- **Q-b.** It creates or moves authority or a trust boundary, changes a structural runtime,
  database or service boundary, or has an external effect that is hard to undo.
- **Q-c.** Its proof must outlive the pull request: a real Builder run, a pilot run, or files in
  `docs/evidence`.
- **Q-d.** A new dependency or framework enters, under the [dependency rule](../reference/architecture.md#dependencies).

| Lane | Entry: all must hold | Path | Gates | Merge |
| --- | --- | --- | --- | --- |
| `lane:fast` | Inside accepted product meaning. No Q trigger. One pull request. Appetite P | issue; the Factory triages, plans and builds work that blocks no product gate, a builder builds work that blocks one | CI green; Factory `approve`; diff read | Decision D1 |
| `lane:shaped` | New user-visible capability or a change across modules. Inside accepted direction. No Q trigger | a wave: one spec, one pull request | fast-lane gates, verification and review on the same head | operator |
| `lane:qualification` | Any Q trigger | a wave whose spec also names the deciding proof | shaped gates, evidence, operator verdict ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK | operator |

Decision D1 (2026-09-25): the manager merges a `lane:fast` pull request of `effort:low` or
`effort:medium`, without `needs:aprovo`, once the Factory approved it, `verify` is green at its head
and the merge gate passes. The operator merges everything else. The Factory never merges. Enforced
by review; the `main` ruleset requires only a pull request, squash merge and `verify`.

## Waves

A wave that will be built has one spec in `docs/tasks/specs/NNNN-title/`, no child specs, and one
pull request. Every decision goes into the spec or a guide when it is made; no decision file grows
beside them. Parts run in sequence inside the pull request, one green commit per part. A spec over
800 lines or a plan over 70 product files is an alarm: the spec says in one sentence why it does
not split. What blocks a wave is an open decision or a part that depends on one not yet built.
A wave that lays a base for others proves its contract with at least one real consumer before
merge; a later wave that breaks that contract opens a corrective wave and leaves the merged one
closed. Enforced by review.

A spec follows the `jm-architect` template and also carries **Non-goals**, **Preserved decisions**
(decisions and invariants that must not regress), **What breaks the premise**, **Owner
reconciliation** (the guides, contracts and decisions that change) and a **Stop rule**. The
planning session writes the scope, the Status and the approval line, `**Approval**: approved by the
operator on <date>, commit <sha>`; the builder ticks the Build plan boxes. Enforced by review.

## When the methods disagree

The planning session and the builder use the jm steps and the pstack playbooks. Where they disagree:

| Conflict | Wins |
| --- | --- |
| `jm-develop` forbids delegating; the Feature playbook delegates | the planning session delegates to one builder; the builder does not delegate code |
| Feature and Refactoring start by exploring the design | in the build the approved spec is the design; it is not reopened |
| `jm-develop` offers to build on an `Assumed` spec | never; go back to the spec |
| `jm-architect` takes every choice to the engineer | the planning session answers the technical ones; the operator decides spec, merge and product |
| `jm-architect` allows child specs | only for a standard with no build |
| `jm-develop` follows `ui-guide` and `logical-guide` | guides C, T and V; the jm guides only as procedure where ours are silent |
| jm writes the scope and the spec Status | only the planning session writes scope, Status and approval; the builder ticks the Build plan |
| `jm-check review`, `jm-test`, `jm-debug`, thermo-nuclear review | out of the flow; review is `/pstack:interrogate` |

## Review loop

1. A finding carries its symptom and evidence. Its cause may be unknown.
2. The builder finds the cause before fixing it and writes: symptom, root cause, why the fix
   removes the cause, and what stops it returning.
3. Triage groups findings by premise and keeps every symptom.
4. The fix comes in one round, in the same pull request. The recheck reads only the findings and
   the fix diff; if the fix touches a protected property or the deciding proof, review and proof
   run again.
5. Two failed fixes on one premise send the wave back to its spec.
6. A finding repeated in two pull requests becomes a check, when a check can tell the defect from
   correct code.

A finding with no rule broken and no defect shown is a preference and does not block. Enforced by
review.

## Ask for "Aprovo" on three kinds of change

`needs:aprovo` is orthogonal to the lanes. Add it to a migration, a change under an area marked
`"gate": "aprovo"` in [`areas.json`](review/areas.json), and a screen the operator asked to see. The
`aprovo-gate` workflow fails a change under a gated area until the label is set; the label tells the
merger to wait for the operator. `needs:operator` marks an issue waiting on the operator for a fact or an action.

## Stop, then escalate

Stop before building when the work creates a product requirement, a semantic owner or a trust
boundary, changes a structural runtime, database, service or module boundary, deletes accepted
meaning without a destination, needs an unauthorized production effect or secret, or contradicts
authority needed for correctness. A downstream finding reopens the smallest upstream owner; never
invent authority to make a downstream artifact work. A higher-lane trigger found mid-work stops the
work and changes the lane label. Code is not a reason to keep a decision: a better alternative goes
to the operator with evidence. Enforced by review.

## Size work by appetite and limit work in progress

**P** up to 1 day, **M** up to 1 week, **G** up to 2 weeks; split anything larger. Work past its
appetite stops and returns reshaped. At once run at most 1 qualification and 2 shaped workstreams;
the fast lane holds at most 5 open pull requests. An exploration spike answers one question on its
own branch, never merges, and counts as gate proof only when declared so before it runs.

## Proof and verification

- Before each commit run `npm run verify:quick` (typechecks, repository check, generators and
  contract check, web style, `knip`, `biome ci`, import law, access owner, censuses, enforced-by; no
  Docker, browser or network) and the tests the change
  touches or that consume a changed contract, at most two groups at once. CI enforces the static checks on the head.
- CI runs the whole graph in `scripts/conexus-verify.mjs` as eight jobs (`browser` in four
  slices, `postgres`, `rest`, `live`, `backup`), never locally; `verify` is the one required check. A change of only Markdown files in `docs/`,
  `.agents/` or the root runs `npm run verify:docs`.
- Required CI protects objective properties of every change, never architecture taste, UX taste or
  document shape. A workflow event or concurrency change shows the rulesets stay equivalent.
- A pull request is ready, not draft, as soon as the build ends, so CI and the Factory run while
  verification goes on.
- Before merge the builder checks the diff against the guides: the review accepts the guide change
  in the same pull request, or one sentence saying why no guide rule changed. Enforced by review.
- Evidence stays only while it has a consumer; review rounds and handoffs belong to Git history.

## Merge gate

A pull request is ready when these hold at its exact head SHA, plus the lane's gates:

- CI `verify` is green. GitHub skips the workflow silently when a pull request conflicts with its
  base; with no run at your head, merge `main` and push again.
- The Factory reviews every pull request; the merger waits for its `approve`;
  GitHub itself requires only `verify`. On a pull request
  the Factory did not build, a finding that is not a leak or a security gap goes to the author once
  and does not block, and the operator may dismiss that review for that head.
- A wave's verification and review passed on this head, each naming the head it judged.
- The person who merges has read the diff. A plan, an artifact or a Preview grant is not product
  acceptance. The operator does not test pull requests on the pilot.

## Git and pull requests

- Trunk is `main`; its rulesets require a pull request and `verify` with no bypass. Every pull
  request, the Factory's included, targets `main`. Squash merge.
- A capability works on the WSL laptop pilot before any server installation.
- Work in an Ubuntu WSL2 worktree on the Linux filesystem, one writer per worktree. Concurrent
  writers get disjoint file sets and report to one integrator.
- Preserve state you do not own. Never reset, clean, stash, force-push or discard work you did not
  create. An approved increment includes its routine reversible steps; do not ask for each one.
- A pull request links its issue, says what changes and for whom, and does only what the issue
  asks. Use conventional commits.
- Migrations follow [database](../reference/database.md#migrations).
- Contract changes follow the [wire contract](../product/wire-contract.md#one-declaration-per-operation).
- `scripts/check-agent-context.mjs` (`npm run repository:check`) checks cited scripts, links, size
  caps and the two workflow guards.
