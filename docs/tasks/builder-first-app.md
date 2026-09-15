# Builder Foundation Rebaseline — execution plan

> **Status:** CURRENT FOUNDATION REBASELINE PLAN / OPERATOR RATIFIED DIRECTION / REVIEW-GATED
> **Product goal:** prove the smallest clean native coding engine before redesigning the frontend or adding business capabilities.
> **Status / grant owner:** `docs/roadmap.md`
> **Current Builder reference:** `docs/reference/builder-c020-mastra-native.md` — core ownership intent remains useful; realization details named in this plan are reopened until 7R-0 reconciles them.
> **Engineering method:** `docs/development/engineering-method.md`
> **Mastra lookup law:** `.agents/skills/mastra/SKILL.md`

This plan supersedes the previous assumption that Slice 7 only needed one composed journey before Brain work.

Live Product use proved that the Builder can function, but it also produced material evidence that the current realization contains avoidable parallel machinery and expensive runtime boundaries. We therefore rebaseline the **foundation first**, then rebuild the Product Experience deliberately.

The operator requires one-slice-at-a-time execution:

```text
plan all remaining slices here
→ authorize exactly one slice in roadmap
→ before implementation, restate that slice's protected result + falsifiers
→ implement/probe only that slice
→ fresh focused proof
→ broader proof required by that slice
→ commit + PUSH when tracked work changed
→ STOP
→ GPT reviews remote diff/evidence
→ next slice requires explicit operator authorization
```

No agent may continue automatically into the next slice.

---

# 1. Product outcome

The current objective is **not** "finish every Conexus feature".

The objective is one reliable internal coding product:

```text
create/open Project
→ Project coding conversation is ready
→ send a natural-language request
→ see the coding agent's real text/tool activity while it happens
→ agent works against exact current Project source
→ source-changing result is admitted mechanically
→ app compiles automatically
→ last-good Preview updates automatically
→ use the app
→ send a second request
→ continue the same Project conversation from exact current source
→ ask a no-code question
→ get RESPONSE_ONLY with no source/build mutation
→ reload/restart
→ conversation + working source + last-good Preview remain coherent
→ continue editing
```

The ordinary user must not administer:

```text
Change
Plan entity
WorkUnit
ActorRun
CodingSession
candidate hashes
Git refs
ArtifactRevision ids
Preview preparation
Mastra Controller/Thread/Session ids
E2B ids
```

Technical identities may exist server-side when they own a real invariant. They are not Product workflow.

---

# 2. Current scope and freeze

## 2.1 Current foundation

The only Product/system areas allowed to drive the current basic Builder are:

```text
Identity / authentication
Workspace
Project
Builder
source/Git custody
compiler
Registry / ArtifactRevision
last-good Preview
```

## 2.2 Preserved but frozen

The following code may remain because it has other accepted owners, but it must not expand or become a prerequisite for the basic engine in 7R:

```text
Brain
Connections
Project business bindings
Gateway/Sankhya capability expansion
managed workflows
subagents
generic task UX
advanced observational-memory UX
MCP/RAG/vector-store capability
```

Do not delete a shared subsystem merely because it is outside the current Builder. Do not make it current merely because it already exists.

## 2.3 Frontend freeze

Until 7R-5 passes, the current React surface is **Diagnostic UI**.

Foundation work may change it only to:

- connect to the correct runtime primitive;
- expose evidence required to prove the engine;
- remove a frontend implementation that becomes invalid because the backend contract is intentionally simplified;
- prevent a diagnostic false positive.

Do not spend 7R work on visual polish, component-library migration, responsive design, tool-card aesthetics, sidebar redesign, final composer UX, animation polish or Mitra/Claude/Codex visual imitation.

Those belong to 7U.

---

# 3. Evidence that reopened the realization

The rebaseline is not preference-driven. It follows runtime and source evidence.

## 3.1 Live Slice-7 evidence

The branch reached a real successful path:

```text
natural user request
→ Mastra coding agent
→ dynamic Workspace
→ source A→B
→ SOURCE_CHANGED
→ compiler E2B PASS
→ ArtifactRevision retained
→ Builder settlement
→ PREVIEW_READY
→ interactive Preview
```

Slice-7 also found real bugs hidden by isolated proofs:

- the shared coding Agent was not receiving the Session Workspace correctly;
- the initial settlement boundary crossed the wrong Registry permission/identity surface;
- the first UI/stream implementation exposed provider-ish/log-like behavior rather than a coherent Product timeline;
- Project creation and source inspection showed severe latency unrelated to model intelligence.

The current runtime checkpoint `0834f182d00d3fa803ac9f9590511514256da1ba` is therefore **functional evidence**, not immutable target architecture.

## 3.2 Exact Mastra evidence

The installed stack remains:

```text
@mastra/core    1.63.2
@mastra/e2b     0.11.0
@mastra/memory  1.28.1
@mastra/libsql  1.22.2
```

The exact adopted Mastra line exposes primitives materially overlapping current Conexus custom code:

- `AgentController` as the shared interactive coding-harness owner;
- `Session` as the per-interaction/run-loop and Thread-bound live owner;
- dynamic Workspace resolution through RequestContext;
- persistent Thread/messages;
- native events for messages, tools, shell/command lifecycle, usage, workspace and agent lifecycle;
- `AgentControllerDisplayState`, maintained specifically as UI-facing canonical display state;
- `display_state_changed` snapshots with high-frequency coalescing;
- native wire conversion for events/display-state structures;
- native server/client Session streaming and reconnect machinery in the Mastra ecosystem;
- tool-payload transform semantics for `display` and `transcript` targets.

The Mastra skill rule is binding for implementation work:

```text
exact installed embedded docs
→ exact installed source/types
→ only then latest remote docs/Context7 for comparison
```

Latest/upstream Mastra may inform direction but never silently substitute for exact `1.63.2` behavior.

## 3.3 Mitra evidence

Mitra remains comparative Evidence, not authority.

The useful basic behavior observed there is deliberately simple:

```text
persistent task/session identity
→ reconnect same session / active stream
→ send
→ delta/tool/status/turnEnd
→ load history
→ update canvas/app
```

The lesson is not "copy Mitra's implementation". The lesson is that a basic coding product does not require a workflow engine or a second agent lifecycle around the underlying coding harness.

---

# 4. PSTACK laws for this rebaseline

1. **Experience First** — protect the simple create/talk/build/preview/continue experience.
2. **Model the Domain** — Project/source/artifact truth stays distinct from agent runtime mechanics.
3. **Subtract Before Add** — prove native successor, migrate callers, delete parallel custom path.
4. **Attack the Premise** — accepted implementation is evidence, not a reason to preserve a bad shape.
5. **Global Maximum** — restructure now when current structure preserves the defect class.
6. **Laziness Protocol** — do not implement capability the exact framework already supplies adequately.
7. **Boundary Discipline** — one semantic owner per concept; adapters may authorize/sanitize but must not invent a second lifecycle.
8. **Fix Root Causes** — no timeout/cache/pool/UI patch before the expensive or duplicated boundary is identified.
9. **Measure Before Optimize** — performance changes follow a quantitative waterfall.
10. **Migrate Then Delete** — no permanent compatibility wrapper with zero accepted callers.
11. **Prove It Works** — every slice has a falsifier before implementation.
12. **Prepare the Seam, Not the Future** — do not build Brain/workflow/subagent abstractions for hypothetical later needs.

---

# 5. Ownership target

The rebaseline tries to converge on this split; 7R-0 must prove the Mastra side exactly before production migration.

```text
PROJECT
│
├── Mastra coding harness
│   ├── shared AgentController
│   ├── shared coding Agent
│   ├── persistent Project Thread/messages
│   ├── stable Project live Session             [target hypothesis]
│   ├── native events / display state
│   └── BuilderRun-bound RequestContext/Workspace/E2B
│
└── Conexus Product authority
    ├── Account / Workspace / Project authorization
    ├── BuilderRun durability/idempotency/concurrency
    ├── ProjectWorkingState
    ├── Git/source admission + CAS
    ├── compiler
    ├── Registry / ArtifactRevision identity
    └── last-good Preview + serving authorization
```

Key distinction:

```text
Mastra run/Session = harness execution and conversation mechanics
BuilderRun         = Conexus Product transaction that may mutate authoritative source/Preview
```

Do not collapse these merely to reduce record count.

---

# 6. Current keep / replace / measure register

This is a planning register, not permission to delete before the owning slice proves the successor.

## 6.1 KEEP unless falsified

| Current concept | Why it exists |
| --- | --- |
| `BuilderRun` | idempotency, Project write concurrency, base source/version, authorization recheck, execution/result/failure settlement |
| `ProjectWorkingState` | independent working-source vs last-good Preview truth, including compile-failure repair |
| `refs/conexus/sources/<oid>` | exact immutable admitted Project source identity |
| source ancestry / one-commit / patch/path/size guards | mechanical source custody invariants |
| compiler / Registry separation | compiled output and immutable ArtifactRevision are distinct authorities |
| ArtifactRevision + digest | exact immutable Preview/application identity |
| dedicated Preview host and serving security | origin/cookie/CSP/sandbox/disclosure boundary |
| shared AgentController + shared coding Agent | native coding-harness mechanics |
| persistent Mastra Thread/messages | conversation history owner |
| BUILD/PLAN native tool visibility | mode-level harness mechanic |

## 6.2 REPLACE / DELETE candidates after caller migration and proof

