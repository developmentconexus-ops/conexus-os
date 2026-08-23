# 4C W-02B — Locked Connections Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED · P11 LATER ASSEMBLED PRODUCT
> **Block:** `W-02B — Connections`
> **Locked structure:** Connection-first browse → contextual Connection panel → inline maintenance/test while preserving collection context
> **approved P8 artifact blob = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab**
> **Product implementation authority:** none.

The operator explicitly approved the exact context-preserving functional P8 after operating the artifact. The approved HTML remains an immutable P8 Evidence snapshot; its in-artifact `CANDIDATE · NOT LOCKED` label is not rewritten after approval. `LOCKED` authority lives in this Screen Contract and the W-02B structural record, pinned to the exact approved blob above.

W-02B closes only the Workspace/Project-owned Connection lifecycle interaction. It does not decide ProjectConnectionBinding UX, runtime health, final visual design, production frontend components, SDK APIs, router/state implementation, connector-specific production mechanics or Product code.

---

## 1. Goal / user-flow role

W-02B lets an authorized human complete one coherent Connection-maintenance job without losing collection context or inventing frontend-owned truth:

```text
browse current Connections
→ recognize one logical Connection by Connection.name + provider context
→ inspect current test applicability
→ open one contextual Connection panel
→ inspect current non-secret configuration
→ inspect credential-presence fact
→ intentionally revise configuration OR replace credential material
→ remain in the same Connection context
→ see Needs retest when the prior test basis is stale
→ run Test connection for the exact current basis/environment
→ inspect the human outcome/diagnostic/remediation
→ close the panel back to the unchanged Connections collection context
```

Creation remains a separate bounded modal/job because a logical Connection does not exist before `CON-05` succeeds.

---

## 2. Locked structural baseline

```text
CONNECTIONS COLLECTION
card browse
→ Connection.name = primary human identity
→ provider = context, not identity
→ credential-presence fact
→ current test-applicability summary

OPEN
→ contextual Connection panel
→ collection remains visible behind the contextual panel
→ Connection test first
→ Configuration read + inline Edit / Save / Cancel
→ Access read + inline credential replacement / Save / Cancel
→ Technical details collapsed

CONFIGURATION SAVE
→ exact current revision precondition
→ new immutable ConnectionRevision
→ panel stays open
→ current test basis becomes NEEDS_RETEST

CREDENTIAL SAVE
→ write-only secret ingress
→ no value returned/read back
→ server-owned logical credential generation advances
→ panel stays open
→ current test basis becomes NEEDS_RETEST

TEST
→ exact current ConnectionRevision + environment
→ credential generation resolved server-side
→ exact qualification result + human diagnostic/remediation + Evidence
```

Locked properties:

1. the logical Connection is the human object; provider identity never replaces `Connection.name`;
2. card browse is optimized for recognition/comparison, not direct free-form editing;
3. routine work on one Connection uses one contextual panel so the collection/search context is preserved;
4. current provider-specific non-secret configuration is server truth from `CON-04`, bound to `currentRevisionId`;
5. configuration revision is intentional inline work through `CON-06`, never local mutation masquerading as server truth;
6. credential material is accepted only through `CON-07` and is never disclosed after write;
7. configuration or credential change makes an older qualification basis visibly stale through `NEEDS_RETEST`;
8. `Test connection` is the human label for the real `CON-08` qualification job;
9. exact outcome, diagnostic/remediation and Evidence remain `CON-09`/Connections truth; the browser does not parse raw Evidence into diagnostic authority;
10. technical IDs/provenance remain available behind progressive disclosure instead of dominating routine use;
11. the Sankhya fixture is an API connector and remains structurally distinct from the Oracle Database fixture;
12. configured, qualified, Project-bound, runtime-health and caller-authorization truths remain separate.

Binding laws:

```text
configured != qualified != bound != healthy != caller-authorized
credential write = CON-07 write-only / no secret readback
NOT_TESTED | NEEDS_RETEST | PASSED | FAILED | INDETERMINATE
```

Not locked by W-02B:

