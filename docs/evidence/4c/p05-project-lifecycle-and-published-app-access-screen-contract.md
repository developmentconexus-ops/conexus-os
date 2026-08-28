# P-05 — Project lifecycle + Published-App access Screen Contract

> **Status:** `P12 FAMILY 3 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED`
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** `P9 EXACT TRACE CLOSED`
> **P10:** `P10 CONSOLIDATED`
> **P11:** `P11 LATER ASSEMBLED PRODUCT`
> **Final operator-approved P8:** `docs/evidence/4c/p05-project-lifecycle-and-published-app-access-functional-wireframe.html`
> **Exact artifact identity:** `approved final P8 artifact blob = c8d18c942e7f84a746a6ca959c51f18c27f3b6cd`
> **P12 Family 3 re-locked identity:** `approved app-access-egress P8 delta blob = d00b2126667a0a51317c653c57c237444a129dfb / OPERATOR APPROVED 2026-08-28`
> **Accepted bounded upstream corrections:** `4C-F35..F36`
> **Product implementation authority:** none; `Product implementation = BLOCKED`.

---

## 1. Locked human experience

P-05 locks one Project administration destination organized by human task, not one generic Settings or RBAC console:

```text
Project → Manage
├── App access (default)
│   ├── understand who can use the Published App
│   ├── compare exact active-Release consequences of admin and member
│   ├── find an existing eligible Conexus Account
│   └── add, change or revoke one exact grant
└── Lifecycle
    ├── duplicate into an exact admitted Workspace with fixed NO_DATA composition
    └── archive after acknowledging exact non-effects
```

Locked truth laws:

```text
Control Plane access != Published-App access
Keycloak authenticated identity != Conexus Account admission != app grant
candidate disclosure != Account provisioning != access grant
role label != capability authority
duplicate = new independent Project / NO_DATA
archive != unpublish != stop automations != delete
```

The operator-approved HTML remains low-fidelity Evidence. Its in-artifact `P8 CANDIDATE / NOT LOCKED` proof marker is historical; current LOCK authority lives here and in `docs/roadmap.md`, pinned to the exact blob above.

---

## 2. P9 — shell, route and information roles

P-05 inherits the locked GF-01 Project shell and adds one direct `Manage` destination.

| Surface | Primary information role | Secondary role |
| --- | --- | --- |
| Manage / App access | recognize exact current app users and their roles | add, change or narrow exact grants |
| Role consequences | understand the complete current active-Release subset for `admin|member` | preserve operation identity and regime as decision context |
| Candidate selection | recognize an eligible existing Conexus Account | hand off honestly when provisioning is required |
| Manage / Lifecycle | understand current Project state and consequential actions | duplicate or archive under exact authority |

Navigation law:

```text
Project rail → Manage       = URL_NAVIGATION
App access / Lifecycle      = URL_PERSISTED_LOCAL_LENS
grant and lifecycle dialogs = focused in-route work
missing Account             = trusted provisioning handoff, not Keycloak search
```

---

## 3. Published-App access trace

### 3.1 Current grants and role decision truth

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | I&A / `IAM-14 ListPublishedAppAccess` |
| Scope | exact Project/app under `project.manage` |
| Recognition | canonical `AccountSummary = accountId + displayName + email?` plus exact role |
| Role choice | exactly `admin` and `member` |
| Consequences | complete exact active-Release capability subset: `operationId + name + purpose + regime` |
| Material states | loading, known-empty, denied and dependency failure remain distinct |
| Forbidden | opaque Account ID as primary presentation, browser-composed capabilities, custom role builder, Keycloak role/group/Organization authority |

An empty capability subset is truthful. Capability presentation does not grant invocation and must be recomposed from the exact current active Release whenever IAM-14 is read.

### 3.2 Candidate discovery and provisioning seam

| Contract axis | Locked trace |
| --- | --- |
| Owner/read | I&A / `IAM-21 ListPublishedAppAccessCandidates` |
| Input | exact Project + optional bounded human query + opaque page token |
| Result | currently disclosable existing Conexus Accounts not already granted |
| Non-effect | inclusion in the candidate page grants nothing |
| No match | only provisioned Conexus Accounts are eligible; use the separate trusted provisioning route/operator |
| Forbidden | browser/live Keycloak directory query, provider-identity existence oracle, public invitation/signup, Workspace membership as app-user universe |

The later implementation may realize trusted Account provisioning through a separately admitted least-privileged server-side Keycloak adapter, but P-05 neither requires nor authorizes that mechanism.

### 3.3 Grant, role change and revoke

| Control | Owner operation | Binding/success law |
| --- | --- | --- |
| Grant access | `IAM-15 SetPublishedAppAccess` | exact Project + Account + desired role + explicit expected `ABSENT` |
| Change role | `IAM-15 SetPublishedAppAccess` | exact current grant + expected current `PRESENT/role` + desired role |
| Revoke access | `IAM-17 RevokePublishedAppAccess` | exact Account grant + `expectedRole`; narrowing only |

