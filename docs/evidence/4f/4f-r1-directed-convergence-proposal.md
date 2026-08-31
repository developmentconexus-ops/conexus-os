# 4F(R1) — Lead directed-convergence proposal

> **Status:** `REVIEW INPUT / NOT AUTHORITY`
> **Implementation authority:** `0`

This proposal adjudicates the independent Fable and Gemini findings. Reviewers
must attack this resolution rather than repeat their first-pass review.

## 1. Proposed Global Maximum graph

Keep seven independently falsifiable boundaries, but compose the browser at
each human-meaningful owner increment instead of deferring all human proof:

```text
G0 admitted root/profile/wire (engineering-only)
→ S1 I&A + minimum shell: authenticate/bootstrap/read/sign out
→ S2 Workspace + browser: create/re-enter exact Workspace
→ R1C-14 Git pin/probe
→ S3 Project/Git + browser: NEW/EXISTING_GIT create/re-enter
→ S4 Baseline custody + browser: reload/approve/read exact injected candidate
→ S5 complete three-browser/security/accessibility hardening (engineering-only)
→ R1C-13 Mastra pin/provider/telemetry-off probe
→ S6 cognition + browser + complete R1 closure (last)
```

`S4` uses an owner-injected, canonical-schema candidate fixture through a
test-only `PLATFORM-CONTRACT` capability that is absent from Product routes and
production composition. It proves candidate/Baseline custody and interaction,
not a real R1 Product outcome before cognition. No checkpoint is deployable or
grants its successor.

Gemini's earlier-gate/three-large-slice alternative is rejected because
`R1C-13` is the accepted entry condition of the last cognition slice, and a
real Baseline outcome cannot precede the cognition operation that creates its
candidate. Fable's two-axis alternative is accepted with the fixture and
checkpoint qualifications above.

## 2. Exact WS-01/PRJ-03 database settlement

One checked-out `pg` client and one PostgreSQL transaction execute only
owner-defined command functions. The login composition role has `NOINHERIT`,
no table/sequence DML, no owner membership, no `SET ROLE`, and only database
`CONNECT`, trusted-schema `USAGE` and `EXECUTE` on the exact functions used by
its command. Each owner function is `SECURITY DEFINER`, owned by a dedicated
`NOLOGIN`, non-superuser, non-`BYPASSRLS` owner; it has fixed fully-qualified
SQL, trusted-only `search_path` with `pg_temp` last, no dynamic identifiers,
`PUBLIC` execution revoked in the same migration transaction and a bounded
return shape.

```text
WS-01 transaction
→ workspace.create_workspace(...)
→ iam.establish_workspace_creator_access(...)
→ commit exact Workspace + membership/access + project.create or nothing

PRJ-03 final transaction, only after canonical Git source verification
→ project.create_project_with_source(...)
→ iam.establish_project_creator_grant(...)
→ commit Project + sourceRevision + project.read/manage + success receipt
  or nothing
```

These are exact L7 command-composition capabilities, not a generic UnitOfWork,
Repository, CR-1 current-authority guard or new Product role/Permission. Direct
DML and every unlisted owner function remain structurally denied.

## 3. Exact PRJ-03 Git/DB recovery protocol

The Project-owned `project.operation_idempotency` fact for `PRJ-03` contains
only `operation`, `scope/account/workspace`, `idempotencyKeyDigest`,
`requestDigest`, reserved `projectId`, terminal response digest/body, timestamps
and outcome. It is an admitted operation receipt, not a generic saga or Product
success. A different request under the same key is `409`; same-key retry returns
or resumes the same reserved identity.

```text
reserve receipt/projectId in PostgreSQL
→ prepare owner-isolated bare repository in a non-disclosable staging root
→ for NEW create the exact admitted empty APP-OWNED seed plus generated/platform tree
  OR for EXISTING_GIT resolve one policy-admitted remote default ref to one OID
→ verify object/tree and create canonical branch with expected-old zero
→ atomic same-filesystem directory promotion to canonical projectId path
→ final database transaction above re-verifies canonical ref/object
→ Product settlement and terminal receipt
```

Crash outcomes are exact:

| Crash point | Visible Product | Retry/recovery |
| --- | --- | --- |
| before receipt | none | create one reservation |
| receipt before source | none | same request rebuilds staging |
| staging before promotion | none | verify and resume, or remove corrupt staging |
| promotion before DB settlement | none | same receipt adopts only matching ref/object; otherwise quarantine and fail |
| during final DB transaction | none unless commit completed | transaction rollback; retry re-verifies source |
| commit before response | complete | same receipt returns exact terminal response |

