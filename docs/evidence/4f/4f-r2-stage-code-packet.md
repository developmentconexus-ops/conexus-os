# 4F(R2) — bounded vertical stage code packet

> **Current status and exact next action:** owned only by
> [`docs/roadmap.md`](../../roadmap.md)
> **Operator decision:** `2026-09-04 / Autorizado`
> **P0 commit decision:** `2026-09-04 / Autorizo`
> **P1 decision:** `2026-09-04 / Aprovado`
> **Continuation decision:** `2026-09-04 / Continue autonomously through P7;
> stop only for ambiguity, a Global-Maximum improvement or a material doubt`
> **P1 key-mode decision:** `2026-09-04 / accept owner-only 0400 + 0600`
> **P4 authority decision:** `2026-09-04 / exact Project creator receives
> independently stored, independently revocable Project-scoped brain.bind and
> connection.use, including one-time backfill`
> **Scope:** `R2 / 20 OPERATIONS / BRAIN + CONNECTIONS + PROJECT BINDINGS + READ-ONLY GATEWAY`
> **Prerequisite:** `R1 13/13 INTEGRATED / RC-01 CLOSED / POST-MERGE VERIFY GREEN`
> **Execution grant:** P1–P7 implementation, local commits and exact admitted
> non-production proof inside this packet; no production effect, push, PR or merge
> **First measurable outcome:** exact canonical projection of the 20 R2
> operations and their no-later-operation guard

## 1. Protected vertical outcome

R2 ends with one operator-usable Control Plane path that can:

```text
inspect one canonical minimal Workspace Brain revision
→ bind that exact immutable revision to the current Project
→ configure one exact Sankhya Connection revision without secret read-back
→ qualify the exact revision + credential generation + environment + company
→ bind that exact qualified revision to the Project
→ resolve one read-only Gateway capability only from the server-owned binding
```

The target invariant is:

> A current authorized Project can adopt exact canonical Brain meaning and one
> exact qualified Sankhya source without mutable-latest inheritance, secret
> disclosure, caller-selected egress, arbitrary SQL, external writes or a new
> semantic owner.

R2 is enabling foundation immediately consumed by the already accepted `RB`
and `R3`; it does not claim that the Budget Analyzer, governed sync, read model,
registered Queries, Published Application or live-source reconciliation exists.

## 2. Frozen operation and owner census

Exactly these 20 canonical operations become reachable:

```text
Project
  PRJ-10 GetProjectBrainBinding
  PRJ-11 SetProjectBrainBinding
  PRJ-12 ClearProjectBrainBinding
  PRJ-13 ListProjectConnectionBindings
  PRJ-14 SetProjectConnectionBinding
  PRJ-15 RemoveProjectConnectionBinding

Brain / Registry projection
  BRN-01 GetWorkspaceBrain
  BRN-02 ListBrainRevisions
  BRN-03 GetBrainRevision
  BRN-10 GetBrainHealth
  BRN-14 GetProjectBrainContext

Connections / platform-pack projection
  CON-01 ListConnectorDefinitions
  CON-02 GetConnectorDefinition
  CON-03 ListConnections
  CON-04 GetConnection
  CON-05 CreateConnection
  CON-06 ReviseConnection
  CON-07 SetConnectionCredential
  CON-08 QualifyConnection
  CON-09 GetConnectionQualification
```

The canonical OpenAPI and operation ledger retain all DTO, carrier, Permission,
ingress and `Problem` meaning. Generated R2 code may project them but may not
replace or widen them. `GW-01/02`, `BRN-04..09`, `BRN-12/13`, `PRJ-18/19/25..28`,
`RB`, `R3+` and every Product Agent/effect operation remain absent.

## 3. Frozen protected claims and blocker census

Only violation of one of these claims blocks current R2 implementation:

1. `R2_EXACT_20` — exactly the 20 operations above are projected and no later
   operation or generic dispatcher becomes reachable.
2. `BRAIN_SOURCE_INDEPENDENT` — the canonical Workspace Brain source is an
   exact Git revision under a Brain-owned root physically and logically
   distinct from every Project Git root.
3. `IMMUTABLE_EXPLICIT_ADOPTION` — `BrainRevision` is the semantic view of one
   exact immutable Registry revision; publication/update never moves a Project
   binding without `PRJ-11` and its current-state/conformance checks.
4. `BRAIN_HEALTH_FAIL_CLOSED` — `UNVERIFIED`, `VALID`, `SUSPECT`, `INVALID` and
   `CHECK_ERROR` remain distinct; critical invalid/suspect numeric meaning is
   not projected as usable context.
5. `EXACT_PROJECT_BINDINGS` — Project owns binding intent; a binding records
   exact immutable revision/environment identities and never provider/latest,
   same-Workspace proximity or browser choice as adoption.
6. `CONNECTION_CURRENTNESS` — Connections owns logical Connection, immutable
   revision, credential generation and qualification basis; configured,
   qualified, bound and healthy remain distinct.
7. `SECRET_LAST_MILE_ONLY` — plaintext exists only at write-only trusted
   administration ingress and Gateway last-mile use; it never enters a read
   response, browser state, Git, Project DB, log, Problem, receipt or Evidence.
8. `SERVER_DERIVED_READ_ONLY_EGRESS` — Gateway resolves environment, origin,
   company, operation, Connection revision and credential server-side; caller
   URL, endpoint, service, credential, SQL and write method are impossible.
9. `OWNER_ISOLATION` — Registry, Brain, Connections and Project retain separate
   modules/capabilities and owner storage; cross-owner semantic pins remain
   Tier-3 references unless already allowed by the fixed Tier-2 census.
10. `HONEST_PROOF_CLASS` — local stand-ins prove only their contract. No fixture,
    mock or documentation check may claim live Sankhya qualification or real
    Z2→Z5 egress.
11. `R1_PRESERVED` — all integrated R1 operations, receipts, Git/OCI custody,
    cognition and browser behavior remain current and unchanged except through
    an explicitly admitted successor transition.

Current external blocker census after the authorized P4 source proof:

```text
normal Connection qualification wiring
  = P5-owned closed selection of the admitted production response schema
  + local controlled HTTP proof only

live Connection qualification/egress proof
  = P7-owned exact authority, recovery and source-safe proof window

provider response/token schema
  = PROVEN only for the exact authorized PRODUCTION auth/company/Gateway shapes
  + companies 1 and 2 + the fixed P4 aggregate; no generic provider contract
```

This no longer blocks P4 source observation or production composition. P5 owns
wiring the already admitted response at the normal Connection-qualification
seam and proving it against a controlled local HTTP server. P7 still owns any
new real-provider qualification execution and whole-R2 live closure. The
composed P4 proof seeds the already-required trusted qualification row directly
and claims neither successor behavior.

## 4. Exact physical selection for RF-06

### 4.1 Selected transport

`CURRENT STRUCTURE CONFIRMED`: use the native `fetch` supplied by the exact
repository Node `24.20.0` pin. Add no HTTP, OAuth or Sankhya SDK dependency.

Alternatives were rejected proportionally:

- an explicit `undici`/HTTP dependency duplicates the admitted Node transport
  without a current missing behavior;
- a generic OAuth client adds no value to the fixed Client Credentials form plus
  provider-specific `X-Token` boundary;
- no current official Sankhya Node SDK is required or evidenced;
- `node-oracledb` and direct Oracle remain rejected because Sankhya Gateway/API,
  not its backing database, is the accepted provider boundary.

Reopen only if exact provider Evidence shows native fetch cannot preserve a
required protocol, TLS, timeout, response-stream or proxy property.

### 4.2 Exact connector definition

The first connector is a versioned platform-pack definition:

```text
connectorDefinitionId = sankhya-om
connectorVersion      = 1.0.0
configuration         = { environment: SANDBOX | PRODUCTION, companyCode: positive integer }
credential input      = { clientId, clientSecret, xToken }
```

Origins are code-owned constants, never configuration or caller input:

```text
SANDBOX    → https://api.sandbox.sankhya.com.br
PRODUCTION → https://api.sankhya.com.br
```

Any R2 live proof requires a separate exact grant for its environment, company
and proof task. The currently admitted response schema covers only the
operator-authorized installation's `PRODUCTION` companies `1` and `2`;
`SANDBOX` is not admitted by inference. Representing either origin performs no
provider call and grants no production activation.

### 4.3 Exact authentication and qualification capability

Authentication is fixed to:

```text
POST {origin}/authenticate
Content-Type: application/x-www-form-urlencoded
X-Token: <last-mile secret>
body: grant_type=client_credentials + client_id + client_secret
```

The returned bearer exists in memory only for the bounded call and is never
cached durably. The only R2 qualification capability is:

```text
sankhya.company.read.v1
→ GET {origin}/v1/empresas/{serverResolvedCompanyCode}
→ Authorization: Bearer <memory-only token>
```

No redirect is followed across an origin boundary. Request timeout, response
bytes and JSON depth are bounded. Only the exact expected 2xx schema can qualify;
auth/provider/shape/timeout failures settle an owner-safe qualification result.
The exact token and company response shapes remain a live-probe entry condition;
implementation must not accept multiple guessed aliases as convenience.

Current official Evidence checked on `2026-09-04`:

- <https://developer.sankhya.com.br/reference/guia-integracao>
- <https://developer.sankhya.com.br/reference/post_authenticate>
- <https://developer.sankhya.com.br/reference/requisi%C3%A7%C3%B5es-via-gateway>
- <https://developer.sankhya.com.br/reference/get_v1-empresas-codigoempresa>
- <https://developer.sankhya.com.br/reference/camada-de-autoriza%C3%A7%C3%A3o-para-api>

### 4.4 Credential backend

The first-installation mechanism is a narrow encrypted file backend using Node
`crypto` AES-256-GCM with a unique 96-bit random nonce, one exact externally
configured key generation, connection/generation-bound authenticated data,
mode-`0600` atomic files beneath one validated non-symlink credential root and a
separately custodied owner-only key file. The key file may be `0400` or `0600`;
owner execute and every group/other bit are refused. Connections stores only
logical presence/generation; the backend owns ciphertext mechanics; Gateway
alone can materialize the exact current generation.

An orphan ciphertext written before a failed Connections settlement is not
visible and is safe for bounded later cleanup. A logical generation is never
advanced before its ciphertext is durable. Missing/corrupt/unsupported key or
ciphertext state fails closed. Backup custody for ciphertext and root/recovery
key remains separate. A future external secret manager is a replaceable backend,
not a reason to create a generic Secret Product owner now.

P3 owns the exact recovery decision for an orphan ciphertext left between
durable publication and Connections settlement. It must select a non-dead-end
generation/reconciliation rule and prove crash recovery without weakening
immutable generation coordinates; P1 deliberately exposes no delete/list
capability before that logical lifecycle exists.

## 5. Data and ownership boundary

R2 may instantiate only already accepted record classes:

```text
reg: artifact / artifact_revision
brn: health / binding_validation
con: connection / connection_revision / connection_qualification
prj: brain_binding / connection_binding
```

`ConnectorDefinition` is an immutable platform-pack projection, not a table.
Credential ciphertext is backend mechanics, not a new Product record class.
No `gw.effect_attempt`, idempotency claim, budget counter, Project DB table,
Brain proposal/discovery, Release, MAR, PAR, OBS or attachment state is admitted.

The already accepted Tier-2 FKs may enforce only `con.connection` owner scope to
Workspace/Project and Brain Registry artifact containment. Project→Brain and
Project→Connection/revision/qualification references remain Tier-3 exact
semantic identities and are revalidated at their control points.

Binding declarations are canonical Project-owned source under the existing
Project Git custody and have exact Hub operational projections. Same-owner
source/DB settlement reuses the existing Project recovery discipline: source
first, exact expected-old CAS, then transactional current-state settlement;
success is invisible until both are complete, and restart resolves the receipt
without guessing. The fixed Project paths are:

```text
.conexus/project/brain-binding.json
.conexus/project/connection-bindings.json
```

They are `PLATFORM-CONTRACT`: Builder/app code cannot edit them, while the
Project owner may revise them only through `PRJ-11/12/14/15`.

## 6. Production module and file envelope

The intended sustainable structure is:

```text
apps/hub/src/registry/       immutable artifact/revision read capability
apps/hub/src/brain/          Brain source/revision/health/context owner
apps/hub/src/connections/    connector, logical lifecycle, qualification owner
apps/hub/src/gateway/        read-only last-mile Sankhya execution
apps/hub/src/project/        exact Project binding commands/reads and Git settlement
apps/hub/src/platform/       configuration, PostgreSQL and credential mechanics only
apps/hub/src/generated/      canonical R2 route/type projection
apps/web/src/features/       locked W-02A/W-02B/P-02 consumer realization
apps/web/src/generated/      canonical R2 browser transport projection
```

Semantic owners do not deep-import one another. The composition root injects
narrow ports. Shared mechanical port types may live only in a public package
entry when two owners genuinely consume them; they carry no authorization or
semantic settlement.

Expected repository paths across the stage are bounded to:

```text
apps/hub/migrations/011_r2_brain_connections.sql
apps/hub/migrations/atlas.sum
apps/hub/src/{registry,brain,connections,gateway}/**
apps/hub/src/project/**
apps/hub/src/platform/{config,secrets,credential-backend,bounded-json}.ts
apps/hub/src/{server.ts,http/app.ts,generated/r2-routes.ts}
apps/web/src/{generated/r2-client.ts,features/brain/**,features/connections/**,
              features/project/**,routes/**,app/router.tsx,app/shell.tsx,styles.css}
packages/integration-ports/src/index.ts
scripts/{generate-r2-contracts,bootstrap-r2-brain}.mjs
scripts/{run-hub-migrations,check-import-law}.mjs
tests/implementation/r2-*.test.mjs
profiles/r1/v1/** and runtime/r1/** only through an explicit digest-pinned
  successor migration if a Project source/platform-contract projection requires it
package.json
.github/workflows/verify.yml
```

Any new dependency, record class, Permission, operation, external process,
service, database, generic repository/gateway/context or file outside this
envelope is `STOP / SPLIT PREREQUISITE`, not an implicit packet expansion.

## 7. Parts and mutation windows

| Part | Sustainable vertical outcome | Operations first reachable | Proof subject |
| --- | --- | --- | --- |
| `R2-P0` | deterministic canonical R2 route/type/client projection and exact 20/no-later scope guard | none registered | production generator/output + contract tests |
| `R2-P1` | owner-isolated schema/capability foundation, connector pack and encrypted credential backend firing controls | none registered | real PostgreSQL + production credential backend |
| `R2-P2` | independent canonical Workspace Brain source bootstrap, immutable Registry revision, health and Brain reads | `BRN-01/02/03/10` | production modules + real Git/PostgreSQL; synthetic Brain source |
| `R2-P3` | exact Connection lifecycle, write-only credential and provider-shaped qualification settlement | `CON-01..09` | production modules + real PostgreSQL/backend; local HTTP stand-in only |
| `R2-P4` | exact Project Brain/Connection binding source+DB settlement and Project Brain context | `PRJ-10..15`, `BRN-14` | production modules + real Git/PostgreSQL |
| `R2-P5` | server-derived read-only Gateway adapter wired to qualification and ready for R3 consumption | no public operation | production adapter + local HTTP stand-in; live claim pending |
| `R2-P6` | locked W-02A/W-02B/P-02 Control Plane journey over the exact 20 routes | no new operation | production browser/server composition |
| `R2-P7` | exact separately granted Sankhya qualification/egress proof, whole-R2 review and receipt-last closure | none | controlled real provider + whole production composition |

Only the named part is an active mutation window. A later part does not inherit
authority merely because its predecessor passes. Parts may be split mechanically
inside this packet when proof isolation requires it, but no second R2 planning
artifact or broader tranche is created.

`R2-P2` is closed. Its actual bounded mutation window was:

```text
docs/evidence/4f/4f-r2-stage-code-packet.md
docs/roadmap.md
docs/index.md
docs/product/permission-contract.md
.github/workflows/verify.yml
apps/hub/migrations/011_r2_brain_connections.sql
apps/hub/migrations/atlas.sum
apps/hub/src/{registry,brain}/**
apps/hub/src/platform/config.ts
apps/hub/src/{server.ts}
scripts/{bootstrap-r2-brain,run-hub-migrations,check-import-law}.mjs
tests/implementation/{r2-p1-foundation,r2-p2-brain,r2-p2-brain-bootstrap}.test.mjs
docs/product/permission-contract.md
package.json
```

The review envelope and adjudication add only routed Evidence under
`docs/evidence/4f/**`. P2 added no dependency, Connection runtime, provider
transport, Project binding mutation, browser surface or later operation.

`R2-P3` is closed. Its actual exact mutation window was:

```text
docs/evidence/4f/4f-r2-stage-code-packet.md
docs/roadmap.md
docs/index.md
.github/workflows/verify.yml
apps/hub/migrations/011_r2_brain_connections.sql
apps/hub/migrations/atlas.sum
apps/hub/src/connections/{module,routes,store,qualification,sankhya-om}.ts
apps/hub/src/platform/{config,credential-backend}.ts
apps/hub/src/{server.ts,http/app.ts,generated/r2-routes.ts}
scripts/{run-hub-migrations,check-import-law}.mjs
tests/implementation/{r2-p1-foundation,r2-p2-brain-bootstrap,r2-p3-connections}.test.mjs
package.json
```

P3 may make only `CON-01..09` reachable. It owns exact logical Connection and
immutable revision lifecycle, write-only credential generation settlement,
provider-shaped qualification state, and crash-safe reconciliation of an
orphan ciphertext created before logical settlement. Its HTTP provider is a
bounded local stand-in and may prove only request/response/failure mechanics;
it cannot claim live Sankhya qualification or egress. It adds no dependency,
Project binding, Gateway capability, Brain mutation or browser surface.

The operator resolved the P3 first-authority ambiguity on `2026-09-04` before
implementation. The exact Workspace creator receives independently stored,
scope-local `connection.read`, `connection.manage` and
`connection.qualify`; the exact Project creator receives the same three facts
only for that Project. Existing creator records are backfilled, future creator
settlement stores the facts directly, and every fact remains independently
revocable. Connector-definition discovery requires at least one current
`connection.read` fact. `connection.use` is not inferred, backfilled or
granted by P3 and remains for its first exact P4 consumer. This explicit
operator correction admits `docs/product/permission-contract.md` into the P3
ceiling; it admits no generic grant administration or other owner change.

The exact P1 connector pack is declarative. It fixes `sankhya-om@1.0.0`, the
two code-owned origins, non-secret configuration schema, write-only credential
input schema and the single `sankhya.company.read.v1` qualification descriptor;
it does not authenticate or call Sankhya. The credential backend is the
production AES-256-GCM file mechanism named in section 4.4 and must prove its
permission, symlink, immutability, nonce, AAD, tamper, key-generation and
atomic-publication controls against real filesystem operations.

During candidate formation, changing the inherited R1
`platform/secrets.ts` path made the mandatory native custody check fire
`R1C14_NATIVE_TRANSITION_REASON_REQUIRED`. `CURRENT STRUCTURE CONFIRMED`:
avoid an unnecessary R1 successor transition, preserve that file
byte-identical and place the independently consumed R2 backend in
`platform/credential-backend.ts`. This changes no owner, record, operation,
trust boundary or dependency and is the smallest correction that preserves
`R1_PRESERVED`.

Operator proof instruction recorded on `2026-09-04`: any later Mastra/LLM or
model-provider-dependent claim must be proven with the exact admitted real
provider. A mock, fake, fixture or stand-in can prove only local contract and
failure behavior and cannot close a real model/provider or composed-product
claim. This instruction does not add Mastra, a model call or RB work to P1 and
does not waive the exact grant for the tranche that owns such a live proof.

## 8. Part proof

### R2-P0 RED falsifiers and completion

Before P0 can close, proof must turn red for:

- any missing, duplicate or extra operation relative to the exact R2 set;
- method/path/operation ID/current-state carrier drift from canonical OpenAPI;
- a generated type or client that is not derived from the canonical schema;
- projection of `GW-01/02`, R3/RB/later operations or a generic executor;
- editable generated output drift;
- change to the integrated R1 operation projection or route census.

P0 completion requires:

```text
20/20 deterministic projection
+ byte-stable --check regeneration
+ exact source digests
+ no route registration/runtime/provider call
+ targeted Node tests
+ Hub/Web typecheck
+ import law
+ npm run verify
```

P0 is enabling foundation only. Passing it does not realize any R2 operation.

### Local candidate result — 2026-09-04

The bounded P0 candidate now projects exactly the authorized 20 operations from
the dereferenced canonical Product OpenAPI and binds seven source digests. Its
projection digest is
`cce45e3e789502b16f05c6a4b3d8ec048839c8bf58ce5b46519e9d9102e59c19`.

```text
npm ci                                            PASS
npm run r2:p0:check                               PASS
  exact projection                                20/20
  generated drift RED control                     FIRED
  no later/Gateway/generic executor               PASS
  R1 generated output preservation                PASS
  Hub/Web typecheck + import law                   PASS
npm run r1:r1c14:native:check                     PASS / 31 tests
npm run wire:verify                               PASS / 128↔128
npm test                                           319/320 PASS
npm run verify                                     BLOCKED AT repository:check
```

The two last commands have one shared, expected publication-bound condition:
`scripts/check-current-state.mjs` refuses any non-clean working tree. It reports
the eight bounded P0 paths and no Product, contract or implementation failure.
The operator grant explicitly excludes commit, so clean-tree verification
cannot honestly be completed in the current grant. P0 is therefore a local
candidate, not a closed or published part. No R2 route is registered and P1 is
not open.

After the explicit P0 commit grant, the remaining applicable Linux workflow
checks passed against the same eight-path candidate using the exact CI
PostgreSQL 17.10 image and installed Chromium. This included A0/G0, the isolated
Project-cognition admission package, stable R1 S2 regeneration, S2 HTTP/reads,
all named S4/S6 PostgreSQL checks, S6 browser/composed cognition, the RC-01
walkthrough verifier and the existing Biome boundary. `r2:p0:check` is now also
part of root `npm run verify`, so the exact-20/drift property cannot disappear
from future required verification.

The committed candidate then passed clean-tree `npm run verify` and
`npm run verify:extended`; the extended suite included repository authority,
documentation, architecture/provenance checks and `320/320` repository tests.
P0 is therefore closed on production generator/output code and objective
repository proof. It makes no R2 operation reachable, opens no provider egress
and grants no authority to P1.

### R2-P1 RED falsifiers and completion

Before P1 can close, proof must turn red for:

- an extra/missing durable record class, cross-owner FK or owner capability;
- owner schema/table access by another owner role, `PUBLIC`, a login runtime
  role, `SET ROLE` membership or a broad cross-owner function;
- a caller-configurable connector origin, operation, method or credential
  read schema;
- invalid/extra Sankhya configuration or credential fields;
- credential-root/key/ciphertext symlink or permissive-mode state;
- ciphertext overwrite, nonce reuse, coordinate/generation substitution,
  envelope/key-generation drift or authenticated-ciphertext tampering;
- plaintext in the ciphertext file, returned metadata, logs or database;
- any route registration, fetch/provider call or R1 runtime/profile mutation.

P1 completion requires:

```text
exact nine-record-class migration + checksum custody
+ real PostgreSQL 17 owner-isolation and Tier-2/Tier-3 negative proof
+ exact declarative sankhya-om@1.0.0 validation/firing controls
+ production credential backend real-filesystem positive/negative proof
+ Hub typecheck + import law + P0 preservation
+ npm run verify (clean tree only after a separate commit grant)
```

P1 remains foundation only. Passing it makes no R2 Product operation reachable
and proves no live Sankhya or model-provider behavior.

### R2-P1 local candidate result — 2026-09-04

The bounded eleven-path P1 candidate satisfies its exact mutation ceiling. It
adds the nine accepted owner-isolated record classes, the declarative
`sankhya-om@1.0.0` connector pack and a production AES-256-GCM filesystem
credential backend. It registers no Product route, performs no provider call,
adds no dependency and preserves the inherited R1 `platform/secrets.ts` byte
for byte.

```text
npm ci                                            PASS
npm run r2:p1:check                               PASS / 4 local + 1 environment-gated
npm run r2:p1:postgres                            PASS / PostgreSQL 17.10 exact CI image
npm run r1:r1c14:native:check                     PASS / 31 tests
R1 S4/S6 PostgreSQL + S6 composed + RC-01         PASS
npm run repository:check:extended                 PASS
npm run wire:verify                               PASS / 128↔128
npm test                                           319/320 PASS
npm run verify                                     EXPECTED STOP / repository:check clean-tree guard
```

The sole failing repository-test assertion and root-verify stop are the same
objective publication condition: `scripts/check-current-state.mjs` refuses a
non-clean tree and reports exactly the authorized P1 paths. All functional
tests pass. Clean-tree verification is impossible without crossing the
separately gated commit boundary, so P1 is a local candidate rather than a
closed or published part. Its PostgreSQL claim was separately exercised
against the exact CI PostgreSQL image, not inferred from the environment-gated
local test.

### R2-P1 independent review and Lead adjudication — 2026-09-04

The implementation candidate is local commit
`21a17d2154acaf879baf5cb5e26ab2f5135821f2`. It contains exactly the eleven
P1-ceiling paths. Clean-tree `npm run verify` and `npm run verify:extended`
passed on that commit after the real PostgreSQL and filesystem proofs above.

The final isolated lanes reviewed that same clean commit without receiving one
another's output:

```text
Fable
  Claude Code      2.1.257
  requested alias  fable / xhigh / plan/read-only
  resolved model   claude-fable-5-1
  session          91626a74-8e50-49c6-8851-1dd3776c7069

AGY
  CLI              1.1.26
  requested model  gemini-3.1-pro-high / high / plan+sandbox
  resolved label   Gemini 3.1 Pro (High)
  conversation     c99a4f25-a832-4be1-b32c-a9d5cc707b09
```

Lead adjudication:

1. `LOCAL EXECUTION GAP / CORRECTED`: stale status, missing candidate identity
   and missing review record are corrected by this section and roadmap.
2. `LOCAL EXECUTION GAP / CORRECTED`: the R2 transition of the inherited
   migration runner is intentional. `runHubMigrations` retains its exact R1
   application ceiling while recognizing a valid current R2 ledger;
   `runR2HubMigrations` and the CLI apply the current repository migration
   census. Historical R1 receipts remain historical identities, not current
   byte pins. Current R1 PostgreSQL/composed/RC-01 regression plus native
   custody checks are the deciding preservation proof for this transition.
3. `LOCAL EXECUTION GAP / DEFER SAFELY`: crypto-key rotation has no current R2
   consumer. Logical credential generation, envelope `keyGeneration` and
   provider access-token generation remain distinct. Why safe: the first
   installation admits one exact key generation and no rotation. Revisit
   trigger: before first key rotation, restore across key generations or
   external-secret-backend adoption. Later owner: credential recovery/VER-09;
   it must preserve old-generation decryptability without advancing logical
   credential generation merely because a crypto key changes.
4. `LOCAL EXECUTION GAP / CORRECTION REQUIRED BEFORE P3`: the exact environment
   authority is the immutable ConnectionRevision configuration. Qualification
   and Project-binding environment fields are owner-issued projections that
   must equal that revision; Gateway derives egress only from the revision and
   revalidates both projections. `brn.binding_validation` is the Brain-owned
   conformance result; `project.brain_binding.validation_state` is the
   Project-owned settlement snapshot for that exact result/revision, not a
   mutable foreign current-state mirror. CON-06 rejects an unchanged-current
   no-op but a deliberate return to historical configuration creates a new
   immutable revision; the P1 uniqueness constraint on historical
   configuration digest must therefore be removed before P3.
5. `LOCAL EXECUTION GAP / DEFER SAFELY`: nested P0/type/import checks add CI
   time but do not weaken any claim. Revisit when measured CI time becomes a
   delivery constraint; owner is root verification composition.
6. `LOCAL EXECUTION GAP / CORRECTED`: runtime roles and cross-owner access are
   derived from catalog state, the RED controls fire after real grants, P3 owns
   orphan-ciphertext recovery, and the P1 review explicitly does not replace
   the mandatory after-P2 checkpoint.

AGY additionally found one material Global-Maximum candidate: the root key is
read-only to this process, but the current packet and implementation require
exact mode `0600`. Accepting owner-read-only `0400` as well as `0600`, while
still refusing owner execute and every group/other bit, reduces privilege and
supports read-only secret mounts. The operator approved that Global-Maximum on
`2026-09-04`. The correction must prove the exact accepted set (`0400`, `0600`)
and refusal of unreadable, owner-executable or group/other-accessible modes
before P1 closes.

### R2-P1 closure correction — 2026-09-04

The operator approved owner-only root-key modes `0400` and `0600`. Commit
`8e01e5d61a041cc02a2afa021372b9adf44c1710` implements that exact accepted set,
keeps owner execute and every group/other bit refused, and removes only the
historical `(connection_id, configuration_digest)` uniqueness constraint so a
deliberate return creates another immutable revision. RED fired for `0400` under
the prior backend; PostgreSQL proof now inserts two distinct immutable revision
identities with the same historical digest.

```text
npm ci                                            PASS / 2 pre-existing low advisories
npm run r2:p1:check                               PASS
npm run r2:p1:postgres                            PASS / PostgreSQL 17.10 exact CI image
npm run r1:r1c14:native:check                     PASS / 31 tests
npm run verify                                    PASS / clean commit
npm run verify:extended                           PASS / 320 repository tests
```

The correction is the exact AGY recommendation plus the already adjudicated
Fable lifecycle finding; it changes neither owner nor proof class and does not
invalidate the completed P1 challenge. `R2-P1` is closed and P2 opens under the
existing autonomous-through-P7 grant.

### R2-P2 RED falsifiers and completion

P2 deciding proof fires for any extra route; Registry payload disclosure;
implicit or cross-Workspace Brain authority; non-independent creator/read
facts; mutable publication; health-state collapse; source/Project-root alias;
symlink, hardlink, nested-mount, rogue-ref, alternates or remote-Docker false
PASS; partial durability; concurrent/pending-recovery divergence; latent
schema/table/column/function/default ACL, role membership, RLS, rule or disabled
trigger; synthetic/local proof presented as real Git, production or provider
proof; and any R1/P0/P1 regression.

Completion requires the four production routes, exact DTO projection, real
PostgreSQL owner isolation, real admitted Git OCI bootstrap through the
production CLI, firing custody/recovery controls, clean whole-repository proof
and the mandatory fresh Fable + AGY checkpoint.

### R2-P2 closure and independent review — 2026-09-04

Implementation commit `025339096af65d19a7aa9bd07892262367cc6644` and review
envelope `09d5d4407bc9a1afe2bdacce49938e5b31d55c16` froze one exact candidate.
Fable (`claude-fable-5-1`, session
`78538899-aee8-4d30-b92f-86b8e6a389a0`) returned `REVISE`; AGY
(`gemini-3.1-pro-high`, conversation
`a308ca09-bdcd-4bf8-8b81-92382e673058`) independently returned `CLEAR`.
Lead adjudication is owned by
[`4f-r2-p2-independent-review-adjudication.md`](4f-r2-p2-independent-review-adjudication.md).

Correction commit `b4fae5c5211cc096cff8567591186a6d6ba6768d` records the
already operator-approved first-consumer `brain.read` successor and distinguishes
non-membership 404 from member-without-capability 403 without exposing owner
tables. The corrected real proof is:

```text
npm run r2:p2:check                               PASS
npm run r2:p2:postgres                            PASS / PostgreSQL 17.10
npm run r2:p2:live                                PASS / 208291.54476ms
  production CLI + two concurrent entrypoints     PASS
  .pending recovery + hardlink/ref/alternates     PASS
  four production BRN routes                      PASS
Git OCI index                                     sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851
Git                                                2.55.0
Git executable sha256                             b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201
PostgreSQL                                         17.10
migration 011 sha256                              b7ab508a6a8c6c7c61c371b868fe6ca7b863221a244978d2b82ece08342f0b98
Atlas 1.3.0                                       h1:6DhFZb8lc5B1aw9YoeCtEZF4Ik1n2XXql1y5AKh3ctg=
```

The Brain content is synthetic and non-production. The bootstrap login is a
trusted operational capability unavailable to the server; SQL verifies its
bounded identity settlement while the script and exact local Git verifier prove
source revision and bytes. The operator-custodied human-review receipt is
sufficient only for this synthetic initial proof and is not claimed as a
generic signed production admission system. P2 makes no Mastra/LLM/provider
claim.

All P1/P2 PostgreSQL databases were disposable clean-bootstrap proof created
before any R2 integration. No stateful R2 database upgrade path exists or was
authorized, so cumulative migration 011 evolution is safe until integration.
After 011 is pushed or merged, later changes must use a successor migration.

`BRN-02?forProjectId` remains fail-closed without DB access until P4 implements
the accepted purpose-bound `project.manage + brain.bind` summary disclosure.
P2 is closed after clean `test`, `verify`, `verify:extended` and preflight; P3
opens under the existing grant and exact mutation ceiling above.

### R2-P3 RED falsifiers and completion

Before P3 can close, proof must turn red for:

- any route outside `CON-01..09` or any caller-selected origin/method/service;
- mutable-latest revision use, cross-scope Connection access or qualification
  detached from exact revision, credential generation, environment or company;
- credential plaintext read-back, persistence, log/Problem/Evidence disclosure,
  ciphertext overwrite, or orphan publication that cannot be reconciled safely;
- accepting guessed token/company response aliases, redirects across origins,
  unbounded body/time/depth, bearer reuse or retry;
- a local HTTP stand-in presented as live Sankhya proof;
- Project binding, Gateway, browser, Mastra/LLM, dependency or R1 custody work.

