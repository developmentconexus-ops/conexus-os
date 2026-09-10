# R3 — RF-05/RF-08 exact candidate freeze

> **Status:** FROZEN IMPLEMENTATION CANDIDATE / R3 ADMITTED BY OPERATOR WAIVER
> **Base:** `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`
> **Owner decision:** accepted by operator authorization `A/A`, 2026-09-09
> **Implementation authority:** `1` (operator waiver; independent closure waived)

This freeze binds one implementation subject after the RF-05/RF-08 owner
decision and the explicit operator admission waiver. It does not install a
dependency, run a JobRun, read Sankhya, consume `subjectDigest`, publish Git,
or claim independent review closure.

## Exact candidate

```text
RF-05 access
  driver             = pg 8.23.0 (current root lock)
  query composition  = owner-local SQL; Kysely unselected
  transaction law    = one checked-out pg client per protected transaction

RF-05 migration
  source             = Project-owned exact SQL under apps/hub/migrations
  admission runner   = scripts/run-hub-migrations.mjs
  integrity authority= runner SHA-256 ledger + ordered migration census
  legacy artifact    = docs/evidence/4d/atlas.sum-legacy-019.txt (retained
                       historical Evidence only; not selected or enforced)
  external CLI       = none selected or wired
  production law     = forward-only; rehearsal and real-target conformance

RF-08 occurrence
  first-proof queue  = pg-boss 12.26.3
  historical proof   = PostgreSQL 17.10 + pg 8.22.0 + Node 24.18.0
  root qualification= PostgreSQL 17.10 + pg 8.23.0 + Node 24.20.0
  runtime custody    = schema mar; createSchema=false; migrate=false;
                       schedule=false; retryLimit=0
  vendor custody     = upstream DDL SHA-256/export surface is provenance input;
                       R3 must use a hardened Project migration wrapper, never
                       apply the raw vendor file verbatim
  topology           = existing hub_control / mar owner boundary
  queue role         = private projection; mar.job_run remains authority
  root dependency    = pg-boss 12.26.3 pinned in the root package candidate;
                       no MAR runtime is started by this checkpoint

Package-D runtime/provenance custody is exact and isolated:

~~~text
pgbossRuntime   = { schema: mar, createSchema: false, migrate: false,
                    schedule: false, retryLimit: 0 }
vendorDdlSha256 = 9b5b191f613733ae68fd43a455ce986a89e5ba4c369dc33eb148230b74a647f9 (source)
export surface   = pg-boss getConstructionPlans("mar")
fixtures         = testOnly: true; notProductDdl: true
~~~

These terms are bound to the exact Package-D `criteria.json`, `dt1p.json` and
vendor SQL paths in the custody table. The source digest is not a claim that
the raw file is safe to apply. R3 must separately pin the hardened migration
bytes, explicit `mar` owner/schema grants, privilege closure, function
security and one runner transaction envelope, then requalify the changed
composition. Any version, DDL, runtime-configuration or fixture-identity change
requires re-pin or requalification before the receipt can support an R3 decision.
```

The Package-D tuple is an isolated proof identity. If implementation consumes
the root `pg 8.23.0` or Node `24.20.0` instead, the exact tuple changes and
the Package-D result must be requalified before it is used as deciding proof.

## Protected claims and falsifiers

| Proof | Protected claim | Controlled falsifier that must turn red | Owner |
| --- | --- | --- | --- |
| `R3-P1` | Project migration/access and cursor/merge remain owner-isolated and atomic | forbidden role/store path, stale CR-1 authority, direct-DML bypass, split cursor/merge commit | Project / I&A |
| `R3-P2` | One logical occurrence is single-flight and coalesced | concurrent admissions create two owner rows, or queue suppression is reported as success | Project / MAR |
| `R3-P3` | Cancel/timeout/process loss cannot continue before quiescence | physical work continues after the owner has refused new delivery or quiescence cannot be established | MAR |
| `R3-P4` | Missing or ambiguous observations remain honest unknowns | absent cursor/source observation is converted to zero, success or a blind replay | Project / proof owner |
| `R3-P5` | Declared source/schema/mapping coverage and drift fail closed | incomplete paging, schema/mapping drift or unverified coverage advances supported truth | Project / MAR |
| `R3-P6` | Downtime admits at most one current catch-up (`3N-V18`) | restart fixture admits more than one freshness-derived current occurrence | Project / MAR |
| `R3-P7` | Read-only recovery preserves `3N-V19` | recovery path reaches an effect-capable capability with no admitted consumer | Project / Gateway |

