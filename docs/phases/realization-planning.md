# Realization Planning — First Build

Current mutable status and the exact next action remain owned only by [../roadmap.md](../roadmap.md). This document compiles the ratified Product/architecture target into the smallest executable first-build plan. It does not authorize Product implementation or production activation. The operator-selected Keycloak requirement fired the named C-015 identity-provider reopen trigger; that decision is now boundedly refined and registered without reopening 3A–3O, 3L or C-018 as a whole.

## 1. Decision

**Outcome:** `CURRENT STRUCTURE CONFIRMED / 4D BUILDER APPLICABILITY REVISED` for the first real vertical, with the bounded post-C-018 C-015 authentication refinement registered in the decision authority and the operator-triggered Builder proving correction below.

The first authorized build should realize only the architecture needed to deliver and falsify a real read-only **Analisador Inteligente de Orçamentos — Sankhya** slice:

```text
minimum current authority
→ Keycloak-backed human authentication + Conexus-owned session/authorization
→ Workspace + Project
→ exact Brain semantic binding
→ exact Sankhya Connection binding
→ minimum capable Builder over exact Baseline/context/Paved Road
→ governed read-only source access
→ Builder-authored Project analytical/read model + governed sync
→ Builder-authored static registered Queries + Published Application dashboard
→ exact Release / Promotion / SERVED_VERIFIED
→ independent live-source reconciliation
```

No material Evidence found during planning requires a new Product capability, semantic owner, trust zone, framework replacement, generic workflow/proof/recovery abstraction, or 3A–3O/3L reopen. C-015 alone was reopened by its explicit trigger and immediately refined through the operator-approved Keycloak selection while preserving its Account/session/authorization invariants.

The foundation/bootstrap tranche may precede Builder because Conexus cannot use a
runtime that does not yet exist. The first **operational Product proof**, however,
must use the accepted Builder/Mastra/E2B path to create and evolve the Budget
Analyzer. PAR, Product Agent, AnalyticQuery, external writes and effect-capable
managed jobs remain absent. Bootstrap work is not Builder proof.

## 2. Planning question

> What is the smallest ordered realization that can deliver one useful real Sankhya-backed read-only Product slice while genuinely falsifying every FIRST_BUILD obligation it makes reachable, preserving every other obligation as explicit `NOT_INSTANTIATED` or `FIRST_PRODUCTION`, and refusing to manufacture infrastructure merely for test coverage?

## 3. Non-degradable laws

The implementation plan and every later execution slice inherit these laws:

```text
repository current authority > plan > implementation mechanics
mechanism != authority
one semantic authority per meaning
provider identity proof != Product authorization
unknown / partial / unsupported != zero / success
future seam != dormant implementation
same Workspace != implicit resource-use authority
Project DB != proof that Sankhya synchronized correctly
Brain source != Project repo
binding intent != mutable latest
AVAILABLE != PROMOTED != SERVED_VERIFIED
telemetry != owner terminal truth
first build != first production
NOT_INSTANTIATED != waived
```

Any implementation shortcut that weakens one of these laws is a falsifier, not an optimization.

## 4. Exact first-build Product scope

The first authorized build contains exactly the following Product capability surface.

### 4.1 Minimum authority shell

- one real Workspace isolation root;
- one real Budget Analyzer Project with an approved Project Baseline sufficient for this slice;
- Keycloak as the selected standards-based OIDC authentication provider for real human login;
- one verified external identity key `(issuer, subject)` mapped as attributes of the existing Conexus `iam.account`;
- Conexus-owned opaque application session and server-derived current authorization at protected control points;
- Keycloak roles/groups/Authorization Services never substitute for Workspace membership, Project grants or Published App access;
- no public signup, SaaS onboarding, billing, Area UX, cross-Workspace sharing, or generic role/policy engine.

### 4.2 Minimum Brain semantics

- one canonical Workspace Brain source independent from Project Git;
- only `SEMANTIC` content required by Product-visible Budget Analyzer results: the accepted dataset/grain/dimensions/measures/metrics/relationships/null/time caveats actually needed by the slice;
- immutable Brain artifact revision plus exact ProjectBrainBinding and binding conformance;
- Brain health sufficient to fail closed for critical numeric semantics;
- no Brain Discovery, feedback workflow, semantic recall, vector/RAG layer, advanced memory, knowledge-proposal machinery, or AnalyticQuery.

A result is not admitted merely because Sankhya can return a number. If no current semantic authority resolves the result, it remains `UNSUPPORTED` and is not exposed as supported truth.

### 4.3 Sankhya source boundary