P3 completion requires exact production Connection routes/stores, real
PostgreSQL and credential-backend proof, local provider-shaped transport with
firing negatives, crash recovery, P0–P2 preservation, type/import checks and
clean root verification. Live Sankhya remains pending P7 entry conditions.

### R2-P3 closure and independent security correction — 2026-09-04

Implementation commit `153b630d65c9a3d1b2346d072befc66d52ebcb1f`
makes exact `CON-01..09` reachable. It preserves immutable Connection revisions,
write-only credential generations, independently revocable scope grants and
qualification Evidence bound to exact revision/generation/environment. Real
PostgreSQL 17.10 and the production AES-256-GCM backend prove owner isolation,
least privilege, orphan-ciphertext recovery, idempotent replay and immutable
generation coordinates. The local HTTP stand-in proves only fixed-origin,
fixed-method, timeout/body/tree/schema/redirect/no-retry mechanics; it is not
live Sankhya Evidence.

Independent read-only security challenge found five real candidate defects or
proof gaps before closure. `CURRENT STRUCTURE CONFIRMED`: the bounded corrections
make missing response admission return before credential materialization or
egress (including represented PRODUCTION), add receipt lease/attempt ownership
so concurrent qualification is single-flight and stale takeover has one winner,
propagate credential custody/integrity faults rather than misclassifying them as
input, fire the declared transport/grant/cross-scope REDs, and remove unused IAM
helper EXECUTE grants from the runtime role. A second read-only pass returned
`CLEAR`; the lease-specific challenger also found no material defect after an
adversarial loser-after-takeover settlement test was added.

```text
npm ci                                            PASS / 2 pre-existing low advisories
npm run r2:p3:check                               PASS
npm run r2:p1:postgres                            PASS / PostgreSQL 17.10
npm run r2:p2:postgres                            PASS / PostgreSQL 17.10
npm run r2:p3:postgres                            PASS / PostgreSQL 17.10
npm run r1:r1c14:native:check                     PASS / 31 tests
npm run verify                                    PASS / clean commit
npm run verify:extended                           PASS / 320 repository tests
npm run conexus:preflight                         PASS / clean commit
```

### R2-P4 authority resolution and exact mutation ceiling

The operator resolved the entry ambiguity on `2026-09-04`. The exact Project
creator receives independently stored and independently revocable
Project-scoped `brain.bind` and `connection.use` facts, including a one-time
backfill for existing exact Project creators. Neither fact implies the other or
any `brain.read`, `connection.read/manage/qualify`, `project.manage`, runtime,
generic read/admin or cross-scope authority. Admission reads the stored facts,
never creator status. `PRJ-12/15` remain narrowing under `project.manage` and do
not require the specialist fact to remain. No generic grant-administration
operation or broader role is admitted.

The exact P4 mutation window is:

```text
docs/{roadmap,index}.md
docs/product/permission-contract.md
docs/evidence/4f/4f-r2-stage-code-packet.md
.github/workflows/verify.yml
apps/hub/migrations/011_r2_brain_connections.sql
apps/hub/migrations/atlas.sum
apps/hub/src/project/{module,routes,store,git-execution}.ts
apps/hub/src/brain/{module,routes,store}.ts
apps/hub/src/connections/{module,routes,store}.ts
apps/hub/src/platform/config.ts
apps/hub/src/server.ts
scripts/{run-hub-migrations,check-import-law}.mjs
tests/implementation/{r2-p1-foundation,r2-p2-brain-bootstrap,
  r2-p3-connections,r2-p4-project-bindings}.test.mjs
package.json
```

P4 may make only `PRJ-10..15` and `BRN-14` newly reachable and complete the
already accepted purpose-bound alternates of `BRN-02` and `CON-03`. It may add
only the exact Project binding runtime role/functions and the two stored
Project-scoped authority facts. It adds no dependency, Product record class,
Permission, operation, provider call, Gateway execution, browser surface,
Mastra/LLM work or R1 profile/runtime custody change.

Same-owner Project source/DB settlement uses no new durable receipt class. Git
first applies one deterministic exact-path mutation by CAS from the Project's
stored `source_revision`; the DB transaction then rechecks that exact old/new
pair plus the operation's current subject before advancing
`project.source_revision` and the binding projection together. Restart may
accept only the same deterministic child commit; a different child, stale
Project state or competing mutation conflicts without guessing. The canonical
files are complete current declarations, not append logs, browser state or a
second binding owner.

### P4 implementation finding — Brain conformance/applicability input

The first P4 implementation increment stores the two already approved creator
facts, backfills only exact PRJ-03 receipt/Project/account/Workspace matches,
and preserves independent revocation across migration re-entry. Its proof is
`npm run r2:p4:authority` against real PostgreSQL 17; it does not register a
binding route or close P4.

`PRODUCT / PLAN GAP`: the next Brain consumer lacks a deciding input contract.
The smallest controlling owners are Brain reference §20.2, the operation
ledger §5.5.3–5.5.5, and the BRN-14 canonical response contract:

- Every admitted binding requires local conformance, including required
  grain/uniqueness assertions. Brain health is a separate owner fact.
- Browse `domainRef`/`conceptRef` coordinates explicitly are not canonical
  semantic IDs. `reviewText` must not become semantic authority.
- BRN-14 requires exact Project applicability/local realization and distinct
  server-issued authoring references; binding alone cannot disclose the whole
  Workspace revision.
- The current `conexus-brain/v1` source accepted by `bootstrap-r2-brain.mjs`
  contains only review text and knowledge browse. Its parser rejects extra
  fields. The P4 packet names conformance but specifies no typed local input,
  required-assertion mapping or applicability derivation. A
  `brn.binding_validation` row is storage for a result, not proof of it.

Concrete falsifier: two Projects bind the same revision while only one has
realized a required grain/uniqueness condition. Revision availability plus
identical health cannot establish which binding passes or which concepts are
available. Copying all browse concepts, returning an invented known-empty
context, parsing prose, or writing unconditional `VALID` would manufacture
truth and violate the protected claims.

Recommended bounded successor, **proposal only**: define the minimal typed
Brain semantic identities, required proof references and Project-local
realization/applicability input at the existing Brain/Project owners; bind the
validation result to exact source/binding/proof identities. Specify how missing
proof refuses adoption and how BRN-14 derives its disclosed concepts and
authoring references. Preserve the exact 20 operations and existing owners;
change bootstrap/schema consumers only through an explicitly expanded packet
ceiling. No generic semantic engine or new Product operation is proposed.

Alternatives: full-revision inheritance violates BRN-14; treating browse/health
as conformance violates §20.2; an always-empty/refused implementation cannot
satisfy the accepted vertical outcome. The successor must settle these inputs
before dependent binding code, with exact positive/negative proof in the packet.
This is the named material ambiguity stop under the autonomous grant, not a
request to reapprove the already accepted permission facts. No owner semantics
have been changed by this finding.

Permission-increment deciding proof on WSL Ubuntu / Node 24.20.0 / npm 12.0.2:
`npm ci`, real P4 authority proof, P1/P2/P3 PostgreSQL regression, R1 S4/S6
PostgreSQL and composed browser/RC-01 regression, and native R1C-14 custody
checks passed. The PostgreSQL subject was a new disposable database on the exact
CI 17.10 image; no existing developer database was migrated. Atlas community
1.3.0 regenerated checksum custody. These results prove only permission storage
and preservation, not P4 admission, binding settlement or Brain conformance.

Two inherited checks also failed on unchanged baseline paths: repository
hygiene rejects `4f-r2-p4-session-handoff.md` as transient, and the S2 read test
requires the obsolete literal `readPool: s2ReadPool!` in `server.ts` despite
the current module composition. They are recorded for the repository/CI owner
before publication; neither changes the Brain ambiguity or proves a permission
defect. This increment does not claim publication readiness or stage closure.

### P4 bounded challenge and Lead disposition

The [neutral brief](4f-r2-p4-authority-review-brief.md) freezes implementation
`9c99384` relative to `d2f18f9`. Claude Code 2.1.257, requested Fable/xhigh,
resolved `claude-fable-5-1`,
session `2f1a3250-4206-4b4d-b183-025138451c7c`, completed read-only inspection:
permission increment clear; Brain gap justified; pause too broad; inherited CI
failures to close before publication. Root `npm run verify` passed on the
committed increment. This is one completed lane, not independent convergence.

AGY 1.1.26 / gemini-3.1-pro-high/high/plan+sandbox produced no verdict in
conversation `8bf5e4bf-b648-4589-8af9-ef95a029ab95`. Its headless command
permission was auto-denied. One [restricted retry](4f-r2-p4-agy-read-only-review-brief.md)
under existing read-only permissions also produced no verdict, conversation
`cadeec09-da37-476f-9f25-48d7517c46a8`. No permissions were broadened. The raw
local outputs are `/tmp/conexus-p4-review-TcYJ9a/conexus-review-result.json` and
its `agy-retry` sibling. The dual-review checkpoint remains incomplete.

Lead dispositions against existing authority:

- Brain gap retained for PRJ-11 admission, BRN-14 content and PRJ-10 present
  conformance vocabulary. The missing typed health-to-concept join also belongs
  in that bounded decision. A transitional unverified declaration is a distinct
  alternative requiring explicit owner decision, not automatically forbidden by
  the vertical outcome or silently selected here.
- Over-broad pause corrected: Connection binding and deterministic source/DB
  settlement can proceed under the existing P4 grant. No Brain semantics are
  needed to implement PRJ-13..15 or purpose-bound CON-03.
- The reviewer's suggestion to change the Project profile is NOT admitted:
  the exact P4 ceiling forbids profile/runtime custody mutation. Any demonstrated
  dependency on such a successor must return to its separate grant boundary.
- Inherited hygiene and S2 literal-test failures remain repository/CI work
  before publication, not blockers to the independent P4 implementation.

No P4 closure, full dual-review approval or wider execution grant is claimed.

### P4 purpose-bound Connection selection increment

`CON-03?forProjectId` now admits the exact Project binding-selection job through
an IAM-owned helper: current Project grant, containing Workspace membership,
`project.manage` and independently stored `connection.use`. Generic
`connection.read` remains separate. The same lightweight DTO is returned only
for that Project or its containing Workspace; no configuration or secret
disclosure is added. The ordinary three-argument SQL call remains ordinary
Connection disclosure.

Lead proof on the pinned WSL toolchain and a fresh disposable PostgreSQL 17.10
database passed the production Connection store/lifecycle suite, including
specialist-fact revocation, membership/grant removal, foreign-scope refusal and
exact DTO checks. Local HTTP controls prove query forwarding and response
contracts, not live Sankhya. This increment does not implement PRJ-13..15 or
prove composed Git/PostgreSQL settlement; those remain the next binding work.

### P4 Connection binding implementation responsibilities

The PRJ-13..15 adapter consumes only the generated wire schemas and a separate
Project Connection-binding store. It derives Account identity from the current
session and preserves explicit current-subject and request-authenticity checks.
It does not call Connection lifecycle operations.

The Project store prepares an exact declaration from current owner records,
applies the admitted Git capability, and submits the same command, declaration
and expected old/new source pair for transactional settlement. Project-owned
SQL checks management on reads/removal and independently stored use on set;
the runtime role receives no direct table access. Connections-owned helpers,
callable only by the Project owner, provide scope-checked human presentation and
exact current qualified revision/environment/generation admission. Settlement
locks the Project and rechecks the prepared subject and qualification basis
before advancing source and the one affected binding atomically. Complete
declarations retain all other bindings unchanged; removal does not require
Connection qualification or the specialist use fact to survive. Stale source,
changed admission/basis or a different Git child conflicts or refuses; none may
be silently repaired into a successful adoption.

Lead deciding proof on `2026-09-05`, WSL Ubuntu / Node `24.20.0` / npm
`12.0.2`, passed `r2:p4:recovery` with the admitted OCI Git identity and a
disposable PostgreSQL `17.10-bookworm` database. The production Project store,
restricted-role SQL and real Git capability proved source/DB settlement, an
actual child-process exit after Git but before DB settlement, same-child
restart, competing-command exclusion, and narrowing removal after use
revocation and qualification obsolescence. Restart settled child
`3b64f72ae3f524af2f23e959994a4cc40b34ce8b`; final source was
`9e2b73bd4f9261249e1142b22b93b73030691fb9`. The one selected composed test
passed without skips. Qualification bases were trusted owner fixtures: this
does not prove live Sankhya, credential backend execution, real identity-provider
composition or the complete HTTP journey.

Lead `r2:p4:authority` against the same disposable PostgreSQL cluster also
passed: 17 tests, with only the three separately enabled real-Git tests skipped.
It covered receipt-scoped permission backfill/revocation, production binding
SQL current-state/owner isolation, and local store/HTTP/config contracts. These
are distinct proof subjects, not substitutes for the composed recovery test.
The earlier permission-only Fable review does not cover this implementation;
the pending independent review and Brain input finding remain unresolved.

Final Lead diff review found that CAS-loss cleanup attempted immediate Git
pruning: it could delete another in-flight writer's unreferenced objects.
That cleanup and its undefined-variable failure branch were removed. Ordinary
unreachable Git objects are not new Product records or settlement authority;
request execution must not garbage-collect the shared source store. A structural
regression protects that exclusion. The preceding real-Git results describe
the pre-correction subject. On corrected implementation `e691ed1`, Lead reran
`r2:p4:git` (2/2, no skips) and `r2:p4:recovery` (1/1, no skips). The former
proved complete-tree preservation, deterministic replay and one concurrent
winner. The composed rerun recovered exact child
`90f9128692f9033f4511d27c7437af5c038e8d18`, with final source
`b53a1bdead4e81238d1fa0bdbfa55378df52ecab`. Its trusted qualification-fixture
and non-provider limitations remain unchanged. P1/P2/P3 PostgreSQL regressions
passed with the final migration and ACL custody; `npm ci`, R1 S2 HTTP (7/7)
and native R1C-14 custody (31/31) also passed.

An additional R1 Git contract run passed 27 tests, skipped four opt-in live
tests and failed two checks at `S3_GIT_GENERATED_IDENTITY_DRIFT`. Both stop at
the unchanged generated identity's manifest/receipt digest fields: the
generator, manifest, receipt and generated file are identical to `be6e240`.
The generated OCI/executable identity fields match the generator, and the
current native-custody check passes. Route this inherited provenance mismatch
to the R1 repository/custody owner before publication; P4 may not rewrite those
files or claim the failing checks passed.

Clean root `npm run verify` passed on `b9964f6` after the corrected real-Git
proofs. This command's opt-in PostgreSQL/Git cases remain distinct from the
explicit deciding runs above. The disposable PostgreSQL container and synthetic
volume were removed; pre-existing developer databases were untouched. This
checkpoint does not claim all additional workflow checks, independent review,
publication readiness or P4 closure.

### R2-P4 RED falsifiers and completion

Before P4 can close, proof must turn red for:

- missing, coupled, inferred, cross-scope or non-revocable `brain.bind` /
  `connection.use` facts, or admission through creator status after settlement;
- specialist binding authority implying generic Brain/Connection read,
  management, qualification, runtime or admin authority;
- a path other than the two canonical `PLATFORM-CONTRACT` declarations,
  non-canonical bytes, caller-selected commit metadata or mutation outside the
  exact expected-old Git CAS;
- stale/current-state, concurrent-child or crash-after-Git ambiguity, partial DB
  visibility, or a DB binding/source revision that does not identify the exact
  canonical Git child;
- binding a mutable latest, foreign Workspace/Project subject, unhealthy or
  non-conformant Brain revision, or non-current/non-qualified/incompatible
  Connection revision/environment/credential-generation basis;
- ETag/absent-state or explicit-current-subject drift, loss of narrowing
  semantics, missing Connection human presentation, or purpose-bound
  `BRN-02`/`CON-03` widening;
- `BRN-14` browser-composed applicability, whole-Workspace leakage, critical
  invalid/suspect meaning presented as usable, runtime effective-slice/tool/RAG
  authority or fail-open dependency behavior;
- cross-owner table access, broad helper function, extra route, provider call,
  Gateway/browser/Mastra work or an R1/P0-P3 regression.

P4 completion requires exact production routes/stores and DTOs, independent
authority/backfill/revocation proof, deterministic real admitted-Git CAS and
crash/concurrency recovery proof, real PostgreSQL 17 owner-isolation/current-
state proof, purpose-bound negative disclosure proof, Hub type/import checks,
P0-P3 preservation and clean root verification. It proves no live Sankhya or
model-provider behavior.

### P4 implemented Connection-binding checkpoint — neutral review brief

Review the whole P4 implementation at `c1f075d140866b6a1230c65e5c45d94b00a930e6`
relative to `d2f18f9`, not only the latest documentation diff. This is a material
implementation checkpoint, not P4 closure. The preceding permission-only review
does not cover this subject. The present section is the exact review brief;
other packet sections are authority/proof routing, not a requested verdict.

