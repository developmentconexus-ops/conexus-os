# Conexus OS — Permission Contract

> **Status:** CURRENT / OPERATOR RATIFIED / `4C-F23` BOUNDED CORRECTION ACCEPTED
> **Purpose:** derive the smallest ordinary Permission vocabulary needed by the exact Conexus platform operation authority without turning personas, screens, Keycloak claims or Published-App roles into a universal policy system.
> **Operation authority:** [operation-ledger.md](operation-ledger.md).
> **Mutable program status:** owned only by [../roadmap.md](../roadmap.md).

This document is the single current home for ordinary Conexus Control-Plane/runtime Permission names. It does not define HTTP security schemes, storage policy mechanics or a role editor and it does not authorize implementation.

The exact operation → principal/ingress/Permission/scope/outcome/current-authority/idempotency-concurrency mapping is canonical in the operation ledger. This document owns only the reusable ordinary Permission vocabulary and its separation from special/runtime/app authority.

---

## 1. Permission law

An ordinary Permission exists only when it represents a reusable semantic authority distinction that at least one current concrete operation needs.

```text
screen/button             -X-> Permission
narrative persona         -X-> Permission
Keycloak role/group       -X-> Permission
runtime/model/provider id -X-> Permission
Project business op name  -X-> global Permission string
```

A Permission is necessary but may be **insufficient**. Operations still recheck exact containment, current grant/membership, immutable subject, owner state, Release/binding pins and other current eligibility facts.

```text
Permission
= reusable semantic capability class

current owner facts
= whether this exact current subject may be exercised now
```

The vocabulary is not a universal policy language and does not imply a custom Role/Permission editor in F1.

---

## 2. Non-ordinary authority conditions

| Condition | Meaning |
| --- | --- |
| `authenticated` | valid current Conexus Account/session; Keycloak token alone is not sufficient |
| trusted `platform_operator` | first-installation/trusted F1 Account/Workspace provisioning condition; not a general tenant Permission |
| `TRUSTED_BOOTSTRAP_CONTEXT` | transient pre-Account context for the exact server-preconfigured OIDC subject; IAM-03 self-provision only; invalid after Account establishment and never an ordinary Permission |
| current Workspace membership | containment/disclosure root; does not grant all Workspace resources |
| exact Project grant | Project access fact; still constrained by operation Permission/current owner state |
| Published App role `{admin, member}` | independent app-use authority; never automatically Control-Plane authority or effect-approval authority |
| exact PAR AgentRun/ToolProjection | runtime capability context; not a human Permission |
| exact MAR JobRun/Release projection | managed execution context; queue identity is not authority |
| owner/system transition | internal current-state transition after admitted authority/proof; no public Permission |
| DEDICATED `SERVICE_SCOPED` projection | exact future service-principal allowlist; no concrete F1 Product operation without a real consumer |

`PlanningDepth`, `RigorProfile`, provider/model names, Mastra identities and E2B identities are never Permissions.

### 2.1 First-installation operator derivation and exact R1 consequences

For F1 only, the exact server-preconfigured bootstrap `(issuer, subject)` also
derives the trusted `platform_operator` condition after that subject maps to its
durable Account and enters through a normal `HUMAN_ACCOUNT_SESSION`.

```text
verified normal-session Account external identity
= exact configured bootstrap (issuer, subject)
→ trusted platform_operator condition

Keycloak role/group/Organization/token claim -X-> platform_operator
```

This is one server-derived installation condition, not a durable role, a 26th
Permission or a tenant policy engine. Recovery preserves the exact
configuration. Multiple or transferable operators require a future
Product/security reopen.

The initial creator consequences are exact and minimal for R1:

```text
WS-01 success
→ current Account Workspace membership/access
+ project.create in that exact Workspace

PRJ-03 success
→ exact current-Account direct Project grant
+ project.read
+ project.manage
```

The grant does not imply `project.build`, `project.review`,
`project.source.read` or later-tranche Permissions. 4F adds later authority only
at its first accepted consumer; creator status never implies a generic admin
bundle.

The operator-approved `R2-P2` successor on `2026-09-04` is that first accepted
consumer for `brain.read`. It extends the exact `WS-01` settlement so the exact
Workspace creator receives an independently stored `brain.read` fact, including
a one-time backfill for pre-R2 creator memberships. This is an explicit
successor consequence, not an inference at read time: `can_create_project` and
`can_read_brain` remain independently revocable, neither implies the other,
and no other later-tranche Permission is added. A member without the fact is
denied; a non-member receives no Workspace disclosure. Transferable or broader
Brain-access administration remains with the later exact I&A consumer.

