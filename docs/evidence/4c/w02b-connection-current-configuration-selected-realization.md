# 4C-F09 — Connection current-configuration selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED`
> **Block:** `W-02B — Connections`
> **Selected alternative:** `F — enrich CON-04 GetConnection with current non-secret configuration`.
> **Authority posture:** bounded Connections-owner recompile only; no Product implementation authority.

## 1. Operator decision

The operator accepted the F09 Global-Maximum candidate.

Selected semantic realization:

```text
CON-03 ListConnections
→ existing lightweight Connection[]

CON-04 GetConnection
→ ConnectionDetail
   = existing Connection truth
   + current non-secret configuration

CON-05 CreateConnection
→ existing Connection response remains sufficient

CON-07 SetConnectionCredential
→ write-only secret ingress remains unchanged
```

## 2. Exact new property

`ConnectionDetail.configuration` must be:

```text
provider-specific non-secret object
server-owned read projection
shaped/validated from the exact ConnectorDefinition configuration schema
bound to the same exact currentRevisionId returned in the detail
```

It is current revision inspection truth, not a second durable configuration owner.

## 3. Preserved boundaries

```text
Connection.name = logical human presentation identity
currentRevisionId = exact current immutable revision coordinate
configuration = non-secret current revision meaning
credentialConfigured = non-secret presence fact only
credential = never read back
qualification = separate exact revision/environment Evidence
ProjectConnectionBinding = separate Project owner truth
Gateway health/effect admission = separate runtime truth
```

Binding law remains:

```text
configured != qualified != bound != healthy != caller-authorized
```

## 4. Wire realization

Add one schema:

```text
ConnectionDetail
```

It contains all currently required `Connection` fields plus:

```text
configuration
```

`CON-04` alone returns `ConnectionDetail`.

The existing `Connection` schema stays lightweight for browse/create. This avoids a rename-only transport churn and avoids sending provider configuration for every list row.

## 5. Negative laws

The selected realization forbids:

```text
secret / credential / password / token in ConnectionDetail
configuration on CON-03 merely by schema reuse
new GetConnectionRevision/history API
new GetConnectionConfiguration API
latestQualification/history/status synthesis
rename/delete/rollback authority
new operation/Permission/owner/record
```

## 6. Proof target

Selected RED must fail while:

```text
CON-04 still returns Connection
OR ConnectionDetail is absent
OR ConnectionDetail lacks configuration
OR configuration is not explicitly non-secret/schema-bound/currentRevision-bound
OR secret/readiness-collapse protections regress
```

Then the bounded 4A/4B recompile must restore whole-wire GREEN with:

```text
fixed Product operations = 113
fixed Product wire = 113 ↔ 113
Connections operations = 9
ordinary Permissions = 25
```