# P12 — integrated scenario and edge matrix

> **Status:** `OPERATOR APPROVED / FAMILIES 1-4 + CURRENT P11 CONSUMED / P12 CLOSED`
> **Parent decision:** [`P12 cross-block identity Global Maximum`](p12-cross-block-identity-global-maximum.md)
> **Purpose:** fix exact owner/source/transport/destination custody before any bounded HTML reopen
> **Product / 4A / 4B impact:** none
> **Implementation authority:** none

## 1. Integrated Evidence spine

This spine is a proof oracle, not a shared Product store. Every value must be emitted or resolved by its named owner projection; P11 may not supply it as business truth.

| Identity | Integrated value | Primary fixture owner | Required alignment |
| --- | --- | --- | --- |
| Account | `acct-leandro` | GF-01 `AccountSummary` | T-01 established Account result projects the same Account after normal re-entry |
| Workspace | `ws-metal-nobre` | W-02A/W-02B/W-04 Workspace scope | T-01 result, GF-01 context and W-01 ingress align |
| Project | `prj-sales-ops` / Sales Operations | W-04 Project projection; common Project presentation in P blocks | W-01 emits it; P-01..P-05 and PA-01 re-resolve it where implicated |
| Baseline candidate | `cand_7f2c9e1a` | W-01 | P11 deletes the invented `sha256:baseline-candidate-42`; P-01 receives only exact source output |
| Change | `chg:fixture` | P-01 | P11 deletes `change-218`; P-04 treats it only as an honest journey boundary |
| Agent draft | `candidate:agent:1` / `draft:r1` | P-01 Agent Studio | P11 deletes `sha256:agent-candidate-19` / `draft:r2` |
| Plan / Finding / Evidence | `plan:r1` / `fd:1` / `ev:1` | P-01 | P11 transports only if emitted by the exact Change boundary |
| Agent | `agent-sales-follow-up` / `agent-rev-018` | P-03/P-01 | W-04 and PA-01 project the same exact Agent for the integrated scenario |
| Brain publication | `brain-r42` | W-02A human publication revision 42 | W-02A emits the formal ID; P-02 exposes and re-resolves the same candidate revision before explicit binding |
| Connection revision | `conn-sankhya-prod` / `rev-18` / `q-501` | W-02B | P-02 aligns the eligible Connection identity and re-resolves before explicit Project use |
| Release/environment | `rel-042` / `env-production` / pointer generation `18` | P-04 | P-01/P-03/P-05/PA-01 align only their integrated-scenario Release projection |
| Approval/AgentRun | `approval-781` / `run-1042` | P-03 PAR projection | PA-01 may project the same owner subject; P11 observes rather than invents |
| Decision digest | `sha256:7c9b-fixture` | P-03 approval projection | P11 deletes `sha256:proposal-77` |
| Effect attempt | `effect-77` with `originatingRun=AgentRun/run-1042` | P-04 Gateway projection | relation is added owner-locally; P11 no longer selects or mutates the row |

## 2. Edge dispositions

```text
CONSUMES_AND_RESOLVES
→ destination receives the exact coordinate and resolves or refuses it

HONEST_BOUNDARY
→ source coordinate may be retained as journey Evidence, but no destination entity relation is inferred

INTERNAL_ONLY
→ the complete material contribution remains inside one child; P11 transports no business coordinate
```

## 3. Final A–O matrix

