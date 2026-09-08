# RB — bounded correction and Finding resolution stage code packet

Status: `PR #69 / TARGETED + LIVE + LINUX FLOOR + OBJECTIVE CI GREEN / GPT-6 ASTRA REVIEW CLEAR / MERGE OPERATOR-GATED`

## Observable outcome and invariant

When independent verification rejects the first exact candidate, Conexus may
perform one serial correction inside the same durable Change. The correction
starts from that rejected candidate, preserves the original Change base and
Finding, produces a second exact candidate, and receives a fresh independent
verification. An eligible reviewer may close the original Finding only with
current-candidate PASS Evidence for the same assertion; Builder then recomputes
acceptance from owner state.

```text
Change base A -> failed candidate B -> corrected candidate C

Evidence about B          -X-> closes Finding against C
worker/verifier narration -X-> closes Finding or accepts Change
late/replaced output      -X-> settles current work

current C + current PASS Evidence + exact assertion + reviewer eligibility
+ no remaining open Finding + current build authority
-> Builder-owned acceptance
```

## Exact envelope

- Preserve one durable Change, its original Baseline/source identity, Plan,
  contract assertion, first failed Finding and all immutable Evidence.
- Admit at most one correction WorkUnit in this increment. Its coding ActorRun
  is serial and starts from the current rejected candidate in a fresh controlled
  E2B sandbox. Its commit must be the direct child of that candidate.
- Keep the cumulative user diff anchored at the original Change base while each
  WorkUnit records its own parent/result lineage.
- Run a fresh independent verifier against the corrected exact candidate.
- Realize `BLD-13` with optimistic Finding revision and explicit resolution
  Evidence IDs. Builder validates Project/Change/assertion/current-candidate
  scope and recomputes acceptance transactionally.
- Show correction progress, both execution units, retained Findings/Evidence and
  the corrected cumulative diff in the existing Project Build experience.

## RED falsifiers

1. a second writer can become active for the Change;
2. more than one correction can be admitted;
3. correction starts from the original base instead of the failed candidate;
4. a non-child result or raced Git ref update replaces the current candidate;
5. Evidence from the rejected/foreign candidate closes the Finding;
6. stale Finding revision, stale reviewer authority or stale build authority
   closes the Finding or creates acceptance;
7. late first-attempt output settles the correction;
8. acceptance exists while any Finding remains open;
9. original failed Evidence/Finding or either WorkUnit disappears from reads;
10. the Product hides correction/result state or exposes runtime machinery as
    its primary interaction.

## Completion and non-goals

Complete when the migration, orchestration, Git custody, API and Project Build
path prove the nominal correction plus the critical refusal controls on real
PostgreSQL/Git, the applicable Linux candidate floor is green, and independent
closure review has no unresolved material finding.

This packet does not add unlimited retries, concurrent writers, non-`DIRECT`
planning, source tree/file, Preview, contextual write interaction, Product
Agent operations, runtime tournaments, generic eval/telemetry, R3, Release or
deployment. Reopen only on a named material falsifier.

## Candidate Evidence

- PostgreSQL 17 applies migrations `001..021` atomically and proves the nominal
  A→B→C path, exact two-WorkUnit projection, stale/foreign Evidence refusal,
  stale Finding revision refusal, Baseline recheck, all-Findings closure before
  acceptance, correction recovery and late-result no-op.
- Local OCI Git custody proves an atomic canonical Change-ref advance, cumulative
  A→C diff, direct B→C parentage, correction of a path introduced in B, protected
  original-path refusal and stale-ref refusal.
- Chromium proves the ordinary Project Build journey through failed result,
  corrected same-state projection refresh, current Evidence, explicit resolution
  confirmation and corrected diff without requiring observation of intermediate
  backend states.
- The normal Sonnet 5 Chromium→HTTP→PostgreSQL→Git→Mastra→E2B writer/verifier
  journey remains GREEN in `170.7 s` after migration `021` admission.
- A live Sonnet 5 Mastra/E2B correction replay is GREEN in `25.2 s` using the
  production-shaped `refs/conexus/changes/<changeId>` bundle: fresh sandbox,
  exact rejected parent, one child commit and only the required file mutation.
- The bounded GPT-6 Astra adversarial review found six material issues during
  implementation; all were corrected and its final disposition is `CLEAR`.
- The clean candidate floor is GREEN: `npm ci`, Chromium installation,
  `npm run verify`, and `npm run r1:r1c14:native:check` (`31/31`).
- PR #69 Verify run `34278003622` is GREEN on candidate
  `0c45c0350db44922767e967cce56a886368462e5`.
