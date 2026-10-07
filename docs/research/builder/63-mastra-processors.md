# 63. Mastra processors: guardrails and message shaping, native

Input to the S2 and S3 censuses and to any guard we are tempted to write. Read from the installed
`@mastra/core` 1.71 (`dist/processors/`), the Hub source, and
[mastra.ai/docs/agents/processors](https://mastra.ai/docs/agents/processors). Companion to
[62](62-mastra-state-signals.md): a state signal is one thing a processor can emit.

## What a processor is

A processor runs inside the agent loop and can read or change what goes to the model and what comes
back. Mastra's docs list its uses: normalize or validate input, add guardrails, detect prompt
injection or jailbreak attempts, moderate content, transform messages (translate, filter tool
calls), limit tokens or history, redact sensitive data (PII), and apply business rules to messages.

An agent takes them as `inputProcessors` (before the model, including `processInputStep` on every
step), `outputProcessors` (on the streamed and final output) and `errorProcessors` (on a failed
model call). A processor can also own a state lane (`computeStateSignal`, study 62).

## Built in (installed 1.71)

| Need | Processor |
| --- | --- |
| Prompt injection, jailbreak | `PromptInjectionDetector` |
| Personal or sensitive data | `PIIDetector`, `RegexFilter` |
| Safety and compliance | `ModerationProcessor`, `Classifier`, `LanguageDetector` |
| The system prompt leaking in output | `SystemPromptScrubber` |
| Cost and context size | `TokenLimiter`, `TokenCostControl`, `MessageSelection` |
| Which tools and calls the model sees | `ToolCallFilter`, `ToolSearch` |
| Input hygiene | `UnicodeNormalizer` |
| Skills and instructions | `SkillsProcessor`, `SkillSearch`, `WorkspaceInstructions` |
| Model failures | `StreamErrorRetryProcessor`, `PrefillErrorHandler`, `ProviderHistoryCompat`, `ModelErrorStrategy` |
| Output shape | `StructuredOutput`, `BatchParts`, `ResponseCache` |

The detectors that classify text (injection, PII, moderation) call a model: each adds cost and
latency per message.

## What the Hub uses today

- Builder: `SkillsProcessor` (input) and the error processors (`harness/error-processors.ts`,
  Mastra Code's transient-failure policy).
- Connectors: `SensitiveDataFilter` on the recorded spans (`connectors/record.ts`).
- Hand-written guards that are candidates for a processor: the `web_fetch` and Context7 guards
  (C-023 amendment), and anything that redacts or filters messages in Hub code.

## Where they fit the waves

- **S3 (security).** Vendor bodies the Builder reads through `connector_fetch` are untrusted text
  that reaches the model: prompt injection from ERP data is a real path. `PromptInjectionDetector`
  on tool results, and `PIIDetector` or `RegexFilter` where a person's data must not reach a log or
  a stored message, are the native candidates.
- **Q4 open limit 7.** The stored thread keeps raw `connector_fetch` bodies. An output or memory
  processor that stores the projection instead is the native place to fix it.
- **S2.** The run's state the agent needs as a state lane (study 62); `TokenLimiter` or
  `TokenCostControl` instead of any Hub-made turn budget.
- **Generated apps.** The same processors protect an app's own agent when an app has one.

Rule for using them: prove the failure first, then add the processor that measures it away. No
detector "just in case": each one costs a model call per message.
