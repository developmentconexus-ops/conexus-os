# 4E(R1) — Composed Product coherence candidate

> **Status:** `CLOSED / OPERATOR APPROVED / INDEPENDENT CONVERGENCE CLEAR`
> **Scope:** `R1 / 13 OPERATIONS / ACCOUNT → APPROVED PROJECT BASELINE`
> **Implementation authority:** `0`

## 1. Product outcome

R1 must let one authorized human safely reach this usable outcome:

```text
authenticate
→ establish Conexus Account/session
→ create/read first Workspace
→ create/read Project from explicit source mode
→ establish exact canonical Git source revision through GitInfra
→ run Inception from human intent
→ inspect and re-enter exact immutable candidate
→ ask Conexus about that exact candidate
→ approve the exact reviewed digest
→ read the approved Baseline
→ end the session
```

This is a real Product foundation: the human finishes with one approved Project
Baseline that the next R2/RB slices consume immediately.

## 2. Exact operation closure

| Step | Operation | Owner result |
| --- | --- | --- |
| bootstrap once | `IAM-03` | first durable Account only from exact trusted bootstrap subject |
| enter/read self | `IAM-01` | current Conexus Account/session truth |
| create Workspace | `WS-01` | exact named Workspace and initial authority |
| re-enter Workspace | `WS-02` | current Workspace disclosure |
| discover Projects | `PRJ-01` | only Projects currently visible in exact Workspace context |
| create Project | `PRJ-03` | Project + initial grant + canonical NEW/EXISTING_GIT source bootstrap atomically |
| re-enter Project | `PRJ-02` | exact current Project disclosure |
| investigate/refine | `PRJ-07` | new immutable candidate from intent or exact prior candidate + feedback |
| reload candidate | `PRJ-23` | exact immutable candidate by digest |
| understand candidate | `PRJ-24` | candidate-bound answer/provenance; no mutation or approval |
| approve | `PRJ-09` | exact reviewed candidate becomes current approved Baseline |
| read approved truth | `PRJ-08` | exact approved Baseline disclosure |
| leave | `IAM-02` | opaque Conexus session invalidated |

All `13/13` R1 operations have one necessary consumer. No R2, RB or later
operation is pulled forward.

The independently found source/authority omissions are closed by the
[GitInfra and first-authority correction](4e-r1-gitinfra-and-bootstrap-correction.md):
the sole configured bootstrap identity derives F1 `platform_operator` after
normal Account/session mapping; WS-01 establishes membership + `project.create`;
PRJ-03 establishes the direct grant + `project.read/manage` and one canonical
Git revision before it can succeed.

## 3. Three representative flows

### A. First-use success

```text
exact Keycloak identity
→ one-shot IAM-03 bootstrap
→ IAM-01
→ WS-01/02
→ PRJ-03 NEW + local canonical Git initial commit
→ PRJ-07
→ PRJ-23 + PRJ-24
→ human reviews
→ PRJ-09 exact digest
→ PRJ-08
```

Example: “criar um sistema de análise de orçamentos” produces candidate
`baseline-42`. The question “por que vendedores estão no MVP?” is answered only
from `baseline-42`. Approval succeeds only while that same digest and current
authority remain valid.

### B. Normal return and refinement

```text
normal Keycloak login (no bootstrap)
→ IAM-01
→ WS-02 + PRJ-01/02
→ PRJ-23 exact prior candidate
→ PRJ-07(prior digest + explicit feedback)
→ new immutable candidate; prior unchanged
→ PRJ-09/08
```

The browser does not need hidden chat/session state to recover the work.

### C. Honest failure/recovery

Provider refusal, timeout or invalid structured output leaves no candidate or
empty success. The person keeps their Project and intent, receives an explicit
retryable/non-retryable state and may retry the owner operation. Session expiry
returns through authentication; it does not recreate or infer Project truth.

## 4. Negative coherence matrix

| Attempt | Required result |
| --- | --- |
| repeat/wrong-subject bootstrap | deny before Account creation |
| Keycloak role without Conexus grant | deny Product access |
| wrong Workspace/Project coordinate | deny without existence disclosure |
| caller-supplied source URL on `PRJ-07` | deny; source is already admitted by `PRJ-03` |
| Git path crosses Project or ref CAS loses | deny PRJ-03 settlement; no partial Project/source success |
| EXISTING_GIT contains credential or forbidden protocol/destination | deny before remote access |
| refinement against stale candidate | deny; prior candidate remains immutable |
| forged visual anchor/selected text | revalidate against exact candidate or discard |
| `PRJ-24` tries tool/memory/mutation | deny; answer remains read-only |
| stale candidate approval | deny `PRJ-09`; no Baseline change |
| model/provider failure | explicit failure; never candidate/answer success |
| session ended then route reused | deny through current session/authority check |
| generated/platform-contract drift | fail applicable R1C gate before use |
| RB/R2/later operation appears | fail `R1C-12 REACHABILITY` |

## 5. Cross-layer composition

```text
Product owners/Permissions
→ exact 4B generated wire
→ locked W-01/T-01/GF-01 interaction semantics
→ 4D scaffold/profile ownership + R1 foundation mechanisms
→ ProjectMastra stateless cognition mechanics
→ preserved R1C-01..12 + R1C-13 cognition + R1C-14 Git custody
```

No layer becomes a second owner:

- Keycloak authenticates; Conexus authorizes.
- Browser state presents; server owners decide.
- ProjectMastra proposes/explains; Project creates/approves truth.
- Scaffold/compiler reproduce mechanics; they do not own Product meaning.
- Evidence proves named claims; it does not grant execution.

## 6. Proportional dependency treatment

P13 proved the ProjectMastra profiles and found default telemetry plus a large
transitive response ceiling. `MASTRA_TELEMETRY_DISABLED=1` is fixed now because
it is zero-cost configuration. Safe exact repin/response-boundary proof is due
before the first root dependency or real provider call, not before Product
composition: no Product runtime exists and the pin can change without changing
this flow or its owners.

This is `DEFER SAFELY`, with a concrete trigger—not a waiver.

## 7. Coherence result

```text
operation coverage = 13/13
orphan consumer = 0
invented operation = 0
owner duplication = 0
missing Permission = 0
runtime family added = 0
later-tranche leakage = 0
material Product contradiction = 0
```

The R1 composition is `CLEAR / OPERATOR APPROVED`. It does not claim implementation,
pixels, provider quality, production security or the full Budget Analyzer
Golden Flow.

## 8. Reopen triggers

Reopen only if Evidence shows a missing R1 human outcome/operation, an owner or
Permission contradiction, inability to recover/re-enter without client/model
state, Project cognition requiring durable conversation/workflow, or an
implementation dependency that cannot satisfy an applicable R1C firing gate.

## 9. Operator decision

```text
APPROVE 4E(R1) COMPOSED COHERENCE
```

After independent Claude Opus/Fable/Gemini Pro convergence and bounded owner
corrections, the operator's conditional approval is final. Approval closes
tranche-scoped 4E planning only and routes R1 to 4F. It does not authorize
Product implementation, a real provider call, push, PR or merge.
