# 4F(R1) — Approved implementation slice and execution graph

> **Status:** `CLOSED / OPERATOR APPROVED / 4G PROOF CORRECTIONS APPROVED / GLOBAL MAXIMUM`
> **Scope:** `R1 / 13 OPERATIONS / ACCOUNT → APPROVED PROJECT BASELINE`
> **Implementation, install and provider-call authority:** `0`

## 1. Outcome and chosen graph

The smallest graph is seven independently falsifiable implementation boundaries
with browser composition at every human-meaningful increment:

```text
G0 admitted root/profile/wire (engineering-only)
→ S1 I&A + shell: authenticate/bootstrap/read/sign out
→ S2 Workspace + browser: create/re-enter
→ R1C-14 Git pin/probe
→ S3 Project/Git + browser: NEW/EXISTING_GIT create/re-enter
→ S4 Baseline custody + browser: reload/approve/read injected candidate
→ S5 full three-browser/security/accessibility hardening (engineering-only)
→ R1C-13 Mastra pin/provider/telemetry-off probe
→ S6 cognition + browser + complete R1 closure (last)
```

| Boundary | Operations first realized | Owner/result |
| --- | --- | --- |
| `G0` | none; projects canonical R1 `13` | compiler/wire mechanics only |
| `S1` | `IAM-01..03` | I&A + minimum Control Plane shell |
| `S2` | `WS-01/02` | Workspace + accepted I&A first-access composition |
| `S3` | `PRJ-01/02/03` | Project + I&A first grant + owner-local GitInfra |
| `S4` | `PRJ-08/09/23` | Project candidate/Baseline custody; test-only injected candidate |
| `S5` | none | complete browser-boundary hardening |
| `S6` | `PRJ-07/24` | Project; ProjectMastra subordinate; final `13/13` |

No R2/RB/later operation, CR-1 object, Builder, Project Database, Product Agent,
effect path, Release machinery or durable Mastra state enters R1. A checkpoint
is nondeployable, proves only named claims and never grants its successor.

## 2. Shared implementation laws

### 2.1 Pins, processes and dependencies

- Every boundary consumes exact approved Foundation identities from
  `conexus.r1-foundation-pin-manifest/v1`; a future grant first revalidates every
  affected pin, lock, source, executable, image, browser and advisory.
- `R1C-14` and `R1C-13` PASS each publish Git and Mastra/peer exact identities
  into a versioned successor of that same pin-manifest class before `S3`/`S6`.
  A grant-time sweep enumerates the successor manifest, never gate prose.
- Topology remains one Hub modular monolith, one same-origin browser host,
  Keycloak, owner-isolated PostgreSQL roles/schemas, owner-local Git CLI in `S3`
  and owner-local in-process ProjectMastra in `S6`.
- Install/download/image pull requires a future explicit slice grant. No slice
  may add a package, service, record class or Permission to make proof pass.

### 2.2 Wire, persistence and exact role law

- The 4B OpenAPI 3.1 sources in `contracts/api/product/` are canonical;
  generated DTOs/routes/clients only project them.
- PostgreSQL `17.10`, `pg 8.23.0` and Atlas Community `1.3.0` remain admitted.
  SQL is ordered/checksummed/forward-only; production reversal is restore plus
  forward repair, never a down migration.
- Each table belongs to one owner schema. No common application schema, generic
  Repository, broad cross-owner SQL or generic UnitOfWork exists.
- `hub_ws01_command` and `hub_prj03_command` are separate DB command login roles,
  not Product roles. Each is `NOINHERIT`, has no table/sequence DML, owner
  membership, `SET ROLE`, superuser or `BYPASSRLS`, and only `CONNECT`, trusted
  schema `USAGE` and `EXECUTE` on its enumerated functions.
- Owner command functions are `SECURITY DEFINER`, owned by exact `NOLOGIN`,
  non-superuser/non-`BYPASSRLS` owners, with fully qualified static SQL, fixed
  trusted-only `search_path` and `pg_temp` last, bounded returns, and `PUBLIC`
  execution revoked in the same migration transaction.
- Conformance denies every unlisted function, direct DML, role assumption,
  temp/search-path shadow and cross-owner read. This is exact L7 composition,
  not the deferred R6 CR-1 guard.

### 2.3 Idempotency and settlement law

`operation_idempotency` is one admitted logical class instantiated only in the
operation owner schema: `workspace.operation_idempotency` owns `WS-01` and
`project.operation_idempotency` owns `PRJ-03`. Rows contain only operation,
scope/account/workspace, key digest, request digest, reserved result identity,
outcome, terminal response digest/body and timestamps; plaintext keys are absent.

