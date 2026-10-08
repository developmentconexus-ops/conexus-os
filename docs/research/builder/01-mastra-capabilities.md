# What a host hands a Mastra coding agent

Scope: the installed `@mastra/core` (1.71.0), `@mastra/code-sdk` (1.8.3, "Mastra Code"), `@mastra/factory`
(0.17.2), `@mastra/memory`, `@mastra/mcp`, `@mastra/observability`, `@mastra/e2b` in
`node_modules/@mastra/`. Read-only research.

Two layers exist and this audit covers both:

1. **`@mastra/core` primitives** — the generic framework (`Agent`, `Workspace`, `Memory`, `Processor`,
   `AgentController`, `createCodingAgent()`) any host can assemble a coding agent from.
2. **Mastra Code / Factory** — the concrete coding-agent product built on those primitives, which is where
   most of the "what does a host hand to a coding agent" surface actually lives (system-prompt assembly,
   modes, hooks, permissions, plugins, settings file, Factory session wiring).

Unconfirmed items are marked explicitly; nothing below is guessed.

## Capability table

| Capability | Function | How supplied | Context position / priority | Scope | Source |
|---|---|---|---|---|---|
| Base system prompt | Core behavioral instructions (explore/implement/verify loop, git conventions) | `buildBasePrompt(ctx: PromptContext)` | Section 1 of 5 (`base-prompt`), always first | Static per request (rebuilt each turn from current state) | `@mastra/core/dist/coding-agent/prompt.d.ts`; assembled in `@mastra/code-sdk/dist/agents/prompts/index.js:47-58` |
| Host instructions | Host-specific extra system guidance, e.g. product branding or deployment rules | `hostInstructions` string passed into `getDynamicInstructions()` | Section 2, right after base prompt | Per request (whatever the host passes that call) | `@mastra/code-sdk/dist/agents/instructions.d.ts:1-15`; `agents/prompts/index.js:96-100` |
| AGENTS.md / CLAUDE.md instructions | Project- and user-authored repo conventions | Files discovered on disk (`loadAgentInstructions`) | Sections 3..N, ordered global-first then project, right after host instructions | Static per project/session (re-read each turn unless untrusted checkout) | `@mastra/code-sdk/dist/agents/prompts/agent-instructions.d.ts`; wired in `agents/prompts/index.js:79-93` |
| Model-specific prompt | Per-model quirks/system patches | `modelSpecificPrompts` keyed by model id | Second-to-last section, after agent instructions | Static per model id (only 2 models currently: `openai/gpt-5.4`, `openai/gpt-5.5`) | `@mastra/code-sdk/dist/agents/prompts/model.d.ts`; `agents/prompts/index.js:101-104` |
| Mode prompt (build/plan/fast) | Behavioral rules for the active mode | `modePrompts[modeId]`, resolved from session `modeId` | Last section | Per turn (mode can change turn to turn) | `@mastra/code-sdk/dist/agents/prompts/{build,plan,fast}.d.ts`; `agents/prompts/index.js:70,105-110` |
| `pluginInstructions` | Instructions contributed by installed plugins | `state.pluginInstructions: string[]` appended after `buildFullPromptSections` | Appended **after everything else**, one section per plugin, wrapped in `<plugin-instructions>` with an explicit "must not override higher-priority instructions" preamble | Per session (state-persisted, mutated as plugins load/unload) | `@mastra/code-sdk/dist/schema.d.ts:96,211`; `agents/instructions.js:44-57` |
| Tool guidance | Per-tool usage rules, scoped to what's actually registered/allowed in the current mode | `buildToolGuidance(modeId, options)`, embedded **inside** the base prompt (not a separate top-level section) | Inside section 1 (base prompt), position fixed by `buildBasePrompt` | Per request (depends on mode, denied tools, subagents/subconscious flags) | `@mastra/code-sdk/dist/agents/prompts/tool-guidance.d.ts`; `agents/prompts/index.js:36-56` |
| Modes: build | Full tool access; implement, verify, prove, clean up loop | `buildModePromptFn` / `buildModePrompt` constant | Mode section | Per turn | `@mastra/code-sdk/dist/agents/prompts/build.d.ts` |
| Modes: plan | Read-only exploration + plan authoring; only `plans/` dir is writable | `planModePrompt(ctx)` | Mode section | Per turn | `@mastra/code-sdk/dist/agents/prompts/plan.d.ts`; enforcement in `agents/tool-availability.js:36-53` |
| Modes: fast | Minimal-overhead, short-answer mode | `fastModePrompt` constant | Mode section | Per turn | `@mastra/code-sdk/dist/agents/prompts/fast.d.ts` |
| Skills (filesystem-backed) | Reusable instruction bundles the agent discovers and loads on demand | `Workspace({ skills: [...] })`, `skillSource` for custom backends | Not injected inline — name/description/path listed in system message; body loaded only via `skill` tool call | Static per workspace config (or dynamic via a resolver function) | `@mastra/core/dist/docs/references/docs-sandbox-skills.md` |
| Skills (agent-level / inline) | Skill defined directly in agent code, no filesystem | `createSkill()` | Same discovery listing; direct skills win name collisions over filesystem skills | Static (agent config) | `@mastra/core/dist/docs/references/reference-agents-createSkill.md` (referenced) |
| Skill tools | Let the agent discover/read/search skills | `skill`, `skill_read`, `skill_search` tools, auto-added when skills configured | Tool list | Per session | `docs-sandbox-skills.md` |
| Tools / `createTool()` | Define a callable agent capability with typed I/O | `createTool({ id, inputSchema, outputSchema, execute, toModelOutput, transform, requireApproval, mcp, ... })` | Tool list (model-visible via tool-calling API, not prompt text) | Static per agent/tool config, resolvable dynamically via `RequestContext` | `@mastra/core/dist/docs/references/reference-tools-create-tool.md` |
| `toModelOutput` | Shrinks/reshapes raw `execute()` output before the model sees it (text/json/content incl. images) | Function on tool definition | Replaces the tool-result content sent to the model; app still gets raw output | Per tool call | `reference-tools-create-tool.md:52,216-265` |
| `transform` | Reshapes tool payloads for display/transcript streams, independent of model-facing output | `{ display: {...}, transcript: {...} }` on tool definition | Affects UI/transcript streams only, not the model prompt | Per tool call | `reference-tools-create-tool.md:54,267-309` |
| Permission categories | Risk classification of tools (read/edit/execute/mcp) | `ToolCategory`, `getToolCategory()`, `TOOL_CATEGORIES` | Governs tool-call gating, not prompt content | Static mapping, per-session grants layered on top | `@mastra/code-sdk/dist/permissions.d.ts:8-21` |
| Permission policy resolution | Decide allow/ask/deny for a tool call | `resolveApproval(toolName, rules, sessionGrants)`; priority: always-allowed tools → per-tool override → session grant → category policy → default "ask" | N/A (runtime gate before tool execution) | Per tool call, session grants persist for session | `permissions.d.ts:42-54` |
| YOLO mode | Auto-allow every tool category | `YOLO_POLICIES` (all categories `allow`); `state.yolo: boolean` | N/A | Per session (`schema.d.ts:80`) | `permissions.d.ts:31`; `schema.d.ts:80` |
| Workflows | Deterministic multi-step orchestration (steps, branches, parallel, suspend/resume) | `createWorkflow()` / `createStep()`; can be used as processors | Separate execution unit, not prompt text; agent can call via `list-workflows`/`get-workflow` tools | Static definition, resumable/suspendable per run | `@mastra/core/dist/docs/references/docs-workflows-overview.md` (index); plan/explore tool lists reference `list-workflows`, `get-workflow` in `agents/tool-availability.js:102-113` |
| Hooks | Shell-command lifecycle events (block, warn, inject context) | `HooksConfig` loaded from `$HOME/.mastracode/hooks.json` (global) + `.mastracode/hooks.json` (project); global runs first | Runs outside the model context; `PreToolUse`/`Stop`/`UserPromptSubmit` are blocking, others are lifecycle/observational | Per session (config reloadable), fired per event | `@mastra/code-sdk/dist/hooks/types.d.ts:5-9`; loader in `hooks/config.d.ts` |
| Subagents | Specialized delegate agents the parent can dispatch tasks to | `agents: { name: Agent }` on parent `Agent`; delegation hooks (`onDelegationStart`, `onDelegationComplete`), `messageFilter`, `enableResultReferences` | Subagent gets full parent conversation context; only delegation prompt+response saved to its own memory | Per delegation call (fresh thread each time); can run as background task | `@mastra/core/dist/docs/references/docs-subagents.md` |
| Memory: message history | Raw recent conversation | `Memory` default behavior | System context, recency-ordered | Per thread | `docs-memory-message-history.md` (index) |
| Memory: Observational Memory (OM) | Compresses long history into an Observer/Reflector-maintained observation log | `Memory({ options: { observationalMemory: {...} } })` | Replaces raw history above token threshold (default 30k msgs / 40k obs) | Per thread (default) or per resource (experimental) | `@mastra/core/dist/docs/references/docs-memory-observational-memory.md` |
| Memory: working memory | Small structured/markdown scratchpad (user profile, preferences) | `Memory({ options: { workingMemory: {...} } })`, `template` or `schema` | Folded into system message by default, or delivered as a state signal (`useStateSignals: true`) | Resource-scoped (default) or thread-scoped | `docs-memory-working-memory.md` |
| Memory: semantic recall | RAG-style retrieval of relevant past messages via vector search | `Memory({ vector, embedder, options: { semanticRecall: {...} } })` | Injected as recalled messages around matches (`messageRange`) | Per query (thread or resource scope) | `docs-memory-semantic-recall.md` |
| Observer / Reflector | Background agents that write observations / condense them into reflections | Configured via `observationalMemory.observation` / `.reflection` (models, thresholds, hooks) | Background process, not directly in the main model's turn | Continuous, thread- or resource-scoped | `docs-memory-observational-memory.md` (Observations/Reflections sections) |
| `RequestContext` | Per-request runtime values (user tier, locale, tenant, feature flags) | `new RequestContext()`, `.set()/.get()`, `requestContextSchema` for validation | Read by dynamic `instructions`, `model`, `tools`, `memory` functions — not injected as raw text | Per call (`generate()`/`stream()`), some reserved keys (`MASTRA_RESOURCE_ID_KEY`, `MASTRA_THREAD_ID_KEY`) | `@mastra/core/dist/docs/references/docs-server-request-context.md` |
| Input/output processors | Transform, validate, guard messages entering/leaving the model | `inputProcessors` / `outputProcessors` arrays on `Agent`; `Processor` interface (`processInput`, `processInputStep`, `processLLMRequest`, `processOutputResult`, `processOutputStream`, `processAPIError`) | Input processors run before the model call (after memory load); output processors run after generation, before persistence | Per call, can be overridden per `generate()`/`stream()` call | `docs-agents-processors.md` |
| MCP servers (client side) | Connect to external MCP servers and expose their tools to the agent | Config file discovery, priority low→high: `$HOME/.claude.json` → `$CODEX_HOME/config.toml` → `.claude/settings.local.json` → `$HOME/.mastracode/mcp.json` → `.mcp.json` → `.mastracode/mcp.json` | Tools namespaced `serverName_toolName`, merged into tool list | Per project/session, reloadable, per-server enable/disable persisted | `@mastra/code-sdk/dist/mcp/config.d.ts:1-15`; `mcp/manager.d.ts` |
| MCP servers (server side / tool annotations) | Expose Mastra tools to MCP clients with behavior hints | `mcp: { annotations, _meta }` on `createTool()` | Passed through MCP tool listing | Static per tool | `reference-tools-create-tool.md:311-354,499-524` |
| Workspace | Bundles filesystem + sandbox + skills + generated tools for an agent | `new Workspace({ filesystem, sandbox, skills, tools, mounts })` | Supplies `view`/`find_files`/`search_content`/`write_file`/etc. tools; described in system prompt | Static per agent, or resolvable per request/thread/user | `docs-sandbox-overview.md`; `reference-coding-agent-create-coding-agent.md` (Defaults table) |
| Sandbox | Isolated execution environment for commands/code | `LocalSandbox` (host-run by default; `isolation: 'seatbelt'|'bwrap'` for real isolation) or remote/container backends | Supplies `execute_command`, `get_process_output`, `kill_process` tools | Static, or per-user/thread via a resolver + `sandboxCacheKey` | `docs-sandbox-overview.md` |
| Filesystem | Persistent file storage outside/alongside the sandbox | `LocalFilesystem`, or provider-backed (S3, GCS, Drive) mountable via FUSE | Supplies file-read/write/search tools | Static or per-thread/user via resolver | `docs-sandbox-overview.md` |
| Custom commands / slash commands | User-authored command templates (`/git:commit` etc.) | Markdown files under commands dirs, discovered with priority: mastra project > claude project > opencode project > mastra user > claude user > opencode user | Expanded into the user turn before it's sent (variable substitution, shell execution) | Per invocation | `@mastra/code-sdk/dist/utils/slash-command-loader.d.ts` |
| Plugins | Installable bundles of tools, processors, signal providers, instructions | `MastraCodePlugin` object (`defineMastraCodePlugin`), loaded from local dir or GitHub, config schema + per-plugin config values | `instructions` field → becomes `pluginInstructions` state entries → prompt sections (see above); `tools`/`processors`/`signalProviders` merge into the running agent | Per session/process; reload on config or source change (`versionStamp`) | `@mastra/code-sdk/dist/plugin.d.ts`; `plugins/types.d.ts`; `plugins/loader.d.ts` |
| Model selection | Which LLM answers a given turn | `provider/model` string, resolved from settings model packs, per-mode defaults, per-thread overrides, subagent-specific overrides | Determines which `modelSpecificPrompts` entry (if any) is added | Per session/thread/mode, with per-message override support | `onboarding/settings.d.ts` (`models` block); `agents/prompts/model.d.ts` |
| Model-specific prompts | Patches for known model quirks | `modelSpecificPrompts: { 'openai/gpt-5.4': ..., 'openai/gpt-5.5': ... }` | Second-to-last prompt section | Static per model id | `agents/prompts/model.d.ts` |
| "Subconscious" (knowledge graph + reminder sidekick) | Experimental long-term knowledge store queried via `knowledge_*` / `ask_memory` tools | `isSubconsciousEnabled(vector)` (needs vector store + opt-in flag) + `hasSubconsciousTools(vector, state)` (also requires a resolved Factory org) | Adds tools + a tool-guidance section; refuses silently if a Factory session can't resolve its org | Per process (enablement) × per session (org-resolution gate) | `@mastra/code-sdk/dist/agents/memory.d.ts`; `knowledge-scope.d.ts` |
| Plans (`activePlan`) | An approved implementation plan the agent must follow in build mode | `state.activePlan: { title, plan, approvedAt } \| null`, written via `submit_plan` tool, approved by user | If set, `buildModePromptFn` **prepends** "# Approved Plan" + full plan text before the standard build prompt | Per session (persists until cleared/replaced) | `schema.d.ts:97-101`; `agents/prompts/build.js` (`buildModePromptFn`) |
| Settings file | Persistent user/global preferences (models, yolo, theme, MCP discovery, etc.) | `GlobalSettings` JSON at `getSettingsPath()`, loaded via `loadSettings()` | Not prompt text directly; resolves defaults consumed elsewhere (model ids, thinking level, LSP on/off feeding `deniedTools`) | Global (per machine/user), read at session/thread start | `@mastra/code-sdk/dist/onboarding/settings.d.ts` |
| Config dir (`.mastracode`) | Per-project/per-user config root (hooks, MCP, commands, plans archive) | `DEFAULT_CONFIG_DIR = ".mastracode"`, `validateConfigDirName()` | N/A (filesystem layout) | Static (project + home dir) | `@mastra/code-sdk/dist/constants.d.ts:1` |
| `untrustedCheckout` | Marks a checkout as attacker-writable (e.g. reviewing a PR branch) | `state.untrustedCheckout: boolean` | Suppresses reading AGENTS.md/CLAUDE.md from the working tree; a `baseRef` reader serves them from a trusted git ref instead, or they're skipped entirely | Per session | `schema.d.ts:28-38`; enforcement in `agents/prompts/index.js:80-92` |
| `skipGlobalInstructions` | Skip home-directory instruction files | `state.skipGlobalInstructions: boolean` | Removes the "Global instructions" prompt sections | Per session (hosts running sessions for someone else set this) | `schema.d.ts:44-47` |
| Observability / traces | Structured execution tracing, exporters, sampling, redaction | `ObservabilityRegistryConfig` (`default`, `configs`, `configSelector`, `sensitiveDataFilter`) on the `Mastra` instance | Out-of-band (span/trace store), not prompt content | Per Mastra instance, selectable per request via `configSelector` | `@mastra/core/dist/docs/references/reference-observability-tracing-configuration.md` |
| Scorers | Automated quality grading of agent/workflow outputs (model-graded, rule-based) | `scorers: { name: { scorer, sampling } }` on `Agent` or workflow step | Runs after generation, writes scores to storage; doesn't re-enter the prompt unless surfaced via a retry (`isTaskComplete` for subagents) | Per call, sampled via `sampling.rate` | `@mastra/core/dist/docs/references/docs-evals-overview.md` |
| Factory session | The Factory-specific wrapper around an `AgentController` session: hydrates OM settings, default model, source-control binding | `hydrateFactorySession()`, `resolveFactorySourceRepository()`, `ensureFactorySourceSession()` | Applied once at session creation (best-effort; failures don't sink the run) | Per Factory session | `@mastra/factory/dist/session/factory-session.d.ts` |
| `setupCommand` | Shell command run once per sandbox template to prepare a repo checkout | `setupCommand?: string` on the source-control repository record and on `FactorySandboxContext` | Runs inside `onStart`, before user turns; gated by a "setup already done" marker so it isn't re-run on every warm boot | Per repository/sandbox template | `@mastra/factory/dist/sandbox/session-sandbox.d.ts:17,47,129`; `storage/domains/source-control/base.d.ts:66,89,96` |
| `onStart` | Sandbox lifecycle hook run after Factory's own setup | Passed via `MastraFactorySandboxConfig` callback / `LocalSandbox({ onStart })` | Runs after `materialize`+`checkout`+`setupCommand`; errors here are fatal to `start()` | Per sandbox start (every boot, fresh or reconnect) | `sandbox/session-sandbox.d.ts:45-49,124-129`; `docs-sandbox-overview.md` (Hooks section) |
| Factory integrations | Provider adapters (GitHub, Linear, Jira, Slack, incident.io...) supplying intake/version-control/routes | `FactoryIntegration[]` passed to `MastraFactoryConfig.integrations` | Registers HTTP routes, storage domains, agent/session tools, intake, source control, diagnostics | Per Factory deployment | `@mastra/factory/dist/factory.d.ts` (`MastraFactoryConfig.integrations`) |
| Factory capabilities: Intake | Provider-neutral issue-tracker contract (list/get/update issues, comments) | `Intake` interface implemented per integration | Tool/route layer, not prompt text | Per integration | `@mastra/factory/dist/capabilities/intake.d.ts` |
| Factory capabilities: VersionControl | Provider-neutral PR/review/repo contract | `VersionControl` interface implemented per integration | Tool/route layer | Per integration | `@mastra/factory/dist/capabilities/version-control.d.ts` |
| Factory skills | Repo-local + bundled SKILL.md catalog specific to Factory operations | `listFactorySkills()` | Same skill-loading mechanism as core skills | Per Factory deployment | `@mastra/factory/dist/skills/catalog.d.ts` |

## System prompt layering (exact order and priority)

Source of truth: `@mastra/code-sdk/dist/agents/prompts/index.js` (`buildFullPromptSections`, compiled from
`index.ts`) plus `@mastra/code-sdk/dist/agents/instructions.js` (`getDynamicInstructionSections`).

The final prompt is `sections.map(s => s.content).filter(Boolean).join('\n\n')`
(`agents/prompts/index.js` — `joinPromptSections`). The sections, **in the exact order they are concatenated**:

1. **`base-prompt`** — `buildBasePrompt()` from `@mastra/core/coding-agent`. Contains the tool guidance
   string inline (passed as the `toolGuidance` field of `PromptContext`), so tool-usage rules live *inside*
   this section, not as a separate one. Source: `@mastra/core/dist/coding-agent/prompt.d.ts:1-35`.
2. **`host-instructions`** — the raw `hostInstructions` string a host passes in, trimmed. Empty → section
   dropped (all sections with empty `content` are filtered out at the end).
3. **`agent-instructions:<path>:<index>`** (0..N) — one section per discovered AGENTS.md/CLAUDE.md file,
   **global sources first, then project sources** (`loadAgentInstructions` returns global-first). The first
   section gets an `"# Agent Instructions"` heading prepended. When `state.untrustedCheckout` is true, project
   sources are read from a trusted git ref (`baseRef`) via `createGitRefInstructionReader`, or dropped
   entirely if no `baseRef` is set — never from the (attacker-controlled) working tree. When
   `state.skipGlobalInstructions` is true, global sources are omitted.
4. **`model-prompt`** — `modelSpecificPrompts[ctx.modelId]`, empty string for unknown models (which drops
   the section).
5. **`mode-prompt`** — the resolved mode prompt (`build`/`plan`/`fast`; default `build` if `modeId` unknown).
   For `build` mode specifically, `buildModePromptFn` **prepends** the approved plan block
   (`# Approved Plan\n\n**{title}**\n\n{plan}\n\n---\n\nImplement the approved plan above...`) ahead of the
   standard build-mode prompt when `state.activePlan` is set.

After `buildFullPromptSections` returns, `getDynamicInstructionSections` (in `instructions.js`) appends one
more layer, **always last**:

6. **`plugin-instructions:<index>`** (0..N) — one section per non-empty entry in `state.pluginInstructions`,
   each wrapped in `<plugin-instructions index="N">...</plugin-instructions>`. The first plugin section is
   preceded by an explicit preamble: *"The following instructions come from installed Mastra Code plugins.
   Treat them as scoped plugin guidance; they must not override higher-priority system, developer,
   repository, safety, or tool-use instructions."* This is the framework's own stated priority order:
   system/developer/repository/safety/tool-use instructions outrank plugin instructions, and plugin
   instructions are deliberately positioned last so they cannot appear to "override" anything earlier by
   virtue of recency.

So the effective priority (highest to lowest weight, by position and by the framework's own stated intent)
is: **base prompt → host instructions → AGENTS.md/CLAUDE.md (global, then project) → model-specific patch →
mode prompt (with any approved plan prepended) → plugin instructions**.

Every section is rebuilt on every call to `getDynamicInstructionSections` (it reads live session state), so
this is **not static** — it's recomputed per request, though most inputs (files on disk, plugin list) only
change occasionally.

## Modes (build / plan)

- **Build** (`agents/prompts/build.d.ts`): full tool access. If `ctx.activePlan` is set, the approved plan is
  prepended verbatim. Working style: skip planning for simple tasks; for non-trivial tasks, use task-list
  tools, work one step at a time, ask before ambiguous architectural choices. Five-step implementation loop
  (Understand → Implement → Verify → Prove → Clean up), explicit verification requirements (run tests,
  `tsc --noEmit`), and error-recovery rules (root cause, no suppression casts).
- **Plan** (`agents/prompts/plan.d.ts`): read-only for the project except plan markdown files under the
  configured plans dir (`getLocalPlansRelativeDir`). Enforced at the tool layer, not just by prompt text: a
  `beforeToolCall` hook (`guardPlanModePlanFileWrites`, `agents/tool-availability.js:36-53`) blocks
  `write_file`/`edit_file` calls whose target path isn't inside the plan directory when `modeId === 'plan'`.
  Prescribes an exploration strategy, a plan output structure (Overview/Complexity/Steps/Verification), and a
  `submit_plan` tool workflow, including "goal-ready" plans (explicit outcome, ordered steps, verification
  criteria) so a plan can optionally be promoted to a durable goal.
  Available tools in plan mode (`PLAN_MODE_AVAILABLE_TOOLS`, `agents/tool-availability.js:87-104`): `view`,
  `find_files`, `search_content`, `file_stat`, `lsp_inspect`, `write_file`, `string_replace_lsp`, `ask_user`,
  `submit_plan`, task tools, `notification_inbox`, `list-workflows`, `get-workflow`.
- **Fast** (`agents/prompts/fast.d.ts`): brevity-optimized (under 200 words unless required), skips planning,
  answers general programming questions from knowledge rather than searching the codebase, minimizes tool
  round-trips.
- There is also an implicit **Explore** tool list (`EXPLORE_MODE_AVAILABLE_TOOLS`,
  `agents/tool-availability.js:105-114`): `view`, `find_files`, `search_content`, `file_stat`, `lsp_inspect`,
  `ask_user`, `list-workflows`, `get-workflow` — read-only, no write/submit_plan. And a
  **goal-judge read-only tool set** (`GOAL_JUDGE_READONLY_TOOLS`, `tool-availability.js:115-121`): `view`,
  `search_content`, `find_files`, `file_stat`, `lsp_inspect` — used when a background judge evaluates goal
  completion without being able to mutate anything.

## Skills

- **Discovery**: `Workspace({ skills: [...] })` accepts directory paths, single skill dirs/files, or globs
  (`./**/skills`, `./**/SKILL.md`, max 4 directory levels below the glob base), or a function of
  `RequestContext` for dynamic sets. `skillSource` overrides discovery with a custom backend (e.g.
  `CompositeVersionedSkillSource` for a content-addressable blob store).
- **Format**: directory with required `SKILL.md` (YAML frontmatter: `name`, `description`, optional
  `license`, `compatibility`, `user-invocable`, `metadata`), plus optional `references/`, `scripts/`,
  `assets/`. Follows the Agent Skills spec (agentskills.io).
- **Loading**: stateless — the agent sees only name/description/path/source-type in the system message, and
  must call the `skill` tool to load `SKILL.md` body; `skill_read` reads specific files; `skill_search`
  searches (BM25/vector if configured, else case-insensitive text fallback).
  Source: `@mastra/core/dist/docs/references/docs-sandbox-skills.md`.
- **Precedence on name collision**: direct/inline agent skills (via `createSkill()`) beat filesystem-backed
  skills; among filesystem-backed skills, local project paths beat `.mastra/skills` beat `node_modules`
  paths; unresolvable ties throw.
- **Factory skills**: `listFactorySkills()` prefers repo-local versions over bundled ones, skips a skill
  missing from both roots (`@mastra/factory/dist/skills/catalog.d.ts`).

## Tools, `createTool()`, permissions, YOLO

- **`createTool()` options** confirmed from `reference-tools-create-tool.md`: `id`, `title` (display-only,
  not sent to the model), `description`, `inputSchema`/`outputSchema` (Standard JSON Schema — Zod/Valibot/
  ArkType), `strict`, `toModelOutput`, `transform` (`{ display, transcript }` × `{ input, output, error,
  approval, suspend, resume }`), `suspendSchema`/`resumeSchema`, `requireApproval`, `mcp` (`annotations`,
  `_meta`), `requestContextSchema`, `providerOptions`, `inputExamples`, `background`, `execute` (+
  `onInputStart`/`onInputDelta`/`onInputAvailable`/`onOutput` lifecycle hooks).
- **Permission categories**: `'read' | 'edit' | 'execute' | 'mcp'` (`permissions.d.ts:8`). Each maps to a
  policy `'allow' | 'ask' | 'deny'`. Resolution order (`resolveApproval`, `permissions.d.ts:42-54`):
  1) always-allowed tools (e.g. `ask_user`, `task_write`) → allow; 2) per-tool override in
  `rules.tools[toolName]`; 3) session grant (`SessionGrants`, "always allow" chosen mid-session);
  4) category policy; 5) fallback `"ask"`.
