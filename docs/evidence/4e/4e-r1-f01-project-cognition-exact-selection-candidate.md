# 4E-R1-F01 — Project cognition exact selection candidate

> **Status:** `REJECTED / OPERATOR REVISE / NEGATIVE DECISION EVIDENCE`
> **Scope:** `PRJ-07 + PRJ-24 / PROJECT-LOCAL ADAPTER ONLY`
> **Implementation/install/probe/provider-call authority:** `0`

> **Current disposition (2026-08-30):** the operator rejected this OpenAI-only
> candidate. It is retained intact as historical negative Evidence, not as a
> current selection. The approved direction reuses a Project-local Mastra
> mechanism and resolves an admitted provider/model dynamically through
> `ProjectModelPolicy`; see the
> [revised Global Maximum](4e-r1-f01-project-cognition-global-maximum.md).

## 1. Decision

**Rejected historical outcome candidate:**

```text
ADOPT openai@7.8.0 official Node SDK
+ ADOPT OpenAI Responses API
+ ADOPT gpt-5.6-terra as the one initial R1 model
+ ADAPT behind ProjectCognitionAdapter/v1
+ explicit per-operation limits / stateless store:false
+ real-provider probe required before implementation grant
```

This is not a universal platform model winner. It is the smallest reversible
initial adapter for the two current Project-owned R1 cognition operations.
Mastra remains absent here and stays scoped to Builder/PAR.

## 2. Exact selected identities

### SDK

```text
package     = openai
version     = 7.8.0
integrity   = sha512-/2g9JzdnXNcjX1W/UlSNu+OdSFDAaAVt0n9Onom0kPenH54o59G2WrX/xjTnr26UHNSh6hxcAf58doGYRme2rw==
license     = Apache-2.0
engine      = Node >=22.0.0
repository  = https://github.com/openai/openai-node
API         = Responses API
```

Registry observation on `2026-08-30` reports no mandatory runtime dependency;
all published peer dependencies are optional for features outside this R1 path.
No optional AWS, WebSocket, Zod or custom-transport entrypoint is admitted.

### Provider/model

```text
provider    = openai
base URL    = https://api.openai.com/v1
model       = gpt-5.6-terra
fallback    = none
```

Official OpenAI documentation describes `gpt-5.6-terra` as the balance of
intelligence and cost and reports Responses API, function calling, structured
outputs, 1.05M context and 128k maximum output support. Observed pricing is
`$2/M` input and `$12/M` output tokens; pricing is operational Evidence and may
change without altering Product meaning.

The unsuffixed `gpt-5.6` alias is forbidden because it routes to another tier.
The response's actual model/service identity and request ID are recorded as
safe Evidence; any incompatible model-generation change fires requalification.

## 3. Why direct official SDK beats AI SDK for R1

| Shape | Current package surface | Benefit | Cost/risk | Disposition |
| --- | --- | --- | --- | --- |
| `openai@7.8.0` behind Project adapter | one official provider SDK; no mandatory runtime deps | native Responses API, typed errors, retries/timeouts/request IDs, exact provider features | one-provider implementation | `ADOPT` |
| `ai@7.0.85` + `@ai-sdk/openai@4.0.52` | core + gateway/provider/provider-utils + provider adapter + Zod peer | unified providers, bounded loops, normalized usage | second provider abstraction despite only one admitted provider; extra supply-chain/API surface | `REJECT FOR R1 / REOPEN ON SECOND REAL PROVIDER` |
| handwritten HTTP | no package | minimum bytes | hand-maintained API/errors/retries/stream/function protocol | `REJECT` |
| Mastra Agent | broad Agent runtime | tools/lifecycle ready | memory/Agent/context/tracing and broad unused primitives | `REJECT HERE / PRESERVE RF-09/RF-16` |

The Conexus adapter—not a multi-provider SDK—owns replacement. If a second real
provider becomes required, compare AI SDK Core against a second direct adapter
using actual migration/eval cost; do not preinstall breadth now.

Registry size is non-deciding but supports the complexity comparison:

```text
openai@7.8.0                         ≈ 15.3 MB / 2917 files / 0 mandatory runtime deps
ai@7.0.85 + @ai-sdk/openai@4.0.52   ≈ 9.9 MB before shared deps / multiple packages + Zod peer
```

Smaller bytes do not win; fewer active abstraction and dependency boundaries do.

## 4. Exact operation profiles

All numbers are candidate admission limits. The authorized real-provider probe
may tighten or revise them through the affected owner; ambient SDK defaults are
never accepted.

| Setting | `PRJ-07` Inception | `PRJ-24` Explanation |
| --- | ---: | ---: |
| model | `gpt-5.6-terra` | `gpt-5.6-terra` |
| reasoning effort | `medium` | `low` |
| maximum model calls | `4` | `1` |
| maximum custom function calls | `3` | `0` |
| parallel tool calls | `false` | `false` |
| SDK automatic retries | `0` | `0` |
| maximum output tokens | `8192` | `2048` |
| total timeout | `180000 ms` | `45000 ms` |
| provider persistence | `store: false` | `store: false` |
| provider conversation/previous response | absent | absent |
| background mode | `false` | `false` |
| built-in/provider-hosted tools | none | none |

No automatic retry/fallback hides cost or duplicates work. A recoverable
provider failure returns the existing safe owner/wire failure; the human may
retry the Product operation explicitly.

### `PRJ-07`

The adapter may execute only exact Project-provided read functions over the
already authorized source snapshot. It manually counts every model/function
step because provider `max_tool_calls` does not replace Conexus limits for
custom functions. Tool result bytes and total admitted context receive explicit
finite caps in the probe profile.

The final structured proposal is strict JSON Schema, then independently passes
the existing raw UTF-8/I-JSON/Ajv owner admission. Only Project may create the
immutable candidate after current-authority, source-completeness and provenance
recheck.

### `PRJ-24`

One stateless response over exact Project + `candidateBaselineDigest` + question.
No tools, continuation, memory, previous response or conversation ID. Optional
projection anchor/text is revalidated before inclusion. Output is a strict
candidate-bound explanation with provenance and cannot mutate/refine/approve.

## 5. Security, privacy and custody

```text
API key value        = server-only secret file, loaded explicitly into SDK
environment/config   = absolute secret-file reference only
destination          = exact official API base URL, no caller override
SDK logging          = off; no request/response body logging
Responses storage    = store:false
prompt cache         = explicit mode with no admitted breakpoint in R1
provider tools       = none
browser/Project Git  = no key, raw provider object, response ID or hidden reasoning
```

Environment admission records the OpenAI organization/project retention posture.
`store:false` is required but is not misrepresented as a universal Zero Data
Retention guarantee. If the company requires ZDR, exact account/project policy
must be proven before real business context is sent.

Raw prompt, source excerpts, provider output, reasoning items and API error body
are sensitive mechanics. Durable Product state receives only owner-admitted
candidate/answer/provenance; safe diagnostics retain bounded request/model/
usage/status identities without content or credentials.

## 6. Result and error mapping

The adapter returns only the approved logical envelope:

```text
COMPLETED
REFUSED
ABORTED
PROVIDER_FAILURE
INVALID_OUTPUT
INCONCLUSIVE
```

- OpenAI SDK/API error classes and provider payloads stay internal;
- refusal is not empty or provider failure;
- timeout/abort is not successful completion;
- missing usage/cost is `MISSING`, never zero;
- truncated/incomplete/invalid structured output cannot reach Project owner
  settlement;
- late output after authority/candidate/source change is discarded;
- request ID is correlation Evidence only.

## 7. Provider/model alternatives

| Provider/model | Current Evidence | Fit | Why not initial |
| --- | --- | --- | --- |
| OpenAI `gpt-5.6-terra` | stable documented model ID; structured outputs/functions; balanced tier; official SDK with no mandatory runtime deps | strongest simplicity/reversibility fit | selected candidate |
| Anthropic `claude-sonnet-5` | 1M context, structured outputs/tools, strong speed/intelligence positioning; `$2/$10` observed | strong quality challenger | new tokenizer/behavior and direct SDK surface need separate admission; no current Conexus credential/quality proof |
| Google `gemini-3.7-flash` | stable model, function calling, lower `$0.75/$4.50` observed pricing | strongest cost challenger | lower cost alone is not task correctness; no current Conexus credential/paired quality proof |