| Journey / edge | Source owner event and identity | P11 transport | Destination resolution | Disposition | Invalid/stale falsifier | Bounded child scope |
| --- | --- | --- | --- | --- | --- | --- |
| A · T-01 → GF-01 | `Continue to Projects` after normal re-entry emits `acct-leandro + ws-metal-nobre + initialAccessEstablished=true` | exact Account/Workspace result only | GF-01 resolves current Account/Workspace before shell Ready | `CONSUMES_AND_RESOLVES` | sealed/old bootstrap, 401/403/404 or undisclosed Workspace never mounts false Ready | T-01 egress; GF-01 ingress |
| A · GF-01 → W-01 | Projects route emits current disclosed `ws-metal-nobre` | Workspace coordinate | W-01 resolves the Workspace Project collection | `CONSUMES_AND_RESOLVES` | unknown/denied Workspace does not show default collection | GF-01 egress; W-01 ingress |
| B · W-01 → P-01 | exact approval emits `prj-sales-ops + cand_7f2c9e1a` | Project + candidate digest | P-01 resolves the Project/approved Baseline context; no Change is created by navigation | `CONSUMES_AND_RESOLVES` | stale digest preserves reviewed candidate and blocks false Build continuation | W-01 egress/fixture; P-01 ingress |
| C · P-01 → P-04 | verified Change boundary emits `prj-sales-ops + chg:fixture` and exact optional Plan/Finding/Evidence refs | Project + Change context | P-04 resolves Project Releases independently and selects no Release from Change | `HONEST_BOUNDARY` | unknown/stale Change yields an explicit unresolved boundary, never a fabricated Release | P-01 egress; P-04 boundary ingress |
| D · W-02A Discovery | explicit local Project selection | none | W-02A owns Discovery→proposal locally | `INTERNAL_ONLY` | no Project means Discovery cannot run | no exclusive delta beyond integrated Project fixture |
| E · W-02A → P-02 | Publish emits `prj-sales-ops + brain-r42` | Project + Brain revision | P-02 resolves `brain-r42`, presents it as candidate and still requires explicit bind | `CONSUMES_AND_RESOLVES` | unknown/denied/unavailable revision leaves binding unchanged | W-02A Project/publication egress; P-02 Brain ingress |
| F · W-02B → P-02 | qualification emits `conn-sankhya-prod + rev-18 + q-501` | Project + Connection/revision/qualification | P-02 resolves eligibility/current qualification before explicit Use/adopt | `CONSUMES_AND_RESOLVES` | stale revision/NEEDS_RETEST/412 preserves prior binding; no automatic adoption | W-02B qualification egress; P-02 Integration ingress |
| G · P-02 Product inspection | Data/Capabilities/Analyze owned locally | none | P-02 owns all reads/states | `INTERNAL_ONLY` | denied/empty/dependency stay owner-specific; Capability detail never invokes | no exclusive cross-edge delta |
| H · P-04 → P-05 | current serving projection emits `prj-sales-ops + rel-042 + env-production + generation 18` | Project + Release context; no launch URL | P-05 resolves current Project and active-Release role consequences independently | `CONSUMES_AND_RESOLVES` | stale generation/pointer or denied access does not grant app access | P-04 serving egress; P-05 ingress |
| H · P-05 → PA-01 | exact successful app-access result emits Account/Project/Release/Agent scenario coordinates | review-harness deep link only | PA-01 performs IAM-13 recheck for `acct-leandro/prj-sales-ops/rel-042/agent-sales-follow-up` | `CONSUMES_AND_RESOLVES` | 401/403/404/session expiry uses PA recovery and never inherits CP authority | P-05 access egress; PA-01 IAM-13 ingress |
| I · W-04 → P-03 | `Open Agent` emits `ws-metal-nobre + prj-sales-ops + agent-sales-follow-up` | exact three coordinates | P-03 resolves and opens that Agent; no default fallback | `CONSUMES_AND_RESOLVES` | unknown/undisclosed Agent shows 403/404 and no arbitrary detail | W-04 integrated catalog item/egress; P-03 ingress |
| I · P-03 → P-01 | native New/Edit emits `prj-sales-ops + origin + agentId?` | exact native child URL | P-01 resolves Project/Agent and enters the same Agent Studio Change path | `CONSUMES_AND_RESOLVES` | missing Agent or denied build yields no editor/draft | P-03 ingress/egress coherence; P-01 existing ingress extended with Project |
| I · P-01 → P-04 | verified Agent Change emits Project/Change | boundary context only | P-04 independently resolves Releases | `HONEST_BOUNDARY` | no Change→Release inference | same C delta |
| J · PA-01 use | Conversation/question/new AgentRun remain PA-01/PAR-local | none | same child owns Conversation and Run | `INTERNAL_ONLY` | stale question rejected; admitted/completed/stream remain distinct | PA-01 integrated ingress/fixture only |
| K · P-03 → P-04 | actual selected approval/run emits `approval-781 + run-1042 + sha256:7c9b-fixture` and `originatingRun=AgentRun/run-1042` | originatingRun and decision coordinates; never `effectAttemptId` | P-04 filters its owner fixtures by originatingRun before rendering/pagination | `CONSUMES_AND_RESOLVES` | unknown/stale run yields explicit filtered empty; never unfiltered fallback | P-03 exact decision/run egress; P-04 owner relation + ingress |
| K · PA-01 → P-04 | app-scoped decision projects the same PAR owner subject when this alternative is exercised | same originatingRun envelope | same P-04 Gateway path | `CONSUMES_AND_RESOLVES` | stale/revoked decision preserves subject but emits no actionable transition | PA-01 decision egress; P-04 same ingress |
| L · P-04 managed jobs | catalog/history/detail/run-now use P-04 current served Release | none | P-04 owns the complete flow | `INTERNAL_ONLY` | conflict/denied produces no fake JobRun | covered by P-04 integrated Release fixture |
| M · P-05 duplicate | `NO_DATA` result without owner-issued destination Project | no destination coordinate | explicit terminal boundary | `HONEST_BOUNDARY` | P11 must not manufacture Workspace/Project | P-05 boundary marker/proof only |
| N · platform contribution | no Product UI | none | `FUTURE_PRODUCT_APP` disposition | `INTERNAL_ONLY` | Budget Analyzer application UI remains absent | none |
| O · P-01 → W-02A | maintenance Change ends before separately governed learning | Workspace/Project navigation only; no Change→Brain relation | W-02A begins explicit Project-scoped Discovery/governance | `HONEST_BOUNDARY` | Change never authorizes Brain publication | P-01 boundary; W-02A Project ingress |
| O · W-02A → P-02 | reuse E publication event | same as E | same explicit P-02 bind path | `CONSUMES_AND_RESOLVES` | binding unchanged on invalid revision | reuse E delta |