The operator-approved `R2-P3` successor on `2026-09-04` is the first accepted
consumer for `connection.read`, `connection.manage` and
`connection.qualify`. It extends the exact creator settlements with three
independently stored and independently revocable facts in the exact created
owner scope: the Workspace creator receives them only for that Workspace and
the Project creator receives them only for that Project. A one-time backfill
applies the same consequences to pre-R2 creator memberships/direct creator
grants. No fact implies another fact, creator status is not consulted at
admission time, and no cross-scope or generic administration authority is
created. Connector-definition discovery requires at least one
current `connection.read` fact. `connection.use` is deliberately excluded: it
receives no automatic creator grant and remains for its first exact binding or
external-source consumer.

The operator-approved `R2-P4` successor on `2026-09-04` is the first accepted
consumer for `brain.bind` and `connection.use`. It extends only the exact
Project-creator settlement with two independently stored and independently
revocable Project-scoped facts, including a one-time backfill for existing
exact Project creators. Neither fact implies the other, creator status is not
consulted at admission time, and neither implies `brain.read`,
`connection.read`, `connection.manage`, `connection.qualify`,
`project.manage`, runtime execution, generic read/admin or any cross-scope
authority. Clear/remove remains narrowing under the already accepted
`project.manage` route and does not require either specialist fact to remain.
Transferable or broader grant administration remains with a later exact I&A
consumer.

---

## 3. Ordinary Permission vocabulary

The vocabulary is **15** after the current bounded corrections. Brain, connection bindings and the Sankhya gateway left the product on 2026-09-19, retiring the ten `brain.*` and `connection.*` Permissions along with the operations that were their only consumers; the F17/F18/F19/F23 records that once justified their purpose-bound disclosures are retained as history. F11 adds three exact I&A reads and narrow access-administration summary disclosure; F12 enriches existing `audit.read` consumers; F22 reuses `project.data.read` for four exact Project-owned read-only explorer projections whose source/object disclosure remains separately fail-closed. F31/F32/F34 enrich existing Release/OBS reads; F33 adds `MAR-04` under ordinary `project.read` or the existing purpose-bound `job.run`. None proves a 16th reusable authority class.

### 3.1 Workspace and access

| Permission | Meaning | Material current consumers |
| --- | --- | --- |
| `workspace.access.manage` | administer Workspace membership and pending invitations; inspect only the bounded identities and current access needed to perform that administration | `IAM-05`, `IAM-06`, `IAM-10`; narrow access-administration summary disclosure through `PRJ-01` |
| `project.create` | create a source-complete Project in an exact Workspace | `PRJ-03` including its creation-time canonical source bootstrap |

`workspace.access.manage` is held by the Workspace role `owner` and by nobody else. A `member` holds every other Workspace right and cannot administer the roster. `IAM-04` needs no Permission beyond current membership, because every member may see who else is in the Workspace they belong to.

`4C-F11` does **not** make `workspace.access.manage` a generic Workspace or Project read capability. Its alternate disclosure is intentionally summary-only:

```text
PRJ-01 under workspace.access.manage
→ exact contained ProjectSummary identities needed to administer access

access-administration summary disclosure
-X-> Workspace settings mutation
-X-> Project content/source/data/build/read authority
-X-> arbitrary cross-Workspace enumeration
```

### 3.2 Project

| Permission | Meaning | Material current consumers |
| --- | --- | --- |
| `project.read` | inspect ordinary Project-level Product truth/projections | ordinary `PRJ-01/02`; `PAR-06/07` Control-Plane run inspection; ordinary Release/Promotion/serving/job/activity reads |
| `project.source.read` | inspect Project source/diff/authored definitions without write authority | `BLD-07..09` |
| `project.data.read` | inspect admitted semantic Data resources and bounded read-only Project Data Explorer projections without becoming a generic DB console | `PRJ-25..28` |
| `project.manage` | administer Project lifecycle and independent Published-App access configuration | no current wired consumer; its Published-App access-configuration and archive/duplicate consumers were contract for surfaces never built and were removed |
| `project.build` | create/evolve accepted Project Product/Agent intent through Change/Builder and inspect only the purpose-bound construction contracts required for that work | `BLD-01..04/06/10/16..20` |
| `project.review` | participate in exact Plan/Change checkpoint, Finding and Evidence review | `BLD-05/11..15` |

`project.manage` does **not** imply `project.build`, `project.review`, Published-App business use or Release promotion. `4B-F01` removed generic `UpdateProject`; it did not remove the distinct lifecycle/app-access consumers that justify this Permission. Project Inception, Baseline, Brain, connection bindings and the Sankhya gateway left the product on 2026-09-19, so the candidate-review, contextual-explanation and binding consumers that `4C-F02`, `4C-F03`, `4C-F17` and `4C-F18` mapped here no longer exist; the `4C` records of those decisions are retained as history.