- one exact Sankhya Connection lifecycle and revision;
- one exact ProjectConnectionBinding;
- read-only qualification and least-privilege source authority;
- Hub/Gateway-outbound enterprise access only;
- server-derived binding/destination; browser/caller/model cannot select an arbitrary Connection or target;
- no external writes, Actions, effect admission, idempotency/effect replay machinery, arbitrary egress proxy, or guest credential path.

### 4.4 Governed sync and Project analytical/read model

- one Project-owned analytical/read model containing only data needed by the admitted first dashboard results;
- one `job/v1` governed-sync consumer under MAR;
- manual + fixed-interval admission where useful;
- single-flight + coalesce;
- after downtime, at most one current catch-up when the exact currently served Release still requires sync and current freshness is behind;
- no replay of N missed slots;
- durable sync cursor/freshness plus deterministic merge/commit facts sufficient to adjudicate restart continuation;
- no generic scheduler/workflow domain and no MAR→Gateway unresolved-effect recovery seam because this job is read-only.

### 4.5 Registered read-only Product Queries

- static registered Query artifacts only for the first slice;
- real bind parameters and Project read-only database authority;
- no runtime arbitrary SQL, table-name selection, new join topology, or AnalyticQuery;
- one stable Product-owned result boundary consumed by the Published Application and by the 3O candidate side.

The exact number of dashboard results is not fixed by implementation convenience. The admitted set is the **smallest coherent useful set whose semantics are already current authority**. Every supported result must appear in the 3O result inventory and map to a materially distinct transformation-rule class; unsupported meaning is withheld or shown explicitly as unsupported, never guessed.

### 4.6 Published Application dashboard

- React + TypeScript + Vite + TanStack paved road already ratified;
- smallest dashboard needed to consume the registered supported results and expose freshness/unsupported/indeterminate states truthfully;
- independent Published Application authorization/session boundary from Control Plane and Preview;
- current F1 Published App roles only: `admin | member`;
- the exact locked app-first Builder/Conexus interaction is instantiated only
  for the proving Project; no configurable Agent fleet, generic analytics
  builder or infrastructure console is added.

### 4.7 Exact Release, Promotion and serving

- immutable ArtifactRevision identities for the Brain/app/query/job artifacts actually composed;
- exact Release composition and Project bindings;
- target EnvironmentConformance over the real non-production target used for first-build proof;
- Promotion and active serving pointer under current authorization;
- served digest verification after switch;
- `SERVED_VERIFIED` only after the real served result matches the exact intended Release composition;
- no mutable `latest`, rebuild-at-serve, or AVAILABLE/pointer-swap success shortcut.

The first-build proof target is **non-production**. FIRST_PRODUCTION recovery/activation obligations remain separate and are not simulated by a DEV deployment.

### 4.8 Incremental-value delivery law

The ordered slices are not one big-bang platform build. Each slice must end in
one of two honest outcomes:

```text
usable internal capability exercised by its named company consumer
OR
enabling foundation immediately consumed by the next already-admitted slice
```

No slice may instantiate dormant future families merely because the complete
Product is complex. Conversely, a small increment may not waive authority,
security, real-data, recovery or proof properties reachable in that increment.
The first useful vertical remains the real Builder-produced Budget Analyzer;
operator/company use and Evidence determine the next expansion.

## 5. First-slice durable authority budget

The 46-class architectural closure is not a table-generation checklist. The first build may instantiate only record classes with a concrete consumer in the scope above.

Initial allowed semantic record-class set:

```text
iam: account / session / workspace_membership / account_project_grant / published_app_access
ws:  workspace
prj: project / approved_baseline / brain_binding / connection_binding
bld: change / contract_revision / plan_revision / work_unit / actor_run / coding_session / finding / change_acceptance
reg: artifact / artifact_revision
con: connection / connection_revision / connection_qualification
brn: health / binding_validation
rel: release / promotion / active_pointer
mar: serving_route / job_run
```

The Keycloak `(issuer, subject)` identity key is an attribute of existing `iam.account`. Keycloak provider persistence is external authentication-substrate state and does not create a Hub schema or 47th Conexus record class.

Project analytical/read-model tables are Project-owned business state and are not part of the 46 Hub record classes.

Deliberately absent from the first slice:

```text
par.*
gw.effect_attempt / gw.idempotency_claim / gw.budget_counter
brn.knowledge_proposal
iam.area_membership / iam.area_project_grant
obs.*
att.*
```

`prj.config_contract_revision` is also not instantiated unless the first real Release exposes a configuration contract that cannot be represented by the accepted exact Release/binding composition. A real consumer is the admission condition; convenience is not.

No physical table-per-record mandate follows from this budget. Exact table/column structure is derived during implementation while preserving the current owner-schema and FK laws.

## 6. Explicit exclusions

