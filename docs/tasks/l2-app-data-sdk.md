# L2 — Application data and SDK task plan

## Goal and design

Builder creates applications that persist, query and change their own business
data. Conexus supplies the repeatable scaffold, migration and registered
operation path so every app does not rebuild platform infrastructure.
Build-time authoring/provisioning and restricted runtime execution are distinct.
No generic SQL or arbitrary-operation API is introduced.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
The roadmap alone owns status/grants. This is a dependency-aware task plan;
exact code interfaces and new file names are frozen in L2.1 before execution,
not guessed from an SDK package name.

## Required context and existing source

- [Project operation grammar](../product/operation-ledger.md#4-project-defined-capability-admission-grammar),
  [permissions](../product/permission-contract.md),
  [data and Registry](../reference/data-and-persistence.md),
  [scaffold](../reference/frontend-and-product-surfaces.md),
  [4D-A/B](../phases/4d-project-paved-road-and-runtime-realization.md).
- [R3 candidate/owner envelope](r3.md) and its linked P2/P3 decision; candidate
  `budget_analyzer` tables are not a platform schema/template.
- Existing files: `scripts/run-project-migrations.mjs`,
  `scripts/run-hub-migrations.mjs`, `apps/hub/src/project/read-model.ts`,
  `apps/hub/project-migrations/`, `apps/hub/src/registry/`,
  `packages/profile-compiler/`, `apps/hub/src/generated/r1-new-project-seed.ts`.
- Proof starting points: `tests/implementation/r3-project-read-model.test.mjs`,
  `tests/implementation/r1-g0-profile-compiler.test.mjs` and
  `tests/implementation/r1-s3-project-command.test.mjs`. Their existing claims
  do not prove a generic app mutation runtime.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L2.0 runtime | [Security](../reference/security-and-authority.md), §§31–32; [deployment](../reference/release-deployment-and-operations.md), §§35.3–35.5; [MAR](../reference/managed-execution.md), §27; [research/probe](#managed-function-runtime-research-and-practical-proof) | Separate approved normal-code authoring from unselected execution mechanism; compare candidates and obtain deciding practical Evidence before committing the runtime boundary |
| L2.1 scaffold | [C-012](../decisions/index.md); [4D](../phases/4d-project-paved-road-and-runtime-realization.md), 4D-A/B; [frontend owner](../reference/frontend-and-product-surfaces.md), §§33.1–33.3 | Preserve versioned React/TS/Vite/TanStack and generated/platform/app ownership. Select exact SDK exports, regeneration inputs and real app consumer, not a new stack |
| L2.1–2 operation | [operation ledger](../product/operation-ledger.md), §§4.1–4.3; [data owner](../reference/data-and-persistence.md), §§5.4 and 11.1–11.3 | Derive concrete Query/Action input/output, transaction and runtime permission interfaces from the accepted grammar |
| L2.1 R3 reuse | [R3](r3.md), P1 reconciliation matrix and P2/P3 owner decision | List exact reused migration/runtime capability claims and accepted proof; identify what remains candidate or is irrelevant to native app data |
| L2.1–2 comparative SDK | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §§2–3 and 7; technical appendix §§11.1–11.2 and 12 only for a named signature question | Build/runtime separation and prepared templates inform the seam. Conexus §11.2 retains privilege separation; do not copy Mitra numeric IDs, SQL interpolation or observed SDK exports as Conexus API |
| L2.0–1 comparative backend | Same Mitra study, §§34.1–34.2 and 34.6 | Recorded provisioning scripts and JavaScript functions support a managed-function authoring model, not an inference about the vendor's isolation substrate or safe runtime privileges |
| L2.3 verification | [Factory influence](../research/factory-ai/influence-on-conexus.md), §§8–9; [Engineering method](../development/engineering-method.md), “Proof Strategy Before Implementation” | Define behavioral assertions before code decomposition: persistence, denied cross-Project access, stale write and regeneration preservation |

For driver/transaction or codegen uncertainty, inspect the adopted `pg`, schema
and compiler source first; consult official PostgreSQL/driver/framework docs
only for the unresolved behavior. A Mitra historical SDK snapshot describes its
observed mechanism, not our current package API or a reason to install it.

## Implementation work breakdown

### L2.0 — Validate the managed-function runtime before selecting it

- [ ] Complete the [runtime research and practical-proof packet](#managed-function-runtime-research-and-practical-proof),
  including the smallest affected Security/MAR/deployment owner reconciliation.
- [ ] Admit one disposable probe with exact local subjects, containment and
  resource limits, proof commands, acceptance criteria and cleanup ownership.
  Research permission is not permission to execute this probe.
- [ ] Assess actual results and residual risk before selecting the runtime.
  A successful mechanism probe does not close SDK, Release, browser or provider
  integration claims. Carry those obligations into their consuming increments.

### L2.1 — Freeze data/operation and SDK boundaries

- [ ] Name the Project/I&A/Registry integrator and classify each reused R3
  claim: accepted input, preserved candidate, owner reopening or not consumed.
  Resolve runtime capability adoption before production code depends on it.
- [ ] Derive concrete Query/Action declarations from the existing grammar:
  inputs/outputs, ownership, caller, permissions, transaction/precondition,
  revision and error behavior. Separate Project data mutation from external I/O.
- [ ] Select build SDK/scaffold and restricted runtime client interfaces,
  package/file locations and generated/platform/app mutation boundaries. Bind
  each helper to the generated app that will actually consume it.
- [ ] Resolve how data-backed Preview obtains isolated test/dev data access
  without inheriting Published App or Control Plane authority. If it requires
  L3 admission machinery, move that exact prerequisite here before claiming a
  usable data-backed app; delivery numbering cannot create an unsafe shortcut.
- [ ] Freeze failing cases, exact commands and the first code increment in
  this packet; obtain its execution grant through the roadmap.

### L2.2 — Realize persistent app operations

- [ ] Implement the admitted migration/runtime-role boundary and registered
  reads/writes with schema validation, real bind parameters and owner-managed
  transactions; SDK callers cannot choose raw SQL, credentials or other Projects.
- [ ] Wire code generation, runtime clients and Builder context to the same
  declarations. A field/operation change must update generated consumers or
  fail contract validation, never leave a silent runtime mismatch.
- [ ] Exercise creation, editing and querying through a Builder-authored app
  and show retained data after reload/restart under the admitted environment.

### L2.3 — Complete data usability and proof

- [ ] Connect accepted Data/Capabilities inspection to real admitted data and
  operation identities; inspection does not grant mutation authority.
- [ ] Decide private attachment/storage applicability from Product operations
  requiring bytes; preserve its owner-bound path and do not create a generic
  file API. Record inclusion or the actual follow-on consumer explicitly.
- [ ] Verify cross-Project refusal, invalid inputs, conflicting writes,
  transaction failure, runtime DDL denial and preservation of app-owned source
  during scaffold regeneration. Prove both app behavior and backend enforcement.

## Dependencies, proof and exit

Consumes L1 exact source/artifact custody and accepted Project data/role meaning.
Produces registered operation/client and data-runtime contracts consumed by
L3/L4/L5. R3 sync/cursor proof is required only for a consumer that asserts sync
truth; its candidate acceptance and aggregate provenance cannot be inherited.

Exit is an app created through Builder that can persistently create, edit and
read its own data through the platform, with negative boundary proof. The same
platform machinery must accept a different app schema without Budget-specific
code. Code-ready detail includes exact interfaces, file envelope and commands
from L2.1; the roadmap's candidate/CI checks remain additional requirements.

## Managed-function runtime research and practical proof

### Question, scope and evidence boundary

The concrete blocker is the missing execution boundary for Builder-authored
backend code. The brainstorming direction is normal versioned TypeScript files
implementing admitted Project Queries/Actions, with platform-managed execution.
This does not select Docker, grant an arbitrary persistent server per app, or
establish that a trusted Hub module can safely import generated code.

The decision is which smallest runtime can execute that code while preserving
Project isolation, exact candidate/Release identity, restricted data/integration
authority, useful local performance and bounded failure. The first installation
is local; business Product Agents and physical DEDICATED deployment are not
consumers of this decision. Brain remains Builder/future-agent knowledge, not
an implicit browser credential or requirement for an L2 agent runtime.

Evidence below was collected on 2026-09-11. It is documentary research plus
read-only host/repository inspection, not a runtime qualification, benchmark,
independent closure verdict or accepted Security-owner amendment. Mutable
selection status and execution permission remain in the [roadmap](../roadmap.md).

### Repository and local facts

At inspection, the repository was `main` at
`3baea8d0a5296b2e75f3519f52bcf96e9d0ef5d9`; roadmap and L1 already had
uncommitted planning changes. The preserved L1 changes are not production
serving Evidence. Pinned local Node/npm were `24.20.0` / `12.0.2` in WSL Ubuntu.

Read-only Docker inspection reported client/server `29.7.2`, Linux kernel
`6.18.33.2-microsoft-standard-WSL2`, cgroup v2 with systemd, builtin seccomp and
cgroup namespaces. Its security-options result did not advertise rootless or
AppArmor. The daemon reported four CPUs and 8,328,425,472 bytes of available-to-
daemon memory capacity; this is neither free-memory measurement nor total
physical-PC inventory. These facts establish an accessible engine, not that
any proposed execution limit or isolation property actually fires.

The current [Preview projection](../../apps/hub/src/builder/preview.ts) returns
`ready: false`. The MAR source surface inspected was
[managed-sync admission](../../apps/hub/src/mar/admission.ts), not a general
function executor. The existing
[R2 Registry schema](../../apps/hub/migrations/011_r2_brain_connections.sql)
restricts its artifact kind to Brain. None proves an application-function
producer, executable artifact admission or managed serving composition.

### Invariants and smallest authority routes

Three boundaries must hold together:

1. **Host containment:** generated code and its dependencies cannot inherit
   Hub secrets, Docker control, host files or other Projects' execution state.
2. **Capability authority:** every received SDK request is constrained by the
   server-derived caller, Project, environment, exact operation and revision.
   Query execution cannot obtain write/effect authority through another helper.
3. **Lifecycle truth:** stopping execution prevents further admission but does
   not reverse a committed database write or a possibly accepted external
   effect. Late replies, worker reuse and process restart cannot change the
   operation's identity or manufacture success.

The [Security owner](../reference/security-and-authority.md), §§31–32, already
distinguishes trusted control code from untrusted guests and sends application
business capabilities through Gateway. Z3's currently named guest is the E2B
Builder/app-under-test; local managed application-function execution needs an
explicit classification there. Accepted residual compromise of the trusted
Hub is not permission to put intentionally untrusted app code inside it.

The [deployment owner](../reference/release-deployment-and-operations.md),
§§35.3–35.5, places trusted Hub/MAR/Gateway modules in one Node process and
keeps E2B remote. An extra local execution process/container is a realization
extension to reconcile, not a reason to create a second MAR semantic owner.
The [MAR owner](../reference/managed-execution.md), §27, owns exact served
composition and a narrower managed-sync lifecycle; neither its queue nor
`job/v1` automatically defines interactive function execution.

The [operation grammar](../product/operation-ledger.md#4-project-defined-capability-admission-grammar)
owns Query/Action declarations and forbids generic SQL/provider executors.
[Gateway retry law](../reference/integrations-and-gateway.md#194-retry-law)
owns ambiguous external effects. SDK convenience, RPC transport and runtime
retries cannot replace these owners. No canonical owner is amended by this
research packet.

### Comparative findings and limits

**Mitra supports the authoring pattern, not an isolation conclusion.** The
[retained study](../research/mitra/influence-on-conexus.md), §§34.1–34.2 and
34.6, observes versioned provisioning scripts, browser calls to registered
functions, and JavaScript server functions performing DML through a server
SDK. Its phrase about privilege living at build time cannot mean that every
server-side handler is powerless at runtime: the recorded examples themselves
show otherwise. Conexus must preserve the distinction between browser,
build/provisioning and admitted server-side business execution.

The public [Mitra Platform SDK](https://github.com/mitralab-dev/mitra-platform-sdk)
also documents browser-facing app context, functions, queries and integrations,
and directs server-function code to a different SDK. Its package names differ
from the historical study. This supports a comparable interface separation;
neither a client SDK's `appId` nor its README proves backend authorization,
tenant isolation, worker placement or production deployment. Do not copy its
browser token storage, authentication or service topology into Conexus.

**Development sandboxes do not establish published runtime semantics.**
[Vercel's sandbox concepts](https://vercel.com/docs/sandbox/concepts) distinguish
ephemeral isolated execution from permanent hosting. A working preview in a
vendor sandbox therefore does not prove our release lifecycle, persistent
Project data or independent Published-App access. No additional Factory study
is needed to decide this particular runtime boundary.

**Node primitives alone do not contain hostile code.** The Node 24-line
documentation states that [VM contexts](https://nodejs.org/docs/latest-v24.x/api/vm.json)
are not a security mechanism and the
[Permission Model](https://nodejs.org/docs/latest-v24.x/api/permissions.json)
does not guarantee protection against malicious code. These warnings were
retrieved through the Node 24 documentation collection; they do not qualify
particular flags on adopted `24.20.0`. A same-process import or `node:vm` is not
a candidate security boundary. A plain child process changes failure locality
but does not establish filesystem, network or credential confinement.

**Docker supplies mechanisms, not Conexus policy.** Its
[security documentation](https://docs.docker.com/engine/security/) describes
namespaces, cgroups and the privileged daemon control surface. Access to that
control surface must never be exposed through app-selected images, mounts,
commands or generic runtime RPC. Ordinary containers still share the host
kernel. [Rootless mode](https://docs.docker.com/engine/security/rootless/) reduces
daemon/runtime privilege; it is distinct from running a non-root user inside a
rootful container and has prerequisites not established by the local inventory.

Docker has [no default CPU/memory budget](https://docs.docker.com/engine/containers/resource_constraints/).
The proposed profile must bound aggregate use as well as each invocation. The
[none network driver](https://docs.docker.com/engine/network/drivers/none/)
leaves only loopback, so a normal network SDK cannot simply keep calling the
Hub from that configuration. A restricted non-network capability channel, or
a deliberately confined network path, is additional design work to prove.
Neither an ordinary bridge nor an SDK wrapper establishes a Gateway-only rule.

**A lighter Linux launcher is a genuine alternative with its own policy cost.**
[Bubblewrap](https://github.com/containers/bubblewrap) builds namespace-based
sandboxes but explicitly leaves the security policy to its caller. It could
avoid Docker daemon orchestration; the Project would still have to own correct
mount, namespace, syscall, resource and process-lifecycle configuration. Fewer
components do not establish lower total implementation risk. The local `bwrap`
binary's presence is not evidence that such a profile works.

**E2B offers a different isolation boundary but moves execution away from
local resources.** Its [security description](https://e2b.dev/security)
specifies Firecracker microVMs with their own kernels. That is a vendor
architecture claim, not proof of the proposed Conexus composition. A remote
sandbox's localhost is not the operator's PC: reaching the local Gateway needs
an explicit authenticated transport, such as a narrow relay/control channel;
opening generic private-network access is not implied. C-008's existing
Builder choice is preserved and does not select E2B for app serving.

E2B's [outbound-network documentation](https://docs.e2b.dev/network/internet-access)
describes configurable egress and explicitly warns that hostname allowlists
on shared infrastructure are routing controls, not a strict security boundary.
Its [public-access controls](https://docs.e2b.dev/network/restrict-public-access)
are also separate from Conexus app authorization. Current vendor examples
must be checked against adopted packages before use; this research does not
requalify or falsify the existing Builder substrate by analogy. Remote serving
would additionally require lifecycle, reachability and cost measurements for
the declared workload, not reuse of a build-sandbox receipt.

**Cloudflare Workers is plausible for a narrower function profile, not
automatically incompatible with normal TypeScript.** The
[Node compatibility documentation](https://developers.cloudflare.com/workers/runtime-apis/nodejs/)
distinguishes supported, partial and stubbed APIs. Normal TypeScript handlers
do not inherently require a traditional Node HTTP server, subprocesses or
native addons; the actual dependency set would decide compatibility.
[Workers VPC](https://developers.cloudflare.com/workers-vpc/) provides access
to private targets through bindings and a tunnel, and was documented as beta
at retrieval. That adds a new operational/connectivity dependency for this
local MVP. Remote execution cannot remove the local PC as a dependency while
the required Gateway/data remain there.

### Alternatives and proposed experiment order

The following comparison is an engineering inference from the preceding
sources and local constraints, not a scored benchmark or owner acceptance.

| Candidate | Reason to consider | Main unresolved cost or objection | Research consequence |
| --- | --- | --- | --- |
| Fixed Node runtime in confined local containers | Fits local data placement and normal Node tooling; accessible engine | Shared kernel, daemon authority, capability channel, resource overhead and reuse isolation | Credible first experiment, not a selected production mechanism |
| Node under a narrow Linux sandbox launcher | Local execution without giving Hub general Docker control | Custom policy assembly, reproducible runtime packaging and resource/lifecycle integration | Compare if the Docker control boundary or measured overhead dominates; do not implement both speculatively |
| E2B managed-function runtime | Separate guest kernels and existing Builder-provider experience | New local-resource transport, remote dependency/spend and app-specific lifecycle | Reserve as an alternative if local containment cannot meet the admitted risk boundary |
| Workers/isolates with restricted handler profile | Managed function execution with bounded APIs | Dependency compatibility plus remote-to-local connectivity and vendor operational coupling | Reconsider for a real compatible consumer, not as an assumed drop-in replacement |

The strongest objection to the local-container proposal is that a Node
dependency or kernel/runtime escape could reach a machine that also holds
trusted platform state. Removing secrets from environment variables and
passing a few negative tests cannot prove absence of every escape. The exact
residual risk must be accepted by the Security owner; requirements for a
stronger boundary cannot be downgraded because Docker is installed.
[gVisor](https://gvisor.dev/docs/architecture_guide/intro/) illustrates another
boundary with a userspace application kernel, but adding it is a separate
compatibility/host-operability question, not a free hardening flag or automatic
MVP prerequisite.

The proposed next experiment should use one fixed Node runtime and fresh
isolated invocation state, with server-controlled artifact selection and a
bounded capability channel. It should not build an image per generated app,
install packages on invocation, maintain a cross-Project warm worker pool,
or introduce Kubernetes, autoscaling, a generic deployment engine or another
authorization database. These are scope limits for the proposed experiment,
not unreviewed permanent Product restrictions. If fresh execution is too slow,
measure and decide the smallest reuse boundary before introducing pooling.

For the Docker candidate, the proposed profile includes an already-present
digest-pinned image with no implicit pull; fixed entrypoint and argument shape;
explicit minimal environment; non-root guest UID; read-only root filesystem;
private bounded temporary storage; no Docker socket, host-root mounts or shared
writable Project cache; dropped Linux capabilities; `no-new-privileges`; a
known seccomp profile; and effective CPU/memory/PID/output limits. These are
configuration candidates to inspect and test on the exact engine, not a claim
that flags alone constitute a complete policy. Artifact extraction/mount
preparation must reject path traversal and links escaping its owned root.
Dependency lifecycle scripts belong in the admitted build boundary; a lockfile
or successful install alone does not establish reproducible executable bytes.
The [Docker run reference](https://docs.docker.com/reference/cli/docker/container/run/)
and [npm lifecycle documentation](https://docs.npmjs.com/cli/using-npm/scripts/)
describe the mechanisms, not their Conexus qualification.

Rootless configuration and a no-network channel are hypotheses to assess,
not facts about the current daemon. A rootful alternative would need explicit
adjudication of the controller's authority and residual risk. RPC over an
inherited channel or a narrowly exposed socket must still treat every guest
message as hostile, bind it to host-derived invocation context and enforce
size/count/deadline limits. No particular RPC schema is accepted here.
The capability receiver is an implementation responsibility routed to existing
owners, not authorization for a new universal broker service or policy store.
Killing the immediate child alone is insufficient: the
[Node child-process documentation](https://nodejs.org/download/release/v24.18.0/docs/api/child_process.html)
warns about descendants surviving parent termination. This older 24-line
reference supports the falsifier; exact `24.20.0` behavior still needs proof.
Validate the chosen supervisor's cleanup rather than mandating an untested
hand-built cgroup controller as another subsystem.

The research supports testing the local-container candidate first; it does
not prove it is the best final solution or give a delivery-date estimate.
The developer-facing function profile, capability receiver and lifecycle are
as important to feasibility as the container itself. The remaining practical
questions are enumerated below. A controlled first probe may use reads and a
synthetic effect target; this does not reduce the MVP's admitted external-effect
goal to read-only integration or defer Brain out of the MVP.

### Required practical evidence

The proof must exercise useful execution and attempted boundary violations in
the same selected configuration. A test that blocks everything does not prove
an application runtime. A test calling a stand-in broker proves only that
protocol/containment fixture; it does not prove production I&A or Gateway.

| Claim | Smallest experiment and falsifier | Consequence if false |
| --- | --- | --- |
| Normal code is usable | Build and invoke a TypeScript function importing a local helper and an admitted dependency, returning validated data from an allowed capability. Reject unsupported dependencies explicitly | Reconsider the supported function profile or runtime; do not claim arbitrary Node compatibility |
| Host and sibling isolation | Two synthetic Projects with separate canary data; attempt access to host canary, sibling state, runtime-control socket and undeclared mounts. No real secrets in the fixture | Reject the configuration if protected canary access or host-control access succeeds |
| Restricted capability channel | The same guest performs an allowed read and attempts forged Project/environment/revision, an undeclared call, Query-to-Action escalation and a replay after revocation | Reject a design whose broker trusts guest authority fields or requires privileged runtime credentials |
| Network policy and useful SDK coexist | Allowed SDK call succeeds while direct TCP/UDP/DNS/IPv6 and host/provider bypass attempts are observed against controlled local targets | Reject network-only claims based on failed DNS or a single blocked HTTP call; never probe real enterprise targets |
| Bounded resource/failure behavior | Isolated disposable worker exercises finite CPU/memory/process/output pressure and a bounded nonterminating handler; host-side deadline terminates it and its descendants without harming the control process | Reject if enforcement is missing, cleanup is incomplete, or unrelated workload is killed; limits must be established before stress |
| Exact identity and clean reuse | Run two revisions and two caller contexts; deliver a delayed reply, revoke a grant, then restart the probe controller | Reject stale/cross-context output, mutable-latest execution or a surviving channel with renewed implicit authority |
| Honest effect outcome | Controlled local effect target records acceptance and drops its reply; terminate the guest and attempt the same logical intent again | Runtime result must preserve ambiguity and prohibit unsafe duplication; fixture result is not Sankhya qualification |
| Local usability | Measure cold start, execution overhead, peak memory and resource recovery for the declared sequential/concurrent load on the exact host | Record observations against predeclared budgets; no claim that default container settings or vendor latency describes Conexus |

Use two bounded proof subjects, not a complete speculative function platform:

1. **Disposable feasibility subject:** one fixed runtime configuration, two
   synthetic Projects, two revisions, a small capability receiver and local
   canary endpoints. No business data, real credentials, external egress,
   Builder/model call, arbitrary image creation or long-running orchestration.
   It answers containment, protocol feasibility and measured overhead only.
2. **First composed vertical subject after selection:** the admitted L1
   producer/Registry/MAR path plus the real L2 operation authorization and a
   disposable Project database. Build, serve, invoke, persist, restart and
   reject wrong context through the actual modules. L3 proves published-app
   access; L4 proves the exact provider effect under separate authority.

Before executing subject 1, freeze the selected engine and immutable image
identity, Node version, source digest, rootless/rootful posture, UID/mount/network
configuration, allowed capability transport, and exact throwaway directory and
resource names. Declare per-worker and aggregate CPU/memory/PID/output limits,
deadline/kill grace, trial counts/concurrency, latency budgets and a host-safety
abort condition. Missing image or host prerequisites must be reported before
installation, download or reconfiguration. Tests may destroy only their own
explicitly identified disposable resources.

Record actual commands, configuration, expected and observed results, negative
controls, measured resource use and cleanup. Do not record tokens, business
payloads or host secrets. A failure narrows or rejects the hypothesis; it must
not trigger silent introduction of a tunnel, privileged proxy, unrestricted
database access, another runtime or weakened security requirement. The research
does not supply an executable probe grant or pretend those remaining numeric
and configuration choices are already frozen.

### Disposable local probe envelope

This is the disposable feasibility subject approved after research, not the
composed Product subject. The following settings are fixed before execution.
The roadmap carries the narrow execution grant. No implementation-ready Product
contract or material runtime selection is made here.

| Item | Frozen experiment value |
| --- | --- |
| Image | Existing `conexus-r1-s5-playwright@sha256:43fee0d4d2073e3b89b5eccc97651080484705955b7d7f2454ee7eb6fddf240e`; `--pull=never`; this is a proof image, not a selected app image |
| Runtime | `/opt/node-v24.20.0-linux-x64/bin/node`; verify actual version before cases; local build tools already installed, no download |
| Host posture | Existing Docker 29.7.2, WSL2, rootful daemon, builtin seccomp; no rootless/AppArmor assertion or reconfiguration |
| Caller and mounts | Guest UID/GID `1000:1000`; read-only generated artifact and private per-invocation socket directory only; no repo, host root, Docker socket or real data mounts |
| Limits | One active container maximum, `--cpus=0.5`, `--memory=256m`, `--memory-swap=256m`, `--pids-limit=32`, 16 MiB private `/tmp` and `/dev/shm`, read-only root, all capabilities dropped, no-new-privileges, init enabled |
| Transport | No container network; one private Unix-domain socket to a host fixture, bound to Project/revision/operation context outside guest control; no HTTP proxy or database socket |
| Protocol | Newline-delimited JSON; each request at most 8 KiB; at most 32 calls; allow only the fixture's exact `read`, `effect` and revocation-test control as permitted by host-selected case; guest scope overrides rejected |
| Output and deadline | 64 KiB combined stdout/stderr per invocation; 4 s wall deadline from start command, then bounded force-stop and inspect; controller command timeout 10 s; whole experiment under 3 minutes excluding authoring |
| Fixture | Two synthetic Projects, two revisions, local TypeScript helper plus bundled installed Zod; test-owned filesystem/env canaries; no real secrets and no kernel-escape exploits |
| Safety abort | Stop if fewer than 2 GiB MemAvailable or 256 MiB free temporary storage, cleanup cannot be confirmed, scope differs, or any protected canary is exposed; no unbounded fork/output/host stress |
| Performance screen | Five sequential fresh-container nominal trials; report every duration and nearest-rank p95; screen at 3 s p95 including create/start/stop observation, not a Product SLA or warm-pool benchmark |
| Fault cases | Wrong Project/revision/environment and unknown operation; read-to-effect escalation; fixture revocation; missing sibling/host/socket canaries; read-only writes; loopback TCP/UDP/DNS/IPv6 isolation; bounded output and memory pressure; deadline with a detached child |
| Effect evidence | Fixture records one synthetic intent then withholds reply; a later attempt of that intent is fenced by fixture state. This checks protocol/outcome expectations, not durable Gateway or Sankhya correctness |
| Cleanup | Controller uses exact per-run container names and validates a unique ownership label before remove; no prune or daemon restart. Close all test sockets/listeners; retain temporary source/results for inspection and record their digests |

Preparation comprises `guest.ts`, `helper.ts` and `probe.mjs` in the unique
temporary directory. The controller builds the two source revisions with the
already-installed esbuild/Zod, hashes generated bytes, verifies the effective
container settings before start, runs nominal/negative cases and writes
`result.json` with measurements, output and cleanup. Probe-only context checks
are deliberately fixtures; they must not be described as existing Conexus SDK
or authorization code. Run using pinned local Node with `node probe.mjs` from
the repository, pointing only at its own temporary sources and outputs.

Failure of a safety/capability claim rejects that experiment configuration;
a performance-screen failure rejects fresh-per-invocation execution for the
declared local screen, not all containers. Script/build defects are reported
separately and may be corrected within this same envelope without changing the
candidate policy or relaxing the acceptance criteria. No automatic switch to
another mechanism, broader privileges, extra mount or network is admitted.

After the first nominal attempt failed before producing guest output, one
diagnostic control is within this same envelope: `node probe.mjs --bootstrap-only`
starts only `node -e` reporting its version, with identical image, privileges,
mounts, limits and 4 s deadline. It separates container/Node bootstrap from
bundled function/IPC work; it is not a substitute for the failed nominal case.
Capture Docker-command durations/errors and retain the first attempt receipt.

### Disposable probe observations

On 2026-09-11 the fixed-profile nominal attempt and its bare-Node diagnostic
both stopped before producing guest output. This is an unsuccessful feasibility
experiment, not a successful function/sandbox qualification. It neither proves
Docker unsuitable in general nor licenses a warmer pool, higher limits, another
image or weakened containment as an automatic workaround.

| Subject | Observed result | Evidence limit |
| --- | --- | --- |
| TypeScript build | Existing esbuild `0.28.2` bundled the synthetic TypeScript/helper and installed Zod `4.5.2` into two revision-distinct artifacts | Transpilation/bundling only; no TypeScript typecheck or Conexus Builder/Registry proof |
| Nominal Project A/v1 | No guest output; 4 s deadline requested termination; `docker kill` command failed and the invocation/cleanup took 32,749 ms | No allowed SDK call, actual Node version or function result observed; five-sample performance screen not completed |
| Nominal lifecycle events | Docker create-to-start approximately 4.99 s; kill event followed by die approximately 11.61 s later; final destroy recorded | Event intervals are diagnostic observations, not steady-state p95 or proof that a deadline establishes quiescence |
| Bare-Node diagnostic | Same limits/image; `node -e` produced no output, exited 137 after deadline termination; OOMKilled=false; 15,944 ms including cleanup | Failure occurs without Zod/function/IPC execution; exact image/daemon/WSL cause remains unresolved |
| Diagnostic control operations | `docker create` 5,150 ms; inspect during startup 4,024 ms; kill 2,414 ms; create-to-start event interval approximately 8.01 s | Docker lifecycle control contributes material delay; this does not establish which lower-level component caused it |
| Effective configuration | Image identity, read-only root, guest UID, two read-only owned mounts, network none, CPU/memory/PID settings matched inspection before start | Configured constraints are not proof that memory/PID/egress/authority controls fired |
| Cleanup | Both exact probe containers destroyed; final label-scoped census empty. Diagnostic captured two host PIDs with start identities and found no same-identity survivors | Detached-child, memory-pressure and output-pressure cases were not reached; no broad termination guarantee |

The host-side loopback observers passed their synthetic positive controls.
No guest packets were observed, but because useful guest execution never
completed, this cannot count as network-denial proof. Likewise, zero synthetic
effects means the effect scenario was not reached, not that effect safety was
proven. The remaining boundary, protocol, revision/context, revocation, memory,
output, detached-child and effect cases remain unexecuted.

The concrete prerequisite has narrowed from an abstract runtime choice to
explaining startup and stop latency in this exact local image/daemon/WSL
combination. Ordinary readonly host inspection showed ample available memory
and no current CPU-pressure signal; that excludes neither earlier transients
nor I/O/runtime contention. Do not blame the SDK, E2B, or all containers from
these observations. Do not increase the time budget and relabel the same
configuration as having met the original screen.

Temporary artifacts are retained at `/tmp/conexus-l2-spike-AVUVsoDd` for
inspection, not integrated as Product or a supported test suite:

- `guest.ts` digest:
  `a067bc718e1c8f4a4e324222ce273974586b9dd325c6765df6dd4fe63ed71b4c`.
- Instrumented `probe.mjs` digest:
  `25bca396b9a1847b6dffdad69ae851c3975bdb310be963c5e33c44ba138bbede`.
- `result-attempt1.json` digest:
  `a33443d215b07d937c94b7bb7169a219c37fda1cd3f87ebf646a263fb4a01feb`.
- Diagnostic `result.json` digest:
  `f270c6a2341653c8eb904e2081d94ec732b6648a506efb03969dab5967b91874`.

Receipts include generated artifact identities and the diagnostic's exact
Docker argument arrays. The first receipt predates the controller's diagnostic
instrumentation; its earlier controller hash is not the current file hash.
Temporary source/receipts can disappear with host cleanup and cannot become
durable qualification custody by reference alone. Any later accepted runtime
claim needs reproducible source/configuration and its own deciding proof.
No Product code, real database, provider, image installation or daemon
configuration was changed. The removed containers carried only synthetic
temporary state; retained sources/receipts preserve the useful investigation.

### Source inventory

External sources were retrieved on 2026-09-11; moving documentation and default
repository branches are not adopted version pins. The preceding links identify
the specific supporting pages. Version-specific execution claims require the
eventual probe's exact packages, image, runtime and host configuration.

| Publisher / source family | Evidence used and limitation |
| --- | --- |
| Conexus owners and task packets linked above | Accepted semantics versus planning proposals; neither alone proves implementation |
| Retained Mitra study, §§34.1–34.2, 34.6 | Historical observed app/provisioning pattern; not current vendor infrastructure documentation |
| Mitra Platform SDK public repository, README | Public client/server SDK separation; not enforcement or deployment proof, and not assumed identical to the historical SDK |
| Vercel, Understanding Sandboxes | Development/ephemeral execution versus hosting distinction; no benchmark or Conexus serving proof |
| Node.js, VM and Permissions, latest-v24 documentation collection | Explicit limits of language/runtime permission mechanisms, retrieved through Context7; exact 24.20.0 flags not selected |
| Node.js 24.18.0, Child processes | Descendant-termination caveat; older 24-line documentation is not exact adopted-version proof |
| Docker, Engine security, Rootless, Resource constraints, None driver and Run reference | Available control mechanisms and pitfalls; actual rootless/limits/channel behavior remains untested |
| Bubblewrap project, README | Caller-defined Linux confinement policy; no ready-made Conexus sandbox |
| gVisor, Introduction to gVisor security | Alternative kernel-exposure boundary; not installed, measured or selected |
| E2B, Security, Internet access and Restricting public access | Vendor isolation/network/access descriptions; no new app-serving qualification or silent inheritance from Builder proof |
| Cloudflare, Node.js compatibility and Workers VPC | Compatibility-dependent alternative and private connectivity; VPC documented as beta, no Conexus deployment or cost estimate |
| npm, Lifecycle scripts | Installation can execute package scripts; no reproducibility or safety inference from lockfile alone |

No ordinary container test can certify absence of all kernel vulnerabilities
or side channels. Positive/negative controls establish only their declared
boundary and configuration. If the required residual-risk posture exceeds
that boundary, reopen the smallest Security/deployment owner and compare a
stronger isolation candidate instead of accumulating more happy-path tests.
