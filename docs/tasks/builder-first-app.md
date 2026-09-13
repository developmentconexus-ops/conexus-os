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

## Internal pilot refactoring

The operator approved this direction on 2026-09-13 after reviewing
`Conexus_plano_refatoracao_piloto_v2.md`, based on commit `6f697bd`, and the
subsequent Pro clarification. This section absorbs the actionable plan into
the existing task. The external document is not a second execution queue.
Current grant and delivery status remain in the roadmap.

### Outcome and policy delta

A person creates and evolves an ordinary-code app without choosing its stack,
configuring infrastructure or repeating company rules. Keep Mastra, E2B,
streaming, the fixed compiler, Git retention, Registry, login and Preview
isolation. Do not replace the runtime or perfect a universal review workflow.

The limited internal Preview path does not require an independent model
reviewer for every edit. Technical admission still checks source identity,
allowed files and authorization. Compilation success means an executable
artifact was produced, not business correctness or independent verification.
Never fabricate VERIFIED status or rewrite an old refusal as acceptance.
Publication remains separate from Preview.

The first implementation must reconcile this policy with active Product,
Builder and wire owners. SQL admission and recovery are part of that change.
Removing only `executeVerification` is not a valid implementation.

Owner reconciliation is bounded to these existing consumers:

- `docs/product/operation-ledger.md` section 5.4 and
  `contracts/api/product/builder-paths.yaml`: BLD-03 working origin and
  response-only result, BLD-21 technical preparation, and affected read projections.
  Keep BLD-22's exact artifact and launch authority; do not add another operation.
- `docs/reference/builder-and-harness.md` sections 9.2, 9.4, 9.7 and 38.3:
  distinguish cross-request continuity from correction and keep independent
  verification for claims that actually assert material verification.
- `docs/product/contract.md` RunPreview, Journey C and Preview sections:
  distinguish executable inspection from VERIFIED and preserve the last-good app.

The read-only owner map found an additional integration question: a no-edit
response from a coding turn must remain a Builder result. Do not silently
reuse BLD-16's read-only assistant interaction to mutate Change state or create
a parallel conversation owner. Resolve the result variant in the existing
BLD-03 and read contracts before changing the runtime finalizer.

### State and responsibilities

Builder owns one working-state record per project. Its proposed fields are
`workingSourceRevision`, `workingChangeId`, the last retained Preview artifact
and its source, the active turn, a concurrency revision and the selected Brain
revision when configured. Resolve exact names against existing contracts.
Git owns immutable app source; Registry owns compiled bytes. Neither a cookie
nor a live route is the persistent identity of the last Preview.

- The first edit uses the initial admitted source. Later edits use the working
  revision, not the original Baseline or the version merely being viewed.
- One edit/preparation runs per project. Idempotency binds intention and
  expected origin. Stale origins and competing edits fail before paid work.
- Retain the immutable candidate before conditionally associating it with the
  still-current turn and origin. Do not add a distributed Git/database transaction.
- A retained candidate becomes the next correction source even when its build
  fails. The last successful artifact stays available and is labeled as older.
- A response without edits persists text without requiring an empty commit or
  another compilation. Compose bounded recent context from existing intentions
  and final responses, not a parallel conversation engine.
- Late results do not replace newer state. Restart preserves committed source
  and artifacts but does not promise automatic resumption of an interrupted
  paid run. Reopening issues fresh authorization.

The existing service prepares retained edits without depending on a connected
browser. GET requests do not start paid work. The UI keeps the app primary and
shows conversation, preparation and truthful failures beside it. The normal
flow does not require the user to operate verification and preparation stages.

### Execution checklist and throughput checkpoint

The first checkpoint is a real app opened through the Hub and a second request
that preserves its first behavior. Documentation removes contradictory
instructions but is not Product delivery. The work spans existing Builder
SQL/store, source custody, runtime/service, Registry admission and UI contracts;
it is a coordinated increment, not a one-line verifier fix.

- [x] Read poteto-mode principles and frame the approved outcome.
- [x] Record the approved policy and the experiment/closure distinction here.
- [ ] Align the smallest affected semantic owners and concrete state contracts.
- [ ] Capture the existing failures for continuation, no-edit response and
  unreviewed technical Preview using the current tests and a disposable database.
- [ ] Implement working origin and result variants with a forward migration;
  adapt Git admission, runtime, service, recovery and Registry consumers together.
- [ ] Compose automatic preparation and the existing UI. Prove create, open
  and a second edit with actual login, model, E2B and browser.
- [ ] Begin the real Brain experiment as soon as that cycle and its own
  prerequisites work. Do not wait for the next checklist item to finish.
- [ ] Complete failed-build correction, no-edit conversation, stale/replayed
  requests, late-result protection, restart/reopen and full candidate verification.

Use existing targeted suites after each affected unit. Keep source controls
and credential isolation working throughout. Review structural and authority
changes with the existing risk-triggered Luna policy; no per-file approval or
new review subsystem. Commit, PR and deployment steps are excluded from this grant.

### Early Brain experiment

The dependency is the usable create/open/continue cycle, not closure of every
first-app proof. A confirmed business rule, its exceptions and independently
expected results are also required. Commission is an example, not a supplied
formula or a requirement that Conexus become a calculator product.

Select authored `mnobre_brain` content at an identified revision. A small
deterministic export feeds the existing Brain format and Registry. Preserve
item IDs, full relevant text, exceptions and source references. Add real authored
admission instead of labeling real knowledge SYNTHETIC. Textual KNOWLEDGE must
not require a fabricated ERP health result or DATASET assertions.

Give the agent a short index and a server-side authorized item-reading tool.
The server fixes workspace and revision from trusted project context; the model
does not supply credentials, an account identity or an arbitrary URL. Record
the returned item and revision without exposing secrets. Reading knowledge
does not grant ERP access or Brain editing. Rule updates are explicit.

Ask for a calculator without including its formula in the prompt. Observe the
real item read, use the generated app against expected values, then request an
explanation or visual change while preserving the rule. Missing or ambiguous
knowledge must produce a question or explicit gap, not an invented formula.
Authorization defects or file-loss defects block the affected experiment.
Incomplete unrelated recovery proofs do not block learning from this flow.

### Local operation and completion limits

Reuse existing startup commands where possible. If absent, provide bounded
pilot up/status/down commands that identify their own resources, report the
real HTTPS address and preserve data. Persistent pilot data cannot depend on
`/tmp`; certificates and secrets stay outside Git. Do not create a generic supervisor.

Before declaring the delivery complete, prove repeated edits with correct Git
parents, a no-edit reply, correction from retained failed-build source, previous
app preservation, reconnect without duplicate work and restart without needless
recompilation. Test fresh database setup and forward migration, access refusal
and protected paths. Run the complete current verification graph and report all
attempts. Existing four hash/projection failures are not waived or silently
fixed by changing old receipts. ERP access is a later real operation with its
own consumer, not a prerequisite for the knowledge calculator.

## Delivery checkpoints

The dated checkpoints below retain proof of the previous policy. Their
verifier-first next actions and research-only restrictions do not override
the current roadmap or the internal pilot refactoring above.

### Interactive browser result and streaming follow-up

On 2026-09-12 root completed the first Create and open journey through the real
compiled Hub UI, Keycloak login, admitted model and E2B. The plain Portuguese
request asked for a counter starting at zero with an Adicionar button. It did
not specify a framework, source paths, dependency setup or commands. Root read
the proposed Baseline on screen, approved it, submitted the Builder request,
prepared Preview and opened the actual retained app.

The iframe displayed `Contador`, `0` and `Adicionar`. Clicking once displayed
`1`; two more clicks displayed `3`. The UI's new-tab button opened the same app,
where the initial value was `0` and one click displayed `1`. Root inspected the
screenshots as well as the rendered controls. No mock routes or replacement app
were used for this journey.

| Binding | Observed value |
| --- | --- |
| Project | `3e72b95f-c629-4063-a442-8eb1d703c539` |
| Change | `50b591a0-89a9-44f0-9061-cd48a79db55a` |
| Verified candidate source | `8fc689f1835fdb2c805a90c89eeea96f1138bd30` |
| Retained application revision | `2aa6efa9-687b-477a-83e1-adb032922d66` |
| Retained digest | `a137492a453dfb9e7153e1c9edb466229ff304d2c48b8d1d6d21352f492ed77a` |

The local proof remains in `/tmp/conexus-generated-app-ZL6xep`, with its
disposable database `preview_access_c47209909bc64bf6a33c6f62a1dcf63d`. Browser
captures are under `/tmp/conexus-preview-access-design-qZIiQj/visual-counter-*`.
These are local proof resources, not production deployment. The generated app
has not yet passed second-human-request continuation or restart recovery.
Full candidate verification, Brain/SDK integration and colleague access remain
unproved. The existing warning about current-Project Preview and the stale
loading wording are still visible even while the candidate app works.

The operator then requested a focused deep study and architecture proposal for
real streaming chat UI using Mastra, its APIs/SDKs, Context7 and mature platform
references including Palantir. Research may challenge this Build interaction;
it does not restart whole-platform planning or authorize replacing the execution
stack. Preserve the generated app while studying the smallest streaming design.

### Streaming investigation result

#### Real streaming result and current blocker

Root exercised the compiled Hub and React UI with trusted local TLS, real
Keycloak login, the admitted model and E2B on 2026-09-12. One plain Portuguese
request created Change `f5aff913-67af-4644-8d45-08cef13fe23c` in the existing
`Contador da equipe` Project `3e72b95f-c629-4063-a442-8eb1d703c539`.
No model/provider response, app source or browser route was substituted.

- At 37.694 seconds after the click, the browser displayed the partial text
  `Vou começar in` while the durable Change was `RUNNING`.
- Reloading the page restored that prefix while the same Change remained
  `RUNNING`. Tool activities then appeared and advanced to completed. The
  browser issued exactly one CreateChange POST. The database recorded one
  coding actor and one verification actor, not a duplicate coding execution.
- The coding actor completed and retained candidate
  `087eef7169d13b699edba5a6f11dd3612e91b373`.
- The verifier failed with `BUILDER_VERIFIER_REPORT_REFUSED`; the Change became
  `UNVERIFIED`. The UI reported unavailable observation and did not offer
  preparation of this candidate. This attempt did **not** produce an opened
  new application and is not a successful end-to-end build receipt.
