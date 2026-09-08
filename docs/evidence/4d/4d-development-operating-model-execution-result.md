# Development operating-model correction — execution and result

**Date:** 2026-09-08
**Upstream authority:** [C-019 acceleration adjudication](4d-development-method-acceleration-adjudication.md)

Current execution status and grant live only in
[`docs/roadmap.md`](../../roadmap.md). This owner records the correction subject
and its deciding proof; it does not project mutable program status.

## Outcome and envelope

This bounded correction removes demonstrated bootstrap, mutable-status and
verification-graph duplication before Product resumes. It may change repository
operations, tests, current routing and the `conexus-development` skill. It does
not change Product meaning, architecture ownership, runtime/database/service
boundaries, provider grants or production effects.

Protected properties:

1. preflight remote inspection is read-only and reports exact remote/local
   `main`, relevant PR and exact-SHA `Verify` facts without manufacturing Git
   ancestry;
2. `docs/roadmap.md` is the only mutable current-state/grant/next-action owner;
3. one shared executable verification profile retains every applicable local
   and CI claim in its required environment and runs each equivalent leaf once;
4. explicit grants persist through named mechanical parts, while Product,
   publication and merge authority remain separate;
5. required Fable and AGY/Gemini closure lanes remain fresh, isolated and
   independent of candidate authorship.

## Measured baseline

These are observed reference points, not estimates of labor and not promises of
speedup:

- PR #70 candidate job `102257615524`, run `34284751225`: `568 s`;
- final `Verify` jobs for PRs #64–#70: median `564 s`;
- PR #70 job-step `npm ci`: `8 s`;
- PR #70 job-step Chromium install: `28 s`;
- S6 P0/P1/P2/P3/P5: `28 / 18 / 18 / 21 / 24 s`;
- PR #70 job-step root `npm run verify`: `246 s`.

## Implemented correction

- Preflight uses `git ls-remote` rather than fetching; separates local tracking
  and remote facts; resolves an open current PR or an exact-SHA merged PR; and
  binds `Verify` state to the exact SHA, including `in_progress`.
- Roadmap and index now route current work without replaying consumed Product
  and Evidence history. The integrated source-inspection packet is labeled as
  a frozen PR #70 snapshot.
- The development skill routes execution through one review/delegation owner:
  Sol/medium is Lead and Astra is reserved for bounded difficult/material advice.
  Bootstrap and repository rules preserve
  tranche grants through mechanical parts, distinguish stage/part/PR, require
  disjoint writer envelopes plus one integrator, and keep fresh independent
  closure reviewers.
- The shared candidate graph contains 68 sequential leaves: 50 static, five
  browser, 11 PostgreSQL and two custody. PostgreSQL leaves accept one complete
  caller-selected `CONEXUS_TEST_DB_*` set or use the disposable CI defaults;
  partial configuration fails before execution and secrets are absent from the
  displayed commands.

## Proof and result

Pending candidate freeze:

- focused preflight and verification-composition regressions;
- skill `quick_validate.py`;
- `npm ci` and Chromium installation in pinned WSL Ubuntu;
- the complete shared verification profile, including native R1C-14,
  PostgreSQL, browser, custody, repository and wire claims;
- one fresh isolated Fable + AGY/Gemini round over the exact frozen candidate,
  followed by Lead adjudication.

Command success is technical Evidence, not Product or stage acceptance.

The historical repository projection suite was corrected with the routing
change: 57 affected `4c`/`4d`/`4e` files now read durable claims from their
exact Evidence, contract, result or artifact owners instead of mutable
roadmap/index prose. No callback, objective artifact/hash/wire assertion or
negative control was removed. The focused historical set is `232/232` GREEN
and root `npm test` is `327/327` GREEN.

## Deferred safely

| Item | Why safe now | Revisit trigger | Later owner |
| --- | --- | --- | --- |
| Parallel CI jobs | The current sequential job preserves shared service/workspace assumptions; this correction can remove duplicate leaves without asserting isolation | Measured remaining critical path justifies splitting and each job's PostgreSQL/filesystem/cache isolation is proven | Repository/CI owner |
| Workflow event or concurrency changes | Current PR and push-to-main coverage remains untouched | Branch-protection and trigger-equivalence Evidence plus a demonstrated queue/cancellation cost | Repository/CI owner |
| Broad rewrite of tests that invoke TypeScript preparation | Existing tests may depend on standalone build preparation; changing 50 files without a firing dependency model risks false negatives | Profiling identifies a repeated preparation leaf and a shared setup proves identical standalone and aggregate behavior | Exact affected test-suite owner |

No Product P0–P14 replay, new universal authority metadata, additional blanket
stage, provider substitution, or reduced two-lane assurance floor is part of
this correction.