The first build MUST NOT add any of the following solely to exercise architecture:

```text
Product Agent / PAR
configurable Agent fleet/marketplace or generic Missions UI
AnalyticQuery
Brain Discovery or feedback machinery
external writes / Actions / effect attempts / approval / replay
EVENT triggers
DEDICATED runtime or guest→private-Hub inbound reachability
advanced memory / RAG / semantic recall
arbitrary agent-as-tool / networks / dynamic subagent graph / external MCP / A2A
arbitrary managed jobs
workflow/BPM/automation/scheduler Product domain
generic Proof Engine / Evidence owner / Recovery owner
private attachments/blob Product capability
SaaS signup / billing / tenant commerce
HA / PITR / multi-host / production restore machinery
hard monetary reservation/accounting machinery
generic observability/audit platform
```

A later real consumer re-enters only the smallest owning Decision Loop. Preserved
seams are not permission to prebuild them. The Budget Analyzer is now the named
first Builder consumer; only the advanced families still listed above remain
excluded.

### 6.1 Builder proving correction from 4D

The operator challenged the earlier inference that the first proving Project
could remain entirely hand-built while Builder stayed dormant. Current Mitra,
Factory AI, Mastra and Package-A Evidence confirms:

```text
manual Hub/bootstrap foundation = necessary and allowed
complete hand-built proving app  != proof that Conexus builds applications
first operational Budget Analyzer = must traverse real Builder authority/runtime
```

The minimum capable Builder includes exact Change/CodingSession admission,
persistent thread/tasks, Context Compiler/Paved-Road inputs, guarded E2B
Workspace, code/command/search tools, mechanical questions/approvals, Hub-owned
Git/result custody, build/test/browser feedback and independent material
verification. Native Mastra coding versus Mastra-hosted SDK/ACP coding runtime
remains a 4D-C Worker Eval decision.

## 7. Pre-build admission gates

These gates occur after this Realization Plan is accepted and only under separate execution authority. They precede Product code where their result can invalidate the build target.

### RP-G0.1 — Exact Mastra repin qualification

The old qualification pins are deciding historical Evidence and MUST NOT be inherited into realization.

Current upstream Evidence establishes:

```text
concurrent-resume fix merge commit = 84a5b699f84d6bae0a34efe5a970d891090b9f41
raw-auth-token persistence fix merge commit = 7c60df5c7872343fbac5c3e5b1175c8076a5abfd
7c60df5... descends from 84a5b699...
```

Therefore the exact **source admission floor/candidate** for the affected defect classes is:

```text
mastra-ai/mastra @ 7c60df5c7872343fbac5c3e5b1175c8076a5abfd
```

`@mastra/core@1.60.0` is explicitly **DENIED** for realization because upstream issue `#21975` reproduced raw `mastra__authToken` persistence on that exact version. A version label such as `latest` is never admission Evidence.

Before any Mastra package enters Product realization:

1. bind an exact stable package/source identity whose source provenance contains both merge commits above, or use the exact source candidate only in the isolated qualification harness;
2. prove the raw bearer token is absent from durable workflow snapshots, score rows and durable-agent inputs under the affected persistence paths;
3. prove concurrent resume on the selected concurrency-capable store has a storage-backed single-winner claim and a deterministic losing outcome;
4. rerun only existing 3L criteria whose tested behavior is materially touched by the selected source/package delta or enabled surface;
5. record exact lock/source/probe Evidence.

Because the first Budget Analyzer now instantiates **BuilderMastra as an exact
Builder consumer** but no Product-Agent/PAR Mastra surface, this qualification
admits only the Builder package/runtime/store surfaces required by `RB`. It MUST
NOT add workflows, DurableAgent, production scorers, ParMastra or other dormant
Mastra families merely to consume the result. The isolated qualification may
complete before `RB`; Builder installation begins only under the exact admitted
Builder consumer and Evidence.

Reopen 3L only if the bounded affected-criteria requalification materially falsifies an accepted 3L property. A packaging delay or lack of an admissible stable release is a dependency stop, not permission to use `1.60.0`.

### RP-G0.2 — Sankhya comparison-boundary probe

Current repository authority does not fix a Sankhya API transaction/change ID,
column/timestamp watermark, provider-internal database coordinate or other
source-specific cutoff. Realization MUST NOT invent one. In particular, Oracle
SCN/Flashback is not a Sankhya contract unless the provider explicitly exposes
and supports that coordinate for the exact proof.

Before live reconciliation can claim `MATCH`, a bounded read-only source probe must establish one honest comparison coordinate for the exact Sankhya source and admitted semantic subject, such that:

```text
source oracle coverage
== governed-sync/read-model candidate coverage
```

