# Data and Persistence

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title. The operator-approved C-015 Keycloak refinement is projected as provider persistence, not a new Conexus semantic owner.

## 5. Durable authority and storage boundaries

## 5.1 Project Git

Canonical authored **Project-scoped** content includes, according to the Project Baseline and artifact kind:

```text
Project Baseline readable source
application/frontend/backend source
artifact source definitions
agent/v1 definitions
ProjectBrainBinding + Project-local refinements/overrides
ProjectConnectionBinding declarations
migrations
config schema/contracts
verification/test assets
tasks.md purpose/context memory
```

Project Git is authoring/provenance truth. It is not current authorization, runtime or serving truth.

## 5.2 Workspace Brain Git

Canonical published Brain source lives in a **Workspace/group-scoped Git tree/repository independent from the first Project repo**.

```text
Workspace Brain Git
→ BrainDefinition published source
→ semantic/knowledge/evidence-spec source material
→ publication history
```

A Project repo pins/binds/refines/overrides according to Brain rules; it does not become the canonical Workspace Brain source by being the first consumer.

This separation prevents Project-local implementation from silently becoming company-level meaning.

## 5.3 `hub_control` PostgreSQL

Authoritative Hub operational/domain truth for current owners such as:

```text
Identity & Access
Workspace
Project
Builder Change/Plan/WorkUnit/ActorRun/Findings
Artifact Registry metadata
Connections logical state/qualification
Gateway effect/current counters/receipts
Brain operational proposals/health overlays
PAR owner facts
Release/Promotion/current serving state
Observability/Audit records
MAR job-run occurrence facts
```

For C-015 human authentication, the verified external identity key `(issuer, subject)` is stored as attributes of the existing `iam.account` identity. It is not a separate durable record class and does not make Keycloak provider state Hub authority.

Exact table/column spellings belong post-C-018 derived Realization Planning. Logical owner schemas/capabilities remain explicit.

The `hub_control` migration lineage and schema-integrity ledger are owned by
the Project/platform persistence authority: the ordered SQL under
`apps/hub/migrations` and `scripts/run-hub-migrations.mjs` are the sole runtime
apply and checksum path. Atlas or another migration CLI may remain historical
Evidence, but it is not a competing runtime owner.

## 5.4 Project Database

Project-owned business/application data:

```text
Project-native business state
derived analytical/read-model state
Project-owned migrations
```

Project DB is not Hub control authority, Brain semantic authority or proof that an external source was synchronized correctly.

Persistent DEV/PROD databases exist where the Project needs them. Validation databases are ephemeral proof fixtures, not a permanent third business environment by default.

## 5.5 `mastra_builder`

Builder Mastra substrate persistence only:

```text
stored coding thread/runtime mechanics
AgentController/session substrate state
runtime continuation mechanics
```

Never Change/Plan/WorkUnit/ActorRun/correctness authority.

## 5.6 `mastra_par`

Product Agent Mastra substrate persistence only:

```text
thread/message history
suspension/checkpoint mechanics
runtime state needed to resume exact Agent execution
```

Never current Release/permission/approval/AgentRun terminal/Gateway effect authority.

## 5.7 Artifact/Blob/CAS backing

Digest-addressed/immutable byte storage/serving mechanics according to owner contracts.

```text
same bytes/digest
!= same semantic identity
!= same authorization
```

Storage/provider path/key/prefix is never Product authority.

## 5.8 CredentialBackend backing

Opaque encrypted secret-byte/crypto mechanism behind the narrow `CredentialBackend` boundary.

Connections owns logical credential handles/grant facts; Gateway receives plaintext only at trusted last-mile use. CredentialBackend is not a generic Secret domain.

Outside the trusted Hub boundary, no single compromise path/location/credential may yield both the Connection ciphertext backup set and root/recovery-key material. F1 transient acquired tokens are memory-only; no durable transient-token cache is admitted.

### 5.8.1 Recovery closure

A ciphertext generation is recoverable only if its referenced decryption key generation or equivalent recovery means is also recoverable and restore-time decryptability can be proven.

```text
recoverable ciphertext generation
+ separately custodied required key generation / recovery means
+ successful decryptability proof
→ credential bytes are recoverable
```

Ciphertext backup custody and root/recovery-key custody remain separate. This refinement does not create a generic Secret owner or permit one recovery location/credential to expose both sets.

### 5.8.2 Keycloak Identity Provider backing

C-015 selects Keycloak as the authentication provider. Its realm, user, credential, signing/provider configuration and other persistence required to preserve the configured OIDC issuer and stable subject identities are **provider-owned authentication state**, not Conexus Product authority.

```text
Keycloak provider persistence
!= hub_control
!= iam Account authority
!= Workspace/Project/Published-App authorization
```

The Conexus side stores only the stable verified external identity key needed by I&A on the existing `iam.account`. Keycloak realm/client roles, groups, organizations and Authorization Services are not mirrored into mutable Conexus authorization state by convenience.

