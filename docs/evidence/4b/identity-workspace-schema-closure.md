# 4B Evidence — Identity & Workspace Schema Closure

> **Kind:** bounded 4B executable Evidence; not Product authority by itself.
> **Accepted semantic source:** current operator-ratified 4A authority after `4B-F01`.
> **Machine authority under proof:** `contracts/api/product/openapi.yaml` resolved graph.

## 1. Decision question

> Can the current Identity & Access plus Workspace Product surface be given exact request/success/Problem schemas without inventing Account, Workspace, Area, membership, grant or Published-App authority that 4A never admitted?

This is the first owner-by-owner schema-closure slice inside still-open 4B.

## 2. Exact slice

The slice contains exactly 20 current fixed Product operations:

```text
IAM-01 → IAM-15
IAM-17
WS-01
WS-02
WS-04
WS-05
```

`IAM-16` is not a current ledger operation. `WS-03` and `WS-06` were subtracted by the operator-approved `4B-F01` correction and therefore do not re-enter this slice.

The canonical active Path Items for this slice live in:

```text
contracts/api/product/identity-workspace-paths.yaml
```

They are authority only through the canonical `contracts/api/product/openapi.yaml` entrypoint and resolved bundle graph.

## 3. Closure laws proved

### 3.1 Account provisioning

`ProvisionAccount` closes only the caller input already derivable from accepted identity authority:

```text
externalSubject
```

The configured authentication issuer/provider remains server-pinned. The caller cannot submit or select `issuer`, provider authority, Keycloak roles/groups/organizations or Product authorization through the request body.

`Idempotency-Key` remains mandatory for the admitted repeatable provisioning intake.

### 3.2 Workspace / Area creation

`CreateWorkspace` and `CreateArea` carry no invented mutable metadata body.

```text
no name
no description
no settings
no arbitrary metadata map
```

Both retain their required `Idempotency-Key` carriage and return only the newly established Product identity needed by the accepted surface.

This preserves the `4B-F01` finding: absence of an accepted mutable property inventory is not permission to manufacture one at wire time.

### 3.3 Membership and grant operations

Workspace membership, Area membership, direct Account→Project grants and Area→Project grants use exact path identities as untrusted references while current containment/disclosure/authorization remains server-resolved.

The wire does not treat possession of `workspaceId`, `areaId`, `projectId` or `accountId` as authority.

### 3.4 Published-App access

The current Published-App role vocabulary is exactly:

```text
admin
member
```

`SetPublishedAppAccess` requires both the desired role and explicit expected-current state:

```text
ABSENT
or
PRESENT + exact current role
```

`RevokePublishedAppAccess` carries the expected current role explicitly because no exact item GET/ETag contract exists for that grant target.

The role/current-state carriers are stale-subject guards; they never replace current Product authorization.

## 4. Negative controls

The executable checker rejects at least:

```text
any of the 20 operations not SCHEMA_CLOSED
provisional success authority surviving in the slice
IAM-03 without externalSubject
IAM-03 with caller-selected issuer
IAM-03 without Idempotency-Key
IAM-15 role vocabulary wider/narrower than {admin,member}
IAM-15 without explicit ABSENT/PRESENT expected-current contract
IAM-17 without exact expectedRole
WS-01 or WS-05 with invented request-body metadata
WS-01 or WS-05 without Idempotency-Key
```

The checker resolves bundled local `$ref` parameters before evaluating these requirements, so shared component reuse cannot make the proof incorrectly fail or pass merely because a header is referenced rather than repeated inline.

## 5. Executable proof

Machine guards:

```text
scripts/check-wire-bijection.mjs
scripts/check-wire-carriers.mjs
scripts/check-wire-identity-workspace.mjs
```

Fresh exact proof at slice closure:

```text
HEAD = 0e01aed598c1ee0ae0c11fa1a23fd528718badd6
Verify #255 = SUCCESS

fixed 4A operations      = 111
fixed OAS operations     = 111
schema-closed operations = 20
missing                  = 0
extra                    = 0
duplicate                = 0
literal IF_MATCH          = { PRJ-12, PAR-14 }
```

The preceding failed runs were useful falsifiers rather than ignored noise:

```text
Verify #253
→ bijection guard proved it was incorrectly frozen to METHOD_PATH_MAPPED only
→ guard was corrected to admit the legitimate 4B progression METHOD_PATH_MAPPED | SCHEMA_CLOSED while still rejecting unknown states

Verify #254
→ owner checker proved it did not resolve bundled local parameter $ref values
→ checker was corrected to resolve the canonical bundle before evaluating shared required headers
```

No Product contract was weakened to obtain #255.

## 6. Result

```text
Identity & Access + Workspace schema slice = CLOSED inside 4B
4B overall                                 = OPEN / ACTIVE
Product implementation                     = BLOCKED
```

The next owner slice must continue deriving exact schemas from accepted authority. Any missing Product property inventory remains a stop/reopen falsifier, not an invitation to invent DTO fields.
## Pre-P11 F03 trusted bootstrap recompile

`4C-PRE11-F03` adds no Product operation or ordinary Permission. `IAM-03` admits a second exact authority route, `trusted_bootstrap_context`, whose request omits caller-supplied externalSubject because the server resolves the exact preconfigured OIDC subject. `WS-01` success now proves `creatorAccountId + initialAccessEstablished=true`, preventing a successful but undisclosable first Workspace. The transient context is invalid after Account establishment and cannot access ordinary Product routes.
