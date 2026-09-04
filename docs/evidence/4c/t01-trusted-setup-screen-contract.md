# T-01 — Trusted setup / first access Screen Contract

> **Status:** LOCKED BASELINE / P12 FAMILY 1 IDENTITY DELTA RE-LOCKED / OPERATOR APPROVED
> **Method:** Frontend Product Experience Planning Method v2.3
> **P9:** P9 EXACT TRACE CLOSED
> **P10:** P10 CONSOLIDATED
> **P11:** P11 LATER ASSEMBLED PRODUCT
> **Final operator-approved P8:** docs/evidence/4c/t01-trusted-setup-functional-wireframe.html
> **Exact artifact identity:** approved final P8 artifact blob = 3955589bfd983923b74a4cd72f6ef13f2b9867e7
> **P12 Family 1 approved identity:** approved identity-custody P8 delta blob = 4da586d8a421bb03413bc82ee5b2e82432d6f620
> **Accepted bounded upstream authority:** 4C-PRE11-F03 / TRUSTED_BOOTSTRAP_CONTEXT / 128↔128 wire
> **Product implementation authority:** none; Product implementation = BLOCKED.

## 1. Locked human experience

T-01 locks the first owned-instance setup as an explicit Account-first progression. The
Account authority boundary is visible and the normal session boundary is re-entered
before first Workspace creation:

~~~
configured OIDC identity
→ Configure your Account
→ IAM-03 bootstrap self-provision
→ Account established / bootstrap sealed
→ explicit normal sign-in / re-entry
→ IAM-01 AccountSummary + NO_WORKSPACE
→ Create your first Workspace
→ WS-01 establishes initial current-Account access
→ GF-01 Projects boundary
~~~

The separate later trusted-provisioning surface remains outside the first-run
progression:

~~~
normal trusted platform operator session
→ exact external subject + Account presentation
→ IAM-03 ordinary provisioning
→ AccountSummary result
→ W-03 / P-05 candidate-selection boundary
~~~

Locked truth laws:

~~~
TRUSTED_BOOTSTRAP_CONTEXT is one-shot and pre-Account
bootstrap success invalidates the old context
bootstrap context -X-> WS-01 or any normal Product route
normal re-entry precedes first Workspace creation
NO_WORKSPACE != dependency failure
initial Workspace success requires initialAccessEstablished=true
AccountSummary is server-owned presentation, not authorization
ordinary Account provisioning != membership/app access
T-01 != public onboarding or a Control Plane rail
~~~

The approved HTML remains disposable low-fidelity Evidence. Its in-artifact
FUNCTIONAL LOW-FI CANDIDATE / NOT LOCKED marker is historical proof chrome; the
operator lock lives in this contract and the current roadmap, pinned to the exact
artifact blob above.

## 2. P9 — surfaces, stages and information roles

| Surface / stage | Primary information role | Secondary role |
| --- | --- | --- |
| T-01A first setup / Account | establish the current human Account presentation for the exact configured setup identity | recover validation, conflict, dependency and ambiguous intake |
| T-01A Account-established re-entry | make Account establishment and bootstrap sealing understandable | provide one explicit normal sign-in continuation |
| T-01A first Workspace | recognize the current Account and a truthful known-empty Workspace collection | name and create the first Workspace under normal authority |
| T-01A ready / Projects boundary | recognize that Workspace identity and initial access are confirmed | continue to the existing GF-01 Projects frame |
| T-01B trusted Account provisioning | provision a known exact external subject under the ordinary trusted operator route | hand off to W-03 / P-05 candidate selection without granting access |
| Review controls | inspect deterministic fixture scenarios and proof coordinates | never acts as Product or authorization authority |

Navigation and stage law:

~~~
T-01 first setup route                       = URL_NAVIGATION / direct internal entry
Account → Re-entry → Workspace → Ready       = local stage progression
normal sign-in / re-entry                    = authentication boundary
Continue to Projects                         = NAVIGATION / GF-01 future-block boundary
Open trusted Account provisioning             = NAVIGATION / privileged internal surface
W-03 / P-05 candidate selection               = explicit future-block boundary
review scenario and disclosure controls      = EPHEMERAL_UI
~~~

T-01 does not render a Control Plane rail, Workspace switcher, Account menu,
Workspace membership editor, role editor or future-block internals. A future
destination may terminate at the explicit boundary shown in the P8 artifact.

