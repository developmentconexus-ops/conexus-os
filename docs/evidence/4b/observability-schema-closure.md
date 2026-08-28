# 4B Evidence — Observability & Audit schema closure

> **Status:** CLOSED / BOUNDED EVIDENCE  
> **Phase:** 4B — Executable Wire Contract  
> **Slice:** `OBS-01 → OBS-05`  
> **Implementation:** BLOCKED

## 1. Authority compiled

This slice compiles only the accepted Observability & Audit Product surface:

```text
OBS-01 ListProjectActivity
OBS-02 GetExecutionObservationDetail
OBS-03 GetProjectUsageCostSummary
OBS-04 ListAuditRecords
OBS-05 GetAuditRecord
```

All five are read-only `IC0` Product operations. OBS may project telemetry, provenance, usage/cost and immutable audit facts; it never becomes current owner truth, authorization, completion, retry or effect authority.

## 2. Canonical wire

The canonical Product OAD routes these five Path Items through:

```text
contracts/api/product/observability-paths.yaml
```

Routes:

```text
GET /api/control/projects/{projectId}/activity
GET /api/control/projects/{projectId}/execution-observations/{observationId}
GET /api/control/projects/{projectId}/usage-cost-summary?from=<RFC3339>&to=<RFC3339>
GET /api/control/workspaces/{workspaceId}/audit-records
GET /api/control/workspaces/{workspaceId}/audit-records/{auditRecordId}
```

`OBS-01` admits only the shared opaque `pageToken`. `OBS-04` admits only optional contained `projectId` scope plus `pageToken`. No generic filter/sort/query language was added.

## 3. Observation remains subordinate to owner truth

Activity and execution observation carry exact typed owner references. The operator-approved `4C-F34` gives Activity its own projection-time human snapshot and optional admitted owner-detail target without widening the generic observation subject:

```text
subject.kind
subject.ref
Activity only: subject.label + deterministic summary
Activity only: optional detailTarget.operationId + ref
```

The reference is correlation/projection only. Absence of `detailTarget` means no truthful detail affordance; presence still requires the named owner to revalidate disclosure. A trace, provider response, guest report, worker status or OBS activity entry cannot terminalize or mutate an AgentRun, JobRun, EffectAttempt, Change, Release/Promotion or any other owner fact.

`OBS-02` preserves the accepted producer trust classes exactly:

```text
HUB_AUTHORITY
GATEWAY_AUTHORITY
PROVIDER_OBSERVED
GUEST_OBSERVED
```

Authenticated transport does not upgrade producer trust. Trace/span/provider/runtime identities remain observational IDs, not Conexus principals or semantic owner identities.

## 4. Usage/cost truth

`OBS-03` requires an exact caller-visible reporting period:

```text
from = RFC3339 date-time
 to  = RFC3339 date-time
```

The response preserves the accepted state vocabularies:

```text
usageState:
REPORTED | INFERRED | MISSING

calculationState:
CALCULATED | MISSING_USAGE | MISSING_PRICE | UNSUPPORTED

reconciliationState:
NOT_AVAILABLE | PENDING | MATCHED | MISMATCH | ADJUSTED
```

The executable schema states the critical law directly:

```text
missing != zero
```

Token counts and monetary facts are optional observations with no zero defaults. Cost values use exact decimal strings rather than binary floating-point semantics. Calculated, provider-reported, reconciled and sandbox/runtime monetary costs remain separate facts.

## 5. Immutable audit boundary

`OBS-04` and `OBS-05` expose immutable audit inspection only. Their projections carry exact actor, action, subject and occurrence coordinates, with exact Workspace and optional contained Project scope.

No Product API was added for:

```text
CreateAuditRecord
UpdateAuditRecord
DeleteAuditRecord
CorrectAuditRecord
MarkAuditValid
SetObservationState
MarkCompletedFromTelemetry
RetryFromTelemetry
AuthorizeFromAudit
```

When an owning production path is classified audit-required, inability to durably append its required AuditRecord remains a fail-closed owner/infrastructure law. Ordinary operational telemetry may degrade to missing without fabricating Product success.

## 6. Executable negative controls

`scripts/check-wire-observability.mjs` rejects, among other drift:

```text
OBS method/path changes
non-SCHEMA_CLOSED OBS rows
request bodies or mutation carriers on OBS reads
generic activity/audit query languages
telemetry/audit mutation Product operations
owner/current-state or authorization escape fields
raw provider payload/credential/claim/lease controls
loss of typed owner-subject correlation
producer-trust vocabulary drift
usage/calculation/reconciliation state drift
missing usage/cost represented through defaults
non-exact monetary number representation
AuditRecord mutation authority
```

## 7. TDD proof

RED was opened before the OBS schemas existed:

```text
Verify #337 = FAILURE
Error: OBS-01 is not SCHEMA_CLOSED
```

All previously closed owner gates reached that exact failure first at `106 / 111` schema closure.

Minimal GREEN then added `observability-paths.yaml` and changed only the five canonical OBS `$ref` targets:

```text
Verify #339 = SUCCESS
OBS = 5 / 5
fixed 4A↔OAS = 111 / 111
schema-closed = 111 / 111
missing / extra / duplicate = 0
literal IF_MATCH = { PRJ-12, PAR-14 }
Budget Analyzer positive + negative proof = green
```

## 8. Closure result

```text
Observability & Audit Product surface = CLOSED
OBS Product operations = exactly 5
fixed Product schemas closed = 111 / 111
telemetry/audit mutation operations added = 0
```

This completes fixed-owner schema closure, **not Phase 4B**. Per the 4B contract, the next bounded work is exact Product-vs-Technical-Ingress/protocol classification for current consumers, followed by generated projection/no-parallel-DTO proof, final whole-4B executable/negative proof, independent adversarial review, Lead adjudication and explicit operator ratification.

This Evidence does not begin 4C, runtime/Paved Road selection, persistence design or Product implementation.