- **YOLO**: `YOLO_POLICIES` sets every category to `allow` (`permissions.d.ts:31`); toggled per session via
  `state.yolo: boolean` (`schema.d.ts:80`), independent of the base `DEFAULT_POLICIES` (which default to
  `"ask"`-equivalent behavior when unconfigured).
- **Workspace-generated tools**: `createMastraCodeWorkspaceTools(backgroundToolsEnabled)`
  (`agents/tool-availability.js:58-84`) wires `read_file`, `list_files`, `file_stat`, `grep`, `lsp_inspect`
  with optional background execution, plus the `beforeToolCall` hook that enforces the plan-mode write guard.

## Workflows

Deterministic, typed multi-step orchestration built with `createWorkflow()`/`createStep()`: sequential steps,
`.parallel()`, `.branch()`, loops (`.dountil()`/`.dowhile()`), suspend/resume, typed workflow state, time
travel (re-execute from a step), snapshotting for durability. Can be composed into agents/tools, or used as
`Processor` pipelines (parallel moderation checks, e.g.). Agents get `list-workflows`/`get-workflow` tools to
discover and inspect registered workflows (present in plan and explore mode tool lists,
`agents/tool-availability.js:102-103,112-113`). Full reference index:
`@mastra/core/dist/docs/references/docs-workflows-overview.md` and siblings (`docs-workflows-*.md`),
`reference-workflows-*.md`. Not deep-read beyond the index given task scope — **details of individual
workflow methods are unconfirmed beyond what's summarized here.**