`4C-F30` creates no `agent.manage`, `agent.definition.write`, `mastra.manage` or source-write Permission. `project.build` admits only the server-owned typed Product Agent draft inside the exact Change; possession of `changeId`, `draftId`, `agentId`, `capabilityId` or policy references is never authority by itself. BLD-19 revalidates explicit NEW/EXISTING origin and BLD-20 fails closed on stale `expectedDraftRevision`; both remain upstream of candidate diff/proof/Release and cannot mutate a live Agent. The PRJ-20/21 Agent-summary and Agent-definition reads and the PRJ-16/17/29 capability/model-policy discovery reads that `4C-PRE11-F05` once purpose-bound here were contract for a surface never built and were removed.

The F11 access-administration route to `PRJ-01` is **not** `project.read`; it is a separately admitted narrow disclosure path under `workspace.access.manage` that returns contained Project summaries only for grant administration. It never confers ordinary Project inspection authority.

`4C-F22` keeps `project.data.read` as a necessary but insufficient reusable authority distinction. `PRJ-25..28` additionally require the exact current Project grant and server-resolved explorer eligibility for the named source/object; bound Connection existence alone never grants raw-source disclosure, and guessed source/object/page coordinates never authorize. The four reads grant no SQL text/expression, mutation, credentials, foreign Project/Workspace data, `hub_control`, Mastra/Keycloak provider-store disclosure or generic Connection inspection/use authority.

Operator-confirmed F22 consequence: when F22 runtime exists, **already-issued `project.data.read` grants can become eligible for raw-row disclosure** over explorer-eligible sources, still subject to the same exact Project grant and server-resolved source/object eligibility. This is an accepted widening of disclosure reachable through the existing Permission, not a new Permission. If a real tenant requires semantic Data inspection without raw-row disclosure, this Permission decision must reopen rather than inventing client-side masking or silently broadening grants.

### 3.3 Release, managed execution and audit

| Permission | Meaning | Material current consumers |
| --- | --- | --- |
| `release.promote` | discover exact target serving posture, inspect conformance and decide/perform governed Promotion/rollback | purpose-bound `REL-07`, `REL-06`, `REL-08` |
| `job.run` | discover safe human job identities from the currently served Release and manually admit one exact Release-pinned managed `job/v1` occurrence | purpose-bound `MAR-04`, `MAR-03` |
| `audit.read` | inspect audit/effect/technical execution Evidence and exact decision subjects through read-only investigator paths beyond ordinary owner views | `OBS-02/04/05`, `GW-01/02`, investigator route of `PAR-09` |

Release composition is an owner/system transition gated by exact accepted proof; there is no `release.compose` Permission. Ordinary Release/Promotion history and serving/job-run projections use `project.read` where disclosed.

`4C-F31..F34` add no Permission. `REL-07` admits a purpose-bound `release.promote` route exposing only exact target-environment pointer/serving truth required before conformance and Promotion; it does not confer general Project inspection. `MAR-04` admits ordinary `project.read` or purpose-bound `job.run` and returns only safe job identity/purpose from the exact currently served Release; it does not expose JobRun history, source, queue/scheduler mechanics or execution authority. `OBS-01` human summary/detail coordinates remain under `project.read`, and every optional owner-detail target rechecks its own Permission.

`4C-F12` keeps `OBS-04/05` under the same `audit.read` authority while making the admitted immutable audit set server-filterable and human-reviewable. Search/filter shape and immutable presentation snapshots do not create a broader `audit.search` or `event.read` Permission.

`4C-PRE11-F04` likewise keeps `GW-01/02` under `audit.read`. An optional exact server-side `originatingRun` filter makes the already-admitted effect-investigation subject reachable from an AgentRun without granting PAR detail, Project read, retry/replay/reconciliation or effect-execution authority. No new ordinary Permission is admitted.

### 3.6 Product Agent runtime

| Permission | Meaning | Material current consumers |
| --- | --- | --- |
| `agent.trigger.manage` | create/revise/enable/disable exact `SCHEDULE` trigger authority for a Project-owned Product Agent | `PAR-11..16` |
| `agent.headless.invoke` | manually invoke an exact active Product Agent through the admitted headless surface | `PAR-05` |
| `agent.effect.approve` | participate as a human approver for an exact current sealed ApprovalRequest subject when separately eligible | `PAR-08..10` approver routes |

Product Agent authoring is **not** `agent.manage`; it remains ordinary Project evolution through `project.build` and the same Change/Release path.

The purpose-bound `PRJ-20` human Agent summary discovery that `agent.trigger.manage` once additionally disclosed was contract for a surface never built and was removed; the Permission's only current consumer is `PAR-11..16`.

Interactive Published-App Agent use is authorized by exact Published-App access/role + active Agent/Release semantics, not by `agent.headless.invoke`.