The RF-05 transaction law is a target contract, not a green implementation
claim at this checkpoint. The R3 implementation packet must name the enforcing
mechanism (shared transaction helper or equivalent static guard) and a negative
test that fails on a pool checkout split, unguarded rollback masking or direct
owner-bypass path. The freeze checker derives every Hub source containing a
pool checkout and requires it in the custody table; the current census includes
`apps/hub/src/project/inception.ts`. The existing source envelope therefore
evaluates this falsifier against one exact, mechanically complete snapshot.
Rollback handling remains a known red baseline until the R3 negative fixture
proves that a rollback failure cannot mask the primary failure.

R3 owns these seven controlled contract/recovery proofs. Package-D's `P1..P6`
green IDs are a fixture qualification subset and do not claim `R3-P7`; the
read-only recovery proof is a later R3 controlled proof. R7 retains a
real served Release, real JobRun, live Sankhya coordinate, composed catch-up and
independent `3O-P1..P7` reconciliation. No R3 fixture may be reported as R7
Evidence.

## B02/B03 falsifier disposition

The owner decision lists B02-P1..P10 and B03-P1..P10 as the proof route for the
selected candidates. Selection acceptance is a candidate decision; none of the
rows below is claimed green by this freeze. Each row has an explicit owner and
later route so the seven R3 claims cannot hide a dropped falsifier.

| Falsifier | Current disposition | Later owner / route | Revisit trigger |
| --- | --- | --- | --- |
| B02-P1, P2, P3, P4, P8 | PENDING R3 controlled proof | Project/I&A → `R3-P1` | R3 implementation checkpoint |
| B02-P5 | PENDING RF-05 runner/conformance proof | Project/platform → `R3-P1` | R3 migration implementation |
| B02-P6 | PENDING rehearsal/classification proof | Project/platform → `R3-P1` and R7 conformance | Before R3 admission; real-target rehearsal |
| B02-P7 | DEFER SAFELY to real-target conformance | Project/platform → R7 | First authorized target or schema/privilege drift |
| B02-P9 | CANDIDATE ROUTE ACCEPTED; proof pending | Project/I&A → `R3-P1` | Query-layer or schema-authority change |
| B02-P10 | DEFER SAFELY; no Atlas/challenger selected | Project/platform | Explicit CLI adoption or incumbent integrity falsifier |
| B03-P1 | PASS controlled root tuple/config plus hardened vendor-DDL requalification; live-target proof pending | MAR/Project → RF-08 / `R3-P1` | Any version, DDL or runtime-config change |
| B03-P2, P3 | PENDING controlled co-admission/uniqueness proof | MAR → `R3-P2` | R3 implementation checkpoint |
| B03-P4 | PENDING one-current-catch-up proof | Project/MAR → `R3-P6` | R3 recovery fixture |
| B03-P5 | DEFER SAFELY to served-Release handoff | Registry/Release → R7 | First served Release / handoff proof |
| B03-P6, P7, P8 | PENDING controlled loss/retry/cancel proof | MAR → `R3-P3` / `R3-P7`; live part R7 | R3 implementation checkpoint or live worker |
| B03-P9 | PASS controlled hardened vendor schema/runtime privilege, function-security and migration-envelope proof; live-target proof pending | MAR/Project → `R3-P1` | Migration 024 and vendor conformance |
| B03-P10 | DEFER SAFELY; challenger trigger only | MAR owner | Incumbent falsifier or new consumer |

`PENDING` means the proof is required and not yet executed. `DEFER SAFELY`
means the current candidate does not exercise that surface and the named later
owner/trigger is explicit. The Package-D receipt is retained as fixture
Evidence only; its exact `mar.dt1_*` fixture tables are not the Product
`mar.job_run` identity.

## Qualified BLD-10 subject boundary

The hard gate refers only to the qualified semantic
`BLD10_PREVIEW_SUBJECT_DIGEST`: the `BuildPreview.subjectDigest` property in
`contracts/api/product/builder-paths.yaml`, backed by the
`builder.read_preview_subject` operation from migration `023`. It does not
refer to the unrelated Builder `Evidence.subjectDigest` field or the
Brain/Gateway canonical subject-digest derivations.

