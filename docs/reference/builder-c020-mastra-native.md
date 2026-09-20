# C-020 - Mastra-native Builder coding harness

> **Status:** CURRENT / OPERATOR RATIFIED. Delivery amendment approved 2026-09-16; interactive functional delta approved 2026-09-17.
> **Scope:** ordinary internal Builder for the Metal Nobre MVP.
> **Program:** `docs/tasks/builder-repair-program.md`.
> **Status and grant:** `docs/roadmap.md`.
> **Decision:** C-020 in `docs/decisions/index.md`.

This is technical authority, not a claim that every target behavior is implemented.
The roadmap and current task distinguish implementation, proof, and acceptance.
Conflicting Change-centric wording in older references and locked evidence is
historical. Preserve its human job and layout without reviving its old machinery.

C-021 amended two of this document's premises on 2026-09-20. One Thread per Project,
and a conversation subordinate to a run, are no longer the destination. The rule that
there is no second conversation store was not amended and still holds: more
conversations is a product requirement, not a reason to own their messages. They remain an accurate description of what the code does
today, and this file marks each place where the two now differ. Nothing else in C-020
is reopened: authorization, source custody, execution settlement and artifact identity
stand. The replacement is not chosen here; it is the subject of
[the Sessions and Work qualification](../tasks/sessions-work-qualification.md).

## 1. Product job

The operator opens a Project, converses with a coding agent over its current source,
sees real activity, and uses an automatically compiled last-good Preview.
The next request continues the same conversation and exact working source.
The operator does not administer Change, Plan records, WorkUnit, ActorRun,
CodingSession, hashes, or manual Preview preparation.

Early operator UX tests are part of delivery. Final pilot acceptance still proves
second edit, read-only response, failure/repair, and restart continuity before expansion.
The program owns the order; a complete performance baseline is not a universal prerequisite.

## 2. PSTACK / Poteto laws

Use native Mastra mechanisms before custom code. Preserve essential Product
invariants and delete compatibility with no real consumer. Use exact source and
claim-matched proof. A green fixture is not a real composed Product journey.
The development method and skills own the reasoning process, not Product authority.

## 3. Final domain model

Conexus owns Account/Workspace/Project authorization, BuilderRun,
ProjectWorkingState, Git custody, compiler/artifact identity, and last-good Preview.
Mastra owns the coding agent, shared AgentController, native Session registry,
Thread/messages, Workspace tools, and live display mechanics.

Each Project has a persistent Thread. Each BuilderRun has a fresh scoped Session
and Workspace/E2B. There is no second Conexus conversation store or persistent Turn.

That is the realization in force and it keeps running until something replaces it.
It is no longer the destination: C-021 approved several persistent conversations per
Project, so the single Thread and the run-scoped Session are one answer to a question
that is now open. The rest of the sentence above still binds. There is no second
conversation store, and getting to several conversations by building one is refused
rather than qualified. Do not remove authorization, effect idempotency, source custody
or Preview protection from `BuilderRun` before the qualification says what replaces it.

| Fact | Authority |
| --- | --- |
| Conversation | Mastra Thread/messages |
| Execution transaction | Conexus BuilderRun |
| Current code | ProjectWorkingState.working_source_revision |
| Usable compiled artifact | ProjectWorkingState last-good Preview coordinates and Registry |
| Diagnostic trace | Native Mastra observability; never execution/source/Preview authority |

## 4. Exact Mastra baseline and accepted use

The pins in `package.json` and its lockfile are the answer. On 2026-09-20 they were
core and server 1.67.0, client-js 1.46.0, e2b adapter 0.12.0, fastify 1.5.11, memory
1.30.0, libsql 1.23.0, observability 1.17.8, react 1.5.0, playground-ui 55.0.0 and the
`e2b` SDK 2.46.1. Consult the installed package and the Mastra skill before remote docs,
and never quote this paragraph in place of reading them.

