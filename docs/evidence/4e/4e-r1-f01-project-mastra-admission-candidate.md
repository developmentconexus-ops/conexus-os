# 4E-R1-F01 — ProjectMastra exact admission candidate

> **Status:** `OPERATOR APPROVED / P13 ACCEPTED / PRODUCTION REPIN GATE DEFERRED`
> **Scope:** `PRJ-07 + PRJ-24 / PROJECT-LOCAL MASTRA MECHANICS`
> **Implementation/provider-call authority:** `0`

> **Probe disposition:** the operator approved this candidate and its isolated
> non-provider probe on `2026-08-30`. P13 passed framework/profile mechanics and
> exposed a response-resource production risk. The operator classified its
> resolution as `DEFER SAFELY` until pre-implementation while 4E Product planning
> continues. See the [probe result](4e-r1-f01-project-mastra-admission-probe-result.md).

## 1. Candidate outcome

```text
ADOPT @mastra/core@1.63.2
+ ADOPT zod@4.5.2 as required compatibility peer only
+ one ProjectMastra instance
+ two code-defined stateless Agents
+ closed deployment ProjectModelAdmissionCatalog
+ server-resolved ProjectModelPolicy
+ no provider/model hardcoding or fallback
+ isolated source/fake-model probe required before implementation
```

No `@mastra/memory`, storage adapter, workflow, scheduler, AgentController,
DurableAgent, background task, subagent, MCP/A2A or provider SDK is selected for
Project cognition.

## 2. Why this pin

Exact observed identities on `2026-08-30`:

```text
@mastra/core = 1.63.2
integrity = sha512-BHVDF4GtQnIqRND/lPVVoTnmoNzZ7+voz+EpI4YSY0W7In6c/EOrmMnshuNQSDJ9NpxQNrwip0WGYpRYwzFirQ==
tag commit = 003e75745c5fd6a7af8464ece1d2930f81dd15af
license = Apache-2.0
engine = Node >=22.13.0
published by = GitHub Actions <npm-oidc-no-reply@github.com>

zod = 4.5.2
integrity = sha512-XkYXCol10+ba/6F/cueWV+TezUeOqXW0hdeJt5CdXjTYeAgAQg5N03RQdJ80mhfFE72+pblvYMW4wy2Qp4Qbrg==
license = MIT
```

`1.63.2` is the current stable npm tag and already exists in the isolated 4D
Builder-capability lock. Its embedded version-matched docs and types confirm
the required Agent, dynamic model, RequestContext, structured-output, tool and
finite execution surfaces. It is preferable to silently retaining historical
`1.56.0` or selecting an unmaterialized alpha.

Registry verification reported `183/183` package signatures valid and `37`
attestations. Provenance is necessary but not sufficient after the June 2026
Mastra supply-chain incident: compromised `@mastra/core@1.42.1` remains an
explicit deny identity, and every future repin repeats signature, attestation,
scripts, lock, source and advisory admission.

The `1.63.2` tag is `334` commits after the merged auth-token fix commit
`7c60df5...`. Its shipped changelog/source excludes `mastra__authToken` from
workflow snapshots, score rows and durable-agent inputs. Project cognition
still does not enable those persistence surfaces.

## 3. Known advisory and bounded disposition

The exact lock reports one transitive low-severity availability advisory:

```text
GHSA-866g-f22w-33x8 / CVE-2026-8769
@ai-sdk/provider-utils-v5 = 3.0.30
class = uncontrolled JSON-response resource consumption
confidentiality/integrity impact = none
availability impact = low
patched 3.x release = none currently published
```

This is not waived by package popularity or low severity. The candidate is
admissible only if the isolated probe demonstrates the bounded reachability
case:

- provider destination is an exact server-pinned official HTTPS origin;
- no caller, Project, policy, provider payload or environment value supplies a
  base URL, gateway or arbitrary endpoint;
- call concurrency, model steps, retries, total/step timeout and process
  resource ceilings are finite;
- malformed/oversized response failure is explicit and cannot become success;
- custom/self-hosted/OpenAI-compatible endpoints remain denied for this pin.

If a bounded response/resource ceiling cannot be demonstrated at the actual
adapter boundary, `1.63.2` is `HOLD FOR PRODUCT USE` until a patched exact
stable pin is available and requalified. A future safe stable pin may supersede
this candidate before implementation without reopening the approved Mastra
structure.

