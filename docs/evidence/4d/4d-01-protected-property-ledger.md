# 4D-01 — Protected Property Ledger

> **Status:** `4D-01R CLOSED / OPERATOR APPROVED / 117 PROTECTED PROPERTIES / NO TECHNOLOGY SELECTION`
> **Phase:** `4D — Project Paved Road & Runtime Realization`
> **Implementation authority:** `BLOCKED`
> **Decision boundary:** compile current consumers, owners, failure classes,
> ownership classes and proof obligations before 4D-A/B or any exact mechanism
> selection.

## 1. Decision question

> Which repeated infrastructure properties must Conexus precompile so a coding
> agent can concentrate on `APP-OWNED` Product logic without inventing Product
> authority, security, transport, persistence, integration, runtime or proof
> conventions?

This ledger is the deciding input to 4D-A and 4D-B. It does not choose a
framework, package, version, directory tree, database table or deployment
mechanism.

## 2. Ledger law

Every admitted row has:

```text
current consumer
+ one semantic owner or explicit owner-routed invariant
+ protected property / failure class
+ GENERATED | PLATFORM-CONTRACT | APP-OWNED
+ REALIZE | PRESERVE_SEAM | DEFER | STOP
+ proof strategy
+ firing falsifier
```

Disposition meaning:

| Disposition | Meaning in 4D |
| --- | --- |
| `REALIZE` | A current admitted consumer requires the Paved-Road property. 4D-A/B must close it and 4D-C may later select a mechanism. |
| `PRESERVE_SEAM` | Current architecture/qualification requires the boundary to remain valid, but the first proving slice must not instantiate dormant machinery. |
| `DEFER` | No current consumer requires the property; it can be added later without duplicating authority or dismantling the road. |
| `STOP` | Correct realization cannot proceed until the named prerequisite or authority contradiction is resolved. |

`REALIZE` admits a property into the current program; it does not order all
`REALIZE` rows into one implementation batch. Each property is scheduled at the
earliest incremental slice where its consumer becomes reachable. Unreached
properties add no dormant runtime, while every completed slice must leave a
usable/provable capability or an immediately consumed enabling foundation.

`PRESERVE_SEAM` and `DEFER` are not waivers. Their first real consumers inherit
the original owner, qualification and proof routes.

`DEFER` is an admission/implementation disposition, not a ban on inquiry.
Promising capabilities may be studied as `REFERENCE_ONLY` under the
[4D-01R Strategic Opportunity Challenge](4d-01r-strategic-opportunity-challenge.md).
The study must evaluate Product value and authority fit before retaining the
deferral, promoting a protected property or rejecting the opportunity.

`Authority route` never creates co-ownership. A row naming more than one owner
means the invariant is proved jointly over separate owner-local facts, as in
CR-1. `Each/exact owner` means the repeated mechanism is instantiated once per
canonical operation/owner contract rather than owned by a new cross-cutting
service.

## 3. Scaffold and ownership

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- |
| `SCF-01` | Every software-publishing Project identifies one exact scaffold/profile generation; unversioned template drift is forbidden. | Project Baseline; MANAGED first vertical | Project | `PLATFORM-CONTRACT` | `REALIZE` | Reproduce the profile from the pinned identity; mutate the platform profile without changing the Project pin and require conformance to turn red. |
| `SCF-02` | Generated output is deterministic and has no hand-owned divergent semantics. | Generated Project wire/client/server projections | Each canonical source/operation owner; Artifact Registry owns only generated artifact identity/provenance | `GENERATED` | `REALIZE` | Generate twice from identical inputs and compare the canonical tree/bytes; hand-edit generated semantic output and require drift detection. |
| `SCF-03` | Platform invariants cannot be weakened by ordinary app edits. | Every generated/evolving Project | Project | `PLATFORM-CONTRACT` | `REALIZE` | Mutation-boundary guard over all protected paths; attempt to bypass auth/wire/security seam from app-owned source and require refusal. |
| `SCF-04` | Regeneration preserves app-owned Product source and refuses ambiguous overlap. | Builder-generated Project evolution | Project | `APP-OWNED` | `REALIZE` | Regenerate after representative app changes and prove exact preservation; force an ownership collision and require conflict rather than overwrite. |
| `SCF-05` | Project Baseline pins the exact scaffold/Paved-Road facts needed to reproduce and adjudicate the Project. | Project creation/import and later Change | Project | `PLATFORM-CONTRACT` | `REALIZE` | Reconstruct the admitted profile from Baseline facts; remove a required pin and require build/conformance admission to fail. |
| `SCF-06` | Scaffold remains infrastructure-rich and Product-feature-poor. | New Project; Budget Analyzer proving Project | Project | `APP-OWNED` | `REALIZE` | Census scaffold source against admitted platform mechanics; inject an unused business feature and require the no-consumer guard to fail. |
| `SCF-07` | Duplicate Project copies source/config intent but never hidden authority, DB, credentials, bindings or runtime history. | Duplicate Project | Project | `PLATFORM-CONTRACT` | `REALIZE` | Execute a representative duplication manifest; include a forbidden authority/state class and require rejection. |
| `SCF-08` | DEDICATED remains one Project profile/Factory with explicit Platform Service bindings, exact Release-bound `DedicatedApplicationPrincipal`/`private_key_jwt`, short-lived `SERVICE_SCOPED` tokens and every-request current-generation/containment checks; immutable deployment exchange grants no authority and offline artifact delivery cannot imply offline Conexus capability use. | Future first real DEDICATED Project/application | Project owns profile; I&A/security/Release/Platform Service owners retain exact boundaries | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Static contract/conformance preserves the closed profile union, credential/data/network custody and exact exchange envelope; mutable tags/local rebuild, inherited credentials, stale generation, automatic profile conversion, offline capability claim or bearer leakage that the real threat model cannot tolerate must block first-consumer activation, while physical deployment/sender-constraint mechanics wait for that consumer. |
| `SCF-09` | Deciding authority traceability and the tool-neutral canonical-wire projection manifest are fresh deterministic digest-pinned projections, never editable semantic graphs or generator-owned oracles. | Generated-consumption conformance, impact analysis, Context Compiler and SHARE drift gate | Existing canonical owners; generated manifests own no meaning | `GENERATED` | `REALIZE` | Recompile canonical operation census/manifest and authority edges from exact sources/digests, then compare generator output independently; mutate a source/required edge or make generated output self-verify and require drift/`STALE`/stop. |
| `SCF-10` | Impact/staleness computes the smallest correct downstream set from fresh canonical relationships rather than invalidating everything or trusting model edits. | Change planning and later 4F slices | Exact affected owners; derived analyzer owns no meaning | `PLATFORM-CONTRACT` | `REALIZE` | Prove representative minimal affected sets; remove/add a deciding edge or over-invalidate an unrelated owner and require the control to turn red. |
| `SCF-11` | Every deciding execution/conformance constraint is an exact digest-pinned, provenance-preserving, explicitly applicable reference compiled from an existing owner; it may only narrow Builder cognition/verification or Project admission and can never grant authority or manufacture compliance. | First operational Builder Context Compiler/WorkUnit/ActorRun and generated Budget Analyzer profile/conformance | Each existing constraint/property owner; compiler/profile/gate owns mechanics and Evidence only | `PLATFORM-CONTRACT` | `REALIZE` | Deterministically compile/distribute the exact deny-only set; stale/missing/wrong-scope refs, local edits, evaluation errors or a malicious widening constraint must stop/refuse, while a satisfied constraint alone cannot grant, accept, release or certify. |