`WS-01` uses one checked-out client and transaction:

```text
workspace.reserve_or_replay_create_workspace
→ workspace.create_workspace
→ iam.establish_workspace_creator_access
→ workspace.complete_create_workspace_receipt
→ commit Workspace + membership/access + project.create + receipt, or nothing
```

`hub_ws01_command` executes only those functions. Replay returns the exact
terminal result; changed request under the same key is `409`.

`hub_prj03_command` executes only:

```text
project.reserve_or_replay_create_project
project.lock_create_project_receipt
project.create_project_with_source
iam.establish_project_creator_grant
project.complete_create_project_receipt
project.claim_abandoned_create_project_attempt
```

The first reserves/replays before Git; the middle four form the final DB
settlement; the last is cleanup-only under receipt lock after proving no Project
or terminal response. Git adopt/quarantine consumes the locked receipt identity
and gains no DB DML. This is an operation receipt, not a generic saga.

### 2.4 Ownership mutations

| Class | Allowed | Forbidden |
| --- | --- | --- |
| `GENERATED` | replace exact compiler output from canonical input after prior-digest validation | hand edit, parallel DTO/route/client, overwrite after drift |
| `PLATFORM-CONTRACT` | admitted hosts/ports/adapters, SQL/functions/roles, security/config, test-only seams and conformance gates | Product weakening, generic executor/repository, dormant later machinery |
| `APP-OWNED` | production NEW starts with exact empty APP-OWNED path set; tests may inject one preservation sentinel | platform overwrite, implicit merge/delete, R1 business feature/schema |

Every affected tree emits exact OwnershipManifest/GenerationReceipt subjects.
A failed boundary leaves the last admitted tree/receipt active.

### 2.5 Incremental proof and stale-PASS law

- `S1..S4` each run targeted unit/schema/real-PostgreSQL proof and one Chromium
  operator journey with exact negatives. `S5` runs full Chromium/Firefox/WebKit
  responsive/accessibility/focus/security proof. `S6` reruns every affected
  claim and the complete journey.
- Under a future install grant, every checkpoint runs `npm ci`, `npm run verify`
  and named proof. A RED/non-firing control blocks its exact claim; no averaging.
- Every PASS records claim ID, subject and dependency-closure digests,
  executable/image/browser identities, firing-control identity and Evidence
  digest. Reuse is valid only while the complete set is unchanged. An affected
  change reruns that claim; final R1 records fresh/reused reason and digests.
- Each persistence checkpoint proves schema/function/role/grant conformance and
  backup/restore. Secret-free owner logs are diagnostics only; no `obs.*`,
  exporter, trace or acceptance authority is admitted.
- Objective invariant tests are admitted. Prose-status, reviewer-ceremony and
  historical-status guards are forbidden.

External method research supports small batches, short feedback, continuous
real-integration testing and named architectural fitness functions. It informs
method only; accepted Conexus owners decide semantics.

## 3. `G0` — root, profile compiler and exact R1 projection

**Prerequisites/dependencies.** 4A–4E(R1) closed; exact Foundation Node/npm/
Linux, parser/Ajv, canonicalization, TypeScript/Biome, Redocly and compiler pins.
Git and Mastra remain outside `G0`.

**Schemas/process/mutations.** Materialize profile, input-set,
OwnershipManifest, GenerationPlan, GenerationReceipt and GenerationAttempt.
Compile isolated staged trees, normalize/digest path/class/source/output, preview
and atomically admit/refuse. `GENERATED` projects exactly 13 R1 operations.
`PLATFORM-CONTRACT` owns compiler/apply ports, sealed validator and root gates.
Production `APP-OWNED` seed is empty. No Product table/listener.

**Proof/completion/stop.** Prove `R1C-01..05`, applicable `09..12`,
`SCF-01..06/09..11`, `13↔13`, malformed input, two clean reproductions,
drift/overlap/transition/app-overwrite refusal and RED fixture per gate. Complete
with one reproducible admitted tree/manifest/receipt and no later route. Stop on
floating pin, ambiguity, parallel wire authority or non-firing control.

## 4. `S1` — I&A plus minimum shell

**Operations/result.** `IAM-03`: only configured issuer/subject provisions one
Account; ordinary mapping/session then derives the sole transient
`platform_operator`. `IAM-01`: current Account/disclosable summaries. `IAM-02`:
invalidate the exact opaque Conexus session, not global Keycloak logout.

