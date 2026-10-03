# 0010. CI checks as short as Mastra's

**Date**: 2026-10-03
**Status**: Approved

## Summary

CI keeps the standard tools (TypeScript, Biome, knip, the web build, the tests) and only the custom
checks that caught a real defect. Tests are grouped by their file name instead of a hand written
list, so a new test runs in the right group without anyone registering it. About 1,250 of roughly
1,900 lines of check scripts go, and the people building the product spend less time on CI.

## Context

The verify graph lists about 115 test steps by hand, and `check-test-census` exists only to catch a
test someone forgot to list (12 of its failures in the last 200 failed runs were exactly that). Over
the same 200 failed runs, Biome (27), knip (9), the typecheck and the web build caught most real
defects. Of 16 custom check scripts, four have evidence of a real catch: the import law (6), the
generators' drift checks (6+), the wire bijection (1) and the silent skip guard. Several others never
failed, or failed only on bookkeeping. Mastra's repository keeps a lint job, test shards, a clean
worktree check and a few hygiene scripts; none of its custom checks polices test quality or process.
Evidence: `~/conexus-study/2026-10-03/checks-redesign/report.md` and its raw data.

## Requirements

**User stories**:
- As the person who builds Conexus, I want CI to fail only on real defects, so that I spend my time on
  the product and not on CI.
- As an agent adding a test, I want the file name to decide where it runs, so that I cannot forget to
  register it.

**Acceptance criteria**:
- **AC-1**: The verify graph has no hand written list of test files. A test runs in the postgres group
  if its file ends in `.postgres.test.mjs`, in the browser group if it ends in `.browser.test.mjs`,
  and in the rest group otherwise; `tests/live/` runs in the live group through `npm run test:live`
  (its global setup, shared browser and evidence upload stay); `tests/manual/` runs in no CI group.
  The `builder-ui` group goes: its suites run in the browser group.
- **AC-2**: Every committed `*.test.mjs` outside `tests/manual/` and `node_modules` belongs to exactly
  one group the workflow actually runs, and a test that imports Playwright is in the browser or live
  group. The graph test lists the files from `git ls-files` and the groups from `verify.yml`, not from
  the globs it is checking; a misnamed browser test and a test in a new folder are its negative cases.
- **AC-3**: These are deleted with their tests: `check-test-census`, `check-empty-tests`,
  `check-weak-tests`, `check-test-quarantine` with `tests/quarantine.json`, the quarantine helper and
  every read of it (each quarantined test runs again or is deleted), `check-flow-census`,
  `check-patch-churn` with `patch-churn.yml`, the `diff-shape` job, and the wire scripts for carriers,
  identity-workspace, project, builder and technical-ingress. Their rules are an accepted loss: none
  caught a defect in the 200 failed runs studied.
- **AC-4**: The generator checks are one step: run every generator, then the existing dirty tree check
  (`git status --porcelain` empty, so a new untracked output also fails). The Postgres bound `db-*`
  checks stay. `@redocly/cli` is a pinned devDependency, not `npx --yes`, and bundles go to a per run
  path, not a shared `/tmp` file.
- **AC-5**: The wire check is one script: the operation bijection plus the three connector rules (a
  credential field is `writeOnly`, never appears in a success response, and current operations are
  schema closed).
- **AC-6**: `check-web-style` keeps only "every class used in web has a CSS rule" and the brand token
  re-point pins moved there in #493. `check-agent-context` keeps links, cited scripts and size caps.
  `check-import-law` moves each plain "A may not import B" rule Biome can express into `biome.json`
  `noRestrictedImports` and keeps the rest.
- **AC-7**: `verify.yml` runs four groups (postgres, browser, rest, live) with no separate static job:
  the fast checks run first inside the rest group, and each group sets up only what it needs. The
  single required `verify` aggregate and the docs only path (`ci-change-scope`) stay. `aprovo-gate`
  moves to `aprovo-gate.yml` with the same pull request events (opened, synchronize, reopened,
  edited, labeled, unlabeled).
- **AC-8**: The paid suites (E2B, composed live) and the Builder lab live in `tests/manual/`, run only
  by their npm scripts on request.
