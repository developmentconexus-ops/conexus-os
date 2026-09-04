# Conexus OS — Executable Wire Contract

> **Status:** 4B CLOSED / OPERATOR RATIFIED / AWAITING INTEGRATION
> **Owner:** 4B — Executable Wire Contract.
> **Product semantics:** current operator-ratified 4A authority, including bounded corrections through `4C-F36`, remains canonical above this wire.
> **Implementation:** BLOCKED.

This document owns the human-readable 4B decisions that govern the canonical machine-readable wire artifacts. The machine-readable Product wire must conform to this contract; neither this prose nor generated code may invent Product meaning beyond accepted 4A.

## 1. Representation decision

Current 4B adopts:

```text
HTTP Product wire authority = OpenAPI Specification 3.1.2
Schema semantics             = JSON Schema Draft 2020-12 through OAS 3.1 dialect
jsonSchemaDialect            = https://spec.openapis.org/oas/3.1/dialect/2024-11-10
source format                = YAML 1.2-compatible OpenAPI Description
```

OAS 3.2.0 is deliberately deferred for current F1 4B. No accepted 4A property requires a 3.2-only feature and the current interoperable validation/codegen surface is stronger around 3.1. Reopen only if a current accepted operation requires a 3.2-only property or exact selected tooling makes 3.1 materially unfit.

Bounded Evidence: [../evidence/4b/wire-representation-assessment.md](../evidence/4b/wire-representation-assessment.md).

## 2. Canonical artifact topology

### 2.1 Fixed Conexus Product wire

The single canonical entry document remains:

```text
contracts/api/product/openapi.yaml
```

Real method/path mapping created enough size/maintenance pressure that 4B's previously defined split trigger fired. The OAD is therefore one **multi-file OpenAPI authority**:

```text
contracts/api/product/openapi.yaml                  canonical entrypoint / shared wire law
contracts/api/product/identity-workspace-paths.yaml closed IAM + Workspace Path Items
contracts/api/product/project-paths.yaml            closed Project Path Items
contracts/api/product/builder-paths.yaml            closed Builder Path Items
contracts/api/product/brain-paths.yaml              closed Brain Path Items
contracts/api/product/connection-paths.yaml         closed Connections Path Items
contracts/api/product/release-paths.yaml            closed Release / Promotion / serving Path Items
contracts/api/product/par-paths.yaml                closed Product Agent Runtime Path Items
contracts/api/product/gateway-paths.yaml            closed Gateway inspection Path Items
contracts/api/product/mar-paths.yaml                closed Managed Application Runtime Path Items
contracts/api/product/observability-paths.yaml      closed Observability & Audit Path Items
```

Rules:

```text
one canonical entrypoint authority
+ deterministic local refs
+ validator resolves the whole active graph
+ every Product YAML fragment is reachable from the canonical entrypoint
+ bundle is generated proof output
+ active bundle ↔ 4A operation census is mechanically checked
```

Fragments are never consumed independently as alternative Product APIs. They are maintenance partitions inside one OAD authority. `wire:whole-4b` rejects a YAML fragment under `contracts/api/product/` that is not reachable from the canonical entrypoint, preventing stale parallel copies from surviving beside the active graph.

The independent Fable review exposed three historical dead fragments (`fixed-paths.yaml`, `current-state-overrides.yaml`, `fixed-census-overrides.yaml`); they were deleted rather than archived or deprecated. Their deletion does not change the active 111-operation Product wire because none was reachable from `openapi.yaml`.

Generated bundles under `/tmp` are proof artifacts only and are never committed/editable co-authority.

### 2.2 Project-defined operation grammar

```text
contracts/api/project-operation.schema.json
```

is the canonical JSON Schema 2020-12 grammar for exact Release-pinned Project operation declarations.

A concrete Project declaration is authoritative only as part of an exact admitted Project/Release contract. Generated OpenAPI from those declarations is a deterministic projection, not a second editable business-operation contract.

### 2.3 First Budget Analyzer proof instance

The first Budget Analyzer instantiates exactly:

```text
AnalyzePendingBudgets
ListPendingBudgets
```

