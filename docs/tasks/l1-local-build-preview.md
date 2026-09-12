# L1 — Local build and Preview task plan

> **For the next execution session:** use `superpowers:executing-plans` task
> by task, after recovering repository authority. T1 is an open prerequisite;
> this document does not authorize code, review services or live calls.

## Goal and design

A human signs in locally, creates a Project, asks Builder to create a small
application, opens its isolated Preview, interacts with the real application,
requests a change and sees the new candidate without losing the last usable
Preview. The app is an interchangeable proof consumer; it has no required
business domain or Budget Analyzer schema.

Use the accepted Keycloak/Hub/Workspace/Project and Mastra/E2B architecture.
Builder authors candidates; Registry owns immutable application artifacts;
Managed Application Runtime (MAR) serves or runs the admitted application;
Identity & Access owns current access checks. Preview is the application
running from its own URL. An iframe is only the Builder presentation of that
URL; opening the same URL directly is a supported Preview path. Local access
does not mean a local replacement for the remote coding sandbox.

**Design:** [approved local delivery design](../roadmap.md#approved-local-platform-delivery-design).
Status and execution authority live only in that roadmap. The selected design
and ordered implementation tasks below replace the earlier investigation-only
L1.1 checklist. Technical selections are a reviewable plan, not executed proof.
Execute an admitted packet using the repository method and Superpowers
executing-plans; delegation follows the repository's exact review routing.

## Required context and existing source

- [Product journeys A–C and Preview](../product/contract.md),
  [Builder operations](../product/operation-ledger.md),
  [Builder wire](../../contracts/api/product/builder-paths.yaml).
- [Builder owner](../reference/builder-and-harness.md),
  [scaffold/ownership](../reference/frontend-and-product-surfaces.md),
  [4D scaffold contracts](../phases/4d-project-paved-road-and-runtime-realization.md).
- [BLD-10 owner decision](../evidence/4f/4f-bld-10-current-subject-owner-decision-packet.md),
  [serving preparation](../evidence/4f/4f-preview-resumption-preparation.md).
- [Engineering method](../development/engineering-method.md) and
  [repository method](../development/repository-method.md). Reuse accepted 4C
  interactions; load its frontend method only for a material interaction gap.
- Existing composition: `apps/hub/src/server.ts`,
  `apps/hub/src/builder/{module,runtime,service,preview,routes,store}.ts`,
  `apps/hub/src/registry/{module,store}.ts`,
  `apps/web/src/features/builder/components/project-build.tsx`,
  `apps/web/src/features/builder/api.ts`,
  `scripts/generate-r1-s3-new-project-seed.mjs`.
- Existing proof entry points: `tests/implementation/bld-10-preview.test.mjs`,
  `tests/implementation/rb-builder-browser.test.mjs`,
  `tests/implementation/rb-builder-first-vertical.test.mjs` and the separately
  authorized `rb-builder-production-composed-live.test.mjs`.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Accepted decision and exact reading | Open question / expected output |
| --- | --- | --- |
| L1.1 identity | [BLD-10 disposition](../evidence/4f/4f-bld-10-4c-f15-owner-disposition.md), “Accepted omitted-changeId meaning” and “R1 custody disposition”; [decision register](../decisions/index.md), `4F-BLD-10` row | Baseline meaning is settled. Identify the complete source-custody successor and requalification needed before a new consumer binds `subjectDigest`; output a bounded change/proof envelope, not another Baseline-versus-HEAD decision |
| L1.1 artifact | [data/Registry](../reference/data-and-persistence.md), §§11.1–11.2; [BLD-10 decision](../evidence/4f/4f-bld-10-current-subject-owner-decision-packet.md), “Other independently reported open items” | Who produces exact app bytes from approved/candidate source, with what version/configuration and admission? Output one producer/consumer contract with explicit failure outcomes |
| L1.1 serving | [serving preparation](../evidence/4f/4f-preview-resumption-preparation.md), “Existing-owner composition”, “Proposed contract” and “Admission questions and falsifiers”; [security](../reference/security-and-authority.md), §§32.3 and 34.2 | Select transport, origin/session isolation, lifetime and conditional replacement. Preparation is not accepted serving implementation; output a reviewed contract proposal with each open choice named |
| L1.2 scaffold | [C-012](../decisions/index.md), [4D](../phases/4d-project-paved-road-and-runtime-realization.md), 4D-A/B; [frontend owner](../reference/frontend-and-product-surfaces.md), §§33.1–33.3 | Reuse React/TypeScript/Vite/TanStack and ownership separation. Select the app-artifact production seam and regeneration checks without replacing the stack |
| L1.2–3 experience | [frontend owner](../reference/frontend-and-product-surfaces.md), §§33.6–33.8; [Product](../product/contract.md), Journey C and §23.3 | Bind Preview/Code/Diff to exact real output. Reuse locked 4C interaction; reopen only a demonstrated missing interaction |
| L1.2 comparison | [Mitra influence](../research/mitra/influence-on-conexus.md), §§5 and 7 in the opening decision tables; technical appendix §11.4 if template behavior is unclear | Compare immutable deployment and rich scaffold patterns. Preserve Conexus artifact/session ownership; do not import Mitra token-in-URL behavior or its SDK signatures |
| L1.3 validation | [Factory influence](../research/factory-ai/influence-on-conexus.md), §§8–9 and 12; [C-017/C-019](../decisions/index.md) | Use finite behavioral assertions and focused context. Keep Conexus task files and risk-based review; do not add Mission files or mandatory worker fan-out |

For a Mastra producer/runtime API question, load
[Mastra](../../.agents/skills/mastra/SKILL.md), inspect
`apps/hub/src/builder/runtime.ts` and the installed `@mastra/core` / `@mastra/e2b`
exports before querying Context7. Questions must concern the selected build,
artifact collection or cancellation path; a general Mastra survey is not needed.

## Selected implementation design

This is the L1 implementation proposal prepared for a separate execution
session. It selects the mechanism and task boundaries; it does not claim
independent design acceptance, implemented behavior or live qualification.
The roadmap records admission. T1 includes the required owner/contract
reconciliation and material design checkpoint before Product code.

### Decisions and alternatives

| Concern | Selected realization | Alternatives and reason |
| --- | --- | --- |
| Source meaning | CURRENT_PROJECT remains approved Baseline; CHANGE_CANDIDATE remains its exact Project-contained candidate | Mutable Git HEAD is already rejected by accepted BLD-10 authority |
| Artifact production | A deterministic, non-agent build in a fresh pinned E2B sandbox, from Hub-custodied source | The coding worker is mutable and its summary is not build evidence; the present independent verifier cannot execute builds. Extending its role would mix two responsibilities |
| App scaffold | Versioned React/TS/Vite/TanStack profile delivered through an admitted Builder tool; preserve the existing R1 NEW seed | Rewriting old seed bytes breaks pinned custody. Asking the model to invent package versions and build configuration defeats the paved road |
| Preview transport | MAR serves the admitted application from a separate application origin and exact Preview route; Builder embeds that URL and can open the same URL directly | Same-origin app execution exposes the Hub. Direct E2B URLs couple Preview to a live coding sandbox. A frame transport would make pixels the product contract and lose normal application URL/DOM behavior |
| Artifact persistence | Extend existing Registry artifact/revision storage for a Project app artifact with an exact file manifest and bounded payload/backing | A new generic CAS service is unnecessary for this bounded consumer. Revisit blob backing at L3/larger bundles; the digest-addressed artifact port hides backing |
| Serving state | Existing MAR serving_route record class, with exact subject identity, route generation and expiry | previewId possession alone must not serve app bytes; an in-memory route cannot preserve last-good through Hub restart |

The existing Registry schema in migration 011 accepts only kind=brain and
UNIQUE(workspace_id, kind). T1 must explicitly reconcile its app extension:
nullable Project identity with a checked Brain/app ownership union; keep the
one-Brain-per-Workspace partial uniqueness and introduce Project/name app
uniqueness. This is a structural owner checkpoint, not a cosmetic migration.
Use the canonical app artifact kind from the accepted artifact schema; do not
create a parallel kind vocabulary.

### Artifact and build contract

The producer materializes only a Hub-admitted source bundle at the exact
sourceRevision. It uses a platform-owned runner/configuration, not candidate
npm scripts or candidate Vite plugins. No candidate server code executes in the
Hub. The sandbox has no credentials, Git remote or host mount; any build-time
network is separately pinned and admitted. The resulting application artifact
is a normal web application artifact, including its entry HTML, JavaScript,
CSS and bounded static assets, rather than a pixel stream or a Hub-fetched
executable bundle.

Select the already installed versions for the initial profile: Node 24.20.0,
npm 12.0.2, Vite 8.2.2, React/react-dom 19.2.8, TanStack Router 1.170.32 and Query
5.102.8. Mastra core 1.63.2, Mastra E2B 0.11.0 and E2B 2.46.1 are the inspected
runtime versions. Match the repository lock at execution bootstrap; drift is a
named re-pin question, not permission to resolve latest.

Create a dedicated, lock-backed app-profile manifest, template recipe and
generation check. Install its dependencies when producing the exact E2B
template, with lifecycle scripts disabled; no npm install/network at app build
time. Template publication is a separately authorized E2B action. The existing
template contains Node/Git, not this app toolchain.

The profile provides src/main.tsx, a React root, browser routing and
QueryClient setup, a minimal app component, CSS, an ordinary index.html for
standalone serving, and exact package/lock metadata. Generated toolchain
declarations are PLATFORM-CONTRACT; business components/styles are APP-OWNED.
The scaffold tool obtains profile bytes from trusted composition, takes no
arbitrary path/URL/package input, and refuses collisions instead of overwriting
an existing app. Existing apps must explicitly conform to this profile; no
silent conversion of imported apps.

The artifact runner invokes the adopted Vite build in a clean, platform-owned
configuration and collects the complete bounded output tree needed by the
application route. It may emit multiple JavaScript/CSS/assets files and must
preserve the routing fallback required by the profile. It refuses symlinks,
unresolved imports, unbounded assets, source maps where the profile does not
admit them and any output that cannot be served reproducibly. Use Vite 8's
adopted rolldownOptions, not an unverified old Rollup example. The app uses
normal source files and remains a normal web application when served directly.

L1 limits: 120 seconds per deterministic build; one active build per Project
and two per Hub; at most 8 MiB decoded JS plus CSS and 12 MiB total application
artifact payload. Reject extra output files, symlinks, invalid UTF-8 and byte
limits before registration. Bind producer recipe/template/profile/source
digests into the artifact identity. Canonical JSON and SHA-256 come from
packages/canonical-json.

```typescript
// New internal interfaces, defined in registry/application-artifact.ts.
export type ApplicationFile = Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>
export type ApplicationArtifactInput = Readonly<{
  projectId: string
  subjectKind: 'CURRENT_PROJECT' | 'CHANGE_CANDIDATE'
  subjectDigest: string
  sourceRevision: string
  profileDigest: string
  recipeDigest: string
  templateRef: string
  entryPath: 'index.html'
  files: readonly ApplicationFile[]
}>
export type ApplicationArtifact = Readonly<ApplicationArtifactInput & {
  artifactRevisionId: string
  artifactDigest: string
}>
export interface ApplicationArtifactPort {
  register(input: ApplicationArtifactInput): Promise<ApplicationArtifact>
  read(projectId: string, artifactRevisionId: string): Promise<ApplicationArtifact | null>
}
export interface ApplicationArtifactProducer {
  build(input: Readonly<{
    subject: import('../builder/preview.js').BuilderPreviewSubject
    projectId: string
    sourceBundle: Uint8Array
    signal: AbortSignal
  }>): Promise<ApplicationArtifactInput>
}
```

Registry recomputes the canonical digest; the worker cannot supply a successful
receipt. Same Project/subject/profile/recipe output is idempotent only if bytes
match; differing bytes for the same production identity refuse admission.
Store no timestamps or execution-attempt IDs inside the content digest.
Availability means registered bytes exist; verified remains Builder truth.

### Preview application URL and access contract

For the initial local profile, use separate local application ingress from the
Control Plane. The mental model may be `http://localhost:8080` for the Hub and
`http://localhost:8081` for the Preview application ingress. This port split is
process/topology information, not the security boundary: cookies ignore ports.
The concrete local configuration therefore uses distinct hosts/origins such as
`hub.localhost` and `preview-<route>.localhost`, or equivalent loopback hosts,
and rejects a widened cookie Domain. Hub cookies are host-only; the application
never receives the Control Plane session cookie.

The `8081` ingress is owned by MAR. For a static L1 application it serves the
immutable artifact directly. For a later dynamic application it may reverse
proxy to a separately managed process/container/sandbox. The user-visible
Preview URL remains the governed MAR route, not an arbitrary worker port or a
mutable coding-worker URL. No candidate server code executes in the trusted
Hub process.

MAR resolves the route from the current server-side subject, Project, exact
artifact, runtime profile, generation, access lease and expiry. A route must
never accept a caller-selected source, Project, artifact or destination. The
route serves the normal application entry HTML and its bounded static assets,
preserving browser routing and ordinary application behavior. The same exact
route is used in the Builder and when the operator opens Preview in a new tab.

For ready results, BLD-10's existing previewId becomes the stable route
reference only after the owner reconciliation admits that meaning. Non-ready
values stay correlation-only. Keep the existing closed BuildPreview shape,
ready/verified separation and live:false.

The Builder presents the application with `<iframe src="previewUrl">` when it
needs an in-panel view. The iframe is a presentation boundary, not the runtime
or the primary security boundary. The application origin, host-only session,
server-side route checks and capability policy provide the boundary. Use an
exact `frame-ancestors` policy and `referrer-policy: no-referrer`; permit only
the embedding Control Plane origin. Any parent/app `postMessage` protocol is
optional, versioned and checked with exact `event.source` and `targetOrigin`.
L1 does not admit app-to-Hub authority RPC or client-supplied readiness claims.

Preview access must not silently become Published-App access. Preview uses the
selected candidate and its test/private environment, while Published App uses
an exact active Release and independent app authorization. Revocation blocks
new route requests and serving; already delivered browser bytes are not
claimed to be retractable.

Browser proof must exercise the actual application URL both embedded and
standalone: navigation, forms, keyboard, storage behavior admitted by the
profile, popups/downloads where admitted, route identity, parent access and
forged messages. Network proof must distinguish requests to the Control Plane,
the application's own runtime, the Gateway and external destinations. A
request being rejected is different from claiming that the browser never
attempted it. If the selected product contract requires zero candidate request
to the Control Plane or zero external egress, the exact owner must admit and
prove that stronger property before implementation.

Routes expire after 15 minutes without renewal. An authenticated BLD-10 read
may renew an existing route for the same current subject; it never runs a build.
The Builder rechecks access/route before loading or replacing the iframe and on
focus; it removes the frame on expiry, mismatch or denied/failed recheck.
Revocation blocks the next server request immediately. Already delivered bytes
cannot be retracted from a browser; the UI removal interval is bounded to the
next active check, not a claim of retroactive secrecy or a timer guarantee in
a suspended tab.

Last-good belongs to a route with its own exact subject/artifact. While a new
candidate builds or fails, retain and label the old displayed subject; never
assign the old route to the new subjectDigest. A new candidate becomes selected
only after Registry admission and an expected-generation CAS in MAR.
Crash after registration before route update leaves an unreferenced immutable
artifact, not ready serving. Restart rechecks route bytes and current access.

### State and trigger contract

Artifact builds follow successful existing Builder candidate admission and
verification settlement. Build failure leaves the Change's independently
verified truth intact and Preview non-ready; it is not a verification PASS.
A technical request may prepare the approved CURRENT_PROJECT source only after
a source-exact artifact is absent. It must be an authenticated, CSRF-protected
POST under project.build, never a hidden build on GET. T1 selects this as:
POST /api/control/projects/:projectId/preview-preparations with optional changeId,
Idempotency-Key and current subject resolved server-side.
This owner-bound preparation is a required explicit contract refinement.

A durable preparation claim belongs to the existing Builder work-unit/ActorRun
and MAR route transition mechanisms, not a new global BuildJob class. T1 must
map these existing record classes before code; if they cannot represent a
non-cognitive build without fabricated Change/actor semantics, the owner
checkpoint must select a bounded extension. No implementation may silently
allocate a fake Change for a read or reuse the R3 queue to bypass its hold.

L1 handles static, data-free applications with a normal bounded multi-file
distribution. L2 adds only the admitted app-data transport it actually needs;
L3 may add server-side application execution. Artifact identity and
authorization ports remain reusable. These are delivery boundaries, not a
permanent restriction of Conexus to static applications.

## Ordered execution tasks

Use executing-plans in the next session. No task starts merely because its
predecessor file exists. Each code task starts with its named failing behavior,
implements only its file envelope, then runs focused proof. Commit/publication
and live calls follow the exact roadmap grant; task checkboxes do not grant them.

### T1 — Reconcile and accept the selected owner/wire contract

**Modify after admission:** docs/product/operation-ledger.md;
contracts/api/product/builder-paths.yaml; contracts/api/technical/openapi.yaml;
docs/decisions/index.md; docs/reference/data-and-persistence.md;
docs/reference/managed-execution.md; docs/reference/security-and-authority.md;
profiles/r1/v1/input-set.json and affected generated custody through producers.
The integrator owns this cross-owner write set; no parallel writer.

- [ ] Present the exact selected design above to Builder/Registry/MAR/I&A/R1
  review, including the preparation command, stable previewId refinement,
  app Registry extension, application-origin route and non-cognitive
  preparation record mapping.
- [ ] Before accepting this serving design or starting T2, admit a disposable
  browser-feasibility probe with synthetic bytes and no credentials/providers.
  Exercise the same application URL embedded and standalone, including
  navigation, forms, storage, parent access, forged messages and the complete
  network matrix. Record which requests are attempted and which are denied.
  If the required zero-Control-Plane or zero-external-egress property cannot
  be proved for a normal app runtime, route that exact requirement to the
  security owner; do not silently substitute a frame transport. T4 repeats the
  accepted assertions against the integrated runtime.
- [ ] Adjudicate the two fresh material review lanes under the repository
  routing before ratifying changed public/trust/storage semantics. This is
  one frozen design subject; unrelated findings do not expand L1.
- [ ] Record the accepted owner dispositions in their canonical documents.
  Preserve Baseline meaning; amend only new consumption/transport/storage.
- [ ] Recompute sourceRefs and the wire projection from exact source bytes,
  run the existing profile/compiler generators in dependency order, and
  regenerate affected R1/R2 consumers and new-seed exports. Historical receipts
  stay historical; emit a successor rather than editing an old PASS.
- [ ] Run F15/Builder/technical-wire checks and source-custody checks. Confirm
  the R1 seed remains semantically unchanged apart from generated contract
  provenance; do not put app business files into the frozen original seed.

**Completion:** accepted design/record mapping and reproducible custody
successor; same Baseline/Change semantics, explicitly admitted transports.
**Stop:** a missing/new semantic owner or record mapping required for correctness.
A failed owner checkpoint is a concrete prerequisite, not permission to improvise.

### T2 — Add the reusable app profile and isolated artifact producer

**Create:** profiles/l1-app/v1/package.json, package-lock.json, profile.json;
profiles/l1-app/v1/template/src/main.tsx;
profiles/l1-app/v1/template/src/App.tsx;
profiles/l1-app/v1/template/src/styles.css;
profiles/l1-app/v1/template/index.html;
scripts/generate-l1-app-profile.mjs; scripts/l1-app-artifact-runner.mjs;
scripts/l1-app-e2b-template.mjs;
apps/hub/src/builder/application-artifact-runtime.ts;
apps/hub/src/builder/application-scaffold-tool.ts;
apps/hub/src/registry/application-artifact.ts;
tests/implementation/l1-app-profile.test.mjs;
tests/implementation/l1-app-artifact.test.mjs.
**Modify:** apps/hub/src/builder/runtime.ts and module.ts; package.json;
scripts/conexus-verify.mjs for named leaves only.

- [ ] First write profile regeneration/collision tests and producer tests for
  same exact inputs, changed bytes, extra outputs, links and exceeded limits.
- [ ] Implement the lock-backed profile generator with --check; expose its
  exact template bytes through the narrow scaffold tool and Builder context.
- [ ] Implement the fixed Vite runner in a fresh pinned sandbox using the
  ApplicationArtifactProducer interface; no package/network/model call in build.
- [ ] Assert source identity before/after materialization and collection;
  bound file count/size and destroy the exact sandbox in finally.
- [ ] Prove real Vite output locally only in an explicitly admitted disposable
  test environment; never run arbitrary candidate config in the trusted Hub.
  Admit/publish the exact E2B template separately before real remote proof.

**Focused command:**
```bash
node --test --test-concurrency=1 tests/implementation/l1-app-profile.test.mjs tests/implementation/l1-app-artifact.test.mjs
```

### T3 — Register app bytes and conditionally select Preview

**Create:** apps/hub/migrations/026_l1_application_preview.sql;
apps/hub/src/registry/application-artifact-store.ts;
apps/hub/src/mar/preview-store.ts;
apps/hub/src/builder/preview-service.ts;
tests/implementation/l1-preview-store-postgres.test.mjs;
tests/implementation/l1-preview-service.test.mjs.
**Modify:** registry/module.ts; builder/service.ts, store.ts, module.ts and
preview.ts. Migration number 026 is reserved only if still unused at bootstrap;
do not overwrite another session's migration.

- [ ] Write PostgreSQL falsifiers for one Brain per Workspace, independent app
  artifacts per Project, cross-Project refusal, stale route CAS and immutable
  artifact mismatch. No broad runtime DML grants.
- [ ] Extend Registry only as accepted in T1; create MAR serving_route with
  subject/artifact binding, monotonically changing generation and expires_at.
  Use domain-specific SQL functions and narrow runtime roles.
- [ ] Implement register/read and preparation/route settlement through the
  accepted record mapping. Pending/failure cannot overwrite last-good.
- [ ] Connect candidate settlement to the producer; on startup reconcile
  interrupted preparations and existing routes without trusting process state.
- [ ] Prove crash before/after artifact registration and before/after route CAS.
  Orphans remain unavailable to unauthenticated consumers; no speculative GC.

**Focused command:**
```bash
node --test --test-concurrency=1 tests/implementation/l1-preview-service.test.mjs tests/implementation/l1-preview-store-postgres.test.mjs
```

### T4 — Serve and compose the real Preview application

**Create:** apps/hub/src/mar/preview-routes.ts;
apps/web/src/features/builder/components/build-preview-frame.tsx;
tests/implementation/l1-preview-http.test.mjs;
tests/implementation/l1-preview-browser.test.mjs.
**Modify:** builder/routes.ts; platform/config.ts; server.ts; http/app.ts;
apps/web/src/features/builder/api.ts and components/project-build.tsx.

- [ ] Start with HTTP route, denial, cache, content-type, artifact-identity and
  application-origin tests, followed by real-browser tests for the same URL
  embedded and standalone.
- [ ] Add local application-ingress configuration and fail closed on
  Host/origin/cookie collision. Serve only the exact MAR route and admitted
  artifact; candidate server code never executes in the Hub.
- [ ] Implement route serving with current access, Project/subject/artifact
  checks, finite limits, exact entry/assets and request authenticity for any
  mutation or preparation.
- [ ] Implement the Builder iframe as a URL presentation of the MAR route and
  support opening that same route directly. Do not copy candidate HTML into the
  parent DOM or create app-to-Hub authority RPC.
- [ ] Wire last-good display, explicit candidate status and renewal/revocation.
  Keep BLD-10 ready independent of verification/live.
- [ ] Validate application fidelity and browser security before accepting the
  runtime mechanism. If a falsifier survives, stop at this task and revise its
  owner contract or route the stronger requirement to PBR/another runtime.

**Focused command:**
```bash
node --test --test-concurrency=1 tests/implementation/l1-preview-http.test.mjs tests/implementation/l1-preview-browser.test.mjs tests/implementation/bld-10-preview.test.mjs tests/implementation/rb-builder-browser.test.mjs
```

### T5 — Compose and hand over the real local journey

**Create:** tests/implementation/l1-local-build-journey.test.mjs;
scripts/l1-local-check.mjs.
**Modify:** this task's operator runbook; package.json; scripts/conexus-verify.mjs;
.github/workflows/verify.yml only for new objective offline checks.

- [ ] Implement a real-composition test: Keycloak login, Workspace/Project,
  Baseline, initial Builder app, Preview interaction, user-requested change,
  new Preview and last-good behavior under injected build failure.
- [ ] Add a second same-purpose source fixture with different app content/schema
  to detect business-domain hardcoding; no Budget Analyzer dependency.
- [ ] Gate actual model/E2B calls explicitly with CONEXUS_L1_LIVE=true and an
  exact recorded operator grant. Default tests use controlled ports and report
  their narrower proof; a skipped live test does not satisfy L1 closure.
- [ ] Record actual local URLs, startup commands, required secret-file variable
  names, profile/template identities and observed proof. No secret values.
- [ ] Run the flat candidate verification graph and required CI properties in
  pinned Linux, with clean-install/browser/DB prerequisites where applicable.
  Freeze the candidate for the required independent implementation review.
- [ ] Reconcile remaining local-release lifecycle scope without expanding L1:
  import/duplicate/Areas/general consultant remain follow-on decisions in the
  roadmap census. L1 completion claims only its stated construction journey.

**Focused command:**
```bash
node --test --test-concurrency=1 tests/implementation/l1-local-build-journey.test.mjs
```

## Falsifiers and final acceptance

L1 is complete only if one exact candidate supports all of:
local authenticated creation; Builder-produced app source; immutable artifact
provenance; usable isolated Preview; a second requested change; last-good on
failure; current access denial; no candidate credential/egress escape; honest
ready/verified/live and errors. A source-inspection PASS is not an executable
app test, and a browser fixture is not the real model/E2B journey.

Example required assertion shape for the new HTTP suite:
```typescript
const denied = await app.inject({
  method: 'GET',
  url: '/preview/' + routeId + '/index.html',
  headers: authorizedHeaders,
})
assert.ok([403, 404].includes(denied.statusCode))
```
The route must resolve Project/subject/artifact server-side; the request above
uses a caller from another Project and must not disclose application bytes. In
browser proof, assert observed network attempts and frame behavior, not just
the presence of CSP/sandbox attributes. PostgreSQL proof must cover runtime
roles and stale transitions, not only mock port responses.

## Handoff, authority and research evidence

The plan is written for owner/design review and ordered execution preparation.
It is not independently ratified or code-proven. The next session starts at T1,
not another general architecture survey. The exact unresolved admission is
the changed transport/Registry/record mapping, application-origin serving and
browser/runtime feasibility in this selected proposal;
acceptance is not inferred from writing the plan. Once the roadmap admits the
bounded code envelope after that checkpoint, routine T2–T5 steps do not each
need another planning approval.

Use a clean inspection of the existing dirty worktree; all pre-existing changes
remain user-owned. Do not reset/stash or publish them. R3 stays on hold and its
candidate/proof cannot be consumed by name. No commit, push, PR, merge, E2B
template publication or real provider call was performed to prepare this plan.

Sources inspected for the choices above:
- Local seed generator and Registry migration 011: actual scaffold and
  Brain-only storage limits, not inferred absence from documentation.
- Builder runtime/service/verifier: exact source-bundle output and read-only
  verifier tools; a real app build is a distinct missing producer.
- Installed Vite types: build.lib/rolldownOptions exist in 8.2.2.
  [Official build options](https://vite.dev/config/build-options) describe library
  packaging; actual output constraints are proved by T2.
- [MDN iframe](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe),
  [CSP sandbox](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Content-Security-Policy/sandbox)
  and [postMessage](https://developer.mozilla.org/en-US/docs/Web/API/Window/postMessage):
  origin, embedding and messaging constraints inform T4; they are not browser
  proof for this exact composition.
- Comparative platform evidence: [Replit preview and publishing](https://docs.replit.com/learn/projects-and-artifacts/replit-deployments),
  [Lovable preview links and publishing](https://docs.lovable.dev/features/share-project),
  [v0 sandbox](https://api2.v0.dev/docs/sandbox),
  [Netlify preview server and iframe composition](https://docs.netlify.com/manage/visual-editor/local-development/),
  [StackBlitz WebContainers](https://developer.stackblitz.com/guides/user-guide/available-environments),
  [Base44 test-data Preview](https://docs.base44.com/documentation/managing-app-data/testing-your-data),
  [Vercel Sandbox](https://vercel.com/docs/sandbox) and
  [E2B sandbox ports](https://e2b.dev/docs/sdk-reference/js-sdk/v2.6.2/sandbox).
- Context7 /mastra-ai/mastra: E2BSandbox sandboxId, executeCommand and the public
  e2b.files access path; installed code already uses these interfaces.
  No framework version or runtime replacement was selected.