No claim says OpenAI is universally best. The initial choice minimizes
integration boundaries and uses the provider's balanced production model.
Reopen on failed real-case quality, unacceptable latency/cost/refusal, provider
availability/data-governance mismatch or a second real provider consumer.

## 8. Required affected 4D-D claim

After selection approval, derive `PROJECT_COGNITION` as one independent claim
without renumbering the already approved foundation claims in this document:

```text
exact operation profile + owner subject + policy/model/SDK pins
→ bounded stateless provider call
→ strict structured output + truthful usage/provenance
→ current owner settlement
```

Firing controls:

- wrong Project/candidate/source coordinate;
- authority revoked/narrowed before settlement;
- unlisted tool or parallel call;
- call/tool/output/timeout limit exceeded;
- hidden SDK retry or model fallback;
- provider refusal, timeout, rate limit and malformed/truncated output;
- wrong/changed model identity;
- stored/continued response or prompt-cache use;
- missing usage treated as zero;
- raw provider/secret/content leakage;
- model result attempting candidate mutation/approval.

## 9. Probe boundary

Selection approval does not install or call the provider. A separate operator
grant is required for an isolated package/provider probe containing:

1. exact lock/tree/scripts/license/signature/advisory admission;
2. fake-server verification of SDK retry/timeout/error/request-ID behavior;
3. deterministic fake-model owner envelope and all negative controls;
4. one real non-production `PRJ-07` case and one `PRJ-24` case against
   `gpt-5.6-terra`, with synthetic non-secret context only;
5. paired owner-labeled quality checks, latency/token usage and refusal/error
   truth; no stochastic judge as sole gate;
6. cleanup and zero retained credential/prompt/output.

Probe failure reopens only this selection. Probe success cannot grant Product
implementation.

## 10. Version and reopen law

- `openai@7.8.0`, exact integrity and canonical lock only;
- `gpt-5.6-terra`, never `gpt-5.6`, `chat-latest` or caller-selected model;
- SDK patch/security update requires exact repin and affected source/advisory/
  lock/firing proof;
- SDK major, Responses API behavior or incompatible model-generation change
  reopens this selection;
- pricing change alone updates operational Evidence; material cost changes may
  reopen the model policy;
- a second real provider triggers AI SDK versus second direct adapter comparison;
- durable memory, conversation, workflow or autonomous action triggers runtime-
  family reconsideration; no silent Mastra growth.

## 11. Evidence basis

- official [OpenAI model comparison](https://developers.openai.com/api/docs/models/compare),
  [GPT-5.6 Terra model page](https://developers.openai.com/api/docs/models/gpt-5.6-terra),
  [Responses API create reference](https://developers.openai.com/api/reference/resources/responses/methods/create),
  [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs),
  [function calling](https://developers.openai.com/api/docs/guides/function-calling)
  and [official SDK guide](https://developers.openai.com/api/docs/libraries);
- exact [`openai-node` v7.8.0 source](https://github.com/openai/openai-node/tree/v7.8.0);
- Context7 `/vercel/ai` and `/anthropics/anthropic-sdk-typescript`;
- official [Claude Sonnet 5](https://platform.claude.com/docs/en/models/sonnet-5/whats-new-sonnet-5)
  and [Gemini models](https://ai.google.dev/gemini-api/docs/models) /
  [pricing](https://ai.google.dev/gemini-api/docs/pricing) evidence;
- Mastra skill v2.1.0; provider registry lookup was attempted but correctly
  unavailable because no `@mastra/core` package is installed. No installation
  was performed to manufacture registry Evidence.

External sources prove current capability/identity only, not Conexus quality or
integration correctness.

## 12. Operator decision

```text
APPROVE R1 PROJECT COGNITION SELECTION
REVISE <exact SDK/model/profile>
HOLD
```

Approval accepts 4D-C selection only. It does not install packages, grant the
probe, call OpenAI, authorize Product implementation or resume 4E. The next step
is the affected 4D-D claim + isolated probe-grant request.
