# 4C W-02A — Locked Brain Screen Contract

> **Status:** `LOCKED / OPERATOR APPROVED` · P9 EXACT TRACE CLOSED · P10 CONSOLIDATED · P11 LATER ASSEMBLED PRODUCT
> **Block:** `W-02A — Workspace Brain`
> **Locked structure:** domain/concept first + separate governance work, with explicit Project context for Discovery
> **approved P8 artifact blob = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e**
> **Product implementation authority:** none.

The operator approved the revised functional P8 after F07 made published Brain knowledge structurally browseable from exact Brain truth and F08 made the Project subject of Discovery explicit. The approved HTML remains an immutable P8 Evidence snapshot; its in-artifact `CANDIDATE · NOT LOCKED` label is not rewritten after approval. `LOCKED` authority lives in this Screen Contract and the W-02A structural record, pinned to the exact approved blob above.

W-02A closes the Workspace Brain interaction block only. It does not decide physical Brain-Git topology, final visual design, production frontend components, SDK APIs, runtime implementation, remote catalog/search pagination, Project binding UX, or Connections interaction.

---

## 1. Goal / user-flow role

W-02A lets an authorized human complete the following coherent jobs without frontend-owned Brain truth:

```text
inspect the current published Workspace Brain
→ browse Knowledge → Domain → Concept
→ inspect exact source-bound human meaning / content classes / provenance
→ inspect revision history and health separately

OR

choose a disclosed Project context
→ run read-only Brain Discovery over that Project's already-admitted source/Connection context
→ inspect machine hypotheses + provenance
→ provide explicit human resolution
→ submit one durable KnowledgeProposal
→ reopen/review the exact proposal
→ APPROVE | REJECT the exact proposal revision
→ if approved, separately publish the exact candidate source revision
→ receive a new immutable Brain revision
```

The Brain owner remains canonical throughout. Browser fixture state demonstrates interaction structure only.

---

## 2. Locked structural baseline

```text
WORKSPACE / BRAIN
Knowledge                         ← primary mental model
Discovery                         ← authority evolution
Proposals                         ← durable review work
Revisions                         ← immutable publication history
Health                            ← operational overlay

KNOWLEDGE
published revision truth
→ Domain / namespace
→ Business concept
→ human-readable sections + content-class cues + provenance

DISCOVERY
explicit Project context
→ Run discovery
→ hypothesis + provenance
→ explicit humanResolution
→ Submit as proposal

PROPOSALS
exact proposal reviewText + provenance + proposalRevision
→ Reject | Approve
→ APPROVED != PUBLISHED
→ separate Publish approved candidate
```

Locked properties:

1. `Knowledge` is the primary human mental model; `SEMANTIC | KNOWLEDGE | EVIDENCE_SPEC` remain canonical content classes underneath, not mandatory global navigation;
2. one canonical Workspace Brain remains the owner; business domains/namespaces organize content but never become separate Brain authorities;
3. published Knowledge is rendered only from the exact current published Brain revision and its Brain-owned structured source-bound projection;
4. `Knowledge → Domain → Concept` never requires the frontend to parse `reviewText`, Markdown headings, DOM structure or Brain Git into semantic authority;
5. local Knowledge search/filter is allowed only over the already-disclosed `knowledgeBrowse` projection;
6. Discovery remains Workspace Brain work but requires an explicit human-recognizable Project context before `BRN-04`;
7. the selected `projectId` chooses context only; source, Connection, credential and physical topology resolution remain server/Brain-owned;
8. Discovery hypotheses remain non-canonical until explicit human resolution reaches a durable KnowledgeProposal;
9. `proposal approval != publication`; `BRN-08` and `BRN-09` remain distinct authority transitions;
10. Brain health remains a separate overlay and cannot rewrite immutable Brain content;
11. publication does not silently rebind Projects;
12. physical Brain-Git paths/folders are not exposed as the human IA merely because the P8 uses domains and concepts.

Not locked by W-02A:

```text
final brand / typography / iconography / density
exact URL spelling
production tab/router/component APIs
remote Brain catalog/search/pagination
partial concept fetch APIs
physical Brain-Git folder/file format
projection compilation implementation
vector/RAG retrieval implementation
Project Brain-binding UX
Connections UX
final SDK/query/cache state APIs
```

---

## 3. Exact vertical authority trace