Keycloak provider persistence does not add a fourteenth `hub_control` owner schema or a 47th durable Conexus record class. If its exact storage engine/placement is co-located with PostgreSQL, it still uses provider-specific credentials and remains outside owner-schema SQL capabilities.

For first production, the provider persistence generation needed for `(issuer, subject)` continuity is part of the required recovery closure. Restore/rebuild may not silently produce a different subject identity and remap an existing Account. Unknown identity continuity fails closed until I&A reconciliation establishes the mapping safely.

## 5.9 Backup material

Operational recovery state, not current application authority while the system is running. Recovery may reconstruct durable owner truth; it may not fabricate newer/cleaner semantic truth than recovered Evidence establishes.

For the first installation, the mutable PostgreSQL recovery set restores from one internally consistent PostgreSQL generation. The complete first-production recoverable closure also includes the Keycloak provider state required for stable issuer/subject continuity. Exact physical placement may make that state part of the same protected PostgreSQL generation or a separately protected store; in either case, the restore proof must establish compatible generation/provenance rather than assume consistency from timestamps.

Recovered references needed by a re-enabled surface must close over the exact required Git, immutable byte, credential, Release and authentication-provider material; presence alone is insufficient where decryptability, identity continuity or conformance is required.

Canonical Git that survives beyond the restored Hub cutoff is not generic extra backup/CAS data. It remains authoring/provenance truth and is reconciled explicitly before Git-write-capable paths reopen.

---

## 6. PostgreSQL and least-privilege architecture

## 6.1 Version baseline

```text
architecture major = PostgreSQL 17
Q0 deciding probe minor = PostgreSQL 17.10
```

PG17 is current architecture. The 17.10 minor is deciding Evidence identity, not a permanent ban on later supported 17.x under accepted repin/requalification.

## 6.2 Owner-scoped Hub capabilities

Normal owner persistence must satisfy the negative property:

```text
owner A arbitrary SQL
-X-> owner B schema
-X-> SET ROLE into unrelated owner authority
-X-> object-owner / superuser / BYPASSRLS authority
```

The F1 cross-owner domain atomicity set is closed:

```text
1. CreateProject     → prj + iam initial grant
2. effect admission → gw + par approval claim
```

Audit-required same-transaction paths receive only the narrow append capability needed for `obs.audit_record`; they do not gain OBS read/update/delete authority. No generic cross-owner UnitOfWork exists.

Migration/provisioning/backup credentials with broader operational power remain separate from normal request/runtime roles.

## 6.3 Physical-store capability matrix

```text
hub owner credential
-X-> mastra_builder
-X-> mastra_par
-X-> Project DB by default
-X-> Keycloak provider persistence

mastra_builder
-X-> hub_control / mastra_par / Project DB / Keycloak provider persistence

mastra_par
-X-> hub_control / mastra_builder / Project DB / Keycloak provider persistence

Project query/action/migrator capability roles (NOLOGIN; adopted by an
already-admitted per-capability session; controlled qualification proves this
with transient adopters, while Product runtime credential provisioning remains
an owning-stage dependency; public database `CONNECT` revoked)
-X-> hub_control / Mastra stores / another Project DB / Keycloak provider persistence

Keycloak provider persistence credential
-X-> hub_control / Mastra stores / Project DBs
```

The OIDC protocol boundary is not database authority. Physical co-location never weakens the matrix.

RLS is not a universal Role/Area/permission engine. Canonical current authorization remains application/domain authority.

## 6.4 CR-1 — current-authority serialization × owner isolation

A security-sensitive mutation that consumes mutable authority owned elsewhere must conflict/serialize with concurrent revoke/narrow through the protected commit:

```text
stale authority pre-read + concurrent revoke/narrow
-X-> protected mutation commits
```

The same realization must preserve owner-scoped persistence: the consuming owner cannot directly read/write/lock unrelated `iam` state, `SET ROLE` into another owner or use a broad umbrella role. 3N/3O must prove both sides together; the exact primitive remains derived Realization Planning.

## 6.5 Closed F1 data inventory

`hub_control` has exactly 13 owner schemas:

```text
iam ws prj bld reg con gw brn par rel mar obs att
```

The F1 durable inventory is closed at 46 record classes, and the Tier-2 structural cross-module FK allowlist is closed at exactly 16. Tier-3 semantic references/digests are the default for non-structural cross-owner references. There is no shared/common schema, and a mutable current-state mirror of another owner is forbidden.

Keycloak provider persistence is deliberately outside this Conexus semantic inventory. The C-015 external identity key remains part of `iam.account`; no provider table/realm/group/role class is admitted into the 46-class inventory.

The current projection below preserves the accepted 3E closure directly so a Fresh Actor can verify this load-bearing boundary without Git archaeology. Names are semantic record classes, not post-C-018 table/column spellings.

