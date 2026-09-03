# 4D(RB) — Builder runtime admission and stage-planning packet

> **Status:** `RB PLANNING PACKET / CURRENT STAGE, AUTHORIZATION AND NEXT ACTION OWNED ONLY BY docs/roadmap.md`
> **Current checkpoint:** `fd6f771be45102009f1887afaa9fc8a7e487e777`
> **Planning grants:** RB-A0 operator confirmation and RB-C0 operator authorization
> on `2026-09-03`
> **Product operation tranche:** `PRJ-29 + BLD-01..17` (`18` operations)
> **Runtime families:** `RF-09 + RF-10 + RF-11 + applicable RF-12`
> **First measurable outcome:** an adjudicable, equal-envelope Builder probe and
> Worker Eval grant; no Product or dependency mutation

## 1. Grant boundary

This packet opens only RB planning. It freezes the smallest current selection,
proof and blocker surface before any Product byte, dependency change or live
external execution. It does not select a Builder runtime, E2B adapter, ACP
agent, model, provider, evaluation platform, database shape or implementation
file graph.

RB implementation remains blocked until all of these are separately closed:

```text
4D-C(RB) exact source/dependency/runtime selection and admitted probes
→ 4D-D(RB) conformance and version-escape contract
→ 4E(RB) composed Product coherence
→ 4F(RB) exact file/data/slice/proof graph
→ 4G(RB) adversarial implementation readiness
→ recoverable checkpoint
→ explicit RB execution grant
```

The current RB-C0 grant authorizes repository analysis, exact candidate repins
and qualification/evaluation design Evidence only. It authorizes no install,
package/version change, model/provider call,
E2B sandbox creation, external coding-agent process, Product route, migration,
browser Product implementation, streaming surface, external OCI/input custody,
deployment, commit, push, PR or merge.

## 2. Exact Product and authority boundary

The RB operation census is closed for planning at exactly:

```text
PRJ-29
BLD-01, BLD-02, BLD-03, BLD-04, BLD-05, BLD-06, BLD-07, BLD-08, BLD-09
BLD-10, BLD-11, BLD-12, BLD-13, BLD-14, BLD-15, BLD-16, BLD-17
```

| Surface | Exact RB meaning | Permission / idempotency law |
| --- | --- | --- |
| `PRJ-29` | finite Project-owned model-policy summaries, human purpose, server default and bounded sampling envelope | ordinary `project.read` or purpose-bound `project.build`; `IC0`; no provider/model/runtime selection |
| `BLD-01..04`, `BLD-06`, `BLD-10`, `BLD-16..17` | Change/detail/Plan/progress/Preview/context/execution-detail reads plus idempotent Change creation | `project.build`; reads `IC0`; `BLD-03` `IC3` |
| `BLD-05`, `BLD-11..15` | exact Plan checkpoint, Finding and Evidence review | `project.review`; reads `IC0`; decisions `IC2` |
| `BLD-07..09` | exact immutable/current diff, tree and file coordinates | `project.source.read`; `IC0` |

The canonical paths remain those in `builder-paths.yaml` and the PRJ-29 entry in
`project-paths.yaml`. Generated server/client projections may consume them only
after 4F closes the exact mutation graph; generated artifacts own no semantics.

`BLD-18..20` Product-Agent draft operations are explicitly outside RB. R2,
Published-App Product Agents, MAR, Release and later-tranche operations are also
outside this packet.

## 3. Observable RB outcome and owner law

RB must make one Project Baseline evolvable through one human-recognizable
Change without allowing a model, runtime, sandbox, protocol, trace or verifier
to become authority:

```text
approved Project Baseline/current source
→ human-authored Change intent
→ current Plan + exact checkpoint decisions
→ serial Hub-admitted WorkUnit/ActorRun execution
→ exact candidate lineage + diff + Preview
→ fresh independent verification
→ typed Finding/Evidence correction loop
→ current-owner acceptance only
```

Builder owns Change, Plan, WorkUnit, ActorRun, Finding/Evidence routing and
acceptance. Project owns Baseline, model-policy summaries and Project source.
Git custody owns exact source/result lineages. I&A owns human authority. The
CodingWorkerRuntime owns open-ended coding mechanics only. The guest is
untrusted execution. Evaluation and ordinary telemetry are Evidence only.

The lifetime mapping is mandatory and non-collapsible:

```text
Change != CodingSession != WorkUnit != ActorRun != physical sandbox
```

The first topology is serial by default. One persistent CodingSession may serve
one Change, but every ActorRun re-enters through current Hub authority and exact
base/candidate/context/tool/budget pins. Runtime or protocol completion cannot
advance Change or WorkUnit state without Hub admission and settlement.