```text
final brand / typography / iconography / density
exact URL spelling
production router/component APIs
remote pagination/search implementation
connector-specific production field widgets
Connection rename/delete/rollback
revision-history browser
qualification-result list/history UI
background monitoring or automatic retry
ProjectConnectionBinding interaction
runtime health monitoring
final SDK/query/cache APIs
```

---

## 3. Exact vertical authority trace

| W-02B interaction / truth | Class | Exact accepted authority | Permission / current-state condition | Result |
| --- | --- | --- | --- | --- |
| browse admitted Connector definitions for creation context | `PRODUCT_READ` | `CON-01 ListConnectorDefinitions` | `connection.read`; current disclosure/admission | current `ConnectorDefinitionSummary[]` |
| inspect exact Connector schema when material | `PRODUCT_READ` | `CON-02 GetConnectorDefinition` | `connection.read`; exact definition/version disclosure | provider + configuration schema + credential-input schema; no secret values |
| browse current Connections | `PRODUCT_READ` | `CON-03 ListConnections` | `connection.read`; exact Workspace/Project owner scope | lightweight Connection collection with human identity, credential-presence fact and current `connectionTest` summary |
| open contextual Connection panel | `PRODUCT_READ` | `CON-04 GetConnection` | `connection.read`; exact logical Connection + owner-scope disclosure | current `ConnectionDetail`, current non-secret configuration and current test applicability |
| create a logical Connection | `PRODUCT_COMMAND` | `CON-05 CreateConnection` | `connection.manage`; exact owner scope + admitted Connector; `Idempotency-Key` | new logical Connection + initial revision + `NOT_TESTED`; no credential material implied |
| save inline configuration revision | `PRODUCT_COMMAND` | `CON-06 ReviseConnection` | `connection.manage`; exact `expectedCurrentRevisionId` | new immutable ConnectionRevision; prior test basis becomes stale |
| save inline credential replacement | `PRODUCT_COMMAND` | `CON-07 SetConnectionCredential` | `connection.manage`; exact Connection; protected write-only ingress; `Idempotency-Key` | `204`; credential generation advances server-side; no credential value/handle/generation response |
| run Test connection | `PRODUCT_COMMAND` / proof | `CON-08 QualifyConnection` | `connection.qualify`; exact `connectionRevisionId` + environment; `Idempotency-Key` | exact ConnectionQualification bound to server-resolved current credential generation |
| inspect exact test result/problem/provenance | `PRODUCT_READ` | `CON-09 GetConnectionQualification` | `connection.read`; exact Connection + qualification disclosure | exact basis/outcome/diagnostic/remediation/Evidence |

`connection.use` is deliberately not exercised by routine W-02B lifecycle maintenance. It remains the separate authority required by admitted Project binding or Brain external-source consumers; merely viewing, configuring or qualifying a Connection never grants use/invocation authority.

### 3.1 Current collection/detail read chain

```text
CON-03
→ Connection[]
→ human name/provider + credentialConfigured + connectionTest

open exact Connection
→ CON-04
→ ConnectionDetail
→ currentRevisionId + exact current non-secret configuration
→ credentialConfigured + current connectionTest
```

A card never invents full configuration by retaining an old form draft. Exact current detail is re-resolved through `CON-04` when server truth is required.

### 3.2 Edit/retest chain

```text
CON-04 currentRevisionId + configuration
→ configuration draft = FORM_DRAFT
→ CON-06 expectedCurrentRevisionId + new non-secret configuration
→ successful new revision
→ current test applicability = NEEDS_RETEST

OR

credential draft = FORM_DRAFT
→ CON-07 write-only credential replacement
→ successful replacement
→ current test applicability = NEEDS_RETEST

then

test environment = FORM_DRAFT
→ CON-08 current revision + environment
→ exact qualification
→ CON-09 exact result when re-read/re-entered
```

---

## 4. Identity / decision-subject law

