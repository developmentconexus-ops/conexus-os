# 4C P-05 — Project Lifecycle + Published-App Access Authority Feasibility + Structural Hypotheses

> **Status:** `P-05 LOCKED / OPERATOR APPROVED / P9 EXACT TRACE CLOSED / P10 CONSOLIDATED`
> **Block:** `P-05 — bounded Project lifecycle + Published-App access administration`.
> **Leading hypothesis:** `A — one Project Management route with Access and Lifecycle task lenses` (operator-approved for P8 realization).
> **Methods:** DevelopmentConexus Engineering Method v1.0.0 + Frontend Product Experience Planning Method v2.3.
> **Product implementation authority:** none.

## 1. Decision question

What is the smallest coherent Project-management experience in which an eligible human can administer exact Published-App access and perform the two admitted Project lifecycle actions without creating generic Settings, generic RBAC, destructive deletion, frontend authorization or a false equivalence between Control-Plane and Published-App authority?

P-05 treats current Product/wire authority as a falsifiable baseline. Under the frontend method, functional P8 cannot begin while a material access decision depends on opaque Account identity, undiscoverable grant subjects or unexplained role consequences.

## 2. P0 — bounded authority pack

### 2.1 Semantic owners

```text
Project
→ exact Project identity/revision/archive state
→ ArchiveProject lifecycle transition
→ DuplicateProject source-to-destination creation composition

I&A
→ iam.account human presentation
→ current Published-App grants and role {admin, member}
→ grant/set/revoke concurrency and disclosure

Release + exact Project operation declarations
→ current active-Release business capabilities admitted to each app role

server authorization
→ current project.manage / project.create / exact scope checks
→ browser visibility never grants authority
```

No generic Project settings owner, role builder, invitation system, public sharing mode or delete operation is admitted.

### 2.2 Human-facing operations

```text
PRJ-02 GetProject
PRJ-05 ArchiveProject
PRJ-06 DuplicateProject
IAM-01 GetControlPlaneAccessContext
IAM-14 ListPublishedAppAccess
IAM-15 SetPublishedAppAccess
IAM-17 RevokePublishedAppAccess
```

Relevant owner reads may be linked, not absorbed:

```text
REL-07 current serving truth
PAR-11 current Agent triggers when separately disclosed
```

Explicit exclusions:

```text
PRJ-04 UpdateProject = subtracted
DeleteProject / RestoreProject / UnarchiveProject = no admitted operation
Archive -X-> unpublish / stop serving / stop existing automations
Duplicate -X-> copy business data / credentials / bindings / current authorization / runtime history
app access -X-> Workspace membership / Project access / Builder access / effect approval
Keycloak role/group -X-> Conexus app grant
```

### 2.3 Permission and current-state boundaries

```text
PRJ-02 → project.read
PRJ-05 → project.manage + expectedProjectRevision
PRJ-06 → source project.manage + destination project.create + Idempotency-Key
IAM-14/15/17 → project.manage
IAM-15 → expectedCurrent = ABSENT | PRESENT(role)
IAM-17 → expectedRole
```

The UI may explain and preflight. Every command still rechecks exact current authority and stale subject server-side.

## 3. P1 — actors, jobs and user needs

### J1 — know who can use the Published App

As a Project manager, I need to recognize each person with app access and their exact current role so that access review is about humans rather than opaque IDs.

### J2 — grant or change access safely

As a Project manager, I need to find an eligible existing Account, understand what `admin` and `member` mean for this exact active app, and set one expected current grant state so that a stale browser cannot overwrite a concurrent decision.

### J3 — revoke access safely

As a Project manager, I need to confirm the exact person and current role being revoked so that narrowing remains deliberate and stale-role changes fail visibly.

### J4 — duplicate a Project with honest copy boundaries

As a Project manager, I need to choose an exact disclosed destination Workspace and a new Project name, then understand that source/code/contracts are copied while business data, credentials, bindings, current authorization and runtime history are not.

### J5 — archive without believing runtime stopped

As a Project manager, I need to understand that archive freezes ordinary authoring/future expansion but does not unpublish or stop existing automations so that I can separately operate the real Release/Agent owners when shutdown is intended.

## 4. P2 — end-to-end flows

### F1 — Published-App access review and grant

