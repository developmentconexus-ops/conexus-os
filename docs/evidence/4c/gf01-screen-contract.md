# 4C GF-01 — Locked Screen Contract

> **Status:** `LOCKED BASELINE / PRE11-F03 DELTA RE-LOCKED / P12 FAMILY 1 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED` · P9/P10 consolidated
> **Block:** `GF-01` — global Control Plane frame + Workspace/Project navigation
> **Locked structure:** H1-R2 — single adaptive rail + breadcrumb-switcher + contextual assistant seam
> **approved P8 artifact blob = 2d899d00484c41c927829bd9f529d3a870159db3**
> **approved Account/session delta P8 artifact blob = e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3**
> **P12 Family 1 approved P8 delta blob = 603b47ccaba1fe6557e557b48efa4f40207d3724**
> **Product implementation authority:** none.

The operator approved the exact H1-R2 browser artifact on 2026-08-22. The approved baseline identity remains pinned to `2d899d00484c41c927829bd9f529d3a870159db3`; the bounded Account/session revision is pinned separately to `e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3`. Both are the same canonical GF-01 HTML lineage: the later blob adds only the approved topbar Account/session interaction, while the H1-R2 shell remains structurally preserved. The in-artifact `CANDIDATE` label is not rewritten after approval; `LOCKED` authority lives in this record and the structural records.

This contract closes only the global shell. It does not lock the internal composition of Projects, Build, Data, Capabilities, Integrations, Agents, Brain, Releases, Activity, Settings, the contextual assistant content, or any Published Application.

`4C-PRE11-F03` reopened only the Account/session interaction already traced to `IAM-02`: the canonical P8 Account control was not operable. The single-rail hierarchy, breadcrumb/context structure, responsive shell and assistant seam remain locked. The bounded delta now makes exact Conexus-session exit operable and composes with the separate future `T-01 Trusted setup / first access` block; it adds no generic Account settings/profile surface.

The operator operated and explicitly LOCKED the bounded delta on 2026-08-27. Its P8 candidate remains the canonical HTML artifact above, with fixture-only outcome controls outside the ordinary Product surface. This lock does not reopen the H1-R2 shell or authorize a second Account/profile owner.

---

## 0. Bounded Account/session delta — P8/P9 closure

The bounded delta adds one topbar Account interaction to the already locked frame:

```text
Account trigger
→ canonical IAM-01 AccountSummary
→ non-modal Account menu
   displayName
   email? secondary
   accountId progressive technical disclosure
   Sign out of Conexus
```

The menu is identical in Workspace and Project scope. Opening it closes any breadcrumb menu or navigation drawer and changes no rail, breadcrumb, assistant seam or destination. The P8 artifact's scenario controls are fixture-only review controls and are not Product authority.

### 0.1 P9 exact bidirectional trace

