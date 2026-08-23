# 4C W-03 — Locked People/access + Audit Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED · P11 LATER ASSEMBLED PRODUCT
> **Block:** `W-03 — People/access + audit`
> **Locked structure:** subject-first People/Areas current-access administration + sibling server-filtered immutable Audit
> **approved P8 artifact blob = 7434c561ef0cfbc43c81ab8dd1f72b13cf032135**
> **Product implementation authority:** none.

The operator explicitly approved the exact functional W-03 P8 after operating the artifact. The approved HTML remains an immutable P8 Evidence snapshot; its in-artifact `CANDIDATE · NOT LOCKED` label is historical and is not rewritten after approval. Current LOCK authority lives in this Screen Contract and the roadmap, pinned to the exact approved blob above.

W-03 closes only the Workspace People/access administration and Workspace Audit interaction proved by the approved artifact. It does not decide Published-App access administration, Project lifecycle, future Workspace Agent catalog, final visual design, production component APIs, SDK/query/cache APIs, router/state implementation or Product code.

---

## 1. Goal / user-flow role

### 1.1 People & access

An authorized Workspace access administrator can complete the current-authority job without opaque-ID UX or browser-owned authorization:

```text
browse human-recognizable Workspace members
→ find an existing Account candidate when adding a member
→ add/remove exact Workspace membership
→ open one exact person in a contextual panel
→ inspect Area memberships + direct Project grants + I&A-derived effective Project access
→ preserve every effective access source as DIRECT and/or AREA
→ add/remove Area membership or direct Project grant
→ refresh exact owner truth after consequential writes
→ close back to the preserved People collection context

OR

browse human-recognizable Areas
→ create Area when separately authorized by workspace.manage
→ open one exact Area in a contextual panel
→ inspect current members + Project grants
→ add/remove exact member or Project grant
→ refresh exact Area owner truth
→ close back to the preserved Areas collection context
```

### 1.2 Audit

An authorized investigator can inspect immutable history without treating one browser page or current resource names as historical authority:

```text
enter Workspace Audit
→ draft period / actor / action filters
→ apply filters through OBS-04 server-side before pagination
→ scan immutable human summaries + append-time actor/subject labels
→ continue through the same filtered query using opaque pageToken
→ open one exact immutable AuditRecord in a contextual panel
→ inspect exact kind/ref coordinates + Evidence
→ close back to the same applied filter/result context
```

Binding split:

```text
current access administration != immutable audit investigation
```

---

## 2. Locked structural baseline

```text
PEOPLE & ACCESS
route page
→ People and Areas are human subject views, not backend endpoint families

People
→ IAM-04 AccountSummary collection
→ local find only over the complete already-disclosed collection
→ Add member uses IAM-18 server candidate search/pagination → IAM-05
→ open exact person
→ contextual person panel
→ IAM-19 WorkspaceMemberAccess
→ Area memberships
→ direct Project grants
→ effective Project access with complete DIRECT | AREA sources
→ exact IAM-06/07/08/09/10 writes
→ re-read owner truth after consequential changes

Areas
→ WS-04 AreaSummary collection
→ Create Area only when workspace.manage admits WS-05
→ open exact Area
→ contextual Area panel
→ IAM-20 AreaAccess
→ exact members + exact Project grants
→ exact IAM-09/10/11/12 writes
→ re-read owner truth after consequential changes

AUDIT
separate sibling route page
→ OBS-04 filters from? / to? / actorQuery? / actionQuery? / projectId? / pageToken?
→ filters apply server-side before pagination
→ AuditRecordSummary uses immutable append-time actor/subject labels
→ open exact record
→ contextual immutable detail via OBS-05
→ Evidence + technical refs remain inspectable
→ no mutation / retry / undo authority
```

Locked properties:

1. `displayName`, optional Account email, Area name and Project name are human presentation only; stable IDs remain exact server-revalidated references;
2. People/Areas are the access-administration mental model; no role grid or grant-record CRUD UI becomes the Product model;
3. effective Project access is I&A-owned `IAM-19` truth and preserves the complete source set; the frontend does not derive authorization from local joins;
4. removing one direct source must not let the browser claim access disappeared when an Area source remains;
5. `workspace.access.manage` may see only the bounded Area/Project summaries needed for access administration; that disclosure does not grant Workspace settings or Project content authority;
6. `Create Area` is separately governed by `workspace.manage`; access administration alone does not gain structure mutation by UI placement;
7. exact person/Area work preserves the surrounding collection context through a contextual panel;
8. Audit is a separate immutable investigation job under `audit.read`, not a mode of current authorization administration;
9. Audit filters operate on the admitted server set before pagination; browser-local filtering of one loaded page never defines the search universe;
10. Audit actor/subject labels are append-time immutable presentation snapshots; current names never rewrite history;
11. Audit exact detail has no edit, retry, undo, fix or authorization-mutation control;
12. Workspace Audit does not invent a cross-Project Project-name picker under `audit.read`; exact `projectId` may be supplied when the user entered from an already-known exact Project context.

Binding laws:

```text
frontend effective-access derivation = FORBIDDEN
browser page != audit search universe
append-time label != current resource lookup
current access administration != immutable audit investigation
```

Not locked by W-03:

```text
final brand / typography / iconography / density
production route spelling
production component APIs
exact cache/query invalidation mechanism
Account profile editing / rename
Area rename/settings / WS-06 resurrection
generic roles / RBAC / custom-role editor
cross-Workspace account directory
cross-Project Audit picker under audit.read
Audit full-text search beyond accepted filters
Published-App access administration
Project lifecycle administration
W-04 Workspace Agent catalog
```

---

## 3. Exact vertical authority trace

| W-03 interaction / truth | Class | Exact accepted authority | Permission / current-state condition | Result |
| --- | --- | --- | --- | --- |
| list current Workspace members | `PRODUCT_READ` | `IAM-04 ListWorkspaceMembers` | `workspace.access.manage`; exact Workspace disclosure | `AccountSummary[]` |
| search/paginate existing membership candidates | `PRODUCT_READ` | `IAM-18 ListWorkspaceMembershipCandidates` | `workspace.access.manage`; server-resolved candidate disclosure | `AccountSummaryPage`; candidate inclusion != membership |
| add exact Workspace member | `PRODUCT_COMMAND` | `IAM-05 AddWorkspaceMember` | `workspace.access.manage`; exact Workspace + Account currentness | membership established |
| remove exact Workspace member | `PRODUCT_COMMAND` | `IAM-06 RemoveWorkspaceMember` | `workspace.access.manage`; exact current membership | membership removed; browser must refresh current access truth |
| inspect one member's current access | `PRODUCT_READ` | `IAM-19 GetWorkspaceMemberAccess` | `workspace.access.manage`; exact current member | Account + Areas + direct Projects + I&A-derived effective Projects with all sources |
| list Areas for access administration | `PRODUCT_READ` | `WS-04 ListAreas` | alternate summary-only route under `workspace.access.manage` | `AreaSummary[]`; no Workspace structure mutation |
| create an Area | `PRODUCT_COMMAND` | `WS-05 CreateArea` | `workspace.manage`; exact Workspace; `Idempotency-Key` | new `AreaSummary`; no rename/update authority implied |
| list Projects for grant administration | `PRODUCT_READ` | `PRJ-01 ListProjects` | alternate summary-only route under `workspace.access.manage` | contained `ProjectSummary[]`; no Project content authority |
| grant/revoke direct Account→Project access | `PRODUCT_COMMAND` | `IAM-07 GrantAccountProjectAccess` / `IAM-08 RevokeAccountProjectAccess` | `workspace.access.manage`; exact contained Project + Account | direct source changes; re-read IAM-19 before claiming effective access |
| add/remove Area membership | `PRODUCT_COMMAND` | `IAM-09 AddAreaMember` / `IAM-10 RemoveAreaMember` | `workspace.access.manage`; exact Workspace/Area/Account | Area membership changes; effective access remains owner-derived |
| inspect exact Area access | `PRODUCT_READ` | `IAM-20 GetAreaAccess` | `workspace.access.manage`; exact Area | Area + human members + current Project grants |
| grant/revoke Area→Project access | `PRODUCT_COMMAND` | `IAM-11 GrantAreaProjectAccess` / `IAM-12 RevokeAreaProjectAccess` | `workspace.access.manage`; exact Area + contained Project | Area grant changes; affected member effective truth requires IAM-19 when displayed |
| list/filter/paginate immutable Audit | `PRODUCT_READ` | `OBS-04 ListAuditRecords` | `audit.read`; exact Workspace disclosure; admitted filters before pagination | `AuditRecordPage` with human immutable summaries/snapshots |
| inspect exact immutable Audit record | `PRODUCT_READ` | `OBS-05 GetAuditRecord` | `audit.read`; exact Workspace + AuditRecord disclosure | exact immutable record + Evidence refs |