This candidate does not consume, compare, derive or validate
`BLD10_PREVIEW_SUBJECT_DIGEST`. The later implementation packet must prove
non-consumption by checking those exact contract/operation/table identities in
source and generated outputs; a bare search for the word `subjectDigest` is not
deciding evidence. If any R3 artifact uses the qualified BLD-10 field, the
separately admitted R1/Builder source-custody requalification is a prerequisite
and this freeze is invalidated.

The custody references to migration `023`, its contract identity and the
targeted BLD-10 boundary test are structural Evidence only. They verify that
the field and its owner boundary are named; they do not read the field as an
R3 input or make the R3 mechanism a BLD-10 consumer.

## Physical MAR status

The logical `hub_control.mar` owner boundary is accepted by the architecture.
Migration `024_mar_pg_boss_projection.sql` now creates the `mar` schema and
`mar.job_run` record in the same ordered lineage as the Hub migrations. Its
vendor object body is byte-identical to the pinned pg-boss `12.26.3` export,
while the wrapper owns the transaction envelope, roles, schema grants and
runtime privilege closure. Migration `025_mar_admission_function.sql` adds the
owner-controlled admission function without granting direct `job_run` DML to
the runtime. The bounded MAR adapter uses a same-client pg-boss transaction
projection and aborts on a null queue id. Static wrapper, adapter and runner
checks are green. The full 001–025 catalog application and restart pass on the
current root tuple, plus the Project snapshot/delta and synthetic
managed-execution falsifiers, are recorded in the controlled qualification
receipt. This freeze therefore records implementation/fixture proof, not a
Product MAR or live JobRun claim.

The future co-admission transaction is MAR-owned: it may write `mar.job_run`
and the MAR-private queue projection in one transaction. Project, Gateway and
other owners do not receive arbitrary cross-owner writes to MAR; they hand work
to the MAR capability boundary. Queue tables are provider substrate, not new
Conexus semantic records, so the closed 46-record inventory remains unchanged.

## Candidate custody

The review binds the following exact paths and hashes. Hashes are calculated
from the current worktree bytes when this file is frozen; any listed-path
change invalidates the candidate and requires a new freeze.

The candidate identity is the base commit plus these exact worktree bytes. A
single Lead/integrator owns this listed envelope during review; the open BLD-10
paths are outside the R3 implementation envelope. The aggregate digest below
is SHA-256 of the lexically sorted UTF-8 lines `path NUL sha256 NUL newline`.