## Hooks

Shell-command lifecycle hooks, loaded from `$HOME/.mastracode/hooks.json` (global, runs first) and
`.mastracode/hooks.json` (project, appends) — `@mastra/code-sdk/dist/hooks/config.d.ts`.

**Events** (`HookEventName`, `hooks/types.d.ts:5`): `PreToolUse`, `PostToolUse`, `Stop`, `UserPromptSubmit`,
`SessionStart`, `SessionEnd`, `Notification`, `AgentStart`, `AgentEnd`, `PermissionRequest`,
`PermissionResult`, `Interrupt`, `SubagentStart`, `SubagentEnd`.

- **Blocking** (`hooks/types.d.ts:6`): `PreToolUse`, `Stop`, `UserPromptSubmit` — can return
  `{ decision: 'block', reason }` to actually stop the action, or `additionalContext` to inject text.
- **Lifecycle/non-blocking** (`hooks/types.d.ts:8`): `AgentStart`, `AgentEnd`, `PermissionRequest`,
  `PermissionResult`, `Interrupt`, `SubagentStart`, `SubagentEnd` — observe only.
- Each hook is `{ type: 'command', command, matcher?: { tool_name }, timeout (default 10000ms), description }`,
  spawned via `/bin/sh -c`, receiving a JSON `HookStdin` payload (varies by event: tool name/input/output,
  user message, stop reason, worktree info, permission kind/decision, subagent type/task/model/result, etc.)
  and returning `HookStdout: { decision?, reason?, additionalContext? }`.