The qualification that produced those statements ran against core 1.63.2 with the
e2b adapter 0.11.0, memory 1.28.1 and libsql 1.22.2. It supported Project isolation,
persistent deterministic Threads, per-run Workspace binding, native tool restrictions,
and conversation persistence across Controller recreation. The packages moved to 1.67.0
during the native-streaming work and the qualification was not re-run against them, so
those five properties are carried forward on the earlier evidence. What the newer
packages did prove is narrower and specific: the Agent Controller session routes, the
session scope a run uses, and the browser rendering native message parts, each proven
live on the pilot. Stored user input has `role=signal`,
`type=user`, and a stable message ID. User message_start is not the live display source.

### 4.1 Lifetime

The Hub owns one coding agent and one shared initialized AgentController.
The native registry lookup uses Project/resource and `scope=builder:<BuilderRunId>`.
The Session binds the Project's persistent Thread and a fresh run Workspace.
Release it through `AgentController.deleteSession({ resourceId, scope })` and destroy
the run sandbox. Keep the shared Controller and persisted Thread/messages alive.
Do not replace the registry with a Conexus map or use a no-storage alternative.

### 4.2 Conversation projection

Project `signal/user` as user, assistant as assistant, and only intentionally
displayable system text as system. Do not expose internal task/signal rows.
Return chronological messages. Do not restore recentTurns or custom summaries as
conversation authority. A UI projection is not another persistent message lifecycle.

### 4.3 Native tasks

Native task signals do not imply a required task UI. Add task UX only for a real
approved interaction. Advanced memory, workflow, and subagent UX remain outside
ordinary Builder acceptance.

### 4.4 Native observability

Trace the real Builder execution through the shared native Controller.
Reuse native exporters/storage and server-derived Project/run correlation.
Do not put credentials, Workspace objects, or correlation IDs in the model prompt.
Trace access is technical diagnosis, not permission to run another coding path.
A broad Mastra API or a Studio mutation endpoint must not bypass Conexus admission.
Exporter problems never grant Product authority or change settlement truth.
Token usage absent from the provider is unknown. Model-call time is not pure
internal reasoning time. The current task owns the exact integration and proof.

## 5. Mastra owns mechanics

Mastra supplies Session, Workspace filesystem/search/edit/command mechanics,
mode/tool exposure, assistant/tool events, and observability mechanics.
It does not own Project authorization, current source, result admission,
BuilderRun idempotency/durability, artifact identity, last-good Preview, or
Brain/Data/Capability permissions. Browser input cannot choose internal runtime,
Thread, sandbox, or Workspace identity. The browser may select an authorized
public model choice; Conexus resolves and admits the actual model as defined below.

## 6. BuilderRun

BuilderRun is the only durable ordinary execution transaction. It retains
Project/account, idempotency/request digests, mode, base source/version, state,
result kind/source, message/sandbox binding, admitted model coordinates,
failure code, and timestamps. No subordinate Plan/WorkUnit/ActorRun hierarchy exists.

States are QUEUED, RUNNING, SUCCEEDED, FAILED, and INTERRUPTED.
Result kinds are null, RESPONSE_ONLY, SOURCE_CHANGED, and SOURCE_CHANGED_BUILD_FAILED.
The same key and semantic request returns the same run; changed input conflicts.
The MVP admits at most one active BuilderRun per Project, including read-only runs.
Claim revalidates current authorization and exact source/version.
PLAN settles only as RESPONSE_ONLY. Failure and restart never become false success.
Accepted-request recovery beyond currently proven behavior requires its named proof.

## 7. ProjectWorkingState

ProjectWorkingState owns working_source_revision, working_version, last-good
source/artifact revision/digest, and relevant state/timestamps.
Successful compilation of B advances last-good Preview to B.
Failure after source admission keeps working B and the previous good Preview.
The next edit starts from working source, including source that failed compilation.
Legacy Change coordinates are not required to represent any of these facts.

## 8. Source and Git custody

Mastra edits the Workspace. Conexus admits authoritative source.

### 8.1 Immutable source identity

Retain `refs/conexus/sources/<sourceRevision>` pointing to that exact commit.
To prepare S, use that exact ref if present; otherwise use main only if main
resolves exactly to S. Otherwise refuse. Ordinary edits do not move main.

### 8.2 Result admission

For A to B, prove A is admitted and inspect the imported bundle in isolation.
Verify claimed B, exactly one new commit, parent A, allowed changed paths,
regular entries, ancestry, and bounded payload/patch. Retain immutable B before
PostgreSQL CAS advances working A/versionN to B/versionN+1.
A stale immutable object may remain stored; failed CAS must not make it current.