```text
Project → Manage → App access
→ scan human-recognizable current grants
→ inspect exact role impact for the currently active app
→ find one currently disclosable existing Account
→ select role
→ confirm expected ABSENT state
→ I&A admits or rejects current-state command
→ refresh exact grant truth
```

### F2 — change or revoke an existing grant

```text
open exact human-recognizable grant
→ compare current role with intended role/removal
→ submit expected PRESENT(role) or expectedRole
→ success refreshes I&A truth
→ 412 preserves local intent but forces explicit re-review of current truth
```

### F3 — duplicate

```text
Project → Manage → Lifecycle → Duplicate
→ explain fixed copy/no-copy boundary
→ choose disclosed destination Workspace + explicit new name
→ submit idempotent PRJ-06
→ owner returns new source-complete Project + businessDataPolicy=NO_DATA
→ continue in the new Project
```

### F4 — archive

```text
Project → Manage → Lifecycle → Archive
→ explain freeze and explicit non-effects
→ confirm exact Project identity
→ submit expectedProjectRevision
→ owner archives or rejects stale state
→ shell visibly enters archived posture
→ links lead to Release/Agent owners when stop/unpublish is the real intent
```

## 5. P3 — bounded coverage matrix

| Human surface | Read truth | Material write | Required states |
| --- | --- | --- | --- |
| Project management frame | `PRJ-02` | none | active, archived, denied, failed |
| app grants | `IAM-14` | none | human identity, role, empty, denied, failed |
| add/change grant | candidate disclosure + role decision truth | `IAM-15` | absent/present, searching, no match, stale `412`, validation, denied |
| revoke grant | exact current grant | `IAM-17` | current role, stale `412`, denied, success |
| duplicate | `PRJ-02` + `IAM-01` destination summaries | `PRJ-06` | fixed copy policy, validation, denied destination, conflict, accepted |
| archive | `PRJ-02`; owner links as separately disclosed | `PRJ-05` | active, archived, stale revision, denied, explicit non-effects |

Independent disclosure failures remain independent. App-access denial must not hide an otherwise authorized lifecycle surface, and vice versa.

## 6. P6 — conditional reference study

References are task-pattern Evidence only; their authorization models do not become Conexus authority.

### 6.1 Vercel project roles and protected-deployment access

