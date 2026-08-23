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

### 3.2 Connector definition/version remains exact

Connector definitions are declarative platform-pack projections. The wire exposes exact definition/version, provider identity, admitted environments/operations and machine-readable configuration / credential-input schemas without exposing credential values.

`CreateConnection` names the exact Connector definition/version and accepts provider-specific **non-secret** configuration validated against that exact definition. It does not accept owner reassignment, sibling sharing or credential material.

### 3.3 Connection revisions remain immutable and current configuration is inspectable

`ReviseConnection` requires the exact current logical revision through:

```text
expectedCurrentRevisionId
```

and creates a new immutable `ConnectionRevision`. It does not mutate an old revision, alter owner scope, accept secret material, or manufacture a false cross-resource `If-Match` contract.

After operator-accepted `4C-F09`, the exact `CON-04 GetConnection` detail read returns `ConnectionDetail`:

```text
existing logical Connection identity/owner/definition facts
+ currentRevisionId
+ credentialConfigured
+ configuration
```

`configuration` is the provider-specific **non-secret** configuration of that exact `currentRevisionId`, shaped against the exact ConnectorDefinition configuration schema. It exists so an authorized human can inspect/re-enter current Connection truth and initialize an intentional `CON-06` revision draft after refresh/re-entry.

The lightweight `Connection` projection remains used by `CON-03 ListConnections` and `CON-05 CreateConnection`; those responses do not carry provider configuration merely by schema reuse.

### 3.4 Credential ingress is write-only

`SetConnectionCredential` accepts provider-specific plaintext only through a `writeOnly` credential object validated against the exact Connector definition/version credential-input schema.

The success response is `204` with no credential content. The Product wire exposes neither plaintext, ciphertext, access/refresh tokens nor a credential-read API.

Logical credential presence may be projected as the non-secret fact:

```text
credentialConfigured
```

That fact does not imply qualification, Project binding, runtime health or caller authorization. F09 configuration inspectability does not widen this boundary: configuration is non-secret and can never carry credential material.

### 3.5 Qualification is exact and provenance-bearing

`QualifyConnection` is bound to:

```text
exact ConnectionRevision
+ exact environment
+ real provider/source Evidence
```

The request does not admit escape hatches such as:

```text
credential / secret
TestURL / arbitrary URL
SQL
Project binding selection
```

`GetConnectionQualification` returns the exact Connection/revision/environment coordinate plus qualification state and non-empty Evidence references.

The qualification-state vocabulary remains owner-issued because current Product authority does not ratify a closed lifecycle enum.

### 3.6 Distinct truths remain distinct

The wire preserves the accepted non-equivalence:

```text
configured
!= qualified
!= bound
!= healthy
!= authorized
```

In particular:

```text
configuration presence -X-> qualification
credentialConfigured -X-> qualification
configuration -X-> Project binding / runtime health / caller authorization
```

Connections does not absorb Project-owned `ProjectConnectionBinding`, Gateway runtime health/effect admission, or Product authorization.

## 4. Executable falsifiers

The Connections checker rejects at least:

```text
any CON-01..09 operation not SCHEMA_CLOSED
provisional Connections response authority
ownerScope outside WORKSPACE | PROJECT
caller-smuggled owner/share fields
CON-04 missing current non-secret configuration after F09
configuration not bound to currentRevisionId / exact ConnectorDefinition schema
configuration leaking into CON-03/CON-05 lightweight projections
secret or credential readback
credential/token/password fields in ConnectionDetail
credential material on CreateConnection / ReviseConnection / qualification
mutable-revision semantics or false cross-resource If-Match
qualification against arbitrary URL / SQL / binding selection
qualification without exact revision/environment/provenance
collapsed bound/healthy/authorized/readiness status
invented qualification lifecycle enum
```

Machine guard:

```text
scripts/check-wire-connections.mjs
```

The guard resolves Path Item parameters plus operation-level overrides by `(in, name)`, matching OpenAPI 3.1.2 parameter inheritance rather than requiring redundant operation-local copies.

Technical reference used only for checker mechanics:

```text
https://spec.openapis.org/oas/v3.1.2.html#path-item-object
https://spec.openapis.org/oas/v3.1.2.html#operation-object
```

## 5. Original 4B TDD proof

```text
Verify #283 = FAILURE
→ expected RED before canonical Connections activation
→ exact first failure: CON-01 is not SCHEMA_CLOSED

Verify #284 = FAILURE
→ canonical activation raised schema-closed count to 78 / 111
→ bijection, carriers and all previously closed owner gates passed
→ Connections checker then exposed a harness defect: it ignored inherited Path Item parameters
→ Product wire was not widened to satisfy the harness

Verify #285 = SUCCESS
HEAD = 176b4bd608630e567714f3e839ebdcb7cca5e36b
→ checker fixed to interpret OAS Path Item parameter inheritance without weakening any semantic assertion
```

Historical established counts at that point:

```text
fixed 4A operations      = 111
fixed OAS operations     = 111
schema-closed operations = 78
IAM + Workspace          = 20 / 20
Project                  = 21 / 21
Builder                  = 17 / 17
Brain Product            = 11 / 11
Connections              = 9 / 9
missing                  = 0
extra                    = 0
duplicate                = 0
literal IF_MATCH          = { PRJ-12, PAR-14 }
```

Those are historical Evidence of the original 4B closure, not the current whole-platform count after accepted 4C corrections.

## 6. `4C-F09` bounded Connections-wire recompile

W-02B P7 authority/data revalidation exposed that `CON-05/06` accepted durable non-secret configuration but the exact `CON-04` read did not recover the current revision's configuration after refresh/re-entry. The operator accepted the Global-Maximum outcome that Connections and `CON-04` remain the correct owner/read surface rather than adding browser persistence, blank destructive re-entry, a revision-history family or a new configuration operation.

Selected realization:

```text
CON-03 → lightweight Connection[]
CON-04 → ConnectionDetail
  → currentRevisionId
  + current provider-specific non-secret configuration
CON-05 → lightweight Connection
CON-07 → unchanged write-only credential ingress
```

Selected-realization proof history:

```text
Verify #649 = EXPECTED RED
→ 73 tests / 72 pass / 1 fail
→ exact failure: CON-04 must return ConnectionDetail

Verify #651 = intermediate expected failure
→ F09 wire + checker shape accepted by repository tests
→ exact remaining owner gap: 4A had not yet recorded F09

Verify #652 = intermediate expected failure
→ F09 4A authority + wire + checker accepted
→ exact remaining downstream gap: W-02 P7 preflight had not yet recompiled F09 GREEN

Verify #655 = SUCCESS
HEAD = ebdd023e3fbabefccda789a7fe1fb1891624db2d
→ selected F09 Product authority + ConnectionDetail wire + Connections checker + generated/whole-wire proof GREEN
```

Current whole-platform invariants remain:

```text
fixed Product operations = 113
fixed Product wire       = 113 ↔ 113
Connections operations   = 9
ordinary Permissions     = 25
new F09 operations       = 0
new F09 owners           = 0
new F09 durable records  = 0
```

## 7. Current result

```text
Connections     = CLOSED inside 4B / F09 BOUNDED RECOMPILE GREEN
Product code    = BLOCKED
```

F09 changes only exact current non-secret configuration inspectability. It does not admit secret readback, revision history/rollback, rename/delete, `latestQualification`, generic qualification history or a collapsed readiness status.