| Candidate | Current problem | Owning slice |
| --- | --- | --- |
| `apps/hub/src/builder/runtime-observation.ts` | reinterprets native AgentController lifecycle into second event model | 7R-1 |
| `apps/hub/src/builder/observation-feed.ts` | custom replay/backpressure/subscriber lifecycle over live Session activity | 7R-1 |
| `packages/builder-observation/` | second wire contract for mechanics Mastra already models | 7R-1 |
| per-BuilderRun live stream route | browser attaches after run creation; stream lifetime follows Product execution rather than Project Session | 7R-1 |
| `apps/web/src/features/builder/observation.ts` | second frontend reducer/parser/state machine over custom observations | 7R-1 |
| custom `TEXT_START/DELTA/END`, ACTIVITY ids/categories, generation/sequence lifecycle | lossy duplicate of native message/tool/display state | 7R-1 |
| obsolete `PHASE` values inherited from verifier/correction era | current engine no longer owns those phases | 7R-1 |
| browser full-snapshot Diff helper | N+1 source reads and comparison in browser | 7R-3 |
| tree + one-source-file-per-request compiler snapshot path where it causes OCI N+1 | expensive isolation on micro-operations | 7R-3 |
| Project create stage/promote/verify as separate expensive OCI calls where batching preserves invariants | repeated container startup dominates useful Git work | 7R-3 |
| ordinary Preview fake Change/attempt/generation correlations | removed domain concepts leaking into current runtime | 7R-4 |
| misleading `recoverAndListQueuedBuilderRuns` shape if caller census confirms it can never return queued work after recovery | capability name/contract exceeds actual semantics | 7R-1 or 7R-5 cleanup when adjacent proof owns it |

## 6.3 MEASURE before deciding

| Mechanism | Unknown to resolve |
| --- | --- |
| fresh coding E2B per BuilderRun | security simplicity vs startup/materialization latency |
| separate compiler E2B | trusted-build isolation benefit vs measured latency |
| LibSQL persistence choice | sufficient for current internal Project conversation or unnecessary duplication with a better exact Mastra store setup |
| thin Conexus Session adapter vs direct official Mastra server/client routes | which removes more code while preserving Conexus auth/Project authority |
| warm OCI worker/pool | only consider if logical batching remains too slow |
| Mastra package upgrade | only consider when exact 1.63.2 lacks a required primitive and newer version demonstrably closes that gap |

---

# 7. Historical checkpoint disposition

Slices 1–6 remain accepted evidence. They do not freeze realization details now contradicted by live evidence.

### Slice 1 — source-native continuity — PASS

Preserve:

```text
A→B→C exact continuity
immutable refs/conexus/sources/<oid>
main need not move with Builder edits
ordinary mutation boundary app/**
```

### Slice 2 — source inspection authority — PASS

Preserve exact admission of working/last-good/latest-code-change source subjects. Arbitrary reachable OID is not disclosure authority.

### Slice 3 — Mastra lifecycle/message/PLAN — PASS facts, realization partly reopened

Preserve:

- Project Thread persistence;
- user/assistant history semantics;
- PLAN read-only end-to-end;
- native mode tool exposure.

Reopen:

- fresh Session per BuilderRun as a target law;
- any custom live projection that duplicates current Mastra primitives.

### Slice 4 — Product API / Preview / Diff — PASS facts, implementation to simplify

Preserve:

- server owns Preview coordinates;
- browser does not choose artifact/source authority;
- latest code-changing run is the useful Diff basis;
- response-only does not erase that basis.

Reopen:

- source-read API granularity;
- Preview launch realization;
- frontend Diff computation.

### Slice 5 — legacy ordinary Builder excision — PASS

Do not restore Change/Plan/WorkUnit/ActorRun/CodingSession current ordinary lifecycle.

### Slice 6 — Brain subtraction + verify rebaseline — PASS / CLOSED

Do not restore Brain pre-query/prompt injection.

### Slice 7A — functional evidence checkpoint

Checkpoint `0834f182d00d3fa803ac9f9590511514256da1ba` proved:

- dynamic Workspace can reach the shared Agent;
- real source mutation can compile and retain an artifact;
- Registry/Builder settlement can reach PREVIEW_READY;
- live Preview can be interactive;
- current custom streaming path can carry ordered tool/text information.

It did **not** prove that the custom streaming architecture, per-run Session lifecycle, Git operation granularity or Preview correlation model are the correct long-term realization.

---

# 8. Slice 7R-0 — Exact Mastra-native proof + authority reconciliation

**State:** AUTHORIZED / NEXT

## 8.1 Protected result

Before deleting or migrating production paths, establish citeable exact-version evidence for the smallest native Mastra architecture that can own the coding-harness mechanics.

The slice succeeds only when we can answer from exact `@mastra/core@1.63.2` behavior:

```text
Can one Project keep one stable live Session across multiple user turns?
Can each turn resolve a different fresh Workspace safely through RequestContext?
Can the same persistent Thread survive Session/controller recreation?
Do native Session events + display state fully represent current text/tool/lifecycle needs?
What native event/display payload can cross our disclosure boundary safely?
What exact sanitization remains a Conexus responsibility?
Does sendMessage await the run locally while official HTTP send can ACK and stream independently?
What reconnect/state-resync behavior exists natively in the adopted line?
```

## 8.2 Result expected

Preferred result to prove:

```text
Project P
→ one stable Session S
→ persistent Thread T

Turn 1 / BuilderRun R1
→ RequestContext W1
→ Workspace W1
→ native message/tool/display events
→ terminal complete

Turn 2 / BuilderRun R2
→ same Session S / Thread T
→ RequestContext W2
→ Workspace W2
→ W2 tools never read/write W1
→ native events remain coherent

recreate Session/controller as required
→ Thread T and messages remain recoverable
```

## 8.3 Required investigation order

