# Release, Deployment, and Operations

Current technical detail extracted without semantic rewriting from the accepted Phase-3 architecture baseline. `docs/architecture/index.md` owns the overview; this file owns the detailed task surface named by its title. The operator-approved C-015 Keycloak refinement is projected into first-production topology/recovery without changing Conexus authorization ownership.

## 12. Release and Promotion architecture

## 12.1 ReleaseManifest = exact composition root

Current Release composition is one immutable closure over the Product facts needed by serving/runtime, for example:

```text
source commit/tree/bundle identities
frontend/runtime-contract digests
registry artifact set / exact artifact revisions
agent revision + model/tool/context/policy pins where applicable
Brain revision + ProjectBrainBinding
ProjectConnectionBinding / qualified Connection revision
migration head + schema fingerprint + PG major
configContractDigest
lockfile/dependency digest
verification/validation Evidence digest
provenance / run identities
```

Exact schema spelling belongs Realization Planning, but the composition-root law is current.

```text
source/build/evidence digests close first
→ canonical ReleaseManifest closes over them
→ external attestations may reference the closed digest
```

No circular “manifest writes itself into source it hashes” design.

## 12.2 Three separate histories

```text
operational/run detail
!= Git source/change history
!= user-visible Release/Version history
```

## 12.3 Candidate/release vs promotion/environment state

These are separate planes, not one generic Status FSM.

Conceptual current candidate/release lifecycle:

```text
BUILDING
→ VERIFIED
→ AVAILABLE
terminal rejection/invalidity where applicable
```

Conceptual target-environment promotion progression includes:

```text
APPROVED
→ CONFORMANCE_CHECKED
→ migration/recovery branch when required
→ POINTER_SWAPPED
→ SERVED_VERIFIED
```

Material failures remain explicit, such as conformance failure, migration failure, CAS conflict and served-digest verification failure.

`DRIFT`, `STALE` and schema-rollback ineligibility are orthogonal blocking conditions, not proof of success.

## 12.4 CAS / expected state

Promotion pointer changes use expected current generation/pointer semantics. Conflict never force-writes over a new current state; candidate must revalidate/reconcile against the new state.

## 12.5 Serving verification

Pointer swap is not completion.

```text
real serving path GET/read
+ served revision/runtime/frontend digest == expected exact Release
→ SERVED_VERIFIED
```

HTTP 200 from stale content is not success.

## 12.6 Current proof and Promotion concurrency

```text
change_acceptance/current proof
→ rechecked at ComposeRelease
→ rechecked immediately before material Promotion steps
→ stale/inadmissible proof refuses progression without rewriting history
```

Bootstrap platform artifacts created before Builder exists use exact admitted
verification/validation Evidence and never manufacture `bld.change_acceptance`.
The first operational Budget Analyzer now traverses the real Builder Change
lifecycle; its Release therefore requires current `bld.change_acceptance` plus
the exact admitted Evidence digest set. ComposeRelease and material Promotion
steps recheck both without allowing either to substitute for the other.

F1 admits at most one non-terminal Promotion per `(Project, PROD)`. Admission must use a conflicting Release-owner guard; the concurrent loser performs zero DDL, drain or other material step. This is refusal, not a Promotion queue/lease.

## 12.7 Maintenance and post-serving truth

Once a maintenance-required transition makes old serving incompatible, its serving-block survives Promotion failure/terminalization. Closing a Promotion never silently re-enables the old Release; exit remains forward-fix, validated restore or safe recovery Promotion.

Governance/proof drift after `SERVED_VERIFIED` does not automatically deactivate or rewrite the active pointer. Current security/health/owner gates may still narrow individual operations, and future Promotion uses current proof.

---

## 13. Environment architecture

Current environment classes are deliberately bounded:

```text
BuildValidationDatabase   ephemeral proof fixture
workspace DEV             persistent Project development business DB when needed
RunPreview                ephemeral authenticated candidate serving
PROD                      persistent production environment of the SAME Project
```

No permanent generic staging environment F1.

## 13.1 PROD is not a forked logical Project

PROD is the same Project under separate environment/database/current Release authority.