## 3. P9 — exact bidirectional backend trace

### 3.1 Product/backend → frontend

| Product capability / operation | Owner and exact wire truth | T-01 control / presentation | Success consequence |
| --- | --- | --- | --- |
| first Account self-provision | IAM-03 ProvisionAccount, trusted_bootstrap_context authority route; server derives the exact external subject; Idempotency-Key carrier | T-01A displayName required + optional email; Create my Account | AccountSummary is returned; bootstrap context is sealed; normal re-entry is required |
| current Account after re-entry | IAM-01 GetControlPlaneAccessContext, server-owned AccountSummary and disclosed Workspace/Project context | current Account presentation and Workspace collection state | SESSION_ESTABLISHED is truthful; empty Workspace collection becomes NO_WORKSPACE rather than failure |
| first Workspace creation | WS-01 CreateWorkspace, normal trusted platform_operator authority; name + Idempotency-Key | Workspace name required; Create Workspace only after normal session | response must contain workspaceId, name, creatorAccountId and initialAccessEstablished=true |
| later trusted Account provisioning | IAM-03 ProvisionAccount, ordinary platform_operator route; exact externalSubject + displayName + optional email | separate T-01B form, never part of first-run progression | AccountSummary only; no Workspace membership, Project grant or Published-App access |
| first Workspace continuation | GF-01 Projects frame, existing locked shell owner | Continue to Projects | T-01 ends at the explicit GF-01 boundary; it does not redraw GF-01 |

The bootstrap IAM-03 request does not contain a browser-supplied externalSubject.
The server resolves the subject from the exact current trusted bootstrap context.
The ordinary IAM-03 route may receive an exact externalSubject only after the normal
trusted platform-operator boundary is established.

### 3.2 Frontend → Product/backend

| Screen/control | Operation/read truth | Semantic owner | Capability / current authority | Client state |
| --- | --- | --- | --- | --- |
| Account displayName/email draft | IAM-03 bootstrap request variant | I&A / iam.account | exact trusted bootstrap context; self-only and one-shot | FORM_DRAFT |
| Create my Account | IAM-03 ProvisionAccount | I&A / iam.account | trusted_bootstrap_context; server-pinned issuer/subject match; Idempotency-Key | SERVER outcome + EPHEMERAL pending |
| Account-established summary | IAM-03 AccountSummary response | I&A / iam.account | successful Account establishment; old context is no longer valid | SERVER |
| Sign in to continue | configured OIDC authentication, then IAM-01 | Keycloak authenticates; Conexus I&A resolves Account/session | normal Conexus session, not provider claims as Product authority | EPHEMERAL transition → SERVER |
| current Account / empty Workspace collection | IAM-01 GetControlPlaneAccessContext | I&A / iam.account + current disclosure | current Conexus session and server-disclosed context | SERVER projection |
| Workspace name draft | WS-01 request body | Workspace owner | normal trusted platform_operator; current session rechecked | FORM_DRAFT |
| Create Workspace | WS-01 CreateWorkspace | Workspace owner | trusted operator + Idempotency-Key; no bootstrap context | SERVER outcome + EPHEMERAL pending |
| Continue to Projects | no Product operation | GF-01 navigation boundary | explicit future-block destination only | URL_NAVIGATION |
| Open trusted Account provisioning | no Product operation | T-01 internal navigation | only normal trusted platform operator session | URL_NAVIGATION / EPHEMERAL |
| exact externalSubject/displayName/email on T-01B | IAM-03 ordinary request | I&A / iam.account | platform_operator; exact subject intake; no provider-directory lookup | FORM_DRAFT |
| Provision Account | IAM-03 ordinary ProvisionAccount | I&A / iam.account | trusted platform_operator; Idempotency-Key; no implicit grant | SERVER outcome |
| Continue to W-03 / P-05 | no Product operation | future-block boundary | W-03 / P-05 owns membership and app-access choices | URL_NAVIGATION |

No local Account, Workspace, membership or authorization registry is created by
the frontend. Names and Account presentation are server projections; route and
machine identifiers remain untrusted navigation coordinates.

## 4. Material states, failures and recovery

T-01 makes the following owner and interaction states independently inspectable:

~~~
AUTHENTICATION_REQUIRED
IDENTITY_NOT_ELIGIBLE
BOOTSTRAP_IN_PROGRESS
ACCOUNT_INPUT_INVALID
ACCOUNT_CONFLICT_OR_AMBIGUOUS_INTAKE
DEPENDENCY_FAILURE
ACCOUNT_ESTABLISHED_REENTRY_REQUIRED
BOOTSTRAP_SEALED
SESSION_ESTABLISHED
NO_WORKSPACE
WORKSPACE_INPUT_INVALID
WORKSPACE_CONFLICT_OR_AMBIGUOUS_INTAKE
WORKSPACE_ESTABLISHED
~~~

State and recovery law:

| State / response | Human meaning | Required T-01 behavior |
| --- | --- | --- |
| AUTHENTICATION_REQUIRED / 401 | no normal Conexus session is available | return to configured sign-in; do not disclose Account or Workspace context |
| IDENTITY_NOT_ELIGIBLE / 403 | the exact setup identity cannot use this bootstrap path | show no existence detail; do not offer alternate subject intake |
| ACCOUNT_INPUT_INVALID / 422 | Account presentation draft is invalid | retain the draft, associate the error with the field and focus the invalid control |
| BOOTSTRAP_IN_PROGRESS | IAM-03 intake is pending | announce pending state; do not show Workspace creation or claim Account success |
| ACCOUNT_CONFLICT_OR_AMBIGUOUS_INTAKE / 409 or unknown result | Account outcome is not safely confirmed | preserve the same semantic intake and Idempotency-Key; no duplicate local Account and no success claim |
| DEPENDENCY_FAILURE | required dependency did not provide a safe result | keep recovery visible; never render this as a known-empty Workspace collection |
| ACCOUNT_ESTABLISHED_REENTRY_REQUIRED | Account was established but normal session is not yet re-established | show AccountSummary presentation, seal bootstrap and require explicit normal re-entry |
| BOOTSTRAP_SEALED | old context is being reused or a bootstrap path attempts WS-01 | reject the action; no Workspace is created; direct normal re-entry is the recovery |
| SESSION_ESTABLISHED | normal Conexus session has been resolved by IAM-01 | disclose current Account and continue to the first Workspace stage |
| NO_WORKSPACE | IAM-01 returned a successful known-empty Workspace collection | show Create your first Workspace; this is not a service failure |
| WORKSPACE_INPUT_INVALID / 422 | Workspace name draft is invalid | retain the draft, associate the error with the field and focus the invalid control |
| WORKSPACE_CONFLICT_OR_AMBIGUOUS_INTAKE / 409 or unknown result | WS-01 outcome is not safely confirmed | retry the same semantic intake and Idempotency-Key; no duplicate or success claim |
| WORKSPACE_ESTABLISHED | WS-01 returned exact identity and initial access | show Workspace identity and initial access confirmation; enable GF-01 Projects handoff |

An old bootstrap context cannot call WS-01. A successful WS-01 response must
prove that creatorAccountId is the current Account and initialAccessEstablished is
true; the frontend cannot manufacture that access consequence from a local grant.

## 5. Authorization, disclosure and identity boundaries

The accepted authentication and authorization boundary remains:

~~~
Keycloak/OIDC authentication
→ Conexus Account/session
→ IAM-01 current context
→ owner-specific Workspace/Product authority
~~~

TRUSTED_BOOTSTRAP_CONTEXT is a transient pre-Account principal for the exact
server-preconfigured OIDC subject. It can self-provision only its own Account
through IAM-03. It cannot choose another subject, create/read a Workspace, receive
ordinary Permissions, survive Account establishment or enter a normal Product route.

The ordinary platform_operator IAM-03 route is a separate trusted internal
surface. Its exact subject input is an Account identity key, not a Keycloak
directory search or an authorization grant. Account provisioning does not create
Workspace membership, Project access or Published-App access.

The following remain forbidden:

~~~
frontend visibility or review controls as authorization
browser-supplied bootstrap externalSubject
provider directory / provider role / group / organization as Product authority
AccountSummary or displayName as authorization
local Account→Workspace grants or an ID→name Product registry
Workspace creation under the sealed bootstrap context
default/reusable credential or public onboarding surface
generic Account profile/settings editor
generic Workspace chooser or Control Plane rail inside T-01
~~~

