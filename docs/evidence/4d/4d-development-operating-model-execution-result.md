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

The clean technical candidate was `5249e527252992ccb0b3f91d3838df373a88705f`.
Observed local WSL proof was GREEN:

- `npm ci`: `5.23 s`; cached Chromium installation: `0.59 s`;
- root `npm test`: `327/327`;
- complete `npm run verify`: all `68` leaves in `545.664 s`, including
  native R1C-14, 11 real PostgreSQL leaves, five browser leaves, two custody
  leaves, repository checks and the complete wire graph;
- post-run worktree: clean.

These local timings are not directly comparable to the GitHub Actions baseline
and establish no measured speedup.

The valid fresh isolated review round bound that SHA:

- Fable: Claude CLI `2.1.257`, requested alias `fable`, resolved
  `claude-fable-5-1`, session `f06699ff-b292-473b-bd7e-2552ff5d748d`,
  `REVISE`; CLI-reported duration `869121 ms` and cost `$8.1431575`;
- AGY/Gemini: AGY `1.1.27`, `gemini-3.1-pro-high`, conversation
  `a1666ad1-52c8-4e0c-bb4e-0b3f604a3fbf`, `REVISE`; reported duration
  `219.352 s`, with no price reported.

Lead adjudication accepted six bounded findings: restore compact R1C-14/RC-01
and Foundation/A0/S2 routes; assert the exact 68-scope graph; stop pinning
mutable roadmap values in required CI; route an unusable reviewer report;
keep Repository Method 1.1 explicitly candidate pending operator acceptance;
and remove the duplicate import-law test invocation. Post-adjudication targeted
proof (`import-law`, preflight, graph-runner and R2-P0 tests) is `41/41` GREEN;
root `npm test` is `327/327`, repository extended/local checks and skill
`quick_validate.py` are GREEN. They do not invalidate the independent challenge: the graph
leaf/claim set is unchanged, its assertion is a strict superset, durable routes
are restored, mutable-value coupling is removed, and only an equivalent
duplicate invocation is removed. No further independent round is justified.

One earlier dual invocation was interrupted before any usable report because an
outside-workspace brief was incompatible with AGY's native-read constraint. It
is `NO REPORT`, was not used in adjudication, and no output crossed lanes.

Command success is technical Evidence, not Product or stage acceptance.

The historical repository projection suite was corrected with the routing
change: 57 affected `4c`/`4d`/`4e` files now read durable claims from their
exact Evidence, contract, result or artifact owners instead of mutable
roadmap/index prose. All callbacks and objective artifact/hash/wire or
trust-boundary negative assertions were preserved; obsolete mutable roadmap-
status assertions were removed. The focused historical set is `232/232` GREEN
and root `npm test` is `327/327` GREEN.

## Deferred safely

| Item | Why safe now | Revisit trigger | Later owner |
| --- | --- | --- | --- |
| Parallel CI jobs | The current sequential job preserves shared service/workspace assumptions; this correction can remove duplicate leaves without asserting isolation | Measured remaining critical path justifies splitting and each job's PostgreSQL/filesystem/cache isolation is proven | Repository/CI owner |
| Workflow event or concurrency changes | Current PR and push-to-main coverage remains untouched | Branch-protection and trigger-equivalence Evidence plus a demonstrated queue/cancellation cost | Repository/CI owner |
| Broad rewrite of tests that invoke TypeScript preparation | Existing tests may depend on standalone build preparation; changing 50 files without a firing dependency model risks false negatives | Profiling identifies a repeated preparation leaf and a shared setup proves identical standalone and aggregate behavior | Exact affected test-suite owner |
| Reviewer brief packaging | The valid round used one temporary workspace-readable brief with embedded base facts; the candidate and reviewer isolation were explicit | The wrapper can embed brief bytes for native-read lanes while retaining ephemeral outside-repository storage and exact digest binding | Review-wrapper owner |
| Login-shell execution in shared runner | Local pinned WSL proof preserved the selected toolchain; changing shell semantics after the complete run would invalidate more proof than this minor unknown warrants | Candidate CI resolves a different Node/npm or a leaf differs under non-login `bash -c` | Verification-runner owner |
| Legacy roadmap-phase helper | Historical snapshot tests no longer consume it, but repository hygiene still owns the path; deleting it without updating that objective owner breaks the repository contract | The hygiene owner is revised to remove or replace the compatibility path with an equivalent firing control | Repository-hygiene owner |

No Product P0–P14 replay, new universal authority metadata, additional blanket
stage, provider substitution, or reduced two-lane assurance floor is part of
this correction.
