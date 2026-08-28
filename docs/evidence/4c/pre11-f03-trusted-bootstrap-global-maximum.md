# 4C-PRE11-F03 — trusted instance bootstrap Global Maximum

> **Status:** `OPERATOR RATIFIED / GLOBAL MAXIMUM SELECTED / 4A-4B TARGETED GREEN / T-01 FRONTEND OPEN`
> **Scope:** first owned Conexus instance only
> **New Product operations:** none selected
> **SaaS/tenant onboarding:** rejected
> **Implementation:** blocked

## Root contradiction

Current human ingress assumes:

```text
verified Keycloak identity
→ existing Conexus Account mapping
→ opaque HUMAN_ACCOUNT_SESSION
```

But `IAM-03 ProvisionAccount` is required to create the first Account and is currently classified only under `HUMAN_ACCOUNT_SESSION`. The first Account therefore cannot honestly provision itself through the current principal model.

`WS-01 CreateWorkspace` also does not currently close how its creator becomes authorized to enter/administer the first Workspace.

## Alternatives

### A. Seed Account/Workspace directly through migration/database

Rejected as Product path. It is operationally possible but bypasses the accepted CP-S02/CP-S03 first-access surfaces and leaves no browser-operable proof.

### B. Default reusable admin username/password

Rejected. It creates a durable shared credential and a weaker recovery surface. Keycloak remains authentication mechanism only.

### C. One-shot OIDC-bound bootstrap context

Selected.

## Selected semantic flow

```text
no Conexus Account maps the exact configured bootstrap OIDC subject
→ normal Keycloak Authorization Code + PKCE authentication
→ callback validates the exact pinned issuer/subject
→ server verifies equality with the preconfigured bootstrap subject
→ TRUSTED_BOOTSTRAP_CONTEXT
→ IAM-03 self-provisions only that exact Account
→ bootstrap context ends
→ normal OIDC entry now resolves the Account and establishes HUMAN_ACCOUNT_SESSION
→ WS-01 creates the first Workspace for the trusted platform operator
→ creation establishes the exact initial Workspace access needed to enter it
→ IAM-01 returns the normal Account/Workspace context
```

The temporary context is a real new principal/trust-boundary class and must be named honestly. It is not a reusable Permission, tenant role, Keycloak role/group/Organization or durable Product record.

## Bootstrap authority

`TRUSTED_BOOTSTRAP_CONTEXT` is valid only when all are true:

```text
OIDC issuer = server-pinned issuer
OIDC subject = server-preconfigured bootstrap subject
no existing Conexus Account maps that exact subject
bootstrap intake is current and unexpired
requested operation = IAM-03 self-provision only
```

It cannot:

- choose another external subject;
- create arbitrary Accounts;
- create/read a Workspace directly;
- receive ordinary Permissions;
- access Control Plane routes other than the exact bootstrap surface;
- survive successful Account establishment;
- become normal Conexus session authority.

After `IAM-03` succeeds, subsequent OIDC entry uses the normal Account mapping/session boundary. `WS-01` remains under the trusted `platform_operator` condition on that normal Account session.

## First Workspace outcome

The accepted Journey A outcome is not merely a Workspace record; it is an authorized Workspace the creator can enter. The bounded WS-01 recompile must therefore decide and prove the initial access fact produced with creation. It must not leave a Workspace whose creator cannot disclose or administer it.

Leading semantic direction:

```text
WS-01 success
= exact Workspace identity
+ exact initial current-Account Workspace membership/administration consequence
```

Whether this consequence is one atomic owner transaction or a recoverable owner-coordinated transition remains a later 4D realization question, but Product success cannot claim completion while initial access is absent.

## Required states

```text
AUTHENTICATION_REQUIRED
IDENTITY_NOT_ELIGIBLE
BOOTSTRAP_IN_PROGRESS
ACCOUNT_PROVISION_FAILED / recoverable intake
ACCOUNT_ESTABLISHED / normal re-entry required
NO_WORKSPACE
WORKSPACE_CREATE_CONFLICT
DEPENDENCY_FAILURE
BOOTSTRAP_SEALED
SESSION_ESTABLISHED
```

Failed bootstrap is never rendered as a known-empty Workspace collection. Successful Account establishment makes the old bootstrap context unusable even if first Workspace creation remains pending.

## Frontend scope

Create one small future block:

```text
T-01 Trusted setup / first access
→ first Account presentation
→ first Workspace name
→ explicit progress/re-entry states
→ normal GF-01 handoff
```

Also reopen only the GF-01 Account-menu interaction needed to make `IAM-02 EndSession` operable. Do not reopen its shell hierarchy.

## Explicit exclusions

```text
tenant management
public signup
invitations
billing/plans
commercial organizations
generic Account profile editor
Keycloak directory browser
role/group editor
default password
permanent bootstrap bypass
runtime cookie/token/storage choice
```

## Proof before P8

1. unconfigured or wrong OIDC subject cannot call IAM-03;
2. bootstrap IAM-03 cannot provision another subject;
3. repeated intake cannot duplicate the Account;
4. successful Account provisioning invalidates the bootstrap context;
5. normal Account session can resume first-Workspace creation;
6. WS-01 success makes the new Workspace actually disclosable to its creator;
7. no bootstrap path authorizes any post-bootstrap Product resource;
8. IAM-02 ends only the Conexus session and claims no global Keycloak logout.

The bounded 4A/4B recompile is targeted GREEN:

- `IAM-03` now admits ordinary `platform_operator` and exact `trusted_bootstrap_context` authority routes;
- bootstrap provisioning omits caller-supplied `externalSubject`; the server resolves it from the exact context;
- ordinary provisioning retains explicit external subject intake;
- `WS-01` success requires `creatorAccountId + initialAccessEstablished=true`;
- operation count remains 128 after the independently accepted F05 addition; ordinary Permissions remain 25.

The next F03 work is the bounded `T-01 Trusted setup / first access` P6–P10 frontend cycle plus the GF-01 Account-menu delta. No HTML is authorized before its P7 structure and Evidence are ready.