## 6.5.1 Current durable record inventory

```text
iam: account / session / workspace_membership / area_membership / area_project_grant / account_project_grant / published_app_access
ws: workspace / area
prj: project / approved_baseline / brain_binding / connection_binding / config_contract_revision
bld: change / contract_revision / plan_revision / work_unit / actor_run / coding_session / finding / change_acceptance
reg: artifact / artifact_revision
con: connection / connection_revision / connection_qualification
gw: effect_attempt / idempotency_claim / budget_counter
brn: knowledge_proposal / health / binding_validation
par: conversation / agent_run / approval_request / agent_trigger
rel: release / promotion / active_pointer
mar: serving_route / job_run
obs: audit_record / operational_event
att: attachment / blob
TOTAL 46
```

A new durable record class still requires the existing Decision Loop/material Finding and the same admission test: one current owner, a real durable consumer/invariant, non-derivability from sufficient authority, no mutable foreign-authority mirror, no substrate/provider-only duplication, and no generic framework without a consumer.

## 6.5.2 Current Tier-2 cross-module FK allowlist — 16

Tier-2 is admitted only when a cross-owner reference protects stable structural identity or containment whose dangling state is invalid independently of mutable authorization/eligibility. The target is a stable owner identity/PK; enforcement is `RESTRICT`/`NO ACTION`, never `CASCADE`/`SET NULL`; the FK grants no Product authority and authorizes no cross-schema SQL. Historical/exact semantic pins whose current eligibility must be revalidated remain Tier-3. Absence remains the default, and any new Tier-2 FK requires the existing Decision Loop/material Finding.

| # | Tier-2 FK |
| --- | --- |
| 1 | `iam.workspace_membership.workspace_id → ws.workspace(id)` |
| 2 | `iam.area_membership.area_id → ws.area(id)` |
| 3 | `iam.area_project_grant.area_id → ws.area(id)` |
| 4 | `iam.area_project_grant.project_id → prj.project(id)` |
| 5 | `iam.account_project_grant.project_id → prj.project(id)` |
| 6 | `iam.published_app_access.project_id → prj.project(id)` |
| 7 | `prj.project.workspace_id → ws.workspace(id)` |
| 8 | `con.connection.workspace_id → ws.workspace(id)` when `ownerScope=WORKSPACE` |
| 9 | `con.connection.project_id → prj.project(id)` when `ownerScope=PROJECT` |
| 10 | `reg.artifact.workspace_id → ws.workspace(id)` when `kind=brain` |
| 11 | `reg.artifact.project_id → prj.project(id)` for PROJECT-scoped kinds |
| 12 | `bld.change.project_id → prj.project(id)` |
| 13 | `rel.release.project_id → prj.project(id)` |
| 14 | `rel.active_pointer.project_id → prj.project(id)` |
| 15 | `mar.serving_route.project_id → prj.project(id)` |
| 16 | `att.attachment.project_id → prj.project(id)` |

Tier-3 semantic references/digests remain the default for non-structural cross-owner references. In particular, ProjectConnectionBinding→Connection/ConnectionRevision, ProjectBrainBinding→Brain/Registry revision, Gateway↔PAR semantic refs, JobRun→Release composition, OBS refs, Mastra refs, and digest refs do not gain Tier-2 FKs merely for convenience.

---

## 11. Artifact Registry architecture

## 11.1 Authoring vs immutable revision

```text
authorized Git source
→ validate/compile
→ immutable ArtifactRevision
→ exact digest/payload
→ AVAILABLE
```

Registry availability is not Project active use.

Stable human/project references use semantic slugs/names where the contract requires them; arbitrary numeric persistence IDs do not become Product-level artifact identity.

Artifact kinds keep owner-specific meaning. Common storage/compilation does not create a Universal Artifact business owner.

## 11.2 Build-time vs runtime authority

Privileged build/migration/provisioning mechanics remain distinct from restricted runtime execution. Runtime executes exact admitted compiled capabilities; it does not inherit build-time DDL/provisioning authority.

## 11.3 SQL and parameters

Where SQL artifacts exist, input schema validation and real bind parameters remain mandatory. Runtime string interpolation is not an admitted parameter mechanism.

---

## 14. EnvironmentConformance

Promotion measures the **real target**, not just source files.

Current conformance properties include, where applicable:

```text
PostgreSQL major/extensions
current DB role + prohibited privilege checks
owner grants / least privilege
migration ledger + checksums
schemaFingerprint real target
required config bindings resolvable
exact pinned Connection revision == exact active revision in target environment
current Release pointer / expected generation
served digest after switch
```

Schema fingerprint is a deterministic versioned catalog representation; privilege/extension/PG-major checks remain separate proofs rather than being hidden inside one fingerprint.

Material divergence:

```text
DRIFT
→ STOP / reconcile
-X-> apply the rest and hope
```

---