| Account/session region or control | Information / action role | Owner and exact authority | Identity / state ownership | Material result and failure intent | Forbidden frontend authority |
| --- | --- | --- | --- | --- | --- |
| Account trigger + menu open/close | recognize current Account; local disclosure | `IAM-01 GetControlPlaneAccessContext` supplies the current server projection; open/close is `LOCAL_UI` | canonical `AccountSummary` is `SERVER`; menu open state is `EPHEMERAL_UI` | open/close is presentation only; opening never invokes `BLD-16` | client Account/session store; generic Account read Permission |
| Account identity | human recognition before technical detail | `IAM-01` `account: AccountSummary` with required `accountId` + `displayName`, optional `email` | `displayName`/`email` are server presentation projection; `accountId` is stable technical identity | optional email may be absent; browser never substitutes Keycloak claims | profile editor; claims/roles/groups; editable identity registry |
| Technical identity disclosure | progressive technical disclosure | `IAM-01` `AccountSummary.accountId` | disclosure is `EPHEMERAL_UI`; value remains server-projected | exposes exact Account ID without changing routing or authorization | name-derived identity or authorization |
| Sign out of Conexus | end the exact current Conexus session | `IAM-02 EndSession` — `DELETE /api/session`; authenticated exact current opaque Conexus session | session validity is `SERVER`; pending/status presentation is `EPHEMERAL_UI` | `204` removes protected shell and reaches `AUTHENTICATION_REQUIRED`; no global Keycloak SSO logout claim | duplicate logout operation; provider/global SSO logout; frontend session authority |
| Already-expired sign out | recover an expired current session | same `IAM-02 EndSession` command | `401` is server outcome, not client inference | `401` reaches the same authentication-required recovery with already-expired wording | treating `401` as successful new logout or as known-empty content |
| Ambiguous/dependency failure | preserve safe decision state | same `IAM-02` command boundary; transport/dependency outcome is not a new Product operation | failure message/retry visibility is `EPHEMERAL_UI`; session validity remains `SERVER` | keep Account menu and shell safe, state that sign-out is unconfirmed, offer explicit retry; never claim logout | blind replay, silent success, or local session invalidation |
| IAM-01 session expiry | recover when current Account context is no longer valid | `IAM-01 GetControlPlaneAccessContext` `401` | Account/session validity remains `SERVER` | `AUTHENTICATION_REQUIRED`; do not render expiry as zero disclosed Workspaces | cached AccountSummary as current authority |
| Re-entry control | leave recovery boundary for authentication | technical authentication boundary followed by normal Conexus Account/session resolution; future first-access flow remains `T-01` | recovery screen is `SERVER` outcome projection; control is `EPHEMERAL_UI` | authenticate again and re-resolve current Conexus authority; no promise of provider logout | embedding T-01 setup, public signup or permanent bootstrap bypass in GF-01 |

The bidirectional mapping is closed:

```text
IAM-01 AccountSummary → Account identity/progressive disclosure
IAM-02 EndSession     → Sign out of Conexus → authentication-required recovery
local Account controls → no Product operation / no new Permission
```

### 0.2 Delta state and accessibility contract

The delta preserves these distinct states:

```text
IAM-01 loading / current AccountSummary
IAM-01 401 session expiry
IAM-02 204 session ended
IAM-02 401 already expired
IAM-02 dependency or ambiguous failure
AUTHENTICATION_REQUIRED / explicit re-entry
```

The trigger is a native keyboard-operable button with `aria-expanded` and `aria-controls`. Opening focuses the Account identity; sequential focus reaches technical disclosure and Sign out. Escape and click-away close the non-modal menu and return focus to the trigger where appropriate. The narrow realization is a viewport-bounded sheet below the topbar, separate from the one adaptive navigation drawer. Identity, status and failure meaning are textual and never color-only.

The Account delta does not create a fifth client state class, a second navigation landmark, a new Product operation, an `account.read`/`account.manage` Permission or a new semantic owner. It remains a projection/command consumer of existing I&A authority.

## 1. Goal / user-flow role

GF-01 gives an authenticated human a truthful, recoverable frame in which they can:

```text
know which Account/session is current
→ recognize the current Workspace
→ recognize the current Project when inside Project scope
→ switch only among server-disclosed Workspace/Project contexts
→ reach Workspace work/shared/admin destinations
→ enter an exact Project and reach Project destinations
→ return from Project scope to Workspace Projects
→ open local navigation/context menus at narrow widths
→ expose a contextual Conexus panel seam only where a later surface admits it
```

Primary journey contribution:

- Journey A — first access / Workspace context;
- scope transition used by Journeys B–O once their exact surface is entered;
- no business journey is completed by the shell alone.

Success is navigation/context comprehension, not a Product mutation.

---

## 2. Locked structural baseline