**Prerequisites/dependencies.** `G0`; admitted Keycloak/openid-client/Fastify/
PostgreSQL/pg/Atlas and React/Vite/TanStack/Playwright/browser pins.

**Schemas/process/mutations.** I&A owns Account, `iam.session`, one-shot
bootstrap and owner idempotency facts. Verified OIDC → Account → opaque session
→ current authorization each request. `GENERATED` consumes IAM routes/client.
`PLATFORM-CONTRACT` adds ports, callback/cookie/CSRF/origin/headers/secret file
and neutral same-origin shell. No APP mutation.

**Proof/completion/stop.** Real Keycloak/PostgreSQL + Chromium prove `R1C-06`,
I&A `R1C-08` and authenticate/bootstrap/read/sign-out/re-entry. Wrong issuer/
audience/signature/state/nonce/PKCE/redirect/subject, repeat bootstrap,
Keycloak-role authority, expired/revoked session, CSRF/origin and secret leak
fire. Complete at restart-safe IAM-01..03. Stop on public signup, durable or
transferable operator, browser/provider-token authority, new principal/
Permission/record or global logout.

## 5. `S2` — Workspace plus exact first authority

**Operations/result.** `WS-01` creates the Workspace and atomically gives its
creator exactly membership/access plus `project.create`; no `workspace.manage`
or all-Project access. `WS-02` discloses current identity/name.

**Prerequisites/dependencies.** `S1`; current Account/session/operator.

**Schemas/process/mutations.** Workspace owns identity/name/lifecycle and
`workspace.operation_idempotency`; I&A owns membership/access/project.create.
Use §2.3's four functions/one transaction. `GENERATED` consumes WS routes/client.
`PLATFORM-CONTRACT` adds Workspace port, functions/migrations and create/re-enter
UI. No APP mutation.

**Proof/completion/stop.** Real PostgreSQL + Chromium prove absent operator,
wrong account, same-key replay, changed-request `409`, cross-Workspace read,
failure at every boundary and immediate creator re-entry. Complete at restart-
safe WS-01/02 and exact authority delta. Stop on broad SQL, generic composition,
new role/Permission, inferred admin or exposed orphan.

## 6. Entry gate — `R1C-14 GIT_SOURCE_CUSTODY`

Immediately before `S3`, select/prove exact Linux Git executable/source/
provenance/image; `2.55.0` is only the observed candidate. Probe per-Project bare
isolation, NEW/EXISTING_GIT, immutable commit, expected-old-zero `update-ref`
CAS/loser, credential/protocol/destination denial, and complete bundle create/
verify/same-ID restore. No Git implementation starts before PASS.

## 7. `S3` — Project, Git custody and browser

**Operations/result.** `PRJ-03` under exact Workspace `project.create` settles
Project identity/name, one direct creator grant with only `project.read/manage`,
and one immutable `sourceRevision`. `PRJ-01/02` disclose only current summaries/
Project details.

**Prerequisites/dependencies.** `S2`, `G0` profile/compiler and passing `R1C-14`.

**Schemas/process/mutations.** Project owns identity/name/source mode/revision
and `project.operation_idempotency`; I&A owns `account_project_grant`. NEW stages
exact generated/platform bytes and empty APP set. EXISTING_GIT admits HTTPS only
through a closed deployment `GitImportAdmissionCatalog`: canonical scheme/host/
port/path-prefix, default-ref policy, TLS policy, optional external-secret slot,
size/time/object ceilings and enabled. Reject userinfo, fragment, non-HTTPS, IP
literal, noncatalog destination or cross-entry redirect before access.

Git disables system/global config and inherited helpers, terminal prompts,
persistent remotes and redirects (`-c http.followRedirects=false`). A restrictive temporary `GIT_ASKPASS` reads only the matched
secret slot; bytes never enter URL/argv/config/DB/log/Evidence/bundle. Server
resolves/fetches default ref to one OID in staging, verifies it and creates the
canonical ref with expected-old zero.

```text
reserve/replay receipt + projectId
→ prepare non-disclosable staging bare repository
→ verify NEW/import tree and expected-old-zero ref
→ atomic same-filesystem promotion to canonical projectId path
→ lock receipt + reverify canonical ref/object
→ create Project/source + I&A grant + terminal receipt in one transaction
→ Product response
```

| Crash | Visible | Recovery |
| --- | --- | --- |
| before receipt | none | reserve once |
| receipt before source | none | same request rebuilds |
| staging before promotion | none | resume verified bytes or remove corrupt staging |
| promotion before settlement | none | adopt only matching receipt/ref/object; else quarantine/fail |
| final transaction | none unless committed | rollback; retry reverifies |
| commit before response | complete | replay terminal response |

