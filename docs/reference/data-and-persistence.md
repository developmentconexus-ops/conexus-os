# Data and Persistence

Current technical detail for the surface this file's title names. The operator-approved C-015 Keycloak refinement is projected as provider persistence, not a new Conexus semantic owner.

## 5. Durable authority and storage boundaries

## 5.1 Project Git

Canonical authored **Project-scoped** content:

```text
application source under app/
```

That is the whole of it today. The Builder writes it, source admission accepts it, and
the compiler reads it. Everything else this section used to list belonged to Project
Inception, the Project Baseline and the connection and Brain bindings, which left the
product on 2026-09-19.

Project Git is authoring/provenance truth. It is not current authorization, runtime or serving truth.

## 5.3 `hub_control` PostgreSQL

Authoritative Hub operational/domain truth for current owners such as:

```text
Identity & Access
Workspace
Project and its working state
BuilderRun
Artifact Registry metadata
Model connections: logical state, custody references, sharing and preference
```

`apps/hub/migrations/0001_baseline.sql` plus its forward migrations is the exact
census. Change, Plan, WorkUnit, ActorRun, the capability gateway, Brain overlays,
Product Agent facts, Release and Promotion state and Managed Application Runtime job
runs were removed from the product on 2026-09-19 and have no tables.

For C-015 human authentication, the verified external identity key `(issuer, subject)` is stored as attributes of the existing `iam.account` identity. It is not a separate durable record class and does not make Keycloak provider state Hub authority.

Exact table/column spellings belong post-C-018 derived Realization Planning. Logical owner schemas/capabilities remain explicit.

The `hub_control` migration lineage and schema-integrity ledger are owned by
the Project/platform persistence authority: the SQL under `apps/hub/migrations`
and `scripts/run-hub-migrations.mjs` are the sole runtime apply and checksum
path. Atlas or another migration CLI may remain historical Evidence, but it is
not a competing runtime owner.

That lineage is one baseline file plus the forward migrations added after it.
`0001_baseline.sql` creates the whole catalog, the eight capability roles and
the six owner roles, and a fresh installation runs it alone. The runner pins
each file by SHA-256, records it in `iam.schema_migration`, and refuses any
database whose catalog is not the one the committed snapshot
`contracts/technical/hub-catalog-snapshot.json` records. The one installation
created before the baseline, the pilot, was adopted onto it on 2026-09-19; no
database on the older ledger exists any more, so the runner only ever applies
pending migrations from a ledger that starts at `0001`.
`docs/development/engineering-rules.md` holds the rule for when the baseline
itself may be regenerated.

## 5.4 Project Database

Project-owned business/application data:

```text
Project-native business state
derived analytical/read-model state
Project-owned migrations
```

Project DB is not Hub control authority, Brain semantic authority or proof that an external source was synchronized correctly.

Persistent DEV/PROD databases exist where the Project needs them. Validation databases are ephemeral proof fixtures, not a permanent third business environment by default.

### 5.4.1 Approved destination

C-021 approved that each Project owns a logical data space of its own, isolated from
Conexus's internal data, and that a conversation or an application reaches it through
authorized capabilities rather than through arbitrary access. Evolving a Project's
structure grants nothing on the system database or on production, and a product's own
data stays distinct from data belonging to an external system.

Which physical database, schema or namespace carries that space is unchosen, and is
decided in the increment that delivers it. Nothing here describes an implemented
isolation boundary. [Product contract section 12.5](../product/contract.md#125-data)
owns the rule.

## 5.5 `mastra_builder`

Builder Mastra substrate persistence only:

```text
stored coding thread/runtime mechanics
AgentController/session substrate state
runtime continuation mechanics
```

Never correctness authority. Settlement, source identity and artifact identity are Conexus facts in `hub_control`, never substrate state.

The shape of what this substrate holds follows from the composition C-020 realized: one
Thread per Project and a run-scoped Session. C-021 reopened how many conversations a
Project offers, so the mapping between a conversation and what is persisted here is open
and belongs to [the Sessions and Work qualification](../tasks/sessions-work-qualification.md).
What did not change is that conversation messages live in the framework's store. A
Conexus-owned conversation store is not one of the answers on the table.

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

Connections owns logical credential handles and grant facts; plaintext is materialized only at the trusted last-mile use, which today is the model call a run makes. CredentialBackend is not a generic Secret domain.

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
-X-> Project DB by default
-X-> Keycloak provider persistence

mastra_builder
-X-> hub_control / Project DB / Keycloak provider persistence

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

## 6.5.1 Durable record inventory

The census below is the F1 inventory as it was closed, and it is history. It counted
46 record classes across owners that no longer exist: `bld` held the Change hierarchy,
`gw` the capability gateway, `brn` the Brain, `par` Product Agents, `rel` Release and
Promotion, `mar` the Managed Application Runtime, and `prj` carried the Project Baseline
and the bindings.

`apps/hub/migrations/0001_baseline.sql` and the forward migrations after it are the
current census, and they are the only one a reader should measure against. A new durable
record class still requires the existing Decision Loop and the same admission test.

## 6.5.2 Tier-2 cross-module foreign keys

The rule stands. A cross-owner foreign key is admitted only where it protects stable
structural identity or containment whose dangling state would be invalid. Tier-3
semantic references and digests remain the default everywhere else.

The sixteen-row allowlist that stood here counted owners that no longer exist, among
them `bld.change`, `rel.release`, `rel.active_pointer` and `mar.serving_route`, and
areas and per-project grants that the authority model no longer has. It is history.
`apps/hub/migrations/0001_baseline.sql` and the forward migrations after it are what a
reader measures against, and `tests/implementation/hub-call-site-privileges-postgres.test.mjs`
is what holds the boundary.

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

## 12. What this file no longer describes

These owners left the product on 2026-09-19 and their storage prescriptions were
removed from this reference on 2026-09-20 rather than left readable as current design.
Git history holds what they said.

```text
Workspace Brain Git            Brain
mastra_par                     Product Agents
EnvironmentConformance         Promotion
Project Baseline, bindings     Project Inception
Release / Promotion state      publication as it was then designed
```

C-021 approved Brain, integrations and publication as destination. That approval names
no storage, and nothing here may be read as the mechanism for any of them.
[Product contract section 12](../product/contract.md#12-approved-destination) owns what
each one must mean; the increment that delivers it chooses how it is stored.