| W-02A interaction / truth | Class | Exact accepted authority | Permission / current-state condition | Result |
| --- | --- | --- | --- | --- |
| identify current Workspace publication | `PRODUCT_READ` | `BRN-01 GetWorkspaceBrain` | `brain.read`; exact Workspace disclosure | `publishedBrainRevisionId` or truthful `null` |
| inspect published revision history | `PRODUCT_READ` | `BRN-02 ListBrainRevisions` | `brain.read`; exact Workspace Brain disclosure | immutable `BrainRevision[]` summaries |
| browse exact published Knowledge | `PRODUCT_READ` | `BRN-03 GetBrainRevision` | `brain.read`; exact `brainRevisionId` disclosure | `BrainRevisionDetail` with exact source identity, `reviewText` and `knowledgeBrowse` |
| populate explicit Discovery Project choices | `PRODUCT_READ` | `PRJ-01 ListProjects` | `project.read` + current Workspace disclosure | current disclosable `ProjectSummary[]` only |
| choose Project before Discovery | `LOCAL_UI` / form draft | no Product operation | only already-disclosed `PRJ-01` truth | untrusted selected `projectId`; no source/Connection authority |
| run Project-context Discovery | `PRODUCT_COMMAND` / investigation | `BRN-04 StartBrainDiscovery` | `brain.discover`; plus `connection.use` when accepted external-source context requires it; exact Workspace/Project/source scope; `Idempotency-Key` | read-only hypotheses + provenance |
| inspect proposal queue | `PRODUCT_READ` | `BRN-05 ListKnowledgeProposals` | `brain.review`; exact Workspace review visibility | durable proposal projections |
| inspect exact proposal | `PRODUCT_READ` | `BRN-06 GetKnowledgeProposal` | `brain.review`; exact proposal disclosure | proposal identity/state/provenance + exact-source `reviewText` |
| submit Discovery-backed human resolution | `PRODUCT_COMMAND` | `BRN-07 SubmitKnowledgeProposal` | `brain.propose`; exact Discovery candidate + explicit nonblank human resolution; `Idempotency-Key` | one durable KnowledgeProposal; Brain re-resolves provenance/materializes candidate source |
| decide exact proposal | `PRODUCT_COMMAND` / decision | `BRN-08 DecideKnowledgeProposal` | `brain.review`; exact current `proposalRevision`; current reviewer authority | `APPROVE | REJECT` applied to exact proposal revision |
| publish approved candidate separately | `PRODUCT_COMMAND` / decision | `BRN-09 PublishBrainRevision` | `brain.publish`; exact reviewed/validated `candidateSourceRevision`; current publication authority | new immutable AVAILABLE Brain revision summary |
| inspect operational health | `PRODUCT_READ` | `BRN-10 GetBrainHealth` | `brain.read`; exact Brain revision/binding context | exact health snapshot with `UNVERIFIED | VALID | SUSPECT | INVALID | CHECK_ERROR` |

`BRN-12 RunAnalyticQuery` is explicitly outside this block:

```text
BRN-12 = OUT OF BLOCK
```

It is a governed Project/Brain analytical-read regime for current application consumers, not Workspace Brain knowledge-governance interaction.

### 3.1 Current publication read chain

```text
BRN-01
→ publishedBrainRevisionId

publishedBrainRevisionId = null
→ truthful no-published-Brain state

publishedBrainRevisionId exists
→ BRN-03 exact revision detail
→ knowledgeBrowse
→ Knowledge → Domain → Concept
```

`BRN-02` and `BRN-09` remain bounded revision summaries. They do not gain an implicit whole-catalog payload. If the human needs exact published content after publication or from history, the frontend resolves the exact revision through `BRN-03`.

---

## 4. Identity / decision-subject law

```text
workspaceId = URL_NAVIGATION / server-revalidated scope reference
brainRevisionId = URL_NAVIGATION when exact revision detail is navigated
publishedBrainRevisionId = SERVER truth from BRN-01
sourceRevision = SERVER immutable source identity
knowledgeBrowse domainRef / conceptRef = SERVER revision-scoped presentation coordinates
selected projectId before Discovery = FORM_DRAFT
Discovery candidateRef = SERVER exact hypothesis reference
humanResolution = FORM_DRAFT
proposal / proposalRevision = SERVER
candidateSourceRevision = SERVER
health snapshot = SERVER
local Brain tab / selected domain / selected concept = EPHEMERAL_UI or URL_NAVIGATION when re-entry later requires it
```

Binding laws:

```text
knowledgeBrowse = SERVER
frontend text/DOM -X-> Brain semantic identity
reviewText -X-> decision identity
reviewText -X-> source authority
proposal approval != publication
BRN-08 decision subject = exact proposalRevision
BRN-09 publication subject = exact candidateSourceRevision
Project binding -X-> implicit latest Brain publication
```

`domainRef` / `conceptRef` are coordinates inside the exact revision-scoped browse projection. W-02A does not promote them into new global canonical Brain source IDs or independent Product resources.

---

## 5. Client-state ownership

