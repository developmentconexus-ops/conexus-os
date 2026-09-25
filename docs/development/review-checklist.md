# Review checklist

This file is the index of the Conexus review. It says which pages a review loads, the items every
pull request meets, the principles by change type, and the verdict. Request changes only for a
failed item or a correctness defect, never for preference. Each item comes from
[the delivery rules](delivery.md) or the owner it links.

## Load the pages

The rules that judge a pull request come from its base ref, never from its head. A pull request
cannot edit the rules that judge it.

1. Read the map from the base ref:
   `git show origin/<base>:docs/development/review/areas.json`.
2. List the changed paths: `gh pr view <n> --json files`.
3. Match each changed path against each area's `paths`. The grammar is portable on purpose: an
   exact path, `dir/**` for every path under `dir` (dotfiles included), and `*` for any run of
   characters inside one segment. `scripts/check-review-areas.mjs` defines the matcher and checks
   that every production file maps to an area.
4. Load every matched page from the base ref with `git show origin/<base>:<page>`, and always
   [`mastra-native.md`](review/mastra-native.md).

The pages are [mastra-native](review/mastra-native.md), [identity-session](review/identity-session.md),
[data-migrations](review/data-migrations.md), [connectors](review/connectors.md),
[frontend](review/frontend.md), [builder-factory](review/builder-factory.md),
[contracts](review/contracts.md) and [platform](review/platform.md).

## Scope and lane

- [ ] The pull request links its issue and says what changes, for whom.
- [ ] The lane label matches the change. A `lane:fast` change has no Q trigger, fits one pull
      request, and stays inside accepted product meaning.
- [ ] `needs:aprovo` is present if the change migrates real data, touches security or
      authentication, or changes a screen the operator asked to see.
- [ ] The diff does only what the issue asks. Unrelated changes are in their own pull request.

## Authority and design

- [ ] No product meaning is invented in code. A new requirement, owner or trust boundary goes to
      its owning document or decision first.
- [ ] Each meaning has one owner. The change adds no second source of truth.
- [ ] A new dependency comes with the evidence the technology rule asks for.

## Tests and secrets

- [ ] Each new or changed test calls the code as its users do and asserts a literal expected value.
- [ ] No design was reshaped to keep a test passing. Tests whose subject is gone are deleted.
- [ ] No secret, token or credential appears in code, fixtures, logs or the pull request body.
- [ ] CI `verify` is green on the exact head SHA, and no PostgreSQL or browser leaf the change
      touches was skipped. The reviewer reads the run log, not the badge.
- [ ] Each `Test-Refactor:` trailer names a test whose change really is a refactor, and each
      `Test-New-Subject:` trailer names a test whose subject the pull request adds. The
      `changed-tests-fail-on-base` leaf prints each trailer as a notice.

## Documents

- [ ] Status and next actions live in the roadmap and GitHub, not in `AGENTS.md` or a skill.
- [ ] A rule has one home. Other files link to it instead of copying it.

## Principles by change type

These are the poteto-mode principles. A violated principle is a failed item.

| Change | Principles | What the reviewer checks |
| --- | --- | --- |
| Every change | Prove It Works, Laziness Protocol | Evidence from the real artifact at the head, and the smallest diff that solves the issue |
| Bug fix | Fix Root Causes | A reproduction that fails on the base, and a fix at the cause, not a guard at the symptom |
| State and data | Model the Domain, Type System Discipline, Boundary Discipline | One structure for the domain, no illegal state that compiles, external data parsed once at the edge |
| Refactor | Subtract Before You Add, Migrate Callers Then Delete Legacy APIs | Removal before addition, and no old API left beside the new one |
| Commands and lifecycle | Make Operations Idempotent | The same end state when the step runs twice or after a crash |
| Tests | Test Behavior, Not Implementation | The test fails if the code under test returns `undefined` |

## Verdict

- The review carries a table `item | pass/fail | evidence` with one row for every item this file
  and each loaded page lists, and one row per applicable principle. No table, no verdict.
- The review names the head SHA it judged. A new push needs a new review.
- Any failed item is `request changes`. Otherwise the verdict is `approve`.