as `project-operation/v1` declarations and produces an exact generated/conforming application OAD. No third operation is admitted merely for wire convenience.

## 3. Fixed operation identity / HTTP shape law

For fixed platform operations:

```text
operationId = exact accepted 4A semantic operation name
x-conexus-4a-id = exact accepted 4A ledger ID
```

The current fixed shape derivation has mechanically closed after operator-approved `4B-F01`:

```text
4A fixed operations        = 111
OAS fixed operations       = 111
missing                    = 0
extra                      = 0
duplicate operationId      = 0
duplicate 4A ID            = 0
duplicate method+path      = 0
```

`WS-03 UpdateWorkspace`, `WS-06 UpdateArea` and `PRJ-04 UpdateProject` are not current Product wire operations. Their subtraction was a semantic correction, not a route-style choice.

`npm run wire:bijection` must remain green. The checker also rejects generic Product paths shaped like unrestricted `/execute` or `{operationSlug}` dispatch.

HTTP shape Evidence: [../evidence/4b/http-shape-derivation.md](../evidence/4b/http-shape-derivation.md). Bounded subtraction Evidence: [../evidence/4b/fixed-mutation-semantic-gap.md](../evidence/4b/fixed-mutation-semantic-gap.md).

Surface roots preserve 4A ingress separation:

```text
/api/control/...   authenticated Control Plane Product interaction
/api/apps/...      Published Application human interaction
/api/headless/...  explicit Product-Agent headless interaction
/api/runtime/...   owner-neutral PAR read/approval HTTP surface
/api/projects/...  owner-neutral multi-ingress Project/Brain Product capability
```

One operation may admit multiple ingress classes without creating multiple Product operations. A path namespace never grants authority.

## 4. Project-defined static-path generation law

For Project-defined operations:

```text
operationId = exact Release-admitted Project operation identity
```

A generated application OAD must contain one **literal concrete** path for every exact finite `Ops(R)` entry. Runtime path variables that select an arbitrary operation are forbidden.

Current regime roots are intentionally operation-class specific rather than universal:

```text
QUERY       → /api/projects/{projectId}/queries/<static generated operation segment>
ACTION      → /api/projects/{projectId}/actions/<static generated operation segment>
INTEGRATION → /api/projects/{projectId}/integrations/<static generated operation segment>
```

All three use exact typed request/response schemas. A Query may use POST when structured typed analytical input is the honest wire shape; HTTP GET aesthetics do not override semantic input shape.

The literal operation segment must be generated deterministically from the exact `operationId`; it cannot be caller-selected at runtime.

An exact Project operation also cannot use a semantically unconstrained payload schema. `inputSchema` and `outputSchema` must each be a JSON Schema object with an actual root constraining form (`$ref`, `$dynamicRef`, `type`, `const`, `enum`, `oneOf`, `anyOf`, `allOf` or `not`). Boolean schemas and `{}` are rejected. This does **not** force object-rooted DTOs: primitive, array, union and referenced exact schemas remain valid when they are the honest operation contract.

## 5. Naming and schema law

Canonical reusable schemas use stable PascalCase semantic names.

Rules:

```text
wire component name != database table name by default
wire component name != frontend component name
wire component name != provider DTO name unless provider meaning is genuinely Product-visible
```

Request/response schemas are operation-specific where meaning differs. Reuse exists only for a repeated semantic carrier/property.

Forbidden generic abstractions without a proved repeated semantic:

```text
AnyResource
AnyCommand
GenericResult
GenericListResponse
UniversalEntity
ProviderPayload
```

Money/decimal business values must not silently inherit binary floating-point semantics merely because JSON has a number type. Exact decimal representation is decided per accepted business measure before the first real application schema freezes it.

## 6. HTTP Problem contract

4B adopts RFC 9457 Problem Details:

```text
media type = application/problem+json
base schema = Problem
machine discriminator = Problem.type URI/reference
```

Human-readable `detail` MUST NOT be parsed as machine authority.

The accepted semantic outcome classes remain:

```text
401 unauthenticated
403 authenticated + legitimately disclosable subject/surface + denied action/request-authenticity
404 absent or intentionally non-disclosable
409 current owner-state/uniqueness/single-flight conflict
412 stale expected current subject/precondition
422 admitted semantic/business-input validation failure
503 required dependency unavailable
```

No later wire may turn a non-disclosable foreign subject into a 403 existence oracle. Owner-specific problem types are admitted only where a concrete consumer needs stable branching beyond the HTTP class.

## 7. Current-state / conditional contract

IC2 is a **semantic current-subject obligation**, not an automatic `If-Match` instruction.

RFC 9110 `If-Match` is used only when the ETag describes the current representation of the **same HTTP target resource being mutated**.

The current literal semantic `IF_MATCH` set is exactly:

```text
PRJ-12 ClearProjectBrainBinding
PAR-14 ReviseScheduleTrigger
```

The bundled HTTP carrier proof is correspondingly exact:

```text
required If-Match        = { PRJ-12, PAR-14 }
optional If-Match        = { PRJ-11 }
optional If-None-Match   = { PRJ-11 }
```

Truthful same-target examples:

```text
GET /.../brain-binding
→ strong ETag when present

DELETE same brain-binding target
→ If-Match when present

GET /.../triggers/{triggerId}
→ strong ETag

PATCH same trigger target
→ If-Match
```

`PRJ-11 SetProjectBrainBinding` remains `CURRENT_OR_ABSENT`: the same exact target maps present-state update through optional `If-Match` and absent-state create through optional `If-None-Match: *`, with the wire requiring exactly one of the two. It is deliberately not counted in the semantic `IF_MATCH`-only set.

Do **not** reuse an ETag from one resource as `If-Match` on a different command/collection target. Current explicit-semantic examples include:

```text
PromoteRelease
→ expected pointer generation explicitly carried

DecideApprovalRequest
→ exact ApprovalRequest/proposal digest explicitly carried
→ request-time Agent/action/time presentation supports recognition but never replaces the sealed subject

EnableAgentTrigger
→ exact TriggerRevision explicitly carried

ArchiveProject command subpath
→ exact Project current revision/generation explicitly carried
```

Likewise, when no exact item GET exists (for example a Published-App grant item), 4B exposes an explicit current revision/role/subject carrier rather than pretending the collection's ETag is the item's validator.

`WS-03`, `WS-06` and `PRJ-04` are no longer conditional-carrier cases because `4B-F01` removed those generic Product mutations entirely.

Failed standard representation preconditions remain 412-class Problems.

Bounded Evidence: [../evidence/4b/current-state-carrier-assessment.md](../evidence/4b/current-state-carrier-assessment.md).

## 8. Idempotency contract

There is no current RFC standardizing `Idempotency-Key`; 4B owns the semantics while adopting the interoperable header name:

```text
Idempotency-Key
```

Where IC3/IC4 maps to caller-supplied repeatable intake:

- one key is scoped to exact operation + authority/containment subject;
- reuse with materially different admitted payload is rejected;
- duplicate admitted intake with the same key cannot create a second owner occurrence/effect;
- unresolved/ambiguous downstream effect remains fenced under IC4; same key never authorizes blind replay;
- server-generated owner/effect identity remains authority above the key;
- expiry/retention must be exact before implementation for every operation class that uses it.

Exact persistence/claim/reconciliation mechanics belong to 4D.

## 9. Authentication/session carriage

### 9.1 Human Product HTTP session

Current F1 carriage is one Conexus-owned opaque `iam.session` cookie:

```text
cookie name = __Host-conexus_session
Secure      = required
HttpOnly    = required
Path        = /
Domain      = forbidden
SameSite    = Lax
```

OpenAPI represents this only as a `securityScheme`; possession of the cookie is authentication/session carriage, not Product authorization.

Current authority remains:

```text
Keycloak OIDC
→ verified human identity
→ Conexus Account
→ opaque Conexus session
→ current Workspace/Project/app/owner authorization on every operation
```

Keycloak bearer tokens, realm roles, groups, organizations and Authorization Services are never accepted as Product authorization substitutes.

`4C-F38` keeps one I&A-owned session meaning across both human surfaces:

```text
IAM-13 Published-App context
→ canonical AccountSummary + exact active Release + exact app role

IAM-02 /api/session
→ CONTROL_PLANE or PUBLISHED_APP
→ end exact opaque Conexus session
-X-> claim global Keycloak SSO logout
```

For Published-App access administration, the wire preserves that boundary explicitly:

```text
IAM-21 candidate source = existing I&A-owned Conexus Accounts only
IAM-14 grant subject presentation = canonical AccountSummary
IAM-14 role decision truth = server-composed current active-Release role subsets
IAM-15 success = canonical AccountSummary + exact current app role

browser Keycloak-directory search -X-> Product candidate discovery
Keycloak role/group/Organization -X-> Conexus app role or grant
```

### 9.2 Non-HTTP/runtime authority

`PAR_TOOL`, `MAR_JOB`, owner/system transitions and future DEDICATED service projections are not converted into fake human HTTP cookies or arbitrary caller headers merely because OAS needs a security object.

For `RunAnalyticQuery`, current HTTP ingress is CP/PA; `PAR_TOOL` remains explicitly marked as a **non-HTTP** admitted ingress/projection.

## 10. Browser request-authenticity contract

Accepted architecture requires browser self-only/session/request-authenticity to be platform controlled and admits no credentialed cross-origin Product API in F1.

Current 4B law:

```text
credentialed cross-origin Product API = DENY
OIDC redirect/callback                 = separate allowlisted Technical Protocol
```

For browser Product API requests carrying the opaque session:

```text
Sec-Fetch-Site present
→ only same-origin is admitted
→ same-site / cross-site / none rejected for /api Product requests

Sec-Fetch-Site absent on CP/PA browser ingress
→ exact Origin must match the configured current Conexus origin
→ else exact Referer origin must match
→ neither trustworthy signal present = reject
```

`same-site` is intentionally insufficient because sibling subdomains are not Product authority peers.

HEADLESS is a distinct non-browser Product ingress. Absence of Fetch Metadata does not itself deny a legitimate non-browser HEADLESS request, but if browser metadata is present then foreign/same-site-non-origin context is rejected. `agent.headless.invoke` and exact owner facts remain mandatory.

Safe HTTP methods never mutate Product state.

Bounded Evidence: [../evidence/4b/browser-request-authenticity-assessment.md](../evidence/4b/browser-request-authenticity-assessment.md).

## 11. API surface separation

Wire namespaces preserve:

```text
Control Plane Product API
!= Published Application business API
!= Product Agent headless/interactive API
!= exact Project-defined capability wire
!= Technical Ingress / provider protocol
!= internal owner/runtime mechanism
```

Technical/protocol routes never inflate `N_platform` merely because they use HTTP.

For Product Agent execution specifically:

```text
PAR-04 / PAR-05
→ admit exact Conexus AgentRun owner truth
→ 202 AgentRun identity / exact Release pin

PAR-01 / PAR-02 / PAR-04
→ Conversation summaries ordered by lastActivityAt DESC + stable conversationId DESC
→ safe last-message preview + exact NONE | NEEDS_YOUR_RESPONSE attention
→ durable TEXT | QUESTION message history
→ exact open-question reply admits a new AgentRun
-X-> clarification as ApprovalRequest or ordinary-run suspension

PAR-06 / PAR-07
→ admittedAt + optional settledAt are PAR temporal truth
→ lists order by admittedAt DESC + stable agentRunId DESC before pagination
→ optional safe human problem supports investigation without retry/resume authority

live stream / reconnect / runtime observe
→ Technical Ingress/projection over that exact AgentRun
-X-> seventeenth PAR Product operation
-X-> Mastra runId/toolCallId/threadId as Product identity
-X-> stream end as AgentRun terminal truth
```

Current framework-leverage Evidence favors Mastra-native stream/HITL mechanics and AI-SDK-compatible projection at realization time, but 4B selects no runtime package or React transport. [Bounded Evidence](../evidence/4b/technology-leverage-and-par-streaming-review.md).

## 12. Project-operation declaration law

`contracts/api/project-operation.schema.json` closes at least:

```text
schemaVersion
operationId
regime = QUERY | ACTION | INTEGRATION
exact constraining input schema
exact constraining output schema
admitted caller class(es)
Project/app scope
required binding/pin classes
effect/read classification
truth/outcome profile
IC profile
positive proof + negative control identity
```

The grammar accepts only the bounded 4A caller/Permission vocabulary. It does not accept arbitrary global Permission strings, arbitrary target URLs or caller-selected Connections as effective authority. It also rejects semantically unconstrained boolean/empty payload schemas; exact schema shape remains operation-owned rather than globally forced to an object DTO convention.

An exact declaration is not runtime authority by file existence; it must be admitted into the exact Release. Release membership itself supplies the exact Release context; `requiredPins` is not inflated with duplicate `ACTIVE_RELEASE` metadata merely to restate that structural fact.

The generated HTTP OAD preserves the declaration's HTTP caller objects, scope and effect classification. Admitted non-HTTP callers remain explicitly classified as non-HTTP projection metadata and are never converted into session/header authority. A declaration with no admitted HTTP caller fails closed in the HTTP OAD generator rather than fabricating HTTP carriage; a separate 4D non-HTTP projection may consume that authority if a real realization requires it.

Whole-wire Evidence: [../evidence/4b/whole-wire-adversarial-proof.md](../evidence/4b/whole-wire-adversarial-proof.md).

## 13. Pagination / continuation law

There is no global filter/sort/include language.

Each operation exposes only accepted filters.

`4C-PRE11-F04` admits one Gateway-owner filter on `GW-01`: optional exact `originatingRun { kind, ref }`, encoded as a deep-object query and applied server-side before pagination. It is not a generic filter DSL. The continuation token is bound to the exact Project, originating-run filter and deterministic `attemptedAt DESC / effectAttemptId DESC` ordering; incomplete filter shape or token/query mismatch fails with `422`.

For mutable/unbounded list results, the reusable transport primitive is an **opaque continuation token**, not database offset/cursor internals. The token:

```text
continues one accepted list/query shape
!= authorization
!= source identity
!= historical snapshot authority
```

Caller-controlled page size is not admitted merely by convention; a real consumer may prove it later. F1 may therefore keep page sizing server-controlled while exposing only an optional opaque `pageToken` and an optional returned `nextPageToken`.

Unless an operation explicitly owns snapshot pinning:

```text
page coordinate A
+ later page coordinate B
→ each coordinate disclosed truthfully where material
→ B MUST NOT masquerade as the same snapshot as A
```

Budget Analyzer F1 specifically has no retained cross-call/page snapshot-pinning promise.

## 14. Truth/provenance wire law

Where 4A admits analytical/provenance truth states, wire schemas must preserve the closed distinctions rather than encode uncertainty through nullable business numbers.

Current closed state vocabulary includes:

```text
SUPPORTED_CURRENT
SUPPORTED_STALE
PARTIAL
UNVERIFIED
INDETERMINATE
UNSUPPORTED
DEPENDENCY_UNAVAILABLE
```

A material analytical response carries an opaque **system-issued result/source coordinate** where 4A requires `as_of`/provenance. The coordinate is output/provenance; it is not arbitrary caller historical input.

Rules:

```text
unknown != zero
partial != complete
stale != current
read-model result != source proof
empty supported-current result != dependency failure
```

The first Budget Analyzer operation schemas are the proving instance for this shared law.

For the same proving instance, `4C-F39/F40` close two presentation-bearing wire laws:

```text
monetary values present
→ one required ISO 4217 currencyCode for the whole response/page
→ every monetary value uses that unit
→ mixed-currency aggregation without accepted conversion/grouping = no business values + applicable unsupported/indeterminate truth

seller/customer member or row present
→ stable source-qualified ID
+ required non-empty owner-issued human name
→ browser fallback/join is not authority
```

These are enrichments of the existing two Project Query schemas. They create no operation, Permission, caller, durable owner or generic money/directory API.

Gateway effect provenance adds one separate owner-specific truth law:

```text
possible external acceptance + ambiguous response
→ OUTCOME_UNKNOWN
→ receipt / reconciliation Evidence
-X-> false FAILED
-X-> false SUCCESS
-X-> caller retry authority
```

`OUTCOME_UNKNOWN` is not part of the analytical truth vocabulary above; it is Gateway-owned external-effect truth.

MAR adds a parallel mechanism-separation law for managed occurrences:

```text
ListRunnableManagedJobs
→ safe human job identity from exact currently served Release
-X-> JobRun history / queue / schedule / run authority

JobRun owner state / exact pinned Release + job
!= pg-boss queue / worker / redelivery state

RunManagedJobNow
→ server resolves exact currently served Release
→ verifies admitted job/v1
→ admits one repeatable-intake JobRun occurrence
-X-> caller Release / queue / retry / catch-up selection
```

OBS/Audit adds a separate observation-truth law:

```text
Project Activity
→ projection-time subject label + deterministic summary
→ optional exact admitted owner-read target
-X-> generic dispatch / current owner state / Audit replacement

telemetry / trace / provider / guest observation
→ correlation + provenance only
-X-> owner terminal/current state
-X-> authorization

usage/cost MISSING
-X-> zero

audit fact
→ immutable evidence
-X-> mutable owner state
```

## 15. Exact bytes

Byte transport remains subordinate to an owning Product operation:

```text
owner subject + current authorization
→ byte retrieval/upload capability
```

Storage keys, object paths, signed provider URLs and blob identifiers never authorize by possession. No global File Manager API is admitted.

## 16. Generated projections / no-parallel-DTO law

Canonical machine-readable wire may generate implementation-facing artifacts, but final 4D SDK/runtime toolchain is not selected here.

Binding custody law:

```text
canonical Product OAS / exact Project declaration
→ deterministic generated projection
→ implementation consumption

-X-> separately hand-owned transport DTO
-X-> generated file patched into authority
-X-> frontend/client error taxonomy that redefines the wire
```

Current executable proof adds two build-only mechanisms:

```text
scripts/generate-wire-projection.mjs
→ tool-neutral deterministic 111-operation projection manifest

scripts/run-kubb-wire-probe.mjs
→ isolated /tmp real-OAS codegen probe
→ Kubb 5.0.0 + TypeScript 7.0.2
→ TypeScript + Fetch only
```

The real-OAS probe requires:

```text
two generations are byte-identical
exact 111 method+path pairs preserved
missing/invented routes = 0
If-Match and Idempotency-Key carriers preserved
__Host-conexus_session carriage preserved
401/403/404/409/412/422/503 response distinctions preserved
explicit public any = 0
strict TypeScript no-emit compile = green
```

All generated artifacts and probe dependencies live under `/tmp`; none become runtime dependencies or editable Product authority.

Kubb 5.0.0 is therefore an **empirically viable 4D ADOPT candidate**, not a 4B Paved-Road selection. Orval remains a fallback probe only if a material Kubb falsifier fires. TanStack Query and generated Zod remain focused 4D consumer/validation evaluations; canonical OpenAPI + JSON Schema/AJV authority is never weakened to fit a generator.

Bounded Evidence: [../evidence/4b/generated-projection-no-parallel-dto.md](../evidence/4b/generated-projection-no-parallel-dto.md).

## 17. Current executable proof

The repository `verify` path proves:

```text
repository hygiene / docs / current-state guards
+ serial-safe repository mutation tests with cleanup
+ repository tests including 4B-F01 census regression
+ Product OAS lint + deterministic bundle
+ Product-fragment reachability / zero dead parallel YAML
+ Project declaration schema compilation
+ constrained Project input/output grammar
+ 4A ↔ fixed Product OAS bijection = 111 / 111
+ semantic IF_MATCH set = { PRJ-12, PAR-14 }
+ actual bundled If-Match/If-None-Match parameter sets
+ all fixed owner schema gates = 111 / 111
+ Technical Ingress lint + exact 3-operation protocol separation
+ deterministic generated-projection manifest
+ real Kubb 5.0.0 / TypeScript 7.0.2 codegen probe
+ Budget declaration/generation/OAS proof
+ Budget truth-state positive and negative controls
+ whole-4B cross-surface executable/negative proof
+ in-memory adversarial controls must fail for the expected defect class
```

