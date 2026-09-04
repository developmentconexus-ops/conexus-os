# 4D-06 — R1 Foundation Conformance, Version, Escape and Evaluation Contract

> **Status:** `CLOSED / OPERATOR APPROVED / 2026-08-30`
> **Scope:** `4D-D(R1) ONLY`
> **Inputs:** approved 4D-02/4D-03, approved R1 Foundation selection and operator-approved `P01..P12` Evidence
> **Implementation authority:** `BLOCKED`
> **New dependency/mechanism selection:** `0`

## 1. Decision

**Outcome:** `ADOPT CLAIM-MANIFEST CONFORMANCE / ADAPT APPROVED R1 GATES / DEFER UNREACHABLE EVALUATION EXECUTION`.

R1 conformance is one exact claim manifest whose independently deciding items
bind protected properties, subjects, admitted mechanisms, required Evidence and
firing controls. It is not one score and owns no Product truth.

```text
exact Baseline/profile/input/lock/source subjects
+ exact R1 operation and property scope
→ independent claim-matched gates
→ PASS | FAIL | NOT_PROVEN | INCONCLUSIVE per item
→ R1 admission only when every required reachable item is PASS
```

The approved P01–P12 probes prove that the selected mechanisms can fire. They
do not substitute for later conformance over the implemented R1 Project tree.
This contract selects no new package, directory topology, Product operation,
Permission, durable record, runtime or production effect.

## 2. Exact tranche boundary

R1 reaches exactly these `13` canonical Product operations:

```text
IAM-01, IAM-02, IAM-03
WS-01, WS-02
PRJ-01, PRJ-02, PRJ-03, PRJ-07, PRJ-08, PRJ-09, PRJ-23, PRJ-24
```

The representative R1 subject is the minimum `MANAGED` foundation required to
authenticate one human, establish Conexus session/current authority, create and
inspect Workspace/Project and review/approve one exact Baseline/profile intent.
It contains no Budget Analyzer feature, Builder runtime, Project DB data path,
Brain/Connection binding, Gateway call, MAR job, Release serving, Product Agent
or live Sankhya effect.

The applicable property families are bounded as follows:

| Disposition in 4D-D(R1) | Property scope | Meaning |
| --- | --- | --- |
| required conformance contract | `SCF-01..06`, `SCF-09`, `SCF-11`, `WIR-01`, `WIR-03..04`, `AUT-01..06`, `FE-01..06`, `FE-11`, `DAT-01..02`, `VER-01..04`, `VER-06`, `CON-01`, `CON-05` | foundation mechanism is reachable in R1 |
| bounded negative/absence assertion | `SCF-07..08`, `SCF-10`, `WIR-02`, `WIR-05`, `DAT-03..08`, `CON-02..04` and all RB/R2–R7-only families | prove absence or carry the accepted seam; do not instantiate |
| not a completion claim | `4E(R1)`, `4F(R1)`, `4G(R1)`, RB Builder/Worker execution, production recovery and full Budget Analyzer flow | later separately gated work |

`SCF-04` is required now as a generator ownership invariant even though its
first operational Builder evolution is RB: a foundation that cannot preserve
seeded `APP-OWNED` bytes is not admissible for its immediate next consumer.

## 3. Claim manifest

The logical identity is `conexus.r1-foundation-conformance-claim-manifest/v1`.
Every item contains:

```text
claimId
protectedPropertyIds
consumer/tranche
semanticOwnerRefs
exact subject refs and digests
admitted mechanism/pin refs
deterministic assertions
required Evidence class and freshness
firing negative-control identity
result = PASS | FAIL | NOT_PROVEN | INCONCLUSIVE
```

Rules:

- every required R1 item decides independently;
- a missing item, subject digest, firing control or required real-dependency
  Evidence is `NOT_PROVEN`, never PASS;
- an aggregate summary may report status but cannot hide a failing item;
- Evidence cannot settle owner acceptance or create authorization;
- a later changed subject, dependency, profile or evaluator identity invalidates
  only the affected item set, never silently reuses stale PASS;
- a non-reachable row is carried by the tranche scope/absence matrix, not
  fabricated as `PASS` or executed merely for coverage.

## 4. Required R1 conformance gates