```text
TOP BAR
Conexus / Workspace ▾ / Project ▾                         Account

CURRENT-SCOPE RAIL
Workspace scope → Projects / Agents / Brain / Connections / People & access / Audit
Project scope   → Project cue / Back to Projects / Build / Product / Operate / Manage destinations

STAGE
current route/surface
+ reserved collapsible contextual Conexus seam

NARROW
same semantic rail becomes one drawer
breadcrumb remains current-context orientation
assistant may consume available viewport rather than create a second Product IA
```

Locked structural properties:

1. one primary adaptive rail at a time;
2. breadcrumb-switcher expresses Workspace → Project hierarchy;
3. Workspace breadcrumb menu may expose bounded shortcuts to Brain, Connections and People & access;
4. Project rail carries a lightweight current-Project orientation cue plus explicit Back to Projects;
5. contextual Conexus gets a frame cooperation seam but not global assistant authority;
6. Projects cards in the P8 artifact are fixture-only and do not lock collection representation;
7. Published Applications do not inherit this Control Plane shell.

Not locked by GF-01:

```text
exact URL spelling
exact numeric breakpoints
assistant panel width
exact push / overlay / full transition thresholds
final spacing / typography / iconography / brand
component APIs / hooks / packages / router framework
screen-internal list/card/table/detail structures
```

---

## 3. Exact vertical authority trace

| Shell interaction / truth | Class | Exact accepted authority | Permission / authority condition | Result |
| --- | --- | --- | --- | --- |
| bootstrap current Account + disclosable Workspaces/Projects | `PRODUCT_READ` | `IAM-01 GetControlPlaneAccessContext` | authenticated current Conexus session + server-resolved membership/grants/disclosure; no invented `account.read` Permission | canonical `AccountSummary`, disclosed `workspaceId/name`, disclosed `projectId/workspaceId/name` projection |
| end current Control Plane session from Account menu | `PRODUCT_COMMAND` | `IAM-02 EndSession` | exact current authenticated Conexus session | session ends; browser returns to authentication-required state |
| resolve exact Workspace route/context | `PRODUCT_READ` | `WS-02 GetWorkspace` | current server-resolved Workspace membership/admin disclosure; route `workspaceId` is untrusted reference only | exact current Workspace identity or 401/403/404 |
| resolve exact Project route/context | `PRODUCT_READ` | `PRJ-02 GetProject` | `project.read` + exact current Project grant/disclosure; route `projectId` is untrusted reference only | exact Project representation or 401/403/404 |
| switch Workspace or Project from breadcrumb | `NAVIGATION` | no Product operation | destination must have been disclosed; exact destination still revalidates server-side | URL/context transition only |
| Workspace breadcrumb shortcut | `NAVIGATION` | no Product operation | current disclosed Workspace + destination route | moves to Brain / Connections / People & access; no ownership transfer |
| filter disclosed items inside a context menu | `LOCAL_UI` | IAM-01 projection already in browser | none beyond existing disclosure | local filtering only; never Product-wide search |
| change rail destination | `NAVIGATION` | no Product operation | exact destination screen later owns its own reads/writes | route transition only |
| open/close breadcrumb menu, narrow drawer, Account menu, or contextual panel | `LOCAL_UI` | no Product operation | none | presentation state only |
| reserve/open contextual Conexus seam | `LOCAL_UI` | no Product operation | current surface decides eligibility | panel shell opens/closes; **opening the contextual assistant seam MUST NOT invoke BLD-16** |
| later submit an actual contextual Conexus question | downstream `PRODUCT_READ` / assistant interaction | `BLD-16 AskConexusAboutContext` | `project.build` + selected current authorized Project context; server revalidates exact context | contextual answer only; grants no new authority |

Important negative law:

```text
context switch = NAVIGATION
workspace shortcut = NAVIGATION
drawer/menu/panel open-close = EPHEMERAL_UI
```

The shell therefore creates **zero** new Product operations.

`PRJ-01 ListProjects` belongs to the later `W-01` Projects block. GF-01's rendered project cards are deterministic fixture content solely to exercise scope transition and do not lock the Projects collection or consume `PRJ-01` as P8 proof.

---