## 4. Candidate set kept open by 4D-C

The required equal-envelope comparison is:

1. **Native Mastra incumbent** — exact admitted `@mastra/core` coding-agent and
   `AgentController` mechanics behind the Conexus `CodingWorkerRuntime` port,
   with an explicit guarded remote Workspace rather than default local host
   execution.
2. **Mastra host + ACP challenger** — an exact-pinned ACP-compatible coding
   agent behind the same port and owner envelope. ACP process/session/status,
   permission choices and output remain untrusted adapter facts.
3. **Private MCP alternative** — admitted only if a concrete candidate shows a
   material advantage or is required to expose bounded Conexus capabilities to
   the selected hosted worker. It is not a mandatory third implementation.

The repository's mechanical probe of `@mastra/core@1.63.2` proves only that a
coding Agent, AgentController modes, persistent settings, skills, display state
and bounded tools can be assembled without model or E2B execution. It does not
select the native topology or prove capable Builder quality.

Exact installed Mastra documentation adds four deciding cautions:

- `createCodingAgent()` defaults to host `LocalSandbox` unless Workspace is
  explicitly replaced; that default is inadmissible for write-capable RB work;
- a static Workspace can be shared across requests, while resolver-backed
  sandboxes are application-owned and require explicit destroy/cache cleanup;
- `Agent.generate()` exposes abort, approval, concurrency and structured-output
  mechanics, but those signals are not owner cancellation, quiescence or typed
  settlement by themselves;
- ACP defaults can keep a child process/session alive, fall back to a local
  Workspace and choose the first permission option when no handler is supplied;
  all three defaults require explicit Conexus override or refusal.

Current documentation is candidate Evidence only. Exact adopted package/source,
lockfile, executable, protocol revision, model, provider and E2B identities must
be repinned and admitted at the time of the authorized probe.

## 5. Protected-claim census

RB closure may claim only the following frozen families, each against its exact
owner and proof subject:

| Claim family | Frozen claim |
| --- | --- |
| `RUN-05`, `RUN-07` | real Builder owner/runtime/E2B boundary exists; only exact Builder Mastra surfaces are admitted |
| `CMP-01..07` | Hub-admitted implementer plus fresh independent verifier; typed correction loop; least privilege; adapter equivalence; serial default; equal-envelope Worker Eval selection |
| `IOP-01..04`, `IOP-06..07` | protocol material is untrusted and never owner truth; current authority is rederived; cancellation/HITL cannot widen or settle; revisions are pinned |
| `EVA-01..07` | exact versioned trial identity, mechanical item gates, honest missingness, repeated paired trials, isolation, calibrated scorer identity and owner-only selection |
| `TEL-01..02` | observation is correlation only; sampling/redaction/drop/export/missingness is explicit |
| `VER-01..06`, `VER-10` | proportional real gates, real dependencies for real claims, missing Evidence is not PASS, RED controls fire, exact dependency provenance and bounded SHARE detectors |
| `SCF-04`, `SCF-09..11`, `CON-04` | app-owned source survives evolution; current authority/impact/constraints are deterministic deny-only projections; Builder cannot edit protected seams |

No aggregate quality score may compensate for a security, authority, custody,
isolation or non-firing-negative-control failure.

## 6. Required RED falsifiers

The probe and Worker Eval design is inadmissible unless it contains mechanical
RED cases for at least:

1. runtime/subagent/protocol success attempting to accept Change or settle
   ActorRun/WorkUnit;
2. verifier receiving implementer continuation, stale material, or write access;
3. missing/stale/wrong-scope context, Project authority, Baseline or candidate
   digest;
4. guest access to Hub DB, provider, Git-remote write, credential backend,
   sibling Workspace/Project, or undeclared network/tool;
5. recursive spawn, unbounded depth/steps, or concurrent writers on one lineage;
6. cancellation/disconnect followed by late output or false quiescence;
7. physical sandbox death followed by attempted write replay on a replacement
   sandbox ID;
8. malicious ACP/MCP description, result, artifact, path or permission option;
9. revoke-after-discovery, stale/wider approval subject, protocol downgrade or
   mixed incompatible wire revision;
10. missing result/score/trace, scorer error/drop, non-firing control, hidden
    failing item, unequal envelopes or best-of-k selection;
11. app-owned source overwrite, protected-seam edit, generated semantic drift or
    stale deciding-authority projection;
12. mocked proof offered for real E2B, provider/model, database, browser, process
    loss or Git-custody claims.

Any one of these produces `FAIL`, `NOT_PROVEN` or an explicitly bounded open
claim. It can never be averaged into PASS.

## 7. Exact proof classes and production-subject law