Cleanup uses only `claim_abandoned_create_project_attempt`, proving under receipt
lock no Project/terminal result before removing expired orphan. Committed Project
is never eligible. It is invoked only on same-key recovery and as a bounded
opportunistic scan of at most 16 oldest expired receipts before a PRJ-03
reservation; no scheduler/background task exists and cleanup failure blocks
that intake rather than hiding unknown state. Receipt conflict/CAS loser is
`409`; no hidden retry.
`GENERATED` consumes PRJ-01/02/03/scaffold. `PLATFORM-CONTRACT` owns DB functions,
GitInfra/catalog/secret/root/cleanup/bundle mechanics. APP bytes are preserved.

**Proof/completion/stop.** Real PostgreSQL/Git + Chromium prove `R1C-14`, affected
`04/08/12`, `SCF-01..06`, both source modes, re-entry, every crash row,
traversal/symlink/case/path escape, CAS, missing/mutable object/ref, inherited
credential/config, a redirect canary proving Git never follows it, forbidden
destination, ceilings and corrupt bundle.
Complete with one revision, exact grant and same-ID restore for both modes. Stop
on forge/service, external canonical authority, generic fetch/repository CRUD,
Git Product role, multi-host custody or unclosed recovery.

## 8. `S4` — candidate/Baseline custody plus browser

**Operations/result.** `PRJ-23` reloads immutable candidate by digest; `PRJ-09`
approves the exact reviewed current digest under `project.manage`; `PRJ-08` reads
approved Baseline pinned to source/digest.

**Prerequisites/dependencies.** `S3`; no model/provider.

**Schemas/process/mutations.** Project owns immutable candidate bytes/digest/
source/provenance, approved pointer/revision and decision/idempotency facts. A
canonical-schema candidate enters only through an owner test
`PLATFORM-CONTRACT` capability absent from Product routes and production. It
proves custody/UI, not a real R1 outcome or fake PRJ-07. `GENERATED` consumes
PRJ-08/09/23. APP is read-only.

**Proof/completion/stop.** Real PostgreSQL + Chromium prove fixture injection,
reload/approve/read/re-entry and wrong Project/digest, byte mutation, stale/
concurrent decision, narrowed authority and process loss. Complete only as a
nondeployable store/UI checkpoint. The same injection capability resolved from
the production composition must be absent/refuse. Stop on browser/session/model authority,
in-place mutation, approval without digest, production fixture route or new
owner/workflow.

## 9. `S5` — complete browser hardening

**Scope/dependencies.** No operation/table. Requires `S1..S4` and browser pins.
Cognition remains unsuccessful/unconsumed; partial checkpoints are not deployed.

**Mutations/proof.** `GENERATED` transport/query stays exact.
`PLATFORM-CONTRACT` completes locked W-01/T-01/GF-01 shell, four state classes
and P13 wide/narrow structure. Run full Chromium/Firefox/WebKit responsive,
focus, accessibility, reduced-motion, headers, secret bundle and forged URL/
cache/local-storage/coordinate/session/authority/double-command matrix. No APP
mutation/review marker. Complete when all realized human journeys use only
server truth. Stop on client authorization, handwritten DTO, global store,
generic assistant, Product-app scope or P13 regression.

## 10. Entry gate — `R1C-13 PROJECT_COGNITION`

Immediately before `S6` and before root dependency/provider call:

1. repin exact safe stable `@mastra/core` source/lock and peer, or prove bounded
   response; historical `1.63.2` is not executable authority while its reachable
   2 GiB response path remains;
2. repeat integrity/signature/attestation/script/license/source/tag/tree/advisory
   admission and malicious-pin controls against adopted bytes/types;
3. admit one installation provider/model entry with exact key/model/official
   origin/credential slot/capabilities/enabled; registry grants nothing and no
   fallback/mutable alias exists;
4. prove native tools + strict output and exact response ceilings;
5. apply the adopted-version telemetry opt-out before import; configure no
   observability/exporter/storage/memory/workflow/background capability; a
   enabled instrumented network observation records zero non-admitted DNS/socket/
   HTTP attempts, while a synthetic unauthorized-egress canary proves the
   observer fires; disabled networking alone is not proof. A separately
   authorized real-provider case may reach only the exact admitted origin;
6. obtain separate operator authority before credential or real provider call.

Current web docs are research, not pin authority. Adopted source/types and the
gate decide configuration. Applying the Mastra skill caused this explicit
version-source and zero-egress requirement.