## 4. Exact bounded reopen set

The matrix implicates twelve locked children:

```text
T-01 / GF-01 / W-01 / W-02A / W-02B / W-04
P-01 / P-02 / P-03 / P-04 / P-05 / PA-01
```

This is not blanket authority to redesign twelve blocks. In each artifact only these regions may reopen:

```text
deterministic integrated fixture identity
source event / egress marker
destination query / ingress parsing
owner-local resolution
unknown / stale / denied ingress state
edge-specific falsifier hook
```

All existing layout, information hierarchy, ordinary controls, owner states, accessibility, responsive structure, Screen Contract semantics and P10 patterns remain locked unless the exact edge falsifier proves otherwise.

W-03 owns no implicated cross-block identity edge and remains byte-preserved.

## 5. Assembly law after correction

P11 may own only:

```text
journey + step
active block
edge allowlist
transported owner-issued coordinates
mount/failure/review state
```

P11 must not own:

```text
business-coordinate defaults
cross-owner fixture relations
destination row selection
child business-state mutation
authorization
normalized Product store
```

The current `C` business-coordinate registry and `injectOriginatingRunFilter` DOM mutation must disappear. Initial scenario entry begins from the T-01 owner result or an explicitly labeled direct-review ingress, never from an invented universal identity map.

## 6. Behavioral proof

For every material edge, the proof asserts:

```text
source child event identity
= adapter envelope
= P11 URL coordinate
= destination child ingress
= destination owner projection or admitted honest boundary
```

Negative controls must fail when:

- P11 transports a value not emitted by the source;
- the destination ignores a required ingress and shows a default fixture;
- unknown/stale coordinates fall back to Ready;
- parent code inserts, hides or stamps child business rows;
- qualification auto-adopts, publication auto-binds or Change infers Release;
- PA-01 inherits Control Plane authorization/recovery;
- an edge button is inert;
- a lexical test passes without operating the boundary.

The test mechanism remains an Evidence choice and must be the smallest deterministic localhost driver sufficient for same-origin iframe behavior. It is not a 4D Product framework/runtime selection.

## 7. Execution order

```text
FAMILY 1 — A/B / identity establishment
T-01 → GF-01 → W-01 → P-01
→ bounded deltas → targeted proof → operator re-lock

FAMILY 2 — E/F/O / governed context adoption
W-02A + W-02B → P-02
→ publication != binding
→ qualification != adoption
→ targeted proof → operator re-lock

FAMILY 3 — H/L/M / serving, access and app entry
P-04 → P-05 → PA-01
→ active Release/access/IAM-13 continuity
→ NO_DATA boundary preserved
→ targeted proof → operator re-lock

FAMILY 4 — I/J/K / Agent discovery, authoring, use and effects
W-04 → P-03 → P-01 / PA-01 → P-04
→ Agent/Run/approval/originatingRun continuity
→ targeted proof → operator re-lock

FINAL ASSEMBLY
transport-only P11
→ all-edge behavioral proof
→ exact new child/P11 blobs
→ operator P11 re-lock
→ P12 re-entry
```

P-01/P-04/PA-01 participate in more than one family. Their deltas should be accumulated carefully and re-locked once after all approved edge obligations affecting that artifact are present, unless a material intermediate walkthrough is needed to prevent unsafe batching.

## 8. Stop conditions

Stop the affected family if:

- a required identity relation has no Product/wire owner;
- a destination would need frontend-derived authorization or a new Product operation;
- aligning a fixture would change Product meaning rather than Evidence projection;
- a test mechanism requires selecting Product runtime/SDK architecture;
- unrelated locked interaction structure would have to change.

Route such a finding to the smallest owner before continuing. Do not patch around it in P11.