- The previous real generated counter was reopened through the UI, counted
  from zero to two in the iframe, and remained at two when the refused
  candidate was selected. It also opened in a new tab and counted to one.
  That is preservation of the prior application, not acceptance of the new one.

The verifier's existing consistency predicate throws that code. The exact
rejected report was not retained, so its particular conflicting fields cannot
be reconstructed from this run. Do not infer that the generated app was wrong
or weaken the predicate to obtain a green demonstration. The next diagnostic
needs a safe reason for report refusal and a reproduced verification outcome
through the admitted workflow. Do not manually settle this Change or bypass
verification to compile it.

Screenshots inspected by root are in
`/tmp/conexus-streaming-implementation-3Khw8l/`: `live-streaming-before-reload.png`,
`live-streaming-after-reload.png`, and `live-failed-candidate-preserves-app.png`.
The desktop Build route now uses the existing wide layout after the live
screenshot exposed a narrow Preview; the browser regression requires the
application column to be wider than the conversation.

Final focused results: 21 observation/mapper/feed/service/HTTP tests and four
Chromium UI tests passed. Hub and web typechecks, scoped Biome, web production
build and `git diff --check` passed. Two isolated Luna reviewers inspected the
revised candidate; identified lifetime, subscriber-cap, interrupted-tool and
incomplete-model-status issues were corrected and checked.

`npm ci` and Chromium installation completed. The full verification attempt
stopped on the unchanged profile source hash. A separate run executed all 69
remaining graph commands rather than hiding that failure. Across both runs,
67 of 71 commands passed. Failures were `g0-profile-compiler`,
`r1-s2-generate`, `r2-p0-check`, and `r1-s6-contract-generation`, due to the
existing source hash and generated-route synchronization drift. Their relevant
Product inputs/generators were unchanged from `2830d3b`; the new technical
stream contract checks passed. This is not a green full verification receipt.

No commit, push, merge, hosting change or business-data write occurred during
the implementation and live proof. The operator subsequently authorized
publishing this snapshot to the existing analysis branch for GPT Pro review,
without accepting the unfinished delivery or authorizing a merge.
The failed candidate, earlier generated app and owned proof database remain
available for diagnosis. Local proof servers are stopped at handoff.

#### Implementation and comparison checkpoint

Implementation checkpoint on 2026-09-12: native Mastra text/tool observation is
integrated with the server-owned Change job and existing React Build panel.
TI-04 carries only the bounded safe projection; it grants no new Product action.
Coding, verification, correction and Preview keep their existing owners.

The executable Arena selected candidate A. Both candidates passed their own
suites, but an independent slow-reader probe showed that B kept an extra native
stream queue outside its byte accounting. A also accepted a large frame directly
when a reader was waiting; B incorrectly rejected it. Integrated A retains its
zero-high-water-mark stream and explicit live queue. Grafted repeated-terminal
checks and the distinguishing queue probe. The isolated comparison is in
`/tmp/conexus-streaming-implementation-3Khw8l/independent-judge.md`.

Controlled verification passed the initial 17 event/feed/service/HTTP tests and
the real Chromium UI test with an explicitly controlled SSE source. Those prove
incremental rendering, tool correlation, prefix retention, detachment and access
checks, not a live model response. Model/E2B/browser proof remains pending at
this checkpoint. New tests belong to the existing candidate verification graph.

The full `npm run verify` attempt stopped at a pre-existing source hash mismatch
in the retained profile compiler test: the unchanged `profiles/r1/v1/input-set.json`
pins `docs/product/operation-ledger.md` to `92faa951…`, while the current committed
file is `1acef1bd…`. Neither file was changed by streaming. A separate run checks
the remaining graph without reporting the failed full command as green.

Implementation was approved on 2026-09-12. The immediate vertical outcome is
an authenticated Build request with actual Mastra text and tool activity visible
before completion, while existing coding/verification/Preview settlement stays
authoritative. Arena will compare executable bounded-feed implementations,
not repeat the platform study. Root owns wire/runtime/UI integration. Target
falsifiers are lost initial parts, mixed-run output, unbounded slow readers,
disconnect canceling or duplicating work, unauthorized stream disclosure and
stream completion falsely promoting Preview. Controlled tests cover these seams;
only a real model/E2B/browser run closes the incremental-display claim. No
database migration or new chat/session engine is included.

The focused [Mastra streaming study](../research/mastra/builder-streaming-ui.md)
now records the current implementation, exact adopted APIs, Context7 and guide
cross-checks, pinned Mastra Studio source, Palantir/Factory references, and two
Luna architecture candidates with cross-review. This is a researched proposal,
not implemented streaming or permission inferred from a reference product.

Recommended next slice is real native Mastra text/tool observation attached to
the existing BLD-03 background Change, rendered in the existing app-first Build
UI. Keep separate text blocks and correlated activity parts, not a single status
string. The model, worker lifecycle, candidate verification and Preview owners
stay in place. Browser disconnect releases observation, not the paid run.

Studio's own UI uses `@mastra/react` and native client streams; its AI SDK guide
describes a different integration. Neither hook can simply observe our current
Change without adaptation. Do not copy Studio's memory/session infrastructure
or implement a replacement session controller merely to show streaming.
AgentController remains the framework option to examine before later session,
steering or approval work, not an immediate replacement of the proven worker.

- [x] Trace current flow and read installed Mastra API, Studio code and guides.
- [x] Compare native observation against AI SDK UI transport and record risks.
- [ ] Admit the narrow Builder-specific technical observation wire and implement
  its bounded feed, actual runtime events and ordered UI parts.
- [ ] Prove incremental output and real tool activity in the authenticated
  browser while the actual coding job runs. Verify disconnect does not duplicate
  execution or destroy the previous app. Controlled streams do not close this.
- [ ] Continue the existing second-request and generated-app recovery journey;
  run the full current verification graph after integration.

No dependency was installed and no streaming Product code was changed in this
investigation. Temporary design alternatives and the cross-judge are under
`/tmp/conexus-streaming-design-ZXlXsZ`; the linked study contains the selected
synthesis and its limits so those temporary files are not required authority.

At the end of the research, root stopped the owned Chromium and Hub processes.
The retained generated app, source directory, private restart context and
disposable database were preserved. Local Hub/Preview URLs are therefore offline
until the owned Hub is started again; this shutdown is not a generated-app
restart/reopen proof.

### GPT Pro review snapshot, 2026-09-12

The operator requested publication of the current implementation for a concise
review of the simplified MVP direction. This snapshot is not a completed app.
The fixed starter passed the real E2B compiler and Chromium. Retained-artifact
access passed real Keycloak, PostgreSQL and browser proof with controlled app
files. The Build UI's four browser tests passed with controlled API responses.
Those results do not prove the complete model-created app journey.

The configured-server proof has not passed. Its temporary browser runner failed
with a garbage-collected evaluation promise after successful Preview GET and
preparation POST responses. Runner diagnosis is in progress. Restart recovery,
the generated-app journey, explicit second-human-request continuation, and the
full current verification graph remain unproved for this snapshot.

A fresh independent review reported two integration risks that still require
root reproduction and disposition, not automatic acceptance of the findings:

- An issued I&A entry grant can outlive a failed MAR launch, retaining unusable
  records until expiry. Inspect compensation before accepting the access cycle.
- The UI checks the pending iframe, then mounts another iframe. Failure of that
  second navigation could replace the previous app despite the successful HEAD.
  Prefer keeping the already-loaded frame if reproduction confirms the gap.

The Pro review question is whether any work before the first usable app can be
removed without losing source continuity, actual app execution or existing
access boundaries. Do not reopen R/L plans, add a new architecture, or treat
Brain and Sankhya's existing module proofs as integrated app behavior.

### Pro review follow-up

#### Configured-server recovery proof after Pro review

Root ran the compiled production `server.ts` with real Keycloak TLS login,
disposable PostgreSQL and normal-trust Chromium. BLD-21 reused a retained app,
BLD-22 opened it in an iframe and new tab, and the counter responded in both.
After restarting the owned Hub process, the old access was refused. Fresh
authorization reopened the same artifact at its stable URL. Builder run counts
and retained artifact identities were unchanged. The runner reported `PASS`.

This proof uses controlled retained app files, not model-generated source or
the Build UI controls. It does not establish the first-app journey or SDK use.
The runner is `/tmp/conexus-preview-access-design-qZIiQj/configured-server-proof.mjs`.
It orchestrates actual browser fetches and navigation against the full server.
The earlier runner failures included a lost evaluation promise, premature
interaction before script load, and an incorrect expectation of a changed URL.
No Product implementation change was needed to pass this bounded proof.

The operator returned GPT Pro's review of `2830d3b`. It supports the existing
recut and prioritizes integration, not another architecture. Apply two bounded
checks before the real first-app journey:

- Reproduce a successful pending iframe GET and HEAD followed by a failed fresh
  displayed-iframe GET. In `project-build.tsx`, promote the same keyed, loaded
  iframe without changing its `src`. Keep the previous frame until settlement.
  The existing browser test must prove no extra promotion GET, preserved app
  state, and retention of the previous frame on a failed pending navigation.
- Inject failure after entry-grant issuance. Check access-owned record cleanup
  and capacity through existing I&A/MAR operations. The entry grant expires
  after 30 seconds; a consumed Preview cookie has a separate lifetime. Do not
  describe retained unusable records as a demonstrated credential leak.

Then drive login, the real model request, retained compilation, and iframe/new
tab interaction through the configured Hub. Continue to the explicit second
request and restart proof. Full verification follows integration. Existing
compiler, storage, authentication, and concluded experiments are reused.

Root reproduced retained unusable I&A records through the public access and MAR
APIs, then reviewed the exact-token compensation. I&A now discards the issued
entry grant when Hub launch settlement fails. MAR discards the redeemed cookie
when activation fails. The targeted access, Preview HTTP and workspace HTTP
checks passed 23 tests. They cover capacity recovery without expiry, repeated
discard, unrelated-token preservation and refusal after failed activation.
No new storage, service or revocation registry was introduced.

Root also reran the four Build browser tests after reviewing the iframe fix.
The Preview test uses an actual HTTP 303 from a local test server. It increments
the app counter before HEAD settlement, then proves promotion performs no second
GET and preserves the counter value. A later refused HEAD leaves that same
previous app usable. The implementation keeps the loaded iframe's key and `src`
unchanged and gives each pending launch its own form target. These are controlled
UI checks, not a model-generated app demonstration.