| Claim | Exact protected result | Approved mechanism boundary | Required firing control |
| --- | --- | --- | --- |
| `R1C-01 SOURCE_ADMISSION` | exact Node/npm/registry/lock/source/license/signature/script admission | R1F-01 + pin manifest + npm lock admission | floating/mismatched/denied/script-widened input refuses |
| `R1C-02 PROFILE_INPUT` | strict raw UTF-8/I-JSON/schema admission before canonicalization | R1F-02 bounded parser/Ajv adapter | BOM, duplicate, comment, trailing comma, lone surrogate, unsafe number or schema violation refuses |
| `R1C-03 CANONICAL_IDENTITY` | exact RFC 8785 bytes and digest identity | R1F-03 replaceable canonicalization port | changed vector/replacement mismatch turns red independently of schema validation |
| `R1C-04 TREE_OWNERSHIP` | deterministic staged tree, one class per path, no protected drift or app overwrite | approved RF-01 compiler boundary + OwnershipManifest/Receipt | hand edit, overlap, unsafe class transition and APP-OWNED overwrite attempt refuse before apply |
| `R1C-05 WIRE_REQUEST` | exact R1 operation census, generated DTO/route, Technical Ingress separation and one sealed validator | R1F-04 Fastify adapter + canonical 4B projection | extra/missing route, parallel DTO, Product metadata on ingress, second/mutating validator or generic executor refuses |
| `R1C-06 IDENTITY_SESSION` | real Keycloak authentication, opaque Conexus session, current Conexus authority and one-shot bootstrap | R1F-04 Keycloak/openid-client/Fastify/PostgreSQL boundary | forged OIDC inputs, Keycloak-role-only grant, stale/cross-scope authority, repeat bootstrap, bad cookie/CSRF/origin refuses |
| `R1C-07 BROWSER_BOUNDARY` | exact generated route/query projection, four client-state classes, no browser authority/secret and P13 structure | R1F-05 React/Vite/TanStack/native CSS + Playwright | URL/cache/local storage authority, secret bundle, hidden/collapsed owner state, focus/security/P13 regression turns red |
| `R1C-08 HUB_PERSISTENCE` | I&A/Workspace/Project owner-role isolation, exact schema/record census and migration admission | R1F-06 PostgreSQL/pg/Atlas + Conexus order admission | cross-owner/SET ROLE/owner/superuser/BYPASSRLS, checksum/order/schema/role drift refuses; CR-1 object remains absent |
| `R1C-09 COMPLEMENTARY_GATES` | each format/type/build/unit/schema/browser/repository gate decides its own claim | R1F-07 exact admitted tool set | one RED fixture per gate must fail only the intended class; replacing gates with a score refuses |
| `R1C-10 VERSION_UPGRADE` | old and target exact identities, affected set, migration chain and fresh conformance are explicit | profile compiler + pin manifest + existing gates | mutable latest, changed pin under same identity, unsupported jump or stale PASS refuses |
| `R1C-11 ESCAPE_REJOIN` | complete bounded escape/rejoin record can be validated, while R1 has zero active escape | approved 4D-02 boundary; no new runtime/plugin | missing property/owner/invariant/proof/removal condition, forbidden-owner eject or silent permanent fork refuses |
| `R1C-12 REACHABILITY` | R1 realizes only its 13 operations and foundation properties | canonical operation map + property ledger + repository guards | RB/R2–R7 operation, business feature, CR-1, DEDICATED or dormant runtime machinery in R1 refuses |

The deciding conformance result is the vector of these items. `11 PASS + 1
FAIL` is FAIL, not “92% compliant”.

### 4.1 Operator-approved 4E bounded addendum

4E composition exposed two R1 mechanisms not covered by the original foundation
vector. The original `R1C-01..12` result remains preserved; current R1
implementation eligibility additionally requires:

| Claim | Exact protected result | Approved mechanism boundary | Required firing control |
| --- | --- | --- | --- |
| `R1C-13 PROJECT_COGNITION` | exact current Project subject/policy/profile produces only bounded stateless untrusted proposal/explanation before current owner settlement | Project-local Mastra + closed provider/model catalog; telemetry disabled; safe exact pin gate | unknown/disabled/raw model, tool/memory/step/retry/timeout overflow, stale authority/candidate/source, provider failure and unsafe pin all refuse or remain explicit |
| `R1C-14 GIT_SOURCE_CUSTODY` | PRJ-03 settles only with one owner-isolated canonical bare repository and exact immutable source revision | Project/RF-01 staged tree → owner-local GitInfra → temporary worktree/clone → atomic expected-old ref update | cross-Project path, CAS race, caller credential, arbitrary protocol/destination, partial NEW/import, missing object/ref or incomplete bundle recovery refuses |

Neither claim is implementation PASS. Their exact executable pins and negative
probes are entry conditions of the 4F cognition and PRJ-03 slices respectively.
The R1 tranche cannot close with either claim missing or failing, while earlier
independent slices may progress in the 4F-approved order.

## 5. Representative Project conformance

The later implementation checkpoint must materialize a synthetic, non-secret R1
Project subject from exact admitted inputs and prove:

```text
create from empty staged destination
→ reproduce from the same inputs
→ regenerate with representative APP-OWNED bytes present
→ compare exact tree/manifest/receipt identities
→ exercise the 13-operation wire/session/owner-isolation boundary
→ run every applicable gate and its named negative control
```

Expected assertions:

- two clean runs produce identical deciding tree, OwnershipManifest and receipt
  digests;
- regenerated `GENERATED` bytes match canonical sources;
- `PLATFORM-CONTRACT` seams are unchanged except through an admitted migration;
- representative `APP-OWNED` bytes remain byte-identical;
- apply is atomic: failure leaves the last admitted tree/receipt active;
- the tree has zero unclassified/overlapping paths and zero unresolved conflict;
- the generated operation census equals the exact R1 set, with protocol ingress
  outside the Product count;
- no secret, credential, provider token, DB data, binding, grant or runtime
  history enters tree, manifest, receipt, bundle or diagnostics.

The fixture proves conformance mechanics only. It is not the production compiler,
Product implementation or a substitute for 4E(R1).

## 6. Version and upgrade law

Every deciding identity is exact and jointly recorded:

```text
profileId + profileVersion + profileDigest + generatorProtocolVersion
+ Node/npm/build-image identity
+ canonical dependency lock/tree digest
+ executable/browser/image identities
+ schema/canonicalization/gate protocol identities
```

### 6.1 Same identity

Same inputs must reproduce exact outputs. Changed bytes under the same identity
are tampering/drift and stop admission.

### 6.2 Patch/security replacement

A patch is never automatic. It requires exact source/advisory/provenance repin,
lock/tree reproduction and the smallest affected `R1C-*` rerun. An unaffected
claim may retain PASS only when its subject and dependency closure are provably
unchanged.

### 6.3 Minor/major or protocol change

Major Node, TypeScript, React, Vite, Fastify, Keycloak, PostgreSQL or generator-
protocol change reopens its selected compatibility/proof row. Unsupported
profile/protocol jumps stop; package-manager range compatibility alone is not
admission.

### 6.4 Profile migration

```text
old exact profile + prior receipt + current tree + target exact profile
→ declared ordered migration chain
→ complete ownership/delta preview
→ affected conformance vector
→ atomic apply
→ new receipt
```

Migration cannot silently change ownership class, Product meaning, operation
census or a non-degradable invariant. R1 production down-migration is not a
rollback strategy: failed admission retains the prior tree/receipt; later data
rollback follows the Release/forward-fix law at its owning tranche.

## 7. Escape, removal and rejoin

The logical escape record is an existing Baseline decision shape, not a plugin
system or new Product owner:

```text
escapeId
exact unmet property + current consumer
Baseline/profile/prior-receipt refs
affected path/seam and prior ownership class
why declared extension is insufficient
replacement APP-OWNED boundary and owner
preserved non-degradable invariant refs
proof + firing falsifier
upgrade burden + residual risk
removal/rejoin trigger and target profile condition
```

R1 admits **zero active escapes** because no real unmet R1 property survived the
approved probes. `R1C-11` validates only that a complete synthetic record is
accepted and incomplete/forbidden records fail.

Escape is forbidden for canonical wire meaning, Conexus authorization/current
authority, server-derived scope/binding/destination, owner isolation, exact
Release identity or another semantic owner unless that smallest owner is first
reopened. If the invariant cannot remain enforced around the replacement, the
result is `STOP`.