A production Project DB is isolated from DEV by connection/roles and is provisioned lazily on the first Promotion under the C-014 `PROVISIONING → READY | PROVISION_FAILED` semantics; partial/orphan provisioning is reconciled rather than treated as ready.

## 13.2 Environment ↔ Connection binding

Environment use of external systems is explicit. PROD does not silently use a sandbox Connection and DEV/Preview do not silently use production Connection merely because the provider is the same.

---

## 15. Config identity and secret rotation

Two independent axes:

## 15.1 `configContractDigest`

Part of Release identity: slots/semantics/scope/type/non-secret values and exact logical environment bindings needed by the Product.

Functional config-contract change makes the candidate stale/requires governed revalidation/Release treatment.

## 15.2 Secret material

Outside Release identity:

```text
slot/credential handle
→ secretVersion / cryptoKeyVersion / token generation
```

Compatible secret rotation may change value/version without rebuilding the Product Release. Secret value never enters manifest/source/artifact.

Conformance verifies required references/resolvability, never logs secret plaintext.

---

## 16. Migration architecture

Every production schema change remains a governed Release/migration transition with real validation, not a post-fact log.

For every migration, the universal proof order is:

```text
QA-DB-1 → QA-DB-2 → QA-DB-3
```

The migration class changes fixture/rehearsal depth, never removes the gate. A periodic live-database × migration-ledger drift check remains required between builds.

Promotion never rebuilds/recompiles a candidate under the same Release identity. Config/proof drift makes the candidate `STALE` and requires revalidation; it never silently produces different bytes under the same Release.

Current F1 uses two semantic branches:

## 16.1 Backward-compatible migration

Old runtime + new schema and new runtime + new schema compatibility are proven where the branch claims compatibility.

Expand/contract remains a design technique; compatibility proof is the gate.

A migration already recorded/checksummed is not blindly re-applied on Promotion retry.

## 16.2 Maintenance-required migration

Used when old runtime cannot safely serve the new schema.

Current properties:

```text
drain relevant mutating/queued/deferred/retry work
pre-migration backup confirmed
apply migration
post-migration conformance
old incompatible serving remains blocked
recover via idempotent continuation / forward fix / validated restore
```

No silent reopening of incompatible old serving.

## 16.3 Production migration direction

Successful production migrations are **forward-only**. Down migrations are not the Release rollback mechanism. Reverse migration can remain a DEV/investigation tool where safe; disaster restore is a recovery mechanism, not normal Release rollback.

## 16.4 Pre-migration recovery evidence

Promotion requiring migration records/validates required backup/recovery material before crossing the irreversible/maintenance boundary according to 3J-02 current recovery authority.

---

## 17. Project duplication architecture

Current C-014 Product contract is intentionally narrow:

```text
Duplicate Project
→ copy source/code
→ copy config schema/contracts
→ copy declarations/source artifacts as applicable
→ ask about business data
→ default = NO DATA
```

Never silently copy:

```text
Project DB contents
credentials
Connection bindings
current external authorization
runtime sessions/history
```

The accepted C-014 base is no Project DB contents, credentials or Connection bindings. Excluding current external authorization and runtime sessions/history is a monotonic consequence of their separate owner authority, not a new copy authority.

Destination must explicitly establish its own current Brain/Connection/environment/access bindings.

---

## 30. Observability, audit, cost and execution transparency

## 30.1 Durable owner facts vs observation

Current Phase-3 data authority uses owner-specific durable records/projections. Historical C-013 `agent_event` exact table/type wording is **not** a current generic event-owner/table requirement.

C-013 enduring semantics survive:

```text
append-only/auditable observations where appropriate
producer trust
causal correlation
usage/cost state honesty
live checklist
completion ladder
missing != zero
telemetry never acceptance authority
```

## 30.2 Correlation anchors

Conexus IDs:

```text
ChangeId / CodingSessionId / WorkUnitId / ActorRunId
ConversationId / AgentRunId / ApprovalRequestId / trigger occurrence
Release/Promotion/Effect owner IDs
```

Observational IDs:

```text
traceId/spanId
Mastra run/thread/tool refs
E2B sandbox/process refs
provider request IDs
browser/request IDs
```

Domain run may span `0..N` traces.

## 30.3 OTel

OpenTelemetry is preferred vendor-neutral observation plumbing where useful, not correctness authority.

A perfect one-tree trace is not required. High-cardinality owner IDs belong mainly in traces/logs/correlation records, not default metric dimensions.

OTel baggage excludes by default:

```text
credentials
security decisions / mutable authority facts
PII / secrets
all Conexus owner IDs
```

Baggage is cleared/omitted before external or untrusted egress unless a future explicitly admitted crossing says otherwise. Trace context remains correlation only.

## 30.4 Producer trust classes

```text
HUB_AUTHORITY
GATEWAY_AUTHORITY
PROVIDER_OBSERVED
GUEST_OBSERVED
```

Authenticated transport never upgrades trust class by itself.

## 30.5 Cost/usage states

Execution surfaces preserve distinctions such as:

```text
usage_state:
  REPORTED | INFERRED | MISSING

calculation_state:
  CALCULATED | MISSING_USAGE | MISSING_PRICE | UNSUPPORTED

reconciliation_state:
  NOT_AVAILABLE | PENDING | MATCHED | MISMATCH | ADJUSTED
```

Calculated/provider-reported/reconciled cost remain separate facts.

User-facing execution detail may show, when available:

```text
model/provider
token classes (input/output/cache/reasoning)
USD/cost state
duration
tools/runtime observations
sandbox wall-clock monetary cost separately from LLM cost
```

Rollup can aggregate by turn/run/conversation/Project/period without creating aggregate tables as new business authority.

## 30.6 Three degradation classes

```text
ordinary Operational Telemetry missing
→ degraded/MISSING; domain work may continue where telemetry is not required

audit-required durable AuditRecord unavailable
→ FAIL CLOSED

verification-required Evidence missing
→ NOT_PROVEN / INCONCLUSIVE
-X-> PASS
```

Audit Trail and Operational Telemetry remain distinct meanings inside the Observability & Audit owner.

The non-production first Budget Analyzer slice instantiates no `obs.*` consumer and classifies zero operations as `audit-required`; this is an explicit first-build scope statement, not a production waiver. Before first production, or when the first operation is deliberately classified audit-required, the OBS owner/`AuditRecord` path becomes reachable and the fail-closed law must be realized and proved before that surface is authorized.

## 30.7 Required Evidence

If an assertion requires a class of runtime evidence:

```text
required Evidence missing
→ NOT_PROVEN / INCONCLUSIVE
-X-> PASS
```

Package E owns deciding-evidence qualification of current surfaces.

---

## 35. First-production physical topology

This is **first-installation architecture**, not universal SaaS doctrine.

## 35.1 Development/proving

```text
operator Windows workstation
→ Ubuntu WSL2
→ development / qualification / proving
```

WSL2 is not production authority.

## 35.2 Physical failure domain

```text
existing company physical server
→ Windows host
→ one dedicated Linux production guest/VM
```

Physical host/Windows/guest/storage loss may take the entire installation down. Accepted initially; no HA claim.

## 35.3 Inside Linux guest

```text
one Node/TS Hub application process
├── Control Plane / L7
├── Managed Application Runtime
├── Capability Gateway
├── Builder control-side runtime
└── Production Agent Runtime

selected self-hosted Keycloak OIDC IdP service
└── provider persistence / signing-and-identity state required for stable issuer-subject continuity

PostgreSQL cluster
├── hub_control
├── mastra_builder
├── mastra_par
└── production Project DBs

local platform backings
├── Artifact/Blob/CAS classes
└── encrypted CredentialBackend backing
```

Physical co-location never merges owners/stores/credentials/trust classifications. Keycloak remains logically an authentication provider; its roles/groups/policies never become Conexus authorization authority. Exact supported Keycloak persistence placement is admitted at realization/activation time; if it uses the PostgreSQL cluster, it remains under a dedicated provider credential/database boundary rather than an owner schema.

E2B remains remote guest execution outside the production VM.