| State | Class | Rule |
| --- | --- | --- |
| Workspace Brain publication projection | `SERVER` | `BRN-01`; never fabricate a current revision |
| exact revision detail + `knowledgeBrowse` | `SERVER` | exact `BRN-03` source-bound projection |
| local Knowledge query / visible matching concepts | `EPHEMERAL_UI` | may filter only already-disclosed projection |
| selected Brain tab / open domain / open concept | `EPHEMERAL_UI` for current block | presentation/navigation only; no semantic authority |
| disclosed Project summaries | `SERVER` | `PRJ-01`; no fabricated eligibility/source metadata |
| selected Project before Discovery | `FORM_DRAFT` | untrusted context choice until `BRN-04` submit |
| Discovery hypotheses | `SERVER` | `BRN-04`; hypotheses remain non-canonical |
| selected Discovery hypothesis | `EPHEMERAL_UI` | presentation selection over server result |
| human resolution | `FORM_DRAFT` | explicit human semantic input before `BRN-07` |
| proposal collection/detail | `SERVER` | `BRN-05/06/07/08`; durable Brain owner truth |
| proposal decision UI selection | `EPHEMERAL_UI` until submit | no optimistic Brain truth |
| revision history | `SERVER` | `BRN-02/09` summaries; exact detail via `BRN-03` |
| health | `SERVER` | `BRN-10` operational overlay only |

No fifth client-state class is justified.

Changing the selected Project after a fixture Discovery run discards the old local Discovery result before another run. This prevents stale EPHEMERAL_UI from being visually attributed to a different Project; it is not a Product transition.

---

## 6. Generated transport custody

All W-02A network interaction follows:

```text
accepted 4A Brain/Project semantics
→ canonical 4B Product OAS
→ GENERATED transport/type projection
→ W-02A consumer
```

W-02A does not select Kubb or any final SDK/query/cache wrapper. Handwritten screen-local DTOs that widen/narrow `PRJ-01` or `BRN-01..10` are forbidden.

Local tab state, Knowledge find/filter, selected domain/concept, Project choice before Discovery, selected hypothesis and text drafts require no synthetic Product endpoint.

---

## 7. Material state / failure / recovery obligations

### Current Brain / revision reads — `BRN-01/02/03`

Preserve:

```text
loading
!= publishedBrainRevisionId = null
!= 200 known-empty revision history
!= 401 unauthenticated
!= 403 denied
!= 404 absent/non-disclosable Workspace/revision
!= transport/dependency failure
```

A failed exact revision read cannot fall back to stale browser `knowledgeBrowse` as authority.

### Discovery Project choices — `PRJ-01`

A Project selector may show only currently disclosed `ProjectSummary` truth. `archived` is presentation truth, not client-side proof of BRN-04 eligibility. Loading/failure/known-empty remain distinct; no hidden/default Project is admitted.

### Discovery — `BRN-04`

Requires explicit selected Project context and `Idempotency-Key`. Material outcomes include `401/403/404/409/422/503`. Failure cannot manufacture candidates or silently switch Project/source/Connection context.

The frontend never submits credentials, source URL, SQL, physical table, arbitrary Connection or target URL to BRN-04.

### Proposal intake — `BRN-07`

Discovery-backed submission requires:

```text
discoveryCandidateRef
+ nonblank humanResolution
```

The frontend does not supply `candidateSourceRevision`, provenance authority, publication intent or machine approval in that form. Failure preserves the human resolution as a recoverable form draft; it does not invent a durable proposal.

### Proposal detail / decision — `BRN-05/06/08`

Queue/detail reads remain distinct from decisions. `BRN-08` uses `expectedProposalRevision + APPROVE|REJECT`; stale/currentness failure (`412` where applicable) or conflict cannot be displayed as an accepted decision.

`reviewText` assists human review but never enters the decision request as identity.

### Publication — `BRN-09`

Publication is separate from proposal approval and uses the exact `candidateSourceRevision`. Failure leaves the proposal decision truth unchanged and does not fabricate a new Brain revision or Project adoption.

A successful `BRN-09` response is a revision summary; exact content may be loaded through `BRN-03`.

### Health — `BRN-10`

Preserve exact health vocabulary:

```text
UNVERIFIED
VALID
SUSPECT
INVALID
CHECK_ERROR
```

`health overlay -X-> immutable Brain content mutation`

Dependency/error state cannot be narrated as healthy or silently rewritten into Brain source truth.

---

## 8. Authentication / authorization boundary

```text
Keycloak/OIDC authentication
→ Conexus Account/session
→ current Workspace/Project grants
→ exact Brain/Project Permission + owner state
```

W-02A presentation does not authorize. In particular:

```text
visible Brain tab != brain.read grant
visible Project option != Discovery authorization
selected projectId != source/Connection authority
visible hypothesis != proposal authority
visible reviewText != review decision authority
Approve button != current reviewer eligibility
APPROVED label != publication
published revision != Project binding
health badge != source mutation
```