- **AC-9**: Nothing in the repository names a deleted check after the change: a search against the
  merge base covers docs, skills, scripts, tests, npm aliases and labels, and each hit is updated in
  the same change.

## Options considered

### Option 1: Fix each check in place
Keep the 16 scripts, fix the noisy ones, keep the hand written graph.
**Pros**: no migration. **Cons**: keeps 1,900 lines and the census that exists only to police the list.

### Option 2: Replace with standard tools and a naming rule
Delete what never caught a defect, group tests by file name the way Mastra uses `*.e2e.test.ts` and
`*.integration.test.ts`, merge the generator and wire checks.
**Pros**: about 1,250 lines less, no registry to forget. **Cons**: one large change to CI.

## Decision

**Chosen option**: Option 2: standard tools plus a file name rule.

Tests are grouped by file name suffix, and only the checks with a real catch remain.

## Rationale

The census, the quarantine, the flow census and the churn check police bookkeeping or process, not
the product; the evidence shows they catch omissions in lists that the naming rule removes. The
suffix follows Mastra's own convention, so an agent who knows Mastra knows ours. The draft of build
step 1 (`~/wt-checks` a42cdf0a, with hyphen suffixes) already ran the rest group green in 2m46s and the
browser group green in 5m18s, which proves the naming rule on most of the suite.

## Feature design

**Check set after the change**: tsc for hub and web, `biome ci --error-on-warnings`, knip, the web
build, `node --test` per group, generators then the dirty tree check, `git diff --check`,
`check-import-law`, `check-test-skips` with its ledger reporter, the wire bijection, `check-web-style`
(class rule and token pins), `check-agent-context`, `ci-change-scope`, `check-aprovo-gate`.

**Key invariants**: a test file belongs to exactly one group; a browser test never runs in a group
without a browser; nothing paid runs in CI.

**Critical test scenarios**:
- A new `foo.postgres.test.mjs` runs in the postgres group with no registry edit, verifies **AC-1**
- A Playwright test named without `.browser` fails the graph test, verifies **AC-2**
- A changed generator source without regenerated output, or a new untracked output, fails the dirty
  tree check, verifies **AC-4**

## Build plan

0. Census, written into the PR description: every test file and its group, every generator, every
   import law rule and whether Biome can express it, every paid suite and lab file with its npm
   command, every reference to a check this spec deletes. The later steps work from this list.
1. Group tests by suffix: rename the draft's hyphen suffixes to `.postgres.test.mjs` and
   `.browser.test.mjs`, globs in `conexus-verify.mjs`, `tests/manual/`, the graph test; delete the
   census. Start from `~/wt-checks` a42cdf0a. Satisfies **AC-1**, **AC-2**, **AC-8**
2. Delete the checks in AC-3 and their tests. Satisfies **AC-3**
3. Generators then `git diff --exit-code`; pin `@redocly/cli`. Satisfies **AC-4**
4. One wire script. Satisfies **AC-5**
5. Trim web-style and agent-context; move plain import rules into Biome. Satisfies **AC-6**
6. `verify.yml`: four groups, fast checks first in rest, aggregate, `aprovo-gate.yml`. Satisfies **AC-7**
7. Docs that name deleted checks. Satisfies **AC-9**

## Consequences

**Positive**: about 1,250 script lines less; no test registry; the fast checks fail first in rest.

**Negative / tradeoffs**: assertion strength and process rules (repeated fixes) are review only; the
13 postgres tests that need CI's Applications cluster and bwrap are proved only by the first CI run.

**Neutral**: the failure table branch registers tests by hand in `conexus-verify.mjs`; whichever lands
second drops its registrations and relies on the file name.

## Migration plan

**Strategy**: one pull request, one commit per build step, each green.
**Phases**: the build plan steps, in order; step 1 first because every later step runs on the grouped tests.
**Rollback**: revert the merge commit.
**Risks**: a test silently leaves CI if its name matches no group; AC-2's graph test is the guard.

## Follow-up

- [ ] Make `aprovo-gate` a required check in the `main` ruleset (Leandro, when he has time).