## 35.4 Private ingress

```text
inside company → LAN → HTTPS → Conexus / exact private Keycloak login endpoint
remote employee → existing corporate VPN → private company network → HTTPS → Conexus / exact private Keycloak login endpoint
```

```text
public Internet ingress F1 = NONE
anonymous/public app access F1 = NONE
remote plaintext HTTP = DENY
```

VPN is reachability, never authorization. Keycloak login reachability is authentication mechanism only; successful provider login still requires Conexus Account/session/current authorization before Product use.

Remote production HTTPS must be normally trusted by first-user browsers; certificate-warning click-through is not a normal production state. Placement must also preserve an out-of-band infrastructure/host path to administer or stop ingress/application/IdP independently from the served Conexus web path.

## 35.5 MANAGED serving

Hub/MAR serves exact active-Release bytes directly in the baseline. No standalone MAR service/CDN/load balancer/reverse-proxy architecture is required for optionality.

Concrete hypervisor, Linux distro, VM sizing, hostname/DNS/TLS termination, service manager, ports/firewall/storage paths belong derived Realization Planning/activation proof.

Development/proving state can never silently become PROD authority. Activation requires explicit production identity/configuration and proof; failure blocks activation rather than relabeling the proving environment.

---

## 36. Operational resilience and recovery architecture

Current first-installation posture remains deliberately bounded:

```text
single physical failure domain accepted
manual restore acceptable initially
RPO <= 6h
RTO <= 8h
off-host recoverable set required
complete restore proof from a real off-host protected generation before first production
whole-Hub emergency-stop drill before first production
no HA/auto-failover/multi-region claim
```

### 36.1 Required recovery set and custody

Required recovery material includes:

```text
hub_control
all production Project DBs
mastra_par
Keycloak provider persistence/configuration required for the configured issuer and stable subject identities
non-reconstructible digest-addressed bytes
CredentialBackend ciphertext backing
separately custodied decryption key generations / recovery means required by recoverable ciphertext
provider-independent canonical Git recovery bundles
recovery manifests / generation provenance
```

`mastra_builder`, E2B/validation/cache/reconstructible state remain not required by default.

The Keycloak recovery material must preserve enough provider state to prove that the configured issuer and the `(issuer, subject)` identities referenced by `iam.account` retain continuity. Re-provisioning that yields different subject identities cannot silently remap existing Accounts; unknown continuity keeps human login/use fenced until I&A reconciliation.

For every recoverable ciphertext generation, the referenced decryption key generation or equivalent recovery means must also be recoverable and restore-time decryptability must be proven. Ciphertext and root/recovery-key material remain under separate custody; no single compromise path/location/credential may expose both sets.

### 36.2 PostgreSQL recovery consistency

The mutable PostgreSQL recovery set required for F1 restores from one internally consistent PostgreSQL recovery generation. Current first-installation topology places `hub_control`, `mastra_par` and production Project DBs in one cluster, making that the smallest current property. If the admitted Keycloak persistence also uses this cluster, its dedicated provider database/state participates in that protected generation; if a different supported store is selected, restore proof must establish compatible Keycloak↔Hub generation/provenance and issuer-subject continuity explicitly. Exact backup/WAL tooling remains Realization Planning rather than Product authority.

Recovered owner references needed by a re-enabled surface must close over the exact referenced Git, immutable Artifact/Blob/CAS, credential, Release and required authentication-provider material. Missing required closure fails closed; credentials additionally require decryptability proof and human authentication additionally requires identity-continuity proof.

### 36.3 Normal restart vs disaster restore

Normal PROD admission requires **positive evidence of continuity of the current durable generation**. Missing, unreadable or unknown continuity evidence is `UNKNOWN` and enters recovery posture; absence of a recovery marker is never proof of normal continuity.

A disaster restore may reintroduce an older generation. Any effect, revocation, approval decision, trigger transition, execution or authored change that could have occurred after the protected cutoff cannot be inferred as nonexistent merely because the recovered generation lacks it.

The exact continuity/provenance mechanism belongs Realization Planning. If the property cannot be realized without a new semantic owner or durable Product class, return to the smallest Decision Loop.