### 3.1 People/current-access chain

```text
IAM-04
→ human Workspace member collection

open exact member
→ IAM-19
→ current Areas + directProjects + effectiveProjects[]
→ each effective Project carries complete sources[]
→ DIRECT and/or AREA + exact AreaSummary
```

The browser may explain this returned projection but never rebuild it from `IAM-07..12` records.

### 3.2 Consequential-write refresh law

```text
IAM-06/07/08/09/10 succeeds
→ do not infer final effective access in browser
→ refresh IAM-19 when exact person effective access is displayed

IAM-09/10/11/12 succeeds in exact Area context
→ refresh IAM-20 for exact Area state
→ re-read IAM-19 separately when an affected person's effective access is displayed
```

Optimistic interaction may acknowledge that a command was submitted/succeeded only when the server operation succeeds; it may not fabricate the resulting current authorization projection.

### 3.3 Audit investigation chain

```text
filter draft
→ from / to / actorQuery / actionQuery (+ exact projectId only when already known)
→ OBS-04
→ server applies admitted filters before pagination
→ AuditRecordPage
→ nextPageToken continues the same admitted query

open exact auditRecordId
→ OBS-05
→ immutable actor/subject snapshot labels + exact kind/ref + summary + Evidence
```

---

## 4. Identity / decision-subject law

```text
workspaceId = untrusted Workspace reference; server rechecks containment/disclosure
accountId = stable Conexus Account identity; presentation never replaces it
Account.displayName / email? = human presentation only
areaId = exact Area reference; Area.name = presentation only
projectId = exact contained Project reference; ProjectSummary disclosure != Project content authority
auditRecordId = exact immutable AuditRecord reference; possession != disclosure authority
AuditSubjectSnapshotRef.kind/ref = exact historical technical coordinates
AuditSubjectSnapshotRef.label = immutable append-time presentation Evidence
```

Negative laws:

```text
displayName/email/Area.name/Project.name -X-> authorization
visible control -X-> Permission
Workspace membership -X-> every Project grant
Area membership -X-> browser-derived effective Project access
DIRECT revoke -X-> proof that effective access ended
workspace.access.manage -X-> project.read
workspace.access.manage -X-> workspace.manage
current Account/Area/Project name -X-> Audit historical label
Audit record -X-> current owner state
audit.read -X-> mutation authority
```

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| current Workspace member collection | `SERVER` | `IAM-04`; labels are presentation, membership is current owner truth |
| membership candidate pages | `SERVER` | `IAM-18`; query/pageToken apply to server-disclosable candidate set |
| exact member access projection | `SERVER` | `IAM-19`; effective access + complete source set never independently owned by browser |
| Area collection / exact Area access | `SERVER` | `WS-04` / `IAM-20` |
| access-admin Project summaries | `SERVER` | narrow `PRJ-01` disclosure only |
| Audit result page / exact record | `SERVER` | `OBS-04/05`; immutable audit projection |
| People vs Areas subview | `URL_NAVIGATION` | preserves re-entry/back-forward while creating no Product truth |
| exact selected person / Area | `URL_NAVIGATION` | untrusted subject reference; server revalidates disclosure/currentness |
| exact selected Audit record | `URL_NAVIGATION` | untrusted immutable reference; server revalidates disclosure |
| applied Audit filter set = URL_NAVIGATION | `URL_NAVIGATION` | period/actor/action/exact known Project scope preserved for investigation re-entry |
| membership candidate query = FORM_DRAFT | `FORM_DRAFT` | caller input until IAM-18 request; never Account identity |
| Area creation name | `FORM_DRAFT` | untrusted until WS-05 succeeds |
| Audit filter draft | `FORM_DRAFT` | validated locally for usability, server remains authority for accepted query |
| exact add/remove/grant/revoke selection | `FORM_DRAFT` | exact current subject/resource choice before command |
| local disclosed-list filter = EPHEMERAL_UI | `EPHEMERAL_UI` | filters only the complete already-disclosed non-paginated collection |
| contextual panel / modal open-close | `EPHEMERAL_UI` | presentation state unless exact selected subject is represented in URL navigation |
| technical-detail expansion | `EPHEMERAL_UI` | disclosure only |

No fifth state class is justified.

Opaque `pageToken` remains a server-issued continuation coordinate for the same admitted query; it is never business truth or authorization.

---

## 6. Generated transport custody

All W-03 Product network interaction follows:

```text
accepted 4A I&A / Workspace / Project-summary / OBS semantics
→ canonical 4B Product OAS
→ GENERATED transport/type projection
→ W-03 consumer
```

W-03 does not select the final generator, SDK wrapper, query/cache library, router or state store. Handwritten screen-specific `Account`, grant, effective-access or Audit DTOs that widen/narrow the canonical schemas are forbidden.

People/Areas tabs, local disclosed-list find, contextual panel behavior, confirmations and filter-form draft state require no synthetic Product endpoint.

---

## 7. Material state / failure / recovery obligations

### Current reads — IAM-04/18/19/20, WS-04, PRJ-01, OBS-04/05

Preserve:

```text
loading
!= known-empty
!= 401 unauthenticated
!= 403 denied
!= 404 absent/non-disclosable exact subject/scope where applicable
!= transport/dependency failure
```

A failed current access read cannot fall back to old fixture/form state as current authorization.

### Membership / grant writes — IAM-05..12

Preserve operation-specific `401/403/404/409` outcomes. A failed mutation must not change the visible current authorization projection optimistically. After successful consequential writes, refresh the applicable `IAM-19` and/or `IAM-20` owner read before claiming final access truth.

Narrowing one source must retain other sources returned by I&A; the browser never converts “direct grant removed” into “no access” without new owner truth.

### Area creation — WS-05

Requires `workspace.manage` and `Idempotency-Key`. Preserve `401/403/404/409/422`. Failure creates no local durable Area. Success returns `AreaSummary`; no update/rename operation is inferred.

### Audit list — OBS-04

Preserve `401/403/404/422`. Local `from < to` validation is usability only; server validation remains authoritative. A failed filter request must not silently filter the already-loaded page and present that as whole-audit results.

`pageToken` continues the same server-filtered query; changing applied filters resets the continuation chain.

### Audit exact detail — OBS-05

Preserve `401/403/404`. Failure to load detail leaves the immutable collection/filter context intact; it never fabricates current owner state or a repair action.

---

## 8. Authentication / authorization boundary

```text
Keycloak/OIDC authentication
→ Conexus Account/session
→ exact current Workspace membership/grants
→ exact Permission + scope/current subject
```

Presentation never authorizes:

```text
visible People & access nav != workspace.access.manage
visible People/Areas data != permission to mutate it
visible Create Area != workspace.manage
workspace.access.manage != workspace.manage
workspace.access.manage != project.read
visible Audit nav != audit.read
append-time Audit label != current identity authority
```

`WS-04` and `PRJ-01` alternate access-administration disclosures are summary-only. `workspace.access.manage` never becomes a generic Workspace/Project read Permission.

Audit remains read-only under `audit.read`; current access mutations still use I&A operations and current owner facts.

---

## 9. Responsive / accessibility structural obligations

Locked obligations:

- inherit the GF-01 Workspace shell/context grammar;
- People and Areas remain explicit textual subviews, keyboard reachable and not color-only;
- Account, Area and Project human identities are textual; technical IDs may be progressively disclosed;
- DIRECT versus AREA provenance is explicit text, and multiple sources remain separately perceivable;
- opening person/Area/Audit detail moves focus into the contextual panel and closing returns focus to the triggering subject/control when possible;
- narrow layouts may promote the contextual side panel to a full-width sheet without changing semantic owner or actions;
- destructive/narrowing controls are distinguishable without color alone and retain explicit action labels;
- Audit period/actor/action inputs have persistent labels and invalid-period errors are associated/readable;
- Audit table may transform to stacked records on narrow layouts while preserving time, summary, actor/action/subject meaning;
- Evidence and technical refs remain keyboard/screen-reader reachable without dominating routine scanability.

Exact pixel breakpoints and production component APIs remain later realization details.

---

## 10. Forbidden frontend authority

W-03 forbids:

```text
frontend-owned authorization
generic RBAC / custom-role editor
Keycloak roles/groups/orgs mirrored as Conexus access authority
frontend effective-access joins or inference
screen-shaped GetAccessDashboard
grant-record CRUD domain
optimistic claim that effective access ended after one source was removed
workspace.access.manage widened into workspace.manage or project.read
WS-06 UpdateArea resurrection
browser-local Audit page filtering as whole-search
SearchAudit operation
current-name lookup rewriting append-time Audit labels
Audit mutation / retry / undo / fix controls
Audit fact treated as current owner truth
generic Event/search owner
```

---

## 11. P10 bounded interaction-pattern consolidation

The W-02B operator finding first proved that routine exact-subject work becomes unnecessarily heavy when each maintenance/read task replaces the collection context. W-03 independently proves the same protected behavior across Person, Area and Audit detail, with different owners/Permissions and with both mutable-current and immutable-read-only consumers.

Therefore one semantic interaction pattern now graduates:

### `context-preserving exact-subject panel`

Use only when all are true:

```text
collection/browse context is materially useful to preserve
an exact server-owned subject is selected
focused detail/work is bounded to that subject
panel does not become a semantic owner
server truth remains the exact owner read
consequential writes remain exact Product operations
post-write current truth is re-read from the owner
close returns to the preserved collection/focus context
narrow layout may become full-width sheet without semantic change
```

This is a pattern vocabulary, not an implementation abstraction.

It explicitly does **not** graduate:

```text
GenericDrawer component API
shared resource editor
universal details endpoint
shared store/hook/cache layer
cross-owner DTO
universal status/confirmation model
one authorization wrapper for all panels
```

Those implementation choices remain 4D work and must be derived from all locked consumers rather than this name alone.

```text
P10 graduated shared patterns = 1
P11 = LATER ASSEMBLED PRODUCT
```

---

## 12. Closure disposition

```text
W-03 = LOCKED / OPERATOR APPROVED
P8 approved artifact = 7434c561ef0cfbc43c81ab8dd1f72b13cf032135
P9 exact Screen Contract = CLOSED
P10 pattern pass = CLOSED / 1 graduated shared semantic pattern
P11 = LATER ASSEMBLED PRODUCT
W-04 = NEXT / NOT OPEN
```

Only a later material falsifier may reopen the smallest affected W-03 scope. W-04/P-01+, P11, 4D, merge and Product implementation are not authorized by this closure.