| Path | SHA-256 |
| --- | --- |
| `docs/roadmap.md` | `d95d07593b0520e2c2ee2cea877a20442055931fffb37d50eaa6d221733c145d` |
| `docs/index.md` | `54dc62c0021ef7224a1283b12d89a62359fa5741a6a59a91fd5d95611ff0f3cc` |
| `docs/decisions/index.md` | `7832fc6b8985ad801eafca5d5e1e5563b826cbec4dec3a7e020fc8f750886654` |
| `docs/evidence/4d/atlas.sum-legacy-019.txt` | `3bca38fe7a0aae3e277dad659cfe9fec79f3a6c0c0127ff15341b6ed3af859ab` |
| `docs/evidence/4f/4f-r3-4d-c-selection-packet.md` | `fc7bcc768012c08147110844a4cf6f0a2580dd5f62077fd88f1345862673297f` |
| `docs/evidence/4f/4f-r3-rf05-rf08-owner-decision.md` | `fa6f0337d405d7dfae2b6916133b0ed9020e57787603b5748c7aab2d56a47d8c` |
| `docs/evidence/4f/4f-r3-admission-preparation.md` | `841a86814a4d9af8465b22fba60418ebf2d6a42222db37982cb0e1df31f329e6` |
| `docs/evidence/4d/4d-opp-b02-postgresql-migrations-cr1-study.md` | `ec363807bd2e6debbe33bd9d2a9cd27f8e54e540a2683c3ebecb878d94677f61` |
| `docs/evidence/4d/4d-opp-b03-governed-sync-mar-study.md` | `4c639b393c32e26f65326d3dad835be8f331236728c32dc3a89fbe33e5b0c802` |
| `docs/evidence/4f/4f-r3-rf05-rf08-candidate-review-brief.md` | `0e7726ca3038ffdd58277b5c623d44448d245f97f2789db36efb0bf5d72dffdb` |
| `docs/reference/managed-execution-qualification.md` | `eb81661b11d97608998ad171f77644670b34c03c82b067015bc1a7c9f443e9d8` |
| `docs/reference/data-and-persistence.md` | `a3e3fb68cc03aea5f2ff2722a7881c58662c08e049825d6b93be26c24c43e1d2` |
| `contracts/api/product/builder-paths.yaml` | `f93eb7d2468d28ae91b97017b4b0318bbbe99978644d0152c480e05af8c7fdd8` |
| `scripts/run-hub-migrations.mjs` | `35325480d7ac3d3b2cc3a4c2bdc3dd773bae6e1f7027371023e044e15c8c6c9e` |
| `scripts/check-r3-candidate-freeze.mjs` | `461eddbb67d301fe88278392914f82e3207ca091bba2ed2ca606d276c14f1ea8` |
| `apps/hub/src/platform/postgres.ts` | `deae59025b2debed44b2941573a7d6d5cbe144196934cb4be8b81d0774a21c75` |
| `apps/hub/src/connections/store.ts` | `b25e7c859575c1482101bcc84fb302f53fbf4e21ce32d7fcac11393cbacda335` |
| `apps/hub/src/brain/store.ts` | `a2f03180452759f9c68b05a775663e695c2afd3484f91376fd92bb5c504fc53c` |
| `apps/hub/src/workspace/store.ts` | `2334624210ee7457125a4d4718a066e91de0266c7a3676e5be7c76b8639631bc` |
| `apps/hub/src/project/store.ts` | `c253aa3dbc5e1cb944f422e2b5605cd7e03522f1281d4ed78879c2fc5ba6ffa6` |
| `apps/hub/src/project/binding-recovery.ts` | `f3b32157feade81420ef92c6df1ea0fb2f97ed39464661cae100201a928ee1a9` |
| `apps/hub/src/identity-access/store.ts` | `42999e7db08e79e0946bfe1649c2407a890e27395eb372860e3f9e503c7afc82` |
| `apps/hub/src/builder/store.ts` | `6fe4597fb960bbded1a0128ddcb84db103a43383886cb29e018a05250206ce8b` |
| `tests/implementation/r1-s2-postgres.test.mjs` | `530668f373ed36b9797d5e3e39ee45f7ed9050dced7077ccd241d247e59dfb83` |
| `tests/repository/r3-candidate-freeze.test.mjs` | `4384f73825166ac5d3662eb7f60b84c5cf55dcc7ff4026996b8e3bdcf4bb4481` |
| `package.json` | `6ac1359d9aa1decd00a146441c97f50a0a0a3bea6fa315308cc7ae41d80dd68d` |
| `package-lock.json` | `7331c6c4549c357eeb2038b53d1ca64033d6d0d42401472456823cc067c40600` |
| `qualification/3l/managed-execution/package.json` | `4d8065370475b3311a356c3e7dfb9f1d47fe02161d8a87d5414230292bfb7354` |
| `qualification/3l/managed-execution/package-lock.json` | `c9d9e0362cbf03d5290ff2639049fc95d03ff5df11287ae3f870775b432a4fd3` |
| `qualification/3l/managed-execution/admission/criteria.json` | `8bfb21efe952ed9d22bba89412890809c640208fba57d9f8ed6622c1a38abbad` |
| `qualification/3l/managed-execution/evidence/dt1p.json` | `5ae776c4fce3c222bc5472604c40563d3132511496ae2b8a30187eb5b423fcac` |
| `qualification/3l/managed-execution/vendor/pgboss-12.26.3-mar.sql` | `9b5b191f613733ae68fd43a455ce986a89e5ba4c369dc33eb148230b74a647f9` |
| `qualification/4f/r3-root-tuple/run.mjs` | `4133c440e3aa8783c610221ee16ea89a8b87c2abda27d60fc34e6623856ce9fa` |
| `qualification/4f/r3-root-tuple/managed-execution.mjs` | `58dbd76afe7135e83533e7a77d65458014eb939e4ca5f69eddc8f05d4c2d2b6b` |
| `scripts/conexus-review.mjs` | `876f6a793eebcfb6dc2689d36ded5c57c4b9f2ec265b1955d9ca54d81ed4e5b1` |
| `scripts/conexus-verify.mjs` | `d68dd92a1fdb563b23c3651f0098d8321ea6839f92d7beeacda1ff71062a3397` |
| `apps/hub/src/project/inception.ts` | `62c6cd508e9ed280f72d148c139920ecaed12ddd3309b843de244c106f82dd8b` |
| `apps/hub/migrations/024_mar_pg_boss_projection.sql` | `8afb8add42959c19bc5f5edc3dad73a4d511195597656dbcb9505b6e75cae735` |
| `apps/hub/migrations/025_mar_admission_function.sql` | `707852bfe0b820ea5df21aa40076dbbb62733f9ce38e8911f9a9553a8b1bc36b` |
| `apps/hub/project-migrations/001_budget_analyzer_read_model.sql` | `bc66f5303406c3c846da26ccdcf6b358d9bf7ea94bb4d675e1a476503baf2701` |
| `apps/hub/project-migrations/002_budget_analyzer_observation_gap.sql` | `0277a79dc0b21f2e17fffa04a5099ca49fc6f2aa7fe1a4bf46ed90ffe3673c5e` |
| `apps/hub/src/mar/admission.ts` | `45e66306e20ad3929076dd0ffd3ecae42fbc44421649d5a3bb00b0b1714265b5` |
| `apps/hub/src/project/read-model.ts` | `e6c517bc4ca73d594386d5a9a69f17ac9d8570264ee54a4e0cda3c19614367ae` |
| `scripts/run-project-migrations.mjs` | `268738b72083c36c4816883f25df794057caef8ccbdef889984333bb88e1f14a` |
| `tests/implementation/r3-mar-admission.test.mjs` | `54634c2dac052bd02f3a1aebb95de35a4e8ad3b9952851723a1d5982f3e391f4` |
| `tests/implementation/r3-project-read-model.test.mjs` | `c737b65fcd353deed9a64433c0ec9c0d515d4fa58f96adec8ece268e168471d3` |
| `docs/evidence/4f/4f-r3-p2-p3-owner-decision.md` | `fd20d9174e9d898ce19cc7a8750503514e2ee70b44241b32fa5da82627abff8e` |
| `docs/evidence/4f/4f-r3-p2-p3-astra-advisor-receipt.md` | `6f472696456cf0c1b33c32a36cfff4ba53409c77d13ed0199c500b27d6d68d51` |
| `docs/evidence/4f/4f-r3-p2-p3-implementation-review-brief.md` | `4aea3939356c6412115094252ddbd049b1dbc91d0835150d22b06522e6bc3533` |
| `docs/tasks/r3.md` | `dd3dfe9e835dab3081da9a039b9ef7afd23c6db27f7a601aa2658d365b75e610` |
| `tests/implementation/r3-mar-migration.test.mjs` | `aea59c6155d10173aabb7e1699911189ddf65db26d6175a044d3450a09969d5f` |
| `docs/evidence/4f/4f-r3-mar-migration-implementation-packet.md` | `a55b400e47b6121c9d7946df3403ad55c0d9418a56c207351a64f919699bf2c8` |