## 6. State custody, wire custody and structural obligations

| State / truth | Custody |
| --- | --- |
| bootstrap eligibility, exact OIDC subject and bootstrap expiry | SERVER |
| AccountSummary and Account establishment outcome | SERVER |
| normal Conexus session and current Account | SERVER |
| disclosed Workspace collection and Workspace identity | SERVER |
| Workspace initial access consequence | SERVER |
| Account / Workspace / ordinary provisioning drafts | FORM_DRAFT |
| Account → Re-entry → Workspace → Ready stage indicator | EPHEMERAL_UI |
| pending/recovery message and focus target | EPHEMERAL_UI |
| Review scenario selector and proof controls | EPHEMERAL_UI / fixture-only |
| setup or future-block destination | URL_NAVIGATION |

No fifth client-state class is needed. Fixture state may simulate owner responses
but never becomes Product truth, authorization truth, or a parallel transport
schema. The canonical path remains:

~~~
accepted 4A semantics
→ canonical 4B Identity/Workspace wire
→ generated transport/type projection
→ frontend consumer
~~~

The P8 artifact uses only inline HTML/CSS/vanilla JavaScript and deterministic
fixtures. It performs no live transport or browser persistence and selects no
framework, SDK, router, component package, state library or runtime mechanism.

Accessibility and responsive structure are part of the lock:

- one main landmark and one primary action per active stage;
- persistent labels and associated validation messages;
- aria-live status for pending, result and recovery changes;
- focus moves to invalid input or the next explicit re-entry/input control;
- progress is textual and not color-only;
- narrow layout becomes one column with no rail or drawer;
- re-entry and future-block controls are keyboard operable;
- the review disclosure is closed by default and Escape closes it with focus recovery.

## 7. Backend sufficiency and retained reopen seams

P9 found no contradiction invalidating the operator-approved P8. The existing
F03 recompile is sufficient:

~~~
IAM-03 ordinary platform_operator OR exact trusted_bootstrap_context
bootstrap request derives externalSubject server-side
WS-01 success proves initial creator access
IAM-01 returns canonical AccountSummary + disclosable context
ordinary Permissions remain 25
N_platform remains 128
~~~

No operation, Permission, semantic owner, principal class, trust boundary or
durable record class is added by T-01 P8/P9/P10.

Retained future/reopen seams:

1. a material security or Product falsifier may reopen the smallest F03/IAM/Workspace
   owner decision;
2. a real future recovery requirement may reopen only its exact recovery semantics;
3. a future direct Account rename/profile operation is not implied by AccountSummary;
4. W-03 / P-05 owns membership, Project access and Published-App access after the
   T-01B boundary;
5. exact URL spelling, visual design, router/framework, transport generator and
   runtime realization remain outside 4C.

These seams do not authorize public onboarding, generic directory administration,
P11 assembly, 4D selection or Product implementation.

## 8. P10 — pattern consolidation

Patterns reused because their protected semantics repeat across locked blocks:

~~~
explicit server-projection AccountSummary recognition
loading != known-empty != denied/non-disclosable != dependency failure
same-intake retry with idempotency and no ambiguous-success claim
semantic staged progression with explicit authority-boundary re-entry
persistent labels, aria-live recovery and keyboard focus path
textual state/progress communication instead of color-only meaning
explicit future-block handoff without silently designing the unopened block
~~~

The first-access staged progression is a T-01-specific semantic pattern. It is not
generalized into a global setup checklist, second navigation hierarchy or hidden
session authority.

Patterns deliberately not generalized:

~~~
generic Account settings/profile editor
generic Workspace chooser or Control Plane shell
provider directory / provider role/group/organization authority
public invitation/onboarding or reusable credential flow
frontend authorization or local membership/grant state
generic Account/Workspace CRUD, role editor or access dashboard
screen-shaped bootstrap/session convenience endpoint
~~~

## 9. Lock disposition

~~~
T-01 P8 = LOCKED / OPERATOR APPROVED
T-01 P9 = EXACT TRACE CLOSED
T-01 P10 = CONSOLIDATED
P11 = NOT ASSEMBLED
4D / Product implementation = NOT AUTHORIZED
~~~

Only a named material falsifier may reopen the smallest affected T-01 or upstream
F03/IAM/Workspace owner. This lock does not authorize P11, 4D, merge or Product
implementation.