## 4. Canonical wire and generated consumption

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `WIR-01` | Fixed Conexus Product operations derive from canonical 4B wire; no handwritten parallel DTO or route authority. | Control Plane and Published-App platform consumers | 4B Product wire contract; semantics remain with each operation owner | `GENERATED` | `REALIZE` | Generate types/transports/handler contracts from exact OpenAPI; add a divergent handwritten DTO or method/path and require drift guard failure. |
| `WIR-02` | Exact `Ops(R)` Project operations are generated from the closed Project-operation grammar; no generic executor. | Budget Analyzer `BUD-01..02`; later Project capabilities | Project | `GENERATED` | `REALIZE` | Generate exact Release-bound wire; introduce `{operationSlug}`/unbounded payload dispatch and require grammar rejection. |
| `WIR-03` | Product API and Technical Ingress remain separate authority surfaces. | OIDC protocol, AgentRun stream, Product API callers | I&A/PAR protocol contracts + 4B Product wire; no shared owner | `PLATFORM-CONTRACT` | `REALIZE` | Route/census guard proves zero Product-count impact from protocol operations; add Product authority metadata to Technical Ingress and require failure. |
| `WIR-04` | Product `Problem.code` remains the consumer-behavior key; transport status does not create a second taxonomy. | All generated frontend/backend consumers | 4B wire per exact operation owner | `GENERATED` | `REALIZE` | Generate one canonical Problem projection; add a copied/widened frontend enum and require contract drift failure. |
| `WIR-05` | ETag, conditional and idempotency carriers exist only for operations that admit their semantics. | Exact 4B conditional/idempotent operations | 4B wire per exact operation owner | `PLATFORM-CONTRACT` | `REALIZE` | Carrier census matches canonical wire; add a false cross-resource conditional or caller-selected idempotency scope and require rejection. |

## 5. Authentication, authority and backend request boundary

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `AUT-01` | Keycloak proves human authentication only; Conexus owns Account mapping, opaque session and all Product authorization. | First access, Control Plane, Published App | Identity & Access | `PLATFORM-CONTRACT` | `REALIZE` | Real browser/server OIDC proof; change Keycloak role/group without Conexus grant and prove access remains denied. |
| `AUT-02` | Exact issuer/client/redirect/PKCE/validation mechanics are server-controlled; browser token possession is not application authority. | OIDC login/callback | Identity & Access | `PLATFORM-CONTRACT` | `REALIZE` | Real non-production IdP integration; forge issuer/audience/signature/state/nonce or redirect and require no Conexus session. |
| `AUT-03` | Every protected request resolves current Conexus authority at the real control point. | All protected operations | Exact operation owner consuming current I&A authority | `PLATFORM-CONTRACT` | `REALIZE` | Revoke/narrow after earlier disclosure and before action; protected operation must deny rather than trust stale UI/session context. |
| `AUT-04` | Workspace/Project/Release/binding coordinates supplied by clients are references, never authority. | Control Plane, Published App, Project capabilities | Exact coordinate/resource owner | `PLATFORM-CONTRACT` | `REALIZE` | Resolve valid coordinates through current owners; cross-Workspace/cross-Project coordinate substitution must fail without disclosing foreign truth. |
| `AUT-05` | Control Plane, Preview and Published App authorization remain independent. | Project admin, reviewer, app admin/member | Identity & Access | `PLATFORM-CONTRACT` | `REALIZE` | Exercise all access compositions; prove administration does not grant business use and app use does not grant Builder/source access. |
| `AUT-06` | Trusted bootstrap is one exact transient pre-Account path and cannot reach normal Product routes. | First-instance operator only | Identity & Access | `PLATFORM-CONTRACT` | `REALIZE` | Bootstrap the preconfigured subject once; attempt another subject, repeat use or normal route access and require fail-closed behavior. |