## 11. `S6` — cognition, browser and complete R1 closure — last

**Operations/result.** `PRJ-07` resolves current authority/source/policy and
read-only tools; bounded stateless `ProjectInceptionAgent` returns an untrusted
strict proposal; Project revalidates and alone stores candidate. `PRJ-24` binds
current candidate/policy; one-step tool-free `BaselineExplanationAgent` returns
read-only answer/provenance; Project revalidates and never mutates/approves.

**Prerequisites/dependencies.** All prior boundaries + passing `R1C-13`. One
ProjectMastra instance has only these agents: no workers, notifications,
background tasks, scheduler, storage, memory, workflow, scorer, exporter,
workspace, subagent, MCP/A2A or extra provider SDK. Catalog is deployment config;
policy references one opaque admission. External restrictive secret file flows
only to exact server slot. No framework table/run/thread.

```text
ProjectInceptionAgent: steps 4; tool calls 3; concurrency 1; retries 0;
  output 8192; total/step 180000/60000 ms; no memory/fallback; strict schema
BaselineExplanationAgent: steps 1; tools {}; toolChoice none; retries 0;
  output 2048; total/step 45000/45000 ms; no memory/fallback; strict schema
```

`GENERATED` consumes PRJ-07/24. `PLATFORM-CONTRACT` adds ProjectMastra port,
catalog/secret/profiles, owner admission/late guards and locked cognition UI.
APP source is read-only.

`ProjectInceptionAgent` has exactly two server-built tools; `maxToolCalls=3` is
a call budget, not a requirement for three tool kinds:

```text
listProjectSourceSnapshotPaths({})
→ complete sorted { path, ownershipClass, mediaType, byteLength, digest }[]
  for the invocation-bound sourceRevision, or SOURCE_UNSUPPORTED before model

readProjectSourceSnapshotBatch({ paths: string[1..32] })
→ exact { path, digest, utf8Bytes }[] for listed regular UTF-8 files only,
  total response <= 262144 bytes; unlisted, stale, binary, symlink, traversal,
  oversize or substituted revision refuses
```

Both close over the invocation-local immutable source capability; neither input
contains Project/revision/URL/filesystem/credential authority. Direct Project,
profile, ownership manifest, caller intent and optional prior-candidate feedback
are server-built invocation context, not tools. Tool outputs and exact read-set
digests enter proposal provenance; the owner rechecks them before settlement.

**Proof/completion/stop.** Fake-model controls precede separately authorized
real-provider cases. Unknown/disabled/raw/mutable model, credential/origin leak,
tool/step/retry/output/time/concurrency overflow, memory/fallback, malformed/
oversized/refused/failed response, stale authority/candidate/source, late output
and any egress deny/remain explicit.

Final completion requires fresh-or-digest-valid `R1C-01..14`, `13↔13`, no later
route, full first-use/refinement/honest-failure/re-entry journeys, representative
clean regeneration preserving test APP sentinel, exact schema/role/function/
record/process census, same-revision Git restore, no secret/runtime history in
tree/DB/receipt/bundle/Evidence, green `npm ci`, `npm run verify` and named tests.
Stop on unsafe pin, incompatible provider, durable cognition state, new process/
runtime, Mastra identity becoming Product truth, fallback, unbounded resource,
any FAIL/NOT_PROVEN/INCONCLUSIVE or owner contradiction. No slice follows `S6`.

## 12. Alternatives and grant boundary

| Alternative | Disposition |
| --- | --- |
| one 13-operation slice | reject: hides owner/Git/cognition failures |
| one operation per slice | reject: duplicates inseparable transactions |
| original horizontal owners then browser | reject: defers human falsification |
| three large vertical slices/both gates early | reject: weak gate locality and falsely implies real Baseline before cognition |
| cognition before custody | reject: model mechanics shape owner truth |
| chosen two-axis seven-boundary graph | adopt: smallest separable invariants plus incremental operator proof |

```text
operator approves 4F → 4G adversarial readiness → zero/adjudicated findings
→ explicit tranche implementation grant
→ bounded G0/S1/S2/R1C-14/S3/S4/S5/R1C-13/S6 execution
```

Approval closes only planning 4F and opens only 4G. It authorizes no
implementation, install, provider call, push, PR or merge.

## 13. Operator decision

```text
4F(R1) = APPROVED
GLOBAL_MAXIMUM = APPROVED
NEXT = 4G(R1) ADVERSARIAL IMPLEMENTATION READINESS
PRODUCT_IMPLEMENTATION_AUTHORITY = 0
```