**Source observation:** Vercel separates team/project roles and manages protected-deployment access per project, including exact users and access requests. Sources: [Access Roles](https://vercel.com/docs/rbac/access-roles) and [Vercel Authentication](https://vercel.com/docs/deployment-protection/methods-to-protect-deployments/vercel-authentication).

**Inference:** access administration must expose recognizable subjects, exact scope and understandable consequences. Platform collaboration and app-use access should not be collapsed merely because another product couples them.

**Disposition:** human identity, exact scope and role consequence are relevant. Vercel role vocabulary, access requests, shareable links and inherited team authority are `REJECTED — different Product authority`; Conexus preserves independent Published-App grants and private F1 ingress.

### 6.2 GitHub archive

**Source observation:** GitHub places archive in a consequential settings area, explains effects, requires explicit identity confirmation and makes its repository read-only. Source: [Archiving repositories](https://docs.github.com/en/repositories/archiving-a-github-repository/archiving-repositories).

**Inference:** archive belongs behind progressive disclosure with consequence-first confirmation, but its exact effects must come from the owning Product.

**Disposition:** progressive disclosure and explicit consequence confirmation are relevant. GitHub read-only/unarchive semantics are `REJECTED — Conexus archive has different accepted effects and no admitted unarchive operation`.

### 6.3 GitHub templates

**Source observation:** creating from a template establishes a new independently named destination and distinguishes copied source structure from inherited history/authority. Source: [Creating a repository from a template](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-repository-from-a-template).

**Inference:** duplication should be framed as creating a new Project from source, not cloning runtime identity or authority.

**Disposition:** explicit destination/name and copy-boundary explanation are relevant. Template/fork/history options are `REJECTED — PRJ-06 has one accepted fixed NO_DATA composition`.

### 6.4 Mitra app-user profiles

**Source observation:** Mitra separates the published-app user from the builder, lets privileged SDK operations associate users with Profiles and lets a Profile disclose allowed server functions, selectable tables and a home screen. Its project-code self-signup also makes a new app user independently from the development workspace. However, the studied realization can continue without a configured Profile, grants Workspace Owner/Admin implicit developer entry to every Project and couples app-user and agent constraints through the same Profile mechanism. Sources: [`docs/research/mitra/full-study.md`](../../research/mitra/full-study.md), [`docs/research/mitra/influence-on-conexus.md`](../../research/mitra/influence-on-conexus.md) and [`docs/research/mitra/index.md`](../../research/mitra/index.md).

**Inference:** the strong Product lesson is not Mitra's Profile model. It is that app access must be a first-class human administration job: recognizable people, a clear difference between builder and final user, and inspectable consequences before assignment. Access must fail closed when no exact grant exists.

**Disposition:** the builder/final-user separation, human-recognizable selection and consequence disclosure are `ADAPTED`. Project-code self-signup, implicit Owner/Admin entry, optional/fail-open Profile enforcement, public execution and a generic Profile/RBAC builder are `REJECTED — conflict with current F1 ingress, explicit Conexus grants and sovereign authorization`. Agent authority remains the accepted intersection of human/app authority and exact agent authority, not one Mitra-style Profile owner.

### 6.5 Keycloak 26.x identity and administration capabilities

**Source observation:** current Keycloak documentation exposes server-side Admin REST user search, Organizations and invitations, group/role mappings, service accounts and fine-grained administrative permissions. Keycloak Authorization Services can also model resources, scopes and policies. Sources: [Keycloak Server Administration Guide](https://www.keycloak.org/docs/latest/server_admin/), [Admin REST API](https://www.keycloak.org/docs-api/latest/rest-api/index.html) and [Authorization Services Guide](https://www.keycloak.org/docs/latest/authorization_services/index.html).

**Conexus authority check:** C-015 already selects Keycloak as the self-hosted OIDC identity provider while keeping Conexus sovereign over `iam.account`, Workspace membership, Project grants, Published-App access and Product authorization. Realm/client roles, groups, Organizations and Authorization Services therefore cannot become Published-App authority. See [`docs/development/production-realization-guide.md`](../../development/production-realization-guide.md) and [`docs/reference/security-and-authority.md`](../../reference/security-and-authority.md).

**Disposition:** Keycloak authentication and exact verified `(issuer, subject)` continuity are `PRESENT-IN-AUTHORITY`. A server-side, least-privileged Keycloak administration adapter may support the separate trusted Account-provisioning job when its realization is admitted; it is not required by P-05. Browser-side Keycloak directory search, Keycloak role/group/Organization-driven app grants and live Admin REST search by a Project manager are `REJECTED` for current F1: they would disclose provider identities across the wrong scope, couple P-05 to provider availability and silently merge Account admission with app authorization.

The resulting responsibility chain is:

```text
Keycloak authenticated subject
→ trusted Conexus Account provisioning/mapping
→ existing iam.account
→ Conexus Published-App grant (admin | member)
→ active Release capability consequences

Keycloak identity/role/group/organization -X-> Published-App grant
candidate disclosure -X-> Account admission or access grant
```

## 7. P7 feasibility — accepted upstream findings

### 7.1 `4C-F35` — Published-App grants and grant candidates are not human-operable

Evidence:

```text
IAM-14 items = accountId + role
IAM-15 response = accountId + role
IAM-15 request requires caller-selected accountId
no exact Published-App grant-candidate read exists
AccountSummary exists, but only workspace membership/access reads expose it
Published-App access is independent from Workspace membership
```

Root cause: the access owner admits exact machine mutation subjects but does not expose the bounded human presentation/discovery needed for this different administration job. Reusing `IAM-18` would silently collapse Published-App access into Workspace membership disclosure.

Target invariant:

```text
every displayed/mutated app grant
→ exact stable accountId
+ I&A-owned displayName/email? presentation
+ server-resolved current Project/app disclosure

candidate visibility -X-> grant
presentation -X-> identity or authorization
```

Credible alternatives:

1. **Enrich `IAM-14/15` with `AccountSummary` and add one purpose-bound paged candidate read over existing Conexus Accounts.** Preserves I&A ownership, independent app authority and the Keycloak/Conexus boundary. **Recommended Global Maximum.**
2. Reuse Workspace members/candidates. Smaller locally, but incorrectly makes Workspace membership the app-user universe and leaks a different disclosure purpose. `REJECTED`.
3. Accept/paste raw Account ID. Technically executable, humanly unsafe and incompatible with professional access review. `REJECTED`.
4. Add email invitation/public signup now. Introduces identity invitation/onboarding authority without an accepted F1 consumer. `DEFERRED`.
5. Search Keycloak live or map Keycloak roles/groups/Organizations directly to app access. Looks integrated, but conflates provider identity discovery, Account admission and Product authorization; adds provider availability and disclosure coupling; and contradicts C-015. `REJECTED`.

Recommended selected realization if operator-approved:

```text
IAM-14 current grants
→ account: AccountSummary + role

IAM-15 success
→ projectId + account: AccountSummary + role

IAM-21 ListPublishedAppAccessCandidates
→ exact Project + bounded q/pageToken
→ query I&A-owned iam.account only; never the Keycloak directory from the browser
→ currently disclosable existing Conexus Accounts not already granted
→ AccountSummaryPage
→ project.manage; candidate inclusion grants nothing

no candidate match
→ state truthfully that only provisioned Conexus Accounts are eligible
→ point to the separate trusted Account-provisioning route/operator
→ do not imply that a Keycloak identity does or does not exist
```

No new Permission, principal, role, owner, trust boundary or durable record class is required. One exact I&A read would be added to the Product/wire census.

This preserves an intentional F1 seam. If future Evidence proves that a Project manager must invite a person who has no Conexus Account, reopen identity onboarding as its own authority question. Keycloak Organizations/invitations or a least-privileged server-side Admin REST adapter may then be evaluated as provisioning mechanisms, but successful provisioning must still produce one mapped Conexus Account before any separate app grant can exist.

**Operator adjudication:** `APPROVED / PRESENT-IN-AUTHORITY`. The selected realization is now canonical in the Product operation ledger, human-context identity contract, Permission contract and executable Product wire. `IAM-21` is the one added I&A read; `IAM-14/15` carry canonical Account presentation.

### 7.2 `4C-F36` — the role choice has no human decision truth

Evidence:

```text
IAM-15 accepts role = admin | member
Ops(R) declares the exact admitted Published-App role subset per operation
IAM-14 exposes neither role meaning nor current active-app capability impact
PRJ-16 capability inspection is separately project.read and omits app-role subsets
project.manage does not imply project.read
```

Root cause: role enforcement exists, but the access-administration read does not expose the exact current consequence the manager must understand before assigning a role.

Target invariant:

```text
role decision presentation
→ server-composed from exact active Release operation declarations
→ human capability name/purpose + role subset
→ inspectable under the same narrow Project/app administration authority

frontend -X-> infer role capability from labels, routes or hidden controls
```

Credible alternatives:

1. **Enrich `IAM-14` with exact active-app `roleOptions` and bounded human capability summaries derived from Release declarations.** Reuses the existing access-administration read and preserves I&A + Release ownership. **Recommended Global Maximum.**
2. Hardcode “Admin has more access.” False for apps where current declared subsets are equal or differ by exact business operation. `REJECTED`.
3. Require separate `project.read` and compose `PRJ-16` in the browser. Violates independent Permission composition and still lacks role subsets. `REJECTED`.
4. Create a generic role/permission builder. Unsupported generality and duplicate authorization authority. `REJECTED`.

Recommended selected realization if operator-approved:

```text
IAM-14 roleOptions[]
→ role = admin | member
→ capabilities[] = operationId + human name + purpose + regime
→ derived from exact current active Release declarations
→ empty is truthful when that role currently admits no business capability

Keycloak roles/groups/organizations/token claims
-X-> role option, capability consequence or app grant
```

This is presentation/disclosure for an existing decision, not a new role engine or grant authority.

**Operator adjudication:** `APPROVED / PRESENT-IN-AUTHORITY`. `IAM-14` now carries the exact two role options and their complete current active-Release capability consequences. Keycloak authorization constructs remain excluded.

## 8. Non-blocking dispositions

```text
archive = PRESENT-IN-AUTHORITY
→ PRJ-02 + PRJ-05 provide exact identity/revision/state
→ confirmation must state archive does not unpublish or stop automations

duplicate = PRESENT-IN-AUTHORITY
→ PRJ-06 provides destination/name, idempotency and NO_DATA result
→ IAM-01 supplies disclosed Workspace identities; PRJ-06 rechecks project.create
→ the UI must not label every disclosed Workspace as eligible before submit

unarchive/restore/delete = REJECTED — no admitted Product operation
invitation/public sharing/access requests = DEFERRED — no current F1 authority
groups/bulk grants/custom roles = DEFERRED — no proven current consumer
generic Project Settings = REJECTED — endpoint/module symmetry is not IA
```

## 9. P7 — structural hypotheses

### A — one Project Management route with Access and Lifecycle task lenses — leading

```text
Project → Manage
├── App access  (default; repeated administration job)
│   ├── role consequence summary
│   ├── searchable human grant table/cards by responsive density
│   └── contextual add/edit/revoke dialog or drawer
└── Lifecycle   (rare consequential actions)
    ├── Duplicate Project
    └── Archive Project
```

Strengths: task language, independent permissions/states, progressive disclosure, consequence separation, responsive table→stack viability and no generic Settings promise.

Risk: a single route contains two semantic owners. Mitigation: task lenses, owner-specific reads/writes and independent denial/error states; visual proximity does not merge authority.

### B — put app access in Workspace People and lifecycle in Project settings — rejected

This mirrors common administration topology but wrongly suggests Published-App users must be Workspace members and creates generic Settings symmetry unsupported by current Product scope.

### C — place both as cards on Project overview — rejected

Fast to discover, but frequent access review and rare consequential lifecycle actions compete with operational Project state. It scales poorly and weakens progressive disclosure.

### 9.1 Data and interaction feasibility

```text
Project identity/revision/archive state = PRESENT-IN-AUTHORITY
Archive command/current-state guard = PRESENT-IN-AUTHORITY
Duplicate destination/name/idempotency/NO_DATA = PRESENT-IN-AUTHORITY
Current app grant machine truth = PRESENT-IN-AUTHORITY
Grant human presentation + candidate discovery = PRESENT-IN-AUTHORITY — F35 / IAM-14, IAM-15, IAM-21
Exact current role consequence = PRESENT-IN-AUTHORITY — F36 / IAM-14
Responsive/accessibility structure for hypothesis A = PLAUSIBLE
```

## 10. Current decision and exact continuation

```text
P-05 = LOCKED / OPERATOR APPROVED
P0-P7 = COMPLETE
leading hypothesis A = OPERATOR APPROVED FOR P8
F35 + F36 = OPERATOR APPROVED / PRESENT-IN-AUTHORITY
Global Maximum comparison = CURRENT STRUCTURE CONFIRMED + BOUNDED CORRECTION
Keycloak = authentication/provider identity; not Product authorization
Mitra = UX/task evidence only; Profile authority not adopted
P8 HTML = LOCKED / approved blob c8d18c942e7f84a746a6ca959c51f18c27f3b6cd
P9 = EXACT TRACE CLOSED
P10 = CONSOLIDATED
P-04 and all prior locks = PRESERVED
PA-01 / BUD-01 / P11 / 4D / Product implementation = NOT AUTHORIZED
```

Bounded proof and candidate realization:

```text
4A↔4B = 127↔127 GREEN
IAM/Workspace closure = 24 operations GREEN
P-05 targeted P8 = RED missing HTML → GREEN 7/7
browser walkthrough = add grant + role consequence + duplicate + archive GREEN
responsive 720px = mobile navigation visible / rail hidden / no horizontal overflow
console errors = 0
```

The former operator walkthrough gate is satisfied by the explicit lock recorded below. P8 remains functional low-fidelity Evidence and never becomes Product authority.

## 11. Operator LOCK closure

The operator explicitly approved the exercised functional candidate. The exact accepted artifact is:

```text
approved final P8 artifact blob = c8d18c942e7f84a746a6ca959c51f18c27f3b6cd
P-05 P8 = LOCKED / OPERATOR APPROVED
P-05 P9 = EXACT TRACE CLOSED
P-05 P10 = CONSOLIDATED
```

The [P-05 Screen Contract](p05-project-lifecycle-and-published-app-access-screen-contract.md) now owns the locked bidirectional frontend↔backend trace and consolidated reusable-pattern disposition. The HTML remains Evidence only. PA-01, BUD-01, P11, 4D, merge and Product implementation remain unauthorized.