| Claim | Minimum proof subject |
| --- | --- |
| operation ownership, permissions, current-state and persistence | production-composed Builder/Project/I&A modules with real PostgreSQL and generated wire drift checks |
| candidate/source/result lineage and app-owned preservation | production Git custody adapter and real repositories at exact commits/digests |
| guest isolation, lifecycle, replacement and cancellation | exact admitted real E2B package/template/API behavior plus Hub physical-incarnation guard |
| capable coding, second-turn evolution and correction loop | real model/provider against equal, repeated, private Worker Eval tasks |
| browser/Preview truth | production-composed web/Hub candidate with real browser and exact current source/Change coordinates |
| ACP/private-MCP safety | exact executable/package/protocol revision and malicious-boundary fixtures plus real cancellation/revocation runs |
| ordinary observation | production run correlation with explicit loss/drop/redaction controls; no generic Observability Product owner |

A fixture may prove parser, adapter or harness mechanics. It cannot prove
production composition, real dependency behavior, capable Builder quality or
end-to-end owner settlement.

## 8. Worker Eval envelope

Both required candidates receive identical pinned task intent, starting source,
Baseline/profile, context/constraints, tool and network capability, model/provider
class, budget, time limit, intervention rules, verifier rules and proof gates.
Every trial has a fresh evaluation identity and isolated resource/thread/
Workspace.

The private versioned corpus must include:

- greenfield Budget Analyzer vertical slice;
- second-turn semantic change with obsolete artifact retirement;
- complex bug/root-cause correction;
- schema/migration change;
- frontend/browser behavior;
- Sankhya integration change using only an authorized controlled proof surface;
- process loss, re-entry and output custody;
- protected-seam/authority bypass attempt;
- verifier Finding → correction → complete revalidation.

Repeated paired trials report accepted correctness and defects first, then
negative controls, rework/intervention, maintenance stability, recovery/custody,
cost, latency and model/runtime usage. If Evidence cannot distinguish the
candidates, the selection remains open; no winner is manufactured.

## 9. Planning parts and gates

| Part | Outcome | Mutation ceiling | Exit condition |
| --- | --- | --- | --- |
| `RB-A0` | this bounded planning packet | roadmap, index and 4D Evidence only | operation/claim/blocker/proof/non-goal census is adjudicable |
| `RB-C0` | exact candidate, source, dependency, executable, protocol and E2B pin manifest plus probe design | 4D Evidence/qualification metadata only; no install or call | provenance/license/security/support and equal-envelope matrix independently reviewable |
| `RB-C1` | operator-approved bounded mechanical and live-dependency probe | only exact qualification paths named by a separate grant | required lifecycle/isolation/protocol RED controls fire; no Product claim |
| `RB-C2` | operator-approved real Worker Eval | only exact isolated evaluation inputs/results named by a separate grant | repeated paired candidate Evidence is complete and honest |
| `RB-C3` | 4D-C runtime/adaptor/eval selection and independent adjudication | selection Evidence only | one candidate selected or selection explicitly remains open |
| `RB-D` | 4D-D conformance/version-escape contract | contract and Evidence only | claims, version escapes and negative controls are closed for composition |

`RB-C0..C3` are planned identifiers, not grants. External-input custody and
credentials remain operator-supplied or separately admitted; the planning agent
must not discover, create or infer them.

RB-C2 compares admitted coding-runtime adapters in a qualification harness over
isolated task repositories. It does not require or claim an already implemented
production Builder owner, database or settlement path. Production ownership,
authorization, persistence and settlement claims remain reserved for the later
4F/implementation subject and cannot be proved by the Worker Eval.

## 10. Frozen blocker census

RB cannot advance into implementation while any of these remains open:

1. exact current Mastra source/package/runtime identity and support/provenance
   admission for native and host roles;
2. exact ACP challenger executable/package/version/model interface and pinned ACP
   revision, including deny-by-default permission handling;
3. exact E2B SDK/integration/template identity and a Hub-owned physical-incarnation,
   lifecycle, network, credential, account-resource custody and late-output
   adapter contract;
4. deny-by-default ACP agent-to-client capabilities, with no control-plane
   filesystem or terminal action during the RB-C1 handshake;
5. exact server-side model/provider identities, model-policy mapping, credentials,
   usage/cost capture and approved live-call ceiling;
6. exact equal-envelope Worker Eval dataset, repetitions, scorers, hard gates,
   falsifiers and immutable Evidence identities;
7. explicit grants for every live E2B, provider/model, browser, database, Git or
   Sankhya proof class;
8. 4D-C independent review and operator selection/adjudication;
9. 4D-D, 4E(RB), exact 4F(RB) module/file/data/migration/slice graph, 4G(RB),
   checkpoint and execution grant.