Removal/rejoin requires the unmet property to be satisfied by an exact admitted
target profile, an explicit ownership migration preview, preservation of app
source, fresh affected conformance and a new receipt. No background auto-rejoin,
implicit merge or permanent unowned fork exists.

## 8. Builder/Worker evaluation reachability

`CON-04` first becomes reachable in RB, not R1. Therefore:

```text
R1 Builder/Worker execution = NOT REACHABLE
R1 claim that bootstrap proves Builder = FAIL
R1 installation of Mastra/E2B/ACP for coverage = FORBIDDEN
```

4D-D(R1) carries forward these exact RB task definitions without executing them:

1. generate a fresh admitted Project from exact Baseline/profile inputs;
2. evolve representative APP-OWNED source and regenerate without byte loss;
3. attempt a protected-seam edit and require refusal/correction through Change;
4. perform an admitted profile upgrade with affected proof and new receipt;
5. exercise one declared extension and one forbidden escape;
6. report correctness, intervention/rework, cost/latency, variance and every
   forbidden-boundary attempt without an aggregate hiding a tail failure.

Runtime/model/context/tool/evaluator identity, repetitions and result custody
remain exact when RB opens. No stochastic judge may be the sole hard gate for
authority, ownership, security or deterministic conformance.

## 9. Evidence reuse and remaining proof

| Evidence | What may be reused | What remains for R1 implementation admission |
| --- | --- | --- |
| Pack A `P01/P02` | exact pin/tree/admission mechanism can detect its falsifiers | canonical Product lock/tree and scripts under the admitted root |
| Pack B `P03/P04` | strict admission, canonical bytes and fixture compiler lifecycle | actual R1 profile/schema/tree/manifest/receipt subjects |
| Pack C `P05/P06/P07` | real Fastify/Keycloak/PostgreSQL boundary feasibility | implemented R1 handlers, owner stores and current-authority paths |
| Pack D `P08` | three-browser authority/security mechanism | implemented R1 browser shell and P13 structure |
| Pack E `P09/P10` | real role/store and Atlas/order admission | actual owner migrations/schema/conformance |
| Pack F `P11/P12` | deciding Linux reproducibility and seven firing gates | admitted root toolchain and real R1 conformance subjects |

Probe Evidence is retained, not rerun ceremonially. Rerun occurs only when the
implemented subject or an affected identity makes the claim new.

## 10. Global-Maximum challenge

Three credible shapes were considered:

| Shape | Disposition | Reason |
| --- | --- | --- |
| one aggregate compliance score | `REJECT` | hides independent failure/missingness and can become false acceptance authority |
| framework-owned conformance plugin/API | `REJECT` | makes mechanism topology the owner and complicates replacement/escape |
| exact claim manifest + complementary item gates | `ADOPT` | smallest design that preserves owner boundaries, precise invalidation and firing proof |

The selected shape maximizes falsifiability and replacement while adding no
generic policy platform, orchestration engine or new dependency.

## 11. Closure and reopen law

4D-D(R1) may close only when the operator accepts:

```text
exact 13-operation R1 boundary
preserved R1C-01..12 foundation vector
R1C-13 Project cognition + R1C-14 Git source-custody addenda
representative Project conformance subject
exact version/upgrade/invalidation law
zero-active-escape + explicit escape/rejoin contract
RB evaluation carry-forward without premature runtime
P01..P12 Evidence reuse boundary
Product implementation authority = 0
```

Reopen only if material Evidence shows an R1 path is unguarded, an admitted
upgrade cannot preserve ownership/authority, a real unmet property requires an
escape, an affected-set rule retains stale PASS, or the representative R1
subject cannot fit the exact 13-operation/property boundary.

Package convenience, a new framework feature, directory preference or a desire
for one dashboard score is not a reopen trigger.

## 12. Operator adjudication

```text
APPROVE 4D-D(R1)
```

The operator approved this contract on `2026-08-30`. Approval closes only the
R1 conformance/version/escape/evaluation planning contract and opens only
`4E(R1)` planning. `4F(R1)`, `4G(R1)`, Product implementation, live/paid/
production effects, push, PR and merge remain blocked.