The coordinate may be a source transaction/snapshot identity, an admitted business cutoff plus deterministic cursor, or another source-supported mechanism, but only Evidence from the real source may select it. A freshness timestamp alone is insufficient. It is a proof/sync coordinate, not a new Product object, owner or durable record class.

If no common boundary can be established without candidate self-reference, the build stops with `INDETERMINATE` and reopens the smallest data/3O decision. It does not compensate with tolerance, cache age, or guessed business time.

### RP-G0.3 — Dependency/supply-chain admission

- exact lockfile and supported dependency provenance;
- reject known malicious Mastra package families/versions already denied by Q0/C-016;
- no floating runtime dependency resolution;
- no framework package is admitted before a current consumer exists;
- select and pin an exact supported Keycloak release plus a maintained standards-compliant Node OIDC implementation using current official release/security/version Evidence before R1 code;
- a Node OIDC implementation that cannot support the required confidential server-side client is not admissible.

This executes the applicable supply-chain proof family without creating a generalized dependency platform. Detailed Keycloak research/negative controls remain derived guidance under `docs/development/production-realization-guide.md`; C-015 in the decision register owns the accepted technology decision and its reopen triggers.

## 8. Ordered realization slices

Each slice must leave an independently falsifiable working boundary. Later slices may depend on earlier owner contracts; no slice may bypass an owner because a later integration is easier that way.

| Slice | Deliverable | Owners / authority | Depends on | FIRST_BUILD obligations exercised |
| --- | --- | --- | --- | --- |
| `R1` | Keycloak OIDC login + Conexus Account/session + Workspace + Project + approved Baseline and project access | I&A, Workspace, Project; Keycloak only as auth mechanism | `G0` admission | `3N-V01`; CR-1 contract prepared; Published-App/session security preconditions |
| `R2` | canonical minimal Brain revision/binding + exact Sankhya Connection revision/binding + read-only Gateway path | Brain, Registry, Project, Connections, Gateway | `R1` | `3N-V06`, `V07`, `V10`; Brain conformance/health; Connection/Gateway egress |
| `RB` | minimum capable Builder: real Change/CodingSession/Plan-WorkUnit/ActorRun path, guarded E2B Workspace, context/Paved Road, tools, Git custody and independent verification | Builder owns work/correctness; Project/Git/runtime remain bounded by existing owners | `R1–R2` + exact Mastra/E2B admission | `3N-V02..V05`, `V15..V17`; Package-A guard; Worker Eval baseline |
| `R3` | Builder-authored Project read-model migration + governed sync artifact/admission contract + cursor/merge semantics | Builder authors candidate; Project DB, MAR, Release pins, Connections/Gateway own runtime truth | `RB` | `3N-V18`, `V19`; managed duplicate-authority/deciding-Evidence contract |
| `R4` | Builder-authored static registered Query artifacts + Product-owned result API/boundary | Builder authors candidate; Project, Registry and Gateway/read executor own admitted result path | `R3` | 3O semantic/unknown preconditions; read-only query enforcement |
| `R5` | Builder-authored minimal React Published Application using only admitted results + independent app authorization | Builder authors candidate; I&A, Project and MAR own app/serving truth | `R4` | `3N-V21`, `V24`; frontend/security and Published App proof families |
| `R6` | exact candidate artifacts + current verification Evidence digests → Release → non-production Promotion → EnvironmentConformance → active serving → `SERVED_VERIFIED` | Registry, Release, Project, I&A, MAR | `R3–R5` | `3N-V22`, `V23`, `V24`; CR-1 representative concurrency proof; current-proof recheck; Release/serving family |
| `R7` | real JobRun + governed Sankhya sync + real Product result + independent live oracle + negative control + complete verification manifest | existing owners; proof Evidence owns no Product meaning | `R6` + real source boundary | `3N-V18`, `V28` through `3O-P1..P7`; first-vertical reconciliation; minimal benchmark Evidence |

### 8.1 Why Release appears before the real sync occurrence

The managed sync occurrence is derived from an exact served Release. `R3` builds and verifies the sync/read-model contract, but no real JobRun is admitted from an unpinned candidate. `R6` creates the exact non-production Release/serving authority. `R7` then admits the real JobRun and executes the real sync/comparison under those exact pins.

This preserves:

```text
job code exists
!= admitted JobRun
!= queue presentation authority
```

### 8.2 Bootstrap proof versus Builder-produced Release proof

Bootstrap platform artifacts created before `RB` MUST NOT manufacture a fake
Change acceptance. They use exact verification/validation Evidence identities.

For the operational Budget Analyzer candidate after `RB`:

```text
exact Change + current bld.change_acceptance
+ candidate verification/validation Evidence digests
→ closed/referenced by the exact Release composition
→ rechecked as current admitted proof at ComposeRelease
→ rechecked again before material Promotion steps
```

Stale/inadmissible proof refuses progression. Bootstrap Evidence never
self-promotes into Builder acceptance, and Builder acceptance never replaces
owner-specific verification Evidence.

## 9. Exact FIRST_BUILD applicability manifest

The first-build implementation branch must carry one manifest keyed by the existing 3N IDs. It is verification Evidence only, not a Product record or generic proof engine.

| ID | Realization disposition | First proof location / reason |
| --- | --- | --- |
| `3N-V01` | `EXECUTE` | `R1/R7`: cross-Workspace Project/query/app access must fail through real owner paths |
| `3N-V02` | `EXECUTE` | `RB/R3–R5`: real Builder Change execution produces the proving Project without bypassing owner boundaries |
| `3N-V03` | `EXECUTE` | `RB`: CodingSession/ActorRun/runtime re-entry and honest failure are exercised |
| `3N-V04` | `EXECUTE` | `RB`: proportional Plan/tasks/current progress remain Builder owner truth rather than chat inference |
| `3N-V05` | `EXECUTE` | `RB`: E2B physical-incarnation, credential, network and guest→Hub denial guards fire |
| `3N-V06` | `EXECUTE` | `R2`: Workspace Brain canonical source is physically/logically independent from Project Git |
| `3N-V07` | `EXECUTE` | `R2/R6`: published Brain update cannot silently move exact Project binding/Release pins |
| `3N-V08` | `NOT_INSTANTIATED` | no Brain Discovery proposal path |
| `3N-V09` | `NOT_INSTANTIATED` | no AnalyticQuery; static registered Query is used instead |
| `3N-V10` | `EXECUTE` | `R2/R7`: caller-supplied Connection/destination cannot override exact server-derived Project binding |
| `3N-V11` | `NOT_INSTANTIATED` | no external effect or effect replay |
| `3N-V12` | `NOT_INSTANTIATED` | no Product Agent/effectful new admission |
| `3N-V13` | `NOT_INSTANTIATED` | no effect idempotency/reconciliation scope |
| `3N-V14` | `NOT_INSTANTIATED` | no Product Agent/suspension/restart |
| `3N-V15` | `EXECUTE` | `RB`: BuilderMastra is instantiated with role-local store/PubSub/Workspace; ParMastra remains absent |
| `3N-V16` | `EXECUTE` | `RB`: runtime/RequestContext inputs remain non-authoritative and every governed Builder boundary rechecks current/pinned owner truth |
| `3N-V17` | `EXECUTE` | `RB`: bounded Builder model execution, limits and truthful usage/cost Evidence are exercised |
| `3N-V18` | `EXECUTE` | `R3/R7`: downtime admits at most one current catch-up, never N missed slots |
| `3N-V19` | `EXECUTE` | `R3`: read-only sync recovery does not gain effect-capable machinery with no consumer |
| `3N-V20` | `NOT_INSTANTIATED` | no OBS/telemetry-to-owner decision path; MAR/Project write their own owner facts directly and ordinary logs remain mechanics |
| `3N-V21` | `EXECUTE` | `R5/R7`: Control Plane authority does not imply Published App access and vice versa |
| `3N-V22` | `EXECUTE` | `R6`: AVAILABLE or pointer swap without served-digest verification cannot become `SERVED_VERIFIED` |
| `3N-V23` | `EXECUTE` | `R6`: real target migration/conformance drift must fail closed before success |
| `3N-V24` | `EXECUTE` | `R5/R6`: caller-addressable Published App serving retrieves exact stored/digest-addressed bytes; asset/data paths may not bypass current serving/app authorization merely through object/path/digest possession |
| `3N-V25` | `FIRST_PRODUCTION` | preserved unchanged; no DEV restore imitation |
| `3N-V26` | `FIRST_PRODUCTION` | preserved unchanged; no DEV stale-authority imitation |
| `3N-V27` | `FIRST_PRODUCTION` | preserved unchanged; no DEV post-cutoff Git imitation |
| `3N-V28` | `EXECUTE` | `R7` via `3O-P1..P7` against real governed Sankhya and the real Product path |

A later first instantiation of any `NOT_INSTANTIATED` surface inherits the original 3N route before that capability can be considered realized.

## 10. Downstream proof-family manifest