### 36.4 Deny-only recovery posture

Disaster recovery uses a posture that survives Hub/process restart and is **deny-only infrastructure**:

```text
recovery posture
→ may deny normal ingress/autonomy
-X-> grant Product authority
-X-> prove an owner operation is allowed
```

Restricted operator/infrastructure recovery ingress may exist while normal ingress remains fenced. Clearing the extra deny is an infrastructure procedure only; each re-enabled behavior still passes the ordinary current operation of its existing owner.

No composite Hub-side `ActivateRecoveredProd` semantic flow exists. If realization later requires one composite activation flow, durable activation record, or owner that consumes the fence as permission, that is an L7/owner Decision Loop amendment.

### 36.5 Authority and external-effect re-establishment

Restored normal sessions are invalid for normal reuse. Privileged/autonomous/effectful authority whose post-cutoff narrowing may have been lost remains fenced until the responsible existing owner re-establishes or recertifies the required current authority.

Human authentication after restore additionally requires the exact configured Keycloak issuer/provider generation to be usable and its subject continuity to the restored `iam.account` mappings to be established. A successful Keycloak login alone never recertifies Workspace/Project/Published-App authority; those remain current Conexus owner checks.

During **initial** disaster recovery, all governed external-effect admission is denied by default because a post-cutoff EffectAttempt may be absent from recovered local state. Each effect-capable Gateway/Connection surface is re-enabled only after existing owner/provider/business reconciliation establishes acceptable current safety. Missing local EffectAttempts never prove a surface safe.

If the lost interval cannot be reconciled sufficiently, that effect surface remains fail-closed beyond broad platform recovery rather than fabricating certainty. After broad recovery posture clears, remaining faults return to owner/surface scope.

Canonical Project/Brain Git history that survives beyond the recovered Hub cutoff remains authoring/provenance truth. It is preserved and reconciled explicitly; Git-write-capable authoring paths stay fenced until reconciliation completes, and surviving Git never auto-recreates lost Hub Change/Plan/acceptance/Release/current-serving authority.

### 36.6 Release and serving recovery

A recovered Release pointer is not sufficient to declare PROD active. Re-enabled serving uses the existing Release/Promotion authority:

```text
exact Release closure
+ target schema/migration/conformance checks
+ required bindings/readiness
+ real serving path verification
→ SERVED_VERIFIED where serving is restored
```

A non-terminal Promotion reconciles actual migration/pointer/served state instead of blindly replaying the last intended step. Existing CAS, migration-ledger/checksum and maintenance-required recovery laws remain authoritative.

### 36.7 RPO/RTO meaning

`RPO <= 6h` means a last complete, off-host, verifiable recovery generation exists inside the accepted window; merely scheduling a backup does not satisfy it when the generation is incomplete, corrupt or local-only.

`RTO <= 8h` is the first-installation objective for **useful safe platform service**, not a guarantee that every effect-capable integration is reconciled within eight hours. Under the C-015 Keycloak refinement, the minimum useful-safe human-operated service set includes a working private authentication path with proven issuer/subject continuity plus current Conexus session/authorization checks. Unsafe effect surfaces may remain fail-closed beyond broad platform recovery.

These numbers remain the first-installation operations contract, not a SaaS SLA.

### 36.8 Required first-production proof

The real off-host restore proof must falsify at least:

```text
restore/start without positive generation-continuity evidence
→ normal PROD stays denied

restore protected mutable generation(s)
→ verify backup integrity + cross-store closure + credential decryptability
→ restore Keycloak provider state/config and prove issuer-subject continuity before normal human login/use
→ recovery posture survives another process restart
→ restored sessions cannot be reused normally
→ Keycloak role/group/provider state alone cannot grant Conexus Product authority
→ external-effect admission is deny-by-default
→ post-cutoff canonical Git is reconciled before Git-write paths reopen
→ existing owners re-establish required authority/readiness
→ EnvironmentConformance + exact serving verification
→ removing recovery deny does not create a composite Product grant
```

The whole-Hub emergency-stop drill remains independently required.

---
