# First Builder-created app

## Outcome and boundary

An authenticated operator asks Builder for an application, opens the actual
application in Preview, requests a second change, and uses the changed version.
Conexus is the Product; the demonstration app is an interchangeable consumer.
Manual store knowledge and narrowly scoped SDK/Sankhya operations follow in the
same app. They remain part of the pilot, not prerequisites for its first build.

The operator clarified the Builder model during this round. It acts like a
coding CLI inside the app's directory: inspect/search files, edit normal source,
run admitted commands, inspect results and continue the same app on the next
request. The chat UI is its presentation. This does not select Codex CLI or
Claude Code CLI as a dependency, expose the Conexus repository/host filesystem,
or require one physical sandbox to remain alive between requests. Durable app
source and explicit continuation must survive sandbox replacement.

Current admission and next action belong to [roadmap](../roadmap.md#current-grant).
This packet is the single design and experiment owner for this increment.
Architect alternatives are temporary working material, not competing roadmaps.

The design must preserve source identity, app/Hub isolation, server-held
credentials, truthful failures and existing ownership. It does not implement
arbitrary app servers, autonomous Brain learning, a universal SDK, public
deployment, business Product Agents or whole-repository consolidation.

## Directed MVP consolidation

On 2026-09-11, the operator approved recording the assessment and proposed
continuation after clarifying that the former R/L delivery plans are legacy.
The decision is to consolidate the smaller MVP already selected, reuse useful
work, and resolve the remaining uncertainties before further implementation.
This agreement does not certify the full design or its end-to-end behavior.
Mutable progress and admission remain in the
[roadmap tracking table](../roadmap.md#current-direction-and-tracking).

### Internal-use clarification

On 2026-09-12, the operator clarified that the immediate consumer is a
nontechnical Metalnobre employee who asks for an app without choosing the stack,
database access pattern or deployment mechanism. The current objective is an
internal working platform, not a commercial multi-customer release. Reuse the
existing Mastra Builder, a fixed app template, company context and a narrow set
of executable platform operations. Their exact interfaces remain design work.

The operator prefers less security-related scope and ceremony at this stage.
No specific existing authorization boundary was waived by that preference.
Identify which protections the internal deployment actually needs instead of
adding commercial-platform requirements or silently exposing ERP credentials.

The pasted GPT Pro response proposes compiled, retained Preview output and
explicitly labelled demonstration data before real integration. That mechanism
overlaps this task and its observed compiler proof. Its proposed patch targets
the historical Preview preparation record, not this current task. The patch
bytes were not provided here or applied. External analysis is an advisory input;
reconcile it with the local candidate before repeating work or changing owners.

Demonstration data can support a named Preview experiment. It cannot establish
that the app answers a real Metalnobre question. The next experiment proposal
must target a remaining integration risk rather than repeat clean compilation.
Keep responses and external-model briefs concise and scoped to that question.

### Analysis snapshot verification

On 2026-09-12, the operator requested publication for GPT Pro to inspect the
current local state. The analysis branch is `analysis/internal-mvp-2026-09-12`.
It preserves the existing local parent commit and current repository changes,
including suspended planning inputs. It does not integrate the isolated
Registry draft or include temporary experiment output and credentials.

Fresh checks in pinned WSL Node 24.20.0 and npm 12.0.2 produced these results:

- `npm ci` and `npx --no-install playwright install chromium` succeeded.
  npm reported the esbuild postinstall script as blocked by its allowScripts
  policy. That policy was not changed.
- `npm run verify` failed in the first admission leaf. The historical manifest
  records lockfile digest
  `ede0a3a28c66f20226594143ee1a3e549523a2442f30dd7036eaa6d8a7c3cd7a`,
  while the current lockfile has digest
  `7331c6c4549c357eeb2038b53d1ca64033d6d0d42401472456823cc067c40600`.
  The runner stopped; later leaves were not executed by that run.
- The separately executed `npm run r1:r1c14:native:check` failed with
  `R1C14_NATIVE_REVIEW_OUTPUT_READ_ONLY` on the recorded review-command comparison.

These are tracked verification failures, not waived checks or proof that the
runtime works. No pin, review record or implementation was changed to pass them.
Publication is for inspection of an unfinished candidate, not release or merge.
The roadmap remains the current-work authority; historical stage names do not
restore their former execution plans.

Inspection of the failures found historical coupling in current required
checks. `r1-a0-admission.test.mjs` compares the entire current lockfile with an
older manifest. `check-r1c14-native-readmission.mjs` reconstructs today's review
prompt and compares every argument with a recorded past invocation, including
prose. Those mismatches alone do not establish a broken app or unsafe review.
They also do not invalidate all R1 checks. Reconciliation must distinguish
historical reproducibility from current dependency, isolation and data-integrity
properties. No checker or historical receipt was changed in this snapshot.

### Keep the product outcome

The first increment is an authenticated user creating an app through Builder,
using its Preview and requesting a second change to that same app. Builder
works on normal source files through the existing Mastra coding path. The
compiler experiment supports the fixed app profile, not arbitrary app backends.

The MVP also includes manually maintained store Brain knowledge, narrow SDK
operations with a real authorized Sankhya consumer, and access for a colleague.
Those outcomes must fit the minimum architecture even though their detailed
implementation follows the first app. A creator-only Preview is not the whole
MVP. No particular demonstration app is mandatory.

Keep automatic Brain learning, business Product Agents, universal SDKs and
general app-server execution outside this pilot. Investigate another technology
only when an identified requirement or failed experiment justifies comparison.

### Preserve evidence without enlarging its claim

| Existing work | What the record supports | What it does not establish |
| --- | --- | --- |
| [Compiler experiment](#observed-compiler-result) and [adapter observations](#implementation-observations) | Isolated compilation of controlled app source and usable output in a browser; production compiler adapter exercised | A human request through the authenticated Builder creating a retained, authorized Preview |
| [Migration isolation observations](#migration-isolation-observations) | Local migration-selection and PostgreSQL behavior for the named candidate | Independent review convergence, full candidate acceptance or permission to resume Registry |
| [Registry checkpoint](#retention-checkpoint-and-migration-blocker) | Preserved isolated draft and identified persistence dependency | Integrated Registry retention, durable Preview or a completed app journey |
| [Browser access design](#browser-access-and-presentation) and [continuation semantics](#exact-continuation-semantics) | Concrete proposals available for focused validation | Proven authenticated browser behavior or a second human request continuing the previous app |

Preserve these inputs. Do not repeat a successful compiler experiment merely
because planning terminology changed. Reopen a choice when new evidence
contradicts its claim or when the next consumer needs a property not yet proved.

### Resolve the gaps before expanding implementation

Consolidation must locate the existing answer, or record an explicit decision,
for where the Hub, coding workspace, compiler and app execute; where app source,
artifacts and data persist; and how the app accesses platform resources without
receiving platform credentials. Confirm that the static app profile can consume
the required server-held operations. Do not assume this requires a generic app
backend or assume that a static Preview alone proves the integration.

The high-impact validation questions are:

| Question | Required observable evidence | Result that challenges the proposal |
| --- | --- | --- |
| Does the authorized Preview work in the intended browser topology? | Real app opens in iframe and new tab with the selected access flow; Hub cookies and credentials stay out of the app; unauthorized access is refused | Browser restrictions break intended access, or app access exposes Hub authority |
| Can a second human request evolve the same durable app? | First version is used, a new request edits its verified source, changed version is used, and prior source and artifact remain recoverable after sandbox replacement | The request restarts from the baseline, loses prior work, or depends on a resident coding sandbox |
| Can the app use Brain and the required integration safely? | Builder uses the selected manual Brain content; an app action reaches the narrow authorized server operation with observable outcome and truthful failure | The app needs browser-held platform credentials, a mock substitutes for the integration, or the selected app profile cannot support the operation |

These are proof requirements, not new execution grants or claims of success.
Specify exact resources, effects and limits before a live experiment. Use real
consumer behavior for the claim being decided. A focused experiment can resolve
one risk without being represented as the complete Builder journey.

### Continue in the existing documents

Use brainstorming for unresolved scope and decisions. Use architect when an
interface or process boundary needs design, and arena when credible alternatives
need comparison. They are not mandatory repeated steps for every increment.
Consult existing owners and the Mitra/Factory research for a named question;
use current framework documentation or Context7 when the answer depends on it.

Keep the roadmap as the progress and next-action record. Keep detailed choices,
proof references, failures and remaining questions in this task. Reconcile the
smallest affected architecture or decision owner when a proposal changes its
meaning. Do not introduce another plan hierarchy or erase historical files as
part of this tracking update.

At each checkpoint, update the roadmap state and next action, and record the
deciding result and its limits here. Distinguish selected design, implemented
candidate and demonstrated behavior. The next increment is ready to implement
when its observable behavior, interfaces, constraints and verification are
clear and its required authority is present. The entire platform need not be
specified first; a detailed plan does not guarantee that experiments will pass.

## Grounding

The investigation subject is `main@3baea8d0a5296b2e75f3519f52bcf96e9d0ef5d9`
with the pre-existing documentation-only dirty state. The previous parallel
Builder/Brain investigation remains applicable because Product source did not
change. This round rechecks the build boundary and second-change lineage.

The existing path is login, Workspace/Project, approved Baseline, CreateChange,
Hub-custodied Git source, Mastra/E2B coding, candidate admission, independent
verification, and source/diff inspection. It is implemented code, not a claim
that the present environment completed that journey.

- [Builder runtime](../../apps/hub/src/builder/runtime.ts) materializes an exact
  Git bundle in a network-denied E2B sandbox, runs `createCodingAgent`, returns
  a candidate commit/bundle and destroys the sandbox. Its URL cannot be the
  durable app runtime.
- [Builder service](../../apps/hub/src/builder/service.ts) requires remote E2B
  coding and verification. It does not compile or serve an application.
- [Preview](../../apps/hub/src/builder/preview.ts) always returns `ready: false`
  and `live: false`. The [Build UI](../../apps/web/src/features/builder/components/project-build.tsx)
  presents source and that non-ready projection, not an application iframe.
- [NEW seed generator](../../scripts/generate-r1-s3-new-project-seed.mjs)
  preserves three pinned generated/platform files, with no app source template.
- [Builder source port](../../apps/hub/src/builder/source.ts) separates main
  from candidate refs. A second prompt must not silently start from the original
  baseline or be represented as a verifier correction.

The gap is a supported app template, isolated compilation, retained output,
authorized URL, browser use, and genuine continuation from the previous app.
Preview availability is distinct from verification, acceptance and publication.

The focused continuation trace found a concrete missing behavior.
`builder.create_change` in migration 020 selects the approved Baseline source;
verification settlement inserts `builder.change_acceptance` without updating
Baseline or Git main. Migration 021 continues a candidate only for the bounded
automatic correction of that same Change after failed verification. The API
accepts `intent`, not a predecessor. Therefore a second human prompt currently
does not establish evolution of the first candidate. The design must explicitly
choose predecessor continuation or a governed current-source update, with
stale-parent refusal. It must not call a new human request a verifier correction
or silently turn verification acceptance into source promotion.

Existing semantic constraints come from [Builder operations](../product/operation-ledger.md#54-builder--20),
[deployment ownership](../reference/release-deployment-and-operations.md#355-managed-serving),
and the preserved [L1 proposal](l1-local-build-preview.md). L1 is an unaccepted
design input, not a mandatory implementation package. Registry owns immutable
artifacts; MAR owns serving/lifecycle; I&A owns access. Physical co-location does
not merge ownership. Any necessary owner refinement must be named before code.

Throughput checkpoint: this round removes the missing build/serving and
second-change contract. It does not claim delivery progress from document count.
Stop after one comparative round unless a concrete contradiction invalidates it.

## Proposed design

Keep the existing Mastra coding agent and a normal app directory. Add one
platform-owned React/TypeScript/Vite profile under `app/`. Compile admitted
candidate source in a fresh build-only E2B sandbox. Registry retains the static
HTML, JavaScript, CSS and assets. MAR serves them locally from a separate app
origin. No app server, resident E2B worker or general functions runtime is needed
for this profile. These are proposed choices at the requested checkpoint, not
ratified owner changes or demonstrated runtime behavior.

```text
Human request in Builder
  -> approved Baseline or selected verified predecessor
  -> app/ files in isolated Mastra coding workspace
  -> Git candidate admission and independent verification
  -> fresh non-agent compiler -> Registry immutable files
  -> MAR authorized app URL -> iframe and new tab
Next human request selects that candidate as its exact work parent.
```

### Usage before interfaces

The UI submits the first intent against the approved Baseline. Existing Change
polling shows coding and verification. Compilation has a separate outcome;
verification success alone never displays a ready app. Once the exact artifact
is available, the operator opens Preview. The app executes real browser code.

For the next request, the UI includes the displayed candidate's Change ID and
source revision. The server resolves and authorizes that predecessor. Builder
edits those files, not the original seed. A failed request leaves the first
version available with its original label. No request silently promotes Git
main, replaces the approved Baseline or publishes an application.

Illustrative caller flow below describes proposed contracts, not existing APIs:

```typescript
const created = await createChange({
	accountId, projectId, idempotencyKey, intent, parent: approvedBaseline,
})
const first = await waitForVerifiedCandidate(created.changeId)
const available = await prepareCandidatePreview(first)
await openAuthorizedPreview(available)
const second = await createChange({
	accountId, projectId, idempotencyKey: nextKey, intent: nextIntent,
	parent: { kind: 'VERIFIED_CANDIDATE', expected: first },
})
```

The asynchronous wait matters. `CreateChange` does not return a ready candidate.
These helpers represent existing polling plus the proposed operations; they are
not extra public services or methods to implement one for one.

### Data and responsibility sketch

Use existing owner-issued IDs and schema-derived types when implementing.
This sketch is deliberately unimplemented and has not been typechecked.

```typescript
type CandidateRef = Readonly<{
	projectId: string; changeId: string; sourceRevision: string
}>
type RequestedParent =
	| Readonly<{ kind: 'APPROVED_BASELINE'; expectedBaselineDigest: string }>
	| Readonly<{ kind: 'VERIFIED_CANDIDATE'; expected: CandidateRef }>
type AdmittedInput = Readonly<{
	baselineDigest: string; baselineSourceRevision: string
	workParent: CandidateRef | Readonly<{ kind: 'BASELINE'; sourceRevision: string }>
}>
type ArtifactInput = Readonly<{
	candidate: CandidateRef; profileDigest: string; recipeDigest: string
	templateRef: string; entryPath: 'index.html'
	files: readonly Readonly<{
		path: string; mediaType: string; bytes: Uint8Array; sha256: string
	}>[]
}>
type ArtifactRef = Readonly<{
	candidate: CandidateRef; artifactRevisionId: string; artifactDigest: string
}>
type PreviewAvailability =
	| Readonly<{ kind: 'ABSENT' }>
	| Readonly<{ kind: 'BUILDING' }>
	| Readonly<{ kind: 'FAILED'; code: string }>
	| Readonly<{ kind: 'AVAILABLE'; artifact: ArtifactRef }>
declare function createChange(input: {
	accountId: string; projectId: string; idempotencyKey: string
	intent: string; parent?: RequestedParent
}): Promise<{ changeId: string }>
declare function compileCandidate(input: {
	candidate: CandidateRef; sourceBundle: Uint8Array
	profileDigest: string; recipeDigest: string; signal: AbortSignal
}): Promise<ArtifactInput>
declare function registerApplication(input: ArtifactInput): Promise<ArtifactRef>
declare function launchPreview(input: {
	accountSessionId: string; candidate: CandidateRef
}): Promise<{
	previewUrl: string; entryUrl: string; entryGrant: string; expiresAt: string
}>
```

The HTTP parser resolves references into admitted input; client IDs and digests
never authorize themselves. Validate file paths and payloads again when E2B
output crosses into Registry. Availability is not Builder verification and an
artifact reference is not an access grant. The existing closed BLD-10 wire shape
must not be extended in code before its owner/wire refinement is recorded.

### Exact continuation semantics

Refine BLD-03 instead of adding BLD-21. Preserve the approved Baseline root and
record a separate work parent for each new human Change. Omitted parent retains
the existing Baseline behavior. Explicit candidate continuation requires the
same Project, current build authority, the exact current predecessor ref and
current verification acceptance bound to that revision and Baseline.

Include the parent in idempotency identity. Replaying the same intent/key/parent
returns the same Change; changing the parent with that key conflicts. A missing,
unverified, changed, foreign or stale-Baseline parent fails before dispatch.
Materialize the server-selected source ref, never a client-provided Git ref.

The second candidate's first commit must parent the first candidate's commit.
Update source admission and verification to distinguish the immutable Baseline
root, the human request's work parent and any same-Change correction parent.
The current verifier's one-to-two-commit bound applies to one Change, not the
entire chain from the original Baseline. Migration 021 remains automatic
correction, never the mechanism for a new human intent.

Concurrent requests may produce separate immutable Changes from an explicit
parent. This does not create a shared mutable draft head. The UI replaces its
display only when the result matches its currently selected Change; an older
completion cannot replace a newer selection. Any later canonical-source
promotion remains a separate Project/Release consumer.

### Workspace, compiler and retained output

The platform adds the fixed app profile once, with collision refusal. Preserve
the historical NEW seed and its generated files. The model can inspect app
files, edit app-owned source and run admitted commands in the isolated project.
Use the filesystem and command tools already provided by Mastra. Do not install
coding CLI binaries or create another agent framework.

Working-directory instructions are not containment. Git admission protects
platform/generated paths. Compilation never executes candidate package scripts,
plugins or Vite configuration on the Hub. A clean E2B image contains the exact
profile toolchain; a trusted runner compiles the admitted commit without network
or package installation. Unsupported imports/dependencies fail visibly.

Inspected package pins are Node 24.20.0, npm 12.0.2, Vite 8.2.2, React/react-dom
19.2.8, Mastra core 1.63.2, Mastra E2B 0.11.0 and E2B 2.46.1. Recheck the lock
before execution. These source facts do not prove that an existing E2B template
contains the app toolchain. Image creation/publication needs its own exact grant.

Proposed first-profile bounds are 120 seconds for compilation, 180 seconds for
the build sandbox lifetime, 256 output files and 12 MiB total output. Reject
symlinks, traversal, undeclared media types and oversized output. Registry
recomputes hashes and binds source, profile, recipe and immutable template to
the output. It commits availability only after bytes are retained. Two builds
of the same input must be compared before claiming reproducibility.

Use a narrow Builder-owned build-attempt refinement with an expiring claim and
attempt identity, subordinate to the candidate. Do not consume R3 queues or add
a generic job framework. Keep run timing outside the content digest. Late
results from expired attempts cannot settle a replacement. A failed build does
not clear verification or relabel an older artifact as the failed candidate.

Git lineage and Registry files survive restart. In-flight build work is reported
interrupted; retry starts a fresh sandbox after the old claim expires. Reopening
retained output needs fresh access, not recompilation. Browser grants can expire
on Hub restart; no uninterrupted-session claim is needed for this pilot.

### Browser access and presentation

Use distinct configured Hub and route-specific Preview HTTPS hosts. Keep the
existing Secure, HttpOnly, host-only Hub session. Ports alone are not cookie
isolation. The local hostname/certificate binding is a feasibility prerequisite,
not permission to install a root certificate or change host networking.

Propose one I&A-owned, single-use 30-second entry grant from an authenticated,
CSRF-protected `POST /api/control/projects/:projectId/preview-launches` with the
exact `changeId`. Bind it to session, Project, candidate, artifact and exact
Preview host. The result contains a server-derived `entryUrl` on that host at
`/__conexus/preview-entry`, the clean `previewUrl`, expiry and the entry grant.
The Hub submits the grant by form POST to `entryUrl`, targeting the intended
iframe or new tab. The platform-owned endpoint accepts only that exact Hub
Origin and the one-use grant, never candidate-controlled redirects;
consume it atomically, set a Preview-only host-only cookie, then redirect to the
clean app URL before generated HTML executes. No bearer in the lasting URL,
generic Hub-session sharing or app-controlled destination is admitted.

MAR checks exact host, route, current permission and expiry for every asset.
Propose a 15-minute grant, renewed only by current authenticated Hub authority.
The route identifier alone grants nothing. The app host exposes bootstrap and
static serving, not control-plane APIs. Refuse unknown files; fallback to the
SPA entry only for admitted navigation paths. Use no-store and no-referrer.

The final delivery includes the same app URL in an iframe and a new tab.
Browser cookie behavior is unproven; opening a top-level window does not prove
embedded access. Exercise the exact host/cookie profile in Chromium before
freezing it. Do not solve blocked embedding by sharing Hub cookies, exposing a
public route or claiming that the new-tab-only result completes the delivery.

Platform-owned CSP permits the app's required local scripts/styles/assets and
denies unadmitted connections, workers and form destinations. Frame ancestry
names the exact Hub origin. Browser policy must be tested, not treated as a
universal guarantee that hostile code cannot attempt a network request.
Revocation denies new requests; already delivered bytes cannot be retracted.
The [cookie reference](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie)
and [iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
support the browser questions; neither validates this proposed composition.

### Module map and owning changes before implementation

| Boundary | Existing files and proposed narrow addition | Required refinement |
| --- | --- | --- |
| Human continuation | `builder/{routes,store,service,source,runtime,verification-runtime}.ts`; `contracts/api/product/builder-paths.yaml` | BLD-03 parent coordinates, separate work parent, exact source/verification lineage and source admission |
| App profile | Proposed `profiles/builder-app/v1/` and `builder/application-workspace.ts` | Fixed template bytes and ownership; no historical seed rewrite |
| Compilation | Proposed `builder/application-artifact-runtime.ts` and Builder-owned attempt storage | Exact non-agent build/cancellation and subordinate attempt record; no R3 queue reuse |
| Immutable output | Existing Registry plus proposed `registry/application-artifact-store.ts` | Extend Brain-only Registry constraints for Project app artifacts without weakening Brain uniqueness |
| Preview access/serving | I&A and proposed `mar/preview-routes.ts`, `mar/preview-store.ts`; `server.ts` | Entry grant, route/asset authorization, expiry, local ingress and BLD-10 readiness/launch wire |
| Presentation | `features/builder/components/project-build.tsx` and Builder API client | Exact candidate polling, iframe/new tab, continuation and truthful errors |

Paths without a current file are proposed implementation targets, not existing
APIs. Freeze the smallest owner changes in Product operations/wire, Builder,
Registry, MAR and I&A before code consumes them. This proposal preserves their
ownership but does not ratify new fields, operations or durable record meaning.
The write envelope excludes R3 implementation, old qualification receipts,
methods, skills, CI policy and wholesale documentation migration.

## Verified source to compiler implementation

This first implementation part replaces the disposable caller with a Builder
service method and a production E2B adapter. It does not yet register artifacts
or expose a Preview URL. No public wire or persistent record changes are
consumed in this part. Registry and MAR remain the required next consumers.

The source reader already returns exact UTF-8 Git blobs and rejects symlinks,
NUL/binary content and files over 1 MiB. Use that existing custody path to read
`app/` at the server-resolved verified candidate revision. The tested compiler
image has no Git; pass the retrieved app files, not an unprocessable Git bundle.
This refines the illustrative compiler input above without changing source
authority. Binary assets and arbitrary dependencies are unsupported by this
first adapter and must fail visibly, not be decoded with replacement bytes.

The invariant is that compiled bytes belong to the currently authorized,
verified Change and exact source revision, using the frozen compiler. A
missing, unverified, wrong-kind or changed subject fails closed. Recheck the
subject after reading and after compilation. Compilation does not grant
verification, registration, publication or serving authority.

Files and responsibility:

- `builder/application-artifact-runtime.ts` owns the non-agent E2B adapter and
  its typed input/output. It uses the immutable image recorded above, writes
  only validated app files, invokes the trusted Vite config, validates and
  hashes bounded regular output, and kills its exact sandbox on all outcomes.
- `builder/application-build.ts` resolves the authorized subject through the
  existing Builder store, retrieves its app through the existing source port,
  invokes that adapter, and rechecks scope before returning compiled bytes.
- `builder/service.ts` and `builder/module.ts` expose/configure that internal
  operation. Existing HTTP routes and non-ready BLD-10 behavior stay unchanged.
- `tests/implementation/builder-application-*.test.mjs` exercise source
  admission, limits, cancellation and provider-result validation. An explicit
  live switch may call only the production compiler adapter, never a fake E2B
  success. The Lead owns integration; a bounded Luna writer may own only the
  adapter and its focused test.
- `scripts/conexus-verify.mjs` includes the new checks in the existing Builder
  candidate leaf. It does not change workflow policy or create a new gate.

Compiler input is `{ projectId, changeId, sourceRevision, files, signal? }`.
Each file is `{ path, content }`, relative to `app/`. Output preserves those
subject coordinates and adds the exact template/recipe identity plus
`files: { path, mediaType, bytes, sha256 }[]`. It is compiled output, not an
`ArtifactRevision`. Accept at most 256 input files, 1 MiB per source file and
12 MiB total input. Reject duplicate/traversing/reserved paths and require
`index.html`. Output limits remain 256 regular files and 12 MiB. Cancellation
must refuse late output and clean up; cleanup failure must be reported.

Execution sequence:

1. Write failing behavior checks for denied/unverified/stale subject and unsafe
   compiler input before implementing either boundary.
2. Implement source selection and compilation with the existing fixed image.
   Run focused checks and Hub typecheck. Do not build app code on the host.
3. Exercise the production adapter in at most two authorized fresh sandboxes,
   retain actual output/timings and cleanup results, and distinguish this
   module-level proof from the still-unrun authenticated platform journey.
4. Review the diff and record which integration consumers remain. No stage
   closure or broad runtime-isolation claim follows from this partial result.

### Implementation observations

The internal `BuilderService.compileApplication` now resolves a verified
candidate through the existing store, reads its exact `app/` files, calls the
production E2B compiler and rechecks authorization/subject identity before
returning bytes. `createConfiguredBuilderModule` supplies the compiler using
the existing protected E2B credential. No HTTP route invokes it yet. Hub close
cancels and waits for its compilation calls before closing the Builder store.

The adapter uses the existing image, not a new publication. Caller cancellation
does not abort the creation request before its sandbox ID can be observed.
Downloads use bounded streams and exact size checks; file/path/MIME limits and
explicit cleanup fail closed. A cancellation arriving during cleanup initially
returned bytes; a focused failing test reproduced it, and the final cancellation
check now rejects that late result. An unknown create-request outcome still
relies on the 180-second provider lifetime if no sandbox ID was received.

The production adapter live check ran on 2026-09-11. The valid controlled React
app compiled in 5,933 ms including adapter setup/download/cleanup. Chromium
observed 0, 2 after two Add clicks, and 0 after Clear, with no browser errors.
A second source containing an unresolved import raised
`APPLICATION_COMPILATION_FAILED`; that negative call took 7,701 ms including
the final cleanup checks. The exact sandbox IDs were `i5x71t45khjs7js1kqv7w`
and `ie6a9mpmo0aorzh85tx5m`. Both returned not-found from the provider after
cleanup. The browser and loopback server were also closed.

The retained receipt and screenshot are under
`/tmp/conexus-application-adapter-live-mth05Q`. This is production-compiler
module proof with controlled source and synthetic subject IDs. It does not
prove real Git custody, database admission, model generation, UI integration
or authenticated MAR serving. The source/service tests use explicit external
port doubles; they do not substitute for that later platform journey.

Targeted verification passed: 13 source/service tests, 10 compiler tests,
the one live two-sandbox/browser test, 17 existing local Builder/Preview tests,
7 verification-router tests, Hub typecheck, focused Biome and repository
documentation checks. The existing two OCI tests and one PostgreSQL test were
skipped for absent explicit execution configuration. Full candidate verification
and independent stage closure were not run; this is an unfinished integration,
not an accepted release. No code commit, new image or production deployment
was made. Existing L1/L2 dirty changes were preserved.

Next consumers are Registry retention, authorized MAR serving and Builder UI
presentation, followed by the explicit second-request parent path. App-profile
materialization in the coding workspace also remains to be connected. The
new compiler operation alone must never make BLD-10 ready.

## Registry retention implementation

This part consumes the existing compiler output and makes it recoverable from
PostgreSQL without another build. It does not make BLD-10 ready. Builder still
owns build attempts and their settlement. MAR and I&A must authorize browser
serving separately before the UI exposes an app.

The retained value is an immutable application revision, not a build job or a
Preview session. Its identity binds the Project, exact Git source revision,
fixed `REACT_VITE_V1` profile, immutable compiler template, recipe digest and
sorted file manifest. Each manifest item contains a path, media type, byte
length and SHA-256. Registry recomputes hashes from bytes. Timestamps, actor
IDs, attempt IDs and access grants do not enter the content digest.

Use the existing Registry tables, with `kind = application` and Project scope.
Brain remains Workspace-scoped. Preserve the existing Workspace/kind unique
constraint and Brain bootstrap conflict behavior. Application rows have a
null Workspace reference and a non-null Project reference; Brain rows have the
inverse. A separate Project/kind unique constraint admits one application
artifact per Project. Application artifacts cannot set a published revision.
The existing artifact/source revision uniqueness makes a repeat idempotent;
different bytes or compiler identity for an already retained source fail with
an identity conflict. A future profile upgrade on the same source reopens this
constraint deliberately instead of overwriting an immutable revision.

Retain the closed manifest and base64-encoded file bytes in the existing
`reg.artifact_revision.payload` JSONB value. A single function transaction
validates and inserts that complete revision before returning `AVAILABLE`.
This adds no durable record class, filesystem, blob service or separate
database. At 256 files and 12 MiB of decoded bytes per revision, accepting
base64 storage overhead removes a cross-store commit/recovery problem. SQL
derives the revision digest from the UTF-8 bytes of the complete validated
JSONB payload's PostgreSQL text representation. It includes the semantic
coordinates and bytes, not just the output file hashes. This encoding is
versioned as `application-payload-v1`; changing it requires a new version.
Reopen backing storage when observed retention volume, individual asset read
cost or backup cost exceeds this pilot's practical limits.

The application boundary accepts only safe ASCII URL paths, at most 1,024
characters, with nonempty segments beginning with an alphanumeric character.
Reject dot segments, backslashes, percent escapes, duplicate paths, unsupported
extension/media-type pairs, missing `index.html`, more than 256 files or more
than 12 MiB total. Copy incoming byte arrays before asynchronous I/O. Validate
the same persisted contract in the SQL write function, including decoded byte
lengths and hashes, so direct calls through a runtime role cannot bypass it.

Use a Builder-owned `admit_verified_application_source(account, project,
change, source)` admission function. It requires current I&A build permission,
the same Project/Change/source, `VERIFIED`, an exact ChangeAcceptance and the
currently approved Baseline matching that acceptance and Change. It does not
redefine the existing BLD-10 projection. Registry calls this function rather
than reading Builder or I&A tables directly. Retention and reads repeat this
admission. Denied admission throws `APPLICATION_SUBJECT_REFUSED`; an authorized
missing revision or file returns null. Retained bytes grant no ongoing access.
MAR must repeat admission for every future asset request.

Preserve the existing CR-1 current-authority serialization law. A snapshot
pre-read is insufficient for retention. I&A owns
`iam.admit_application_build(account, project)`, which checks active Account,
build grant and Workspace membership and holds shared row locks on those
I&A-owned records through commit. Project owns
`project.lock_application_baseline(project)`, which returns the approved
Baseline and holds shared locks on its state and candidate. Only Builder owns
the subsequent shared locks on Change, Plan, ContractRevision and
ChangeAcceptance. Acquire authority in I&A, Project, Builder order, then write
Registry. Each helper is a narrow volatile security-definer function with
fixed search path and execute granted only to the consuming owner. No owner
gains direct access to another owner's protected tables. Test a concurrent
revoke with actual transactions, not only revoke-then-read.

Expose only Registry functions to the existing `hub_rb_executor` role. No
runtime role receives Registry table writes, schema creation, owner membership
or Brain publication capability. `registry_owner` alone owns application
storage and functions. Cross-owner structural Project references use the
already accepted Project-scoped Registry FK seam. Semantic Change references
stay in the Builder admission call, not a new cross-owner FK.

The proposed production adapter is
`registry/application-artifact-store.ts`. Its `retainApplication(client,
{ accountId, compiled })` validates compiler output and returns a
schema-validated revision reference. `getApplication` returns only admitted
metadata for exact Project/Change/source coordinates. `readApplicationFile`
requires those coordinates, the exact artifact revision and path, and verifies
the returned bytes against stored metadata. No method creates a route or an
access token. Use a single statement for each operation, with bind parameters.

Implement this with migration `026_builder_application_registry.sql`, the
migration runner's corresponding checksum/catalog checks and focused tests.
Do not modify migrations 001–025. Preserve historical catalog guarantees and
run their applicable checks against both the predecessor and successor schema.
Replace the internal `compileApplication` call with `prepareApplication`,
returning registered metadata rather than transient bytes. After resolving the
verified source, call Registry `getApplication` before the compiler. That call
checks current acceptance and either returns the retained revision or an
authorized absence. Only the latter compiles. Retain the result through
Registry's atomic admission and recheck cancellation before returning. Share
the existing Builder executor pool in module composition; close it only after
tracked preparation calls finish. Cancellation during retention may leave a
valid immutable revision but cannot report a completed preparation. It may be
reused on a later authorized request. No second compiler API is retained.

Preparation must not claim a settled build attempt or automatically change
Preview readiness. Attempt identity, leases and late-result settlement remain
a required next consumer before HTTP dispatch.

Proof uses the real adapter and disposable PostgreSQL 17.10 with the existing
CI image digest, synthetic Project/Change/acceptance records and controlled
compiled bytes. These are production-module/database proofs, not a generated
app journey. Reconnect and recover exact bytes; repeat and race the same input;
refuse changed bytes, foreign subjects, stale Baselines, revoked permission,
malformed paths and oversized output. Show failed retention leaves no partial
revision. Recheck Brain bootstrap/read behavior and direct-table denial.
No model, E2B, Sankhya, host-certificate or production-data effect is needed.

The structural change requires the repository's fresh independent Fable and
Gemini review before acceptance. Freeze the material diff and exact proof for
that review. No additional arena is needed for the already selected topology.

### Retention checkpoint and migration blocker

The isolated implementation draft is in
`/tmp/conexus-registry-part-iKOXtK/writer`, a detached worktree at
`3baea8d0a5296b2e75f3519f52bcf96e9d0ef5d9`. It contains the proposed Registry
adapter, migration 026, partial migration-runner changes and two adapter unit
tests. These files have not been copied into the main checkout. The compiler
consumer still returns transient bytes; `prepareApplication` is not implemented.
Preserve this worktree as unfinished work, not as an accepted dependency.

A byte-checked backup of the three authored files and the runner diff is in
`/home/leandrotheodoro/.cache/conexus-registry-draft-iKOXtK`. Its `README.md`
records the base commit and ownership boundaries. This backup avoids relying
only on `/tmp`; it is not an accepted implementation. Read the current roadmap
before resuming either copy. Other dirty files in the isolated worktree were
inherited from the main checkout and must not be copied back wholesale.

The deciding existing runner is already blocked in the main checkout, without
migration 026 or the new adapter present:

```text
loadCurrentHubMigrationFiles()
→ MIGRATION_024_DIGEST_REFUSED
```

The runner expects migration 024 SHA-256
`8afb8add42959c19bc5f5edc3dad73a4d511195597656dbcb9505b6e75cae735`.
The actual file in both HEAD and the current checkout hashes to
`47fed0b3653be7bb35d9c74722a23afdc1702e74303bcd2c6e336ccbd6616bb2`.
The earlier [R3 freeze](../evidence/4f/4f-r3-rf05-rf08-candidate-freeze.md)
also names the expected `8afb` hash. The
[R3 stop disposition](../evidence/4f/4f-r3-third-review-stop-root-cause-adjudication.md)
preserves its later code as an unaccepted candidate. HEAD introduced that
candidate on 2026-09-10. The mismatch is not caused by the retention work.

The writer temporarily repinned 024 in its isolated draft while attempting
the database proof. The Lead rejected that change and restored the existing
pin. The main runner and migrations 001–025 remain unchanged. A manual SQL
application reported by the writer bypassed the deciding runner and therefore
does not prove admitted migrations, Registry persistence or the Builder
journey. The successor catalog checks, real retention/reconnect/concurrency
proof and independent structural review remain incomplete.

The Lead reran the isolated adapter tests. They passed 2/2 after completing an
interrupted size-limit edit that initially caused a TypeScript compile error.
These tests use a query-client double; they do not exercise real retention.
Main-checkout repository hygiene, documentation links, architecture/provenance
checks and `git diff --check` passed. Full candidate verification was not run.
The disposable PostgreSQL container `conexus-registry-pilot-20260911` and its
anonymous volume were removed. They contained only this part's synthetic test
state. No unrelated service or volume was stopped or removed.

At handoff, main remains at the HEAD above, one commit ahead of
`origin/main` at `e9ff12e4394c855e5a15656b0d74e26bc5f46a02`, with 14 dirty
paths and no PR. No commit, push or merge occurred. The reported remote main
CI success is run `34298508264`, not proof of this dirty candidate. The deciding
local environment is WSL Ubuntu, Node 24.20.0 and npm 12.0.2. The pre-existing
L1 and L2 diffs remain untouched. The first resume action is the bounded
migration-lineage decision in the roadmap, not an E2B call or another R3 round.

The smallest missing decision is how the pilot's executable migration lineage
relates to the preserved, unaccepted R3 migrations. Do not silently accept the
new hash, overwrite a historical migration, ignore the failed check or rerun
R3 qualification to hide this dependency. Prefer separating the pilot's
installation path from unaccepted R3 work, but decide version/ledger and
existing-database compatibility before implementing that separation.

The local decision trail is
`/tmp/conexus-registry-part-iKOXtK/decisions.tsv`. The first row explicitly has
an unknown time; its midnight timestamp is not timing evidence. The isolated
worktree and this checkpoint, not an assumed clean test result, are the resume
inputs. No new E2B, Product-model or Sankhya call was made in this part.

## Migration isolation

The operator approved correcting the installation dependency before resuming
Registry. The observable outcome is a fresh installation of accepted Hub
functionality through migration 023, followed by a no-op restart, without
executing preserved R3 migrations 024 or 025. SQL bytes and existing applied
ledgers are immutable inputs to this correction.

The defect is selection after validation. `loadMigrationFiles` and
`loadR2MigrationFiles` currently validate all 25 files before filtering; even
R1 installation therefore requires the unaccepted R3 checksum to match.

Keep one runner and its public entry points. Represent admitted migration names
separately from preserved names. Validate the exact selected files before
execution, refuse unknown SQL files, and tolerate presence or absence of the
named preserved files without reading or executing them. R1 selects 001–010,
R2 selects 001–018, and current Hub selects 001–023. Keep every existing digest
constant and every catalog check. Do not introduce a second runner, fallback
SQL execution, checksum regeneration or a switch that admits held R3.

The shared ledger verifier must still reject unknown applied versions, changed
applied checksums and back-insertion before any migration body runs. In
particular, a database containing 024 or 025 is incompatible with the pilot;
refuse it rather than deleting rows, downgrading schemas or relabeling history.
Future admission of held migrations must reconcile that lineage explicitly.

Versions 024 and 025 remain reserved historical candidate identities, not
missing steps in the admitted installation. After applying 026, any accepted
successor of that R3 work must use a new forward version. Never backfill 024 or
025 into such a database. A database that already applied either candidate is
outside this pilot install/upgrade path and needs its own explicit conversion.

Alternatives considered are a second pilot runner and repinning the current
file. A second runner duplicates transaction/ledger/catalog behavior and leaves
existing R1/R2 callers broken. Repinning would accept unreviewed R3 bytes.
The existing runner with admitted selection removes the demonstrated coupling.
This bounded correction does not repeat the completed Product design arena.

The code envelope is `scripts/run-hub-migrations.mjs`, focused migration tests,
the existing verification graph and this task/roadmap. The Lead is integrator.
No existing migration, R3 runtime, Product contract or user database is edited.
First reproduce the current loader failure. Then prove selected-file integrity,
held-file independence and unknown-file refusal with filesystem fixtures.
Exercise the production runner on disposable PostgreSQL for fresh install,
restart, R2-to-current upgrade, preserved user data, concurrent invocation and
refusal of changed or unadmitted ledgers without mutation. This is production
migration-module proof with synthetic data, not an app or Builder E2E claim.

The measurable checkpoint is an installable/restartable current Hub schema.
Registry persistence remains the next consumer. Independent review challenges
the selected corpus and existing-database compatibility before closure.

### Migration isolation observations

The production runner candidate passes the six filesystem checks and four
PostgreSQL checks in `hub-migration-selection.test.mjs` and
`hub-migration-postgres.test.mjs`. Before the correction, all four database
checks failed with `MIGRATION_024_DIGEST_REFUSED`. After it, fresh installation,
unchanged restart, R1/R2 upgrade with retained Account data, concurrent
installers and refusal of incompatible/drifted/missing ledger entries passed.
The incompatible-ledger cases inject synthetic ledger rows, not actual R3
schema installations. No migration SQL bytes or historical pins changed.

The command used the cached CI PostgreSQL image, database `conexus_test`,
loopback port 32769 and disposable container
`conexus-migration-isolation-8xn5lz`. Test databases have unique names and are
removed by their own test cleanup. Evidence is in
`/tmp/conexus-migration-isolation-8XN5LZ/postgres-red.txt` and
`/tmp/conexus-migration-isolation-8XN5LZ/postgres-green.txt`.
The decision trail is `decisions.tsv` in that directory. These are module
proofs with synthetic data, not Builder/Keycloak/Preview E2E.

Repository extended checks, seven verification-routing tests and scoped Biome
checks passed. The existing RB database test exposed a stale expected version
024; its expected sequence now ends at accepted version 023. Its remaining
behavior is unchanged and its real PostgreSQL run passed 1/1 after that
correction. Full candidate verification and independent review remain
outstanding at this observation checkpoint.

The operator subsequently asked to verify why legacy R1/R2/R3 plans were still
influencing current execution. The Lead interrupted the outstanding Fable
review at that clarification. Gemini had already returned no final report
after its client's five-minute print timeout. The wrapper result is
`INCOMPLETE`, with no independent verdict or convergence, at
`/tmp/conexus-migration-isolation-8XN5LZ/review/conexus-review-result.json`.
Do not restart a review under the former framing without resolving the current
route. The local migration evidence remains valid for its named technical
claims, not as closure of any legacy stage.

Additional observed proof before interruption includes the existing R2 database
check passing 1/1 and the actual migration CLI installing 001–023 in its own
fresh disposable database. A second CLI invocation applied nothing; a direct
catalog query returned 23 ledger rows and no `mar` schema. Its output is
`/tmp/conexus-migration-isolation-8XN5LZ/cli-restart.txt`.
The disposable container and anonymous volume were removed and their absence
was checked. Only synthetic test data was discarded; all source changes and
the previous Registry backup remain preserved. No commit, push or merge ran.

## Arena comparison and synthesis

Three isolated candidates were produced using Sol, Terra and Astra. Each
included a primary sketch and a structurally distinct fallback. The candidates
converged on fresh compilation plus local immutable serving. We also compared
building in the coding sandbox, resident remote serving, and canonical-source
promotion instead of candidate continuation. These are design alternatives, not
three executed prototypes.

The root's criterion scores before seeing the cross-judge were:

| Candidate | Real loop | Ownership/security | Small interface | Feasibility | Practical proof | Evolution | Total /24 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1, Sol | 3 | 3 | 2 | 3 | 2 | 3 | 16 |
| 2, Terra | 3 | 2 | 2 | 2 | 2 | 3 | 14 |
| 3, Astra | 3 | 3 | 3 | 3 | 2 | 3 | 17 |

The fresh Sol cross-judge scored candidates 1/2/3 as 18/13/15 and recommended
candidate 1 conditionally. It found missing launch usage and an omitted iframe
path in candidate 3, and mismatched usage plus an extra successor operation in
candidate 2. It also found that every candidate delayed feasibility proof too
long. None was recommended unchanged for implementation.

After comparing that report with the root's original preference for candidate
3, select candidate 1 as the base. Its CLI-shaped `app/` workspace, single
parent-aware creation interface, Baseline/work-parent separation and iframe/
new-tab behavior better match the requested delivery. The root's earlier score
gave candidate 3 too much credit for an incompletely connected launch flow.
Graft candidate 3's explicit POST/redemption, fresh authorization after restart,
negative access observations and sandbox-duration accounting. Keep candidate
2's explicit predecessor validation; reject BLD-21 in favor of enriching BLD-03.
Record its canonical-source promotion alternative but do not implement it now.

The synthesis corrects all candidates' postponed proof by adding an early
compiler experiment below. It also fixes immediate-create/ready assumptions and
the first candidate's `Omit` over a union, using explicit states and references.
No extra pass-through service is justified by the illustrative usage helpers.
The amended usage now waits for a candidate and the proposed launch response
names both entry and final URLs. The browser behavior still needs actual proof.
There were no candidate dropouts. This ends the comparative round; another
round requires a new material falsifier, not a preference for more agreement.

Accept one additional short compilation sandbox per successful Change. Reject
coding-sandbox compilation for now because source hashes alone do not protect
compiler binaries or background processes from the author. Reopen if measured
startup cost matters and a concrete unprivileged/read-only execution experiment
proves equivalent containment. Reject a resident remote Preview server because
this profile has no server code; revisit only for an actual backend consumer.

Alternatives remain in the session's isolated temporary arena directory, not
the documentation index. The selected design and reasons live only here. No
candidate is independent stage-closure evidence and none establishes readiness.

## Practical proof before expanding implementation

### First, test the clean compiler mechanism

After the exact experiment is admitted, build only the fixed app profile and
the proposed production compiler adapter. Use a real normal-code app from that
profile and invoke the actual pinned Vite toolchain inside clean E2B, with
network denied. Compile the same frozen source bytes twice and compare the complete output.
Exercise the resulting browser app, not a worker's summary or a hardcoded
success response. Do this before building full Registry/MAR/continuation wiring.

This is real compiler/profile feasibility with an explicit controlled source
input. It does not prove Builder generation, platform login, serving access,
second-change lineage, Brain or Sankhya. Do not count it as the pilot delivered.
Its purpose is to reject an unusable compiler/image choice before broader code.

Proposed bound: one isolated source/profile directory, two fresh build sandboxes,
no model calls, no ERP or company data, 120 seconds per compiler command,
180 seconds per build sandbox and 15 minutes for the experiment. Retain the
source/recipe/template identities, returned files, actual durations and sanitized
errors. Destroy only those sandbox IDs and retain useful output for inspection.
Stop if dependencies require build-time network, output differs, containment is
weakened or the actual app cannot execute. Do not relax limits and call it proven.

Before image publication, freeze the recipe, dependency lock, source hashes,
resources and permitted effects. Publication returns the immutable template and
build IDs; record those before creating either sandbox. Do not require IDs for
an image that does not yet exist. No alias may substitute for the returned
`templateId:buildId`. This controlled compiler probe uses source-file hashes,
not a fabricated Builder acceptance or source commit. The later production
adapter must consume the actual accepted Git subject.

### Prepared compiler experiment

The scratch subject is `/tmp/conexus-app-compiler-prep-1RGMat`. It contains
`app/index.html`, `app/src/main.tsx`, `app/src/style.css`, the compiler manifest,
lockfile and fixed Vite configuration, and `recipe.mjs`. The app has an item
counter with Add and Clear controls. This is disposable probe code, not a
shipped template or an implemented production compiler adapter.

The existing `scripts/rb-builder-e2b-template.mjs` image prepares Node/Git,
not the required Vite toolchain. It remains unchanged. The new recipe uses its
same pinned base image, with a dedicated template name. It copies only the
three named compiler files, never the repository, credential directory or
company data. Image construction installs npm 12.0.2 and runs
`npm ci --ignore-scripts --no-audit --no-fund`. Network is needed during image
construction, not during app compilation.

| Binding | Prepared value |
| --- | --- |
| Scratch recipe check | `node /tmp/conexus-app-compiler-prep-1RGMat/recipe.mjs`, installed E2B 2.46.1, local rendering only |
| Recipe SHA-256 | `32230b4ba0b72625474b7f722e2294a256f9ab2f7c1c9b1eb107f38770edbe97` |
| Publication name | `conexus-app-compiler-pilot:recipe-32230b4ba0b72625` |
| Base image | `node:24.20.0-bookworm-slim@sha256:ba849c60be29959425b8734d57b8b4b7d56f98edd9504c9af091d5281095a71e` |
| Image resources | 2 vCPU, 2048 MiB; provider acceptance and actual build remain unproven |
| Direct package pins | Vite 8.2.2, React/React DOM 19.2.8, TypeScript 6.0.2, React types 19.2.18, React DOM types 19.2.5 |
| Transitive override | Rolldown 1.2.6, matching the repository lock |
| Compiler manifest SHA-256 | `844842ecd4f8cc493cc4c95aef1116ebb566cde7c2d4ff8122f3a2e4c58ffa49` |
| Compiler lock SHA-256 | `09de934c066c6aea82b009248e047edf02737f4842e33bbb9b9be18e14e5dd52` |
| Trusted Vite config SHA-256 | `af35db701cc0ee5d5f7b54e1228e88235d912d1a0c783dc6bcce8a3acd561544` |
| HTML SHA-256 | `c6a94e5f063f72b55d715a81e33086046148be1d216405d13de39ac5bf9a9b03` |
| TSX SHA-256 | `5f4f7bd0f3b775b775bddd0aec2a38d3572f5ca2307a9c041bcbfde5e1192f2f` |
| CSS SHA-256 | `ed74da7b6e8342723f0d50161282380166f224daabd4d3b5920af2eaa10326c2` |

The first offline lock resolution selected a newer Rolldown transitive tree
whose required OXC version was absent from the cache. Pinning the existing
repository's Rolldown version allowed npm to generate the lock offline in the
pinned Node/npm environment. This proves lock generation, not package download,
native binding availability or compilation in E2B. Recipe rendering included
hashes of all three COPY inputs. No host dependencies were installed.

The proposed live grant is one template publication followed by at most two
fresh compiler sandboxes using its exact returned build ID. Use the existing
owner-only E2B key file through the existing secure reader; do not put the key
in the image, app, command environment or report. Publication may consume E2B
credits and downloads only the public base image/npm toolchain. Retain the
new template for the pilot; do not overwrite the existing Builder template.
Bound publication observation to 15 minutes without automatic retries. A
client timeout is not proof the provider build stopped; record its ID/status
and report any continuing operation before further work.

In each sandbox, write only the frozen app files under `/workspace/app`, with
internet access denied and no platform/provider credentials injected. Create
the platform-owned dependency link with
`ln -s /opt/conexus/compiler/node_modules /workspace/app/node_modules`, then
run from `/workspace/app`:

```sh
node /opt/conexus/compiler/node_modules/vite/bin/vite.js build --config /opt/conexus/compiler/vite.config.mjs --configLoader native
```

Do not execute an app-controlled package script or Vite/PostCSS configuration.
The fixed config disables public-directory copying and source maps, uses an
inline empty PostCSS configuration, and writes only `/workspace/dist`.
The trusted dependency symlink is not permission to accept source/output
symlinks. Use the 120-second command and 180-second sandbox limits above;
retrieve at most 256 regular output files and 12 MiB, compare relative paths
and every file's SHA-256, then kill only the two recorded sandbox IDs in cleanup.

For the browser check, serve only the retrieved artifact through a temporary
static server bound to `127.0.0.1` on an OS-selected port, within the same
15-minute experiment window. Click Add twice and observe 2, click Clear and
observe 0; capture browser errors and stop that exact server afterward. This
proves that the compiled app runs, not MAR authorization, secure iframe entry,
Hub login, persistence or Builder generation. Those remain later real-platform
checks. No fallback to a host-built artifact is allowed.

Current admission is recorded only in roadmap. These concrete proposed effects
do not themselves authorize template publication, sandboxes or browser serving.

### Observed compiler result

After the operator admitted credit consumption for the proposed experiment,
one new image was published and the two-build/browser experiment ran on
2026-09-11. The actual template reference is
`xdli9puqp1nepk4ht6lw:8a1e3885-c6d7-4b06-aea6-860632f407e6`.
Publication returned ready after 33,456 ms. The existing Builder template was
not changed. The new image is retained for the pilot.

The two sandboxes were `ihys37ult7cvz3xfmzp6z` and
`iepz1mmyjsirlrf0mrvdn`, both created with `allowInternetAccess: false` and
180-second lifetimes. Both compile commands exited 0 with empty stderr.
Observed command round trips were 3,762 and 3,831 ms; Vite itself reported 688
and 760 ms. Both builds returned the same three regular files, 191,967 bytes
total, with identical relative paths and SHA-256 values. Both explicit sandbox
kill calls returned true. The whole two-build/browser experiment took 20,281 ms.

Chromium opened only the first retrieved artifact through the temporary
loopback server. Its counter read 0, then 2 after two Add clicks, then 0 after
Clear. Browser console/page errors were empty. The screenshot was inspected;
the temporary server and browser were stopped.

Raw results and reproducible disposable scripts remain in the named scratch
directory: `publication.json`, `publication.ndjson`, `experiment.json`,
`publish.mjs`, `experiment.mjs`, `collect.mjs`, `output-1/`, `output-2/` and
`app-after-add.png`. The publication status log contains null message fields
because its logger selected the wrong field; it does retain actual status
transitions. Do not cite it as detailed build-log Evidence. The final provider
status, source/output hashes and actual runtime/browser results are retained
separately. These temporary files are not committed and may not survive cleanup.

This supports the fixed-profile clean-compilation mechanism on the named image.
It is not a general reproducibility guarantee, hostile-code security proof,
TypeScript type-check, MAR/iframe/auth proof, or Builder-generated app. No
coding model, Sankhya call, company data or host app build was used. The next
consumer is the bounded production compiler/Registry/MAR path and explicit
second-Change source admission described above, after their owning refinements
and implementation grant. Do not repeat this experiment without a new falsifier.

### Then, test the actual Builder journey

Implement the remaining vertical pieces only after the compiler result supports
the placement. Drive normal Keycloak login and the real Hub/web UI, create/use a
Project, ask Builder for the first app, wait for actual generation/verification,
open its authorized Preview, interact, then ask for a visible second change.
Observe the new app and the Git parent edge. Reopen the earlier version and
restart Hub to check retained source/artifact behavior with fresh access.

Use real configured models, E2B, PostgreSQL/Git and MAR, not injected sessions,
seeded fake acceptance or a static page outside the chosen serving code. The
existing composed-live test's setup is a source of reusable mechanics, not proof
of the full login-to-app journey. A missing dependency is a failed/incomplete
experiment, never grounds for swapping in a passing stand-in.

Proposed resource ceiling: one disposable Project, two human Changes, at most
four coding and four verifier runs because the existing bounded correction loop
may run, two app compilations, one browser context and a 70-minute stop. Existing
per-run timeouts remain ceilings, not promised latency. The driver must prevent
further dispatch at its bound and track actual provider sandbox IDs for cleanup;
do not assume a nonexistent disable-correction option. Freeze exact model and
template admissions before the live grant. Do not reuse company Project data.

Require the following observations, with separate negative checks where useful:

- First and second app behaviors work in the browser; the second preserves the
  first feature and its source ancestry. Both iframe and new-tab paths work.
- Wrong/foreign/unverified parents fail without provider dispatch. Idempotent
  replay does not duplicate a Change; late completion does not change selection.
- The app never receives the Hub cookie. Wrong session/host, consumed entry
  grant, expired access, revoked authority and traversal cannot retrieve bytes.
- Failed compilation leaves the old app labelled and available; it never makes
  the failed candidate ready. Missing/corrupt retained files report unavailable.
- Restart does not rebuild an already retained artifact just to reopen it.

Retain sanitized browser traces/screenshots, prompts, exact source parent edges,
artifact manifests, request outcomes and actual provider usage. Cleanup revokes
only the experiment's grants and stops/removes only its registered disposable
resources. Retaining a disposable Project is safer than inventing an unsupported
Product deletion path. Report leftovers rather than running broad deletion.
No commit, publication, company access or live Sankhya effect follows from a
successful creator Preview experiment.

## Implementation sequence and remaining bindings

1. At the requested checkpoint, accept or revise the proposed lineage,
   compiler placement and Preview access refinement. Bind the first experiment
   to actual resources and update its exact grant in roadmap. Do not require
   whole-F1 ratification to settle this bounded consumer.
2. Implement the fixed profile and clean compiler. Run the first experiment.
   If it fails, change only the falsified mechanism before expanding code.
3. Implement explicit predecessor source admission/verification, Registry output
   and MAR authorization/serving. Add the existing Build UI's app presentation.
   Each piece gets its named negative checks; do not create another test framework.
4. Run the real Builder journey and the applicable repository verification.
   Material owner/trust-boundary acceptance uses the existing review method;
   the arena does not replace it or create a review for every file.
5. On a usable first app, detail manual Brain authoring/context and the exact
   SDK/Sankhya operation it needs. Colleague access is a later real pilot proof,
   not automatically covered by the creator's Preview authority.

The remaining executable bindings are specific: predecessor and launch wire/
storage refinements, image/profile resource identity, and browser host/cookie
configuration. No architecture or dependency switch is marked proven. Unknown
results remain unknown until observed. The next implementation agent must not
invent these values to turn this design into an executable packet.

Manual Brain remains selected text/version context, not conversation memory or
an automatic learner. SDK seams are named server-authorized operations; app
credentials and raw ERP access stay outside generated browser code. Exact APIs
are decided with that consumer, not fabricated in this first-app sketch.

## Verification of this design round

This round inspected actual source, traced the missing second-change behavior,
read all three design artifacts, compared a fresh cross-judge and screened the
synthesis against interface/ownership red flags. Candidate package SHA-256
identities are `e7c1077e6bf4980f865a070c9189919df487dcc0ba1102f4ea7e50eed15d7c79`,
`6d1f2f55171b18817201456ea9105f87494fff6f46715df53418fdf761999b7d` and
`3d736b117f7382bc466b2bafc8bc1f93821697c0f890fae9b2e78cb568913fbb` for 1/2/3.
These identify reviewed temporary sketches, not Product artifacts or acceptance.

`git diff --check` and `npm run repository:check:extended` passed in pinned WSL
on the synthesized documentation. The latter checked hygiene, links, retained
architecture obligations and qualification provenance. No checker or protected
receipt was changed. These results do not validate the proposed runtime.

No app, real coding model, E2B, Sankhya or proposed experiment executed. Full
`npm run verify` was not run because this is a documentation/design checkpoint,
not Product-code acceptance or publication. No commit or publication was made.