| Architecture §42 family | First-build disposition |
| --- | --- |
| Brain Discovery/feedback/conformance/health | execute only binding conformance + critical semantic health actually used; Discovery/feedback = `NOT_INSTANTIATED` |
| scaffold/codegen/frontend contract/security invariants | `EXECUTE` for the real Published App scaffold and contract/security surface; no generic codegen platform required |
| Builder UX progressive disclosure | `EXECUTE` in `RB`: ordinary work remains app-first while Plan/progress/Findings/Evidence and runtime detail stay progressively inspectable |
| Observability/audit/redaction/GC Product paths | `NOT_INSTANTIATED` as a Product capability; ordinary logs/proof Evidence do not instantiate the OBS owner; this non-production slice explicitly classifies zero operations `audit-required`, and the first real audit-required/production consumer inherits the fail-closed OBS route |
| Release/Promotion/EnvironmentConformance/serving | `EXECUTE` in `R6` |
| Published App authorization/session/browser security | `EXECUTE` in `R1/R5/R7`, including Keycloak authentication vs Conexus authorization separation |
| private attachment/blob authorization | `NOT_INSTANTIATED` for `att.*`; `3N-V24` separately executes against the reachable Published App serving-byte path |
| supply-chain/dependency admission | `EXECUTE` in `G0`, including exact Keycloak/OIDC admission before R1 |
| Connection/Gateway effect/egress | execute the real **read-only egress/binding** path; effect/write branch = `NOT_INSTANTIATED` |
| first-production restore/emergency-stop/activation | `FIRST_PRODUCTION` only, now including Keycloak issuer/subject recovery continuity through C-015 |
| first vertical live-source/read-model reconciliation | `EXECUTE` in `R7` through 3O |
| Golden benchmark / Worker Eval integration | `EXECUTE` the bounded private comparative Worker Eval harness in `RB`; no generic evaluator Product/scorer dashboard is instantiated, and Budget Analyzer remains the real operational benchmark |

## 11. CR-1 joint proof

The first slice contains security-sensitive control-plane mutations that consume current I&A authority. CR-1 is therefore not waived.

The representative first-build negative control is `PromoteRelease`:

```text
authorized promotion pre-read
+ concurrent revoke/narrow of the actor's Project authority
-X-> protected Promotion commit succeeds under stale authority
```

The proof must demonstrate both halves together:

1. the Promotion commit serializes/conflicts with the current revoke/narrow so stale authorization cannot commit; and
2. the Release owner still cannot directly read/write/lock unrelated IAM state, `SET ROLE` into IAM, or use a broad umbrella DB role.

The exact serialization primitive is implementation detail. The protected property is not. The closed cross-owner same-transaction set remains unchanged; `PromoteRelease` is not permission to add a third cross-owner domain transaction. If implementation Evidence proves such a transaction is genuinely necessary, stop and return to the data-owner Decision Loop rather than inventing it as implementation plumbing.

If implementation Evidence proves `PromoteRelease` cannot honestly exercise the cross-owner mutable-authority condition, choose the smallest actually security-sensitive first-slice mutation that does and record the substitution as a bounded Realization finding; do not delete CR-1.

## 12. 3O-P1..P7 execution plan

`R7` executes the accepted contract without creating a new proof domain.

### `3O-P1` — semantic admission

Produce the exact inventory of Product-visible analytical results. Each item must resolve to current accepted semantic authority and exact Brain/Project binding identity or be `UNSUPPORTED`.

### `3O-P2` — oracle independence

Construct a direct governed read-only live-source oracle that shares accepted semantics and commodity Connection transport only. It MUST NOT read the Project read model, call the Product result as expected truth, or reuse the candidate result-producing transformation.

### `3O-P3` — comparison closure

Bind both sides to the admitted real-source comparison coordinate. If equivalent coverage cannot be established, result = `INDETERMINATE`.

### `3O-P4` — real-path reconciliation

For every supported Product-visible result:

```text
result
→ exact semantic reference
→ declared transformation-rule class
→ at least one representative live reconciliation case
```

Every materially distinct rule class must be covered. All admitted representative cases must be `MATCH` for the gate to pass.

### `3O-P5` — unsupported/unknown preservation

Negative cases must prove:

```text
unsupported semantic meaning → UNSUPPORTED
missing / partial / unverifiable source or coverage → INDETERMINATE
```

Neither path may emit `0`, nearest-name substitution, inferred formula, or plausible success.

### `3O-P6` — falsifier firing

Deterministically perturb only the candidate/comparison side for one admitted case while leaving live-source/oracle truth untouched. The proof MUST turn red. No Sankhya mutation is required or allowed.

### `3O-P7` — provenance closure

Evidence must pin at least:

```text
semantic revision / effective binding identity
Connection + exact revision / source scope
candidate Release/build identity
read-model generation/cursor
real-source comparison coordinate
oracle realization identity
Product result identity
comparison outcome
```

Telemetry or a green badge never substitutes for these identities.