1. run repo preflight;
2. read `.agents/skills/mastra/SKILL.md`;
3. inspect installed embedded docs for 1.63.2;
4. inspect installed source/types for `AgentController`, `Session`, dynamic Workspace, display state, events/wire/payload transforms;
5. compare latest official/Context7/upstream only to identify evolution, never to infer installed behavior;
6. compare those primitives to current Conexus files/callers.

## 8.4 Bounded proofs to build if needed

Use deterministic no-provider probes where possible.

Required falsifiers:

- **stable Session / different Workspace:** same Session across two turns must resolve Workspace A then Workspace B without leakage;
- **Project isolation:** Project A Session cannot resolve Project B Workspace/Thread;
- **native tool identity:** tool start/update/end remain keyed by exact native toolCallId;
- **display state:** currentMessage/activeTools/isRunning transition truthfully without a Conexus reducer;
- **Thread continuity:** Session recreation does not erase persisted messages;
- **mode continuity:** BUILD/PLAN tool availability remains correct across turns;
- **completion semantics:** local `sendMessage()` terminal behavior is exact and tested;
- **payload safety capability:** prove which native display/transcript transformation mechanisms exist in 1.63.2 and what remains unavailable.

Do not use a live model merely to prove deterministic framework semantics.

## 8.5 Production changes NOT allowed in 7R-0

Do not yet:

- delete `BuilderObservation` stack;
- change Product streaming route;
- redesign frontend;
- optimize Git;
- redesign Preview;
- change BuilderRun/ProjectWorkingState;
- upgrade Mastra;
- start Brain/Sankhya.

Qualification/probe code and minimal owner-document reconciliation are allowed.

## 8.6 Decision outcomes

Exactly one:

### A — native target proven

Reconcile the smallest affected owners so the current target becomes:

```text
stable Project Session + persistent Thread
native Session/display mechanics
per-BuilderRun dynamic Workspace
thin Conexus authorization/disclosure adapter
```

Then authorize 7R-1 separately.

### B — exact 1.63.2 gap

Record the exact missing primitive and STOP.

Only then compare:

```text
small bounded Conexus adapter
vs
qualified Mastra upgrade
```

Do not write a replacement framework by default.

## 8.7 Acceptance

- exact installed-version evidence is citeable;
- target lifecycle has a deterministic proof, not only source reading;
- custom-layer caller census is complete;
- every candidate deletion has an identified native successor or explicit gap;
- owner docs no longer instruct an agent to preserve a realization disproved by 7R-0;
- no unrelated Product capability started.

**STOP. Commit + PUSH tracked probe/doc changes. Return HEAD, exact commands/results and deletion census.**

---

# 9. Slice 7R-1 — Native Project Session + streaming convergence

**State:** BLOCKED on 7R-0 PASS and operator authorization

## 9.1 Protected result

The Project conversation must use Mastra's native live mechanics directly enough that Conexus no longer owns a second coding-harness event lifecycle.

Target interaction:

```text
open Project
→ authorize Project
→ create/resume Project Session
→ hydrate persisted Thread/state
→ establish live subscription
→ only then send user message
→ create/associate BuilderRun
→ native message/tool/display activity arrives while run executes
→ terminal native state
→ Conexus settles source/artifact truth separately
```

## 9.2 Preferred boundary

First target, subject to 7R-0:

```text
Mastra Session/events/display state
→ thin Conexus adapter
   - current Account/Project authorization
   - CSRF/session policy where applicable
   - server-controlled Project/Session selection
   - payload disclosure/sanitization only
→ diagnostic browser renderer
```

Do not invent another text/tool/activity lifecycle inside the adapter.

Direct official Mastra server/client route adoption remains a later alternative if it demonstrably removes more code without moving Conexus Product authority.

## 9.3 Keep

- shared AgentController;
- shared coding Agent;
- persistent Project Thread/messages;
- native BUILD/PLAN modes/tool visibility;
- dynamic Workspace resolution;
- BuilderRun as Conexus Product transaction;
- current Account/Project authorization.

## 9.4 Refactor

Expected current areas:

```text
apps/hub/src/builder/module.ts
apps/hub/src/builder/runtime.ts
apps/hub/src/builder/routes.ts
apps/hub/src/builder/service.ts
apps/web/src/features/builder/api.ts
apps/web/src/features/builder/components/project-build.tsx   # diagnostic behavior only
```

Likely changes:

- stop creating/deleting a logically new Project conversation Session for every BuilderRun if 7R-0 proves stable Session target;
- bind each BuilderRun's Workspace through per-request context rather than Session identity;
- make Project stream/subscription available before a message starts work;
- let native event/display semantics represent text/tools/running state;
- keep BuilderRun state alongside, not inside, Mastra display state;
- make send acknowledgement independent from waiting for the whole UI lifecycle when the transport supports it.

## 9.5 Delete after migration proof

Subject to exact caller census and 7R-0 findings:

```text
apps/hub/src/builder/runtime-observation.ts
apps/hub/src/builder/observation-feed.ts
packages/builder-observation/
apps/web/src/features/builder/observation.ts
custom per-BuilderRun observation stream route
custom generation/sequence feed state
custom TEXT_START/TEXT_DELTA/TEXT_END lifecycle
custom ACTIVITY ids/categories/state machine
legacy PHASE values with no current engine owner
```