```text
ownerScopeKind / ownerId = SERVER-disclosed containment context
Connection.name = SERVER human presentation identity
connectorDefinitionId / connectorVersion = SERVER Connection context
connectionId = untrusted logical Connection reference; server revalidates owner/disclosure
currentRevisionId = SERVER current configuration-revision truth
configuration = SERVER current non-secret revision meaning
credentialConfigured = SERVER presence fact only
credential material = FORM_DRAFT until CON-07 submit; never browser-owned persisted truth
connectionTest = SERVER current applicability projection
qualificationId = SERVER exact qualification reference
connectionRevisionId = SERVER exact qualification basis
credentialGeneration = SERVER-only logical basis; caller never selects it
environment = FORM_DRAFT before CON-08, SERVER exact result after qualification
Evidence refs = SERVER provenance
```

Negative laws:

```text
Connection.name -X-> routing identity
provider -X-> logical Connection identity
configuration presence -X-> qualification
credentialConfigured -X-> qualification
qualification PASSED -X-> Project binding
qualification PASSED -X-> runtime health
qualification PASSED -X-> caller authorization
visible control -X-> Permission
Evidence parsing -X-> diagnostic authority
```

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| ConnectorDefinition collection/detail | `SERVER` | `CON-01/02`; schemas are admitted server projections |
| Connection collection/detail | `SERVER` | `CON-03/04`; never fabricate current detail from card/form state |
| current non-secret configuration | `SERVER` | exact `CON-04` currentRevision-bound truth |
| current `connectionTest` applicability | `SERVER` | exact Connections-derived five-state projection |
| exact qualification + diagnostic/Evidence | `SERVER` | `CON-08/09` result truth |
| exact Connection subject when deep-link/re-entry is material | `URL_NAVIGATION` | untrusted reference; server disclosure/currentness rechecked |
| exact qualification subject when deep-link/re-entry is material | `URL_NAVIGATION` | untrusted reference; exact Connection/basis rechecked |
| configuration draft | `FORM_DRAFT` | initialized from exact current `CON-04` configuration; not current truth until `CON-06` succeeds |
| credential draft | `FORM_DRAFT` | write-only transient input; discarded after submit/cancel |
| test environment | `FORM_DRAFT` | caller choice constrained by exact ConnectorDefinition environments |
| create name/Connector/configuration | `FORM_DRAFT` | untrusted until `CON-05` succeeds |
| local filter | `EPHEMERAL_UI` | filters already-disclosed collection only |
| selected card / panel open-close / inline editor disclosure | `EPHEMERAL_UI` in the P8 proof | presentation only; no Product transition |
| Technical details expansion | `EPHEMERAL_UI` | disclosure only |

No fifth state class is justified.

---

## 6. Generated transport custody

All W-02B network interaction follows:

```text
accepted 4A Connections semantics
→ canonical 4B Product OAS
→ GENERATED transport/type projection
→ W-02B consumer
```

W-02B does not select the final generator, SDK wrapper, query/cache library, router or state store. Handwritten screen-local DTOs that widen/narrow `CON-01..09` are forbidden.

The contextual panel, local filtering, editor expansion and confirmation text require no synthetic Product endpoint.

---

## 7. Material state / failure / recovery obligations

### Connector/Connection reads — `CON-01/02/03/04/09`

Preserve:

```text
loading
!= known-empty collection
!= 401 unauthenticated
!= 403 denied
!= 404 absent/non-disclosable exact scope/subject where applicable
!= transport/dependency failure
```

A failed exact `CON-04` read cannot silently fall back to a stale local configuration draft as current authority.

### Create — `CON-05`

Uses `Idempotency-Key`. Preserve `401/403/404/409/422` distinctly enough for recovery. Failure creates no local durable Connection. A successful create produces a logical Connection with initial revision and `NOT_TESTED`; credential setup remains separate.

### Revise configuration — `CON-06`

Uses exact `expectedCurrentRevisionId`. Preserve `401/403/404/409/412/422`. A stale/currentness failure must not overwrite newer server configuration; the recovery intent is “reload current configuration, review, then intentionally reapply”.

A successful revision keeps the panel context but refreshes current server truth and visibly requires a new test.

### Credential replacement — `CON-07`

Uses `Idempotency-Key` and write-only input. Preserve `401/403/404/409/422`. Failure must not claim credential presence changed. Success returns no secret or logical generation to the browser; the next exact detail/test applicability comes from owner truth.

### Test connection — `CON-08`