The repository currently has no production Builder module, Builder migration,
E2B dependency or ACP dependency. That absence is expected at this gate and is
not authority to add them. The exact physical mutation envelope belongs to
4F(RB), after selection and composition close.

## 11. Non-goals

- `BLD-18..20`, Product-Agent authoring/runtime, PAR or advanced memory;
- R2 Brain/Connections/Gateway implementation;
- concurrent writers, dynamic agent fleets, generic Mission/Workflow ownership,
  internal A2A or a generic policy/eval/telemetry platform;
- release, deployment, production, external OCI/input custody or broad Sankhya
  access;
- Product streaming or browser-direct model/runtime/sandbox authority;
- dependency installation, Product implementation or Git publication under this
  packet.

## 12. RB-A0/RB-C0 historical Evidence

`RB-A0` is complete when repository checks confirm this packet and roadmap/index
routing are internally consistent. Completion means only that the selection
question is bounded; it is not 4D-C approval and grants no probe or implementation.

The WSL Ubuntu planning checks passed on `2026-09-03`: `git diff --check`, fresh
`conexus-preflight`, `npm run repository:check` and `npm run verify`. Existing
OpenAPI lint warnings remained non-failing and no Product or dependency path was
mutated.

The operator authorized `RB-C0` on `2026-09-03`. That bounded pass materialized:

- [`4d-rb-c0-candidate-pin-manifest.json`](4d-rb-c0-candidate-pin-manifest.json),
  exact candidate/source/dependency/executable/protocol/model/E2B candidate
  identities with unknowns and admission stops explicit;
- [`4d-rb-c0-worker-eval-and-probe-design.md`](4d-rb-c0-worker-eval-and-probe-design.md),
  the owner-neutral adapter envelope, RB-C1 RED matrix and repeated paired RB-C2
  Worker Eval design;
- [`4d-rb-c0-independent-review-brief.md`](4d-rb-c0-independent-review-brief.md),
  a neutral whole-package review input; and
- [`4d-rb-c1-live-probe-grant-request.md`](4d-rb-c1-live-probe-grant-request.md),
  a separate request that remains `NOT AUTHORIZED`.

The authorized round-1 review is recorded in
[`4d-rb-c0-independent-review-round-1-adjudication.md`](4d-rb-c0-independent-review-round-1-adjudication.md).
AGY completed with one material `BLOCKED` finding: the original request could
execute the unproven OpenCode binary on the control plane. The Lead accepted the
finding and corrected RB-C1 so the no-model executable probe can run only in a
dedicated credential-free E2B sandbox through a bounded ACP relay. Fable
returned HTTP 429 with no report, so round 1 did not converge.

RB-C0 still does not admit or install its pins. The corrected package passed
fresh WSL preflight, JSON parsing, `git diff --check`, repository checks and the
full `npm run verify` on `2026-09-03`.

Round 2 used one fresh operator-authorized Opus substitution lane, explicitly
recorded as Opus rather than Fable. Opus returned material findings. The fresh
AGY attempt canceled before repository inspection because headless `read_file`
permission was denied and produced no report. Lead adjudication accepted the
bounded ACP client-capability, E2B account-resource custody and environment-
identity corrections while rejecting a claimed RB-C2 circularity. See
[`4d-rb-c0-independent-review-round-2-adjudication.md`](4d-rb-c0-independent-review-round-2-adjudication.md).

Current stage, authorization and exact next-action truth is intentionally not
duplicated here; read `docs/roadmap.md`. This packet itself grants no external
execution, installation, Product mutation or Git effect.

## 13. Deciding authority and Evidence

- `docs/roadmap.md`
- `docs/evidence/4d/4d-r1-operation-reachability-map.md`
- `docs/product/operation-ledger.md`
- `docs/product/permission-contract.md`
- `contracts/api/product/project-paths.yaml`
- `contracts/api/product/builder-paths.yaml`
- `docs/reference/builder-and-harness.md`
- `docs/evidence/4d/4d-01-protected-property-ledger.md`
- `docs/evidence/4d/4d-03-paved-road-property-contract.md`
- `docs/evidence/4d/4d-04-runtime-family-applicability.md`
- `docs/evidence/4d/4d-c02r-builder-capability-falsifier-adjudication.md`
- `docs/evidence/4d/4d-c02r-current-mastra-builder-capability-probe.md`
- `docs/evidence/4d/4d-opp-c03-agent-composition-and-protocols-study.md`
- `docs/evidence/4d/4d-opp-c04-evaluation-trace-intelligence-observability-study.md`
- exact installed `@mastra/core@1.63.2` embedded documentation and current
  Context7 Mastra/E2B documentation, as non-authoritative mechanism Evidence