## 6. Frontend Paved Road and P13 conformance

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `FE-01` | Client state has only `SERVER`, `URL_NAVIGATION`, `FORM_DRAFT`, `EPHEMERAL_UI`; browser business truth is forbidden. | All 13 locked platform blocks and Published-App hosts | P13 custody contract per exact Product owner | `PLATFORM-CONTRACT` | `REALIZE` | Representative state-custody tests; persist or infer owner currentness in a client store and require the guard to fail. |
| `FE-02` | Loading, empty, denied, absent, stale, partial, unsupported, indeterminate and failure remain distinct where admitted. | All frontend consumers; Budget Analyzer results | Exact Product result owner | `PLATFORM-CONTRACT` | `REALIZE` | Component/browser state matrix; map a failure/unknown result to empty/success and require a negative test to fail. |
| `FE-03` | Query/cache/invalidation is projection mechanics and cannot normalize cross-owner Product truth into a universal store. | React/TanStack platform surfaces | Exact Product read/command owner | `PLATFORM-CONTRACT` | `REALIZE` | Mutation/read invalidation proof per owner; introduce cross-owner mutable canonical cache state and require boundary guard failure. |
| `FE-04` | Route coordinates preserve exact owner-issued identity and are re-resolved at destinations. | Workspace/Project/Agent/Release/run navigation | Exact coordinate/destination owner | `PLATFORM-CONTRACT` | `REALIZE` | Browser navigation with valid and forged/stale coordinates; destination must resolve or fail closed, never trust transport identity. |
| `FE-05` | Same-origin credential/session mechanics and browser security defaults cannot be weakened by app code. | Control Plane, Preview, Published App | Identity & Access; security mechanics remain subordinate | `PLATFORM-CONTRACT` | `REALIZE` | Real browser cookie/request/CSP controls; attempt protected fetch without required session/request protections and require denial. |
| `FE-06` | P13 reading order, region priority, primary/secondary action placement, interaction model, material visibility, density, responsive behavior and accessibility survive visual/component realization. | Locked 4C blocks and assembled Product | Exact locked Screen Contract | `PLATFORM-CONTRACT` | `REALIZE` | Structural plus browser/component conformance proves wide/narrow transformations, keyboard/focus/labels/non-color meaning and reduced-motion behavior; deliberately reorder/hide a material region, lose focus recovery or change density/action priority and require failure. |
| `FE-07` | Product-specific UI, business behavior, visual composition, brand/theme and renderers remain app-owned behind generated/platform seams; the scaffold may offer a neutral optional foundation but cannot force the Control Plane shell/brand. | Budget Analyzer R5 and later Published Applications | Project | `APP-OWNED` | `REALIZE` | Build and visually vary a representative app slice without editing protected seams; regeneration preserves app-owned UI, and moving business/brand/composition into the platform or requiring the Control Plane shell must fail ownership/conformance review. |
| `FE-08` | Contextual `Ask Conexus` receives bounded server-authorized context and grants no new capability. | R1 Project Baseline cognition through `PRJ-24`; later Builder cognition through `BLD-16`; any future exact contextual panel remains owner-specific | Exact operation owner: Project for `PRJ-24`, Builder for `BLD-16`; model/SDK owns mechanics only | `PLATFORM-CONTRACT` | `REALIZE` | Exercise each owner-specific interaction: stale/forged/widened Project candidate context must not explain another subject or mutate/approve Baseline; Builder context must not create capability or bypass the exact Change path. |
| `FE-09` | Published Apps need one reusable Product Agent experience road across framework-neutral client, React/headless bindings and optional primitives without client-owned Agent truth. | Proven PA-01 full-page, contextual-panel and inline Agent hosts | PAR owns Conversation/run/approval truth; Project app owns composition/rendering | `PLATFORM-CONTRACT` | `REALIZE` | Execute a bounded contract prototype and negative matrix over generated client/headless binding with deterministic PAR fixtures for history, reconnect, typed context/rich parts, approvals, lifecycle and accessibility; raw runtime authority, forced shell or missing real-PAR first-instantiation proof blocks the corresponding claim. |
| `FE-10` | Repeated human-review projections may share owner-specific deterministic projection adapters and a bounded safe rendering kernel without merging identity, lifecycle or decision semantics. | Baseline and Brain review; distinct Plan consumer as challenge | Each exact Product owner; shared projection/rendering mechanics own no meaning | `PLATFORM-CONTRACT` | `REALIZE` | Pin source/version digest and versioned anchors, reproduce projection bytes, sanitize unsafe markup/links and render unknown content safely; changed source plus stale/forged anchor must fail explicitly, and a universal review owner/API or lifecycle flattening is rejected. |
| `FE-11` | Shared visual/headless primitives own accessible presentation mechanics only; exact owner identity, lifecycle, currentness, authorization and Project composition remain outside. Conexus Platform may own one coherent styled layer, while generated Project apps receive only an optional neutral/replaceable foundation. | Repeated locked Platform overlays/forms/collections/actions; Budget Analyzer R5; FE-09 Project Agent hosts | Exact Screen/Product owner retains meaning; platform visual layer and Project app own separate composition | `PLATFORM-CONTRACT` | `REALIZE` | Reuse one primitive across unlike owners and two Project themes while preserving exact semantics; mutate it to infer state/auth, force one shell/brand, overwrite app-owned composition or make tool state acceptance authority and require boundary/P13 conformance failure. |