- `HookManager` (`hooks/manager.d.ts`) exposes one `run*` method per event and tracks the active `run_id` so
  every event fired during one agent run carries the same correlation id.

## Subagents

Core mechanism: `agents: { name: Agent }` on a parent `Agent`; the parent's `instructions` and each
subagent's `description` drive delegation decisions (docs-subagents.md). Key configurable behaviors:

- **Delegation hooks**: `onDelegationStart` (can reject, rewrite prompt, cap `maxSteps`),
  `onDelegationComplete` (`bail()`, replace `feedback` persisted to memory, replace `resultText` for the
  current run only). `hookErrorStrategy: 'throw'` turns a hook failure into a failed delegation instead of a
  silent pass-through; failures are recorded on `requestContext.__mastra_delegationHookErrors`.
- **`messageFilter`**: filters what conversation history the subagent receives (default: full parent
  context).
- **`RequestContext` at the delegation boundary**: shallow-copied from the parent (minus run-scoped identity
  keys); mutations during the subagent run don't leak back to the parent.
- **Memory isolation**: subagent sees full forwarded context but only its own delegation prompt+response are
  persisted to its memory; each delegation uses a fresh thread id.
- **`enableResultReferences`**: lets a later delegation reuse an earlier subagent's result verbatim via
  `[ref: id]` instead of restating it.