Reconstruct AGENTS, roadmap, index, applicable methods and the P4 authority,
mutation ceiling and RED falsifiers above. Accepted R1 and R2-P0..P3 remain
upstream; challenge them only with a concrete falsifier. The checkpoint makes
PRJ-13..15 and purpose-bound CON-03 concrete through generated HTTP contracts,
Project-owned source-first Git/DB settlement and narrow owner-issued admission.
Brain admission/context remains unimplemented at the separately recorded input
decision. No fixture or always-refused Brain path is claimed as completion.

Protected claims to attack:

1. Independent creator facts, revocation and exact-purpose selection do not
   imply generic disclosure, lifecycle, runtime or cross-scope authority.
2. PRJ-13..15 derive session identity, enforce request authenticity and exact
   current-subject semantics, and preserve narrowing removal and safe DTOs.
3. Only canonical declaration paths change. Git uses the admitted image,
   exact-old CAS, deterministic same-child replay and whole-tree preservation;
   concurrent writers cannot prune each other's pending objects.
4. PostgreSQL settlement rechecks scope, management/use, current qualified
   revision/environment/generation and exact declaration/source before atomic
   projection advancement. No new durable receipt, owner-table shortcut,
   silent repair, provider call or R1 custody mutation is admitted.
5. Proof and continuation claims match their subjects. Challenge any material
   missing path, false PASS or false STOP without turning unrelated hardening
   or review ceremony into the current gate.

Inspect the changed Project/Connection stores, routes, module/config/server,
Git capability, migration 011, Atlas/catalog custody and P4/P3 tests. Follow
exact generated schemas and Project/IAM/Connections owners where needed. Lead
proof is recorded immediately above: corrected real OCI and composed
Git/PostgreSQL recovery, restricted-role SQL, P1–P3 PostgreSQL, native R1C-14,
local HTTP and clean root verification. Qualification inputs are trusted owner
fixtures, not live Sankhya; HTTP controls are not a real identity-provider E2E
journey. Inherited failures and missing Brain authority are explicit unknowns
or boundaries to adjudicate, not evidence of the desired verdict.

Read-only inspection only: no edits, installs, Docker mutations, Product/provider
execution, Git writes or other reviewer. Do not rerun long suites. Return the
Blueprint 10.6 finding classes, concrete evidence/failure mode/materiality,
smallest owner, stop/continue disposition, preserved boundaries, and your own
raw verdict. Output remains outside the repository; no convergence is implied.

### P4 material checkpoint findings — bounded prerequisites

The fresh read-only Claude Code `2.1.257` lane (Fable/xhigh, resolved
`claude-fable-5-1`, session `2bbbb811-437f-48b4-99e3-930d6ad09f7b`) completed
on `c1f075d` relative to `d2f18f9`, using the neutral brief frozen at `4b645bf`.
Raw output is `/tmp/conexus-p4-binding-review-S05gjq/conexus-review-result.json`.
AGY produced no current-candidate verdict; this is not a complete dual round or
independent convergence. No repeat review is authorized merely by this record.

Lead source inspection confirms two bounded prerequisites:

- `P4-RECOVERY-01` — after preparation chooses qualification Q1, a newer Q2
  can settle before the post-Git DB transaction. Git contains child A1 with Q1;
  settlement re-prepares Q2 and refuses the differing declaration. DB source
  remains S0. Subsequent commands cannot reproduce A1 while Q1 is no longer
  latest, and the R1 source snapshot refuses main != DB source. The same-child
  recovery proof did not exercise this non-replayable orphan. This is a
  structural liveness/R1-preservation gap, not a false claim that a rejected
  command succeeded. Section 5's receipt language and the P4 prohibition on a
  new receipt do not supply an admitted reconciliation mechanism. Reopen the
  Project settlement plan for an exact completed/abandoned orphan rule; do not
  invent a new durable class, rewind main, weaken current admission or silently
  repair it under the present ceiling. A durable intent is an alternative to
  evaluate, not a selected requirement. Deciding proof must include changed
  qualification/admission after Git and an R1 source consumer on that Project.
- `P4-OWNERSHIP-02` — `createProjectSourceSnapshot.listPaths` rejects paths
  absent from the supplied ownership map. The two canonical binding files are
  new source paths, but the deployed map is outside inspected custody and its
  coverage is unproven. Do not claim every deployment fails; prove that the
  admitted ownership projection covers binding-mutated Projects. The existing
  P4 ceiling expressly excludes the R1 profile/runtime custody successor.
  Return that dependency to its separate operator grant, preserving the two
  paths and PLATFORM-CONTRACT meaning. Required proof must exercise the real
  source snapshot after binding, not a stubbed path listing; any model claim
  still requires separate exact provider authority.

These findings block closure and deployment of reachable binding mutations,
not permission/selection preservation or the independent Brain input decision.
They expose a missing composition check in this packet: preservation of R1
must include R1 consumers of R2-mutated Project source, not only unchanged R1
fixtures. No amendment to the Engineering Method is needed.

The bounded PRJ-15 response correction maps an invalid expected-current subject
to its declared `412`, not an operational `503`; the HTTP contract falsifier
first failed `503 != 412`. Git, SQL settlement and authority are unchanged.
The corrected HTTP contract test, Hub typecheck and owned-file Biome check
passed on the pinned WSL toolchain.
Strict-fsck stderr/large-repository refusal is deferred safely: it fails closed,
has no current accepted large/import-warning proof subject, and reopens at the
first such import with the Project Git owner. This is not a general throughput
or recovery framework project. Historical hygiene/S2/generated-digest failures
remain separately scoped; the hygiene file predates this continuation but was
introduced by an earlier P4 handoff, not an unrelated Product baseline.

### P4 prerequisite design — operator-authorized inquiry, proposal only

On `2026-09-05` the operator authorized the design-only pass requested after
`1f81a22`: orphan reconciliation, R1 ownership integration and Brain inputs.
The concrete consumer is a corrected P4 implementation packet that removes
`P4-RECOVERY-01`, `P4-OWNERSHIP-02` and the Brain input ambiguity. Only this
packet and roadmap are edited during the pass. Accepted semantic owners,
Product code, contracts, migrations, profiles, runtime, provider execution and
deployment remain unchanged. The following alternatives do not expand the
implementation grant or constitute ratification.

The subsequent operator `aprovo` accepts this direction for executable-packet
detailing and Brain/Gateway contract resolution, explicitly without successor
implementation. The following specification is the design candidate to
challenge, not permission to mutate the named future implementation paths.

#### A. Orphan reconciliation: compared structures

Target invariant: every source change produced by an admitted binding attempt
can reach either a currently authorized completed binding or a precisely
abandoned attempt with unchanged prior binding content. A rejected attempt must
not permanently disable an R1 source consumer. An expired lease alone cannot
prove its old Git process has stopped. Unknown/foreign source changes remain
an explicit conflict; recovery must never guess their ownership.

| Alternative | Counterexample / cost | Proposed disposition |
| --- | --- | --- |
| Retain declaration-only replay | Q1→Q2 or revocation after Git makes the exact child non-replayable indefinitely | Reject: preserves the demonstrated dead end |
| Keep a DB transaction/lease across Git, but no durable intent | Process death rolls back the DB while Git can remain advanced; lease expiry does not fence a surviving container | Reject as the recovery mechanism; locks may coordinate only |
| Rewind an orphan by expected-old CAS alone | Returning main to S0 permits an old process still holding S0 to install A1 later (ABA) | Reject: exact CAS alone does not fence abandonment |
| Durable intent plus a separate fenced Git ref | Can distinguish generations, but adds another protected ref and protocol across all source writers/readers | Credible, larger custody change; retain as fallback if append-only cancellation is unacceptable |
| Durable Project intent plus append-only cancellation | Preserves the sole main-ref model; cancellation changes source identity but restores the exact prior tree and fences old expected-S0 writers | Leading proposal, subject to operator acceptance and deciding proof |

The leading proposal makes failed *already-admitted* attempts capable of adding
a content-neutral cancellation commit. It does not permit source effects for
requests refused before admission. This source-history behavior is an explicit
decision to approve, not hidden retry machinery. Prior Inception candidates
may consequently become stale even though file content returns to its previous
state; fresh source identity must be carried into subsequent R1 work.

Proposed mechanism, not implemented:

1. Under Project-owned DB admission and a per-Project single-active-intent
   constraint, freeze a server-issued intent identity, Account/Project,
   operation and exact expected-current subject, base source S0, old/new
   complete declarations, exact qualification/conformance basis and digests.
   This requires one explicitly admitted Project operational intent record;
   it is not another binding owner, user operation or generic job system.
2. The admitted OCI capability stages immutable Git objects without changing
   main: apply child A (parent S0, only the admitted declaration changed),
   cancellation C0 (parent S0, exact S0 tree), and cancellation C1 (parent A,
   exact S0 tree). Fixed owner metadata includes the intent identity and
   apply/cancel purpose. Freeze all three OIDs before any ref mutation. The
   intent makes these objects and purposes distinguishable from foreign work.
3. An APPLYING intent may install only A by exact S0→A CAS. Settlement locks
   the same intent and Project, rechecks current authority and the frozen
   semantic basis, and atomically commits the binding/source projection plus
   COMPLETED. A changed basis is never silently substituted into the intent.
4. If admission no longer survives, durably transition the intent to
   ABORTING before cancellation. Settlement from an old worker must then fail
   its intent-state/version check. Cancellation may perform only S0→C0 or
   A→C1 CAS. If the old apply wins that race, cancellation can recognize A and
   take the second route. Recognizing exact C0/C1 is idempotent recovery; any
   other head conflicts without mutation.
5. Once main is exact C0/C1, atomically retain the old bindings, advance the DB
   source to that cancellation commit and mark ABORTED. No new intent starts
   until this terminal alignment is established. Since main never returns to
   S0, an old apply process holding expected S0 cannot install A afterward.
6. Recovery of APPLYING may complete only the originally admitted command
   after current owner revalidation; otherwise it takes ABORTING. Recovery of
   ABORTING cannot change its decision back to apply. Retain terminal identity
   and outcome until the exact deciding retention/restore contract permits
   disposal; no request-time Git pruning or deletion of unknown source.

Crash windows to prove: before staging; staged but OIDs not frozen; frozen but
no ref update; apply in progress while takeover starts; A installed but DB not
committed; ABORTING recorded before either cancellation; C0/C1 installed but
DB not committed; successful DB commit before response; and a deliberately
delayed old worker after terminal cancellation and after the next intent.
Also change qualification, credentials and use permission at the Git/DB gap.
All cases require real admitted OCI Git + restricted-role PostgreSQL; fixture
control-flow tests alone cannot close the recovery claim. Restore must include
the Project intent and its referenced Git object closure, not merely main.

This retains Git-first durable source, exact CAS, no false success, current
admission and Project ownership. It would supersede the present no-new-intent
ceiling only after approval. It neither selects a lease framework nor grants
permission to rewind, force-update, discard unrelated work or relax Git custody.

#### B. R1 ownership integration: preserve classification authority

Known: the configured R1 module reads one operator-supplied flat ownership map;
it accepts GENERATED, PLATFORM-CONTRACT and APP-OWNED values. The snapshot
rejects an unclassified source path. The deployed map's coverage is unknown,
and the platform repository's runtime ownership manifest is not that flat map.
Therefore neither copying the runtime manifest nor assuming a deployment edit
is a sufficient solution.

The inspected custody chain is concrete: the structured
`runtime/r1/.conexus/s2-ownership-manifest.json` and
`runtime/r1/.conexus/s2-generation-receipt.json` are digest-pinned by
`scripts/generate-r1-s3-new-project-seed.mjs`, which generates
`apps/hub/src/generated/r1-new-project-seed.ts`. That consumer admits only
three seed files; it does not feed the snapshot ownership map loaded by
`apps/hub/src/project/module.ts` from
`CONEXUS_PROJECT_SOURCE_OWNERSHIP_MANIFEST_FILE`. A seed receipt therefore
cannot prove classification of subsequently created binding declarations.
The successor needs a generated classification projection consumed at that
module seam and enforced by `apps/hub/src/project/source-snapshot.ts`, not
additional seed bytes or a copy of all runtime-manifest entries. The exact
profile successor and its new receipt must be approved before generation;
historical manifest/receipt bytes are not repair targets.

Leading proposal: a digest-pinned profile successor produces the exact two
reserved Project binding path classifications. R1 snapshot composition consumes
that generated platform projection alongside the existing admitted operator
map. Identical overlaps are allowed; contradictory overlaps fail before
enabling the binding/source-consumer composition. Do not silently override an
APP-OWNED entry, classify every `.conexus/**` path, add placeholders to every
Project, or turn arbitrary imported files into platform-owned source. Retain
the existing admission boundary for non-platform/application classifications.
Use own-entry lookup and validate the exact admitted class at consumption;
inherited object properties are not ownership entries. Reject noncanonical
paths rather than normalize two conflicting entries into one classification.
Any new Brain-local realization input needs its own explicit APP-OWNED
classification; PRJ-11 cannot acquire write authority over it.

Alternatives: hand-maintained deployment additions leave the required relation
unverified; wildcard classification transfers unrelated ownership; accepting
all unknown paths as APP-OWNED removes the existing guard. A general ownership
registry or source reclassification service is not needed for this consumer.

The successor must also connect pending source-intent handling to the R1
snapshot entry seam. A known APPLYING/ABORTING intent is recoverable work, not
an unsupported repository: reconcile it or return an existing bounded conflict
before launching Inception/model work. After terminal settlement, obtain fresh
source identity. Do not present an old candidate as current after an apply or
cancellation commit. PRJ-07 already declares 409; its exact pending/conflict
mapping and Inception-receipt behavior must be compiled into the corrected
packet, not inferred from a generic HTTP code.

Deciding proof: real Project source before binding → apply → production R1
snapshot list/read, and cancellation → the same consumer. Include conflicting
ownership entries, missing generation identity, unknown paths, preserved APP
bytes, stale prior candidates and source-intent overlap. These source-consumer
checks need no model call; an actual PRJ-07 end-to-end claim still needs the
separately admitted real model. Scope the future custody grant to the precise
profile input, generator, generated projection, consumer and receipt chain;
do not regenerate unrelated runtime history.

#### C. Brain inputs: typed meaning, local realization and proof

Known: `conexus-brain/v1` has review text and browse content only. `semanticRef`
in health has no validated join to those browse concepts. BRN-14 must expose
Project-resolved adopted/available meaning and distinct authoring references;
neither browse IDs nor prose may become semantic authority. Brain reference
20.2 requires local conformance, including required grain/uniqueness assertions.

Compare: full-revision inheritance violates Project applicability; parsing
review prose manufactures meaning; unconditional VALID or an always-empty
context hides missing proof. A generic semantic engine would add unsupported
scope. The leading proposal is a bounded typed input contract at the existing
Brain and Project owners, with explicit executable assertion kinds and their
proof producers, not a new Context service or Product operation.

Proposed input responsibilities (field names remain a schema proposal):

| Input owner | Required content / identity | Forbidden inference |
| --- | --- | --- |
| Immutable Workspace Brain revision | Canonical item IDs; explicit relation to browse concepts; typed dependencies and required assertions; assertion scope and admitted proof kind | Browse `conceptRef` becoming a semantic ID; an independent duplicate ID for an already canonical analytic semantic ID |
| Project source | Explicit selected/local-realized canonical IDs, local mappings/refinements, referenced source inputs and their digest closure | Missing input becoming an empty selection; PRJ-11 editing APP-owned realization |
| Exact admitted proof producer | Assertion ID and predicate version, Project, Brain revision/digest, local-input digest, execution subject, outcome and immutable provenance; freshness/basis where required | A caller-written PASS, timestamp or unresolvable string becoming proof |
| Brain health owner | Revision-global health keyed to validated canonical item identities | Project-local conformance becoming global Brain health, or an unjoined health row making a concept usable |
| Brain binding validator | Deterministic applicability closure and conformance result bound to exact revision, Project, local input and proof identities | A stored `binding_validation` row itself proving the assertions |

The source successor must define a closed schema version rather than silently
loosening v1. Preserve existing published immutable v1 revisions and their
Workspace reads; do not invent canonical IDs or proof for them. Legacy material
without sufficient typed inputs remains ineligible for the new Project
admission path until explicitly republished with the required inputs.

Proposed derivation:

1. Resolve the exact revision and the Project's explicit local realization;
   validate canonical-ID joins and dependency closure. Reject missing,
   ambiguous, foreign or unsupported inputs. Required assertions must state
   whether they are revision-global or apply to selected dependency closure;
   an empty selection must not bypass global requirements.
2. Execute or resolve each assertion through its admitted producer. A
   structural/source proof can satisfy only a structural assertion; it cannot
   establish physical data uniqueness or grain. A physical assertion requires
   an exact controlled data/Gateway proof and its current subject/freshness.
   Failures, missing coverage and unknown producer custody refuse admission.
