# Delivery guide

How approved work ships: lanes, waves, review, merge and Git. This guide adapts the
[Microsoft Code With Engineering Playbook](https://github.com/microsoft/code-with-engineering-playbook)
(CC BY 4.0) and [Google's engineering practices](https://google.github.io/eng-practices/) (CC BY
3.0), with the small-batch and trunk-based capabilities of [DORA](https://dora.dev/capabilities/).
Each rule uses the words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and
**must not** are defects in review, **should** and **should not** need a stated reason to break,
and **may** is a free choice.

Subject rules live in the other guides ([code](codebase-principles.md), [testing](testing.md),
[architecture](../reference/architecture.md) and their neighbors). [The roadmap](../roadmap.md) owns
status. Workstreams and ideas live in the private `conexus-hq` repository. Units of work live here
as issues from the [templates](../../.github/ISSUE_TEMPLATE/).

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
| `lane:fast` | Inside accepted product meaning. No Q trigger. One pull request. Appetite P | An issue the Factory triages, plans and builds, or a builder builds when it blocks a product gate | CI green, Factory `approve`, diff read | The manager, for `effort:low` or `effort:medium` without `needs:aprovo` |
| `lane:shaped` | A new user-visible capability or a change across modules. Inside accepted direction. No Q trigger | A wave: one spec, one pull request | Fast-lane gates, verification and review on the same head | The operator |
| `lane:qualification` | Any Q trigger | A wave whose spec also names the deciding proof | Shaped gates, evidence, and the operator's verdict: ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK | The operator |

- A change found mid-work to carry a higher-lane trigger **must** stop and change its lane label.
- The Factory **must not** merge.

**Why.** The risk of a change, not its size, decides how much proof it needs and who decides.

**Right.** A new dependency is a qualification wave, even when the diff is ten lines.

**Wrong.** A change to who may invite people shipped as `lane:fast`.

## Waves

- A wave that will be built **must** have one spec in `docs/tasks/specs/NNNN-title/`, no child
  specs, and one pull request. Parts run in sequence inside it, one green commit per part.
- Every decision **must** go into the spec or a guide when it is made. No decision file grows beside
  them.
- A spec over 800 lines or a plan over 70 product files **must** say in one sentence why it does not
  split.
- A spec follows the `jm-architect` template and also carries **Non-goals**, **Preserved
  decisions**, **What breaks the premise**, **Owner reconciliation** and a **Stop rule**.
- The planning session writes the scope, the Status and the approval line,
  `**Approval**: approved by the operator on <date>, commit <sha>`. The builder ticks the Build plan.
- A wave that lays a base for others **must** prove its contract with at least one real consumer
  before merge. A later wave that breaks that contract opens a corrective wave.

**Why.** One spec and one pull request keep the design and its proof in one place a reviewer can
read.

**Right.** A spec that lists its parts and builds them as commits in one pull request.

**Wrong.** A spec with eight child files and decision notes beside it, reopened after three pull
requests.

## When the methods disagree

The planning session and the builder use the jm steps and the pstack playbooks. Where they
disagree:

| Conflict | Wins |
| --- | --- |
| `jm-develop` forbids delegating; the Feature playbook delegates | The planning session delegates to one builder. The builder does not delegate code |
| Feature and Refactoring start by exploring the design | In the build, the approved spec is the design. It is not reopened |
| `jm-develop` offers to build on an `Assumed` spec | Never. Go back to the spec |
| `jm-architect` takes every choice to the engineer | The planning session answers the technical ones. The operator decides spec, merge and product |
| `jm-architect` allows child specs | Only for a standard with no build |
| `jm-develop` follows `ui-guide` and `logical-guide` | Guides C, T and V. The jm guides only as procedure where ours are silent |
| jm writes the scope and the spec Status | Only the planning session writes scope, Status and approval |
| `jm-check review`, `jm-test`, `jm-debug`, thermo-nuclear review | Out of the flow. Review is `/pstack:interrogate` |

## Review loop

1. A finding **must** carry its symptom and evidence, and name the guide section it breaks. Its
   cause may be unknown.
2. The builder **must** find the cause before fixing it, and write the symptom, the root cause, why
   the fix removes the cause, and what stops it returning.
3. Triage groups findings by premise and keeps every symptom.
4. The fix **must** come in one round, in the same pull request. The recheck reads the findings and
   the fix diff. A fix that touches a protected property or the deciding proof runs review and proof
   again.
5. Two failed fixes on one premise **must** send the wave back to its spec.
6. A finding repeated in two pull requests **should** become a check, when a check can tell the
   defect from correct code.
7. A finding with no rule broken and no defect shown is a preference. It starts with `Nit:` and does
   not block.

The reviewer approves a change once it improves the health of the code, even when it is not
perfect (Google).

**Why.** A fix without its cause comes back. A preference that blocks slows every change and
teaches nothing.

**Right.** "Symptom: the list shows a deleted Project. Cause: the store reads `archived`, which
nothing writes. Fix: the state leaves the type."

**Wrong.** A second patch on the same premise after the first one failed review.

## Ask for "Aprovo" on three kinds of change

- `needs:aprovo` **must** be on a migration, on a change under an area marked `"gate": "aprovo"` in
  [`areas.json`](review/areas.json), and on a screen the operator asked to see. The merger waits for
  the operator's "Aprovo".
- `needs:operator` marks an issue waiting on the operator for a fact or an action.

**Why.** These three change what the operator owns: the data, a gated area, or what a person sees.

**Right.** A pull request with a new migration carries `needs:aprovo` and waits.

**Wrong.** A gated change merged because CI is green.

## Approve a new surface from something usable

- Only the operator **may** approve the structure of a new surface: a new route, a new region of a
  screen, or a new material interaction. The approval comes from something usable, a clickable
  prototype or the real screen on stubbed data, never a static picture.
- The structural piece **must** be approved before the pieces that inherit it.
- Styling **must not** change reading order, region priority, where actions sit, density,
  navigation or phone behavior without that approval.
- Values on a screen **must** match the issue's literal numbers and copy.

**Why.** A person judges a screen by using it. A picture hides the flow, the empty states and the
phone.

**Right.** The operator clicks through a new invitation screen on stubbed data and answers "Aprovo".

**Wrong.** A restyle that moves the main action into a menu, merged as a style change.

## Stop, then escalate

- Work **must** stop before building when it creates a product requirement, a semantic owner or a
  trust boundary, changes a structural runtime, database, service or module boundary, deletes
  accepted meaning without a destination, needs an unauthorized production effect or secret, or
  contradicts authority needed for correctness.
- A downstream finding **must** reopen the smallest upstream owner. Nobody invents authority to make
  a downstream artifact work.
- Code **must not** be a reason to keep a decision. A better alternative goes to the operator with
  evidence.

**Why.** Building past an open decision turns a question into code someone must later undo.

**Right.** A builder finds the spec needs a new role and stops with the question.

**Wrong.** A builder adds the role to make the tests pass.

## Size work by appetite and limit work in progress

- Work **must** fit its appetite: **P** up to 1 day, **M** up to 1 week, **G** up to 2 weeks.
  Anything larger splits. Work past its appetite stops and returns reshaped.
- At most 1 qualification and 2 shaped workstreams **may** run at once, and the fast lane at most 5
  open pull requests.
- A pull request **should** do one thing. A refactoring and a behavior change **should** ship as
  separate commits.
- An exploration spike answers one question on its own branch, never merges, and counts as gate
  proof only when declared so before it runs.

**Why.** Small batches reach `main` sooner, fail smaller and are reviewed better (DORA).

**Right.** A rename across forty files in one commit, then the behavior change in the next.

**Wrong.** A pull request that renames, refactors and adds a feature in one diff.

## Proof and verification

- Before each commit, the builder **must** run `npm run verify:quick` and the tests the change
  touches or that consume a changed contract, at most two groups at once.
- CI runs the whole graph in `scripts/conexus-verify.mjs`. `verify` is the one required check. A
  change of only Markdown files runs `npm run verify:docs`.
- Required CI **must** protect objective properties of every change, never taste or document shape.
- A pull request **must** leave draft as soon as the build ends, so CI and the Factory run while
  verification goes on.
- Before merge, the builder **must** check the diff against the guides. The pull request carries the
  guide change, or one sentence saying why no guide rule changed.
- Evidence stays only while it has a consumer.

**Why.** Local checks find a failure in seconds. CI proves the same head the merger will merge.

**Right.** A builder runs `verify:quick` and the PostgreSQL tests of the store it changed.

**Wrong.** A pull request opened to let CI find what `verify:quick` would have found.

## Merge gate

A pull request is ready when these hold at its exact head SHA, plus its lane's gates:

- CI `verify` **must** be green. GitHub skips the workflow when a pull request conflicts with its
  base, so with no run at the head, merge `main` and push again.
- The Factory reviews every pull request, and the merger **must** wait for its `approve`. On a pull
  request the Factory did not build, a finding that is not a leak or a security gap goes to the
  author once and does not block, and the operator **may** dismiss that review for that head.
- A wave's verification and review **must** have passed on this head, each naming the head it
  judged.
- The person who merges **must** have read the diff. A plan, an artifact or a Preview grant is not
  product acceptance. The operator does not test pull requests on the pilot.

**Why.** A gate checked on an older head proves nothing about the code that lands.

**Right.** The merger reads the review that names the current head SHA, then merges.

**Wrong.** A merge after a push that came in after the last approval.

## Git and pull requests

- `main` is the trunk and **must** stay releasable. Its rulesets require a pull request and `verify`
  with no bypass. Every pull request targets `main` and is squash merged.
- A branch **should** live hours or days, not weeks.
- A pull request **must** link its issue, do only what it asks, and open with one line that says
  what changes, followed by why and for whom. Commits use conventional commit titles.
- A capability **must** work on the WSL laptop pilot before any server installation.
- Work happens in a WSL2 worktree on the Linux filesystem, one writer per worktree. Concurrent
  writers get disjoint file sets and report to one integrator.
- Nobody **may** reset, clean, stash, force-push or discard work they did not create.
- Migrations follow [database](../reference/database.md#2-migrations), and contract changes follow
  the [API guide](../product/wire-contract.md#1-contract-first).

**Why.** A short-lived branch on a releasable trunk keeps integration cheap and every merge
deployable.

**Right.** `feat(builder): a question waits inside the run`, linking its issue, merged the same
week it opened.

**Wrong.** A branch rebased for a month and force-pushed over a teammate's commits.
