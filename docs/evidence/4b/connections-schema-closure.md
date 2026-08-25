# 4B Evidence — Connections Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current 4A Product authority plus accepted Connections / Integrations / Gateway authority.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can all 9 current Connections Product operations be given exact wire shapes without creating secret readback, generic provider execution, cross-Workspace sharing, duplicate Project-binding authority, or a collapsed readiness/authorization state?

## 2. Exact Product slice

```text
CON-01 → CON-09
```

Total:

```text
9 Product operations
```

Canonical active Path Items:

```text
contracts/api/product/connection-paths.yaml
```

They become authority only through the canonical `contracts/api/product/openapi.yaml` entrypoint and resolved bundle.

## 3. Closure laws proved

### 3.1 Owner scope remains exact

The only admitted logical Connection owner scopes are:

```text
WORKSPACE | PROJECT
```

The owner scope and owner identifier are path-owned containment subjects, not caller-smuggled request fields. A Project-owned Connection remains private to that Project; provider identity never implies wider reuse and no cross-Workspace sharing operation exists.

After operator-accepted `4C-F17`, `CON-03 ListConnections` has two semantic disclosure routes without becoming two Product operations:

```text
ordinary collection disclosure
→ connection.read
→ exact Workspace/Project owner scope

purpose-bound Project binding-selection disclosure
→ optional exact forProjectId context
→ project.manage + connection.use
→ same lightweight Connection[] projection only
```

The purpose-bound route is constrained to the exact target Project. A Workspace-owned candidate must remain within the target Project's exact Workspace/authority context. A Project-owned candidate must be owned by that same exact Project. Cross-Workspace and sibling-private disclosure remain denied.

```text
connection.use -X-> generic connection.read
forProjectId -X-> generic Project/Connection enumeration
purpose-bound CON-03 -X-> CON-04 configuration authority
```

### 3.2 Connector definition/version remains exact

Connector definitions are declarative platform-pack projections. The wire exposes exact definition/version, provider identity, admitted environments/operations and machine-readable configuration / credential-input schemas without exposing credential values.

`CreateConnection` names the exact Connector definition/version and accepts provider-specific **non-secret** configuration validated against that exact definition. It does not accept owner reassignment, sibling sharing or credential material.

### 3.3 Connection revisions remain immutable and current configuration is inspectable

`ReviseConnection` requires the exact current logical revision through:

```text
expectedCurrentRevisionId
```

and creates a new immutable `ConnectionRevision`. It does not mutate an old revision, alter owner scope, accept secret material, or manufacture a false cross-resource `If-Match` contract.

After operator-accepted `4C-F09`, `CON-04 GetConnection` returns exact current non-secret configuration bound to `currentRevisionId`. `CON-03` / `CON-05` remain lightweight and do not carry provider configuration merely by schema reuse. F17 preserves that boundary for its purpose-bound selection disclosure.

### 3.4 Credential ingress is write-only

`SetConnectionCredential` accepts provider-specific plaintext only through a `writeOnly` credential object validated against the exact Connector definition/version credential-input schema.

The success response is `204` with no credential content. The Product wire exposes neither plaintext, ciphertext, access/refresh tokens nor a credential-read API.

Logical credential presence remains the non-secret fact `credentialConfigured`. After F10, successful replacement also advances a server-owned **logical credential generation** used only as non-secret qualification-basis truth; it is never returned by CON-07 and never means crypto-key version or transient access-token generation.

### 3.5 Qualification/test is exact, applicable and human-diagnostic

`CON-08 QualifyConnection` remains bound to caller-supplied:

```text
exact ConnectionRevision
+ exact environment
```

Connections additionally resolves the current logical credential generation server-side. The caller cannot select it.

Existing `ConnectionQualification` carries:

```text
connectionRevisionId
credentialGeneration
exact environment
testedAt
owner-specific qualificationState
stable outcome = PASSED | FAILED | INDETERMINATE
human diagnostic title/message/remediation
evidenceRefs
```