Do not leave deprecated wrappers with zero accepted callers.

## 9.6 Disclosure requirement

Native does not mean "raw secrets to browser".

Conexus may retain a disclosure boundary that:

- authorizes the exact Project;
- suppresses internal/non-display events;
- uses exact Mastra display/transcript payload transformations where supported;
- strips credentials, arbitrary tool results, absolute secret paths or private provider metadata;
- preserves native tool/message identity and lifecycle rather than reconstructing them.

If exact 1.63.2 cannot safely transform a needed payload, use the smallest allowlist/sanitizer over the **native event shape**. Do not recreate `BuilderObservation` under a new name.

## 9.7 Falsifiers

Prove at least:

- subscription is established before the request that starts agent work;
- first native activity reaches the client without waiting for Builder-session polling;
- two sequential turns share the intended Project Session/Thread;
- second turn uses a new Workspace and exact current Project source;
- no Workspace leakage across Projects/turns;
- toolCallId remains stable through start/update/end;
- reload reconstructs durable history from Thread and current Product truth, not a durable custom event log;
- stream disconnect/reconnect cannot corrupt BuilderRun/source/Preview truth;
- response-only turn produces no source mutation.

## 9.8 Non-goals

No Git optimization, Preview domain rebase, visual redesign, Brain/Sankhya, workflows or Mastra upgrade unless 7R-0 explicitly selected an upgrade prerequisite.

## 9.9 Acceptance

- one native harness lifecycle in current runtime;
- custom observation stack removed after caller migration;
- diagnostic UI can display native text/tool/running behavior sufficiently to inspect later slices;
- current verification graph covers the native path rather than deleted projection code;
- fresh full `npm run verify` green with PostgreSQL skips 0.

**STOP. Commit + PUSH. Do not start 7R-2.**

---

# 10. Slice 7R-2 — Runtime waterfall / measurement baseline

**State:** BLOCKED on 7R-1 PASS and operator authorization

## 10.1 Protected result

Before optimizing any expensive subsystem, produce a quantitative trace of where wall-clock time and expensive isolation boundaries are actually spent.

This is an investigation slice, not a performance-fix slice.

## 10.2 Instrumentation law

Use bounded temporary structured timing only.

Allowed outputs:

```text
stdout structured records
or
.audit/slice7-foundation/*.jsonl
```

Do not create:

```text
new database table
new event store
observability service
metrics platform
permanent telemetry domain
```

Never log:

```text
model credentials
provider secrets
raw prompts
raw source file contents
raw arbitrary tool input/output
session cookies/tokens
```

## 10.3 Correlation

Each record should be correlatable using only safe operational ids required for diagnosis, e.g. Project/BuilderRun/phase, and include:

```text
boundary
start/end or durationMs
outcome
expensive resource count where relevant
bounded byte/file count where useful
```

## 10.4 Project creation waterfall

Measure at least:

```text
HTTP request total
authorization / DB reservation
recovery scan if invoked
OCI image qualification cost
stage source
promote source
canonical verify
OCI run count
DB finalize
response total
```

Separate first-call/cold behavior from subsequent warm-process behavior.

## 10.5 BUILD waterfall

Measure at least:

```text
message acknowledgement
BuilderRun create
claim
source preparation
Git OCI count / startup vs useful Git work where observable
coding E2B create
source materialization into coding sandbox
Session readiness
live subscription readiness
time to first native event
time to first assistant text
time to first tool
agent total
result bundle creation
source result admission
working-source CAS
application source snapshot for compiler
compiler E2B create
file upload/materialization
Vite/build execution
artifact readback
compiler teardown
Registry retain
Builder settlement
Preview-ready state
total wall clock
```

## 10.6 Stream/client waterfall

Measure enough to distinguish framework, adapter and browser delay:

```text
T0 client begins send
T1 server acknowledges message / BuilderRun
T2 native run starts
T3 first native Session event
T4 first server stream frame
T5 first client frame
T6 first diagnostic render
```

Do not interpret missing browser-paint precision as backend evidence; mark unknown when not measured.

## 10.7 Code / Diff waterfall

For current APIs record:

```text
HTTP duration
Git OCI count
tree operations
per-file operations
bytes returned
number of files
client computation duration where measurable
```

This should make N+1 cost explicit rather than inferred.

## 10.8 Preview waterfall

Measure:

```text
Preview launch request
last-good subject lookup
Registry lookup
route/grant establishment
entry POST/cookie redemption
index first byte
asset serving
browser load/ready where measurable
```

## 10.9 Acceptance

- at least one real Project create and two real Builder turns captured;
- one Code load, one Diff load and one Preview load captured;
- every known expensive isolation boundary counted;
- report separates measured facts from derivation/inference;
- no performance refactor mixed into the instrumentation commit;
- baseline becomes the deciding input for 7R-3/7R-4 priorities.

Do **not** invent latency SLOs before the baseline. The first criterion is that Conexus overhead must not dominate useful model/compiler work without a named security/product reason.