### 8.3 Current app mutation boundary

The fixed REACT_VITE_V1 MVP admits edits only under `app/**`, including files
created by earlier BuilderRuns. Original manifest membership is not required
for those app-owned files. Refuse platform/generated/protected paths, unsafe
entries, symlinks, submodules, invalid ancestry, multi-commit results, and size overflow.
No package installation, new remote credentials, or network authority is granted.

### 8.4 Source inspection authority

Only authorized exact Project revisions are readable: working source, last-good
Preview source, and base/result of an explicitly selected, retained and currently authorized code-changing BuilderRun.
A reachable Git OID alone never grants disclosure. Code/Diff remain read-only.
Consumers may change their physical batching only through an approved task while
preserving these permissions, bounded content, and immutable revision identity.

## 9. BUILD and PLAN

These modes restrict tools on the same Project Thread, not a mandatory planning
method or a plan/approval/build workflow. Do not create a builder.plan owner.

BUILD exposes read/list/search/grep/stat, write/edit/create/delete, and command
execution. Materialize the fixed app starter only in BUILD when needed.
PLAN exposes read/list/search/grep/stat only. It performs no mutation command,
starter materialization, source commit, or compiler invocation.
Its only successful settlement is RESPONSE_ONLY.
The approved interactive UI presents Edit and Read-only without removing these
restrictions or introducing a planning workflow.

## 10. Coding runtime

Server-derived runtime input identifies Project, execution, mode, exact base
source, source bundle, and bounded callbacks/signals. The prompt is the user's
content plus stable coding instructions, not Change/WorkUnit/ActorRun/admission IDs.
Instructions restrict work to the Session Workspace and fixed app stack.
The model cannot select credentials, runtime configuration, or Product authority.

After editing, host-controlled git add/diff determines whether source changed.
No diff returns RESPONSE_ONLY. A diff produces one host-controlled result commit
and bundle for Conexus admission. Assistant text is not source authority.
Keep the physical sandbox bound for the run; do not silently resume in a replacement.

## 11. Streaming and reconnect

History is persistent Thread/messages and the live turn is the native Session
event stream. Both reach the browser over Mastra's own Agent Controller session
routes, mounted under /api/mastra behind Conexus authorization. Conexus defines
no live projection of its own: no replay, sequence cursors, observation store, or
second tool/text lifecycle.

Reconnect reads the native thread messages, current BuilderRun, working source,
and last-good Preview, then resubscribes to the currently available Session.
Missed live events do not become lost durable state.

## 12. Product API

The ordinary API is Project-scoped:

```text
GET  /api/control/projects/:projectId/builder-session
POST /api/control/projects/:projectId/builder-session/messages
POST /api/control/projects/:projectId/builder-session/preview
```

GET projects the Project's Mastra thread id, latest run/code-changing run, mode,
and working/last-good coordinates. It does not expose Controller, Session, or
sandbox identities.
Public model choice IDs/labels and the admitted model label may be projected.
POST message accepts content, BUILD/PLAN, an authorized connection choice,
a server-issued model choice, and Idempotency-Key. Account, Project authority,
Thread, source/version and resolved model admission remain server-derived.

The interactive delta adds bounded Project-scoped model-choice, run history/detail,
and cancellation operations through the same Builder API. No public Mastra
execution or unrestricted trace endpoint is implied. The current task owns exact
wire realization and generated-contract reconciliation.

Preview launch is bodyless and server-resolved from the authorized Project's
last-good artifact. The browser does not select it by echoing execution/source/artifact
coordinates. Legacy internal MAR fields may remain until their consumer census
supports a bounded change. Renaming them alone is not a delivery prerequisite.

## 13. Compiler / Registry / Preview

Compiler subject is Project, execution correlation, exact source revision, and
bounded source files. Registry identity is Project, source, and immutable artifact.
No PreviewPreparationCoordinator or independent AI verifier is required for
ordinary internal Preview. Compile admitted B, retain its artifact, then update
last-good coordinates. On failure keep B as working source and the prior Preview.

### 13.1 P-01 Preview UX

