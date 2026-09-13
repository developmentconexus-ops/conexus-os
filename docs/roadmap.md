# Conexus OS roadmap

This file owns current status, allowed work and the exact next action.
[The index](index.md) routes to Product, architecture, contracts and decisions.
Evidence and old delivery plans do not grant execution.

## Current direction and tracking

Build an internal Metalnobre MVP, not a platform ready for sale. A person asks
the Builder to create and change an ordinary-code application without choosing
its stack or configuring infrastructure. Reuse Mastra and existing Conexus
implementation. Add manually maintained store knowledge and the narrow SDK and
Sankhya operations the app needs. No particular test app defines Conexus.

Business Product Agents, automatic Brain learning, generic app backends and
broad automation are deferred. The broader Product contracts remain discoverable;
this pilot does not claim to implement all of them.

The operator approved the revised internal pilot on 2026-09-13. Provide the
development environment and company knowledge without making every Preview
depend on an independent model reviewer. Working source, compiled Preview and
quality review are separate. The current increment is the session-first Builder
core: one deterministic Project thread, Mastra-owned messages and session events,
and Conexus-owned authorization, active Turn, working source and last-good
Preview. The [pilot implementation sequence](tasks/builder-first-app.md#internal-pilot-refactoring)
replaces verifier repair as the primary objective. Brain experimentation depends
on a usable create/open/continue cycle, not completion of every recovery proof.

R1–R7 and L1–L6 are historical plans, not the current execution queue.
Their names in code, migrations and receipts do not require stage readmission.
Keep useful implementation and the original proof limits.

| Delivery | State | Observable result and evidence | Next action |
| --- | --- | --- | --- |
| [Repository cleanup](tasks/repository-consolidation.md) | DELIVERED | Current graph and final changed Builder leaf passed; published in `9945329`; no claim that the app is ready | No further cleanup prerequisite |
| [First Builder-created app](tasks/builder-first-app.md#internal-pilot-refactoring) | IN PROGRESS | Session-first persistence, terminal working-source cleanup and runtime wiring are proved locally; real E2B execution and the browser journey remain open | Run the configured E2B path, then add the Session/Turn API and UI |
| [Manually maintained Brain](tasks/builder-first-app.md#internal-pilot-refactoring) | PLANNED | Existing context code retained; real authored rule consumption remains unproved | Begin the real-rule experiment when create/open/continue works; do not wait for complete first-app closure |
| [Narrow SDK and Sankhya](tasks/builder-first-app.md#keep-the-product-outcome) | PLANNED | Existing integration proof retained; the app must perform a real authorized operation | Select that operation before defining its SDK details |
| [Colleague uses the app](tasks/builder-first-app.md#keep-the-product-outcome) | PLANNED | Another authorized person must open the usable app; creator Preview does not establish this | Detail access when the app is usable |

States are PLANNED, IN PROGRESS, VALIDATING, DELIVERED and BLOCKED. BLOCKED
requires a concrete reason and the action that removes it. DELIVERED requires
the named observable result, not only written code or passing unit tests.
This table owns delivery state. Tasks own implementation steps and observations;
do not maintain duplicate status boards. Future deliveries stay summarized until
their consumer needs detail. These labels are not CI gates.

## Program state

| Work | Status | Preserved result | Reopen trigger |
| --- | --- | --- | --- |
| Product implementation | IN PROGRESS / INTERNAL PILOT REFACTORING | Real streaming and previous app retained; historical refused candidate remains UNVERIFIED | Working-source continuity, technical Preview eligibility, real Brain consumption and recovery proof |

Continuation readiness = INTERNAL PILOT / APPROVED REFACTORING / OWNER ALIGNMENT

The historical verifier refusal and four generated/hash verification failures
remain recorded evidence/debt. They are not the next MVP blockers and must not
delay the session-first core. They remain relevant when a named future claim
requires the corresponding proof.

## Current grant

On 2026-09-13 the operator requested autonomous execution until the approved
pilot is usable for their own browser test. Continue implementation and real
local validation without per-step approval. Stop only for a genuine missing
operator decision, external authority or material contradiction requiring Pro
input. Leave the owned local pilot running and provide its tested address when
ready. This does not authorize publication, production writes or merge.

On 2026-09-13 the operator approved proceeding with the reviewed pilot proposal
and the Pro clarification that Brain experimentation may precede first-app
closure. Update existing owners and implement the bounded pilot described in
the current task. This supersedes the earlier verifier-first priority and the
universal independent-review requirement for the proposed technical Preview
path, not authorization or source isolation. Reconcile affected Product and
wire owners before their implementation; do not implement a bypass flag or
mark an unreviewed candidate VERIFIED. Preserve historical records unchanged.
Routine reversible implementation and targeted checks are included. Existing
named local model/E2B proof authority remains; no public deployment, business
write, commit, push, PR or merge is granted by this continuation.

On 2026-09-13 the operator approved the session-first core increment. Do not
redesign the UI in this increment. Verify the exact installed Mastra `1.63.2`
composition without upgrading the framework; prove deterministic Project
thread persistence across AgentController/store rebind and a different physical
sandbox; then correct the root cause that can leave `project_working_state` in
`CODING` after a terminal Turn. Preserve existing Git custody, continuation,
no-code response, artifact retention and reviewer-free Preview behavior. The
Session/Turn API and UI follow only after this core proof passes.

On 2026-09-12, after the live streaming result, the operator authorized publishing
the current implementation and evidence to `analysis/internal-mvp-2026-09-12`
for GPT Pro review. This supersedes the streaming grant's publication restriction
for this snapshot only. The verifier refusal and four verification failures
remain open. No merge, deployment or delivery acceptance is authorized.

On 2026-09-12 the operator approved implementing and validating the researched
Builder streaming increment and requested Arena where useful. This supersedes
the research-only restriction below for the narrow Builder observation wire,
runtime event projection, existing React UI and their verification. Compare
executable bounded-feed candidates with Luna, integrate the smallest sustainable
result, and use the admitted model/E2B configuration through real login and UI
to prove live streaming. Routine reversible implementation and checks are
included. Preserve the generated app and existing candidate/Preview authority.
No replacement runtime, durable chat owner, business writes, hosting, publication
or merge is authorized.

On 2026-09-12 the operator requested deep research and a grounded architecture
proposal for streaming Builder chat, using Mastra, Context7, APIs/SDKs and
similar platforms including Palantir. Compare the smallest viable integrations
with the existing UI, background execution and Preview. Keep this a focused
research/design increment; do not silently implement a new chat contract,
install dependencies or replace the runtime. Preserve the real generated app.
The ongoing first-app grant remains, with streaming design addressed before
further material UI changes. Use Luna high/xhigh researchers.

On 2026-09-12 the operator authorized committing and pushing the current work
to the existing analysis branch for GPT Pro review. This is an implementation
snapshot, not acceptance of the first-app delivery or permission to merge,
deploy, or change production data. Full candidate verification and the complete
generated-app journey remain outstanding.

On 2026-09-12 the operator requested autonomous continuation until the aligned
roadmap/task implementation is finished and verified. Continue across mechanical
unit boundaries without asking for another approval. Keep the full first-app
outcome and the current semantic owners; a partial service or test result does
not complete this objective. Existing external-effect and publication limits
remain. Ask only for a genuinely missing Product decision or new authority.

On 2026-09-12 the operator approved the complete local Preview consumer proposed
after Builder preparation. This includes the necessary bounded contract changes,
exact-candidate invocation and late-result settlement, authorized HTTP asset
serving, iframe and new-tab integration in the existing Build UI, and real
browser verification of refusal, failure and reopening without compilation.
Routine reversible implementation and checks are included without per-file
approval. Use architect where the integration shape needs validation and
interrogate for a contested decision. Preserve Builder, Registry, MAR and I&A
ownership. This supersedes the prior exclusion of HTTP serving and ready Preview
for this consumer only. It does not authorize public ingress, hosting, production
database changes, business writes, publication or merge. Existing named live-proof
authority remains. New material Product contradictions still return to their owner.

On 2026-09-12 the operator approved proceeding with the recorded Builder
preparation consumer. Replace the internal transient compilation API with
retained preparation, reuse the existing Registry adapter and executor pool,
migrate current callers, and prove reuse, refusal and cancellation. Routine
reversible implementation and verification are included. No new HTTP serving,
Preview readiness, database schema, public ingress or publication is admitted
by this bounded continuation. Existing named live-proof authority remains.

On 2026-09-12 the operator authorized the proposed Registry implementation and
required real paid calls and company-data validation rather than treating local
tests as Product proof. Implement the existing Registry unit, including migration
026, current-loader/catalog adaptation, typed adapter and real disposable-DB
checks. Routine reversible integration and verification are included. This grant
supersedes the older Product-code pause for this unit only.

Live validation of the first-app journey may use the existing admitted model and
E2B configuration for app creation, compilation and the second-change proof when
the corresponding integration is ready. Do not run unrelated paid experiments
or publish replacement provider images implicitly. The operator authorized any
read-only Sankhya query. Source inspection found no admitted customer mapping,
so use the existing fixed TGFCAB key-conformance aggregate for company 1,
with no names, identifiers or contact details in output. Use the real existing
authentication and observer modules. Synthetic descriptor coordinates in a
module proof must not be presented as a registered Project or Hub journey.
Do not mutate business records or export raw customer data. Preserve credentials
outside logs/Git. A successful query alone is not an app/SDK integration claim.
No public ingress, production database migration, commit, push, PR or merge is
authorized by this continuation.

The operator explicitly authorized installing a local development CA in
Windows/WSL, keeping its private key outside the repository. The CA and server
certificate are prepared under the user's private `conexus-local-tls` directory.
The operator reported WSL/Windows trust installation; the Windows certificate
thumbprint matches. WSL system verification and a strict Chromium iframe/new-tab
probe passed after the authorized local CA was also imported into user NSS trust.
No certificate-error bypass was used. Windows browser navigation and the real
Hub/Keycloak journey remain unproven. Do not change WSL interoperability or
collect the operator password.

The operator approved proceeding locally and deferring public-domain access,
tunnels and hosting. Use the tested nested `conexus.localhost` browser profile
to avoid DNS/hosts-file setup. This direction does not authorize public exposure,
DNS changes or an implicit system root-certificate installation. Prepare the
local certificate binding and make any required trust-store effect explicit.

On 2026-09-12 the operator requested the proposed PostgreSQL retention proof.
Run a bounded local experiment with a disposable database, synthetic app files
and the existing Registry draft. The grant includes temporary probe scripts,
current baseline migrations, the identified narrow schema permission correction
in that disposable database, mechanical SQL name-disambiguation in an isolated
candidate when the actual call exposes it, and runtime-role retain/read/reconnect and refusal
checks. The operator's continuation includes a disposable persistent-volume
database restart and bounded larger-payload reads to close the recorded proof
limits. It does not include restarting the actual Hub or a company database.
Record every candidate modification and distinguish fixture setup from
the actual storage path. Do not replace admission functions to manufacture success.
This does not authorize integrating Product code, invoking live providers,
accessing company data, publishing changes or claiming a composed Hub/browser proof.

On 2026-09-12 the operator approved roadmap-plus-task tracking and requested
root-led orchestration with subagents when useful. Organize the existing records
and continue bounded planning for **Create and open**. Inspect code and retained
drafts, resolve observable facts locally, and use external research for named
unknowns. Ask the operator for material Product choices or new execution effects,
not permission for each read or documentation edit. Do not restart whole-platform
planning or rerun successful compiler experiments without a new question.

The cleanup and its publication are complete at `9945329`. Preserve all existing
Product candidates and original receipts. That publication grant is not an
ongoing permission to publish later changes. This tracking/planning approval
does not start Product code, live model/E2B/Sankhya calls, company-data access,
production activation, commits, pushes, PRs or merges. Keep `main` unchanged.

Use only Luna subagents, with high or xhigh reasoning. Root is the integrator;
parallel writers use isolated copies and disjoint file scopes. Review follows
the amended methods and the concrete risk, not the end of a named stage.

## Execution board

The completed [repository consolidation](tasks/repository-consolidation.md)
contains the approved cut and actual proof, including the unresolved seed mismatch
found by additional S3 checking. Return to [the first-app task](tasks/builder-first-app.md). Do not reopen a
whole-platform design or require a purge of all historical documents first.

The compiler experiment validated one fixed frontend build mechanism and the
production adapter in isolated runs. It did not prove real Builder generation,
Registry retention, authorized Preview serving or the complete user journey.
That result predates the current Registry integration. The corrected SQL,
current-loader changes and adapter are now in the checkout and passed the
71-step current verification graph. This proves the bounded Registry unit,
not the real Builder/Preview journey. The original draft remains unchanged at
`/home/leandrotheodoro/.cache/conexus-registry-draft-iKOXtK` for provenance.

## Exact next action

Reconcile the existing Builder/Product/wire owners with the
[approved pilot delta](tasks/builder-first-app.md#internal-pilot-refactoring).
The local proof now covers the session-first core without changing the UI. It
uses the exact Mastra `1.63.2` storage composition, deterministic Project
thread rebind after controller and store recreation, a different physical
sandbox, and honest terminal working-source transitions for no-code, compile
failure and retained last-good Preview. Run the configured E2B path next. Add
the Session/Turn API and app-first UI only after that live path works. Start the
real Brain experiment after create/open/continue works and its own knowledge
and authorization prerequisites are present.
The historical verifier refusal and four hash/generated-projection failures are
recorded debt, not this increment's blockers. Do not rebuild compiler, storage
or authentication without a concrete contradiction. Keep 024/025 held. No
hosting, publication, production database changes or historical-stage restart
is authorized.

## Approved local platform delivery design

This heading remains a route for older L task links. Their ordered delivery
design is historical. The smaller internal MVP above is current.
Read [the first-app agreement](tasks/builder-first-app.md#directed-mvp-consolidation)
for included and deferred behavior. Reopen a semantic owner only when the next
real consumer exposes a contradiction.

## Task reading and research protocol

Start from the current grant, index and task. Consult the
[engineering method](development/engineering-method.md) for material decisions,
[repository method](development/repository-method.md) for repository operations,
and [realization guide](development/production-realization-guide.md) for a named
implementation question. Read architecture, Mitra/Factory research or current
official/Context7 docs only for a concrete uncertainty. No mandatory global
reading or research round.

## History and routing

The published analysis snapshot is
[21f042f on the analysis branch](https://github.com/developmentconexus-ops/conexus-os/tree/21f042f551404fcf0af21252796718302b4af208).
It preserves earlier roadmap grants, phase tables and suspended candidates.
Publication did not merge or accept them. See
[snapshot verification limits](tasks/builder-first-app.md#analysis-snapshot-verification).

Current semantic decisions remain in [the decision register](decisions/index.md).
[The index](index.md) retains paths to R1/R2 proof, the unaccepted R3 candidate,
L1–L6 proposals and the original qualification receipts. Historical proof remains
true only for its named subject; no prior waiver or experiment allowance carries
forward automatically.