Generated-projection TDD/probe chain:

```text
Verify #353 = FAILURE
→ expected RED: Generated wire projection proof is missing

Verify #355 = FAILURE
→ real Kubb generation reached strict compile
→ probe tsconfig did not yet admit Kubb's explicit .ts imports
→ Product/OAS semantics and Kubb semantic assertions remained unchanged

Verify #356 = SUCCESS
→ exact real Conexus 111-operation Kubb probe green
→ deterministic generation + strict compile green
```

Whole-wire TDD/falsification chain:

```text
Verify #361 = FAILURE
→ expected RED: Whole 4B executable proof is missing
→ all prior 4B gates green first

Verify #363 = FAILURE
→ genuine falsifier: generated Project HTTP OAD lost exact caller/authorization projection
→ root cause isolated to Project OAD projection fidelity

Verify #364 = SUCCESS
→ minimal generator correction preserves HTTP/non-HTTP caller split, scope and effectClass
→ cross-surface negatives green

Verify #368 = FAILURE
→ independent-review M1 reproduced: unbounded true/{} Project payload schema accepted

Verify #369 = SUCCESS
→ exact-payload grammar tightened without imposing object-only DTOs

Verify #370 = FAILURE
→ independent-review M2 reproduced: exactly three dead Product YAML fragments detected

Verify #373 = SUCCESS
→ dead fragments deleted; topology reachability gate green

Verify #375 = SUCCESS
→ repository mutation tests serialized and temporary work cleanup made repeat-safe

Verify #377 = SUCCESS
→ actual conditional HTTP carrier sets + expected adversarial failure reasons hardened
```

Historical owner-slice RED/GREEN Evidence remains in the bounded files under `docs/evidence/4b/`; this contract does not duplicate the full worklog.

Independent review and Lead adjudication:

- [Independent Fable Review](../evidence/4b/fable-independent-review.md)
- [Lead Adjudication](../evidence/4b/fable-review-adjudication.md)

## 18. Ratified 4B closure

Operator ratification closes the 4B semantic authority on this candidate. The ratified result is:

```text
fixed Product wire/schema closure       = 111 / 111
Project-defined operation grammar       = CLOSED / unbounded payload gap corrected
Budget Analyzer proving instance         = GREEN
Technical Ingress                        = CLOSED / 3 protocol-only operations
Product-count impact of Technical        = 0
generated projection/no-parallel-DTO     = CLOSED / real Kubb probe green
whole-4B executable/negative proof       = CLOSED
independent Fable review                 = COMPLETE / 2 bounded materials found and corrected
Lead adjudication                        = COMPLETE / no 4A reopen
operator ratification                    = COMPLETE
```

Ratification does not authorize merge by itself. Until this candidate is integrated into `main`, 4C remains not started and Product implementation remains blocked.

Whole-wire Evidence: [../evidence/4b/whole-wire-adversarial-proof.md](../evidence/4b/whole-wire-adversarial-proof.md).

Do not begin 4C, router/framework selection, persistence design, Paved Road selection, migrations, Sankhya implementation or Product code before 4B is integrated.
## Pre-P11 F03–F05 bounded wire recompile

The operator-ratified pre-P11 corrections preserve the canonical wire laws while moving the fixed platform census to `128`:

```text
F03
→ IAM-03 ordinary platform_operator OR exact trusted_bootstrap_context
→ bootstrap request derives externalSubject server-side
→ WS-01 success proves initial creator access

F04
→ GW-01 optional exact originatingRun deep-object filter
→ filter before deterministic pagination

F05
→ PRJ-16/17 purpose-bound project.build discovery
→ BRN-14 authoringRef + explicit detailDisclosed boundary
→ PRJ-29 Project-owned model-policy summaries
→ BLD-19 NEW optional unowned refs empty
→ BLD-19/20 EXISTING protected refs preserved
```

No generic catalog/filter DSL, ordinary Permission, frontend authority, runtime/provider field or screen-shaped owner is admitted.