## 13. Minimum real-data proof

A first-build positive claim requires all of the following on one exact candidate:

1. real governed read-only Sankhya access through the exact Connection binding;
2. one real non-production Release that contains the sync/read-model/query/app composition;
3. one real governed JobRun/sync occurrence under that exact Release;
4. real Project read-model state produced by the sync;
5. the furthest stable Product-owned result served to the actual Published Application path;
6. an independently derived live Sankhya oracle;
7. common comparison coverage established by the admitted real-source coordinate;
8. representative coverage of every materially distinct transformation class actually exposed;
9. one deterministic red negative control proving reconciliation can fail;
10. exact Evidence provenance sufficient to reproduce/adjudicate the result.

Fixtures remain allowed for unit/contract/negative controls. They can never substitute for items 1, 3–6.

## 14. First-production obligations preserved, not imitated

`3N-V25..V27` and the first-production restore/emergency-stop/activation family remain unexecuted during first build.

For the **authority classes and authentication dependency actually instantiated by this first slice**, the first-production restore drill must begin deny-only and treat/re-establish the following correctly:

```text
Keycloak provider persistence/configuration
+ configured issuer / stable subject identities
                                    → recover compatible provider generation and prove
                                      (issuer, subject) continuity before normal human login/use

iam.session                         → normal reuse invalid
instantiated workspace/project access facts
                                    → current I&A recertification before protected reuse
published_app_access                → current I&A recertification before normal app access
Connection credential generation
+ current qualification             → Connections/Gateway recertification before source use
active Release/serving generation   → Release + EnvironmentConformance + served-digest revalidation
MAR recurrence admission            → derived again only from the current recertified served Release + current freshness
```

The `(issuer, subject)` mapping remains an attribute of existing `iam.account`, not a new durable class. A rebuilt/restored IdP may not silently remap an Account when identity continuity is unknown. Successful Keycloak authentication never recertifies Conexus grants by itself.

The first-production recoverable set therefore includes Keycloak provider state needed for stable issuer/subject continuity. Exact backup/store tooling remains first-production realization; the closure property is current. If Keycloak uses the same protected PostgreSQL cluster, its provider-specific persistence participates in that generation under isolated credentials; otherwise the restore must prove compatible cross-store provenance/continuity.

No PAR ApprovalRequest/AgentTrigger, Builder/E2B authority, external-effect replay or attachment authority is included because those surfaces are not instantiated. Their original first-production route applies when first introduced.

Post-cutoff canonical Git handling remains exactly `3N-V27`; Realization does not implement backup machinery or execute a production restore early.

## 15. Negative controls defined before implementation

The following controls are part of the implementation contract before code is authorized. A slice cannot be called realized until every reachable control assigned to it is demonstrated to fire:

- forged/invalid Keycloak issuer, audience, signature, nonce or state cannot create a Conexus session;
- Keycloak role/group/provider changes alone cannot grant Workspace/Project/Published App authority;
- an authenticated Account with no current Conexus grant remains denied;
- Conexus session logout/revocation denies subsequent protected use even if an old provider token exists;
- cross-Workspace Project/app/query access is denied;
- stale/narrowed authorization cannot commit the CR-1 representative mutation;
- Project Brain binding does not move when a newer Brain revision becomes AVAILABLE;
- caller-supplied alternate Connection/destination is rejected/ignored in favor of the exact server-derived binding;
- read-only source/query role cannot perform writes or arbitrary runtime SQL;
- two concurrent sync admissions do not create parallel current occurrences;
- downtime with multiple missed intervals produces at most one current catch-up;
- Control Plane admin without Published App access cannot consume the app;
- Published App member cannot gain Builder/Control Plane/source authority;
- direct/guessed Published App asset or data path cannot use storage/path/digest possession to bypass current app/serving authorization;
- AVAILABLE Release without served verification is not `SERVED_VERIFIED`;
- stale/inadmissible candidate Evidence digest cannot pass ComposeRelease/Promotion current-proof recheck;
- deliberate EnvironmentConformance drift turns the gate red;
- unsupported semantic meaning stays `UNSUPPORTED`;
- partial/unverifiable comparison stays `INDETERMINATE`;
- deliberate candidate-side reconciliation divergence turns 3O red.

No fake telemetry consumer, private attachment API, Mastra runtime, Product Agent, external write, or other excluded capability may be added merely to create another negative control.

A presence-only test, mock-only integration, or fixture that proves only itself cannot satisfy a real-path claim.

## 16. Stop / reopen conditions

Execution must stop rather than broaden scope when Evidence shows any of the following.

### Stop without architecture reopen

