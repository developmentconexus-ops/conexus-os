# 4C-F09 — Connection current-configuration selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / GREEN`
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

`ConnectionDetail.configuration` is:

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

One detail schema is admitted:

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

## 6. RED → GREEN proof

Historical selected marker:

```text
OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED
```

Clean selected RED:

```text
Verify #649 = EXPECTED RED
→ 73 tests / 72 pass / 1 fail
→ exact failure: F09 RED: CON-04 must return ConnectionDetail
```

Bounded recompile then progressed owner-first:

```text
Verify #651 = expected intermediate failure
→ wire/checker shape present
→ 4A F09 property still missing

Verify #652 = expected intermediate failure
→ 4A + wire/checker accepted
→ W-02 P7 preflight still stale
```

Final selected proof:

```text
Verify #655 = SUCCESS
HEAD = ebdd023e3fbabefccda789a7fe1fb1891624db2d
fixed Product operations = 113
fixed Product wire = 113 ↔ 113
Connections operations = 9
ordinary Permissions = 25
```

F09 is GREEN. The next action is W-02B P7 structural adjudication; this proof does not approve any Connections frontend structure or P8.