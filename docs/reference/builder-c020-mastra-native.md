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

| Fact | Authority |
| --- | --- |
| Conversation | Mastra Thread/messages |
| Execution transaction | Conexus BuilderRun |
| Current code | ProjectWorkingState.working_source_revision |
| Usable compiled artifact | ProjectWorkingState last-good Preview coordinates and Registry |
| Diagnostic trace | Native Mastra observability; never execution/source/Preview authority |

## 4. Exact Mastra baseline and accepted use

Adopted Builder pins are core 1.63.2, e2b adapter 0.11.0, memory 1.28.1,
and libsql 1.22.2. Consult the installed package and Mastra skill before remote docs.
The native qualification supports Project isolation, persistent deterministic
Threads, per-run Workspace binding, native tool restrictions, and conversation
persistence across Controller recreation. Stored user input has `role=signal`,
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

History is persistent Thread/messages. Live view is native Session.displayState.
Subscribe to display_state_changed, then send one current safe snapshot and
replace the live view on each native update. Do not add replay, sequence cursors,
an observation store, or a second tool/text lifecycle.

The authenticated Project/run projection hides raw tool arguments/results,
shell output, credentials, provider metadata, and unsafe paths.
Reconnect reads persisted messages, current BuilderRun, working source, and
last-good Preview, then attaches only to the currently available Session.
Missed live events do not become lost durable state.

## 12. Product API

The ordinary API is Project-scoped:

```text
GET  /api/control/projects/:projectId/builder-session
POST /api/control/projects/:projectId/builder-session/messages
POST /api/control/projects/:projectId/builder-session/preview
GET  /api/control/projects/:projectId/builder-session/runs/:builderRunId/stream
```

GET projects messages, latest run/code-changing run, mode, and working/last-good
coordinates. It does not expose Thread, Controller, Session, or sandbox identities.
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
Keep coding and compiler isolation unless a separately approved decision changes it.

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