## 7. Data and persistence

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DAT-01` | Hub owner schemas/roles remain least-privilege; no shared broad application login or generic cross-owner UnitOfWork. | I&A, Project, Builder, Registry, Connections, Release and MAR first slice | Data/persistence capability matrix per exact Hub owner | `PLATFORM-CONTRACT` | `REALIZE` | Real PostgreSQL role/capability matrix; owner A arbitrary SQL against owner B must fail. |
| `DAT-02` | Closed record-class and cross-owner FK laws remain intact; semantic refs default to Tier 3. | Hub control persistence | Data/persistence inventory routed to each record owner | `PLATFORM-CONTRACT` | `REALIZE` | Schema/conformance census; add a record class, common schema or unapproved cross-owner FK and require rejection. |
| `DAT-03` | CR-1 serializes security-sensitive mutation against concurrent revoke/narrow while preserving owner isolation. | Representative `PromoteRelease` and later applicable mutations | Release owns mutation; I&A owns consumed authority; joint invariant only | `PLATFORM-CONTRACT` | `REALIZE` | Real PostgreSQL concurrency proof; stale-authority mutation racing revoke must lose, without Release receiving arbitrary I&A SQL. |
| `DAT-04` | Project DB holds Project business/read-model state only and cannot access Hub, another Project, Mastra stores or Keycloak persistence. | Budget Analyzer read model and Queries | Project | `PLATFORM-CONTRACT` | `REALIZE` | Real role/isolation proof; attempt cross-store/schema access from query/action/migrator roles and require denial. |
| `DAT-05` | Project-specific migration source is authored with the Project and versioned in Git. | Budget Analyzer schema evolution | Project | `APP-OWNED` | `REALIZE` | Apply exact migration source to validation DB; alter a recorded/checksummed migration and require drift failure. |
| `DAT-06` | Migration admission, ledger, checksums, compatibility class, backup gate and conformance are platform-controlled. | Release/Promotion over Project DB | Release owns admission; Project owns migration source/business schema | `PLATFORM-CONTRACT` | `REALIZE` | Real migration rehearsal; replay, checksum drift or incompatible old serving must block progression. |
| `DAT-07` | EnvironmentConformance measures the real target, including PG major, roles, migrations, schema and bindings. | Promotion and serving | Release | `PLATFORM-CONTRACT` | `REALIZE` | Prove the admitted real target matches the exact contract; perturb one target property and require `DRIFT`/stop rather than partial apply. |
| `DAT-08` | A derived read model never proves its own completeness or source correctness. | Budget Analyzer sync/results | Project | `APP-OWNED` | `REALIZE` | Compare against an independently derived live-source oracle; perturb candidate-side data and require mismatch. |

### 7.1 Governed Project data path

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `DPL-01` | One Release-pinned Project data-path manifest closes over exact stage, source/query, semantic/binding, code/lockfile, target and mechanism identities without becoming a Product/pipeline owner. | First Builder-generated Budget Analyzer sync | Project owns app path; Release owns exact composition | `PLATFORM-CONTRACT` | `REALIZE` | Reproduce the exact path from the manifest and pins; mutate one deciding input under the same identity or omit a stage and require stale/refusal. |
| `DPL-02` | Transformation source remains Project-authored/versioned with exact accepted semantic refs; compiled/framework DAGs are reproducible projections and own no Product meaning. | Budget/Pending mapping and read model | Project owns source; Product/Brain owns accepted meaning | `APP-OWNED` | `REALIZE` | Recompile from exact source and semantic refs; alter a generated/framework graph or infer a mapping without source/owner change and require drift/unsupported. |
| `DPL-03` | Source admission, extraction coverage, transformation, materialization, owner settlement and reconciliation remain non-collapsible truth planes. | Governed Sankhya sync and 3O proof | Existing Gateway/Project/MAR/Release/3O routes | `PLATFORM-CONTRACT` | `REALIZE` | Make each plane succeed/fail independently; no upstream success may manufacture a downstream PASS, freshness, settlement or `MATCH`. |
| `DPL-04` | Project cursor/checkpoint advances atomically only with the durable merge it covers; framework pipeline state is subordinate Evidence and cannot authorize continuation. | Incremental Budget Analyzer sync | Project owns cursor/merge; MAR owns JobRun occurrence | `APP-OWNED` | `REALIZE` | Kill before/after merge and cursor commit and forge framework state; require replay/continue/stop from exact Project facts with no skip or unauthorized advance. |
| `DPL-05` | Every admitted source profile defines exact paging/order/limits, late-arrival, deletion/absence and schema/mapping-drift behavior; unknown closure is explicitly incomplete/fail-closed. | Sankhya Budget source profile | Project owns source use/mapping; Gateway owns governed provider call | `APP-OWNED` | `REALIZE` | Inject overlap, omission, unstable order, late update, deletion and deciding-field drift; require detected mismatch/incomplete/unsupported rather than clean completeness or silent destination deletion/evolution. |
| `DPL-06` | The first Builder-generated Budget Analyzer realizes and evolves the governed data-path profile without protected-seam edits; alternative mechanisms preserve one owner/result/recovery envelope. | First operational Builder and Worker Eval | Builder authors through Change; Project/Gateway/MAR/Release retain authority | `PLATFORM-CONTRACT` | `REALIZE` | Build/evolve the same governed path with admitted candidates under equal tasks; ad hoc unmanifested sync, seam bypass or mechanism-specific authority fails Builder acceptance. |

## 8. Connections, Gateway and enterprise data

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `INT-01` | Project use resolves one explicit compatible exact Connection revision/binding; same Workspace is insufficient. | Budget Analyzer Sankhya path; later Project integrations | Project owns binding; Connections owns exact revision/current qualification | `PLATFORM-CONTRACT` | `REALIZE` | Real binding/currentness proof; substitute unrelated or newer unadopted revision and require denial. |
| `INT-02` | Secret plaintext exists only at write-only trusted administration ingress and Gateway last-mile use. | Connection lifecycle and governed calls | Connections owns logical credential relation; CredentialBackend/Gateway are bounded mechanics | `PLATFORM-CONTRACT` | `REALIZE` | Secret custody/redaction proof; attempt read-back, log, browser, repo, Project DB or guest exposure and require failure. |
| `INT-03` | Gateway derives destination, credential and current authority server-side; no arbitrary privileged fetch/proxy. | Sankhya read-only operations | Capability Gateway | `PLATFORM-CONTRACT` | `REALIZE` | Prove normal execution resolves the exact binding server-side; supply alternate Connection/destination/credential hint and require rejection. |
| `INT-04` | First vertical external access remains read-only and least-privilege; runtime SQL/destination widening is forbidden. | Budget Analyzer sync, qualification and reconciliation | Capability Gateway owns governed external execution; Project owns result meaning | `PLATFORM-CONTRACT` | `REALIZE` | Real source role proof; write, arbitrary SQL or unregistered source operation must fail. |
| `INT-05` | Effect identity/idempotency/reconciliation remains Gateway-owned when the first effect consumer appears. | Future Action/Product-Agent/effect-capable job | Capability Gateway | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Preserve exact wire/owner boundaries; no effect tables/mechanics enter the read-only first slice. First effect consumer inherits replay/OUTCOME_UNKNOWN proofs. |
| `INT-06` | Honest source/candidate comparison uses one real common coordinate; freshness timestamp alone is insufficient. | Budget Analyzer 3O reconciliation | Project owns candidate result; 3O Evidence proves comparison without owning meaning | `APP-OWNED` | `REALIZE` | Controlled Sankhya probe establishes equal coverage; absent common boundary yields `INDETERMINATE`/stop, never guessed tolerance. |

## 9. Artifact, Release, serving and configuration

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `REL-01` | Artifact revisions and Release close over exact source/build/wire/binding/config/dependency/proof identities without circular self-hash. | Budget Analyzer candidate and all later Projects | Registry owns immutable revisions; Release owns composition | `PLATFORM-CONTRACT` | `REALIZE` | Deterministic manifest closure; mutate any closed input and prove a different/stale Release identity. |
| `REL-02` | Current proof is rechecked at ComposeRelease and material Promotion steps; bootstrap Evidence and Builder acceptance remain distinct. | Bootstrap platform artifacts and first Builder-produced Budget Analyzer candidate | Release | `PLATFORM-CONTRACT` | `REALIZE` | Bootstrap cannot manufacture `bld.change_acceptance`; operational Project Release requires exact current Builder acceptance plus admitted Evidence, and either stale input refuses progression. |
| `REL-03` | Promotion uses current authorization, conformance and CAS; one concurrent loser performs no material step. | Non-production first vertical and later PROD | Release | `PLATFORM-CONTRACT` | `REALIZE` | Real concurrency test over one target pointer; loser must produce conflict and zero DDL/drain/pointer effect. |
| `REL-04` | Pointer swap/HTTP 200 cannot masquerade as `SERVED_VERIFIED`; real served digest/composition must match. | Published Application | Release owns serving truth; MAR supplies serving mechanics | `PLATFORM-CONTRACT` | `REALIZE` | Prove the real serving path returns the expected exact composition; serve stale/wrong bytes and require verification failure. |
| `REL-05` | Functional configuration identity is Release-pinned while secret material/version remains outside Release bytes. | Budget Analyzer environments | Release owns config identity; Connections owns credential relation | `PLATFORM-CONTRACT` | `REALIZE` | Change config contract and require stale/revalidation; rotate a compatible secret and prove no secret enters manifest/source. |
| `REL-06` | Build, Preview, Release, Promotion and serving histories remain distinct. | Builder/Release frontend and runtime | Builder owns candidate/Preview; Release owns Release/Promotion/serving | `PLATFORM-CONTRACT` | `REALIZE` | Project representative transitions; attempt to infer live state from Preview/AVAILABLE and require rejection. |

## 10. Runtime-family applicability

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `RUN-01` | MAR serves exact active verified Release composition; no rebuild/latest fallback at request time. | Budget Analyzer Published Application | Managed Application Runtime | `PLATFORM-CONTRACT` | `REALIZE` | Real serving-path digest proof; remove exact artifact or present stale composition and require fail-closed behavior. |
| `RUN-02` | `job/v1` occurrence is admitted from exact served Release/current authority before execution. | Governed Sankhya sync | Managed Application Runtime | `PLATFORM-CONTRACT` | `REALIZE` | Prove one valid occurrence pins the exact served Release before execution; attempt stale/unserved pins and require no JobRun admission. |
| `RUN-03` | Managed sync is single-flight/coalesced and performs at most one current catch-up after downtime, never N-slot replay. | Governed Sankhya sync | Managed Application Runtime | `PLATFORM-CONTRACT` | `REALIZE` | Concurrent admissions and simulated missed intervals; require one winner/current catch-up and no backlog replay. |
| `RUN-04` | Process loss recovery depends on exact JobRun pins plus durable cursor/merge/quiescence truth, not queue redelivery. | Governed Sankhya sync | MAR owns occurrence; Project owns cursor/merge business state | `PLATFORM-CONTRACT` | `REALIZE` | Kill/restart around merge boundaries; ambiguous or incompatible continuation must stop rather than duplicate/skip silently. |
| `RUN-05` | Builder owner/runtime/E2B boundary and physical-incarnation guard are realized before the first operational Product proof. | Builder-generated/evolved Budget Analyzer | Builder | `PLATFORM-CONTRACT` | `REALIZE` | Real Change/CodingSession/ActorRun in guarded E2B proves re-entry/currentness/output custody; cancellation, guest-isolation and silent-physical-reincarnation controls must fire. |
| `RUN-06` | PAR owns Conversation/AgentRun/Approval/Trigger; Mastra runtime state remains subordinate and role-isolated. | Future first real Product Agent | Production Agent Runtime | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Preserve exact Release/tool/owner boundaries; first PAR consumer inherits re-pin, isolation, suspension/resume and effect proof. |
| `RUN-07` | BuilderMastra is admitted only for the exact Builder consumer; historical qualification cannot add ParMastra or unrelated Mastra surfaces. | Builder-generated Budget Analyzer; no Product Agent | Builder owns its runtime use; Project remains app owner | `PLATFORM-CONTRACT` | `REALIZE` | Dependency/runtime census admits exact Builder surfaces only; attempt to add PAR, DurableAgent, OM or unrelated framework globals and require consumer/admission failure. |
| `RUN-08` | Dormant Product-Agent runtime families—ParMastra instantiation in the first slice, advanced non-message memory, DurableAgent and EVENT—remain absent until their exact consumer and qualification triggers fire. | No first-slice PAR/advanced-runtime consumer | PAR/Brain/exact future runtime owner | `PLATFORM-CONTRACT` | `DEFER` | First Builder/Project dependency and runtime census excludes dormant PAR/advanced families; a named consumer plus its original memory/durability/event qualification trigger is required to reopen. |
| `DXE-01` | Any future durable runtime remains subordinate to exact owner run/occurrence admission, immutable pins and write-once terminal truth. | First real Builder/PAR/deterministic-flow consumer | Exact Builder, PAR or MAR owner; runtime owns mechanics only | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Admit a real owner run before runtime start; inject a runtime-only run/history and require no Product progression or terminal truth. |
| `DXE-02` | Durable continuation/recovery is single-winner, version-compatible and rechecks current owner authority before progress. | First real durable wait/recovery consumer | Exact run/wait owner | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Concurrent resume/recovery plus revoked authority and incompatible-version cases; require one winner or safe stop and no stale-authority progress. |
| `DXE-03` | Runtime retry, replay or memoization never authorizes external-effect replay; Gateway identity/outcome reconciliation remains required. | First effect-capable durable flow | Gateway owns effect; originating runtime owner owns its run | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Crash around effect boundary; replay runtime history and require reuse/reconciliation of exact Gateway effect identity rather than a new blind attempt. |
| `MEM-01` | Every non-message memory has exact Workspace/Project/Agent/subject/class/purpose scope, source provenance, retention and derived status. | First advanced-memory consumer | PAR owns use; exact source owner remains authoritative | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Cross-scope and provenance/retention negative cases; missing scope/source or foreign-subject recall must fail. |
| `MEM-02` | Product Agent reconnect uses owner sequence plus opaque delivery cursor and reconciles gaps from PAR; stream/cache never creates chronology or terminal truth. | FE-09 Published-App Agent road | PAR owns Conversation/AgentRun truth; runtime/client owns delivery only | `PLATFORM-CONTRACT` | `REALIZE` | Disconnect, expire cache/cursor and reconnect; require complete deduplicated owner chronology and no terminal state from stream end alone. |
| `MEM-03` | Persistent user-affecting memory requires an admitted inspect, correct and forget lifecycle before enablement. | First personal/working-memory consumer | Owning Product Decision Loop; runtime memory is subordinate | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Attempt hidden persistent profile extraction without human lifecycle and require admission stop; correction/deletion must reach derived stores. |
| `MEM-04` | Recalled, extracted or observed memory is untrusted context and cannot grant tools, Permissions, bindings, effects or publication. | First advanced-memory consumer | Exact authority owner remains server-derived | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Store prompt-injected memory requesting widened authority; require no capability/owner change at every governed boundary. |
| `LRN-01` | Learning outputs are traceable Evidence/proposals and may change Agent or Brain only through existing owner acceptance and Release. | First recurring Agent-improvement loop | Builder owns Agent Change; Brain owns KnowledgeProposal/publication | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Inject a high-score/theme output; require zero runtime/Agent/Brain mutation until accepted through the owner route. |
| `CMP-01` | Builder role composition uses exact Hub-admitted implement/verify ActorRuns; runtime/subagent graphs own no Plan, acceptance or terminal truth. | First Builder-produced Budget Analyzer | Builder | `PLATFORM-CONTRACT` | `REALIZE` | Inject provider/subagent success without Hub admission/settlement; require no WorkUnit/Change progression. |
| `CMP-02` | Material verifier receives fresh context and fresh immutable candidate materialization, cannot mutate, and emits typed Finding/Evidence only. | Material first-Builder verification | Builder | `PLATFORM-CONTRACT` | `REALIZE` | Reuse implementation continuation, permit verifier write or bind a different/stale digest; require independence proof failure. |
| `CMP-03` | Findings route through correction/fix WorkUnit/replan and complete applicable revalidation; verifier self-fix or partial recheck cannot close acceptance. | First Builder correction loop | Builder | `PLATFORM-CONTRACT` | `REALIZE` | Let verifier edit or mark stuck work complete, or skip an affected assertion after correction; require Change to remain unaccepted. |
| `CMP-04` | Hub compiles exact least-privilege context/tools/autonomy/model/budget per ActorRun; child/provider cannot inherit secrets/authority or recursively spawn. | Builder implementer, verifier and optional specialist | Builder/I&A/Gateway exact owners | `PLATFORM-CONTRACT` | `REALIZE` | Attempt whole-parent grant, Git/provider/DB credential access, prompt-requested widening or recursive spawn; require denial. |
| `CMP-05` | Native Mastra, SDK/ACP or private MCP adapters preserve one complete typed CodingWorkerRuntime result/cancel/suspension envelope. | Builder runtime Worker Eval | Builder owns run/result custody | `PLATFORM-CONTRACT` | `REALIZE` | Swap adapter on the same task and envelope; truncated/untyped/runtime-only success cannot advance owner state. |
| `CMP-06` | Builder is serial by default and the first operational path admits no concurrent-writer machinery. A later measured-benefit reopen may admit only explicit non-overlap, isolated lineages, deterministic Hub composition and conflict stop. | First operational Builder; later parallel candidate only after trigger | Builder | `PLATFORM-CONTRACT` | `REALIZE` | First-slice dependency/config/run census plus competing-writer canary proves serial admission; any concurrent writer before reopen or same-lineage/ambiguous composition after reopen is refused regardless of runtime completion order. |
| `CMP-07` | Worker Eval selects composition topology from accepted correctness, maintenance, negative controls, rework/intervention, cost/latency and conflicts. | Native Mastra versus SDK/ACP/private-MCP and specialist variants | Builder owns eval subject; Evidence owns no runtime selection | `PLATFORM-CONTRACT` | `REALIZE` | Compare variants on unequal tasks/context or reward throughput despite more accepted defects; require selection Evidence invalid. |
| `CMP-08` | Product-Agent/external agent composition remains absent until a named Product consumer and exact isolation/effect/approval proof reopen its owner. | No current PAR composition consumer | PAR/Product Decision Loop | `PLATFORM-CONTRACT` | `DEFER` | First Builder dependency/config/API census; any PAR agent-as-tool/network/A2A surface fails without owner reopen. |
| `IOP-01` | Protocol projection never becomes Product, capability, run or acceptance authority. | Builder ACP/private-MCP challenger; future external clients | Existing exact owners | `PLATFORM-CONTRACT` | `REALIZE` | Supply protocol-only tool/task/session success; require zero owner transition. |
| `IOP-02` | Discovery cards, schemas, annotations, prompts, resources, content, results and artifacts are untrusted inputs. | Any MCP/A2A/ACP boundary | Consuming owner/security boundary | `PLATFORM-CONTRACT` | `REALIZE` | Inject malicious description/result/card/URL/artifact; require no allowlist, authority, filesystem or network widening. |
| `IOP-03` | Every protected protocol call rederives current principal, Workspace, Project, binding and scope authority. | Builder-private MCP/ACP and future remote calls | I&A plus exact capability owner | `PLATFORM-CONTRACT` | `REALIZE` | Revoke after discovery/cache and attempt call/handle reuse or cross-Workspace access; require denial. |
| `IOP-04` | Protocol task/session/status/cancel/resume cannot settle ActorRun, AgentRun, WorkUnit, Change or Effect truth. | ACP Builder challenger and future A2A | Exact Builder/PAR/Gateway owners | `PLATFORM-CONTRACT` | `REALIZE` | Cancel/race/disconnect/late-result case; protocol status cannot imply quiescence, rollback or terminal owner fact. |
| `IOP-05` | Every protocol-originated external effect remains Gateway-owned, idempotent/reconciled and bound to exact originating owner run. | Future effect-capable MCP/A2A/ACP call | Capability Gateway | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Duplicate/lost response and cancel race around effect; require reuse/reconciliation of exact EffectAttempt rather than blind replay. |
| `IOP-06` | Protocol permission, elicitation, `AUTH_REQUIRED`, HITL or `allow_always` response cannot widen its exact sealed Conexus subject. | Builder ACP/private-MCP and future remote agent | Builder/PAR/I&A exact approval owner | `PLATFORM-CONTRACT` | `REALIZE` | Approve a changed/stale/wider subject or persist provider allow-always beyond current policy; require refusal. |
| `IOP-07` | Protocol revision and extensions are exact-pinned; downgrade or non-wire-compatible extension cannot silently remove safety. | MCP/ACP/A2A adapters | Consuming mechanism boundary | `PLATFORM-CONTRACT` | `REALIZE` | Negotiate unsupported/older revision or mix MCP Tasks wire generations; require explicit incompatibility/stop. |
| `EVA-01` | Every material eval pins exact subject/candidate, dataset/cases, runtime/model, context/tools, environment, evaluator and repetition identity. | First Builder Worker Eval; later Product-Agent eval | Builder/PAR owns eval subject; manifest is Evidence | `PLATFORM-CONTRACT` | `REALIZE` | Mutate one deciding input while retaining eval identity; require comparability/reproducibility failure. |
| `EVA-02` | Protected invariants use item-level mechanical gates and firing negative controls; stochastic judge is never the sole hard gate. | Worker Eval and Change verification | Exact protected-property owner | `PLATFORM-CONTRACT` | `REALIZE` | Make LLM judge pass a deterministic authority violation or non-firing RED control; require candidate/claim failure. |
| `EVA-03` | Eval accounting distinguishes executed/succeeded/failed/skipped/scorer-error/missing and cannot hide a failing tail in aggregates. | Every comparative eval | Builder/PAR eval Evidence | `PLATFORM-CONTRACT` | `REALIZE` | Remove a result/score or hide one failing item behind average; require `NOT_PROVEN`/failed claim. |
| `EVA-04` | Paired representative repeated trials report correctness/variance, cost/latency, intervention/rework and forbidden-boundary attempts. | Native Mastra vs SDK/ACP/private-MCP Worker Eval | Builder | `PLATFORM-CONTRACT` | `REALIZE` | Compare unequal envelopes or select from one/best-of-k run; require comparison invalid. |
| `EVA-05` | Eval resources, threads and workspaces are isolated, undeclared tools denied, and mocks never prove real-dependency claims. | Worker/Product-Agent eval harness | Claim/eval owner | `PLATFORM-CONTRACT` | `REALIZE` | Contaminate adjacent/real-user memory or make undeclared/live effect call; require isolation failure and no real-claim PASS. |
| `EVA-06` | Scorer/judge is calibrated and exact-versioned; definition/model/rubric change creates new evaluation identity. | LLM-judge or heuristic eval | Builder/PAR eval Evidence | `PLATFORM-CONTRACT` | `REALIZE` | Change judge model/prompt/rubric under same dataset/run comparison; require drift/incomparability. |
| `EVA-07` | Eval output is immutable Evidence; only current owner acceptance may select runtime or accept Change. | Worker Eval and per-Change verification | Builder/PAR exact owner | `PLATFORM-CONTRACT` | `REALIZE` | Feed framework `passed`/completed score without owner settlement; require no acceptance/terminal transition. |
| `TEL-01` | Trace/log/metric/score/feedback identity and status are correlation only, never principal, authorization, terminal truth, quiescence, rollback or audit. | Builder Worker Eval and MAR first-slice ordinary observation; later PAR | Exact Builder/MAR/PAR owner settles truth; ordinary observation mechanism owns correlation only and instantiates no `obs.*` Product path | `PLATFORM-CONTRACT` | `REALIZE` | Emit successful trace/score without owner settlement; owner remains pending/unknown, no grant/effect changes and no OBS Product record is fabricated. |
| `TEL-02` | Sampling, filter, redaction, buffer, drop, export and missingness state is explicit. | Every observed Builder/MAR run and comparative eval | Exact claim/runtime owner; observation mechanism owns coverage Evidence only and instantiates no `obs.*` Product path | `PLATFORM-CONTRACT` | `REALIZE` | Drop/filter/sample/flush-fail one required event; coverage gap is visible and cannot become clean PASS/zero or a fabricated OBS owner fact. |
| `TEL-03` | Telemetry enforces minimization, tenant isolation, retention/residency/access and tested redaction before exporter egress. | First telemetry exporter | Observability & Audit + security | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Inject canary secret/PII and filter failure or cross-tenant query; require no external disclosure/access. |
| `TEL-04` | Feedback binds authenticated reviewer, source, rubric/version and exact run/candidate subject and remains Evidence. | First human/online review loop | Exact review owner; OBS stores projection | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Spoof reviewer/source, duplicate or bind stale/different candidate; require no approval/acceptance effect. |
| `TEL-05` | Exporter/bridge/schema identities are pinned and replaceable through one Conexus observation projection. | OTel/OTLP and future backend | Observability & Audit | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Swap adapter or send forged/malformed trace context; Conexus owner linkage/semantics remain unchanged or fail safely. |
| `LRN-02` | Trace Intelligence is optional discovery; unavailability/noise/theme cannot block Builder correctness or create causal finding/fix without source-trace review. | Later recurring Agent-learning consumer | Existing Builder/Brain/PAR owner routes | `PLATFORM-CONTRACT` | `DEFER` | Remove platform access or provide <100 traces/misleading theme; local eval remains functional and zero owner mutation occurs. |

## 11. Verification, evidence and operations

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `VER-01` | Every Project profile has deterministic format/type/build/unit/integration and contract-drift gates proportional to admitted properties. | Budget Analyzer and every generated Project | Project owns its acceptance inputs; verification mechanics own no Product meaning | `PLATFORM-CONTRACT` | `REALIZE` | Reproduce the gate set; introduce representative syntax/type/wire drift and prove the appropriate gate fires. |
| `VER-02` | Real database, browser, external-integration, recovery and production claims use real dependencies at the owning stage. | 4D/4E proof and first build | Claim-owning authority; Evidence owns no Product meaning | `PLATFORM-CONTRACT` | `REALIZE` | Bind each claim to its required Evidence class; present mock-only proof for a real-dependency claim and require rejection. |
| `VER-03` | Required Evidence missing is `NOT_PROVEN/INCONCLUSIVE`, never PASS. | Release, Promotion and first vertical reconciliation | Claim-owning authority | `PLATFORM-CONTRACT` | `REALIZE` | Prove closure with the complete required identity set; remove one proof identity and require admission/closure to fail. |
| `VER-04` | Negative controls deliberately perturb only the candidate/control side and must turn the claimed property red. | All material 4D properties | Claim-owning authority | `PLATFORM-CONTRACT` | `REALIZE` | Execute one firing falsifier per material family; a non-firing control blocks closure. |
| `VER-05` | Budget Analyzer executes the independent source/read-model/Product-path reconciliation contract. | First vertical benchmark | Project owns result meaning; 3O Evidence owns only proof | `APP-OWNED` | `REALIZE` | Execute `3O-P1..P7` with real source and exact provenance; introduce deterministic candidate-side divergence and require red. |
| `VER-06` | Dependency admission uses exact reproducible provenance and rejects floating or denied packages. | Every 4D-C selection | Consuming mechanism boundary; no Product owner transfer | `PLATFORM-CONTRACT` | `REALIZE` | Lock/provenance/license/security check; replace an admitted identity with floating/denied input and require failure. |
| `VER-08` | Audit-required failure is fail-closed, while ordinary telemetry degradation is separately honest. | First later audit-required operation | Observability & Audit | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | First audit-required consumer must prove persistence failure blocks the operation; first non-production Budget slice instantiates no audit-required operation. |
| `VER-09` | First-production restore, identity continuity, credential decryptability, deny-only recovery and serving revalidation cannot be imitated in DEV. | First production activation | Existing owners re-establish their own truth; operations owns deny-only mechanics | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Real off-host restore/emergency-stop proof before production; remains outside non-production first-slice execution. |
| `VER-10` | SHARE authority-drift evidence is limited to versioned detector classes with proven firing controls; it never claims universal semantic correctness. | Builder SHARE/result acceptance | Builder owns acceptance; generated traceability and detectors are Evidence only | `PLATFORM-CONTRACT` | `REALIZE` | Run every declared detector against a RED fixture; remove a firing fixture or feed a stale trace manifest and require positive coverage to be refused. |

## 12. Versioning, escape hatch and evaluation

| ID | Protected property / failure class | Current consumer | Authority route | Class | Disposition | Proof strategy / firing falsifier |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `CON-01` | Exact Paved-Road version/pins and upgrade law are reproducible; version drift never silently changes behavior. | Every generated/evolving Project | Project pins profile; platform scaffold supplies reproducible mechanism | `PLATFORM-CONTRACT` | `REALIZE` | Reproduce old and upgraded profiles; change a material pin without migration/requalification and require conformance failure. |
| `CON-02` | Escape hatch names one unmet real property/consumer and cannot weaken platform/security contracts. | First Project that cannot fit the default road | Project | `PLATFORM-CONTRACT` | `PRESERVE_SEAM` | Validate a complete synthetic escape contract against preserved invariants; omit property, Baseline impact or proof and require rejection. |
| `CON-03` | Escape hatch has deletion/rejoin conditions and cannot become an unowned permanent fork. | Any escaped Project | Project | `APP-OWNED` | `PRESERVE_SEAM` | Conformance reports divergence and successor/rejoin state; missing owner or removal condition blocks admission. |
| `CON-04` | Builder/Worker can use the road without editing protected seams or inventing authority. | Conexus Worker Eval and first operational Builder | Builder owns work/eval subject; platform scaffold owns no Product meaning | `PLATFORM-CONTRACT` | `REALIZE` | Native-Mastra and hosted SDK/ACP candidates run the same representative real tasks plus forbidden seam bypass; correctness/maintenance/authority Evidence selects later, and bypass must fail. |
| `CON-05` | Paved-Road skills, hooks and rules are versioned/distributed from one profile generation and cannot become local untracked authority. | Generated Projects and later Builder execution | Project pins profile; scaffold distribution is mechanism | `PLATFORM-CONTRACT` | `REALIZE` | Reproduce one profile's distributed assets and digests; edit a local deciding rule/hook without profile/Baseline change and require drift/refusal. |

## 13. Knowledge state after compilation

### Known

- 4A meaning, owners, Permissions and consumer classes are closed.
- 4B canonical wire and generated-consumption viability are closed.
- 4C/P13 interaction, state/auth custody and feature topology are closed.
- Node/TypeScript Hub, PostgreSQL 17, React/TypeScript/Vite/TanStack,
  Keycloak authentication and the qualified runtime seams are accepted
  directions with their current disposition.
- The read-only Budget Analyzer is the first proving Project. Its bootstrap
  platform foundations may precede Builder, but its first operational Project
  composition must be generated/evolved through BuilderMastra + guarded E2B.
  PAR and Product Agent remain absent.

### Unknown — must remain open until the owning 4D-C row

- exact scaffold/profile schema and physical tree;
- exact generator and generated integration APIs;
- exact API/router and backend module/package topology;
- exact React/Vite/TanStack versions and frontend package boundaries;
- exact supported Keycloak and Node OIDC-client versions;
- exact PostgreSQL table/index/role/transaction and CR-1 primitives;
- exact migration tooling;
- exact Sankhya Gateway/API capability adapters and honest provider-derived comparison coordinate;
- final MAR private substrate/adapters;
- exact process/config/secrets/startup/readiness/shutdown mechanics;
- exact non-production and first-production deployment/recovery tooling.

### Deferred

- first-slice PAR/Product Agent/ParMastra instantiation;
- advanced non-message Agent memory, Product-Agent/external composition and durable-execution surfaces;
- effect-capable managed-job recovery;
- DEDICATED physical deployment;
- first-production restore/activation execution;
- SaaS/public ingress/private-on-prem reachability;
- speculative workflow, generic repository, generic SDK/helper and policy-pack
  machinery.

## 14. Compilation result

The initial compilation exposed no upstream Product/architecture contradiction,
but operator challenge found an inquiry-classification defect: lack of an
already-instantiated first-slice consumer could suppress strategic evaluation.
It also exposed the missed accepted `4C-F29` comparative-study obligation. Both
are corrected by 4D-01R and the added rows above.

Consolidated candidate outcome:

```text
CURRENT AUTHORITY SUFFICIENT FOR 4D-A/B DERIVATION AFTER 4D-01R
upstream reopen = 0
technology selections admitted by 4D-01 = 0
implementation authority = 0
```

Wave-A/B/C opportunity research is complete. The consolidated ledger contains
`117` unique protected properties across `18` families: `96 REALIZE`,
`18 PRESERVE_SEAM`, `3 DEFER`, `0 STOP`; `101 PLATFORM-CONTRACT`, `11 APP-OWNED`
and `5 GENERATED`. Exact technology selections, upstream reopens and Product
authority additions remain zero. 4D-A/B derivation stays blocked until explicit
operator approval of this ledger candidate. The operator approved the
consolidated ledger with the binding incremental-value condition recorded in the
4D phase and Realization Planning owners.