```text
Migration corpus: 25 files (001–025)
Migration corpus digest: `515da3cba54560ab47b3fa2bc52bb8b3c70010ee1ceb42251d60a852550f6a7f`
Project migration corpus: 2 files (001–002)
Project migration corpus digest: `4eeba270de8f5f2cc7592706e984e0f037df4423ac7e183871846dd1b8ad98a2`
Candidate manifest digest: `4349cf91ef5d29d46a649647b8c5964fa5303894f23e3f93dd1b6d8c8dabb797`
```

The reviewer must treat this file as custody Evidence, never as owner
authority. The operator admission waiver is the direct implementation
authority; the two independent review lanes were explicitly waived and are not
represented as complete.

## Admission condition after waiver

The operator admitted bounded R3 implementation directly. The current packet
must keep all listed hashes, the migration-corpus digest, the aggregate
candidate digest and the exact candidate base mechanically verified; state the
exact dependency/proof route; and prove either `subjectDigest` non-consumption
or the required source-custody requalification before consuming that semantic.
The current root-tuple qualification and named Project/P2-P3 falsifiers are
green in controlled local fixtures, including first-load drift rejection,
working-state visibility and an ambiguous-observation gap followed by full
rebaseline. P4-A is therefore the bounded Project observation-integrity route;
MAR single-flight/settlement/quiescence remains a split prerequisite until its
owner contract is exact. Dependent R3-P2/P3 closure, recovery,
served/runtime and live-target proofs remain pending, and independent
Opus/Gemini closure is waived rather than implied.