`agent.effect.approve` is a semantic authority distinction, not a Control-Plane UI entitlement. An eligible human may reach the exact owner-specific approval surface through Control Plane or Published App when that Product experience exposes it, but every decision still rechecks current approver eligibility, revocation, Release, exact sealed proposal and owner state. Published-App role `{admin,member}` alone is never approval authority; conversely, presenting approval in a Published App never grants Builder/Control-Plane access.

`PAR-08/09` provide an eligible human with PAR-issued request-time Agent presentation, a deterministic safe action summary and requested/optional-expiry times. This recognition context is not current Agent or authorization truth, does not require or grant Project/source reads, and never replaces the exact sealed subject and digest required by `PAR-10`.

`audit.read` can expose `PAR-09` read-only to a separately authorized investigator; it can never list the approval queue through `PAR-08` or decide an ApprovalRequest.

---

## 4. Current census

```text
workspace.access.manage
project.create

project.read
project.source.read
project.data.read
project.manage
project.build
project.review

release.promote
job.run
audit.read

brain.read
brain.propose
brain.discover
brain.review
brain.publish
brain.bind

connection.read
connection.manage
connection.qualify
connection.use

agent.trigger.manage
agent.headless.invoke
agent.effect.approve
```

```text
ordinary Permissions = 25
status = CURRENT / OPERATOR RATIFIED / 4C-F23 BOUNDED CORRECTION ACCEPTED
```

The number 25 has no independent value. It survives because the current operation mapping still requires each distinction and no accepted operation requires a 26th ordinary Permission.

---

## 5. Explicit anti-expansion rules

Rejected unless material current Product Evidence proves a distinct reusable authority class:

```text
account.read
account.manage
grant.read
grant.manage
role.manage
baseline.approve
baseline.chat
finding.close
evidence.read
preview.read
source.file.read
query.execute
action.execute
integration.execute
analyticquery.execute
analyticquery.read
release.read
release.compose
promotion.read
effect.read
job.read
conversation.read
agent.run.read
agent.manage
workflow.execute
admin
superadmin
```

These either duplicate an existing semantic capability, mirror CRUD/UI nouns, describe operation/mechanism type rather than authority, or would create an unjustified universal policy layer.

Material compound mappings remain explicit rather than collapsed:

```text
PRJ-25..28 Project Data Explorer
→ project.data.read + exact Project grant + server-resolved current source/object eligibility
→ Project Database business/application data or exact eligible bound integration source only
→ source/object/page coordinates remain untrusted references
→ no SQL / mutation / credentials / arbitrary Connection selection / foreign Project or Workspace disclosure

DecideApprovalRequest
→ agent.effect.approve + exact current approver eligibility + exact sealed proposal
→ current ingress may be CP or an exact admitted PA approval surface; PA role alone grants nothing
```

`CreateProject` source bootstrap does not create a `git.import`, `repository.manage` or network Permission. The caller still needs only `project.create`; repository locator admission is bounded input validation and GitInfra remains mechanism under current server policy. The candidate reads that once carried the same argument against `baseline.read`/`baseline.approve`/`baseline.chat` proliferation were retired with Project Inception and Baseline on 2026-09-19; those Permissions remain uncreated. `BLD-16 AskConexusAboutContext` is governed by `project.build` because it serves Builder context.

F11 likewise does not create Account or grant CRUD Permissions. `workspace.access.manage` already represents the reusable authority distinction required to administer those exact membership facts; the new reads merely make that existing authority safely inspectable.

F22 likewise does not create a database/explorer Permission family. `project.data.read` remains the reusable semantic authority, while each explorer read independently revalidates exact Project containment and current source/object disclosure eligibility; browser-visible filtering, paging and physical coordinates cannot widen that authority. The existing-grant raw-row consequence above is operator-confirmed and accepted for F22; a real semantic-without-raw-row tenant requirement reopens this decision.

F17, F18, F19 and F23 governed the now-retired Project Connection binding, Project Brain binding and Project Brain Context disclosures; their records are retained as history in the operation ledger.

---

## 6. Published Application authorization remains separate

Current F1 Published-App role set remains exactly:

```text
admin
member
```

These roles are an independent Product authorization plane.

```text
Project admin -X-> app admin
app admin     -X-> project.manage
app member    -X-> project.read
app role      -X-> agent.effect.approve
```

Every exact Project-defined operation in `Ops(R)` declares its admitted app-role subset, PAR/MAR projection or future real DEDICATED service allowlist. Conexus does not create a global Permission per customer business operation.

The `IAM-21` candidate-disclosure and `IAM-14` capability-subset reads that `4C-F35/F36` once made this access-administration authority human-operable through were contract for a surface never built and were removed. Keycloak roles, groups, Organizations, Authorization Services and token claims never satisfy `project.manage`, select an app role or establish a Published-App grant.
