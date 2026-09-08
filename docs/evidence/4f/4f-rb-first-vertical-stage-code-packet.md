# RB — first observable Builder vertical stage code packet

Status: `OPEN / OPERATOR AUTHORIZED / IMPLEMENTATION CANDIDATE`

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
- Model: one server-owned `BUILDER_CODING` admission is selected from the finite
  shared closed Project deployment catalog and frozen on ActorRun admission. The current
  default may be Anthropic/Opus, but Builder runtime code is not tied to the
  Project Inception admission; browser/model output cannot select provider,
  model, endpoint or credential. The catalog entry shape is
  `admissionId + providerKey + exact modelId + officialHttpsOrigin +
  credentialSlot + capabilitySet + enabled`. Credential slots reuse the
  Project server-side external-slot file and never enter the guest.

The E2B template source is `scripts/rb-builder-e2b-template.mjs`. It pins the
Node `24.20.0` Bookworm-slim OCI index by digest, installs only the Git/TLS
mechanics required by this vertical, copies no Project bytes or credentials at
build time, runs as root only inside the credential-free disposable guest, and
derives its human build tag from the canonical recipe hash.
`npm run rb:e2b:template:check` is local and effect-free. The external build is
separately guarded by `CONEXUS_RB_E2B_TEMPLATE_BUILD=true` and reads the E2B
key only from the owner-only file named by
`CONEXUS_BUILDER_E2B_API_KEY_FILE`. The build assigns a unique
`build-<buildId>` tag and emits `templateId:build-<buildId>` as
`runtimeTemplateRef`; that exact ref, rather than a mutable human name/default
tag, is the value admitted by the Hub runtime.

The authorized live build on `2026-09-07` produced recipe digest
`3979a94f69948d972c7021ba30aac2ece3a590557fbed79bb27a0c87bfb0e0ab`,
template `refny0yzdr3kend4t50u`, build
`b62f8103-b206-481f-a0c0-f56c8ebb5205`, and exact runtime ref
`refny0yzdr3kend4t50u:build-b62f8103-b206-481f-a0c0-f56c8ebb5205`.
The real sandbox proved Node `24.20.0`, Git `2.39.5`, writable `/workspace`,
no provider/API-key/token/secret/database/Conexus credential variables, and a
stored deny-all policy. The guest retains only E2B's exact non-secret template,
sandbox and events-address mechanics. A raw TCP
connect initially appeared to contradict isolation but was an invalid proxy-
boundary probe: the deciding paired TLS/HTTP control received `ECONNRESET`
under deny-all and HTTP `301` only in the explicitly internet-enabled control.
Both sandboxes were killed. `npm run rb:e2b:template:live` preserves this exact
negative/positive proof and remains explicitly external rather than part of
ordinary local verification.

The deployment format is `conexus-model-admission-catalog/v1`. The existing
R1 entry must carry `PROJECT_INCEPTION` and `BASELINE_EXPLANATION`; a Builder
entry carries `BUILDER_CODING`. `CONEXUS_PROJECT_MODEL_CATALOG_FILE` names this
single non-secret catalog and `CONEXUS_BUILDER_MODEL_ADMISSION_ID` selects the
Builder entry. `CONEXUS_GIT_EXTERNAL_FILE_SLOTS_FILE` maps each catalog
`credentialSlot` to its restrictive-permission OAuth token file. Deployments
using the former R1 singleton entry shape must update that file before restart;
there is no silent legacy normalization or second Builder catalog.
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
real admitted-OCI candidate custody, exact diff and browser trigger/inspection.
PostgreSQL negatives fire for idempotency mismatch, missing authorization and
Baseline, a second writer, revoked authority, stale Baseline and late/replaced
settlement. Model negatives fire for unknown/disabled or duplicate admission,
mutable or registry-unknown model, wrong purpose/provider/origin, absent
credential slot and missing/malformed/unsafe credential file. The credential is
revalidated immediately before remote sandbox creation;
the selected non-secret identity is persisted with the ActorRun. A fake runtime
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