- **Background execution**: subagent calls can run as background tasks via `backgroundTasks.tools` config +
  `streamUntilIdle()`.
- **Tool-approval propagation**: `requireApproval`/`suspend()` inside a subagent surfaces to the parent's
  stream as `tool-call-approval`.
- Mastra Code-specific: `HookStdinSubagentStart`/`HookStdinSubagentEnd` fire the corresponding hook events
  with `agent_type`, `task`, `model_id`, `forked` (`hooks/types.d.ts:132-146`).

## Memory

- **Message history**: raw recent conversation, default behavior.
- **Semantic recall**: vector-search retrieval of past messages when they've fallen out of recent history.
  Config: `topK`, `messageRange`, `scope` ('thread'|'resource'), metadata `filter` (Mongo-style operators).
  Requires `vector` + `embedder`. Disabled by default.
- **Working memory**: small persistent scratchpad, Markdown `template` (replace semantics) or `schema`
  (merge semantics, Zod/Valibot/ArkType). Scope `'resource'` (default, persists across all threads for a
  user) or `'thread'`. `readOnly: true` for subagents/routers that shouldn't mutate it. Can be delivered as a
  state signal instead of folded into the system message (`useStateSignals: true`).
- **Observational Memory (OM)** — `@mastra/memory@1.1.0+`: an **Observer** watches conversation growth and
  writes dense observations when message tokens exceed a threshold (default 30,000); a **Reflector**
  condenses the observation log when it exceeds its own threshold (default 40,000), rewriting the whole log
  each time (bounded, not ever-growing). Async buffering pre-computes observations in the background so
  activation doesn't pause the agent. Extractors pull structured values (current task, suggested response,
  thread title, custom schemas) alongside observations. Retrieval mode keeps a `range` back-pointer from each
  observation group to its source messages, exposing a `recall` tool for browsing/semantic search over raw
  history. Scopes: `'thread'` (default, well-tested) or `'resource'` (experimental, cross-thread). Config-
  level hooks: lifecycle (`onObservationStart/End`, `onReflectionStart/End`) and transform
  (`beforeObservation`, `afterObservation`, `beforeReflection`, `afterReflection`).
  Source: `@mastra/core/dist/docs/references/docs-memory-observational-memory.md`.