- no admissible Mastra package/source exists yet for a later Mastra consumer;
- no admissible supported Keycloak/OIDC-client combination satisfies the C-015 confidential OIDC boundary;
- real Sankhya access/credential/provenance needed for the probe is unavailable;
- Product-visible semantics are not yet accepted enough to admit a useful result;
- the common source/candidate comparison boundary is not yet established;
- an exact external dependency is temporarily unavailable.

These are prerequisites/unknowns, not permission to fabricate authority.

### Reopen the smallest owner/decision only

- C-015 Keycloak security/topology/recovery Evidence makes the selected IdP unfit, stable `(issuer, subject)` identity cannot be preserved, or a real SSO/SCIM/passkey/multi-IdP requirement materially changes the authentication contract;
- independent live-source oracle cannot be constructed without candidate self-reference;
- no honest common comparison boundary is expressible within accepted source/data boundaries;
- a correct read-only Budget Analyzer requires a new Product capability, semantic owner or trust boundary;
- an applicable 3N/3O obligation cannot be genuinely falsified through its accepted owner;
- CR-1 cannot be realized without violating owner isolation, or requires a genuinely new cross-owner transaction outside the closed set;
- a real source semantic requirement contradicts current Brain/Product authority;
- bounded Mastra requalification falsifies an accepted 3L property;
- first real effect-capable managed job appears, triggering the deferred MAR/Gateway recovery decision;
- a real DEDICATED consumer or guest inbound requirement appears, triggering its owning topology/security decision.

Preference, framework convenience, or imagined future scale are not reopen triggers.

## 17. Global Maximum / deletion challenge

The plan intentionally deletes from first build:

- PAR/Product Agent while retaining the now-required Builder family for the proving Project;
- AnalyticQuery because static Query is already admitted and sufficient;
- Gateway effect/idempotency machinery because there is no write/effect;
- generic workflow/scheduler machinery because one governed sync consumer is enough;
- generic proof/evidence/recovery platforms because existing proof routing/owners suffice;
- OBS/attachment Product surfaces because no first-slice consumer requires them;
- first-production backup/restore execution because first build is non-production.

Keycloak is retained because human authentication is now a real operator-selected first-slice consumer and reuses mature credential/authentication machinery instead of making Conexus own it. What remains is essential complexity: authentication without delegated Product authorization, isolation, exact bindings, semantic authority, truthful unknowns, read-only enterprise access, deterministic sync, owner-isolated persistence, exact Release/serving, independent Published App authorization, and real-data falsification.

## 18. Implementation authorization boundary

```text
Realization Plan drafted
!= Realization Plan accepted
!= Product implementation authorized
!= first build passed
!= first production authorized
```

This Draft PR may only establish the plan and the bounded C-015 refinement required by the operator-selected Keycloak mechanism. Product implementation remains **BLOCKED** until:

1. this Realization Plan survives required independent review/adjudication;
2. the operator explicitly accepts the plan;
3. repository authority records that acceptance; and
4. the operator separately grants explicit Product execution authority.

No historical approval, C-018 ratification, PR merge, green CI, reviewer approval, or planning acceptance implicitly satisfies item 4.

## 19. Realization Planning acceptance gate

The planning gate can close only when the exact candidate head proves all of the following:

1. scope is sufficient to deliver a real useful read-only Budget Analyzer slice and contains no unused platform capability;
2. every first-slice owner/boundary has one current authority and an explicit consumer;
3. every `3N-V01..V28` ID has exactly one `EXECUTE`, `NOT_INSTANTIATED`, or `FIRST_PRODUCTION` disposition with no waiver by omission;
4. every Architecture §42 proof family remains routed;
5. `3O-P1..P7` are executable against a real source and real Product path and contain a firing negative control;
6. Mastra old pins are not inherited and the exact source admission floor/affected requalification route is explicit;
7. C-015 records the operator-approved Keycloak OIDC refinement, Conexus authorization sovereignty, exact-version admission route and first-production identity/recovery closure without adding a semantic owner or trust zone;
8. Z3 remains absent/Hub-outbound-only and no guest→private-Hub inbound path is introduced;
9. FIRST_PRODUCTION restore obligations remain routed and the first-slice recertification/recovery classes are explicit without executing production recovery;
10. no Product code, live production effect or runtime probe disguised as Product implementation enters this planning PR; the only owning-decision reopen is the named, operator-approved C-015 identity-provider refinement and no 3A–3O/3L reopen is introduced;
11. repository verification passes on the exact planning candidate;
12. a fresh independent Fable/adversarial review challenges the exact consolidated candidate and every material finding is adjudicated against current authority;
13. operator explicitly accepts Realization Planning before any closure/merge transition.

Failure reopens only the smallest decision actually falsified by Evidence.