Uses `Idempotency-Key`. Caller supplies only the exact ConnectionRevision and environment; Connections resolves logical credential generation server-side. Preserve `401/403/404/409/422/503`.

Failure to execute a test is not automatically `FAILED` provider outcome. The frontend must distinguish command/dependency failure from a returned qualification whose stable human outcome is `FAILED` or `INDETERMINATE`.

### Exact qualification — `CON-09`

Returned outcome/diagnostic/remediation/Evidence are displayed as Connections truth. The browser does not promote a prior exact qualification into current applicability when the owner now says `NEEDS_RETEST`.

---

## 8. Authentication / authorization boundary

```text
Keycloak/OIDC authentication
→ Conexus Account/session
→ current Workspace/Project grants
→ exact Connections Permission + owner scope/current subject
```

W-02B presentation does not authorize. In particular:

```text
visible Connections nav != connection.read grant
visible New connection != connection.manage grant
visible Edit != connection.manage grant
visible credential form != connection.manage grant
visible Test connection != connection.qualify grant
PASSED result != connection.use grant
same Workspace != connection.use grant
connection.use != runtime invocation authority
```

Every request rechecks current containment, disclosure, Permission and operation-specific currentness.

---

## 9. Responsive / accessibility structural obligations

Locked obligations:

- inherit the GF-01 adaptive Workspace shell/rail grammar;
- Connections search has a persistent visible label;
- cards remain keyboard-reachable with textual Connection identity/provider/test state;
- test applicability and credential-presence meaning are never color-only;
- opening a Connection moves focus into the contextual panel and closing returns focus to the triggering card/action when possible;
- the panel has a textual Connection identity and an operable close control;
- Configuration and Access read/edit modes remain distinguishable in reading/focus order;
- write-only credential fields retain visible labels and never prefill old secrets;
- Test connection, cancel and retry/remediation controls remain keyboard operable;
- narrow layouts may promote the contextual panel to a full-width sheet, but the semantic subject/actions remain the same;
- Technical details remain reachable without becoming the only place where human failure/remediation is explained.

Exact pixel breakpoints and production component APIs remain later realization details.

---

## 10. Forbidden frontend authority

W-02B forbids:

```text
card/provider identity replacing Connection.name
browser-owned current configuration
browser-owned credential generation
browser persistence of plaintext credential material
frontend-derived qualification from credentialConfigured
frontend-derived runtime health from qualification outcome
frontend-derived Project binding/use authorization from qualification
caller-selected credential generation on CON-08
raw Evidence parsing as diagnostic authority
optimistic successful revision after CON-06 currentness failure
optimistic credential success after failed CON-07
optimistic PASSED after failed/dependency-error CON-08
invented Active/Inactive/Ready lifecycle
invented qualification catalog/list endpoint
background monitoring/automatic retry without an admitted consumer
ProjectConnectionBinding mutation inside Connection lifecycle UI
```

---

## 11. P10 bounded interaction-pattern consolidation

Locked W-02B local semantics now include:

```text
human-first Connection cards
context-preserving detail panel
inline configuration revision
inline write-only credential replacement
same-context Test connection + remediation
Needs retest after basis change
collapsed technical provenance
```

Across GF-01, W-01, W-02A and W-02B there are repeated presentation ideas—context labels, focused overlays, local filtering, progressive disclosure, exact-subject diagnostics and form drafts—but the semantic subjects, permissions, currentness and recovery laws differ materially.

No production component system, generic resource drawer, universal editor, generic status model, shared store/hook, cross-owner DTO or SDK abstraction graduates here.

```text
P10 graduated shared patterns = 0
P11 = LATER ASSEMBLED PRODUCT
```

Concrete realization remains 4D work after all material 4C blocks, P11/P12 and closure.

---

## 12. Closure disposition

```text
W-02B = LOCKED / OPERATOR APPROVED
P8 approved artifact = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
P9 exact Screen Contract = CLOSED
P10 pattern pass = CLOSED / 0 graduated shared patterns
P11 = LATER ASSEMBLED PRODUCT
```

The next material 4C block is `W-03 — People/access + audit`; it remains unopened until the roadmap transition is recorded. No 4D or Product implementation authority is implied by this lock.