- **Mastra Code's memory factory**: `getDynamicMemory(storage, vector?, settingsPath?)` reads OM thresholds
  from controller state via `RequestContext` per request (`@mastra/code-sdk/dist/agents/memory.d.ts`).

## The "subconscious" feature

An experimental knowledge-graph + reminder sidekick layered on top of OM. `isSubconsciousEnabled(vector)`
gates it on a configured vector store plus an opt-in flag; `hasSubconsciousTools(vector, state)` additionally
requires — for Factory-owned sessions — a resolved organization id (`state.factoryOrgId`); a Factory session
that cannot resolve its org **fails closed** and never registers the subconscious tools, because knowledge
must not be filed under a substituted identity. Registers `knowledge_*` tools and `ask_memory`; the system
prompt's tool guidance queries the same `hasSubconsciousTools` check so it never advertises tools that
weren't actually registered. `resolveKnowledgeScopeIdentity()` is the single source of truth for which
org/resource "rungs" a session's knowledge lives under — local (TUI/studio) sessions use the fixed literal
`"local"` org id; Factory sessions use the seeded `factoryOrgId`/project id.
Source: `@mastra/code-sdk/dist/agents/memory.d.ts`; `@mastra/code-sdk/dist/knowledge-scope.d.ts`.

## Processors (input / output)

`inputProcessors` run before the model call; `outputProcessors` run after generation, before the response
reaches the caller. With memory enabled, memory processors auto-wrap the user's array:
`[Memory] → [your inputProcessors]` and `[your outputProcessors] → [Memory]` — so an output guardrail that
calls `abort()` prevents the turn from being persisted to memory at all.

Processor interface methods (from `docs-agents-processors.md`): `processInput` (once, start of run),
`processInputStep` (per agentic-loop step — model/tool-choice switching), `processLLMRequest` (rewrite the
final provider-bound prompt, transient/non-persisted), `processLLMResponse` (react to the completed
response), `processOutputResult` (transform final messages), `processOutputStream` (filter/transform
streaming chunks, opt into `data-*` chunks via `processDataParts`), `processOutputStep` (validate + request
retry via `abort(reason, { retry: true })`), `processAPIError` (recover from provider 4xx and retry).
Built-ins: `TokenLimiter`, `ToolCallFilter`, `ToolSearchProcessor`, `ProviderHistoryCompat`, `ResponseCache`
(beta), `ModerationProcessor`, `PromptInjectionDetector`, `PIIDetector`, `UnicodeNormalizer`,
`PrefillErrorHandler` (auto-injected, handles Anthropic prefill errors). Retry budget governed by
`maxProcessorRetries` (default: disabled, or 10 if `errorProcessors` configured and left unset).

## MCP servers

**Client (consuming external MCP servers)** — config discovery order, lowest to highest priority
(`@mastra/code-sdk/dist/mcp/config.d.ts:1-15`):
1. `$HOME/.claude.json` (Claude Code global, opt-in)
2. `$CODEX_HOME/config.toml` (Codex CLI global, opt-in)
3. `.claude/settings.local.json` (Claude Code project compat)
4. `$HOME/.mastracode/mcp.json` (Mastra Code global)
5. `.mcp.json` (project root, Claude Code-compatible)
6. `.mastracode/mcp.json` (Mastra Code project)

Higher-priority configs override lower ones by server name. Tools land namespaced `serverName_toolName`.
Per-server enable/disable is persisted in Mastra Code's own app data (not the config files) and survives
restarts; a global kill switch can disable all MCP. OAuth for HTTP servers uses a Client ID Metadata Document
(SEP-991) so servers without a pre-registered client id can still identify Mastra Code.

**Server (exposing Mastra tools via MCP)**: `mcp: { annotations: { title, readOnlyHint, destructiveHint,
idempotentHint, openWorldHint }, _meta }` on `createTool()` — passed through to MCP tool listings.

## Workspace, sandbox, filesystem

- **`Workspace`**: bundles `filesystem` + `sandbox` + `skills` + `tools` config + `mounts`. Generates tools
  the model sees (`view`/`find_files`/`search_content`/`write_file`/`execute_command`/etc.), describes the
  workspace in the system prompt. `createCodingAgent()`'s default (when `workspace` key is omitted): a
  `Workspace` backed by `LocalFilesystem` + `LocalSandbox` rooted at `basePath` (default `process.cwd()`).
  Passing `workspace: undefined` explicitly opts out (e.g. when wired at the `AgentController` level).
- **`LocalSandbox`**: runs commands directly on the host with the app process's own permissions **by
  default** (explicit warning in the docs) — real isolation requires `isolation: 'seatbelt'` (macOS,
  `sandbox-exec`) or `'bwrap'` (Linux, Bubblewrap), plus `nativeSandbox: { allowNetwork, readOnlyPaths, ... }`.
- **Remote/container sandboxes**: AgentCore, Apple Container, Blaxel, Cloudflare Sandbox, Daytona, Docker,
  E2B, E2B Desktop, Mastra (platform), Modal, Railway, Vercel — each with its own isolation/persistence/
  networking model; a `SandboxProvider` interface lets you add unsupported backends.
- **Per-user/thread sandboxes**: a `sandbox` resolver function + `sandboxCacheKey` (e.g. keyed on
  `MASTRA_THREAD_ID_KEY`) caches one live sandbox per identity; the app owns cleanup
  (`workspace.clearSandboxCache`) — `workspace.destroy()` does not destroy resolver-returned sandboxes.
