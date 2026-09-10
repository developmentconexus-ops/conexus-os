# BLD-10 Preview verification receipt

> **Status:** Evidence / not authority / closure adjudicated on the reviewed candidate; focused post-review corrections recorded
> **Date:** 2026-09-09
> **Base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`

This receipt exposes the deciding local proof route to a future independent
review without routing the historical owner packet or another reviewer's
report. It records commands executed by the Lead; reviewers must treat these
outcomes as Evidence and not as a substitute for their own method review.

## Environment

- pinned WSL environment: `LOCAL_DECIDING_WSL (Ubuntu)`;
- Node `24.20.0`, npm `12.0.2`;
- local PostgreSQL `17.10` disposable verification container for the full
  graph; no Product provider, model, E2B, Sankhya, OCI live or deployment path.

## Results

| Command | Result | Scope |
| --- | --- | --- |
| `npm run verify:local` | exit `0` (final rerun) | Full candidate graph, including BLD-10/RB migration, PostgreSQL, R2 database/browser, RC01, typechecks, deterministic Vite build, repository checks and wire proof. Optional live leaves were skipped by their explicit gates. The first attempt stopped before the PostgreSQL leaf while the disposable server was still starting; after a clean restart and `psql` readiness check, this same command completed successfully. |
| `npm run rb:first:check` | exit `0` | BLD-10 projection and browser tests, pure projection leaf, Hub/Web typechecks, deterministic Vite build and Biome. Live E2B/model/OCI/composed-production leaves were skipped. |
| `npm run repository:check:extended` | exit `0` | Hygiene, documentation index/links, architecture verification and qualification provenance. |
| `npm run conexus:preflight` | exit `0` | Pinned branch/base, toolchain, roadmap status and dirty-worktree facts. |
| `git diff --check` | exit `0` | Candidate whitespace check. |

The final full graph ran on the frozen candidate after the bounded browser
assertion, owner-disposition register correction and closure-method updates.
The candidate manifest at that run is
`002b7df84fa162ee233d70f4c8ce5678fd0d4ba2dc4cca41753a09a5319e62a1`, and it
binds the binary tracked diff plus every listed candidate byte. The verification
receipt is intentionally excluded from that manifest because this file records
the frozen manifest digest after execution. After the independent Opus findings,
the operator directed that no further full verification round be run; the
follow-up changes are limited to the Web label assertion, manifest scope/rationale
and decision-register trigger, and their focused browser/RB/repository checks
passed. This receipt therefore does not claim a new full-graph execution for
those post-review bytes. No result here admits R3, or authorizes serving,
artifact production, live execution, deployment or Git publication.