Expired nonterminal receipts/repositories may be removed only under the receipt
lock after proving no Project row or terminal response exists. A committed
Project repository is never cleanup-eligible. CAS loser or conflicting receipt
is `409` with operator retry; there is no hidden automatic Product retry.

## 4. Exact EXISTING_GIT admission/custody

R1 admits HTTPS locators only. A closed server-owned deployment catalog matches
canonical scheme/host/port/path-prefix, expected default-ref policy, TLS policy,
optional external-secret `credentialSlot`, size/time/object ceilings and
enabled state. Caller locator userinfo, fragments, non-HTTPS schemes, IP-literal
or noncatalog destinations and redirect outside the same catalog entry refuse
before remote access.

Git runs with system/global config disabled, inherited credential helpers
cleared, terminal prompting disabled and no persistent remote. A restrictive
temporary `GIT_ASKPASS` adapter reads only the matched external secret slot;
credential bytes never enter URL, argv, Git config, DB, log, Evidence or bundle,
and the adapter/secret is removed after the attempt. The exact server-resolved
remote default ref/OID is fetched into staging, verified and then becomes the
local immutable source revision. R1C-14 proves these mechanics against the
exact admitted Linux Git pin/image before `S3`.

## 5. Proof/checkpoint and stale-PASS law

- Every `S1..S4` checkpoint runs targeted unit/schema/real-PostgreSQL proof plus
  one Chromium operator journey and its exact negative controls. `S5` runs the
  complete Chromium/Firefox/WebKit, responsive, accessibility, focus, browser
  authority, headers and secret-bundle matrix. `S6` reruns all affected proof
  and the complete composed journey.
- `npm ci` is required only under a future installation grant; every executable
  implementation checkpoint then runs `npm run verify` plus its named proof.
- Each PASS records claim ID, exact subject digests, dependency-closure digests,
  executable/image/browser identities, control identity and Evidence digest.
  It remains reusable only while that complete subject/dependency digest set is
  unchanged. Any affected change invalidates and reruns the named claim; the
  final vector records the fresh/reused reason and exact digests. A stale PASS
  can never close R1.
- Migration is forward-only; production reversal is restore/forward repair,
  not a down migration. Each owner checkpoint proves role/grant/function/schema
  conformance and backup/restore for the state it introduces.
- Ordinary logs are owner-local, secret-free operational diagnostics only. No
  `obs.*`, exporter, trace or acceptance authority enters R1.
- Production R1 NEW seed has an exact empty `APP-OWNED` path set. A
  representative sentinel exists only in compiler/test subjects to prove byte
  preservation and is absent from a created Product unless the admitted input
  contains it.

## 6. Cognition gate clarification

`R1C-13` remains immediately before `S6`. It must re-pin the exact Mastra source,
lock and compatibility peer; verify source/types rather than treating current
web docs as the adopted version; prove no reachable unbounded response path;
admit one exact installation provider/model/official origin/credential slot;
set the version-proved feature-telemetry opt-out before module import; configure
no observability/exporter/storage/memory/workflow/background capability; and
prove zero analytics, AI tracing or other framework egress in the negative
probe. Real provider/credential calls remain separately operator-authorized.

Before `S6`, cognition controls are not a successful Product surface: partial
checkpoints are nondeployable, do not fake `PRJ-07/24`, and test only the routes
already realized. `S6` composes the locked cognition interactions and full
first-use/refinement/failure/re-entry journeys.

## 7. Requested directed result

### First directed-pass corrections

Fable accepted the graph as Global Maximum and returned two bounded local
findings. They are now resolved in the candidate:

1. `workspace.operation_idempotency` is named as the `WS-01` owner-local
   instance and `project.operation_idempotency` as the `PRJ-03` instance of the
   same admitted logical receipt class. `hub_ws01_command` and
   `hub_prj03_command` now have complete per-command EXECUTE censuses including
   reserve/replay, lock, terminal completion and cleanup-under-lock functions.
2. The two stale 4F roadmap-string assertions were removed from the existing
   4C finalization test. They were not replaced with current status strings and
   no 4F prose/review-status guard was added, preserving the explicit method
   prohibition. The brief/proposal/adjudication are routed in the index; the
   final objective plan is verified directly for operation/owner/gate/census
   invariants.

Review the corrected
[`implementation slice candidate`](4f-r1-implementation-slice-plan.md) as the
deciding subject.

Return exactly:

```text
CONVERGENCE = ACCEPT | REVISE
GLOBAL_MAXIMUM = CLEAR | NOT_CLEAR
MATERIAL_UNCORRECTED_FINDINGS = <integer>
```

Then list only material remaining contradictions or ambiguities, with the
smallest exact correction. Do not reopen closed Product semantics or ask for
implementation/provider execution.