- **Lifecycle hooks**: `onStart`, `onStop`, `onDestroy` on the sandbox constructor, receiving the live
  sandbox instance.
- **Filesystem**: `LocalFilesystem` uses the host filesystem; remote sandboxes get isolated (often ephemeral)
  filesystems; provider-backed filesystems (S3, GCS, Drive) can be FUSE-mounted into a remote sandbox for
  persistence.
- **Mastra Code's own sandbox tool config**: `createMastraCodeWorkspaceTools(backgroundToolsEnabled)`
  wires `read_file`/`list_files`/`file_stat`/`grep`/`lsp_inspect` with optional background execution and
  attaches the `beforeToolCall` plan-mode write guard (`@mastra/code-sdk/dist/agents/tool-availability.js:58-86`).

## `RequestContext`

Typed per-request key/value bag passed into agents, tools, workflows. `.set()/.get()` for schema-declared
keys (typo-safe when a type param or `requestContextSchema` is given); `.setRaw()/.getRaw()` for
infrastructure keys outside the schema. Dynamic `instructions`, `model`, `tools`, `memory`, `agents`,
`scorers`, `inputProcessors`/`outputProcessors` can all be functions of `{ requestContext }`. Reserved keys:
`MASTRA_RESOURCE_ID_KEY` (forces memory ops to a specific resource, server validates ownership),
`MASTRA_THREAD_ID_KEY` (forces thread id), `MASTRA_MESSAGE_AUTHOR_KEY` (attributes a message to a specific
person in a shared thread). Schema validation timing/behavior: agent → throws at start of
`generate()`/`stream()`; tool → returns an error object instead of throwing, before `execute()`; workflow →
throws at `run.start()`; step → fails the step before its `execute()`.
Source: `@mastra/core/dist/docs/references/docs-server-request-context.md`.

## Custom / slash commands

Markdown command templates with variable substitution and shell-command execution, discovered by
`loadCustomCommands(projectDir, configDirName, extraCommandDirs)`. Priority (highest first, per the doc
comment): mastra project > claude project > opencode project > mastra user > claude user > opencode user.
Command name derived from file path (`git/commit.md` → `git:commit`); optional `goal: true` frontmatter also
exposes it as `/goal/<name>`. `processSlashCommand()` expands variables and runs any embedded shell commands
before the result becomes the user turn.
Source: `@mastra/code-sdk/dist/utils/slash-command-loader.d.ts`, `utils/slash-command-processor.d.ts`.

## Plugins

`MastraCodePlugin` (`defineMastraCodePlugin()`): `{ id, name?, version?, description?, config? (typed schema:
model/boolean/string options), instructions?, tools?, processors?, signalProviders? }`. All of `instructions`/
`tools`/`processors`/`signalProviders` can be static or a function of `MastraCodePluginContext` (`cwd`,
`scope: 'global'|'project'`, `pluginDir`, resolved `config`). `instructions` becomes a `pluginInstructions`
state entry, which becomes the last prompt sections (see layering above) — explicitly scoped as
lower-priority than system/developer/repository/safety/tool-use instructions. `processors` run "last in
Mastra Code's own configured processors — after the layers they customize, before the channel and memory
layers the agent appends" (fixed slot, not configurable). `tools` from a plugin appear in the tool list.
`signalProviders`' own `getTools()` is explicitly **ignored** — a plugin must inject tools from inside a
processor instead. Plugins are loaded from local dirs or GitHub, scoped `'global'|'project'`, tracked with a
`versionStamp` (git HEAD or entry-file version, mixed with config values) that consumers use to decide
whether to reload a long-lived instance (e.g. a signal provider).
Source: `@mastra/code-sdk/dist/plugin.d.ts`; `plugins/types.d.ts`; `plugins/loader.d.ts`.

## Model selection and model-specific prompts

Model choice is `provider/model` string resolution through several layers persisted in `GlobalSettings.models`
(`@mastra/code-sdk/dist/onboarding/settings.d.ts`): `activeModelPackId` (built-in or `custom:<name>` pack),
`modePackOverrides` (per-mode override within a pack), `packFallbacks` (pack-to-pack fallback chain on
exhaustion/outage, capped at one revisit per cascade), `modeDefaults` (explicit per-mode fallback when no
pack is active), `modeThinkingDefaults` (reasoning-effort per mode), `subagentModels` (per-agent-type
overrides), separate OM (`activeOmPackId`, `omModelOverride`, `observerModelOverride`,
`reflectorModelOverride`) and goal-judge (`goalJudgeModel`, `goalMaxTurns`) defaults. Only two models
currently get a dedicated system-prompt patch: `'openai/gpt-5.4'` and `'openai/gpt-5.5'`
(`agents/prompts/model.d.ts`) — **exact patch content unconfirmed** (only the `.d.ts` type was read; the
compiled `.js` was not inspected for the literal string).

## Settings file and config dir

- **Config dir**: `.mastracode` (`DEFAULT_CONFIG_DIR`, `@mastra/code-sdk/dist/constants.d.ts:1`), validated
  by `validateConfigDirName()` to reject path traversal/absolute paths/separators. Houses `hooks.json`,
  `mcp.json`, plan archives, plugin registries, commands, both at project scope (`.mastracode/`) and global
  scope (`$HOME/.mastracode/`).
- **Settings file**: `GlobalSettings` (JSON) at `getSettingsPath()`, loaded/saved via
  `loadSettings()`/`saveSettings()`. Top-level: `onboarding`, `models` (see above), `preferences` (`yolo`,
  `theme`, `thinkingLevel`, `subagentsEnabled`, `quietMode` + preview-line cap, `webSearchProvider`),
  `storage` (libsql/pg backend config), `customModelPacks`, `customProviders`, `modelUseCounts`,
  `memoryGateway`, `lsp`, `browser`, `shellPassthrough`, `voice`, `backgroundTools`, `signals`
  (`unixSocketPubSub`, experimental GitHub/cross-agent signals), `mcp` (`McpDiscoverySettings`:
  `claudeCodeGlobal`, `codexGlobal` opt-ins), `observability` (per-resource cloud project config +
  `localTracing` toggle).
  Source: `@mastra/code-sdk/dist/onboarding/settings.d.ts`.

## `untrustedCheckout` and `skipGlobalInstructions`

