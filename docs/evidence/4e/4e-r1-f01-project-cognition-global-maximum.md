# 4E-R1-F01 — Project cognition Global Maximum adjudication

> **Status:** `GLOBAL MAXIMUM REVISED / MASTRA PROJECT-LOCAL STRUCTURE OPERATOR APPROVED / P13 ACCEPTED / 4E READY`
> **Finding:** `4E-R1-F01`
> **Decision class:** `CURRENT STRUCTURE CONFIRMED / BOUNDED OWNER CORRECTION / REUSE ACCEPTED MASTRA MECHANISM`
> **Implementation/install/probe/provider-call authority:** `0`

## 1. Approved decision

```text
Project owner handlers for PRJ-07 / PRJ-24
→ one role-specific ProjectMastra instance inside Project
→ ProjectInceptionAgent | BaselineExplanationAgent
→ dynamic provider/model resolved by server-owned ProjectModelPolicy
→ untrusted structured result + usage/provenance
→ current Project owner revalidation and settlement
```

Mastra is the shared cognition framework, not a Product owner. There is no
OpenAI hardcoding and no parallel direct-provider or AI-SDK stack. A deployment
may admit OpenAI, Anthropic, Google or another Mastra-supported provider/model;
an invocation can use only an exact pair already admitted by
`ProjectModelPolicy`.

This decision adds no runtime family, service, database, durable conversation,
memory, workflow, scheduler, provider router or Product operation. The existing
24-family census remains unchanged. `ProjectMastra` is owner-local mechanics,
not a Product Agent identity or source of authority.

## 2. Why this is the Global Maximum

The earlier direct-OpenAI candidate optimized the two calls locally but created
a second cognition stack beside the already accepted Mastra direction and made
provider portability an adapter rewrite. Reusing Mastra gives Conexus one
framework-level execution model while keeping each Product owner and profile
separate.

Current Mastra documentation confirms that an Agent can resolve a
`provider/model` identifier dynamically from request context, use a bounded
tool set and step condition, and return Standard JSON Schema structured output.
Memory is configured behavior, not required by a basic Agent invocation.

The decision deliberately uses only that small surface. Mastra's broader
memory, workflow, scheduler, MCP/A2A, workspace and network features are not
admitted merely because the framework contains them.

## 3. Authority and context law

```text
current Project authority + exact Project/candidate/source facts
+ server-resolved ProjectModelPolicy + finite profile limits
→ stateless Mastra Agent mechanics
→ untrusted typed result
→ current Project owner recheck
→ owner result or explicit failure

Mastra agent/run/request/memory identity -X-> Project truth or authority
```

`RequestContext` carries already resolved execution configuration and
correlation only. It cannot choose permissions, broaden tools, accept a model,
recover stale Product state or become durable memory. Every retry or follow-up
reconstructs context from exact current owner facts.

Provider credentials remain server-only. Provider SDK payloads, Mastra object
identity and framework errors never cross the Project owner boundary.

## 4. Two internal profiles

### `ProjectInceptionAgent` — `PRJ-07 RunInceptionInvestigation`

- exact Project plus admitted source snapshot;
- only a server-built read-only tool allowlist;
- explicit call, step, output, retry, timeout and abort limits;
- structured candidate proposal with source/tool provenance;
- no memory, continuation, arbitrary URL/filesystem, credential or mutation
  tool;
- the Project owner alone validates and creates an immutable candidate.

Example: a company connects its approved ERP schema and policy documents. The
agent may inspect only those snapshot tools, propose a Project Baseline, and
return citations. It cannot create the Baseline until Project rechecks scope,
authority, provenance and schema.

### `BaselineExplanationAgent` — `PRJ-24 AskConexusAboutBaselineCandidate`

- exact Project, immutable `candidateBaselineDigest` and non-blank question;
- no tools, one generation step, no memory or continuation;
- structured answer tied to the exact candidate/projection provenance;
- cannot mutate, refine or approve the Baseline.