The app is the dominant/default area and Conexus is contextual on the right.
Opening Build automatically establishes authorized Preview access when available.
Technical coordinates are secondary details, not an Abrir Preview prerequisite.
A Nova aba action and explicit retry/reopen may remain.

Compiled artifact, issued entry grant, and interactive application are different
facts. A grant response or iframe load alone is not proof that application code works.
Project only the readiness state actually observed. Bound automatic attempts and
preserve last-good Preview while new work or a failed launch is handled.

### 13.2 Diff UX

Primary Diff compares base to result of the latest code-changing BuilderRun,
not working source to last-good Preview, which are equal after a successful build.
A response-only request has no new code change. Do not create an editable second IDE.

## 14. Project creation

Create Project with deterministic canonical source, initialize working state,
and open the ready composer. Manual Inception/Baseline approval is not a prerequisite.
Unused Project planning/cognition must not be required to initialize the ordinary
Builder. Preserve those capabilities when explicitly configured; the task owns
the bounded composition change and its backward-configuration proof.

## 15. Brain boundary

Brain is outside core Builder acceptance. Do not pre-query it or inject retrieved
business text on every message. The later narrow interaction is agent-initiated
through authorized tools such as searchBrain and readBrainItem.
Conexus resolves bindings, revision, provenance, and credentials server-side.
No MCP/RAG/vector infrastructure without a proven gap in direct authorized tools.

## 16. Legacy disposition

Change, Plan records, WorkUnit, ActorRun, CodingSession, recentTurns, durable
Change feeds, PreviewPreparation, and Change-centric build coordinates do not
belong to ordinary Builder execution. Published migration 038 already excised
several legacy tables; that is not permission to rewrite it or repeat deletion blindly.

For remaining legacy, first confirm consumers, migrate legitimate callers, prove
no ordinary writes depend on the old mechanism, and remove only unneeded code.
Historical receipts and locked evidence remain unchanged.
Older P-01 mechanism text does not override the current source/artifact model.

## 17. Migration discipline

Published migrations are immutable. The current migration list lives in
`scripts/run-hub-migrations.mjs`; do not infer the latest migration from this prose.
Further schema change uses forward migrations with its own
authority and proof. Do not rewrite old digests or restore removed schemas.

## 18. Verification strategy

Final core acceptance proves real A-to-B-to-C source continuity with main unchanged,
second-run app edits, stale-result refusal, exact source-read admission, preserved
Thread after Session deletion, correct signal/user projection, PLAN with zero
source/compile mutation, authorized automatic Preview, correct Diff basis, and
absence of ordinary Change writes.

These are accumulated final-acceptance claims, not a prohibition on earlier
operator UX testing. Each current task selects the necessary nominal and negative
proof for its own result. Safety controls are never deferred merely for speed.
Mocked browser tests prove their named UI contracts, not real provider/Preview behavior.
Reuse existing live/model/compiler/browser tools. Do not recreate historical gate chains.
Final acceptance includes the actual Hub/Web/PostgreSQL/Mastra/model/E2B/Git/
compiler/Registry/Preview journey and its declared failure-continuity cases.

## 19. Slice governance

The program owns sequence, the current task owns execution detail, and the roadmap
owns grant. Codex implements that task, verifies, commits, pushes, and stops.
The assigned reviewer compares the actual candidate and deciding proof to current
owners. Operator approval of the next increment is not permission to skip review
or silently change architecture during implementation.

## 20. Non-goals

No persistent Conexus Turn, ordinary Change hierarchy, generic workflow/task engine,
multi-session chooser, broad Mastra browser API, stack selector, movement of main
on every edit, destructive legacy-schema rewrite, business expansion before core
acceptance, or mandatory AI review before internal Preview.
Coding and compiler isolation was a non-goal to preserve until a separate decision
changed it. Section 23 records the decision that changed it and what replaced the
separation.

## 21. Reopen triggers

Reopen the smallest owner on actual Project-isolation failure, lost Thread
continuity, unsafe PLAN behavior, uncorrelatable persisted input, broken execution
idempotency/concurrency/restart truth, invalid source custody, or a real business
capability that cannot fit the boundary. A changed approved Product requirement
may also reopen its owning section. Code volume and historical names alone do not.


