# RB — first observable Builder vertical stage code packet

Status: `OPEN / OPERATOR AUTHORIZED / IMPLEMENTATION IN PROGRESS`

## Observable outcome and invariant

From an existing Project with an approved Baseline, a human can submit one
nonblank build instruction. Conexus durably creates exactly one Change and its
minimum Plan, admits exactly one serial writer, performs coding only in an
explicit E2B remote sandbox through the Conexus-owned `CodingWorkerRuntime`
port, takes custody of an exact Git candidate descended from the pinned source,
and exposes Hub-owned progress, execution detail and diff in the Project Build
experience.

Mastra, E2B, the model and worker output are mechanics/Evidence only. None may
accept a Change, mutate Hub state directly, gain Hub/Project DB or Git-remote
credentials, or turn narration/sandbox completion into an owner transition.

## Exact envelope

- Product operations: `BLD-03`, `BLD-04`, `BLD-06`, `BLD-07`, `BLD-17`;
  `BLD-01/02` may be included only where needed to reopen the current Change.
- Owners: Builder owns Change/Plan/WorkUnit/ActorRun and settlement; Project
  supplies the exact approved Baseline/current source; Git custody owns source
  and candidate identity; I&A supplies current `project.build` and
  `project.source.read`; the browser projects owner truth.
- Runtime: `@mastra/core@1.63.2` native coding agent behind
  `CodingWorkerRuntime`; `@mastra/e2b@0.11.0` + `e2b@2.46.1`; no local-host
  fallback, ACP, private MCP or guest provider credential.
- Data: one Builder-owned schema/migration with idempotent Change creation,
  immutable base identity, one Plan item, one WorkUnit, one ActorRun and exact
  candidate/result coordinates. One lineage has at most one admitted writer.
- UI: the existing Project surface gains a human-facing Build composer and
  current Change progress/result/diff disclosure; runtime internals remain
  progressive technical detail.

## Failure behavior and forbidden effects

- Missing/stale Project, approved Baseline, source identity, current authority,
  runtime configuration or E2B identity fails closed before write settlement.
- ActorRun admission is immutable and binds Project, Change, WorkUnit, base
  source, runtime identity and physical sandbox incarnation.
- Cancellation/replacement makes later output ineligible. Sandbox death never
  retries a write on a replacement incarnation.
- Candidate custody accepts only one Git commit whose first parent is the exact
  base. Existing changed paths must be `APP-OWNED`; normalized non-conflicting
  new paths become application-owned. Canonical Project `main` and every Git
  remote remain unchanged.
- Guest environment contains no Hub DB, Project DB, Connection, credential
  backend, Git remote write or model-provider credential.

## RED falsifiers and proof

Targeted production-module tests must demonstrate refusal of: idempotency
payload mismatch; missing authorization/Baseline; concurrent writer; wrong
Project/Change/base/run/incarnation; runtime-reported owner settlement; local
sandbox/runtime; ambient secret material; stale or late result; replacement
sandbox output; non-descendant/multi-commit candidate; protected-path edit; and
guest attempt to update a remote.

Nominal tests cover durable creation, derived Plan, admitted transition order,
candidate custody, exact diff and browser trigger/inspection. A fake runtime
proves only Hub orchestration. A real E2B/model run is required before claiming
the remote coding journey itself proven.

## Completion and non-goals

The increment is a candidate when the production composition exists, targeted
negative/nominal tests are green, a real authorized remote run is green when
credentials are available, and the applicable clean Linux workflow floor is
green. It does not accept the Change, merge source, release/deploy, add generic
workflow/eval/telemetry infrastructure, implement `BLD-05/08..16/18..20`, add
concurrent writers, or open R3.

Reopen only on a material Product/owner contradiction, persistent-data or Git
custody conflict, exact Mastra/E2B capability failure, security-isolation
falsifier, or objective required-CI regression attributable to this slice.
