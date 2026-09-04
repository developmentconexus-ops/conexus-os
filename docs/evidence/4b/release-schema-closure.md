# 4B Evidence — Release / Promotion / Serving Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current 4A Product authority plus accepted Release, EnvironmentConformance, migration and serving contracts.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can the seven caller-visible Release Product operations be given exact wire shapes without turning Release composition, active-pointer mutation, rollback, migration or serving verification into generic caller-controlled deployment APIs?

## 2. Exact Product slice

Current caller Product operations are exactly:

```text
REL-01 ListReleases
REL-02 GetRelease
REL-04 ListPromotions
REL-05 GetPromotion
REL-06 PromoteRelease
REL-07 GetProjectServingState
REL-08 GetEnvironmentConformance
```

Total:

```text
7 Product operations
```

`REL-03 ComposeRelease` remains absent from caller Product wire because current authority classifies immutable Release composition as `SYSTEM_OWNER_TRANSITION` after exact accepted proof.

Canonical active Path Items:

```text
contracts/api/product/release-paths.yaml
```

They become authority only through the canonical `contracts/api/product/openapi.yaml` entrypoint and resolved bundle.

## 3. Closure laws proved

### 3.1 Release remains immutable composition authority

`GetRelease` projects one exact immutable Release identity and exact composition/proof coordinates:

```text
releaseId
releaseLabel
projectId
releaseManifestDigest
sourceRevision
verificationEvidenceDigest
createdAt
releaseState
compositionSummary
composition
```

The full realization `ReleaseManifest` remains Release-owned. The operator-approved `4C-F31` closes only its stable safe human inspection projection: exact component/binding kind/ref/immutable label/revision or digest plus configuration/runtime-contract digests. `REL-01` uses the same immutable presentation and newest-created-first opaque pagination; neither surface becomes a second manifest authority.

The Release projection does not collapse immutable identity into mutable serving truth such as:

```text
latest
active
served
promoted
ready
live
rebuild
```

`AVAILABLE` or equivalent owner state therefore never means promoted or served.

### 3.2 ComposeRelease remains owner-internal

There is no caller operation to:

```text
ComposeRelease
RebuildRelease
UpdateRelease
SetReleaseLatest
```

Exact accepted candidate proof causes owner-controlled immutable composition. A source/config/proof change that materially changes composition requires a different/revalidated Release identity rather than same-identity rebuild-at-serve.

### 3.3 Promotion is the explicit Product decision

`PromoteRelease` carries exactly the caller-controlled semantic subjects current authority requires:

```text
releaseId
environment
expectedPointerGeneration
Idempotency-Key
```

The operation preserves both accepted profiles:

```text
IC2 → expected target pointer generation
IC3 → repeatable consequential intake identity
```

Because the HTTP target is the Promotion collection while the protected mutable subject includes the target environment's active pointer, `REL-06` deliberately does **not** use cross-resource `If-Match`.

The request cannot bypass owner proof through fields such as:

```text
force
skipConformance
skipVerification
skipMigration
activePointer / setPointer
targetUrl
proofDigest / conformanceId supplied as authority
```

### 3.4 Rollback is another governed Promotion

Rollback does not receive a second Product command. Selecting an eligible prior immutable Release through ordinary `PromoteRelease` preserves the same current authorization, conformance, expected-pointer-generation, migration/recovery and served-verification laws.

Rejected parallel authority includes:

```text
RollbackRelease
UndoPromotion
rollback=true
DownMigrateProduction
```

Production down migration remains outside normal Release rollback semantics.

### 3.5 Promotion history, pointer state and serving verification remain distinct

A Promotion record can disclose its Release/environment/current owner state and resulting pointer generation where one exists, but this does not establish serving success.

The operator-approved `4C-F32` makes target discovery server-owned. `GetProjectServingState` returns a non-empty exact environment matrix with human target presentation and keeps each current pointer separate from independently observed serving verification:

```text
environmentId / environmentLabel
pointerState = UNSET | SET
activeReleaseId
activeReleaseManifestDigest
pointerGeneration
servingVerification.expectedReleaseId
servingVerification.expectedManifestDigest
servingVerification.observedReleaseId / observedManifestDigest when available
servingVerification Evidence
```

Therefore:

```text
Release available
!= Promotion admitted
!= pointer swapped
!= correct Release bytes observed
!= SERVED_VERIFIED
```

HTTP reachability or a generic `ready/live/success` boolean cannot replace exact served identity/digest proof.

Promotion history is paged by owner `requestedAt DESC / promotionId DESC` and carries immutable request-time actor/target presentation. `PromoteRelease` accepts the exact disclosed `environmentId`; a free-text environment name never becomes authority.

### 3.6 EnvironmentConformance measures the real target

`GetEnvironmentConformance` remains a read/proof operation under `release.promote`; it does not gain pointer mutation, migration or repair authority.

The wire preserves the current accepted conformance axes:

```text
POSTGRES_MAJOR
PRIVILEGES
MIGRATIONS
SCHEMA_FINGERPRINT
CONFIG_BINDINGS
CONNECTION_BINDINGS
CURRENT_POINTER
SERVED_DIGEST
```

`POSTGRES_MAJOR` includes the required PostgreSQL-major/extension-set check; privilege and schema-fingerprint Evidence remain separate axes rather than being hidden in one generic status.

Each check preserves owner-issued state plus Evidence references. The wire deliberately does not invent a universal proof-state lifecycle enum where Product authority has not ratified one.

## 4. Rejected generic deployment authority remains absent

The Release checker rejects or guards against:

```text
REL-03 ComposeRelease as caller Product wire
mutable/latest Release authority
rebuild-at-serve
force promotion
skip conformance / verification / migration
special rollback command/flag
down migration as ordinary rollback
direct active-pointer mutation
false cross-resource If-Match on REL-06
Promotion without Idempotency-Key
Promotion without expectedPointerGeneration
pointer swap masquerading as served verification
generic ready/live/success serving state
generic conformance execute/apply/migrate/repair/sql/targetUrl authority
```

Machine guard:

```text
scripts/check-wire-release.mjs
```

## 5. TDD proof

```text
Verify #291 = FAILURE
HEAD = 0fdbf8adc9e4e7dd1dccb0f08131eb18c3979176
→ expected RED before Release schema activation
→ repository/bijection/carriers/IAM/Project/Builder/Brain/Connections remained green
→ exact first failure: REL-01 is not SCHEMA_CLOSED

Verify #293 = SUCCESS
HEAD = f9cc2ba557e3b4025671d97e6b27882fbb0afa5b
```

Established machine result:

```text
fixed 4A operations      = 111
fixed OAS operations     = 111
schema-closed operations = 85
IAM + Workspace          = 20 / 20
Project                  = 21 / 21
Builder                  = 17 / 17
Brain Product            = 11 / 11
Connections              = 9 / 9
Release                  = 7 / 7
missing                  = 0
extra                    = 0
duplicate                = 0
literal IF_MATCH          = { PRJ-12, PAR-14 }
```

Budget Analyzer declaration/codegen/truth-state positive and negative controls remained part of the same successful full Verify.

## 6. Result

```text
IAM + Workspace = CLOSED inside 4B
Project         = CLOSED inside 4B
Builder         = CLOSED inside 4B
Brain           = CLOSED inside 4B
Connections     = CLOSED inside 4B
Release         = CLOSED inside 4B
schema-closed   = 85 / 111
4B overall      = OPEN / ACTIVE
Product code    = BLOCKED
```

The next owner slice must continue compiling accepted authority into the same OAD. Missing semantics remain a stop/reopen falsifier rather than permission to invent deployment, runtime or DTO meaning.
