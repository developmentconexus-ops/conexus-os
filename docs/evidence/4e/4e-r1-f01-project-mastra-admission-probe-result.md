# 4E-R1-F01 — ProjectMastra admission probe result

> **Status:** `P13 OPERATOR ACCEPTED / MECHANICS PASS / PRODUCTION REPIN GATE DEFER SAFELY`
> **Operator grant:** `APPROVE PROJECTMASTRA ADMISSION + ISOLATED NON-PROVIDER PROBE`
> **Provider/model/credential calls:** `0`
> **Product implementation authority:** `0`

## 1. Result

```text
Mastra Project-local structure          = KEEP / OPERATOR APPROVED
@mastra/core@1.63.2 source identity     = PASS
minimal core + zod lock                 = PASS
closed provider/model catalog mechanics = PASS
PRJ-07 stateless bounded Agent profile  = PASS
PRJ-24 stateless one-step profile       = PASS
credential/late-owner guards            = PASS
ambient Mastra telemetry                = FOUND / OPT-OUT PROVED
exact pin Product execution admission   = NOT YET / PRE-IMPLEMENTATION GATE
R1C-13 planning contract                = READY FOR 4E COMPOSITION
```

The approved Global Maximum remains coherent. The probe falsified only the
claim that exact `1.63.2` is ready for in-process Product use; no Product
runtime exists yet.

## 2. Exact Evidence identity

```text
Node = 24.18.0
npm = 12.0.2
@mastra/core = 1.63.2
zod = 4.5.2
lock SHA-256 = 0eafd6b045393be760196625ab65e45a745e261cd603e74265f40de1430e73e7
installed package entries = 154 + root
registry signatures = 154 verified
attestations = 30 verified
probe = 8/8 PASS with container network disabled
```

The minimal direct dependency set contains only core + its required peer. No
Mastra memory/storage/pg/libsql/observability package is selected directly.

## 3. Proved mechanics

P13 demonstrated with deterministic local model fixtures:

- exact embedded registry discovery remains separate from a closed Conexus
  admission catalog;
- unknown, disabled, mutable-alias, raw-caller-model and custom endpoint inputs
  fail before execution;
- one opaque admission ID dynamically resolves the model fixture;
- PRJ-07 performs one admitted source read, emits strict structured output and
  enforces three-call/one-concurrent-tool guards;
- PRJ-24 runs one tool-free step, rejects mutation-shaped output and has no
  memory;
- `maxRetries=0`, output/step limits and total/step timeout reach the model
  boundary and fire;
- missing credentials, stale authority, stale candidate and stale source
  settlement fail closed;
- refusal, abort, provider failure, invalid output and inconclusive outcomes do
  not settle as completion;
- workers, notification dispatch, background tasks and scheduler are disabled.

These are Evidence mechanics, not Product code or provider quality proof.

The executed fixture contains a synthetic `dataGovernanceRef` field. Directed
4E review found no Product owner or current consumer for that identity, so it is
retained only as historical probe input and removed from the planned catalog.
Real provider retention/training/region acceptance remains security/egress
Evidence at its pre-implementation admission gate; P13 need not be rerun for
this subtraction.

## 4. Finding P13-F01 — ambient telemetry

Exact source showed that Mastra feature telemetry is enabled by default and
targets `https://us.posthog.com`. The first network-enabled probe run may have
attempted this anonymous feature event. It contained no provider credential,
model call or Product/business context; whether delivery occurred is not
asserted.

The harness now sets:

```text
MASTRA_TELEMETRY_DISABLED=1
```

before dynamically importing Mastra. The deciding replay passed `8/8` with
container networking disabled. This opt-out becomes mandatory for
`ProjectMastra`; omission is a firing failure.

## 5. Finding P13-F02 — response-resource ceiling

The minimal lock reports two low audit entries that trace to one root advisory:

```text
GHSA-866g-f22w-33x8 / CVE-2026-8769
@ai-sdk/provider-utils-v5@3.0.30
@mastra/core affected through that transitive package
moderate/high/critical = 0/0/0
```

Exact shipped source does call a size-limited response reader, but its default
is:

```text
DEFAULT_MAX_DOWNLOAD_SIZE = 2 * 1024 * 1024 * 1024
```

The same 2 GiB default is present in the bundled/current provider utility paths.
`maxOutputTokens`, timeout, official HTTPS origin and retry limits do not prove
an acceptable maximum response-body memory allocation. In the current modular-
monolith topology, exhausting the in-process ProjectMastra path can affect the
Hub. Therefore the probe-time firing rule yielded:

```text
@mastra/core@1.63.2 exact Product admission = HOLD
```

The probe does not waive the advisory, mislabel 2 GiB as safe or add an
unapproved proxy/worker merely to force PASS.

### 5.1 Operator proportionality adjudication

On `2026-08-30`, the operator accepted P13 and clarified that Conexus is still
being planned and has no Product runtime. Applying the Engineering Method's
materiality and YAGNI laws:

```text
mechanism/profile planning may proceed
Product implementation remains blocked
before first real provider call or root dependency:
  repin to safe exact stable source
  OR prove a proportionate bounded response path
```

The response ceiling is `DEFER SAFELY`, not a Product-planning stop. Its revisit
trigger is the first implementation dependency admission or real provider
probe, whichever comes first. Telemetry opt-out remains a current required
property because it is zero-cost configuration and already proved.

## 6. Global-Maximum route

Alternatives after the finding:

| Route | Disposition | Reason |
| --- | --- | --- |
| ignore/waive low advisory | `REJECT` | availability/trust-boundary claim remains unproved |
| accept 2 GiB because it is finite | `REJECT` | process-impact ceiling is not sustainable |
| direct provider SDK as workaround | `REJECT` | recreates the parallel cognition stack already rejected |
| add proxy/worker process immediately | `DEFER` | substantial topology/IPC/recovery complexity for two calls |
| select next exact stable Mastra pin with acceptable bounded response path | `PREFERRED` | preserves one cognition framework and removes the defect at its source |
| bounded owner-local adapter/process only if no safe pin exists when R1 must proceed | `REOPEN TRIGGER` | transitional escape requires fresh comparison and deletion condition |

The smallest sustainable action is to preserve the finding as a pre-execution
gate and continue 4E Product composition. Repin to the first exact stable source
that removes or acceptably bounds the response path before Product code/provider
execution. Proxy/worker/direct-provider work remains unjustified without a
material no-safe-pin falsifier at that later gate.

## 7. Reproduction

Harness:

```text
qualification/4e/project-mastra-admission/
```

Commands:

```bash
npm ci --ignore-scripts
npm audit signatures
MASTRA_TELEMETRY_DISABLED=1 npm test
```

The deciding test replay used an existing Node 24.18.0 container with
`--network none`. No real provider/model, credential, billable service or
Product implementation was exercised.

## 8. Operator adjudication

```text
ACCEPT P13 RESULT
KEEP MASTRA STRUCTURE
DEFER SAFE-PIN/RESPONSE-BOUNDARY PROOF TO PRE-IMPLEMENTATION
CONTINUE 4E PRODUCT COMPOSITION
```

Acceptance records the truthful probe outcome without overbuilding around it.
It does not approve Product implementation, a real provider call, workaround
topology, push, PR or merge.