## 4. Identity source and route truth

```text
workspaceId / projectId = URL_NAVIGATION
Workspace.name / Project.name = SERVER presentation identity
```

Rules:

- `workspaceId` and `projectId` remain stable machine identity/routing coordinates;
- `Workspace.name` / `Project.name` come only from accepted server projections (`IAM-01`, `WS-02`, `PRJ-02`) and never replace IDs;
- names are not authorization, uniqueness, slug or containment truth;
- the frontend must not maintain an editable ID→name Product registry;
- a deep-linked ID not present in cached IAM-01 state is not automatically denied or valid — exact server read determines current disclosure;
- breadcrumb local filtering never expands the server-disclosed set.

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| Account/session validity | `SERVER` | never independently owned by client |
| disclosed Workspace/Project sets | `SERVER` projection | cache allowed; refresh/revalidation cannot fabricate authority |
| exact Workspace / Project representation | `SERVER` projection | `WS-02` / `PRJ-02` truth |
| current `workspaceId` / `projectId` / destination route | `URL_NAVIGATION` | shareable navigation coordinate; no business authority |
| open breadcrumb/context menu | `EPHEMERAL_UI` | local only |
| menu filter text | `EPHEMERAL_UI` | filters currently disclosed projection only |
| narrow drawer open state | `EPHEMERAL_UI` | local only |
| contextual assistant panel open/collapsed state | `EPHEMERAL_UI` | local only; does not imply BLD-16 call or authorization |

No fifth state class is needed.

---

## 6. Generated transport custody

All network reads/commands in this contract follow:

```text
accepted Product semantics
→ canonical 4B OAS
→ GENERATED client/type projection
→ shell consumer
```

GF-01 does not select the final generator, SDK wrapper, request helper, router or query/cache library. A handwritten frontend interface that redefines IAM-01/WS-02/PRJ-02/session semantics is forbidden.

The context menu and rail themselves are navigation/local UI and therefore do not need synthetic transport DTOs.

---

## 7. Material loading / empty / denial / failure behavior

GF-01 must preserve these distinctions:

### Bootstrap

```text
IAM-01 loading
!=
known successful IAM-01 with zero disclosed Workspaces
!=
transport/dependency failure
!=
401 authentication-required
```

A failed bootstrap must never render as an empty Workspace list.

### Exact Workspace / Project context

For `WS-02` / `PRJ-02`:

```text
401 → authentication/session recovery
403 → authenticated but denied under current authority
404 → absent or intentionally non-disclosable exact subject
200 → exact disclosed current context
```

The browser must not infer why a 404 is non-disclosable.

If current authority is narrowed while the shell is open, cached visibility is not authorization. The next exact owner read/command may reject the context; the UI must recover to a still-disclosed context rather than treating stale client state as current authority.

### Local navigation

A navigation target failing to load does not mutate Workspace/Project authority. Preserve the current safe frame/recovery path and distinguish route/data failure from known-empty content in the destination block.

---

## 8. Authentication / authorization boundary

```text
Keycloak/OIDC authentication
→ Conexus Account/session
→ IAM-01 / owner reads
→ current server membership/grant/disclosure
```

The shell may hide or omit destinations that are not currently disclosed for UX, but:

```text
visible control != authorization
hidden control != authorization
cached IAM-01 item != perpetual authorization
direct URL != authority
Workspace.name / Project.name != authority
```

Every material destination operation remains server-authorized by its own owner.

---

## 9. Responsive / accessibility structural obligations

Locked:

- one semantic primary navigation landmark for current scope;
- narrow layout transforms that rail into one drawer rather than a second mobile IA;
- context hierarchy remains perceivable without hover;
- breadcrumb segments and menus are keyboard-operable controls;
- drawer/panel close must have non-pointer paths such as Escape/focusable close controls;
- current route is programmatically distinguishable;
- the contextual assistant seam must not make Build/Preview permanently pay for a second rail.

Deferred realization detail:

- exact pixel breakpoint/ratio;
- exact focus-restoration implementation;
- exact assistant push/overlay/full selection algorithm;
- final ARIA/component implementation.

Those details may not change the locked semantic hierarchy without reopening GF-01.

---

## 10. Forbidden frontend authority

GF-01 explicitly forbids:

```text
frontend-owned Workspace/Project identity registry
name-derived routing or authorization
global Product search operation inferred from breadcrumb filtering
screen-shaped context API
persistent dual Workspace + Project rails by implementation convenience
client authorization evaluator
global Conexus assistant authority
cross-Project context passed to BLD-16 without current server authorization
universal Approval Center
Workspace/Project generic rename/update resurrection
Published-App navigation inherited from Control Plane
```

---

## 11. P10 bounded interaction-pattern consolidation

Observed locked local interaction semantics:

```text
scope breadcrumb-switcher
adaptive current-scope rail
explicit Project → Workspace recovery transition
context-menu local filtering over disclosed projection
contextual assistant frame seam
narrow drawer transformation
```

The Account/session delta reuses the existing semantic vocabulary without creating a new shared implementation pattern:

```text
human-first exact reference
→ AccountSummary displayName/email first
→ accountId progressively disclosed

focus enters topbar disclosure and returns to exact trigger
→ same protected focus/close invariant already required by the shell

loading / expired / ended / ambiguous failure remain distinct
→ same honest state-separation invariant already required by GF-01
```

`Sign out of Conexus` is a single I&A command with no revision or generic decision abstraction. The Account menu remains GF-01-local structural semantics. Under the methodology, shared patterns graduate only after repeated locked evidence demonstrates the same protected purpose/state/accessibility/failure semantics.

```text
P10 graduated shared patterns = 0
```

All above remain **GF-01 local structural semantics**, not component APIs, hooks, stores, packages or design-system primitives. No Account/session component, cross-owner DTO/store, frontend authorization evaluator or new pattern is selected.

---

## 12. P11 trigger disposition

```text
P11 = NOT TRIGGERED SEPARATELY
```

Reason:

- the approved P8 HTML lineage now exercises the bounded shell questions that required interaction: Workspace/Project scope transitions, breadcrumb menus, shortcuts, adaptive rail, assistant seam, narrow drawer and the operable Account/EndSession delta;
- a second GF-01-only prototype would duplicate the same evidence rather than test a new cross-screen failure class;
- the assembled interactive P11 proof remains necessary later once multiple locked blocks can be exercised as genuine end-to-end flows.

The P8 artifact is still not backend/runtime/auth proof.

---

## 13. Closure / reopen law

GF-01 remains `READY` as the inherited frame baseline for later material blocks, now including the bounded Account/session delta:

```text
H1-R2 baseline                  = LOCKED / OPERATOR APPROVED
Account/session delta P8         = LOCKED / OPERATOR APPROVED
Account/session delta P9         = EXACT TRACE CLOSED
Account/session delta P10        = CONSOLIDATED
P11 / 4D / Product implementation = NOT AUTHORIZED
```

The current canonical HTML is pinned to the approved Account/session blob `e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3`; the prior H1-R2 blob `2d899d00484c41c927829bd9f529d3a870159db3` remains the historical baseline identity.

Reopen only if later evidence materially shows that the locked frame cannot preserve one of:

- truthful Workspace/Project orientation;
- reachable accepted Workspace/Project work;
- Preview-dominant primary work width;
- contextual assistant cooperation without global authority;
- accessible/responsive realization;
- current server-derived disclosure/authorization boundary.

Do not reopen for visual preference, component-library ergonomics or implementation-file convenience.

Carry-forwards remain open but do not reopen GF-01 by themselves:

```text
W-01 → Projects collection representation + create/inception/Baseline
W-04 → Workspace Agent catalog semantics
4C-S06 → pending exact ApprovalRequest discoverability
```

**Next material block:** `W-01`.