**STOP. Commit + PUSH only instrumentation that should remain; disposable `.audit` evidence need not become Product authority. Do not start optimization.**

---

# 11. Slice 7R-3 — Source/Git logical transaction rebase

**State:** BLOCKED on 7R-2 evidence and operator authorization

## 11.1 Protected result

Preserve exact source-custody security while changing the expensive boundary from micro-operation oriented to logical-operation oriented.

Target law:

```text
one logical source operation ≈ one hardened OCI execution
```

This is not an absolute performance target; it is the preferred granularity unless evidence proves separate isolation is necessary for a specific invariant.

## 11.2 Security/invariants to preserve

Do not weaken:

```text
pinned admitted Git image
--network none
--cap-drop ALL
no-new-privileges
read-only mounts/filesystem where required
safe POSIX ownership
no ambient host Git authority
exact Project/source identity
refs/conexus/sources/<oid>
base ancestry proof
exact one canonical result commit
result parent == base
app/** mutation boundary
no unsafe symlink/submodule/path traversal
patch/file/byte ceilings
main custody invariant
PostgreSQL working-source CAS
```

## 11.3 7R-3A — Project NEW source custody

Current symptom: Project creation crosses multiple isolated Git calls for stage/promote/verify, and container startup dominates useful work.

Investigate a single logical operation such as:

```text
admitNewProjectSource(projectId, attemptId)
→ create/stage deterministic source
→ atomically promote/admit expected ref
→ verify canonical source before returning
```

The internal OCI program may execute multiple Git commands. The expensive security boundary should not restart merely because the logical transaction contains several Git commands.

Do not collapse database reservation/finalization semantics into Git merely for speed.

## 11.4 7R-3B — bounded application source snapshot

Current Build/Code/Diff paths can do:

```text
list tree
→ read file 1
→ read file 2
→ ...
```

When each source read crosses hardened OCI, this is an N+1 defect.

Add/rebase toward one authorized primitive conceptually like:

```text
readApplicationSourceSnapshot(Project, SourceRevision)
→ exact admitted revision
→ bounded app/** file set
→ each safe path + exact UTF-8 content / metadata required by consumers
→ one logical isolated source read
```

Limits must make whole-snapshot disclosure bounded. Do not expose arbitrary repository paths merely to avoid N+1.

Migrate compiler and Code callers where this primitive is the correct unit.

## 11.5 7R-3C — source Diff

Do not reconstruct Diff by downloading two complete snapshots into React.

Target primitive conceptually:

```text
diffApplicationSources(Project, baseRevision, resultRevision)
```

Server/source boundary should verify both revisions are authorized and compute the needed path/patch summary inside the bounded Git transaction.

The browser consumes a Diff result; it does not become Git.

## 11.6 7R-3D — compiler handoff

After source snapshot batching, inspect whether compiler preparation still performs redundant source traversal/copying.

Keep compiler trust separation unless 7R-2 proves a material reason to reconsider. Optimizing snapshot delivery is separate from merging coding and trusted compiler sandboxes.

## 11.7 Warm-pool prohibition

Do not start with:

```text
persistent Git daemon
container pool
long-lived privileged worker
complex cache invalidation
```

First land logical batching and rerun the 7R-2 measurements.

Only if container startup still materially dominates may a later bounded decision compare warm-worker alternatives.

## 11.8 Migration/delete candidates

After callers move:

- remove micro-operation helpers that exist only because old caller shape required them;
- remove browser `readSourceSnapshot` full-tree/per-file composition;
- remove duplicate source snapshot implementations if one canonical bounded primitive now serves them;
- keep low-level internal Git command helpers inside one OCI program if they are implementation detail rather than external service boundaries.

## 11.9 Acceptance

- Project NEW path materially reduces OCI count without weakening source invariants;
- compiler source acquisition no longer performs per-file OCI N+1;
- Code surface can read working source without per-file round-trip explosion;
- Diff is server/source computed rather than full-snapshot browser comparison;
- before/after waterfall from 7R-2 is reported using the same environment;
- full source/custody/integration verification remains green.

If the measured result does not improve because another boundary dominates, STOP and re-evaluate before adding caching/pooling.

**STOP. Commit + PUSH. Do not start 7R-4.**

---

# 12. Slice 7R-4 — Preview runtime rebase

**State:** BLOCKED on 7R-3 PASS and operator authorization

## 12.1 Protected result

Make ordinary Preview follow the current Project/source/artifact domain directly while preserving the security properties already earned.

Target meaning:

```text
Authorized human
+ Project
+ ProjectWorkingState last-good source/artifact
→ secure usable Preview
```

No ordinary current Preview concept should require a fake Change that no longer exists.

## 12.2 Preserve

Unless a separate falsifier appears, keep:

```text
dedicated Preview/artifact host
exact server-owned last-good coordinates
one-time entry/grant semantics
Secure / HttpOnly cookie boundary
strict Origin
CSP
sandboxed iframe/browser isolation
exact source + ArtifactRevision + digest binding
Registry-backed artifact bytes
previous last-good Preview after compile failure
```

## 12.3 Caller census first

Trace current callers/fields for:

```text
changeId
attemptId
generation
Preview route correlation
route state OPENING/ACTIVE or equivalent
legacy preparation assumptions
```

Classify:

```text
current security invariant
current correlation actually required
legacy name only
legacy semantic dependency
historical migration/evidence
```

Do not rename a field merely for aesthetics. Remove a concept when its current semantic owner is gone.

## 12.4 Target refactor

Preferred current flow:

```text
GET Builder/Project truth
→ last-good source/artifact exists
→ launch Preview for exact Project/artifact
→ issue entry grant
→ browser enters dedicated Preview origin
→ Registry serves only exact admitted artifact files
```

BuilderRun may remain provenance of how the artifact was produced, but Preview availability must not require the originating run to stay live.

## 12.5 Required behavior

- successful Build changes last-good Preview automatically;
- failed Build leaves working source advanced but previous Preview usable;
- repair Build starts from failed working source and can replace Preview;
- reload reopens current last-good Preview without browser-authored technical coordinates;
- Hub restart preserves ProjectWorkingState/Registry truth and can re-establish Preview access;
- stale artifact/source/grant combinations fail closed.

## 12.6 Performance

Compare Preview launch/load waterfall to 7R-2.

Do not sacrifice origin/cookie/artifact security for instant UI. Remove accidental choreography first.

## 12.7 Migration law

If current persistent schema still contains proven-dead Preview correlation state, use a new forward migration. Historical migrations remain byte-immutable.

## 12.8 Non-goals

No final iframe layout, animation, browser chrome, responsive design or chat/Preview visual choreography. 7U owns Product Experience.

## 12.9 Acceptance

- ordinary Preview has source/artifact-native semantics;
- current runtime no longer fabricates Change-era coordinates merely to satisfy old APIs;
- security regression tests remain explicit and fail closed;
- automatic success/failure/reload/restart behavior is real;
- measured Preview overhead is understood.

**STOP. Commit + PUSH. Do not start 7R-5.**

---

# 13. Slice 7R-5 — Engine composed proof

**State:** BLOCKED on 7R-4 PASS and operator authorization

## 13.1 Protected result

Prove the final basic engine as a Product/system composition before any major frontend rewrite.

The diagnostic UI may be ugly. The engine may not be ambiguous.

## 13.2 Required real journey

Use actual PostgreSQL, model, E2B, Git/source custody, compiler, Registry and Preview runtime.

### Journey A — create and first Build

```text
create Project
→ Project source admitted
→ open Builder
→ live Project Session ready/subscribed
→ "Crie uma calculadora interativa"
→ native activity visible while executing
→ A→B
→ SOURCE_CHANGED / SUCCEEDED
→ compiler PASS
→ ArtifactRevision retained
→ PREVIEW_READY
→ calculator works
```

### Journey B — second code change

```text
"Adicione histórico das contas"
→ same Project conversation
→ base = exact B
→ new Workspace isolated from previous turn
→ B→C
→ previous calculator behavior remains
→ Preview C works
```

### Journey C — response only

```text
"Como o histórico foi implementado?"
→ same Thread
→ RESPONSE_ONLY
→ working source remains C
→ working version does not advance
→ compiler not invoked
→ last-good Preview remains C
```

### Journey D — compile failure and repair

Force a realistic app source change that passes source admission but fails trusted compilation.

Expected:

```text
working source = D
BuilderRun = SOURCE_CHANGED_BUILD_FAILED / FAILED
last-good Preview = C
Preview C remains usable
```

Then ask the Builder to repair.

Expected:

```text
base = D
D→E
compile PASS
Preview = E
```

### Journey E — restart/recovery

Restart Hub/process with no manual database/source edits.

Expected:

```text
same Project Thread/messages recover
working source = E
last-good Preview = E
Project Session can be recreated/resumed according to accepted native lifecycle
new request continues normally
```

### Journey F — concurrency/idempotency/authorization

Prove current BuilderRun invariants:

- same idempotency key + same request replays same run;
- same key + different request conflicts;
- concurrent write-capable BUILD for same Project is refused/serialized according to current contract;
- claim rejects stale base/version;
- current authorization is rechecked at the accepted owner;
- cross-Project/source disclosure fails.

### Journey G — inspection

- Code returns exact working source through the rebaselined source primitive;
- Diff represents latest code-changing base→result;
- response-only request does not erase latest useful Diff;
- Preview serves exact last-good artifact.

### Journey H — stream/reconnect

- stream connected before send;
- native running/text/tool state arrives progressively;
- disconnect/reconnect behavior follows accepted 7R-1 semantics;
- a missed live event never changes durable BuilderRun/source/Preview truth;
- history after reload comes from persistent Thread, not a custom durable feed.

## 13.3 Required records

For each code-changing run capture:

```text
BuilderRun id/mode/base/result/state/kind/failure
working source/version before/after
last-good source/artifact before/after
compiler result
artifact revision/digest when successful
relevant timing summary from the rebaselined waterfall
```

Do not expose secrets or raw internal model payloads merely for evidence.

## 13.4 Verification

Run fresh current candidate graph with real PostgreSQL requirements satisfied:

```text
npm run verify
```