`CON-09` returns that exact result. The frontend does not parse raw Evidence into human diagnostics.

### 3.6 Current test applicability is derived, not lifecycle

After operator-accepted `4C-F10`, `Connection` and `ConnectionDetail` expose one closed Connections-derived projection:

```text
connectionTest.state
= NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
```

Optional exact qualification/environment/testedAt coordinates accompany an applicable/prior test.

```text
no prior qualification → NOT_TESTED
prior basis != current revision and/or logical credential generation → NEEDS_RETEST
exact current basis → PASSED | FAILED | INDETERMINATE
```

A configuration or credential change does not delete old Evidence; it makes the prior basis non-current.

For the current F17 Project-binding selection consumer, the lightweight summary is sufficient to present a candidate as currently bindable only when all exact current coordinates agree:

```text
connectionTest.state = PASSED
AND candidate revision = currentRevisionId
AND selected binding environment = connectionTest.environment
```

This is a presentation cue only. `PRJ-14 SetProjectConnectionBinding` remains the final Project-owned server authority and revalidates the exact qualified compatible ConnectionRevision/environment and current Project/binding state at submit time.

Current F1 deliberately does not invent a multi-environment qualification matrix or qualification-history family merely for selection UX.

### 3.7 Distinct truths remain distinct

```text
configured
!= qualified
!= bound
!= healthy
!= authorized
```

And specifically:

```text
connectionTest -X-> Active / Inactive lifecycle
PASSED -X-> Connected / Ready / Healthy
PASSED -X-> Project binding
PASSED -X-> caller authorization
purpose-bound disclosure -X-> binding write authority by itself
```

Connections does not absorb Project-owned `ProjectConnectionBinding`, Gateway runtime health/effect admission, or Product authorization.

## 4. Executable falsifiers

The Connections checker rejects at least:

```text
any CON-01..09 operation not SCHEMA_CLOSED
provisional Connections response authority
ownerScope outside WORKSPACE | PROJECT
caller-smuggled owner/share fields
F17 purpose-bound CON-03 without optional nonblank forProjectId
F17 forProjectId losing explicit project.manage + connection.use purpose-bound authority
ListBindableConnections appearing as a second Product operation
purpose-bound CON-03 widening from lightweight Connection to ConnectionDetail/configuration
qualificationHistory / qualificationMatrix / bindable / authorizedForProject fields appearing in Connection summary
CON-04 missing current non-secret configuration
configuration leaking into CON-03/CON-05 lightweight projections
missing connectionTest on CON-03/04/05 Connection projections
connectionTest outside NOT_TESTED|NEEDS_RETEST|PASSED|FAILED|INDETERMINATE
Active/Connected/Ready/Healthy/authorized collapse in connectionTest
secret or credential readback
credential/token/password fields in ConnectionDetail/qualification/diagnostic
caller-supplied credentialGeneration on CON-08
qualification missing exact revision/environment/server-resolved logical credential-generation basis
qualification missing PASSED|FAILED|INDETERMINATE human outcome
testedAt or human diagnostic/remediation missing
frontend-relevant qualification without evidenceRefs
invented closed internal qualificationState lifecycle enum
```

Machine guard:

```text
scripts/check-wire-connections.mjs
```

## 5. Original 4B TDD proof

```text
Verify #283 = FAILURE
→ expected RED before canonical Connections activation
→ exact first failure: CON-01 is not SCHEMA_CLOSED

Verify #284 = FAILURE
→ canonical activation raised schema-closed count to 78 / 111
→ checker exposed inherited Path Item parameter harness defect

Verify #285 = SUCCESS
HEAD = 176b4bd608630e567714f3e839ebdcb7cca5e36b
```

The 111 count above is historical Evidence of the original closure. Later accepted 4C corrections raised the whole-platform fixed count to 116 before the current P-02 recompile; Connections itself remains 9 operations.

## 6. `4C-F09` bounded Connections-wire recompile

