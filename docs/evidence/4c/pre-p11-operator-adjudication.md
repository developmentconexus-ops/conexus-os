# 4C pre-P11 operator adjudication

> **Status:** `OPERATOR APPROVED / BOUNDED CORRECTIONS AUTHORIZED`
> **Date:** 2026-08-27
> **Scope:** `4C-PRE11-F03`, `4C-PRE11-F04`, `4C-PRE11-F05`
> **P11:** not assembled
> **Product implementation:** blocked

The operator approved all three material decision directions presented after the pre-P11 global coherence fusion review.

## 1. `4C-PRE11-F03` — trusted instance bootstrap

### Operator intent

Conexus is being built first as the operator's own professional software factory, not as a commercial multi-tenant SaaS platform. Current planning must not introduce tenant sales/onboarding machinery, public signup, plans, invitations or generalized organization administration.

The operator approves a minimal, secure initial-configuration experience for the owned Conexus instance.

### Accepted direction

```text
install/deploy one Conexus instance
→ admit only a preconfigured trusted bootstrap identity
→ authenticate through the selected Keycloak/OIDC boundary
→ establish the first Conexus Account and first Workspace through accepted owner truth
→ seal ordinary bootstrap entry after successful establishment
→ continue through normal Account/session/Workspace authority
```

Required properties:

- one-shot trusted setup, not public signup;
- no tenant, plan, billing, marketplace or commercial onboarding machinery;
- no default reusable username/password;
- bootstrap secret/identity remains server/configuration controlled and never enters browser Product truth;
- the bootstrap path cannot remain a hidden permanent authorization bypass;
- recovery is explicit and separate from normal first-run setup;
- `IAM-03 ProvisionAccount`, `WS-01 CreateWorkspace` and `IAM-02 EndSession` retain their current owners and semantics unless bounded Evidence proves a smaller correction is impossible.

The selected frontend structure and any necessary principal/session refinement still require bounded Product/security/4A/4B analysis before P8. No exact runtime mechanism is selected in 4C.

## 2. `4C-PRE11-F04` — exact AgentRun effect investigation

### Operator decision

Preserve the exact human investigation job. An AgentRun continuation must not lead to an unfiltered Project-wide list that requires the browser or person to reconstruct the relevant effect set.

### Accepted direction

```text
exact AgentRun
→ Continue to Activity / Effects
→ server-owned originatingRun filter
→ Gateway effect attempts produced by that exact run
→ exact effect detail / receipt / reconciliation / Evidence where admitted
```

Leading bounded realization:

- reuse `GW-01 ListEffectAttempts`;
- add an optional exact `originatingRun` query filter matching the existing owner-issued `OriginatingRunRef` shape;
- apply the filter server-side before pagination;
- carry exact Project + run kind/ref as untrusted route coordinates;
- preserve `audit.read`, disclosure and Gateway owner revalidation;
- add no operation, Permission, retry/replay/reconcile action or frontend filtering authority.

The exact 4A semantic wording, 4B query encoding and P-03/P-04 Screen Contract recompile must be proved RED→GREEN before any frontend delta.

## 3. `4C-PRE11-F05` — `project.build` and safe authoring-reference discovery

### Operator decision

The operator rejects a permission composition in which a human is allowed to create/evolve an application or Product Agent but cannot discover the safe contracts required to build it coherently.

The operator also rejects widening `project.build` into generic business-data, secret, runtime or administration access.

### Accepted principle

```text
project.build
→ safe, purpose-bound discovery of contracts required for construction

project.build
-X-> project.read generic
-X-> project.data.read
-X-> project.source.read generic
-X-> brain.read generic
-X-> Connection credentials/configuration
-X-> capability invocation
-X-> runtime/serving/access administration
```

Illustrative protected distinction:

```text
Builder may recognize:
  Capability name, purpose, regime, logical inputs/outputs and exact reference

Builder may not thereby:
  inspect business records, invoke the capability, read secrets,
  manage the Connection or gain runtime authority
```

### Authorized bounded study

Before choosing a wire realization, enumerate the exact NEW/EXISTING Product Agent authoring consumer for each reference family:

```text
capability bindings
Project-bound Brain context references
model policy references
general policy references
approval policy references
budget policy references
verification references
```

For each family determine:

1. required human recognition and safe decision fields;
2. current semantic owner and existing read capability;
3. whether purpose-bound reuse is sufficient;
4. whether the reference is already safely projected by exact draft/current authored truth;
5. whether a genuinely Project-owned authoring-reference projection is missing;
6. why any new read is semantic Product truth rather than a screen-shaped aggregate;
7. disclosure, pagination/scale, currentness and negative-state requirements.

No universal catalog, frontend registry or aggregate endpoint is approved by this decision. The study must return a Global-Maximum comparison and selected realization for separate bounded recompile.

### Subsequent operator decision

On 2026-08-27 the operator approved the study's leading minimal F1 posture:

```text
capabilities + Project Brain refs = discoverable through safe owner projections
model policy = Project-owned approved default or small governed choice
general/approval/budget/verification refs = empty for NEW
existing optional refs = preserved but not freely editable until an owner exists
```

The exact realization's proposed new `PRJ-29` read and the resulting `127 → 128` census change remain separately material and require explicit operator ratification before recompile.

On 2026-08-27 the operator explicitly ratified both exact realization consequences:

```text
TRUSTED_BOOTSTRAP_CONTEXT = APPROVED
PRJ-29 ListProjectModelPolicies = APPROVED
N_platform 127 → 128 = APPROVED
ordinary Permissions remain 25
```

## 4. External-reference disposition

Current Keycloak documentation supports temporary bootstrap users/service accounts created only for initial setup or explicit recovery. This validates the one-shot/bootstrap-sealing pattern as mechanism Evidence; it does not make Keycloak a Conexus Product-authorization owner.

Grafana's default-admin/forced-password-change pattern was considered only as a counterexample: a reusable default browser credential is weaker than the accepted preconfigured temporary bootstrap identity and is not selected.

## 5. Continuation authority

Authorized next work:

```text
F03 bounded bootstrap Product/security/frontend design
+ F04 GW-01 originatingRun selected realization and 4A/4B recompile
+ F05 authoring-reference discovery Global-Maximum study
→ apply accepted bounded corrections
→ recompile 4C coverage bidirectionally
→ terminal P10 reconciliation
→ faithful P11 assembly contract
```

Not authorized:

```text
new P11 HTML
P12
4D
Product implementation
commercial SaaS/tenant onboarding machinery
design-system/component/SDK/runtime selection
merge
```
