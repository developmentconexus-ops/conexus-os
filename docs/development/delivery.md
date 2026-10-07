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
status. Workstreams, ideas and units of work live here as issues from the
[templates](../../.github/ISSUE_TEMPLATE/).

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
| `lane:fast` | Inside accepted product meaning. No Q trigger. One pull request. Appetite P | An issue the Factory triages, plans and builds, or a builder builds when it blocks a product gate | CI green, Factory `approve`, diff read | The operator |
| `lane:shaped` | A new user-visible capability or a change across modules. Inside accepted direction. No Q trigger | A [wave](#waves): one spec, batch pull requests into `wave/<name>`, one wave pull request into `main` | Fast-lane gates on each batch, the wave's proof on the wave head | Batches: the manager, into the wave branch. The wave: the operator |
| `lane:qualification` | Any Q trigger | A wave whose spec also names the deciding proof | Shaped gates, `interrogate` review of the whole wave, evidence, and the operator's verdict: ACCEPT, ACCEPT_WITH_BOUNDARY or REWORK | Batches: the manager, into the wave branch. The wave: the operator |

- The manager is the planning session that coordinates the waves and the Factory queue for the
  operator. It never writes code and never merges into `main`.
- A change found mid-work to carry a higher-lane trigger **must** stop and change its lane label.
- The Factory **must not** merge.

**Why.** The risk of a change, not its size, decides how much proof it needs and who decides.

**Right.** A new dependency is a qualification wave, even when the diff is ten lines.

**Wrong.** A change to who may invite people shipped as `lane:fast`.

## Waves

A wave runs in four stages. Each stage is a fresh session that follows its skill, and the manager
coordinates them.

| Stage | Skill | Output | Gate |
| --- | --- | --- | --- |
| Study | [`conexus-study`](../../.agents/skills/conexus-study/SKILL.md) | A report: today's census, the references copied, the root cause | The operator agrees with what the wave wants, what stays out and when it ends |
| Spec | [`conexus-spec`](../../.agents/skills/conexus-spec/SKILL.md) | `index.md`, `rationale.md` and a compiled `shape/`, on the wave branch | The operator's approval line |
| Build | [`conexus-build`](../../.agents/skills/conexus-build/SKILL.md) | One commit per unit, one pull request per batch into `wave/<name>` | Independent batch review, CI green, Factory `approve`, diff read |
| Prove | [`conexus-prove`](../../.agents/skills/conexus-prove/SKILL.md) | A report on the wave head: a verdict per AC behind an evidence gate | Every AC met, no regression, every census line on target |

- A wave that will be built **must** have one spec in `docs/specs/NNNN-title/`, no child specs.
  S1 alone keeps its previously approved child specs under [C-039](../decisions/index.md).
- Every decision **must** go into the spec or a guide when it is made. No decision file grows beside
  them. The manager brings each load-bearing choice to the operator, one at a time, with the
  options, a recommendation and its reference.
- A wave **must** hold at most 8 units or 70 product files. Past that it splits.
- The spec writer creates the wave branch `wave/<name>` from `main`, commits the spec there and
  opens the wave's pull request into `main` as a draft.
- The manager writes the approval line,
  `**Status**: Approved by the operator on <date>, commit <sha>`. It opens the build of every unit.
- In a wave that changes structure, the first unit **must** be the behavior pin, green on `main`
  before any structure moves.
- Waves **must** use 2–3 batches of 3–4 units; the last may be smaller. Under 4 units, one suffices.
- A fresh builder **must** stack one commit per card on `wave/<name>-loteN`.
  Pass its proof and `npm run verify:quick`. The manager **must** read each diff against its card.
- Inputs **must** exist before a unit starts. Independent units in a batch **may** run in parallel.
- Each batch **must** get one independent code review and proof rerun. Findings go to builders.
  Then one PR goes into `wave/<name>` for CI and the Dev Factory.
  Units **must not** get PRs, independent reviews or Factory passes.
- The manager **must** merge each batch only after Factory `approve`, green CI and the diff read.
- Batches **may** stack on the last batch in review or Factory. Rebase if findings change it.
- A dependent wave **may** start on an upstream wave or batch branch once its needed unit exists.
  It need not wait for `main`. It **must** rebase if the upstream changes during its proof.
- When every batch is merged, a fresh read-only session proves the head of the wave branch. A
  `lane:qualification` wave is also reviewed with pstack `interrogate` over `main...wave/<name>`. A
  failed AC or a confirmed finding becomes a fix unit, and the proof runs again on the new head.
- The wave's last unit deletes `shape/`. When the proof passes, the manager marks the wave's pull
  request ready. Its merge into `main` is always the operator's.
- A wave has three states, one meaning each. **Approved** is the approval line. **Proved** is the
  proof, and on `lane:qualification` the review, passing on the same head. **Done** is the
  operator's merge into `main`.
- A wave that lays a base for others **must** prove its contract with at least one real consumer
  before merge. A later wave that breaks that contract opens a corrective wave.

**Why.** Batches avoid per-unit ceremony, allow overlap and keep `main` releasable.

**Right.** Eight units, two batches of four commits, one review and wave-branch PR each, then proof.

**Wrong.** A unit that uses a type a later unit creates, or a spec with eight child files and
decision notes beside it.

## The Conexus skills own the stages

Each wave stage follows its Conexus skill: `conexus-study`, `conexus-spec`, `conexus-build` and
`conexus-prove`; a review follows `conexus-review` and a fix `conexus-fix`. The jm skills are not
used. A pstack skill is a tool a Conexus skill names, and each Conexus skill gives the rule to follow
when the session does not have pstack. The manager delegates each stage, and each unit, to a fresh
session whose prompt names its skill, its worktree and its files, and forbids merge. A builder does
not delegate code. Worktrees are removed only with `npm run worktree:reap`.

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
  open pull requests. A qualification wave in build or proof does not stop the planning session from
  writing the next qualification spec. That spec still needs its approval, and its build starts only
  after the current wave merges.
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
  pull request changing only Markdown under `docs/`, `.agents/` or the repository root runs
  `npm run verify:docs`. Other Markdown changes and pushes to main run the full graph.
- Required CI **must** protect objective properties of every change, never taste or document shape.
- A pull request **must** leave draft as soon as the build ends, so CI and the Factory run while
  verification goes on. A wave's pull request into `main` stays a draft until the wave is proved.
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
- A wave's proof, and on `lane:qualification` its review, **must** have passed on this head, each
  naming the head it judged.
- The person who merges **must** have read the diff. A plan, an artifact or a Preview grant is not
  product acceptance. The operator does not test pull requests on the pilot.

**Why.** A gate checked on an older head proves nothing about the code that lands.

**Right.** The merger reads the review that names the current head SHA, then merges.

**Wrong.** A merge after a push that came in after the last approval.

## Git and pull requests

- `main` is the trunk and **must** stay releasable. Its rulesets require a pull request and `verify`
  with no bypass. Every pull request targets `main` and is squash merged, except a wave batch's,
  which targets its wave branch `wave/<name>`.
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