Example: “por que faturamento está no MVP?” is answered only from candidate
digest `abc123`. A second question is a new invocation rebuilt from the current
candidate; no hidden chat history can change the answer's authority.

## 5. Provider/model policy

Logical server-owned input:

```text
ProjectModelPolicy = {
  policyRef,
  providerId,
  modelId,
  operationProfile,
  limits,
  credentialRef,
  allowedCapabilities
}
```

The policy resolves to an exact Mastra `provider/model` identity. User input
cannot supply arbitrary model strings or credentials. There is no automatic
fallback cascade: unavailable, refused or invalid output remains an explicit
failure unless a later policy separately admits a bounded fallback.

Example: tenant A may be admitted to `anthropic/model-x` and tenant B to
`google/model-y`. Both execute the same Project profile and canonical schema;
neither changes Project code or gains capabilities from its provider.

## 6. Mechanism comparison and disposition

| Candidate | Result | Reason |
| --- | --- | --- |
| direct OpenAI SDK | `REJECTED` | provider lock plus a parallel execution/policy stack |
| direct AI SDK Core | `REJECTED` | portable, but still duplicates the accepted Mastra execution layer |
| one generic cross-domain Agent | `REJECTED` | collapses Project, Builder and Product-Agent authority/lifecycle |
| one Project-local Mastra with two internal stateless Agents | `SELECTED / OPERATOR APPROVED` | one framework, provider-neutral policy, exact owner isolation, smallest admitted Mastra surface |

This is not a claim that Mastra or any provider is universally best. It is the
best fit against Conexus's already accepted architecture and reversibility law.

## 7. Exact admission still open

Structural approval does not inherit the historical `@mastra/core@1.56.0` pin
and does not automatically admit the registry-observed `1.63.2`. The next
planning slice must decide:

1. exact `@mastra/core` version, integrity, provenance, Node compatibility,
   advisories and lock/tree impact;
2. exact provider registry/configuration and credential-source contract;
3. allowed `providerId/modelId` pairs and capability compatibility;
4. exact stateless Agent configuration, schemas and finite limits;
5. affected 4D-D conformance claim and isolated Evidence-only probe request.

No package installation or provider/model call is authorized by this document.

## 8. Required later proof

A separately approved probe must prove deterministic fake-model behavior first:

- both profiles enforce their schemas and finite ceilings;
- PRJ-24 refuses tools, second steps and memory/continuation;
- PRJ-07 refuses unlisted tools, mutations and arbitrary targets;
- stale authority/candidate/source state discards a late valid model result;
- provider/model strings outside policy, missing credentials and fallback all
  fail closed;
- usage missingness, refusal, timeout, abort and invalid output remain truthful;
- no Mastra/request/provider identity becomes Product truth.

Only after exact admission may an explicit grant authorize one non-production
real-model case per profile. A model judge is never the sole hard gate.

## 9. Evidence basis

- accepted PRJ-07/24 owners, Permission contract and R1 operation map;
- corrected FE-08, 4D-03 and 4D-04 authorities;
- accepted Mastra direction and prior qualification, without silently
  inheriting its old package pin;
- repository Mastra skill and current Context7 `/mastra-ai/mastra` Evidence for
  dynamic model selection, tools/step limits, structured output and optional
  memory configuration;
- the rejected exact OpenAI candidate retained as negative decision Evidence.

External documentation proves framework capability only, not Conexus
integration, provider admission or model quality.

## 10. Operator adjudication

```text
APPROVE 4E-R1-F01 MASTRA PROJECT-LOCAL STRUCTURE
```

On `2026-08-30`, the operator rejected the OpenAI-specific direction and then
approved the revised provider-neutral structure: reuse Mastra, select the exact
provider/model through `ProjectModelPolicy`, keep two bounded stateless internal
profiles and retain Project as the sole semantic owner.

The exact Mastra pin/provider-registry admission and affected 4D-D/probe plan
are now proposed in the
[ProjectMastra admission candidate](4e-r1-f01-project-mastra-admission-candidate.md).
Operator adjudication is next. 4E/4F/4G and Product implementation remain
blocked.