`412` stale state refuses the decision and requires refresh. `403` denial changes nothing. IAM-15 success returns canonical Account presentation plus the exact current role. Revocation removes only the app grant; it does not delete or deprovision the Conexus Account.

---

## 4. Project lifecycle trace

### 4.1 Duplicate

| Contract axis | Locked trace |
| --- | --- |
| Source truth | `PRJ-02 GetProject` under exact source disclosure |
| Destination summaries | `IAM-01 GetControlPlaneAccessContext` only for currently disclosable Workspace identity |
| Command | `PRJ-06 DuplicateProject` |
| Authority | source `project.manage` + destination `project.create`, rechecked on submit |
| Intake | exact destination Workspace + nonblank name + Idempotency-Key |
| Result | new independent Project with fixed `NO_DATA` composition |
| Not copied | data, credentials, bindings and Published-App grants |
| Forbidden | browser claiming destination eligibility, optional copy toggles, history/fork inheritance |

### 4.2 Archive

| Contract axis | Locked trace |
| --- | --- |
| Current truth | `PRJ-02 GetProject` with exact Project revision/state |
| Command | `PRJ-05 ArchiveProject` |
| Guard | exact `expectedProjectRevision` |
| Confirmation | explicitly acknowledges serving and automation non-effects |
| Stale/denied | no state change; refresh or retain independent denial truth |
| Forbidden | delete, restore/unarchive, implied unpublish, implied automation stop |

When the real intent is to stop serving or automation, the UI must hand off to those exact accepted owners rather than expanding Archive semantics.

---

## 5. Authorization, client state and accessibility

```text
project.manage → IAM-14/15/17/21 + PRJ-05 + source side PRJ-06
project.create → destination side PRJ-06
project.read   → PRJ-02 only where independently granted

project.manage -X-> Published-App business use
app admin      -X-> project.manage
Keycloak claim -X-> Product authorization
```

Independent disclosure failures remain independent: denial of App access administration must not hide an otherwise admitted Lifecycle surface, and vice versa.

```text
SERVER
→ Project state/revision, Account summaries, grants, role consequences,
  candidate inclusion, destination disclosure and all command outcomes

URL_NAVIGATION
→ Manage route + selected task lens

EPHEMERAL_UI
→ open dialog, candidate query/selection, desired role, confirmation checkbox,
  walkthrough scenario and local success message
```

Locked accessibility/responsive obligations:

- semantic task tabs, dialogs, labeled fields, radio groups and buttons;
- Escape closes the top overlay and focus returns to its trigger;
- grant identity and state do not depend on color alone;
- grant rows and lifecycle cards stack on narrow screens;
- mobile navigation replaces the hidden Project rail without horizontal overflow;
- reduced-motion preference is preserved;
- loading, known-empty, denied, dependency failure and stale/current-state conflict remain distinct.

---

## 6. Backend sufficiency and retained reopen seams

P9 found no contradiction invalidating the locked P8. `IAM-14/15/17/21`, `PRJ-02/05/06` and purpose-bound `IAM-01` destination summaries are sufficient after F35/F36.

Explicit deferred seams remain:

1. inviting or onboarding a human who has no Conexus Account;
2. Keycloak Organizations/invitations or a least-privileged Admin REST adapter as a future provisioning mechanism;
3. custom roles, groups, bulk grants, access requests and public sharing;
4. unarchive/restore/delete, which have no admitted Product operations;
5. concrete database/service/runtime realization, which remains 4D/implementation work.

These do not block the lock because the experience represents current F1 truth honestly and does not simulate the deferred capabilities.

---

## 7. P10 — pattern consolidation

Patterns reused because their protected semantics repeat:

```text
GF-01 direct Project route and single shell
W-03 human AccountSummary recognition and purpose-bound candidate disclosure
P-02/P-03 responsive whole-subject presentation + focused dialogs
exact current-state/precondition guard + explicit stale state
consequence-first confirmation for rare material actions
Escape/focus return + URL-persisted task lens
loading != empty != denied != dependency failure
```

Patterns deliberately not generalized:

```text
generic Settings or RBAC console
Workspace People as Published-App access owner
Keycloak directory/role/group/Organization as Product authority
generic invitation/onboarding surface
generic lifecycle CRUD, delete or restore
frontend-composed capability or authorization truth
```

---

## 8. Lock disposition

```text
P-05 P8 = LOCKED / OPERATOR APPROVED
P-05 P9 = EXACT TRACE CLOSED
P-05 P10 = CONSOLIDATED
P11 = NOT ASSEMBLED
PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED
```

Only a named material falsifier may reopen the smallest affected P-05 or upstream owner. This lock does not authorize PA-01, merge or Product implementation.