3. Freeze revision, local-input/proof digests and applicability in the Project
   declaration and Brain-owned validation result. Avoid a Git self-reference:
   proof binds the pre-binding source/input closure; the binding commit must
   preserve those input bytes. Do not embed the resulting commit's own OID or
   a declaration's own digest inside the bytes from which it is derived.
4. At PRJ-11 settlement, recheck the same inputs through the recovery protocol
   in A. Recompute on material local-input change; unrelated source bytes do
   not supply fresh semantic proof. The owning contract must define the exact
   dependency closure rather than assume only one manifest file matters.
5. BRN-14 resolves current binding/local conformance and current joined health,
   then projects only the admitted applicable concepts. Critical invalid or
   suspect dependencies cannot appear usable. Health changes can alter usable
   context without mutating the immutable Brain revision. Missing health or
   conformance is not a successful known-empty context.
6. Produce opaque server-issued authoring references bound to Project,
   revision, binding/local realization and canonical item identity. Revalidate
   them at consumption; they are not authorization, browse coordinates or
   runtime effective-slice IDs. Preserve the existing detail-disclosure rules
   and four required runtime identities where later runtime consumers apply.

The important unresolved production dependency is the assertion producer, not
JSON spelling. The approval packet must name the exact grain/uniqueness
predicates and executable producer for each supported case. If this requires
a Gateway or data proof not yet admitted in P4, split that bounded prerequisite
and amend the part dependencies explicitly; do not declare P4 complete using
fixture PASS envelopes while the producer is deferred to P7. A controlled
synthetic-data proof may establish a production evaluator's bounded behavior,
but cannot prove the live Sankhya subject. No live execution is authorized by
this design pass.

Bounded proposal for the remaining owner decision: admit a versioned
APP-OWNED realization manifest, provisionally
`.conexus/brain/realization.json`, read but never authored by PRJ-11. Its
closed grammar carries canonical dataset/item IDs, selected dependency roots,
typed local mappings and the exact referenced-source digest closure. Reuse
existing analytic semantic IDs where they already own identity. This is not a
third Project-owned binding declaration. The existing source-import/authoring
entry point must demonstrate how those APP bytes reach a Project; the current
three-file NEW seed supplies no such realization. A test-created manifest
alone must not be reported as a reachable authoring journey.

The existing ingress is PRJ-03 `EXISTING_GIT`: Project `store.ts` dispatches to
`stageExistingGitProjectSource`, whose admitted catalog/locator path imports
the existing source tree. This can carry a pre-authored realization manifest;
it is not an in-platform APP writer. Use that existing ingress for the first
proposed realization-input composition once its grammar and exact APP ownership
are admitted. Prove import → immutable source/input digests → conformance →
binding, rather than injecting the manifest directly into a test repository.
The NEW path still has no APP authoring capability; do not claim this closes
the later Builder authoring journey. No new import/provider execution occurs
during this design pass.

For initial physical assertions, propose explicit dataset key tuples and a
fixed non-null/full-subject uniqueness predicate. Brain owns the intended
business grain; a unique tuple alone does not establish that meaning. The
producer must validate the local mapping to that declared grain and check
key existence, null violations and duplicate groups over the exact authorized
subject, not a sample. Unsupported predicates refuse admission. This proposal
does not admit caller SQL, arbitrary tables, a new generic query service, or
an assertion result detached from Connection/credential and source identity.
The Brain and Gateway owners still must select the registered read capability,
subject boundary and freshness/invalidation rule; these are semantic choices,
not implementation defaults.

P5 currently promises the server-derived read-only Gateway adapter, with a
local HTTP stand-in and live proof deferred. The proposed dependency correction
is to split the exact admitted assertion-read producer prerequisite ahead of
Brain-binding closure, retaining the P5 adapter owner and the separate live
proof gate. Do not move all of P5 into P4 or authorize a provider call by
reordering the packet. A complete supported production-module evaluator and
its controlled-subject proof are necessary but remain distinct from proof of
an actual customer's grain and uniqueness.

**Producer dependency falsifier found during detailing:** §4.3 admits only
`sankhya.company.read.v1`, a single-company read. The exact production
`apps/hub/src/connections/qualification.ts` response port decodes a bearer and
MATCH/MISMATCH for the configured company; it has no dataset, key tuple,
duplicate/null count or snapshot-completeness result. Its successful
qualification cannot prove dataset grain or uniqueness. Section 1 also
explicitly excludes realized registered Queries/read models from R2. Therefore
moving the existing P5 adapter earlier is necessary plumbing at most, not a
sufficient producer solution. The proposed dependency split must not be
reported as resolved by that reorder.

Smallest owner reopen: Brain §20.2 supplies the required predicate and intended
grain; Gateway §19.1 supplies a separately admitted, exact physical read proof
capability and its execution subject. Before this physical-binding path is
implementable, its owner amendment must name the capability version, source
dataset/mapping, complete read scope, coherent observation identity and
invalidation rule. TTL or Connection qualification alone is not a dataset
snapshot identity. A mutable provider response without a coherent complete
subject must remain insufficient for a full-subject uniqueness claim. Do not
manufacture a capability ID with no executable producer, silently extend the
only admitted company-read capability, or remove the required assertion to
make R2 pass. Resolve this exact scope amendment before final Brain contract
ratification; provider-specific validation requires its separate proof grant.

Dependency direction for that amendment: Connection qualification and Project
Connection binding must be possible without prior Brain admission; physical
proof resolves that binding server-side; only then may PRJ-11 admit the Brain
binding that requires that proof. The proof capability cannot itself require
the not-yet-admitted Brain binding as authorization. It receives the candidate
revision/assertion as validation input, never as a grant. This corrects the
illustrative Brain-first order in §1 only if the amendment is accepted; it does
not alter current accepted execution scope by itself.

Deciding counterexample: two Projects adopt the same Brain revision and health
snapshot, but only one satisfies its required local grain/uniqueness proof.
The first yields a nonempty, exact Project context; the second cannot adopt or
disclose the same usable context. Also falsify foreign/local-input drift,
missing assertions, forged proof, health-join mismatch, stale authoring refs,
dependency omission, explicit known-empty versus missing input, and
purpose-bound detail leakage. None of these tests may use reviewText as input
to semantic admission.

#### C.1 Bounded Brain/Gateway admission decision — scope approved, 2026-09-05

The operator requested two parallel fronts: finish the already-authorized
recovery proof and resolve this Brain prerequisite. This section narrows the
actual owner amendment. After the duplicate-Budget example, the operator
approved the limited internal registered aggregate capability and its
controlled-data implementation/proof. This does not ratify customer mappings,
production source executors, a completed Brain source schema or provider calls.
Brain §20.2 and Gateway §19.1 remain controlling. Required conformance is not
removed from P4.

The smallest sustainable candidate is one **Gateway-owned registered
key-conformance read**, consumed internally by Brain admission. It is not a
generic query service, a new public Product operation, an entire P5/R3 advance,
or a Brain-selected URL/SQL execution port. The existing company-read
qualification remains unchanged and cannot issue this proof.

The candidate contract has five bounded responsibilities:

| Owner | Proposed deciding input / behavior | Must refuse |
| --- | --- | --- |
| Brain immutable source successor | Closed versioned canonical semantic IDs, dependency closure, declared grain, required assertion IDs/kinds and joins to browse/health identities; preserve existing v1 reads and immutable revisions | Prose-derived meaning, unjoined browse IDs, unknown kinds, or omitted required physical assertions |
| Project local realization | One explicitly classified APP-OWNED realization manifest carried by the existing admitted `EXISTING_GIT` ingress; map canonical IDs to registered physical subjects and close exact referenced-source digests | PRJ-11 writing APP files, a test-injected manifest claimed as an authoring journey, missing ownership/input closure, or treating NEW as already having Builder authoring |
| Gateway physical producer | Resolve the registered subject/query version and exact current Project Connection binding server-side; execute a bounded read-only aggregate over one complete coherent observation; retain request/definition/binding/observation provenance | Caller SQL/table/URL, samples, truncated pages, missing coherence, stale binding/credential basis, or company qualification substituted for physical proof |
| Brain binding validation | Match declared grain/mapping and every required assertion to that producer's exact subject; freeze source/input/proof identities through the existing Project recovery protocol | Stored VALID without executed proof, substituting newer inputs at settlement, empty selection bypassing requirements, or the not-yet-admitted Brain binding authorizing its own physical proof |
| Project Brain context | Derive applicable dependency closure from the admitted local realization plus current joined health; issue distinct Project/binding/item-bound authoring references | Whole-Workspace inheritance, missing input reported as known-empty, unusable critical dependencies disclosed as usable, or an authoring reference treated as permission |

The first physical predicate is deliberately narrow: validate the declared
source-qualified key mapping, then count missing/null key components and
duplicate key groups over the registered population. Zero violations proves
that predicate for that observation, not the business meaning of the grain,
ongoing uniqueness, synchronization correctness or all Budget calculations.
Business grain still comes from accepted Brain/Product meaning. A genuinely
empty complete subject must remain distinct from a failed or incomplete read;
neither absence nor a successful HTTP status establishes mapping conformance.

No arbitrary freshness interval is proposed. The proof must name its coherent
observation, statement/query version, exact source/Connection scope and input
closure. Settlement rechecks those owner identities and any explicit producer
invalidation. A request ID, response digest or timestamp alone does not prove
cross-page consistency or that mutable data is unchanged. The physical
producer's supported observation and invalidation contract is an admission
condition, not a guessed implementation default.

Current official documentation supplies a concrete qualification direction:

- [Sankhya Gateway services](https://developer.sankhya.com.br/reference/requisi%C3%A7%C3%B5es-via-gateway)
  lists `DbExplorerSP.executeQuery` in the MGE module. A fixed registered
  aggregate through that service is a candidate transport, not an admitted
  capability or proof of its isolation/response semantics.
- [Sankhya loadRecords](https://developer.sankhya.com.br/reference/get_loadrecords)
  documents offset pages and `hasMoreResult`. The consulted page does not
  establish a common immutable observation across pages; consequently this
  documentation alone is insufficient for full-subject uniqueness proof.
- [Budget semantic owner §3](../../product/budget-analyzer-contract.md#3-accepted-f1-semantic-boundary)
  fixes one exact source-qualified document header as the Budget grain but
  explicitly leaves its physical identity/mapping to later source proof. Do
  not promote the historical operation-code/table hypotheses into a registered
  production subject merely to fill this prerequisite.

The finite admission obligations are therefore:

1. Preserve the approved limited internal capability scope; complete exact
   schema/ownership admission for its Brain consumer without granting ERP
   access or selecting a customer's mapping by inference.
2. Bind one exact registered subject and fixed read definition to supported
   provider/response/coherent-observation and invalidation semantics. Confirm
   the complete source-qualified key mapping through its separately authorized
   source-admission proof; no guessed physical columns or capability IDs.
3. Implement the closed producer/validator/context path and its exact
   source-import composition. Controlled data may prove the production
   evaluator and transport behavior, but never qualifies a live ERP subject.
4. Demonstrate the two-Project counterexample from C, with real producer
   evaluation, plus missing/forged/stale proof, health mismatch, current-subject
   drift and disclosure controls. Reuse Project recovery rather than introducing
   another receipt coordinator or new owner.

The comparison is closed unless a material falsifier appears: company-read
reuse is insufficient; paginated reads without demonstrated coherence are
insufficient; an always-refused Brain implementation does not complete P4;
moving all of P5/R3 or adding a general semantic/query engine is unnecessary.
The candidate above advances only the exact prerequisite. Operator scope
acceptance, concrete source admission and independent challenge remain distinct
from local fixture success.

#### C.2 First executable registered-conformance increment

Protected checkpoint: an internal conformance request can select only a
trusted registered query, receives scope from an owner resolver, executes its
trusted observation port, and distinguishes predicate success, assertion
failure and unavailable/incomplete observation. It cannot accept caller SQL or
caller-provided PASS. This increment proves producer orchestration/evaluation;
it does not complete PRJ-11/BRN-14 or qualify a live adapter.

Exact file envelope: new `apps/hub/src/gateway/key-conformance.ts` and public
domain entry `module.ts`; new `tests/implementation/r2-p4-key-conformance.test.mjs`
and `r2-p4-key-conformance-postgres.test.mjs`; P4 script wiring in `package.json`;
current Gateway reference, this packet and roadmap. No dependency, migration,
role, HTTP route, server activation, source bootstrap or credential change.

Trusted composition supplies a closed registry of query identity/version,
Project/Workspace/Connection/environment, dataset/grain/mapping identities and
its separately admitted observation executor. Runtime requests carry only
account, Project, registered-query identity and expected source/input digests.
The owner resolver returns the exact qualified binding, credential generation,
source/input identities and source-scope identity; absent/refused resolution
prevents any observation. A before/after identity mismatch yields no proof.
Registration and resolved inputs are copied/validated before asynchronous use.

Observation contains raw decimal aggregate counts (total rows, null-key rows,
duplicate complete-key groups), a producer-owned complete coherent observation
identity and exact query/subject digests. It does not contain a PASS supplied
by the caller. Validate closed shapes, unsigned bounded decimal counts and
arithmetic consistency; evaluate null/duplicate predicates locally. A zero-row
complete observation is explicitly empty, not a missing result. Preserve
ASSERTION_FAILED versus INDETERMINATE. Returned identity binds registration,
resolved scope and observation; it conveys no new permission or arbitrary TTL.
The executor remains a trusted internal boundary: its coherent-observation
claim requires separate adapter admission, never mere DTO validation.

RED controls: unknown/duplicate query identity, malformed/extra request fields,
cross-scope registration, missing authority, mutable registry/resolver input,
stale source or credential, incomplete/foreign observation, malformed/unsafe
counts, provider exception, duplicate/null keys, and empty complete source.
Controlled PostgreSQL proof runs one fixed registered aggregate under read-only
repeatable-read against synthetic data and records its actual snapshot. It
proves this controlled executor plus the production evaluator; no PostgreSQL
direct-source or Sankhya adapter is thereby installed in production.

Executed controlled proof (`2026-09-05`): the production Gateway evaluator
passed ten unit cases and the PostgreSQL aggregate test passed against the
disposable PostgreSQL 17.10 fixture (31.46 seconds). The fixed statement
observed unique keys, duplicate groups, null keys and an explicitly empty
company population; other-company duplicates did not contaminate the selected
population. The SELECT-only role refused INSERT, the aggregate transaction
reported read-only, and a credential-generation change after the actual read
yielded INDETERMINATE. The resolver and physical mapping are controlled
fixtures, not production owner resolution or an admitted Sankhya adapter.
Reproduce with `npm run r2:p4:conformance:postgres` and explicit local
`CONEXUS_TEST_DB_*` configuration. No live ERP or model call was made.

#### C.3 Authorized v2/realization successor and Fable design adjudication

The operator subsequently authorized the Brain v2 plus APP-OWNED Project
realization contract and requested Claude Code Fable assistance to determine
its concrete shape. This authorizes that bounded input successor, not actual
Sankhya access, customer mappings, arbitrary SQL or new public operations.
The single design challenge is oriented by
`4f-r2-p4-brain-contract-challenge.md`; it is not independent closure evidence.

Claude Code 2.1.257, alias `fable`, effort `xhigh`, resolved model
`claude-fable-5-1`, session `5c4924d6-8560-4884-be78-df6a7561a472`, completed
read-only with exit 0. The CLI reported USD 8.6779745 estimated usage cost
(not an asserted invoice). Raw output remains outside Git at
`/tmp/conexus-p4-brain-contract-fable-23627f5/conexus-review-result.json`.
The report classified two Product/plan gaps and four local execution gaps.
No ERP calls, implementation edits or second review lane were executed.

Lead disposition against the existing owners:

- F1, BRN-14 unusable-state projection: retain the concrete missing vocabulary
  and stale/health-blocked behavior as an affected response-owner decision.
  The existing wire already has `validationState`, so do not describe the
  entire representation as absent or add another operation. Missing dependency
  and health cannot be relabeled as known-empty. This does not block input
  parsers and joins; resolve before implementing those response branches.
- F2, NEW realization: retain the explicit limitation, not an automatic R1
  custody amendment. First input ingress remains EXISTING_GIT. Missing manifest
  refuses; NEW must not be claimed as an authoring/adoption journey. A seed
  successor requires its separately scoped custody work; historical pins stay.
- F3, shared recovery: accept. Existing SQL/store recovery is Connection-
  specific even though Git admits both paths. Extend the one Project intent
  serialization boundary; do not create a competing Brain intent coordinator.
- F4, ownership: accept. Admit the exact APP manifest through the existing
  ownership successor and consumer, never a wildcard `.conexus/**` exception.
- F5, imported binding bytes: retain the falsifier. Imported platform binding
  declarations cannot silently replace DB truth or be overwritten unnoticed;
  close the source/DB divergence path before imported binding writes activate.
- F6, roadmap chronology: accept as non-blocking; use one current next-action
  paragraph instead of treating historical pauses as renewed approval needs.

Do not automatically adopt the reviewer's suggestion that `brain.bind` alone
may trigger a physical ERP read: it cannot widen the independently accepted
`connection.use` fact. Source-read authorization remains an explicit owning
security decision, and no real executor is activated by this review.
Likewise selected-only assertion scope, manifest-only digest closure and
deterministic authoring-reference fields are proposals, not proof that arbitrary
referenced APP inputs or revision-global requirements may be ignored. The
concrete schema must explicitly forbid unsupported inputs rather than infer
their absence. Preserve separate local conformance and global health facts.

The executable next slice can proceed on the authorized v2 source parser,
canonical browse/health joins and closed Project manifest, preserving v1 reads
and demonstrating missing/unknown/foreign identity refusals. Bind exact fields,
ownership and tests before those edits. PRJ-11 settlement, BRN-14 projection
and the real-source qualification remain distinct consumers, not claims of
parser-only completion. This round does not close P4 or replace Fable+AGY
challenge of the eventual coherent implementation candidate.

#### C.4 Typed-input executable slice

Outcome: bootstrap and runtime accept the same closed Brain v2 grammar, join
canonical browse/health identities, preserve v1 reads and reject unsupported
inputs. Project resolves explicit selected dependency closure and required
mapping obligations, including revision-global assertions under empty selection.
The semantic grammar is owned by Brain reference 20.2.1, not the tests.

Envelope: new Brain-owned pure `packages/brain-contract/src/index.mjs` and
`index.d.mts`, shared by `scripts/bootstrap-r2-brain.mjs` and Brain `store.ts`;
new `apps/hub/src/project/brain-realization.ts` and its public module export;
new `tests/implementation/r2-p4-brain-inputs.test.mjs`, P4 package script wiring,
Brain owner, this packet and roadmap. A shared pure parser avoids divergent
bootstrap/runtime acceptance without moving Brain meaning into platform or
adding a service/dependency. Existing browse HTTP responses must strip itemRef
and typed source internals rather than silently expand their closed wire.

Functions: validateBrainSource and validateBrainHealth(health, source) at the
shared parser; preserve v1 grammar/return behavior. Closed v2 items/assertions
as 20.2.1; max 2,048 items/concepts, 128 domains, 4,096 assertions, 2,048 edges
per item, bounded 256-character IDs, source canonical size <=1 MiB. Health
coverage is exact for v2. Project parseBrainRealization(input, source) returns
captured manifest, sorted applicable item IDs, required assertions and canonical
inputDigest; it validates mappings and source-reference syntax but performs no
I/O or physical conformance. Source-path ownership/digests require the later
admission consumer and cannot be claimed by this parser.

RED: legacy reads preserved; extra fields, unknown version/kind/predicate,
duplicate/foreign IDs, missing dataset assertions, dangling joins/edges, cycles,
missing/foreign health coverage, absent manifest, mapping mismatch/omission,
extra mappings, empty-selection bypass of global requirements, traversal or
platform/self references; v2 internals absent from browse responses. Proof
class: production parsers/store with contract fixtures, not published real
Brain or imported Project/adoption journey. No migrations, R1 ownership pins,
routes, grants, providers, seed edits or new runtime effects. Stop on any
semantic or import-law contradiction; no new reviewer round for these mechanics.

#### C.5 Frozen realization source verification

Outcome: the internal Project consumer resolves the exact APP manifest from
the production source snapshot, parses it against the exact supplied Brain
source, and verifies every declared APP-file digest from that immutable Git
revision. Missing/wrong ownership, missing files, digest mismatch, malformed
manifest or stale source refuse before any binding/proof mutation.

Envelope: extend `brain-realization.ts` with `readProjectBrainRealization` and
export via Project module; new `r2-p4-brain-source.test.mjs` and P4 script wiring.
The existing R2 ownership profile/generator/projection/receipt/tests gain exactly
`.conexus/brain/realization.json`, APP-OWNED, ownerRef `Project APP`, version v1.
Preserve both PLATFORM-CONTRACT binding entries, collision rejection, all
historical R1 receipts and the three-file NEW seed. Classification adds no file
and is not authority for PRJ-11 to author APP bytes. No wildcard path ownership.

The reader receives a trusted ProjectSourceSnapshot, expected source OID and
Brain source. Capture listing metadata, require exact APP ownership and bounded
manifest size, read manifest bytes and recompute their SHA-256 against listing
and read result. Parse the closed grammar. Validate reference existence,
APP ownership and raw file digest against the captured listing: the production
Git listing itself reads/hashes every blob, including binary files. It is not
a caller-written digest registry. Re-read the manifest at the end through the
same source-bound port, rejecting HEAD drift or changed bytes. Return captured
source OID, raw manifest digest, verified file metadata and parsed obligations;
this proves source inputs, not ERP conformance, permission, current health or
binding admission. The existing snapshot's 256-KiB text-read limit applies to
the manifest; no production budget is raised. Referenced binary files need no
text decoding. Later settlement must revalidate source/binding basis.

Proof: module fixtures fire wrong source, duplicate/malformed listing entries,
missing/non-APP manifest or input, mismatched hashes, changed manifest and
source-race controls. A bounded real admitted OCI Git snapshot test reads a
synthetic bare repository (including a binary APP input), rejects wrong hashes
and stale source, and leaves refs/objects unchanged. This is production-reader
proof, not EXISTING_GIT admission, authoring, DB settlement or a provider call.
No source-snapshot/Mastra API, migrations, roles, routes or provider changes.

#### C.6 Source/DB declaration concordance before staging

Protected outcome (C.3 F5): a Connection command cannot overwrite imported or
orphaned platform declarations inconsistent with the Project DB. Extend the
existing single-intent coordinator, not a second recovery authority. Before
PREPARING can stage objects, read both binding projections through a restricted
Project SQL function under the same Project/intent lock and exact version.
Return the complete sorted current Connection declaration and the current
Brain binding digest (null means absent). Hash canonical Connection bytes in
the Hub; the pinned Git stager compares raw SHA-256 for both reserved paths at
S0 before any object write. Empty Connection projection admits either no file
or exactly canonical `{"bindings":[]}`; a missing populated declaration,
foreign bytes, non-regular entry, or unexpected Brain file refuses. No import
repair, adoption of imported authority, or normalization of foreign bytes.

Envelope: migration 013 adds only the restricted projection function, preserves
001–012, and refuses upgrade with active intents rather than grandfathering
unchecked APPLYING tuples. Existing migration loader/Atlas custody and P1/P4
migration-census tests advance to 013.
`binding-recovery.ts` calls the function only in PREPARING and supplies exact
checks to `git-execution.ts`. Low-level Git capability remains usable by its
existing qualification fixtures; production coordinator must always supply
both checks. No roles, HTTP fields, ownership classes, provider calls or new
Brain writes. The future shared Brain command must reuse this same check.

RED/proof: restricted PostgreSQL function denies wrong actor/version/state;
returns current DB projection, not caller assertions; migration rejects active
upgrade. Production coordinator fixture proves both checks are passed and
failure cannot freeze/apply. Real pinned OCI stager proves matching/absent
nominal and foreign/missing Connection or Brain declarations refuse before
repository mutation. These prove module boundaries, not full imported-Project
adoption or Brain settlement. Stop for a changed semantic/permission owner;
finish with targeted checks, repository verification and explicit remaining
Brain settlement/BRN-14/physical-proof/review census.

#### C.7 Operator-approved adoption permission and unavailable context

Operator approval: `2026-09-06 / sim` to the two-rule proposal. This resolves
the C.3 source-read permission decision and F1 response-owner gap; it does not
establish their runtime implementation or close P4.

The permission owner now requires `project.manage + brain.bind` plus current
`connection.use` for each required Connection-backed physical proof, checked
before execution and again at settlement. No physical-read requirement means
no unconditional use-grant requirement; removal/narrowing is unchanged.
Registered scope, source/egress admission and separate live-proof authorization
remain necessary. No Sankhya execution, customer mapping or credential transfer
is authorized by this approval.

Brain §20.2.2 and the existing BRN-14 wire use the admitted 503 Problem branch
for stale/missing local conformance or unavailable/blocking required health,
after disclosure checks. No usable domains/authoring refs are returned; 200
with empty domains remains genuine validated known-empty. No new global state
enum, operation, persisted-state rewrite or read-triggered revalidation.

This owner-amendment envelope is permission contract, Brain reference, BRN-14
OpenAPI descriptions, this packet and roadmap, plus regenerated source-digest
metadata in Hub `r2-routes.ts` and Web `r2-client.ts`. Contract verification checks
the unchanged operation/response/field census. Runtime falsifiers for the shared
settlement/context consumer: missing/revoked use authority must prevent proof
execution/admission; stale or health-blocked context must not return 200 or
authoring refs; validated known-empty remains 200. Proof of these runtime
claims belongs to the subsequent implementation, not this documentation edit.
Do not reopen either approved rule for routine implementation mechanics.

#### C.8 Executed proof consumer for Brain adoption

The next executable dependency joins C.4/C.5 source inputs to the C.2 Gateway
producer. The Brain validator must derive requirements itself from canonical
v2 source and the verified Project realization, require exact dataset/grain/
mapping registration before an observation, and execute every required
assertion. Foreign, omitted, failed or indeterminate proof cannot create a
VALID adoption candidate. Freeze Brain revision/digest, pre-binding Project
source/input identities, applicability and complete proof provenance without
embedding the future commit or the declaration's own digest in its bytes.

Envelope: Gateway `key-conformance.ts`/module and focused tests gain a closed
optional expected-mapping argument on the existing internal execute capability;
when supplied, match registration before resolver/observer execution. PROVEN
results also expose their captured registration, subject and coherence, whose
digests already participate in proof identity. No caller SQL or result-as-PASS
input. Brain-owned `binding-validation.ts` and its tests consume that production
capability, with public export through Brain module; Project remains owner of
source reads and binding intent, and supplies its verified realization through
the internal port. Mechanically move the existing pure realization grammar
into the shared `packages/brain-contract` public entry and preserve Project's
re-export and source reader; both owners use the same parser without a runtime
Brain→Project→Brain module cycle or duplicated applicability rules. This
changes code placement, not manifest semantics or APP ownership. Existing
input/source tests must remain unchanged and pass. No route activation, new permission, provider registration
or physical-source qualification is implied by this module increment.

RED: wrong dataset/grain/mapping cannot execute a read; a malformed optional
mapping cannot bypass checks; canonical requirement omission, foreign Project/
revision/source/input, failed keys, missing producer and incomplete proof
refuse; empty selection cannot bypass REVISION assertions. Tests compose the
real parsers and producer with controlled observation/authorization ports,
explicitly not production SQL authorization, ERP or final adoption proof.
Then integrate the validator into the one shared Project settlement boundary
and BRN-14 under C.7; do not stop delivery at this intermediate module or claim
P4 complete without that integration and required independent review.

C.8 implementation status (`2026-09-06`): the shared parser move, closed
expected-mapping producer input, frozen PROVEN provenance and Brain-owned
validator are implemented with focused RED/GREEN coverage and included in the
P4 check. Independent review found two fail-closed defects: duplicate groups
were bounded against all rows instead of non-null rows, and proof text fields
were not fully grammar-checked. Both were corrected with regression coverage;
Hub typecheck, import law, lint and the local P4 gate pass. The validator
intentionally consumes a Brain-owner-supplied revision/digest/source tuple;
the settlement must obtain and recheck that tuple through the authoritative
Brain port rather than guessing the bootstrap digest byte grammar. C.8 creates
no durable binding and does not close P4. C.9 is the discriminated successor of
the existing shared Project intent/recovery protocol, not a second coordinator.

#### C.9 Shared Brain/Connection settlement successor

C.9 extends `project.binding_source_intent` in migration 014 with a closed
`CONNECTION | BRAIN` discriminator while preserving every 012 Connection
function signature and recovery outcome. A Brain intent carries the exact
Brain revision/digest, semantic current subject (`ABSENT` or the current
`projectBindingDigest`) and the C.8 canonical VALID candidate as its Project
declaration. The declaration digest is computed only from those canonical
bytes and remains outside them. The existing Git stage/apply/cancel protocol
selects the fixed declaration path from the discriminator and always checks
both reserved binding declarations through C.6 before object creation.

The authoritative Brain/Registry port supplies the closed revision/digest/
source tuple to validation; Project never reconstructs the Brain source digest.
Before admission and again at durable SQL validation/settlement, require
`project.manage + brain.bind` plus `connection.use` for every distinct exact
Connection proof subject. Recheck Project/Workspace containment, current Brain
revision identity, Project source and local input identities, current
Connection revision/environment/qualification/credential generation, mapping
and proof identities, and semantic current binding. No candidate or stored
validation row authorizes its own proof. Narrowing PRJ-12 remains
`project.manage` only and will use this same recovery protocol when activated.

Persist complete frozen candidate/provenance in the existing Brain-owned
`brn.binding_validation` record through a narrow owner function; the Project
runtime role receives no validation-write function and no table DML. A
dedicated `hub_r2_brain_attester` login is the bounded validation attester. It
receives only schema usage plus exact candidate-read and attestation-persist
function execution: no publication, health, Project settlement, table DML,
owner membership or grant option. Project admission requires that immutable
attestation under the same UUID later used by the intent, matches it
byte-for-byte, and still rechecks Registry assertion coverage, IAM facts and
the latest exact locked Connection qualification subject. A caller-supplied
candidate is never an attestation and no Project role can self-issue one. The
separate pool establishes database-credential separation inside the trusted
Hub process; it does not claim isolation from compromise of that process.

Atomically settle `project.brain_binding` and the Project source CAS after the
Git child exists. Crash/replay/refusal uses the existing intent states and
cancellation commits. Migration/catalog/ACL, accumulated predecessor
function-source/privilege checks and discriminated recovery mechanics precede
route activation. PRJ-10/11 and BRN-14 may now compose this boundary. PRJ-12
must first close the exact canonical cleared-source representation; accepted
authority currently defines neither Brain declaration absence nor an empty
Brain declaration. No route, live ERP read, provider configuration or
deployment is implied by the migration/recovery increment alone.

#### D. Proposed delivery order and approval boundary

First resolve A and its source-consumer/ownership integration in B; verify
Connection binding followed by the real R1 source consumer, including aborted
and delayed attempts. In parallel, finish C's exact typed predicates, producer
and source-input contract at Brain/Project owners. Only then compile the
corrected P4 code packet with exact files, migrations, proof and non-goals.
Do not replace the full Brain outcome with an always-refused implementation.

The operator accepted the direction for detailing, not a generic receipt
framework, new Product APIs, R3/RB work or production execution. E now supplies
the recovery/ownership state machine, proposed file/receipt envelope and RED
matrix. C identifies a concrete producer scope gap: the admitted company read
cannot prove dataset grain/uniqueness. The next measurable checkpoint is
challenge/adjudication of E and an exact Brain/Gateway capability-owner
amendment resolving C, followed by final contract acceptance and execution
authority. Do not start product edits under this design-only grant. AGY access
remains a separate review dependency; the prior implementation lane does not
review this changed design.

#### E. Recovery/ownership executable-packet candidate

Operator implementation approval: `2026-09-05 / Aprovado` after the explicit
delivery-stall reset authorizes A/B/E as the bounded recovery/ownership slice.
This supersedes earlier design-only and no-new-intent restrictions for this
slice only. Brain/Gateway remains separate design work. No gate is closed by
this grant; real proof and independent review remain required.

Observable checkpoint: an admitted Connection-binding attempt either settles
or is abandoned without leaving PRJ-07 unable to inspect the Project source.
This checkpoint does not close Brain binding, P4, or a model-backed journey.

Exact future file envelope (new names below are proposed output paths):

| Owner / responsibility | Implementation paths |
| --- | --- |
| Project durable intent, restricted transitions and source/receipt interlock | new `apps/hub/migrations/012_r2_project_binding_recovery.sql`; regenerate `apps/hub/migrations/atlas.sum` through the admitted tool; preserve migrations 001–011 |
| Exact migration admission and repeatable verification entry | `scripts/run-hub-migrations.mjs` admits only the new 012 checksum in addition to unchanged prior pins; `package.json` wires the new classification check and targeted tests into the existing P4 check, without dependency changes |
| Project orchestration, replay, admission and bounded reconciliation | `apps/hub/src/project/store.ts`; new `apps/hub/src/project/binding-recovery.ts`; `apps/hub/src/project/module.ts` |
| Existing server composition | `apps/hub/src/server.ts` injects the Project binding reconciliation capability into Inception; require the same storage root when both configurations are enabled; this Connection-only recovery slice creates no new runtime login role or credential surface. C.9 separately owns the later dedicated Brain attester credential |
| R1 composition proof correction | `tests/implementation/r1-s2-reads.test.mjs` checks the shared pool and actual runtime guard rather than requiring a removed TypeScript non-null assertion; preserve behavioral read/close checks and include a wrong-pool negative control |
| R1 receipt serialization proof correction | `tests/implementation/r1-r1c14-native-readmission.test.mjs` canonicalizes the existing admitted receipt for its key-ordering control; do not invoke historical receipt publication against the evolving worktree, alter receipt bytes, or relax transition verification |
| Admitted OCI object staging, exact apply/cancel CAS and object verification | `apps/hub/src/project/git-execution.ts`; no image/version change or host-Git fallback |
| R1 pending-source handling and current-source refusal mapping | `apps/hub/src/project/inception.ts`, `source-snapshot.ts`, `routes.ts` in the same Project module; no Mastra/model adapter change |
| Classification input, deterministic generation and runtime consumption | new `profiles/r1/v1/r2-project-binding-ownership.json`, `scripts/generate-r2-project-binding-ownership.mjs`, `apps/hub/src/generated/r2-project-binding-ownership.ts`, `runtime/r1/.conexus/r2-project-binding-ownership-receipt.json`; consumer in Project `module.ts` |
| Recovery/source-consumer and ACL falsifiers | extend `tests/implementation/r2-p4-project-bindings.test.mjs` and `r1-s6-project-inception.test.mjs`; new `tests/implementation/r2-project-binding-ownership.test.mjs`, `r2-project-binding-migration.test.mjs` and `r2-project-binding-git-recovery.test.mjs`; update only the admitted migration census in `r2-p1-foundation.test.mjs` to include 012 |

The classification input contains exactly the two reserved binding paths and
their PLATFORM-CONTRACT class, version and owning contract references. The
generated module carries the input digest and sorted entries. Its receipt
pins the input, generator and generated-output digests; output must not embed
its own receipt digest. The consumer imports the generated projection rather
than reading a mutable runtime receipt as authorization. The generation check
must reject a changed input/output/receipt relation. Existing S2 manifests,
generation receipts, NEW seed bytes and seed commit identity remain unchanged.
This narrowly scoped profile successor neither rewrites runtime history nor
claims to repair the separately recorded inherited provenance failures.

`project.binding_source_intent` is the proposed single new Project operational
table. Persist intent UUID, original actor, Project/Workspace, operation,
expected-current command, S0, declaration path, exact old-presence/old-bytes
and new-bytes identities, frozen semantic basis, fixed Git metadata, nullable
A/C0/C1 OIDs, state/version and terminal response or refusal. No credentials,
provider rows or real ERP data enter this record. One partial unique index
admits at most one nonterminal intent per Project. The Project owner alone
writes it; login roles receive only the exact SECURITY DEFINER functions with
fixed search paths and no direct DML or cross-owner table grants.

| State | Admitted transition / evidence | Forbidden transition |
| --- | --- | --- |
| PREPARING | Original admission plus Project lock freezes the immutable command; deterministic staging reconstructs identical A/C0/C1 after a crash; freeze OIDs and advance to APPLYING; a staging refusal/failure may instead CAS the exact unfrozen state/version to retained ABORTED with unchanged S0 and no Git or binding mutation | Any main-ref mutation before durable OID freeze; abandonment after a competing worker froze OIDs |
| APPLYING | Exact S0→A CAS or recognition of exact A; current original-actor authority and unchanged frozen basis permit atomic binding/source + COMPLETED; otherwise commit ABORTING | Replacing Q1 with Q2; changing command or actor; treating an OCI timeout as proof no write occurred |
| ABORTING | Only exact S0→C0 or A→C1, or recognition of exact C0/C1; then old bindings + cancellation source + ABORTED atomically | Returning to APPLYING, resetting main to S0, settling an old worker's success |
| COMPLETED / ABORTED | Retained identity/outcome; authorized replay or current-state response without another write | Reusing the intent UUID or reactivating it |

Recovery of PREPARING re-stages the same deterministic objects and freezes them
before deciding apply or cancellation. It must not simply delete the intent:
another stager may still be alive. A failed stager may fence that exact
PREPARING version through the existing Project abort function, retaining an
ABORTED record with all staged identities null and terminal source S0. A late
stager can create only objects: its subsequent freeze CAS must refuse, so it
never obtains ref-write authority. An unknown abort-transaction outcome is
resolved by rereading that exact intent; a competing APPLYING row is not
abandoned. No pruning or source repair follows this abandonment. This resolves
the accepted PREPARING liveness finding without a new state, role or operation.
Staging has no ref-write capability. The
ref-writing invocation receives only the frozen tuple, never a mutable latest
command. Every transition locks Project then intent in the same order; semantic
owners revalidate through their admitted functions. Do not hold a DB transaction
open across the OCI process. If a semantic refusal is raised, roll back that
transaction, then record ABORTING with a state/version CAS in a new transaction;
never assume a flag written in a rolled-back transaction survived.

Reconciliation is a Project-internal capability invoked on pending work at
binding-command and PRJ-07 entry, not a new public operation or generic worker
framework. A reader cannot choose an intent, replacement declaration or actor.
Its request permission does not become the original writer's permission:
completion revalidates the stored actor; abandonment restores only the frozen
prior content. Apply and abort are both repeatable after response loss. Bound
each invocation to inspection and one apply/cancel attempt; a raced head returns
conflict for a later continuation, never an unbounded request loop. Retain
terminal rows without an automatic TTL in this increment; disposal requires a
separate demonstrated retention/restore contract. Backup/restore must preserve
nonterminal intent plus staged object closure, with writes quiesced; a mismatched
restore refuses source writes rather than inventing missing intent truth.

PRJ-07 reservation must test pending intent under the same Project lock used by
binding admission and return its existing bounded conflict before model work.
If binding starts after reservation, snapshot preflight must distinguish a
known pending/source-changed race from unsupported source and return 409; keep
the existing Inception failure/receipt cleanup and final source-stale check.
Run that source preflight explicitly before invoking cognition; a source-list
tool first used by an already-running model is not a no-model-call guard.
Once a model call has begun, a subsequent valid source mutation may still make
its candidate stale; do not promise cancellation of already-running cognition.
Unauthorized callers receive existing disclosure-safe errors before intent
details. PRJ-14 keeps current 403/404/409/412/422/503 distinctions and PRJ-15
keeps its existing expected-current 412 contract. Reconciliation is not success
for a new command: after recovery, re-admit that command against current state.

Upgrade admission must inspect for pre-intent Git/DB divergence. A legacy orphan
without durable intent is not automatically attributable to this new protocol;
do not backfill intent from a matching filename or rewind it. An exact existing
target would require a separately bounded recovery decision before enabling
writes. No deployed orphan target has been established by this design pass.

Deciding RED matrix: (1) Q1→Q2 after A; (2) actor/use revocation or credential
rotation after A; (3) crash at every state boundary; (4) delayed apply after C0,
after C1 and after a later intent; (5) two Project commands racing; (6) unknown
head with byte-for-byte no mutation; (7) R1 list/read after apply and each cancel;
(8) pending-before-reservation and pending-after-reservation with no new model
call; (9) ownership collision, missing/generated drift and unknown APP path;
(10) restricted-role direct-DML/cross-owner refusal; (11) absent old declaration
restored as absent, not an empty placeholder; (12) restore missing staged object
closure refused. Use real admitted OCI Git and restricted PostgreSQL for 1–7,
10–12; controlled cognition spies prove only the no-call branch in 8. Generation
and contract fixtures cover 9, plus real source consumer composition in 7.
No fake Git result or fabricated PASS row closes the recovery claim.

Completion requires this matrix, current owner-isolation proof, Linux `npm ci`
and `npm run verify`, applicable workflow checks including native R1C-14, and
the material independent challenge/adjudication. Unknown foreign state,
historical receipt mutation, new public operation, widening permissions or
required image/model changes stop the slice. The operator-approved mutation
envelope above does not authorize those expanded effects.

Design-pass verification on `2026-09-05`, base `1f81a22`: WSL Ubuntu,
Node 24.20.0/npm 12.0.2; `npm ci` succeeded (reported two low-severity audit
findings, no dependency changes). `npm run verify` passed its checks through
`r2:p4:check`, then stopped at `repository:check` because the two design-document
changes are uncommitted. Therefore the full verification floor is not green;
subsequent RC-01 custody/wire steps and additional workflow proof were not
executed in that command. `git diff --check` passed. No recovery implementation,
real Git/DB crash proof, live provider call or new independent review was
performed by this design pass; the proposed RED matrix is still unexecuted.

## 9. Stage proof and independent assurance

Each part runs targeted proof plus `npm run conexus:verify -- --scope` when an
admitted scope exists. Publication or stage closure requires Linux-native
`npm ci`, all applicable `.github/workflows/verify.yml` checks, including
`npm run r1:r1c14:native:check`, full `npm run verify`, and a final preflight.

Fresh isolated Fable and AGY/Gemini challenge is mandatory no later than after
`R2-P2`, again after `R2-P5`, and before `R2` closure; one whole-package round
may satisfy coincident thresholds. Lead adjudication freezes the protected
claim/blocker census before each round. No review finding may create Product
authority or recursively expand the gate.

The P1 trust-boundary review is an early material-diff checkpoint. It does not
replace the after-P2 checkpoint because P2 introduces the independently owned
Brain/Git/PostgreSQL composition that P1 does not contain.

## P4 recovery implementation challenge — Lead adjudication, 2026-09-05

The [neutral brief](4f-r2-p4-recovery-review-brief.md) binds implementation
`1c8dba3ff7e49ffb9430a05ef78fcdb615f1fb51`. Fresh Claude Code 2.1.257,
requested `fable`/`xhigh`, resolved `claude-fable-5-1`, plan/read-only session
`8987c2f2-c0e7-464e-892f-cf1f3d51c3a5` returned no method or Product/plan finding
and four local execution findings. Raw result:
`/tmp/conexus-p4-recovery-review-434d5b8/conexus-review-result.json`, SHA-256
`3c54a531c78ac5c8f3f34bae3ff588b2d68f08dc55ab6e1223549c1cbcbf0187`.
This is a static independent challenge, not independent convergence or live proof.

Lead disposition:

1. **ACCEPT — incomplete recovery proof.** The complete §E matrix is not
   executable yet, and new live tests did not complete. Exact line references
   in the reviewer report are not reliable; the substantive coverage finding
   survives direct test inspection. Restore/missing-object closure, C0/later
   intent fencing, all crash boundaries and unknown-head controls still need
   deciding proof. Existing Git mutation verifies required objects, but this
   does not substitute for restore-composition proof.
2. **ACCEPT — PREPARING liveness gap.** A deterministic staging refusal can
   leave the single active row without an exit. Decide the smallest fenced
   abandonment transition in §E before reachable deployment; do not weaken the
   frozen APPLYING/ABORTING CAS or automatically repair foreign source state.
3. **ACCEPT — Inception under 012 unproved.** Existing R1 database suites apply
   the R1 ledger, not the new trigger. Add real restricted-role trigger firing
   and reservation/replay behavior under the 012 successor; catalog equality
   and controlled cognition spies prove different claims.
4. **DEFER SAFELY — legacy Git writer removal.** No production caller remains,
   and production store/recovery types require the frozen-intent interface.
   The retained legacy function is not an observed reachable bypass. Remove
   it and migrate its tests in this P4 owner before enabling binding writes;
   any new production caller reopens this disposition immediately. Do not
   count its old tests as intent-recovery proof.

Lead also found and corrected two stale live-test expectations: staging after
A or C1 must conflict, not return STAGED. The corrected test adds byte-preservation
assertions and delayed-apply-after-C1 refusal. Local compilation/static tests
passed; these new live assertions remain unexecuted. This correction does not
establish a PASS or justify repeating review before the material gaps are fixed.
AGY was not retried against its unchanged headless read-only permission failure.
Current status and next measurable checkpoint remain in the roadmap.

## P4 context-binding challenge — Lead adjudication, 2026-09-06

The [neutral brief](4f-r2-p4-context-binding-independent-review-brief.md)
bound implementation `7efd5008496b3e5e188ee0d4ec0d38380b7ea1f7`. Fresh Claude
Code/Fable, `xhigh`, plan/read-only session
`81e8a0c2-20a9-4530-b7d0-5d89d310d408` returned `VERDICT = REVISE`:
three material local proof/repository gaps and four non-blocking local gaps;
no method or Product/plan finding survived. The concurrent AGY lane produced
no review because its first composite read-only Git diagnostic was denied by
headless permissions. Its exact diagnostic form is now minimally admitted;
no permission bypass was used.

Lead disposition:

1. **ACCEPT AND CORRECT — required extended workflow.** The tracked P4 session
   handoff was transient, stale and already absorbed. Commit `84bc1ff` removes
   it rather than weakening repository hygiene. The extended repository check
   then passed hygiene, documentation reachability, architecture verification
   and qualification provenance.
2. **ACCEPT AND CORRECT — authorization RED controls.** Commit `93c75c9`
   adds PRJ-10 `DENIED→403` and `UNAVAILABLE→503`, proves present-state reads
   do not require `brain.bind`, and fires the independent `project.manage` and
   BRN-14 `project.read` controls in real PostgreSQL. Because the accepted IAM
   schema makes both booleans mandatory on every existing Project grant, the
   latter controls use restored, disposable-database constraint mutations to
   exercise otherwise structurally impossible false states. The complete
   focused PostgreSQL test passed `1/1`; production semantics are unchanged.
3. **ACCEPT AND CORRECT — BRAIN restart/replay composition.** Commit `1058076`
   extends the real composed production-component proof. A controlled process
   loss after OCI Git apply leaves the durable BRAIN intent at `APPLYING`; a
   fresh recovery instance completes the same deterministic child. A newer
   Connection qualification after apply yields `P0412`, `ABORTED`, a
   cancellation commit, retained prior Brain binding and DB/Git realignment.
   The deciding PostgreSQL 17 + admitted OCI Git proof passed `1/1` in 379 s.
   Controlled validation/attestation fixtures make no live Sankhya claim.
   A caller lost-response retry is not added because PRJ-11 has no caller
   idempotency key; the accepted restart recovery and current-state semantics
   must not be mislabeled as command replay.
4. **ACCEPT AND CORRECT — mutable route quality.** The roadmap's accumulated
   checkpoint narrative is replaced by one current state/next-action block.
   Historical implementation detail remains in this packet and Git history.
5. **DEFER SAFELY — repeated in-process validation/factories.** Current copies
   fail closed. Revisit before PRJ-11 activation or the next candidate grammar
   revision; converge on the shared Brain-contract seam and one live factory.
6. **DEFER SAFELY — derived `updateAvailable` ETag race.** Database CAS still
   fences binding identity and the response is reread. Reopen if a consumer
   requires If-Match to prove that no newer publication existed during the
   command.
7. **DEFER SAFELY — validator refusal classification.** Unreachable while no
   production producer is registered. Before activation, distinguish an
   unavailable producer from malformed/failed conformance rather than
   activating an always-refused adapter.

Two reviewer inferences do not become authority. C.9 explicitly keeps the
PRJ-12 absent-versus-canonical-empty representation undecided, so enforced
current implementation behavior cannot select it silently. The missing trusted
production conformance producer/subject resolver is genuine: it must enforce
the current qualified binding before observation. PRJ-10/11 therefore remain
unregistered and no reachable binding write is admitted. Fresh isolated Fable
and AGY review over the corrected candidate remains required before checkpoint
acceptance; this adjudication is not a `CLEAR` verdict or P4 closure.

## P4 corrected-candidate review — Lead adjudication, 2026-09-06

Fresh Claude Code/Fable, `xhigh`, plan/read-only session
`327eb876-ec32-4c9d-aef7-5480b84ddaf4` reviewed implementation candidate
`8bdad7b2929749ee54e5d2543494d7e9f326f385` and returned
`VERDICT = REVISE`. The AGY lane again produced no report because a second
exact composite read-only Git diagnostic was not yet admitted; that exact form
is now minimally allowed without a bypass. Lead disposition follows.

1. **ACCEPT AND CORRECT — independent Brain attestation.** Migration 015 had
   moved candidate read and validation persistence onto
   `hub_r2_project_binding`, letting the settlement principal manufacture the
   attestation it later consumed. C.9 now requires dedicated
   `hub_r2_brain_attester` credentials with only the two exact functions. The
   Project role is denied both operations. Explicit role/schema/function ACL,
   arbitrary-principal, grant-option, table/column/default-ACL and membership
   censuses preserve that boundary. The real PostgreSQL P4 authority suite
   passes `36/36` active checks, with `11` separately admitted OCI checks
   skipped; the cumulative P1 PostgreSQL proof passes `6/6`.
2. **ACCEPT AND CORRECT — recovery before new-command preflight.** A durable
   pending intent is reconciled after basic identifier validation but before
   full current command admission. Recovery uses the stored account identity
   and fails closed on lost authority; another manager cannot authorize the
   original writer's completion. Archived or unauthorized Projects gain no
   recovery, Git, Registry or settlement effect. The composed PostgreSQL plus
   OCI Git proof passes `1/1` in 345.7 s, including deterministic restart and
   qualification-drift cancellation.
3. **DEFER SAFELY — canonical collation.** The accepted grammar is ASCII-closed
   and current ordering fails closed. Reopen `COLLATE "C"` only with the next
   grammar/canonicalization revision rather than silently changing canonical
   bytes here.
4. **DEFER SAFELY — duplicated validators and derived ETag timing.** These
   remain fail-closed and were already recorded by the first adjudication.
   Converge before PRJ-11 activation or when its production producer is owned.
5. **RECORD WITHOUT REOPENING.** Repeated explicit revokes in migration 015 are
   defensive least-privilege declarations, not latent grants. The current P4
   review route is exposed by `docs/index.md`; historical contract provenance
   remains in this packet and does not reopen the closed 4B census.

GPT-6 Astra was consulted as an external advisor on the material trust-boundary
choice. Its recommendation for a dedicated least-privilege login and
stored-actor recovery was accepted only after Lead analysis and firing proof;
advisor output is not repository or Product authority. A `SECURITY DEFINER`
wrapper callable by Project was rejected because it would retain the same
self-attestation authority under another name.

This correction does not activate PRJ-11 or close P4. A trusted production
conformance producer/subject resolver and the PRJ-12 cleared-source owner
decision remain the two explicit downstream blockers. The corrected candidate
required the then-pending AGY lane and Lead adjudication before checkpoint
acceptance; another full Fable round is not required by this finding because
the reviewer explicitly scoped re-review to targeted proof of the correction.

## P4 corrected local checkpoint — Lead adjudication, 2026-09-06

Implementation candidate `ea98b49abbe50fefd3a30774cd28fe14447df032`
and review brief freeze `ab58456` preserve the attester and recovery corrections
above. The final required local floor passed: clean `npm ci`, root
`npm run verify`, `npm run verify:extended`, native R1C-14 `31/31`, real P4
PostgreSQL authority `36/36`, cumulative P1 PostgreSQL `6/6`, and composed
PostgreSQL/OCI Git recovery `1/1` in 345.7 s.

The fresh isolated AGY/Gemini session
`ee8f00b8-7bdf-4cee-9478-fd46e8075c45` returned `VERDICT = PASS` and
explicitly reported `NO FINDING` after challenging the nine frozen claims. Its
durable [Evidence envelope](4f-r2-p4-context-binding-agy-review.md) records the
review. `PASS` differs nominally from the brief's requested `CLEAR`; Lead
accepts the substantive no-finding result as CLEAR-equivalent rather than
silently rewriting reviewer output. No additional correction or review round
is justified.

The corrected local PRJ-10/11 + BRN-14 checkpoint is therefore accepted, but P4
is not closed and binding writes are not activated. The next work must return
to the two smallest unresolved owners: the trusted production PRJ-11
conformance producer/subject resolver, and the PRJ-12 canonical cleared-source
representation. Neither independent review nor fixture proof can invent those
semantics.

## P4 remaining-owner ratification — 2026-09-06

The operator ratified the two remaining owner decisions and authorized their
bounded local implementation inside P4. This ratification changes neither the
20-operation ceiling nor any live-provider, Git-publication or production
authority.

### PRJ-12 cleared-source representation

Clearing the current Project Brain binding means that
`.conexus/project/brain-binding.json` is absent. A canonical empty declaration
is rejected because it would preserve a source object whose Product meaning is
absence and would create a second representation for the same state. The path
remains `PLATFORM-CONTRACT`: only the Project binding command may create,
replace or delete it.

The protected removal invariant is:

```text
authorized exact current binding + If-Match
→ deterministic delete-only Git child
→ atomic DB removal + source-revision CAS
→ no current PRJ-10 binding and BRN-14 NOT_FOUND
```

PRJ-12 requires `project.manage`, the exact current representation precondition
and concordant current Git/DB declarations. It does not require `brain.bind`,
`connection.use`, current Brain health, conformance or availability. The intent
must retain the exact removed binding identity and old declaration digest for
CAS/recovery, while the Git mutation carries no replacement bytes. Recovery
accepts only the same deterministic deletion child. Cancellation before DB
settlement leaves the prior binding and source revision authoritative; a
historical intent, attestation or unreachable Git object never becomes current
authority.

RED proof must cover nonempty replacement bytes on removal, delete of an absent
or mismatched declaration, loss of either canonical Connection declaration,
stale ETag/current binding, crash after Git, competing mutation, revocation of
`brain.bind` after the binding was created, and accidental APP-OWNED mutation.

### Registered key-conformance subject

`sourceScopeId` is an opaque SHA-256 digest derived only by trusted server
composition from the following closed canonical object:

```json
{"schemaVersion":"conexus-sankhya-source-scope/v1","connectorDefinitionId":"sankhya-om","connectorVersion":"1.0.0","connectionId":"<canonical UUID>","companyCode":1,"environment":"SANDBOX|PRODUCTION"}
```

Canonical bytes are UTF-8 JSON with exactly that key order, no insignificant
whitespace, lowercase canonical UUID text, `companyCode` as a base-10 integer
in the admitted `1..2147483647` range, and the exact closed environment token.
Changing any field changes the digest. Connection revision, qualification and
credential generation remain separate subject coordinates: their change must
invalidate an observation without manufacturing a different logical source
scope. The digest is never accepted from a caller and grants no authority.

Connections owns resolution and normalization of the current Connection,
configuration, environment, credential generation and exact latest qualified
basis. Project owns the current Project, source revision, binding and stored
Project-scoped authority. Gateway owns the closed digest derivation, immutable
registered query descriptor, before/after subject comparison and observer
admission. The local slice may add a least-privilege PostgreSQL resolver and a
controlled observer proof. It must refuse missing/revoked/cross-scope/stale
authority before observation and become indeterminate on resolver failure or
subject drift.

This slice does not admit a Sankhya credential, network call or live producer.
Production query registration, exact physical key mapping and the live Sankhya
observer remain separately gated; controlled PostgreSQL/observer Evidence may
prove the authority composition but not live ERP behavior or P4 closure.

## P4 PRJ-12 implemented candidate — 2026-09-06

Implementation commit `479c62c817902fa84236a3efab370afaa67fa40f`
realizes the ratified cleared-source representation with migration `016`, the
bounded DELETE HTTP/store path and shared deterministic Git/DB recovery. The
Git mutation carries zero replacement bytes, may remove only the canonical
Brain binding declaration and must produce the exact old tree minus that path.
Settlement deletes only the exact current binding/digest while atomically
advancing the Project source CAS; recovery reuses the same frozen removal tuple.

Deciding Evidence is green: real PostgreSQL migration `4/4`, production Brain
settlement `3/3`, real OCI Git deletion/basis `1/1` in 370.0 s, and composed
PostgreSQL/OCI post-Git crash/restart `1/1` in 418.1 s. The composed child is
`6d2ee05ca898b41b4079705349a096231aa40c27`; restart selects the same child,
removes the DB binding and source file, advances Project source to HEAD, leaves
BRN-14 `NOT_FOUND`, and does not require the later-revoked `brain.bind` grant.
The full P4 local gate, typecheck, import law and clean root `npm run verify`
also pass.

Two material falsifiers fired during implementation and were corrected before
this checkpoint: porcelain-style forced removal does not operate on the bare
repository used by the production executor, so deletion now uses explicit Git
index plumbing; and a prior cancelled replacement can preserve equivalent
binding bytes at a newer Project source commit, so removal validates current
source plus exact Git/DB declaration concordance rather than equating it with
the binding's historical source commit.

This is an implemented candidate, not P4 closure or live-provider Evidence.
The exact next action remains owned by `docs/roadmap.md`: implement and prove
the local trusted subject resolver/controlled observer, then submit the
material composed package to fresh independent review before acceptance.

## P4 trusted subject/removal local checkpoint accepted — 2026-09-06

Implementation `b5e58a4` adds the least-privilege Project/Connections subject
resolver, exact ordered-byte SHA-256 `sourceScopeId` derivation and controlled
registered-observer composition. Together with PRJ-12 implementation `479c62c`,
the combined implementation range is `e3ec7bd..b5e58a4`. Real PostgreSQL 17.10
migration/authority/composition plus real OCI Git passed `6/6` with zero skips;
the composed subject passed in `171.7 s`, and clean root verification passed.
Test-only successor `31bb403` additionally fires the DELETE nonempty-bytes,
absent-target and non-delete-only-tree controls, green `9/9` with zero skips.

Fresh isolated Fable session `c32c03c6-88fa-471c-9e83-bb8f410b559c`
returned `CLEAR` on the resolver and, through a continuity addendum, `CLEAR` on
the combined package. Isolated AGY/Gemini conversation
`9ef548b3-3fd4-433a-aacf-1cf076ed408c` found no PRJ-12/composition defect but
retained one `REVISE` proposal to replace the ratified exact-order serializer
with RFC canonical JSON. Lead classifies that proposal `NO FINDING`: RFC key
sorting changes the explicitly ratified bytes and digest. The complete finding
adjudication and safe deferrals are in
`4f-r2-p4-subject-resolver-independent-review-adjudication.md`.

The addendum itself overclaimed that a completed PRJ-12 removal makes the
subject resolver unavailable. Correct authority is:

```text
pending removal → active-intent fence refuses subject resolution
completed removal → PRJ-10 absent + BRN-14 NOT_FOUND
completed removal → resolver remains independent of Brain binding and may prove
                    the current pre-adoption Connection/source subject
in-flight source change → after-read comparison / pinned snapshot refuses PASS
```

This local checkpoint is accepted, but P4 is not closed. `server.ts` still
composes only Project Connection-binding routes, while the physical registered
Sankhya source producer and its exact mapping/read/coherence/invalidation
admission remain missing. The accepted dependency correction brings only that
P5-owned prerequisite ahead of P4 production Brain-binding composition; it
does not move all P5 into P4 and does not admit live Sankhya execution. Current
status and the exact next action remain exclusively in `docs/roadmap.md`.

## P4/P5 production composition closure candidate — 2026-09-06

Commits `a485936` and `2ea52d7`, corrected at `b8ec320`, replace the formerly
missing physical producer and server composition. The fixed Sankhya observer is
bound by a closed catalog
to company `1` or `2`, uses the trusted current Connection credential generation
and compares the Project/Connection subject before and after observation. The
server shares one credential backend and Project source snapshot, separates
settlement, attestation and subject-resolution roles, and activates the full
PRJ-10/11/12 path only when the complete nested dependency set is configured.

The exact compiled observer passed the separately authorized read-only real
system check for companies `1` and `2`. A provider-free configured composition
then passed `1/1` in `239.8 s` through HTTP, encrypted temporary credentials,
real PostgreSQL 17 restricted roles and the admitted OCI Git executor. Its
wrong-company control stopped before authentication/query. Local P5 prerequisite
composition is green `8/8` plus the gated real-composition case; cumulative local P4 remains green
`92/92` with its exact external skips.

P4 is closed after the production package and correction addendum received
independent Fable and AGY/Gemini `PASS`, Lead adjudication found zero blockers,
and clean root/extended/native verification plus the real PostgreSQL subject
matrix passed. The exact disposition is recorded in
`4f-r2-p4-p5-production-composition-review-adjudication.md`. No later Budget
mapping, R3+, RB/Mastra, production deployment, push, PR or merge entered P4.

## P5 implementation packet — 2026-09-07

### Target outcome and invariant

P5 wires the admitted server-derived read-only adapter into normal `CON-08`
Connection qualification. The compiled production qualifier selects a response
admission only for the closed tuple `sankhya-om@1.0.0` + `PRODUCTION` + company
`1` or `2`, using the immutable reserved Connection configuration and credential
generation. Every other tuple settles `PROVIDER_SCHEMA_UNPROVEN /
INDETERMINATE` before credential materialization and before HTTP egress.

Company codes are installation-relative. This closed selection proves only the
operator-authorized current installation envelope; it is not a generic customer
or production activation rule. Any later installation, environment, company or
connector-version admission reopens the smallest Connections-owned authority.

### Exact implementation boundary

- Connections owns one closed response-admission selector beside the existing
  immutable Sankhya production parser. No new runtime catalog, deployment
  configuration or caller-provided parser/version selector is introduced.
- The normal production qualifier obtains selection only from the reserved
  database configuration. The existing low-level qualifier retains explicit
  parser injection for isolated transport proof.
- The store and configured module use the production qualifier by default. A
  private `fetchImpl` composition seam may be injected only for controlled local
  proof; it is neither environment configuration nor public HTTP input.
- `CON-08` performs only authentication plus exact
  `GET /v1/empresas/{serverResolvedCompanyCode}`. A successful qualification
  proves that exact access and creates no Project binding, Brain conformance,
  Budget mapping, key-conformance result or live-provider claim.
- P4 query registration remains separate. Its fixed aggregate cannot be reused
  as Connection qualification and its catalog cannot own this prerequisite.

Expected mutation is bounded to the Connections response-admission,
qualification/store/module composition, exact P5 tests/package wiring and this
packet/result routing. No database schema, service, Product operation,
Permission, dependency or generic Gateway framework is admitted.

### Required local proof

The compiled configured module and normal `CON-08` route/store path must run
against a controlled local HTTP server and real PostgreSQL. The proof must show:

1. admitted PRODUCTION companies `1` and `2` each perform exact authentication
   then exact company read and settle a persisted `PASSED` qualification;
2. SANDBOX companies `1`/`2`, PRODUCTION company `3` and malformed
   configurations perform zero credential materialization and zero requests;
3. response mismatch/refusal, bounded-schema rejection and transport failure
   preserve the existing `FAILED` versus `INDETERMINATE` distinctions;
4. request extras cannot choose parser, origin, environment or company; the
   reserved database basis wins, and settled replay performs no second provider
   attempt;
5. the existing P4/P5 composition no longer seeds `PASSED`: normal qualification
   creates it before PRJ-11 consumes it, then the separately owned fixed P4
   aggregate runs. Expected provider sequence is authentication, company read,
   authentication, fixed aggregate; no secret or business row enters output;
6. Connections-only configuration works without Brain, Project binding or the
   P4 registration catalog, while R1-only startup remains unchanged.

### Completion and stop law

P5 closes only after targeted tests, the real-PostgreSQL/local-HTTP composed
proof, Linux repository verification and independent material-diff review pass.
P7 retains any additional real Sankhya execution, recovery/live qualification
claim and whole-R2 closure. Stop rather than broaden scope if the closed selector
cannot be implemented without caller influence, credential exposure, a new
durable owner or coupling Connection qualification to P4 Brain/query state.

### R2-P7 entry and exact proof window — 2026-09-07

P6 is `CLOSED PASS`. The operator confirmed that the provisioned credential is
for the real system and authorized safe continuation. P7 may execute only:

1. normal production-module CON-08 qualification for the exact configured
   PRODUCTION companies `1` (Matriz) and `2` (Filial);
2. the already registered, fixed, read-only Gateway key-conformance observation
   for those same source scopes;
3. whole-R2 production composition using the exact P0..P6 modules, restricted
   PostgreSQL roles, production credential backend and admitted OCI Git; and
4. receipt-last closure after clean verification and one fresh isolated
   Fable+AGY whole-R2 review round.

The proof must load credential material only from the existing owner-only file
outside the repository. It may retain only sanitized method/operation/company
coordinates, response-shape admission, qualification state, coherence class
and pass/fail control facts. Tokens, credential values, company names, business
rows, aggregate counts and provider response bodies must not enter terminal
output, chat, Git, logs, fixtures, diagnostics or Evidence.

All provider calls are server-derived and read-only. Any redirect, unadmitted
origin/method/company, response/schema drift, credential custody fault,
qualification-basis drift, incomplete observation or provider uncertainty must
stop without retrying as a different attempt and settle only the already-owned
`FAILED`, `INDETERMINATE` or `NOT_PROVEN` result. ERP writes, arbitrary SQL,
mapping expansion and a broader provider contract remain forbidden.

## 10. Explicit non-goals and stop law

R2 does not implement:

```text
RB Builder/Mastra/E2B
R3 sync/read model/Project DB
R4 registered Budget Queries
R5 Published Application
R6 Release/Promotion/serving
R7 live reconciliation
Brain discovery/proposals/publication operations
AnalyticQuery/Data Explorer
Gateway effects/writes/retry/replay/idempotency/budgets
arbitrary URL/service/method/SQL
Oracle direct access
Product Agent/PAR/MAR/OBS/attachments
production activation or first-production recovery
```

Stop and return to the smallest owner if Product semantics, a provider response,
credential topology, Project Git/DB settlement, Brain conformance, Connection
qualification or owner isolation cannot be implemented without guessing or
violating a frozen claim. Live provider unavailability yields `NOT_PROVEN` or
`INDETERMINATE`; it never becomes fixture-backed `PASS`.

## 11. Current part route

Current status and exact next action remain exclusively in `docs/roadmap.md`.
P0..P7 are closed. P7 was limited to the exact source-safe live read-only
qualification/egress proof, whole-R2 production composition, independent review
and receipt-last closure defined above. Push, PR, merge, deployment/production
writes, any other Sankhya call, RB Mastra/model work and R1 runtime/profile
custody changes remain outside the current mutation window.