The first full generated-app runner reached real login, NEW Project creation,
model-backed Inception, UI Baseline approval and a `VERIFIED` Builder candidate.
Its source Git contained the requested counter files. The runner then timed out
after 60 seconds waiting for the Open Preview button. It did not observe a
terminal preparation result and cannot establish a compilation failure. Its
disposable database and source directory were cleaned up by that runner.

A second run exposed the same 60-second observation limit during Project
creation, before another model request. The revised runner retains failed proof
state and observes preparation states through the server's 180-second lifetime.
Root switched to interactive Chromium inspection against the retained local
Hub environment. The operator explicitly requested browser validation as a user.
Root created `Contador da equipe`, inspected the actual screens, reviewed the
model's proposed Baseline and submitted a plain Portuguese counter request
without specifying stack, source paths or commands. Browser interaction remains
the deciding proof; backend `VERIFIED` alone is insufficient.

The observed UI still exposes technical Baseline/Change vocabulary and shows a
Preview-unavailable warning during initial generation. These are concrete UX
observations for the existing Build consumer, not a new architecture prerequisite.

### Checkpoint definitions

The operator approved these checkpoints on 2026-09-12. They split one first-app
delivery into observable results, not new R/L phases or independent approval
gates. [Roadmap](../roadmap.md#current-direction-and-tracking) owns delivery state
and the next action. Create and open now has the interactive browser result above;
the other checkpoints still lack their generated-app journey proof.

| Checkpoint | What the operator demonstrates | Existing proof and missing behavior |
| --- | --- | --- |
| Create and open | Log in through the real UI, request an app, use its compiled output in iframe and a new tab | [Interactive browser result](#interactive-browser-result-and-streaming-follow-up) passed for a real model-created counter; streaming remains a separate UI gap |
| Continue | Make a second request against that app; use the added behavior while retaining the first feature | [Continuation semantics](#exact-continuation-semantics) are proposed; real second-request source ancestry and browser behavior are not demonstrated |
| Preserve and recover | Restart Hub and reopen without recompilation; a failed or late build cannot replace the correct version; revoked access cannot retrieve it | [Configured-server recovery](#configured-server-recovery-proof-after-pro-review) passed with controlled artifacts; the generated app still needs this journey |

Source identity, authorization, retention and failure handling constrain the
first checkpoint. The last checkpoint exercises recovery across the assembled
journey; it does not postpone designing those properties. Preserving app files
does not require persisting a demonstration counter's value. The demonstration
app remains interchangeable and does not define Conexus.

### Create and open work packet

Reuse the current Mastra coding path, verified-source reader and E2B compiler.
The intended change connects them to retained compiled output and the existing
Build UI. Do not rebuild the compiler or add a separate editor/runtime framework.

- [x] Confirm the fixed `app/` template and Builder instructions produce source
  accepted by the existing compiler. Read the actual seed consumer before
  deciding whether the recorded seed mismatch blocks this path.
- [x] Compare the isolated Registry draft with the current migration runner and
  [retention proposal](#registry-retention-implementation). Select the reusable
  persistence pieces and identify missing behavior, without assuming integration.
  - [x] Probe the unchanged draft over the current 001..023 schema without held
    MAR migrations. See [dependency probe](#registry-dependency-probe).
  - [x] Resolve the confirmed permission defect and successor catalog/ledger
    design, then prove authorized retention and reconnect before acceptance.
- [x] Close the [browser access proposal](#browser-access-and-presentation)
  against the actual local hosts, routes and authorization owner. Specify a
  browser experiment where browser behavior, rather than opinion, decides.
- [x] Bind source revision, compiled files, retained identity and displayed URL
  through the existing Builder service. Trace the handoff from verified coding
  to compilation and retention against its existing state transitions before
  introducing new build records. Specify failure and late-result behavior
  before implementation. Preserve the [second-request constraint](#exact-continuation-semantics)
  without implementing that checkpoint silently.
- [x] Record exact implementation files, unresolved choices and the bounded
  real-model/E2B/browser proof request. Then obtain the required execution grant.
- [x] Implement and demonstrate Create and open after that grant. Record actual
  prompts, source/artifact identities, browser result and remaining limits.

Current resolution evidence is the [access consumer proof](#access-consumer-proof--2026-09-12)
and the Registry/preparation observations below. The autonomous grant is in the
roadmap. The fixed profile and real Create and open demonstration now have the
[interactive result](#interactive-browser-result-and-streaming-follow-up).
Streaming, explicit continuation and generated-app recovery remain open.

A checked planning item means its question was resolved with a decision or
evidence pointer. It does not mean the app was delivered. The technical sketches
below are inputs to this work packet; earlier experiment grants do not carry
forward. Detail Continue when this checkpoint's interfaces are settled.

### Local Preview consumer implementation

Goal: open an exact verified candidate through the existing Build UI, using
retained Registry files, isolated local HTTPS and current I&A authorization.
The operator approved this consumer as a whole. Its units below are not separate
approval gates. No commit or publication is part of the grant.

The architect comparison evaluates process-local attempts against durable
database attempts. Candidate sketches live under
`/tmp/conexus-preview-design-q3OWIG`; they are not alternative task authorities.
The selected shape uses one local Hub process and durable Registry artifacts.
The Luna cross-judge preferred candidate A, scoring it 7/10 against B's 7/10
with the smaller single-Hub shape as the deciding criterion. Root adopts A with
account-scoped keys, discriminated states, non-refreshing parent-session checks
and artifact-specific hosts. Reject B's durable attempt migration and relaxed
historical-candidate Registry reads. Do not let GET turn orphaned retained bytes
into a successful attempt. The read-only judge also checked the two initial
decision-log entries without finding unsupported claims. Root supplied proposed
corrections while judging was in progress, so this is collaborative design
challenge, not an isolated closure review. All runners used Luna as requested.
The MAR route trace confirmed that MAR owns route identity and lifecycle, not
that Preview must adopt a particular SQL table or the held 024/025 migrations.
The judge also cited L1's stronger restart proposal. L1 is historical, while
the current task explicitly allows browser grants to expire on Hub restart.
Keep stable immutable artifact identity and fresh authorization on reopening.
Before serving code, bind the route's identity, expiry, revocation and replacement
rules explicitly in the current owner. A bare host-to-file lookup is insufficient.
Reopen attempt persistence for multiple Hub instances or a
real requirement to recover attempt history, not merely to reopen retained files.

#### Preparation coordinator

Add `builder/preview-preparation.ts` around the existing `prepareApplication`.
Use an account-scoped exact-candidate key. A caller supplies only Project,
Change and expected subject digest; the server resolves source and permission.
Do not share another account's preparation result or authority.

```ts
type PreviewPreparationRequest = Readonly<{
  accountId: string
  projectId: string
  changeId: string
  subjectDigest: string
}>
type PreviewPreparationSubject = PreviewPreparationRequest & Readonly<{
  sourceRevision: string
}>
type PreviewPreparation = Readonly<{
  attemptId: string
  subject: PreviewPreparationSubject
  expiresAt: number
}> & (
  | Readonly<{ state: 'PREPARING' }>
  | Readonly<{ state: 'PREPARED'; artifact: ApplicationArtifactMetadata }>
  | Readonly<{ state: 'FAILED'; code: 'PREPARATION_FAILED' }>
  | Readonly<{ state: 'EXPIRED' }>
)
```

The coordinator exposes `start(request)`, `read(request)` and `close()`.
Both reads and starts re-resolve the exact authorized verified subject.
`start` coalesces concurrent calls for the same account and subject; it alone
may invoke preparation. The existing preparation performs the Registry hit or
compile-and-retain path. Do not implement a second retention orchestrator.
`read` never starts or retries work. A missing in-memory attempt returns null.
After restart, an explicit start may reuse Registry without compilation.

An attempt expires after 180 seconds. Expiry aborts its preparation signal.
Allow at most eight unsettled preparations in the local coordinator by default.
An expired attempt still counts until its promise drains. Capacity exhaustion
returns `PREVIEW_PREPARATION_BUSY` before starting another preparation. Retain
at most 256 terminal entries and clear their timers when evicting them.
Only the same non-expired attempt may transition to PREPARED after an exact
subject and returned-artifact check. Late completion can leave reusable immutable
bytes, but cannot settle an expired or replacement attempt. An explicit start
after FAILED or EXPIRED creates a fresh attempt. Never automatically retry a
failed paid call from GET or polling. `close` refuses new work, aborts active
attempts and drains their promises before Builder closes its pools.
PREPARED means retained output, not a ready or authorized browser route.

- [x] Add `tests/implementation/builder-preview-preparation.test.mjs` and observe
  the missing coordinator fail before implementation. Prove one preparation for
  concurrent same-subject starts, account isolation, read without preparation,
  refusal after permission or subject change, expiry with late completion,
  fresh retry, returned-artifact mismatch, and close draining active work.
- [x] Implement the coordinator with the existing Builder types and narrow
  dependency functions. Keep it out of HTTP until the following binding is ready.
- [x] Run the new tests and existing `builder-application-build.test.mjs`, Hub
  typecheck and import checks. Add the new test to the existing Builder leaf.
  Controlled callbacks prove coordinator behavior, not E2B or a browser journey.

#### Authorized launch and serving

The next executable unit binds the coordinator to `builder/service.ts` and
`builder/module.ts`. The service exposes `startPreviewPreparation(request)` and
`readPreviewPreparation(request)` with the existing coordinator types. It owns
one coordinator for its lifetime and uses the same retained preparation function.
Shutdown refuses new preparation, aborts and drains coordinator work, then closes
the existing store. No independent pool, compiler or retention path is added.
Verify through the real service that concurrent starts share one compilation,
reads do not compile, retained output is reused after service recreation, and
shutdown during retention cannot close the store early or expose a late success.
These checks use controlled external ports and do not prove HTTP or live I&A.

This service binding is implemented. Root ran 23 preparation/service tests,
13 coordinator tests and two BLD-10 projection tests, all passing. Hub TypeScript,
focused Biome and `git diff --check` also passed. The writer first observed four
missing-method errors and a double-close assertion of `2 !== 1`. Root strengthened
the recreation fixture so only a successful retention supplies the next service's
artifact, and checked that both concurrent close callers wait for blocked retention.
The proof uses the production service, coordinator and preparation function with
controlled source, compiler, Registry and store ports. It does not prove database
durability or a full Hub restart. No live provider call was made in this unit.
Fresh Luna review found no blocker in this service binding and no scoped comments
or suppressions to remove. Module composition is checked by inspection and
TypeScript, not a dedicated configured-module execution. Root also ran all 26
import-law checks and the 12 required repository checks successfully. The full
verification graph remains unrun for this partial increment.

The next wire binding keeps BLD-10 as the sole Preview read. Extend its closed
schema with a narrow optional preparation projection and add the explicit
preparation command. Return attempt state, expiry and prepared artifact identity,
not Registry file metadata or the account/session binding. A retained PREPARED
result alone must not set `ready: true`; readiness still requires MAR serving.
The read-only Luna trace confirmed the existing handwritten Builder client and
route census also need updating. Do not add another preparation-status GET.
The exact command ledger entry and wire schemas remain to be implemented together
with their routes. This trace is not acceptance of the browser authorization code.

Bind `BLD-21 PrepareBuildPreview` to
`POST /api/control/projects/{projectId}/preview-preparations`. Its closed request
contains `changeId` and `subjectDigest` only. Resolve the account from the current
CSRF-validated session and return HTTP 202 with the narrow preparation projection.
The projection binds Change and subject digest to attempt identity, state and
expiry. Only PREPARED carries artifact revision ID and digest. It contains no
source files, account, session binding or launch credential. BLD-10 may return the
same optional projection for an exact verified candidate. An absent attempt
omits the field; reading never starts preparation. Refuse an unknown or changed
subject without disclosure, and report capacity/closed-service failures as
unavailable. Keep `ready` false until serving is integrated. Verify the real
registered routes for explicit start, passive polling, schema refusal, exact
Origin/CSRF and account derivation, using controlled external ports until the
assembled I&A/Registry browser proof is ready.

The HTTP binding is implemented. Root ran all 45 preparation/service,
coordinator, BLD-10 and registered-route tests successfully. The registered-route
proof reaches the production service and coordinator with controlled external
ports; it is not a real-session or browser proof. TypeScript, wire bundle,
Builder schema, operation bijection, carriers, projections, all 26 import-law
checks, the 12 repository checks and `git diff --check` passed. An initial
`wire:check` invocation named a nonexistent script; the explicit existing wire
commands above were then run successfully. No provider call was made.

Bind an explicit CSRF-protected preparation POST to the coordinator. Keep the
existing BLD-10 GET side-effect free and distinguish its source verification
from preparation progress. Add the bounded preparation and launch wire schemas
to `contracts/api/product/builder-paths.yaml` and the owning operation ledger
before routes consume them. Launch is a separate authenticated POST that requires
the exact prepared artifact and current admission; GET does not mint credentials.

I&A owns a one-use 30-second entry grant and a 15-minute Preview cookie grant.
Bind them to the issuing session, account, Project, Change, source, artifact and
exact Preview host. Add a non-refreshing current-session check in
`identity-access/store.ts`; asset requests must not prolong Hub session idle
expiry. Keep any session binding server-side. Recheck session expiry/revocation
and current Project authority before serving bytes.

MAR owns the form-POST entry and static assets in `mar/preview-routes.ts`.
Use `preview-<artifactRevisionId>.conexus.localhost`, not one mutable host/cookie
mapping per Project. Two different app versions must remain independently
openable. Consume the entry grant once, set only the Preview host-only cookie,
then redirect to a clean URL. Validate exact Host and Hub Origin, paths, media
types and Registry revision. No Hub control API is exposed on the Preview host.
Use the existing browser contract above for expiry, CSP and refusal behavior.
Wire TLS and host dispatch in `http/app.ts`, `platform/config.ts` and `server.ts`
with the existing private certificates and loopback-only binding.

The bounded Chromium probe exposed a concrete entry constraint. Applying
`Referrer-Policy: no-referrer` to the Hub made form POSTs send `Origin: null`.
All three iframe variants were refused, including an unsandboxed control.
Changing only the Hub policy to `strict-origin` restored the exact Hub Origin.
Keep `no-referrer` on Preview responses. The response-CSP variant with
`sandbox allow-scripts allow-same-origin` ran the counter in iframe and a new
tab without disabling certificate validation. Restrict app documents with the
server-owned CSP, including direct new-tab navigation; do not rely only on the
iframe attribute. Keep the exact-Origin check and refuse `null`.

The rerunnable stand-in probe is
`/tmp/conexus-preview-design-q3OWIG/browser-sandbox-probe.cjs`. Run once with
`PROBE_HUB_REFERRER_POLICY=no-referrer` for the three expected refusals and once
without that variable for the three interactive successes. This proves the
TLS/form/CSP mechanism only. It uses a fixed synthetic entry value, no I&A,
Registry or real Hub routes, and cannot prove authorization or full isolation.
The initial sandbox hypothesis was rejected by the unsandboxed control.
[MDN's Origin interaction](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Referrer-Policy#effect_on_the_origin_header)
documents the form/referrer-policy behavior observed in the probe.

Do not add a server-invented last-good ordering or relax Registry admission.
The UI retains the exact previously prepared candidate while another is built,
and labels it as the prior version. Current permission and subject admission
still apply to launch and every asset read. A Baseline change that invalidates
that candidate must refuse access, not be bypassed to preserve the iframe.
Serving historical candidates after such a change is outside this consumer.

#### Selected local access implementation

Root compared two completed Luna architect sketches and their collaborative
cross-judge on 2026-09-12. Select immutable per-launch MAR routes, not mutable
per-artifact slots. No table, additional pool or Project-wide selected-route
pointer is required. The sketches and judge are temporary working material at
`/tmp/conexus-preview-access-design-qZIiQj`; this section owns the selection.
All runners used Luna, so there was no model diversity.

`BLD-22 LaunchBuildPreview` is an authenticated Origin/CSRF-protected POST at
`/api/control/projects/{projectId}/preview-launches`. Its closed request contains
`changeId`, `subjectDigest`, `attemptId`, `artifactRevisionId` and `artifactDigest`.
These are untrusted selection coordinates, compared to the current account's
exact PREPARED attempt. HTTP 201 returns `entryUrl`, clean `previewUrl`,
`entryGrant`, artifact identity and expiry. It returns no Hub/session credential
or file metadata. Unknown/stale/foreign subjects are refused without disclosure;
resource/closed-service failures are unavailable. A GET never issues a grant.

I&A keeps digest-keyed entry and cookie records and the private issuing-session
digest/identity. Add a non-refreshing session read using existing IAM permissions.
Do not widen `CurrentSession` or pass raw Hub credentials to MAR. Consumption
removes the entry before its first asynchronous check. Every continuation after
an await rechecks closure/expiry before issuing authority. Use at most 4,096
combined grants, expiration-on-operation and one unref'd sweeper. Refuse when
the live set is full. Clamp cookie expiry to the route's 15-minute expiry.

MAR stores at most 4,096 immutable route bindings with `routeId`, generation,
attempt, account/Project/Change/source/digest/artifact and exact host. Only an
exact OPENING record can activate; stale activation/revocation cannot affect
another record. No replacement API is introduced. The UI conditionally selects
a ready response using its own expected request/subject generation; this refines
the historical replacement proposal without a server-global ordering. Separate
artifact hosts preserve different versions. Reopening the same artifact in one
browser replaces that host's cookie; per-tab revocation for the same artifact
is not promised. Routes and grants expire on Hub restart, retained bytes do not.

Expose only Builder's bound Registry-file callback using the existing executor
pool. Asset reads require I&A cookie resolution, exact active MAR binding,
safe manifest path/media type and current Registry admission. Recheck session
and route after the asynchronous read, immediately before returning bytes.
Drain both HTTP listeners and MAR work before closing Builder/IAM pools.

Project/candidate admission is linearized by the Registry transaction for each
asset. A revocation committed before admission denies; an already admitted
in-flight read may finish. Registry's existing admission locks serialize that
decision, not the entire HTTP response. The post-read I&A and route checks
remain required. Do not add repeated database reads to imply instantaneous
revocation of previously admitted or delivered bytes.

Use a separate `mar/module.ts` constructor and `mar/preview-routes.ts`, private
I&A grant implementation, existing Builder module/routes, HTTP/config/server
composition and current wire/ledger owners. Add only MAR's module to the
composition-root import allowlist. TLS is optional for existing test callers;
enabling local Preview requires HTTPS, the existing certificate/key files,
distinct loopback ports and a `conexus.localhost` Hub host. Register a bounded
form parser with exactly one `entryGrant` field, rejecting duplicates and extras.
Fastify supports registering this parser without another package
([official API](https://fastify.dev/docs/latest/Reference/ContentTypeParser/)).
Hub CSP uses the valid `https://*.conexus.localhost:<preview-port>` source, not
the invalid partial-label `preview-*` wildcard. MAR still admits only exact
artifact hosts. Preview response CSP applies sandbox, self assets, no workers,
no forms and no outbound connections; it does not claim universal browser
egress control. Remove Preview's conflicting X-Frame-Options header.

The UI cannot use iframe `load` as proof of HTTP success. Browsers also fire it
for failed navigation ([MDN iframe reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)).
After entry navigation, the Hub page checks the same clean Preview URL with a
credentialed HEAD request before selecting the candidate. Ignore the initial
blank-frame load and reject stale request generations. Keep the prior iframe
mounted on a failed check. HEAD establishes current authorized document
availability, not correctness of the application's JavaScript or business logic.

Use the existing asset handler and its automatic HEAD route. Permit credentialed
CORS reads only from the exact configured Hub origin, never a wildcard origin,
and only for GET/HEAD. Hub `connect-src` includes the Preview host pattern.
Preview `connect-src` remains `none`; this does not admit app-to-Hub calls or
another Product operation. The request carries only that Preview host's cookie.
Prove the browser request and a foreign-origin refusal before UI integration.

Root ran that experiment against real Keycloak, PostgreSQL and Chromium. The
old Hub policy refused the HEAD request with `Failed to fetch`. After the
bounded CSP/CORS change, the exact Hub page received 200 and a different
`conexus.localhost` origin could not read the response. The extended access
script passed with 18 Registry reads and zero compiler calls. Six registered
route tests also passed, including HEAD refusal after session revocation and
absence of CORS permission for a foreign origin. UI failure/selection proof
and review of the integrated browser consumer remain separate requirements.

First prove actual registered routes and owner modules with controlled ports,
then real IAM/Registry over disposable PostgreSQL, then normal-trust Chromium.
The falsifiers are replay/expiry, non-refreshing session timestamps, close and
revocation during pending reads, wrong-host/foreign-candidate disclosure,
independent artifact versions and late selection. Template/second-request and
the real model/login journey remain required after this access unit.

#### Access consumer proof — 2026-09-12

Root ran four registered-route/I&A tests and the Hub TypeScript compilation.
The first run exposed a valid root-level manifest asset returning 404 and a JSON
entry body consuming a form-only grant. Both were corrected and all four tests
passed. Encoded path rejection is also checked without letting the injection
client normalize the tested path before dispatch.

Root then executed `/tmp/conexus-preview-access-design-qZIiQj/run-access-proof.mjs`
against disposable PostgreSQL 17.10, the real IAM and Registry runtime roles,
Keycloak 26.7.2 HTTPS and Chromium with normal certificate validation. The
registered preparation/launch/MAR routes delivered an interactive counter in
an iframe and the same URL in a new tab. Same-artifact relaunch and a separate
second artifact worked. Replay, anonymous access and session revocation during
a pending asset read were refused. Project-grant revocation refused a subsequent
Builder Preview read. Asset reads did not update the issuing session timestamp;
no Hub session/CSRF cookie reached Preview hosts. An extended run also revoked
Project access after launch and refused the already-issued Preview URL. Its
first run exposed a 503 classification for Registry admission refusal; mapping
only the exact PostgreSQL subject-refusal signal to an absent file fixed the
response without hiding other database failures. A further real run revoked
Project authority while the asset request awaited its Registry read and also
returned 403. Extended result: 16 Registry
reads, zero compiler calls, PASS. Six local access tests additionally prove
closed-module refusal without I&A reads and draining of a pending entry without
activating it after closure.

This proof seeds synthetic accepted Changes and retained HTML/JavaScript and
uses a minimal fixture Hub page. It does not prove the real Build screen,
model-generated code, second human-request continuity, Hub restart, or current
full verification graph. The temporary script and services are working proof
material, not a permanent Product runner.

Two fresh Luna risk reviews completed for the access boundary. Root corrected
the omitted BLD-22 permission-ledger row and made MAR-before-owner shutdown
ordering explicit after HTTP drain. Historical F14/F15 tests no longer freeze
the current Builder operation count; the central 130/22 wire checks retain that
responsibility. The three historical tests, six Registry adapter/PostgreSQL
tests, eight HTTP/config tests and 26 import-law tests passed. A proposed
post-admission revocation blocker was withdrawn after checking the actual
Registry transaction/lock semantics; its stub modeled a revocation after an
already authorized read. The reviewer independently reproduced pending-read
shutdown refusal and drain. No full UI/production-server closure is claimed.

#### Existing UI and deciding proof

Update `features/builder/api.ts` and `components/project-build.tsx` to invoke
preparation explicitly, poll preparation past VERIFIED, and launch the exact
artifact into an iframe or new tab. Track the selected candidate and attempt
when receiving asynchronous results. A stale response cannot change the
displayed version. Preserve the existing app-first screen contract; do not
introduce another editor or redesign the whole Build workspace.

Before completion, exercise the actual composed routes and UI in Chromium with
normal certificate validation. Prove interaction in iframe and a new tab,
independent versions, anonymous refusal, expired/replayed entry refusal,
parent-session and Project-access revocation, build failure, late completion,
and reopening after Hub restart without compilation. Use real disposable
PostgreSQL for session and Registry assertions. Controlled source or seeded
subjects remain explicitly narrower than login/model/Git journey proof.
Run the current full verification graph and two fresh isolated risk reviews
for the completed trust-boundary implementation. Do not call this delivery
complete from coordinator tests alone.

### Session record and collaboration

2026-09-12 standalone coordinator candidate implemented in
`builder/preview-preparation.ts`, with focused tests in
`builder-preview-preparation.test.mjs`. The existing Builder verification leaf
now includes those tests. The coordinator has no HTTP, service or UI caller yet.
The writer reported the initial RED as an absent exported function. Root
interrupted the writer after its two-file implementation, confirmed interruption,
and took exclusive ownership. Root ran the 11 coordinator and 18 preparation
tests successfully, then cleared timers during terminal eviction and strengthened
the concurrent-close assertion. The final combined rerun passed 36 tests: 11
coordinator, 18 preparation and seven verification-runner tests. Hub typecheck,
26 import-law tests and focused Biome also passed. The full 71-step graph was
not rerun for this partial, unconnected unit.

The fresh Luna reviewer found a mutable-input race in `start` and `read`.
Root reproduced both failures before correcting the input snapshot: returned
account `aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa` instead of authorized account
`11111111-1111-4111-8111-111111111111`. Both methods now copy and freeze the
request before their first await. Final root verification passed 38 tests:
13 coordinator, 18 existing preparation and seven runner tests. Focused Biome,
Hub typecheck and `git diff --check` passed after that correction. The reviewer
found no other lifecycle blocker and no comments or suppressions in the two
files. Its artifact/trail review preserved the browser probe's stand-in limits.
Direct frozen-object and expired-unsettled-cap assertions remain coverage
improvements for the composed consumer; they do not establish missing runtime
proof. The active-cap implementation counts all unsettled promises, including
expired work, and returned snapshots are copied and frozen.
The complete Preview grant remains active. Next is its route/session/HTTP/UI
consumer, not a repeat of this standalone coordinator or a new approval round.
No model, E2B, Sankhya, database or publication action ran in this unit.
The temporary TLS browser server was stopped after each probe.

2026-09-12 local Preview consumer approved. The operator approved the complete
consumer, including required bounded contract changes, implementation and browser
validation. The exact grant is in the roadmap. Root is comparing two isolated
Luna architect candidates before selecting attempt lifetime and access wiring.
No additional compiler or storage experiment is a prerequisite.

Grounding found that `builder/preview.ts` always returns `ready: false`, the
GET Preview route only resolves the source subject, and the Build component
renders text without an iframe. Candidate polling stops at `VERIFIED`, before
asynchronous preparation could finish. The new consumer must distinguish code
verification from executable Preview readiness. Identity access currently
returns no session identity in `CurrentSession`, and `validateSession` refreshes
idle expiry. Browser grant checks must bind the issuing session without exposing
the Hub cookie or silently extending its idle lifetime through asset requests.

The delivery checkpoint is an exact verified candidate opened through the real
Preview consumer in iframe and a new tab. Exercise failed and late preparations,
access revocation and reopening retained bytes without recompilation. Label any
seeded subject, substitute login or controlled source in the proof explicitly.
These cannot establish the model-generated app journey. Keep source-template
integration and second-request ancestry visible as remaining first-app work.

Throughput checkpoint: settle the owner and wire shape before Product editing.
Design candidates write separate temporary files. Root owns synthesis and
repository integration. Implement coupled backend behavior under one writer;
UI and independent proof can proceed separately only after the interface is
frozen. Never run verification against an actively written shared candidate.
Do not add hosting, reopen historical stages or publish this work implicitly.

2026-09-12 preparation increment completed. Root ran the clean dependency
installation, Chromium installation and full current `npm run verify` in pinned
WSL Ubuntu with disposable PostgreSQL. All 71 steps succeeded, exit 0. The
current graph includes the new service/Registry database proof; paid execution
remains opt-in and was run separately as recorded below. Two fresh isolated Luna
reviews found no blocking defects. No commit, push, PR or merge was made.
Root removed only `conexus-preparation-lcgycv` and its synthetic database after
verification. The retained test recreates its data; proof logs remain under
`/tmp/conexus-preparation-LCGYCV`. Existing credentials and local TLS trust were
not changed.
The next measurable delivery is the scoped Preview consumer, not another
compiler or storage experiment. Remaining gaps are invocation/attempt handling,
authorized serving, UI consumption and the actual generated-app journey.

2026-09-12 preparation proof: root integrated the isolated Luna implementation,
then passed 18 orchestration tests, the import-law suite and focused Biome.
The real Builder service, Builder store and Registry adapter also passed against
disposable PostgreSQL. The initial RED was the absent `prepareApplication` API.
The service now returns retained metadata, and a recreated service retrieves
the same revision without extracting source or invoking the compiler.

The named paid proof then ran once with the existing E2B compiler. Sandbox
`ikzspzi57v9ctlp53v04w` compiled the controlled HTML/JavaScript source. Registry
retained revision `9c3a49ca-665e-42c9-aa6d-198664984298`; after service recreation,
its metadata and every file matched. A loopback test-only asset server read
those bytes through Registry. Chromium observed 0, then 2 after two clicks,
with no page errors. Provider inspection returned not-found after sandbox
cleanup. The preparation/browser sequence took 9,486 ms, excluding setup.
The test and sanitized output are
`tests/implementation/builder-application-preparation-postgres.test.mjs` and
`/tmp/conexus-preparation-LCGYCV/live.log`. This proves production modules with
controlled source and seeded verified subjects, not model generation, Git
custody, configured Hub startup, login, MAR serving or a whole-Hub restart.
No new model or Sankhya request ran. Two fresh isolated Luna reviews found no
blocking defect. Both checked the 18 preparation tests, imports and scoped
static checks; one also checked the BLD-10 projection and decision trail. No
added comments or suppressions required action. Model diversity is reduced by
the operator's Luna-only instruction. Root subsequently completed the full
verification graph as recorded above.

2026-09-12 Builder preparation implementation checkpoint. The operator approved
the recorded consumer. Replace `compileVerifiedApplication` and the service's
`compileApplication` with retained preparation in `builder/application-build.ts`,
`builder/service.ts` and `builder/module.ts`. Export the existing Registry
adapter through `registry/module.ts`. The composition root `server.ts` injects
it into Builder through a structural port; Builder must not import Registry.
Bind Registry to the same executor pool in module composition.
Return Registry metadata, never transient bytes or a ready Preview. Keep the
existing request coordinates, source checks and shutdown tracking.

Prove that a retained hit performs no source extraction or paid compile, while
an authorized miss compiles and retains the exact verified source. Refuse stale
subjects and mismatched compiler output. Cancellation during retention may leave
reusable immutable output but must reject the request; close must drain work
before closing the pool. Migrate existing callers/tests without a compatibility
API. A controlled-source real-DB/E2B proof may establish preparation and reuse,
not model-generated source or the full browser journey. Use one isolated code
writer for the coupled files; root owns independent DB proof and integration.
The existing design is sufficient; no new architect/arena round is required.

2026-09-12 Registry unit verification completed. Root ran `npm ci`, installed
Chromium and ran the complete current `npm run verify` in pinned WSL with the
disposable PostgreSQL configuration. All 71 graph steps succeeded, exit 0.
The five migration tests include fresh install, actual 023-to-026 upgrade,
restart, concurrent installation and removed-permission refusal. The six
Registry tests include the actual adapter/database proof and runtime refusal
while schema USAGE is removed. Unit fixtures do not claim a generated app.
Repository and documentation-index checks also passed. Root removed only the
named disposable PostgreSQL container and its synthetic data after verification;
the retained tests can recreate it, and local proof logs remain available.
No commit or publication was made. Next is the scoped Builder preparation consumer described below;
HTTP serving, ready Preview and real generated-app continuity remain unbuilt.

2026-09-12 Registry integration checkpoint: the production migration, current
loader and Registry adapter are now integrated in the working tree. The actual
adapter passed on disposable PostgreSQL through runtime-role retain, concurrent
idempotent replay, reconnect and exact HTML/JavaScript recovery. It refused a
changed payload for the same source, unadmitted account/source, withdrawn
baseline and access after grant revocation. A concurrent revocation waited for
the admitted transaction. Existing Brain bootstrap/read behavior also passed.
The fixtures explicitly seed a verified Builder subject and controlled app files;
this is a production-module/database proof, not a Builder-generated app journey.
Two initial test failures were fixture issues: withdrawing approval requires
clearing its revision, and database teardown must close clients before dropping
the database. Both were corrected without weakening Product constraints.

The current loader's four existing PostgreSQL tests passed with 026. A separate
023-to-026 upgrade and permission-removal check were then added; their deciding
result belongs to the current verification run, not the earlier four-test result.
Two fresh isolated Luna reviewers found no blocking defect in the structural
candidate. Root inspected their findings; no Product correction was required.
Both reports overstated root's progress as a full verification pass. Root
corrected that wording: only the targeted migration/Registry leaves had passed
at that point, and the full graph remained running. The reports do not replace
the deciding command result. This uses reduced model diversity under the
operator's Luna-only instruction.
`npm ci` and Chromium installation completed. The full current `npm run verify`
is running with output at
`/tmp/conexus-registry-integration-96j5J8/verify.log`; no complete-pass claim yet.

2026-09-12 live Sankhya result: one production OAuth authentication and one
existing fixed TGFCAB aggregate for company 1 completed in 2,581 ms. The observer
returned totalRows `136122`, nullKeyRows `0`, duplicateKeyGroups `0`. The query
uses the existing CODTIPOPER 14/714 mapping; this is not a customer count or a
claim about all sales. Root inspected the temporary script and sanitized result
at `/tmp/conexus-sankhya-live-probe-BO3x2W/probe.mjs` and `result.json`.
Authentication and query used production modules and bounded transport, with
no retry or business mutation. Credential bytes were materialized in memory;
no bearer, raw provider response or individual rows were printed. The descriptor
and subject were fixtures and the credential source was the existing private
probe file, not the integrated encrypted Hub store. This proves live transport
and observer behavior only. No paid model/E2B call has run in this unit yet.

2026-09-12 Registry implementation started after explicit operator approval.
The first real-PostgreSQL test failed because the actual current loader omitted
026. Added the corrected SQL candidate with the two named conflict targets and
the narrow builder-schema USAGE. The unique Project/kind constraint is created
directly rather than attaching a separately created index; both yield the same
named constraint/index. Its current SHA-256 is
`a5b051a57a40d7640bce15d248012a772d1b4129eb4f6a75475d23792449f006`.
Luna workers own isolated loader and adapter candidates; root integrates and
owns the actual adapter/database proof. The adapter's five focused tests passed
in the checkout. This does not establish Registry integration or app readiness.

The operator also required paid/live-data proof. The initial customer-count
suggestion lacked an admitted mapping. Use the existing bounded TGFCAB aggregate
observer for company 1 instead; no arbitrary SQL or customer-detail extraction.
An observer call with synthetic descriptor coordinates proves only the live
production-module path. Paid Builder/E2B execution follows its real consumer,
not an unrelated paid call added to a storage test.

2026-09-12 manual demo cleanup: the operator requested removal of the temporary
browser page and return to the next integration step. Stopped only the inspected
`manual-demo.cjs` process and deleted that disposable script. Port 8443 is no
longer listening. The page contained only synthetic HTML and an in-memory
counter; its script was disposable and has no Git recovery copy. Certificate
keys, installed trust and all deciding browser/storage probe scripts and logs
remain intact.

The next proposed implementation unit is the existing Registry retention
integration, not another storage comparison or browser demonstration. Add the
corrected migration 026 and production adapter, update the current migration
loader using the [integration envelope](#registry-integration-envelope), and
exercise the real adapter on disposable PostgreSQL. Its observable result is
exact compiled bytes recoverable after reconnect, with idempotent repetition
and refusal behavior preserved. It does not expose HTTP, change Preview
readiness, call providers or activate held migrations. The existing
[retention implementation](#registry-retention-implementation) owns the detailed
contract. Builder preparation/orchestration follows as its consumer. Product
code still requires the bounded execution grant recorded by the roadmap.

At each session end or meaningful checkpoint, the root updates the roadmap's
next action and records here what changed, what actually ran, the observed result,
remaining blockers and the relevant commit or artifact. A short dated entry is
enough. Link large proof artifacts only when the claim needs them. Do not paste
whole conversations or create a second tracking system.

GPT Pro's response on `9945329`, relayed by the operator, agrees that compilation
should be reused and that template wiring, retained serving and real continuation
remain. It reports no executed tests. Treat it as review input, not new runtime
evidence. Future briefs identify the exact commit and one unresolved question;
reconcile the answer against this task before recording a decision.

2026-09-12 tracking update: recorded the approved checkpoints and planning work
packet. Product implementation and live calls remain paused. Repository checks
passed for links, current-state rules, preflight parsing and diff whitespace.
No new app behavior is claimed. This documentation update is not committed.

The first read-only storage check found a stale assumption in the isolated
draft's `runner.patch`: it extends the old migration sequence through 025.
The current [runner](../../scripts/run-hub-migrations.mjs) instead selects
001 through 023 and holds 024/025 separately. Reconcile the draft's real schema
dependencies with that selection before integrating it. The draft README's
old 024 checksum blocker is not evidence of a current runner failure. No draft
SQL or runner patch was applied, and retention after restart remains unproved.

A bounded read-only Luna inspection identified five planning questions covered
above: source-template materialization, Builder-to-compiler orchestration,
retention with current migrations, authorized Preview access, and the retained
source coordinates required for later continuation. This is a gap census, not
an independent design acceptance or a runtime result.

### Storage comparison and SDK references

On 2026-09-12 the operator requested a bounded storage comparison and supplied
the joaoluistq npm profile and Factory's droid package. The new reference notes
are [Mitra SDKs](../research/mitra/npm-sdk-reference.md) and
[Factory packages](../research/factory-ai/npm-builder-reference.md). They record
observed versions, sources, useful patterns and unknowns. No packages or provider
processes were installed or executed.

Architect/arena compared two distinct alternatives with the existing JSONB
proposal. One Luna proposed PostgreSQL per-file bytea rows. Another proposed
immutable files on a persistent Hub volume with database metadata. A Luna
grounding reader then cross-judged both against the baseline. This is
collaborative design comparison with one model family, not independent closure
review. Root read both sketches and retained the existing JSONB proposal for
the next proof, not as an accepted runtime result.

| Shape | Benefit | Cost that decides this increment |
| --- | --- | --- |
| Existing complete JSONB revision | One transaction and one backup system, no extra table | Repeated asset reads traverse a large payload; measure before acceptance |
| PostgreSQL per-file bytea rows | Indexed per-file reads, one backup system | New relation and revised encoding without an observed read bottleneck |
| Persistent files plus metadata | Direct per-file reads | Durable rename, orphan handling and coordinated database/file backup and restore |
| Object storage plus metadata | Independent file storage service | Additional credentials, network failures and incomplete-object handling; no current operational need established |

The recommended caller contract remains the draft's `retainApplication`,
`getApplication` and `readApplicationFile`, with the existing explicit account,
Project, change and source coordinates. Do not adopt an abstract
`authorizedBuilder` token or let an app choose storage paths. Registry retains
immutable bytes; browser serving and session authorization remain separate.
The alternatives' useful contribution is the explicit per-asset read concern
and recovery counterexamples, not a new interchangeable-storage framework.

Before accepting JSONB retention, exercise the actual runtime-role SQL path with
authorized source, repeat and conflicting inputs, rollback, reconnect, and exact
file bytes. Measure one complete page's asset retrieval, including a bounded
near-limit revision, without recompiling or returning the whole payload to the
browser. Record latency, query count and payload sizes. No performance threshold
or successful result has been established. Reopen per-file storage if this path
cannot support the agreed browser experience or if observed backup/retention
cost becomes impractical. Do not infer that a schema USAGE grant alone completes
this proof.

The sketches and grounding are temporary working material in
`/tmp/conexus-storage-design-PCKW0e`. This section owns the surviving recommendation.
Successor permission/catalog integration remains unresolved; template wiring and
authorized browser access follow. Product implementation remains paused under
the roadmap grant. This round changed research and planning only.

### Authorized retention experiment scope

The operator requested execution of the storage proof after the comparison.
The bounded grant is recorded in the roadmap. Run current migrations and the
draft in a disposable PostgreSQL database, with synthetic application files and
explicit fixture prerequisites. Exercise the actual Registry SQL and unchanged
admission functions using the runtime database role. The known missing schema
USAGE may be corrected only in this disposable candidate, with the original
failure preserved. No successful result is claimed by this scope entry.

The falsifiers are failure to retain an authorized complete revision, different
bytes after reconnect, partial retention after a refused write, mutable results
on a conflicting repeat, and successful reads after access revocation. Record
asset-read timings only when the real success path works. A connection restart
is not a Hub restart, and fixture prerequisites do not prove Builder generation
or user authorization through the login UI.

The former compiler scratch directories named later in this task were absent
when checked on 2026-09-12. Their historical observations are not a currently
replayable local artifact. Do not claim this experiment consumes those outputs
or rerun a paid build without its own grant.

### Persistent database recovery and bounded read cost

On 2026-09-12 root extended the same isolated corrected SQL candidate to a
named Docker volume with `fsync=on` and `synchronous_commit=on`. The client
retained 32 synthetic files totaling exactly 12 MiB. Thirty files contain
random printable data to avoid a trivially compressible stress fixture; the
other files are HTML and JavaScript. This is a size/recovery experiment, not
a generated app or browser demonstration.

Retention took 6,495 ms in this local environment. Serialized JSON occupied
16,783,085 bytes; PostgreSQL reported 16,783,914 bytes for the stored payload.
The first attempt expired during disk initialization before testing storage.
The second retained the files, then hit a probe lifecycle race while reusing
the auto-removed container name. The volume remained intact. Neither failure
is recorded as a Registry defect or silently counted as a successful run.

Root inspected the surviving named volume and mounted it in a new PostgreSQL
container. PostgreSQL reported an interrupted shutdown and completed recovery.
The separate recovery process compared the entire persisted payload's SHA-256
with the digest recorded before shutdown, then read all 32 files through
`reg.read_application_file` while logged in as `hub_rb_executor`. It compared
every returned byte and file hash against that independently anchored payload.
It did not reapply migrations, reinsert fixtures or recompile source.

Three sequential passes each read 32 files and 12 MiB in 2,005 ms, 2,657 ms
and 2,868 ms. Per-file medians were 62 ms, 76 ms and 88 ms; maxima were 78 ms,
133 ms and 146 ms. The admin integrity read preceded these passes, so they
are not cold-cache benchmarks. A subsequent revoked file read was refused.
Recovery exited 0. No HTTP, concurrency, UI latency, backup restore, host power
loss, TypeScript adapter or Hub restart claim follows.

The SQL recovery evidence supports retaining the bounded PostgreSQL choice.
The read cost is material enough to carry into the browser experiment, not
evidence that JSONB is optimal at every scale. Do not add a cache or per-file
table without measuring the actual first-app page. Continue with the integration
envelope below rather than another general storage research round.

Artifacts are in `/tmp/conexus-retention-restart-29i7jH`: `result-2.log` contains
the pre-stop digest, `recover.mjs` and `recovery-result.log` contain the deciding
recovery check, and `recovery-postgres.log` records database recovery. The initial
`probe.mjs` has a container-removal race and is not a finished reusable harness.
The original Registry draft and Product source remain unchanged.

The recovery container and its synthetic-data volume were removed after the
check. Docker listings confirmed both absent; scripts and logs remain local.

### Registry integration envelope

The bounded Luna inspection of the current runner and stale draft patch identified
the following integration work. Root checked the six SQL function declarations
and current ledger branch. This is an implementation map, not code acceptance.

- Add 026 to current migration selection and the name-keyed digest map. Keep
  024/025 held and retain rejection of their applied ledgers. Do not transplant
  the draft patch's positional checksum logic or repin existing migrations.
- Teach the 011 catalog assertion the application Project scope while preserving
  Brain Workspace scope, Workspace/kind uniqueness and bootstrap behavior.
  Assert the proven Project/kind named unique constraint and immutable revision
  conflict target rather than the draft's original index-only representation.
- Propagate the successor disposition through the cumulative 012-015 catalog
  checks. Extend their exact function and privilege expectations for the new
  six functions: one each in IAM, Project and Builder, and three in Registry.
  Keep function ownership, SECURITY DEFINER settings, narrow schema USAGE,
  Project REFERENCES and denial of direct runtime table access explicit.
- Add a 026 catalog branch to ledger verification, including startup when the
  successor was already applied. Update only affected migration fixtures.

The deciding integration proof must run the actual migration loader, migrate a
fresh database and a current 001..023 database, then rerun the loader without
manual schema changes. A removed required permission must be detected by both
catalog inspection and a real runtime call. Preserve Brain behavior. Storage
proof scripts that load SQL manually cannot satisfy this integration claim.

### Authorized retention result

On 2026-09-12 Luna executed the bounded SQL experiment and root inspected the
script, corrected its result accounting and strengthened exact-byte checks,
then reran it. The final root run exited 0 with 15 explicit assertions true.
It applied the actual current 001..023 migration runner and the isolated
Registry candidate on PostgreSQL 17.10. It did not run held migrations 024/025.

The unchanged draft plus its missing schema grant failed on the authorized
path with `42702: column reference "project_id" is ambiguous`. The output
parameter conflicts with the unqualified `ON CONFLICT` column target.
The isolated candidate attaches the existing Project/kind unique index as a
same-named constraint and names it in `ON CONFLICT ON CONSTRAINT`. It also
names `artifact_revision_artifact_id_source_revision_key` for the analogous
revision conflict target. The only permission change is USAGE on schema
`builder` for `registry_owner`. No admission function was replaced, no direct
runtime table grant was added and the source draft remained unchanged at
SHA-256 `964b96603ce08a2239796f2ba0e70769b5a2971995c7b8a6764f704dcd8cf563`.

The client logged in as `hub_rb_executor`, retained two synthetic app files,
retrieved their metadata and exact bytes, disconnected, reconnected and read
both files again. An identical repeat returned the same revision and digest.
A conflicting repeat raised `APPLICATION_IDENTITY_CONFLICT`; the original
HTML remained unchanged and an admin-only inspection found one revision.
An unauthorized account and a revoked account were refused by both metadata
and file readers. Direct runtime table access failed with SQLSTATE 42501.

This proves the corrected candidate's SQL path for a 90-byte HTML file and
41-byte JavaScript file. Fixture setup directly inserted synthetic account,
Project and pre-verified Builder records; it does not prove those upstream
workflows. No Builder generation, compiler invocation, TypeScript adapter,
Hub restart, database restart, browser serving, near-limit performance,
concurrent retention or Brain coexistence was exercised. The database used
tmpfs, so reconnect must not be described as durable host-restart proof.
Initial prepared-statement and readiness failures were probe defects; the
fourth attempt's summary also miscounted expected refusals. They remain in
separate logs and are not Product failure claims or deciding successes.

Scripts and all attempts remain in `/tmp/conexus-registry-retention-yzYip0`.
The deciding local log is `root-rerun.log`; `run-3.log` preserves the original
authorized SQL failure. Container `conexus-registry-retention-80795` and its
synthetic tmpfs data were removed, with absence checked. No company data,
provider execution or Product source was changed. Integrate the two SQL
corrections with successor catalog/ledger checks before treating this as a
usable Registry implementation. The complete Create-and-open proof remains open.

### Registry dependency probe

On 2026-09-12 the next planning check ran against a disposable PostgreSQL 17.10
container using the CI image digest. The actual current migration runner applied
001..023 successfully. The unmodified draft migration 026 then loaded and exposed
`reg.retain_application`, `reg.get_application` and `reg.read_application_file`
without running held MAR migrations 024/025. This establishes DDL compatibility,
not execution of every lazy PL/pgSQL branch or valid migration-runner integration.

A call to `reg.retain_application` as `hub_rb_executor`, with a nonexistent
synthetic account/project, failed with `42501: permission denied for schema
builder`, rather than the expected `APPLICATION_SUBJECT_REFUSED`. The draft
grants `registry_owner` execution on the Builder admission function but omits
USAGE on its schema. Catalog inspection confirmed EXECUTE=true and USAGE=false.
A transaction-only USAGE grant reached the expected business refusal. ROLLBACK
restored the original permission. No production/draft source was patched.

Tracked Registry defect: schema visibility prevents the intended runtime call.
Resolve it in the candidate migration with a narrow grant and catalog coverage;
do not solve it by granting direct table access or using a privileged runtime.
Success-path retention, reconnect, concurrency and Brain coexistence remain
unproved. Databases that already physically applied held 024/025 were not part
of this probe; do not imply upgrade compatibility or change such a database
without a separate ledger check. The current migration runner correctly refused the manually altered
schema with `MIGRATION_011_CATALOG_REFUSED`; successor catalog/ledger integration
remains required. Do not disable that check or activate historical MAR migrations.

The local reproducible scripts, raw failure, permission control and decision
trail are in `/tmp/conexus-registry-dependency-GFWOrK`. They require the disposable
probe database and are not a new default verification suite. The draft SQL hash
was `964b96603ce08a2239796f2ba0e70769b5a2971995c7b8a6764f704dcd8cf563`.
No model, E2B, Sankhya or company-data call occurred. This result narrows the
integration work; it does not approve the storage design or deliver Preview.

The Luna source trace found no MAR dependency in the draft and confirmed that
the old runner patch does not select 026 in the current `currentMigrationNames`
path. Its old positional digest checks also need replacement with the current
name-keyed mechanism. The candidate must extend selected names, digest lookup,
successor catalog checks and ledger verification together, leaving held names
untouched. Original checksums remain unchanged; no repinning or skipped catalog
verification is a proposed fix. Luna also checked the local probe trail and
confirmed the stated limits. This is collaborative inspection, not structural
acceptance review.

The probe container and its disposable volume were removed after verification.
Only synthetic local test state was discarded; the scripts and logs remain in
the temporary directory above. Documentation links, current-state checks,
five preflight tests and `git diff --check` passed. The full Product verification
graph was not rerun for this planning probe. No commit or push was made.

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

These failures describe snapshot `21f042f`, not the current default graph. The
[cleanup result](repository-consolidation.md#execution-results--2026-09-12)
records their separation from current verification and the later successful run.
Do not reopen that cleanup or repeat these historical checks as MVP admission.

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

#### Fixed app starter implementation

Use the existing `REACT_VITE_V1` compiler profile. After exact Git checkout and
before the Mastra Workspace starts, materialize `app/index.html`,
`app/src/main.tsx` and `app/src/style.css` only when the source has no `app`
entry. An existing app is left byte-for-byte unchanged, including a valid app
that uses a different source filename. Compilation, not a three-filename census,
decides whether that existing app is executable. Preserve the NEW seed and
platform/generated files. Never install dependencies or publish a new image.

The starter has a React root, an external stylesheet and an empty application
view, not invented business data. Builder instructions state the fixed stack,
ordinary editable app files and separate compilation step. The worker must not
claim that unavailable React/Vite dependencies were tested inside its coding
image. The existing compiler owns the actual build.

Implementation is confined to `builder/runtime.ts`, a small starter-data/helper
module if needed for executable verification, and focused Builder tests.
Prove first materialization, exact preservation on a later request and refusal
of unsafe filesystem entries through the same helper/runtime path. Then use the
real compiler and generated-app journey. Local filesystem proof does not claim
Mastra/E2B integration. Second-edit ownership and parent admission remain the
separate continuation binding; no source-ownership rule changes in this unit.

Root verified the delivered helper on 2026-09-12. All three local filesystem
tests passed. The same helper's three files also passed the production E2B
compiler and normal Chromium execution, producing three output files and an
empty React root with zero body margin. This proves starter compilation and
execution, not model-generated source, Git admission or the real Build UI.
No dependency installation, replacement provider image or source-ownership
exception was needed.

Code grounding on 2026-09-12 narrowed the implementation points:

- Add the fixed profile after checkout in `builder/runtime.ts`, before creating
  the Mastra Workspace. Preserve the historical three-file NEW seed in
  `git-execution.ts`; add missing profile files exclusively, never overwrite app
  files on a later request.
- `builder/source.ts` checks original ownership against the immutable Baseline,
  not the immediate candidate parent. Root's later reread corrected the earlier
  claim that every second edit needs a new APP-OWNED map entry. The unchanged
  real OCI custody test passed creation and correction of `new-app-file.txt`
  without such an entry, while protected and unowned Baseline-file mutations
  were refused. Preserve that ownership anchor when adding a human work parent.
  Do not add a broad `app/` permission exception. This proves same-Change edits,
  not the still-missing second-human-request ref/ancestry binding.
- `builder/service.ts` dispatch stops at coding/verification/correction; it does
  not call compilation. Return the settled verification outcome explicitly and
  compile only VERIFIED candidates. Resolve the authorized account from durable
  change identity; the current claimed-change shape lacks the compiler's
  required account. Do not derive authorization from model output.
- `builder/preview.ts` still reports `ready: false`. Only successful retention
  may expose a ready artifact through MAR and the existing Build view. The
  compiler entry point alone does not deliver this result.

These are proposed integration changes, not implemented or admitted Product
behavior. Include them in the existing create-and-open slice; no separate
framework or historical stage is required.

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

#### Local browser feasibility result (2026-09-12)

A throwaway HTTPS server and Playwright Chromium 151.0.7922.34 exercised the
proposed form POST, host-only Secure/HttpOnly/SameSite=Lax cookies, redirect to a
clean URL and an interactive counter. Both variants used the same server code:

| Host pair | Embedded counter | Same URL in new tab | Hub cookie received by Preview |
| --- | --- | --- | --- |
| `hub.localhost` / `preview-one.localhost` | Refused; Preview cookie absent after entry | 403 after that entry | No |
| `hub.conexus.test` / `preview-one.conexus.test` | Click changed 0 to 1 | 200; counter clickable | No |

For the working variant, a fresh anonymous browser context received 403 and
reloading after server-side revocation received 403. Choose distinct HTTPS
origins under the same site for the proposed Lax-cookie flow; distinct hosts
alone did not suffice in the tested localhost variant. Do not weaken Hub cookies
to accommodate that variant.

The instrument and complete request observations are local temporary files at
`/tmp/conexus-preview-browser-k2eNmx/probe.cjs` and `result.log`. Chromium resolver
rules mapped hosts to loopback, and the context ignored the temporary self-signed
certificate error. No system DNS, hosts file or certificate trust was changed.
This proves a browser mechanism using stand-ins, not real Hub/I&A/MAR serving,
operator certificate setup, CSP, grant replay/expiry, multi-user isolation,
asset-read latency or second Builder request continuity. Establish the actual
local HTTPS binding before calling the integrated browser journey usable.

#### Proposed integrated contract

Trusted-certificate follow-up completed on 2026-09-12. The operator reported
installing the CA in WSL and Windows CurrentUser Root. The Windows SHA-1
thumbprint `4DB995DB63A19781E56A5F3C40C78B2A8225990E` matches the generated CA;
OpenSSL now verifies the server certificate and Hub hostname using default
system trust, without an explicit CA argument.

The initial strict Chromium run failed with `ERR_CERT_AUTHORITY_INVALID`.
Chromium's Linux NSS database was empty. Following the official
[Linux certificate instructions](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/linux/cert_management.md),
imported only the public root with SSL CA trust `C,,` under nickname
`conexus-local-dev-5c9755d1` in the user's existing
`/home/leandrotheodoro/.local/share/pki/nssdb`. The Ubuntu package
`libnss3-tools` version `2:3.120-1ubuntu2.1` was downloaded with apt and extracted
under `/tmp/conexus-nss-tools-NEtvTA`; no root package installation was needed.
To undo this added NSS trust, use certutil on that database with
`-D -n conexus-local-dev-5c9755d1`; do not reset the shared database.

The same browser instrument then passed with normal certificate verification,
no custom DNS resolver, and no certificate-error bypass. In Chromium
151.0.7922.34 the embedded counter changed to 1, the new tab returned 200,
anonymous and revoked requests returned 403, and no Preview request carried
the Hub cookie. Script `trusted-localhost.cjs`, initial `trusted-result.log`,
and passing `trusted-nss-result.log` are preserved in
`/tmp/conexus-preview-browser-k2eNmx`. This closes the WSL browser TLS mechanism,
not the integrated Hub/Keycloak/Builder journey or an actual Windows-browser
navigation. The prototype server stopped after the proof.

The operator subsequently authorized local CA installation in Windows/WSL.
Prepared mkcert v1.4.4 from the official GitHub release, with downloaded binary
SHA-256 `6d31c65b03972c6dc4a14ab429f2928300518b26503f58723e532d1b0a3bbb52`.
This is a recorded download digest, not an independently signed verification.
Files live outside Git in `/home/leandrotheodoro/.local/share/conexus-local-tls`,
whose directory mode is 0700. `ca/rootCA.pem` is the public root certificate;
`ca/rootCA-key.pem` must never be copied into the repository or shared.
`server.pem` and `server-key.pem` cover `*.conexus.localhost` and
`conexus.localhost`. OpenSSL verified the chain and `hub.conexus.localhost`
hostname with the explicit CA. This does not prove browser or OS trust.

Root certificate SHA-256 fingerprint:
`5C:97:55:D1:81:FF:5E:09:8B:24:C1:BD:CE:27:73:5A:23:FB:E7:D7:0E:B7:7B:58:06:AD:BC:34:E8:89:27:7E`.
Installation is pending: `sudo -n true` requires interactive authentication,
and `/etc/wsl.conf` explicitly disables Windows interoperability. No trust store
was changed, no certificate-validation bypass was configured, and no password
was requested. The operator must install the public CA in the intended trust
stores before the normal-browser proof. System trust alone is not a claim that
every Linux Chromium/NSS profile trusts it.

Local follow-up on 2026-09-12 removed the custom Chromium resolver rules and
compared `hub.localhost` / `preview-one.localhost` with
`hub.conexus.localhost` / `preview-one.conexus.localhost`. The first still
refused entry. The nested names resolved without DNS or hosts-file edits;
the embedded counter changed from 0 to 1, the new tab returned 200, anonymous
and revoked requests returned 403, and no Preview request carried the Hub
cookie. Chromium version was unchanged. The isolated script and observations
are `/tmp/conexus-preview-browser-k2eNmx/nested-localhost.cjs` and
`nested-result.log`; the original experiment remains untouched.

Select the nested `conexus.localhost` profile for the local pilot. The operator
approved deferring `conexus.fun`, tunnels and hosting until after the local
create-and-change journey. This removes local DNS setup from the tested Chromium
path, not certificate setup. The probe still ignored HTTPS certificate errors.
Normal-browser certificate trust, Windows browser behavior, Keycloak callbacks
and the integrated journey remain unproven. Do not present this result as a
trusted HTTPS installation or change the system trust store implicitly.

Use distinct configured Hub and route-specific Preview HTTPS hosts under the
same site, following the local browser result above. Keep the
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
The stand-in proves the same-site cookie mechanism, not the integrated hosts;
opening a top-level window alone does not prove embedded access. Exercise the
configured deployment in Chromium. Do not solve blocked embedding by sharing Hub cookies, exposing a
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

This section preserves the completed adapter work and its original execution
sequence. Read the observations below for its proof limits. It is not a request
to implement or run the compiler again.

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

Before accepting the structural change, use the current risk-triggered review
method and Luna-only delegation. Freeze the material diff and exact proof for
that review. Do not restore historical Fable/Gemini routing or run another arena
merely because this retained draft is being resumed.

### Retention checkpoint and migration blocker

This checkpoint records the draft's earlier stop. Its migration-runner diagnosis
predates the isolation work below. Use the current Create and open work packet
to reconcile the retained draft; do not reapply the old runner patch.

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

This section records the earlier selection change and its rationale. Its
execution instructions are historical; the observations below and the cleanup
result describe the later checks. Registry integration itself remains unproved.

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

This is the original experiment proposal. The observed compiler result below
records its execution. Repeat it only for a new concrete falsifier, not because
this historical heading says "First".

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

Follow the [delivery checkpoints](#delivery-checkpoints) and current work packet.
The fixed compiler and its isolated experiment already exist; do not repeat
them as an unstarted implementation step. Connect the real first request,
retention, authorized serving and Build UI before demonstrating that checkpoint.
Then demonstrate explicit continuation and recovery, with negative checks for
each changed boundary. No new verification framework is required.

On a usable first app, detail manual Brain authoring/context and the exact
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

## Autonomous pilot checkpoint, 2026-09-13

The approved pilot implementation now carries an explicit working source across
Changes, keeps the last retained Preview independent from a failed preparation,
allows response-only Builder turns, and removes the mandatory reviewer from the
technical Preview path. The affected Hub and Web typechecks pass. Forty-four
focused implementation tests pass, including retained Preview reopening and a
second Change sourced from an exact prior Change ref.

The real browser handoff is still open. The disposable PostgreSQL database
accepted migration 027 manually because its historical migration catalog fails
the older 002 catalog assertion. The local Keycloak container stopped answering
the OIDC discovery request, so the Hub could not reach its HTTPS listeners.
No browser URL is claimed until login, creation, Preview interaction and
continuation pass against the live composition. The historical catalog and
credentials were not deleted or rewritten.