- **`untrustedCheckout`** (`state.untrustedCheckout: boolean`, `schema.d.ts:28-34`): set when the session's
  checkout may contain third-party content (e.g. a PR branch under review). Because project-level instruction
  files (AGENTS.md/CLAUDE.md) are then attacker-writable, they must not be ingested into the system prompt or
  injected as reminders from the working tree. Enforcement: `buildFullPromptSections` builds a
  `createGitRefInstructionReader(workingDir, baseRef)` when `untrustedCheckout && baseRef` is set (serves
  files from `git show <ref>:<path>`, trying `origin/<ref>` first), or an always-empty reader (files skipped
  entirely) when no `baseRef` is configured (`agents/prompts/index.js:80-84`). A parallel
  `createGitRefReminderReader` does the same for the reactive-reminder channel
  (`agent-instructions.d.ts` — `AgentsMDInjector`).
- **`skipGlobalInstructions`** (`state.skipGlobalInstructions: boolean`, `schema.d.ts:44-47`): skips
  home-directory instruction files (`$HOME/.claude/AGENTS.md` and similar) so a session run on someone else's
  behalf never inherits the machine owner's personal configuration. Passed as `{ skipGlobal }` into
  `loadAgentInstructions()`.

## Observability, traces, scorers

- **Observability**: `ObservabilityRegistryConfig` on the `Mastra` instance — `default: { enabled }` (auto
  `MastraStorageExporter` + `MastraPlatformExporter`), `configs` (named `ObservabilityInstanceConfig`s or
  pre-built instances: `serviceName`, `sampling` (`always`/`never`/`ratio`/`custom`), `exporters`,
  `spanOutputProcessors`, `includeInternalSpans`, `excludeSpanTypes`, `spanFilter`, `requestContextKeys`,
  `serializationOptions` (string/depth/array/object-key caps), `logging` (forward logs to observability
  storage, level filter)), `configSelector` (pick a config per-request from `RequestContext`),
  `sensitiveDataFilter` (auto-applied `SensitiveDataFilter`, on by default, configurable/opt-outable).
  Source: `@mastra/core/dist/docs/references/reference-observability-tracing-configuration.md`.
- **Scorers**: `createScorer()` (custom) or prebuilt (`createAnswerRelevancyScorer`, `createToxicityScorer`,
  etc. from `@mastra/evals/scorers/prebuilt`). Attached via `scorers: { name: { scorer, sampling } }` on an
  `Agent` or a workflow step; each step-level scorer sees that step's own input/output. Live evaluation runs
  async alongside normal execution; can also run in CI via `runEvals` against datasets. Subagent task-
  completion scoring (`isTaskComplete: { scorers, strategy, onComplete }`) feeds failed-check feedback back
  into the conversation so the parent agent can retry.
  Source: `docs-evals-overview.md`; task-completion scoring cross-referenced in `docs-subagents.md`.

## Factory-specific additions

- **Factory session**: `hydrateFactorySession(session, { orgId, factoryProjectId?, defaultModelId?,
  memorySettings? })` applies a factory project's OM settings then its default model to a freshly created
  session — both steps best-effort (a bad model id or unreachable settings row logs and falls back to the
  SDK's built-in defaults rather than failing the run). `refreshFactorySessionMemorySettings()` re-applies
  current OM settings to an already-running session an automation is about to reuse (initial hydration only
  happens once at creation). `resolveFactorySourceRepository()`/`ensureFactorySourceSession()` resolve which
  linked repository and branch a Factory run acts on, attributing the run to an interactive approver when one
  exists, else to whoever connected the repository.
  Source: `@mastra/factory/dist/session/factory-session.d.ts`.
- **`setupCommand`**: a shell command tied to a linked repository (`storage/domains/source-control/base.d.ts:
  66,89,96`) and carried into `FactorySandboxContext.setupCommand` (`sandbox/session-sandbox.d.ts:17`) — part
  of the sandbox template's identity (a different setup command means a different template). Run inside
  `createSessionSetupHook()`'s `SessionSetupRun`, gated by a `SessionSetupGate` (`setupDone` marker) so it
  doesn't re-run on every warm boot — but `materialize`/`checkout` always run.
- **`onStart`**: the deployer's sandbox callback (`MastraFactorySandboxConfig = (ctx) => MastraSandbox`) may
  pass its own `onStart`; Factory attaches its own session-setup hook via `setOnStart` first, and a
  callback-supplied `onStart` runs **after** Factory's own setup, against an already-prepared workspace.
  Throwing in `onStart` is fatal to `start()` (core treats it as an unrecoverable boot failure).
  Source: `sandbox/session-sandbox.d.ts:45-49,124-129`.
- **Integrations**: `FactoryIntegration[]` on `MastraFactoryConfig.integrations` — each contributes HTTP
  routes, storage domains, agent/session tools, intake, source control, and diagnostics. Missing `github`,
  `gitlab`, `linear`, `jira`, `incidentio` integrations default to Platform-backed implementations when
  Platform credentials are configured. Source: `@mastra/factory/dist/factory.d.ts`.
- **Capabilities**: fixed provider-neutral contracts every integration implements a subset of —
  `Intake` (issue tracker: `listSources`, `listItems`, `listIssues`, `getIssue`, `createComment`,
  `updateIssue`) and `VersionControl` (repositories, PR lifecycle, reviews, comments, reviewers) — plus
  `IntegrationConnection` (`app-installation` or `oauth`) as the shared auth shape.
  Source: `@mastra/factory/dist/capabilities/{intake,version-control,connection}.d.ts`.
- **Factory skills**: `listFactorySkills()` — repo-local skills override bundled ones; a skill missing from
  both roots is skipped. Source: `@mastra/factory/dist/skills/catalog.d.ts`.
- **Sandbox lifecycle**: `getSessionSandbox`/`resolveSessionWorkdir`/`peekSessionSandbox`/
  `evictSessionSandbox` — a per-process session-id → sandbox memo (construction is cheap/side-effect-free by
  contract; VMs provision only on `start()`). `resolveSessionWorkdir` probes a remote sandbox's actual home
  directory with one `pwd` command rather than assuming a path. Source: `sandbox/session-sandbox.d.ts`.

## Unconfirmed / out of scope

- The literal text of `modelSpecificPrompts['openai/gpt-5.4']` / `['openai/gpt-5.5']` — only the `.d.ts` type
  was read, not the compiled `.js` string content.
- Individual workflow step-method semantics (`.dountil()`, `.branch()`, time travel exact API) — only the doc
  index was consulted, not each reference page, given the breadth of this audit.
- Exact wording of `buildBasePrompt()`'s returned string — the reference doc describes its parameters and
  purpose but the literal prompt text lives in compiled `.js` in `@mastra/core/dist/coding-agent/index.js`,
  not inspected line-by-line here.
- Whether `@mastra/e2b` (listed among the installed packages) contributes anything beyond an `E2BSandbox`
  backend — not separately audited; assumed to be one of the "remote sandboxes" listed in
  `docs-sandbox-overview.md`.