```text
CON-03 → lightweight Connection[]
CON-04 → ConnectionDetail + currentRevisionId-bound current non-secret configuration
CON-05 → lightweight Connection
CON-07 → unchanged write-only credential ingress
```

Proof:

```text
Verify #649 = EXPECTED RED / 73 tests / 72 pass / 1 fail
→ CON-04 lacked ConnectionDetail

Verify #655 = SUCCESS
→ Product authority + detail wire + checker + generated/whole-wire GREEN
```

## 7. `4C-F10` bounded Connections-wire recompile

W-02B P8 operator walkthrough exposed a real human consumer for honest “test connection / last applicable test / why did it fail?” semantics. The operator selected preservation of `CON-08/09` rather than a new TestConnection/health/history family.

Selected realization:

```text
CON-03 / CON-04 / CON-05 Connection projection
→ connectionTest current-applicability summary

CON-07
→ write-only secret replacement
→ server-owned logical credential generation advances

CON-08
→ exact revision + environment caller input
→ current logical credential generation resolved server-side
→ enriched existing ConnectionQualification

CON-09
→ exact qualification basis + outcome + testedAt + human diagnostic/remediation + Evidence
```

TDD proof:

```text
Verify #674 = EXPECTED RED
→ 78 tests / 77 pass / 1 fail
→ exact first absence: lightweight Connection lacked connectionTest

Verify #677 = intermediate expected failure
→ F10 4A + wire + checker reached 4C projection stage
→ historical F04 exact-text guard required additive-safe repair
→ W-02 preflight had not yet projected F10 GREEN

Verify #680 = SUCCESS
HEAD = 9441a352bb147cc0d7396e58de214c0eb57ffe3c
→ F10 Product authority + Connections wire/checker + preflight/router + generated/whole-wire proof GREEN
```

## 8. `4C-F17` bounded purpose-bound Connection-selection disclosure

P-02 authority-feasibility proved that a human authorized to perform the exact Project binding job under `project.manage + connection.use` could not choose a recognizable Connection candidate without also receiving generic `connection.read`. The operator selected reuse of existing `CON-03`, not a screen-shaped bindable-resource API.

Selected realization:

```text
CON-03 ordinary route
→ connection.read
→ exact owner-scope Connection collection

CON-03 + optional forProjectId
→ exact target Project context
→ project.manage + connection.use
→ same lightweight Connection[] projection
→ no generic connection.read implication
```

Purpose-bound disclosure never exposes:

```text
CON-04 configuration
credential material
connection.manage
connection.qualify
qualification history / matrix
generic Connection authorization
cross-Workspace or sibling-private Project Connections
```

The related Project binding response gains only server-composed `connectionName`; binding identity stays `connectionId + connectionRevisionId + environment` and the write request remains machine-coordinate exact.

TDD chronology:

```text
Verify #886 = EXPECTED RED
→ 118 repository tests / 117 pass / 1 fail
→ exact first failure: operation ledger missing F17 token: 4C-F17
→ F16/status/all prior guards remained green

Verify #887 = SUCCESS
→ selected F17 4A/Permission + Project binding presentation + purpose-bound CON-03 realization is compatible with the complete existing verification stack
→ fixed Product operations remain 116
→ Connections remains 9
→ Project remains 23
→ ordinary Permissions remain 25
```

The succeeding F17 hardening commit adds executable owner guards for `forProjectId`, lightweight disclosure and anti-framework negatives. Its exact final GREEN run is recorded only after that hardened HEAD completes verification.

## 9. Current result

```text
Connections operations = 9
fixed Product operations = 116
ordinary Permissions = 25
new F17 operations = 0
new F17 owners = 0
new F17 durable records = 0
Product code = BLOCKED
```

F09/F10/F17 do not admit secret readback, revision or qualification-history APIs, rollback, rename/delete, generic Connection health, Active/Inactive lifecycle, background monitoring, a second TestConnection operation, `ListBindableConnections`, or a generic ResourceBinding framework.