## 22. Approved interactive delivery delta

[Frontend section 33.6](frontend-and-product-surfaces.md#336-build-surface) owns
the operator-approved functional HTML identity and interactions. Appearance is
not a gate; observable functionality is. The current task supplies implementation
order and deciding proof. This section states target meaning, not proof of delivery.

### 22.1 Connection and model identity

An admitted run keeps its logical connection and resolved model coordinates.
Changing the next-message selection does not mutate the active run or shared
agent. Native dynamic model resolution uses the run's server-admitted subject.
The semantic idempotency request includes connection and model selection.

Credential admission generation is historical identity, not a command to use
an expired token. Renewal can advance secret storage for the same connection.
A revoked connection denies new credential acquisitions; already-acquired calls
may finish. No client receives secret coordinates or bytes. The single-Hub pilot
coordinates refresh by connection in its existing credential module.

### 22.2 Activity and diagnosis

Native message parts and tool-call identities can be safely projected without
reconstructing a second lifecycle. BuilderRun may retain a bounded execution phase
for Product work outside Mastra. It is not a separate run hierarchy.

A run-detail read exposes only authorized, redacted native trace facts and Product
result/timestamps for that run. Missing metrics remain unknown. A trace failure
never changes settlement. Safe compiler feedback belongs to the run's source and
may be written once as a displayable native Thread result for a later correction.
Do not create another message authority or persist unbounded compiler logs.

### 22.3 Cancellation

Cancellation is an authenticated, idempotent command on an existing BuilderRun.
It records intent before signaling the execution. Existing database arbitration
settles the race with success/source promotion. A terminal run is not rewritten.
Accepted pending cancellation prevents later success or Preview promotion.
Keep already-admitted source and prior last-good Preview. The terminal result
is INTERRUPTED with the appropriate reason. Browser disconnect is observation
detachment, not cancellation. No automatic retry or new run is implied.

## 23. Realized run pipeline

Facts about the code on trunk, kept here because the plan that produced them was never
committed and because section 20 named the separation this replaced. Nothing here is a
ratified architecture: it is the shape the delivered work left, and the qualification
may change it.

A BUILD run crosses three out-of-process boundaries. It used to cross six.

| Boundary | When | What it does |
| --- | --- | --- |
| OCI git container | before the agent | exports the current source as a bundle |
| E2B sandbox | the run | materializes the bundle, runs the agent, compiles, smokes the artifact |
| OCI git container | after the agent | admits the result bundle into the canonical repository |

Three changes produced that. The source bundle is exported while the sandbox is
created, because neither depends on the other. One E2B template carries both roles, the
agent's git and Node and the compiler's pre-baked `node_modules` and vite config, whose
recipe now lives in `apps/hub/compiler-template` after being read back out of the image
it only existed inside. The agent's own sandbox compiles what it wrote, which removed
the second sandbox and the two git container starts that had read the source back out
to feed it.

Two properties hold that together. The working tree is checked clean after the agent's
commit and before anything touches it, so the artifact equals the revision that gets
admitted. The compile input keeps every limit it had, now read from `git ls-tree` inside
the sandbox, and it accepts only the blob modes source admission accepts, so a symlink
or a submodule refuses here instead of compiling into an artifact the admission that
follows would reject.

After the build the sandbox serves the artifact's own bytes over loopback and drives the
headless Chromium the template carries. The verdict is that the root has a child within
a bounded time and that nothing threw, both read through the browser's own
instrumentation. Nothing is injected into the page: Conexus serves those bytes later
with a sha256 check per request, so a serve-time beacon would defeat that invariant, and
a beacon inside `app/**` would be the agent's own code.

A build or a boot failure is an outcome the run carries, not an exception. The source is
still admitted and advanced, the run settles `SOURCE_CHANGED_BUILD_FAILED`, and the last
good Preview stays. That was briefly lost when the compile moved ahead of admission and
is restored deliberately: an operator keeps the agent's work and is told it did not
build.

The git container stays. It is the boundary that keeps a crafted result bundle away from
git's parser with the repository writable, and merging the remaining two into one would
require holding a container open across the agent's turn with the repository mounted for
writing. That trade has not been made.