## 4. Provider/model admission law

Mastra's embedded registry currently contains `189` providers. That registry
proves model-router recognition only; it grants zero Conexus admission.

The deployment loads one closed server-owned catalog:

```text
ProjectModelAdmissionCatalog entry = {
  admissionId,
  exact providerKey,
  exact modelId,
  exact officialHttpsOrigin,
  credentialSlot,
  capabilitySet,
  enabled
}
```

Rules:

1. `providerKey/modelId` must exist in the exact `1.63.2` embedded registry.
2. At least one entry must be explicitly admitted for an installation; there
   is no universal default.
3. Multiple entries are allowed only for real configured consumers, not to
   mirror the 189-provider registry.
4. `ProjectModelPolicy` references `admissionId`; browser/user input never
   supplies raw provider/model/base URL/credential values.
5. The dynamic Agent model resolver reads the opaque trusted admission ID and
   returns the single catalog-owned `provider/model` string.
6. One policy maps to one model. No ordered model array, automatic fallback,
   mutable alias or silent provider substitution is admitted.
7. Provider retirement/unavailability returns explicit failure. Changing an
   entry creates a new exact admission/proof identity.

Example: an installation with Anthropic credentials may admit
`project-baseline-primary → anthropic/<exact-model>`. Another installation may
admit a Google model. Project code and schemas remain identical; only the
server-owned catalog differs.

## 5. Credential and egress law

```text
credential bytes
→ external restrictive-permission secret file
→ existing server-only secret-file provider
→ exact provider environment slot expected by Mastra
→ ProjectMastra process only
```

Configuration contains only an absolute secret-file reference. Credentials are
never stored in Git, ProjectModelPolicy, RequestContext, browser state, logs,
Evidence, traces, model output or durable Mastra state. Startup fails closed
when a required slot is missing, unreadable or ambiguous.

Each admitted provider has its own credential slot and pinned official egress
origin. There is no universal privileged `fetch(url, secret)` service. Exact
account retention/training/data-region terms are deployment/security egress
Evidence at real provider admission; no Product-like governance reference or
lifecycle is invented before that consumer exists.

## 6. Exact ProjectMastra profile

```text
new Mastra({
  agents: { ProjectInceptionAgent, BaselineExplanationAgent },
  workers: false,
  notifications: { dispatch: { enabled: false } },
  backgroundTasks: { enabled: false },
  scheduler: { enabled: false }
})
```

No storage, memory, workflow, scorer, observability exporter, workspace,
subagent or server endpoint is registered. `RequestContext` contains only an
opaque admission ID, correlation and invocation-local capability/budget facts;
it is never authorization or durable state.

`MASTRA_TELEMETRY_DISABLED=1` is set before importing/constructing Mastra.
Mastra's default anonymous PostHog feature telemetry is ambient external egress
and is forbidden for this Project-local instance.

### `ProjectInceptionAgent` / PRJ-07

```text
maxSteps = 4
maxToolCalls = 3
maxConcurrentTools = 1
maxRetries = 0
maxOutputTokens = 8192
timeout.totalMs = 180000
timeout.stepMs = 60000
memory = absent
fallback models = absent
structured output = canonical raw JSON Schema, strict
```

Tools are created only from a server-resolved read-only allowlist. Every tool
executes behind one invocation-local atomic call/concurrency budget and exact
source-snapshot capability. Native combined tools + structured output is a
model-admission requirement; prompt-only JSON or a second structuring model is
not a silent fallback.

### `BaselineExplanationAgent` / PRJ-24

```text
maxSteps = 1
toolChoice = none
tools = {}
maxRetries = 0
maxOutputTokens = 2048
timeout.totalMs = 45000
timeout.stepMs = 45000
memory = absent
fallback models = absent
structured output = canonical raw JSON Schema, strict
```

The invocation contains one exact candidate digest. It cannot invoke tools,
continue a thread or use a separate structuring model. Both profiles pass the
result independently through strict owner Ajv admission and current authority/
subject recheck before settlement.

## 7. Affected 4D-D claim candidate

```text
R1C-13 PROJECT_COGNITION

exact current Project subject + current authority
+ exact ProjectModelPolicy/admission/profile
→ bounded stateless ProjectMastra execution
→ strict untrusted structured result + truthful usage/provenance
→ current Project owner recheck and settlement
```

Independent firing controls:

- unknown/disabled admission, mutable alias, raw caller model or arbitrary
  endpoint refuses before model execution;
- missing/wrong credential slot refuses without disclosure;
- PRJ-24 tool, second step, memory or candidate mutation refuses;
- PRJ-07 unlisted/mutating/arbitrary-target/parallel/fourth tool refuses;
- retry, timeout, output, step and concurrency ceilings fire;
- malformed/oversized/refused/provider-failed output stays explicit;
- stale authority, candidate or source snapshot discards late valid output;
- no framework/request/provider identity becomes Project truth;
- compromised package identity, bad integrity/signature/attestation or material
  reachable advisory refuses admission.

This claim is an affected addendum. It does not rewrite the preserved
`R1C-01..12` foundation vector or add an operation/runtime family.

## 8. Isolated probe-grant request

One bundled operator decision may approve the candidate and authorize only an
Evidence-only `P13` probe:

1. create a minimal isolated lock with only exact core + compatibility peer;
2. verify tarball integrity, signatures, attestations, source tag ancestry,
   scripts, licenses, dependency tree and advisories;
3. execute deterministic fake-model tests for both profiles and every
   `R1C-13` firing control;
4. prove no storage/thread/workflow/worker/scheduler/background/notification
   state appears;
5. prove closed catalog resolution and secret/base-URL non-disclosure;
6. characterize the low advisory reachability and resource ceiling;
7. emit Evidence only; make no root/Product dependency or implementation.

The probe grant excludes real provider/model calls, credentials, billable/live
effects and quality claims. A later exact provider/model entry and real-case
probe require separate operator authority.

## 9. Alternatives and strongest objection

| Alternative | Disposition | Reason |
| --- | --- | --- |
| keep `1.56.0` | `REJECT` | stale against current admitted Mastra direction and lacks current source fixes/features |
| select `1.63.3-alpha.0` | `REJECT` | unmaterialized prerelease with no need proven |
| wait without a candidate | `REJECT` | loses current verified pin/provenance and blocks deterministic fake proof unnecessarily |
| admit every registry provider | `REJECT` | discovery metadata becomes accidental authority and unsupported breadth |
| select one global vendor | `REJECT` | recreates the provider lock the operator rejected |
| `1.63.2` + closed deployment catalog + advisory firing gate | `ADOPT CANDIDATE` | one current framework, provider portability, exact trust boundary and reversible repin |

Strongest objection: `@mastra/core` carries a broad 182-production-dependency
tree for two small calls and one known low transitive advisory. The answer is
not to hide that cost. Mastra was selected to avoid a second platform cognition
stack; the smallest sustainable realization imports only core + required peer,
disables every unused runtime facility and makes dependency/advisory reachability
a firing gate. If the minimal lock/probe cannot enforce those boundaries, the
candidate fails and the structure is reopened rather than patched around.

## 10. Evidence basis and reopen triggers

Evidence:

- exact embedded `@mastra/core@1.63.2` docs/types/source and provider registry;
- existing isolated 4D lock and current capability probe;
- npm registry integrity, signatures, SLSA provenance, tag/source and audit;
- [Mastra supply-chain incident #18061](https://github.com/mastra-ai/mastra/issues/18061);
- [malicious core advisory](https://github.com/advisories/GHSA-pp62-grrw-hvfp);
- [auth-token persistence fix #21996](https://github.com/mastra-ai/mastra/pull/21996);
- [provider-utils availability advisory](https://github.com/advisories/GHSA-866g-f22w-33x8);
- current Context7 `/mastra-ai/mastra` supporting docs.

Reopen on failed isolated proof, reachable advisory without bounded mitigation,
provider/model inability to combine tools with native structured output,
credential/base-URL leakage, need for per-tenant same-provider credentials,
durable Project conversation/workflow, or a safe stable Mastra repin before
implementation.

## 11. Operator decision

```text
APPROVE PROJECTMASTRA ADMISSION + ISOLATED NON-PROVIDER PROBE
REVISE <pin/catalog/profile/advisory treatment>
HOLD
```

The operator selected the planning candidate and granted only its isolated
source/fake-model probe. The completed probe did not install a root dependency,
call a real provider, choose a universal vendor/model or authorize Product
implementation. P13 initially held the exact Product pin; subsequent operator
proportionality adjudication classified repin/response proof as a cognition-
slice entry gate, and `R1C-13` is now attached to 4D-06 for 4F carry-forward.