The browser never derives `brain.discover`, `brain.propose`, `brain.review`, `brain.publish`, `brain.read`, `project.read` or `connection.use` from visible controls.

---

## 9. Responsive / accessibility structural obligations

Locked obligations:

- inherit the GF-01 adaptive Workspace shell/rail grammar;
- Brain sections remain keyboard-operable and identifiable without color-only state;
- Knowledge search has a persistent label and filters only already-disclosed content;
- Domain and concept entry controls remain keyboard-operable;
- concept detail sections identify their human role textually; content-class tags are supplemental, not the only label;
- Discovery Project context has an explicit label and visible helper text explaining the source/Connection boundary;
- `Run discovery` is unavailable before explicit Project selection;
- hypothesis/provenance and human resolution remain readable/focusable without pointer-only interaction;
- Reject, Approve and Publish remain distinct actions in reading/focus order;
- `APPROVED · NOT PUBLISHED` is textual, not color-only;
- revision/history and health remain distinguishable from canonical content;
- narrow layouts may stack panels but may not hide the material review subject or only action.

Exact pixel breakpoints and production component APIs remain later realization details.

---

## 10. Forbidden frontend authority

W-02A forbids:

```text
frontend parsing reviewText/Markdown/DOM into Brain semantic hierarchy
browser reading Workspace Brain Git directly
physical Git folders as human semantic authority
vector/RAG/search index as meaning authority
hidden/default Project for Discovery
previously visited Project as implicit Discovery authority
frontend-selected source / Connection / credential / table
client inference that archived == Discovery-ineligible
Workspace-wide Discovery invented by UI
optimistic KnowledgeProposal after failed BRN-07
optimistic APPROVED after failed BRN-08
Approve-and-Publish collapsed into one local state transition
reviewText as proposal decision identity
DOM/card coordinate as source identity
publication silently rebinding Projects
generic Brain editor/workbench owner
new Brain catalog/search Product API without scale consumer
generic cross-owner ReviewProjection Product domain
```

---

## 11. P10 bounded interaction-pattern consolidation

Locked W-02A local semantics now include:

```text
knowledge-first Brain navigation
revision-scoped Domain → Concept browse projection
local findability over disclosed knowledge
explicit Project context before Discovery
hypothesis → explicit human resolution → durable proposal
exact proposal review
separate APPROVE|REJECT and publication
immutable revision history
health-as-overlay
```

Across GF-01, W-01 and W-02A there are repeated presentation ideas—context labels, exact-subject review, provenance, local filtering, status disclosure—but the semantic subjects, Permissions and lifecycle meanings remain materially different. Repetition is not yet sufficient to graduate a shared Product primitive, generic review framework, universal status model, shared store/hook or cross-owner DTO.

The Brain `knowledgeBrowse` projection is owner-specific. Baseline visual review is Project-owned and immutable-candidate focused. Connections will carry write-only secret and qualification semantics that are materially different again.

```text
P10 graduated shared patterns = 0
```

Watch triggers for later consolidation:

```text
third locked materially similar exact-subject review consumer
or
repeated locked cross-block interaction whose differences are demonstrably only visual/mechanical
```

Until then, implementation reuse may be considered only as a downstream mechanism and must not create Product authority.

---

## 12. P11 disposition

Under frontend method v2.2:

```text
P11 = LATER ASSEMBLED PRODUCT
```

P8 proves one block; P11 proves the assembled Product. W-02A therefore does not create a second Brain-only assembly artifact after lock.

The current functional HTML already proves this block's material interactions using deterministic local fixtures. Later, when the required material blocks are locked, P11 must assemble them into one coherent low-fidelity Product and expose cross-block navigation/state contradictions. P12 then adversarially attacks that assembled Product.

---

## 13. Deferred / reopen law

W-02A is `READY` as a locked Workspace Brain baseline for later assembly.

Carry-forwards that do **not** reopen W-02A by themselves:

```text
remote Brain search/pagination/partial concept fetch = deferred until scale consumer proves need
physical Brain-Git topology = later realization
projection compiler mechanism = 4D concern
vector/RAG retrieval mechanism = non-authoritative implementation concern
Project Brain-binding UX = separate routed block/surface
```

Reopen W-02A only if later Evidence materially falsifies one of:

- one canonical Workspace Brain remains the correct owner;
- Knowledge-first `Domain → Concept` human mental model;
- exact published revision → structured source-bound `knowledgeBrowse` truth;
- explicit Project context before Discovery with server-owned source/Connection resolution;
- machine-propose / human-resolve / durable-proposal progression;
- exact proposal decision subject;
- approval/publication separation;
- immutable publication history;
- health overlay separation;
- accessible/responsive realization.

Do not reopen for visual preference, framework ergonomics, speculative scale or a desire to prebuild shared primitives.

**Next material block:** `W-02B — Connections` at P7 structural adjudication.