No required PostgreSQL leaf may silently skip.

Also run the opt-in live composed proof with exact startup/browser/operator steps recorded.

## 13.5 Performance adjudication

Compare the final engine to 7R-2 baseline.

Do not invent a universal latency SLO retroactively. Decide whether remaining Conexus overhead is proportionate to the security/product property it buys and whether any one owned boundary still dominates useful model/compiler work.

A material remaining bottleneck blocks 7U only when it would make the basic Product unusable or indicates the foundation still has the wrong boundary.

## 13.6 Acceptance

PASS only when the whole basic engine is coherent under success, no-code, failure/repair, restart, concurrency and inspection paths.

At PASS:

- foundation architecture may be marked accepted;
- frontend diagnostic constraints are released;
- 7U becomes the next planning/execution stage;
- Brain/Sankhya remains blocked until 7U/basic Product acceptance unless the operator explicitly chooses otherwise.

**STOP. Commit + PUSH any final engine corrections/docs. Do not start 7U automatically.**

---

# 14. Slice 7U — Frontend Product rebaseline

**State:** BLOCKED on 7R-5 PASS and separate operator authorization

## 14.1 Purpose

Only after the motor is correct do we decide the final Product Experience.

The current React structure is not protected. It may be refactored heavily or replaced where the accepted engine/API makes a simpler UI possible.

## 14.2 Design evidence to use

Use deliberately, not as authority:

```text
approved Conexus wireframe / Product intent
Mitra observed builder/canvas behavior
Mastra Code
Mastra Studio / Playground
Claude Code desktop
Codex desktop
actual operator feedback from 7R live use
```

## 14.3 Product behavior expected

Target qualities include:

- application/Preview is a dominant useful surface;
- conversation feels continuous rather than log-oriented;
- native tool activity appears at the exact point in the turn;
- tools can show useful safe detail and support expand/collapse where valuable;
- repeated/long tool activity communicates progress rather than appearing frozen;
- streaming is progressive and stable;
- reconnect/recovery states are honest;
- Build/Plan control is understandable without exposing runtime mechanics;
- Code/Diff/Details are secondary inspection lenses, not expensive browser reconstructions;
- loading/error/compile-failure/previous-preview states are coherent;
- layout is full-height and suitable for real daily use.

## 14.4 Architecture decision to revisit

With 7R engine stable, compare again:

```text
thin Conexus adapter + native-shaped client state
vs
official Mastra client/server AgentController surfaces
```

Choose based on total code/authority complexity, not framework purity.

## 14.5 Non-goals

Do not use frontend rebaseline as an excuse to reopen source custody, BuilderRun semantics, Registry identity or Preview security unless UI evidence exposes a real contradiction.

## 14.6 Acceptance

Requires separate Product Experience plan and operator visual checkpoints. 7U will be decomposed into its own bounded UI slices only after 7R-5.

---

# 15. Slice 8 — First real business capability

**State:** DEFERRED / NOT AUTHORIZED

The previous idea of immediately adding Brain-backed builds is no longer the next step.

After the basic engine and Product Experience are accepted, select the first real business capability from actual Metal Nobre need.

Likely interaction remains narrow and agent-initiated, e.g. direct authorized Mastra tools rather than automatic prompt injection:

```text
searchBrain(...)
readBrainItem(...)
```

or later Sankhya/business tools if that is the chosen first consumer.

No workflow engine, MCP layer, RAG/vector database or broad agent platform is authorized merely because future Conexus may need them.

---

# 16. Per-slice planning template

Before executing any slice after 7R-0, the handoff must instantiate this plan with exact current evidence.

Each handoff must contain:

```text
Repository / branch / expected HEAD
Protected Product/system result
Why this slice exists now
Exact evidence / baseline
Target invariant
Exact files/callers likely affected
KEEP set
MIGRATE/REFACTOR set
DELETE-after-proof set
Explicit non-goals
Falsifier / RED proof before fix when applicable
Focused tests
Broader verification required
Commit requirement
PUSH requirement
STOP condition
Report format
```

The detailed plan in this file is a **decision map**, not permission to touch every listed file. Exact caller census and current HEAD remain mandatory at slice start.

---

# 17. Stop laws

Stop the current slice immediately when any of these appears:

- exact installed Mastra behavior contradicts the assumed target;
- a proposed deletion still has a real current Product consumer;
- preserving the slice invariant requires changing an unowned Product/security authority;
- a security boundary would be weakened merely for performance/UI convenience;
- a new durable entity/store/workflow is proposed without a current consumer;
- a framework upgrade becomes necessary but was not the authorized slice;
- a later-slice concern is being bundled only because it is nearby;
- evidence cannot distinguish whether a symptom is Mastra, Conexus adapter, source, compiler, Preview or browser.

In the last case, instrument/measure the boundary first. Do not guess.

---

# 18. Exact next action

Follow `docs/roadmap.md`: **7R-0 only**.

The next implementation handoff must be a bounded exact-version Mastra qualification and authority-reconciliation task. It must not start the production streaming refactor until the stable Project Session / dynamic Workspace / native display-state hypotheses are actually proven against the installed `1.63.2` line.
