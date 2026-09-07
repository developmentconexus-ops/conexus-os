# R2 P4/P5 production composition — independent review adjudication

**Date:** 2026-09-07

**Lead decision:** `CURRENT STRUCTURE CONFIRMED`

**P4 disposition:** `CLOSED PASS`

**Reviewed code candidate:** `b8ec320`

**Material range:** `3db3059..b8ec320`

## Independent lanes

The whole-package Fable review used Claude Code `2.1.257`, requested alias
`fable`, resolved model `claude-fable-5-1`, effort `xhigh`, plan/read-only mode
and session `9f69a896-e025-46b1-9317-12fabe379edf`. It returned `REVISE` on the
pre-correction candidate. Its continuity addendum reviewed
`c7a1060..b8ec320` and returned `PASS` with no blocking finding.

The isolated AGY lane used CLI `1.1.27`, model
`gemini-3.1-pro-high`, effort `high`, plan+sandbox mode and conversation
`6d51afec-5655-4fa3-9b02-2a477bcfc9ae`. Its first report returned `PASS` but
named the pre-correction candidate, so Lead does not use that report as coverage
of the correction. The continuity addendum explicitly reviewed
`c7a1060..b8ec320` and returned `PASS`, resolving all four named properties.
The temporary broad local AGY command permission was removed after each call.

Neither lane received the other lane's output before completing its own base
review. The addenda were narrow continuations over one neutral correction brief,
not a new whole-package round.

## Lead adjudication

1. **LOCAL EXECUTION GAP / CORRECTED — subject negative matrix.** The real
   PostgreSQL suite now fires active-intent, ownership, qualification,
   configuration, environment, credential-generation and Project-lifecycle
   refusals and restores the positive baseline. Lead executed the committed
   matrix against PostgreSQL 17: `1/1` pass.
2. **LOCAL EXECUTION GAP / CORRECTED — uncertainty classification.** Resolver
   `P0001` and `P0412` now propagate as uncertainty. The composed test proves
   `INDETERMINATE` through Gateway and Brain, `UNAVAILABLE` in Project and HTTP
   `503` at PRJ-11 without observation, attestation or settlement. Permanent
   absence remains limited to `42501` and `P0002`.
3. **LOCAL EXECUTION GAP / CORRECTED — partial legacy activation.** A standalone
   legacy attester input can no longer activate or downgrade the binding path.
   Full mode remains all-or-nothing; manifest-only BRN-14 context remains valid.
4. **LOCAL EXECUTION GAP / CORRECTED — Evidence envelope and routing.** The
   source record now identifies the real `PRODUCTION` environment, exact
   response keys, the `NUNOTA` primary-key limit and P7 qualification dependency.
   The packet file envelope and current roadmap/index route are corrected.
5. **LOCAL EXECUTION GAP / DEFER SAFELY — reviewer read-only filesystem.** AGY
   could not run tests that compile into a temporary directory under
   `apps/hub/` because its sandbox mounts the repository read-only. Why safe:
   the supported WSL and CI environments are writable, the tests clean their
   bounded directories, and Lead executed the exact suites successfully.
   Revisit trigger: a supported required workflow adopts a read-only checkout.
   Later owner: test-infrastructure composition; move those build roots to the
   system temporary directory without reopening P4 semantics.
6. **NO FINDING / DEFER SAFELY — narrow post-admission absence race.** Fable
   noted that `42501`/`P0002` arising after Project's earlier admission can
   remain a fail-closed 422. This does not create PASS, mutate state or violate
   the P4 uncertainty correction. Revisit in P6 when the locked journey consumes
   PRJ-11 problem semantics. Do not reopen the binding architecture.

## Deciding proof and closure

- authorized read-only Sankhya observation passed for company `1` and company
  `2`; no business rows, counts or credentials were retained;
- provider-free configured PRJ-11 composition passed `1/1` in `239.8 s` through
  real PostgreSQL 17 restricted roles and the admitted OCI Git executor;
- corrected real PostgreSQL subject matrix passed `1/1`;
- local P4 passed `92/92` with `12` exact external skips;
- local P5 prerequisite/composition passed `8/8` with one exact gated composed
  case;
- `npm ci`, `npm run verify`, `npm run repository:check:extended`, and
  `npm run r1:r1c14:native:check` passed on the clean reviewed package.

Blocker census is zero: no reproducible false PASS, false STOP, unauthorized
effect, protected-property violation or correctness-critical missing authority
survives. P4 therefore closes. This closure does not close P5, create a generic
Gateway/query surface, claim later Budget mappings or authorize R3+, RB/Mastra,
deployment, push, PR or merge. The next current part is P5: wire the admitted
server-derived read-only adapter into Connection qualification so ordinary
runtime lifecycle can create the prerequisite that the P4 composed proof seeded
directly.
