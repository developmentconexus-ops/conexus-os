# External coding-agent harnesses: what they let you hand to the agent

Scope: Claude Code (Anthropic), Codex CLI (OpenAI), and Pi (Mario Zechner, `badlogic/pi-mono`,
`packages/coding-agent`). Read-only research, medium effort, no subagents spawned. Every claim below
carries a source URL; anything I could not confirm against a primary source is marked **[unconfirmed]**.

Dates matter here: Claude Code and Codex both ship fast, and some fields below (v2.1.xxx version gates,
"recently added" features) may already have moved by the time this is read.

---

## 1. Comparison table

| Capability | Claude Code | Codex CLI | Pi |
|---|---|---|---|
| **System prompt** | Not published/editable directly. Fixed base prompt (~4.2k tokens per Claude Code's own context-window visualization) plus `--append-system-prompt` to add, or an **output style** to replace the coding-specific portion. [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings), [code.claude.com/docs/en/output-styles](https://code.claude.com/docs/en/output-styles), [code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window) | Built-in `default.md` base instructions (~1-2k words, plain prose, "concise, direct, friendly") committed in the OSS repo; overridable wholesale via `model_instructions_file`, or extended via `developer_instructions` / `developer_instructions_file` (`file_content + "\n\n" + developer_instructions`). [github.com/openai/codex base_instructions/default.md](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md), [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | Deliberately **under 1,000 tokens**: one sentence of role, a 4-line tool summary, basic usage notes, a docs pointer. Explicit thesis: frontier models are already RL-trained to know what a coding agent is. [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |
| **Repo instructions file** | `CLAUDE.md` (hierarchical: managed policy → user → project → local; also reads `AGENTS.md` when no `CLAUDE.md` exists, or both via a setting). Loaded as a **user message after the system prompt**, not part of it. [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) | `AGENTS.md` at multiple scopes: `$HOME/.codex/AGENTS.override.md` / `AGENTS.md` (global, first non-empty wins), then walks Git root → cwd, one file per directory, `AGENTS.override.md` > `AGENTS.md` > configured fallback names; concatenated root-to-leaf so closer-to-cwd files "win" by appearing later; capped at `project_doc_max_bytes` (32 KiB default). [learn.chatgpt.com agents-md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) | `AGENTS.md` (also reads `CLAUDE.md`/`AGENTS.MD`/`CLAUDE.MD` as aliases), discovered from "the agent directory" (global) down through the working directory and its parents; `AGENTS.override.md` replaces same-directory `AGENTS.md`; discovery does **not** require project trust. [github.com/badlogic/pi-mono configuration.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/configuration.md) |
| **Skills** | `SKILL.md` (name+description frontmatter, open Agent Skills standard). Progressive disclosure: description always loaded, full body on trigger, supporting files/scripts on demand. Can fork into a subagent (`context: fork`), restrict invocation (`disable-model-invocation`, `user-invocable`), inject shell output at load time. [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) | Same `SKILL.md` convention (name+description, optional `scripts/`, `references/`, `assets/`, plus an `agents/openai.yaml` for UI). Discovery: repo `.agents/skills` up to repo root, then user `$HOME/.agents/skills`, then admin/system levels. Catalog capped at 2% of context window or 8,000 chars; explicit `$skill-name` or implicit selection. Supersedes the now-deprecated custom-prompts mechanism. [learn.chatgpt.com build-skills](https://learn.chatgpt.com/docs/build-skills) | Same `SKILL.md` shape (name, description, license, compatibility; optional `allowed-tools`, `disable-model-invocation`). Discovery: `$HOME/.agents/skills/` (user) and `.agents/skills/` (project, recursive to repo root). Two-phase load: name+description+path in the system prompt, full body on match or explicit `/skill:name`. [github.com/badlogic/pi-mono skills.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md) |
| **Tools** | Large built-in tool surface (Read, Write, Edit, Bash, Grep, Glob, Agent, TaskCreate/TaskUpdate/TaskList, WebFetch, WebSearch, Artifact, etc.), each with its own schema; MCP tools deferred by default and loaded via tool search. [code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window) | `shell`/unified-exec tool (PTY-backed by default off-Windows), `update_plan`, `view_image`, apps/connector tools, MCP tools; per-tool feature flags (`features.shell_tool`, `features.unified_exec`). [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | Exactly **four**: `read`, `write`, `edit`, `bash`. Everything else (search, GitHub, docs lookup) is "run it via bash." Extensions can register more tools, but the shipped default is intentionally minimal. [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |
| **Subagents** | First-class: `.claude/agents/*.md` (frontmatter: name, description, tools, model, permissionMode, maxTurns, skills, memory), isolated context window, own system prompt, returns only a summary; a **fork** variant inherits full parent context/system prompt instead. [code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents) | `agents.<name>` config table (description, model, reasoning effort, `config_file`), `agents.max_concurrent_threads_per_session`; a multi-agent tool surface (`features.multi_agent`). [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | **Deliberately absent.** Stated rationale: "zero visibility into what that sub-agent does... a black box within a black box." Recommended substitute: spawn another `pi` process via `bash` so its full transcript stays observable. [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |
| **Hooks** | ~25+ lifecycle events (SessionStart/End, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest/Denied, Stop, SubagentStart/Stop, PreCompact/PostCompact, FileChanged, CwdChanged, ConfigChange, Notification, …). Handler types: command, http, mcp_tool, prompt, agent. Configured in `settings.json` `hooks` block, plugin `hooks/hooks.json`, or skill/agent frontmatter. Exit code 2 or JSON `permissionDecision` controls blocking. [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks) | Newer, convergent surface: `features.hooks` + `hooks.<Event>` table in `config.toml` (or `hooks.json`), same event vocabulary — PreToolUse, PermissionRequest, PostToolUse, PreCompact/PostCompact, SessionStart/End, SubagentStart/Stop, UserPromptSubmit, Stop, Interrupt. `allow_managed_hooks_only` lets an org lock out user/project hooks. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md); event-name overlap also reported second-hand [agenticcontrolplane.com codex hooks reference](https://agenticcontrolplane.com/blog/codex-cli-hooks-reference) **[partially unconfirmed — rollout/version gating of individual events not verified against a Codex changelog]** | Extensions provide the equivalent surface as TypeScript event hooks rather than a declarative config: `session_start/shutdown`, `before_agent_start`, `agent_start`…`agent_end`, `agent_before_settle`/`agent_settled`, `message_end`, `tool_call`, `tool_result`, `provider_stream_event`, `context`/`context_with_system`, `turn_end`, `user_bash`, `cache_warming_decision`. No separate "hooks" primitive; hooks are just one thing an extension registers. [github.com/badlogic/pi-mono extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) |
| **Memory** | Two systems: `CLAUDE.md` (human-written, hierarchical) and **auto memory** (Claude writes `MEMORY.md` + topic files to `$HOME/.claude/projects/<project>/memory/`, first 200 lines/25KB of `MEMORY.md` loaded every session, topic files read on demand). Survives compaction; subagents don't inherit it unless forked. [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory) | `memories.*` config family (`features.memories`, off by default): generates and injects memories from past threads, with consolidation, staleness, and rate-limit-aware controls (`max_unused_days`, `min_rollout_idle_hours`, etc.). No separate always-on "auto memory writes notes as it works" loop comparable to Claude Code's — it is thread-history-derived. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | No auto-memory system. Persistence is the **session tree** itself (see Compaction row) plus whatever the agent is told to write to files (e.g., a `PLAN.md` it maintains across runs) — memory is explicitly pushed to disk artifacts, not a hidden store. [github.com/badlogic/pi-mono how-pi-works.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/how-pi-works.md), [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |
| **MCP** | Full client: local/project/user scopes, stdio/http/sse(deprecated)/websocket transports, OAuth, tool-name convention `mcp__server__tool`, **tool search** defers full schemas until needed to control context cost. [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) | Full client: `mcp_servers.<id>` table (stdio command/args/env or HTTP url, OAuth, bearer token, per-tool `approval_mode`, `enabled_tools`/`disabled_tools`, timeouts). [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | **Deliberately absent.** Measured cost cited as rationale: Playwright MCP ≈ 13.7k tokens / Chrome DevTools MCP ≈ 18k tokens dumped into context every session regardless of use. Substitute: CLI tools with a README the agent reads on demand (progressive disclosure without a protocol). [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |
| **Permissions / sandbox** | Tiered: per-tool ask/allow/deny rules, `permissions.allow/ask/deny` merged across scopes, workspace trust gate for repo-supplied settings, OS-level sandbox concept referenced but modes centered on **prompting**, not process isolation. [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions) | Two independent layers: **sandbox_mode** (`read-only` / `workspace-write` / `danger-full-access`, OS-native enforcement — Seatbelt on macOS, bubblewrap/Landlock-family on Linux/WSL2) and **approval_policy** (`on-request` / `never` / a `granular` table splitting sandbox-escalation, exec-policy, MCP elicitation, permission-tool, and skill-script prompts). Presets: Auto = workspace-write + on-request; `--yolo` = danger-full-access + no approvals. [learn.chatgpt.com sandboxing](https://learn.chatgpt.com/codex/sandboxing), [learn.chatgpt.com agent-approvals-security](https://learn.chatgpt.com/codex/agent-approvals-security) | No default sandbox: ships in **full YOLO mode**, OS-user permissions, no per-call approval. Stated position: runtime approval is "security theater" once a process can read data, execute code, and reach the network; real isolation has to happen *before* the process starts (container/VM, isolated-tool-execution-only, or a dedicated low-privilege OS user). Project trust gates whether `.pi/` extensions/skills/system-prompt overrides load at startup, but is explicitly **not** a runtime boundary. [github.com/badlogic/pi-mono security.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/security.md) |
| **Modes** | Permission modes: `default`(manual)/`acceptEdits`/`plan`/`auto`/`dontAsk`/`bypassPermissions`; separately, **output styles** (Default/Proactive/Concise/Explanatory/Learning, or custom) reshape tone/behavior without touching permissions. [code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) (permission modes table), [code.claude.com/docs/en/output-styles](https://code.claude.com/docs/en/output-styles) | Approval/sandbox combos double as "modes" (Auto, read-only+on-request, CI read-only+never, `--yolo`); `personality` config (`none`/`friendly`/`pragmatic`) is the closest analog to an output style. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | No named mode system beyond the security posture above; behavior is shaped through system-prompt append, `AGENTS.md`, extensions, and slash commands rather than a mode enum. **[unconfirmed — no dedicated "modes" doc found]** |
| **Commands** | Slash commands **merged into skills**: legacy `.claude/commands/*.md` still works, but `.claude/skills/<name>/SKILL.md` is the recommended form; `$ARGUMENTS`/`$0`/named-arg substitution; `disable-model-invocation` for you-only commands. [code.claude.com/docs/en/slash-commands](https://code.claude.com/docs/en/slash-commands) | **Custom prompts are deprecated in favor of skills**, but still work: Markdown files in `$HOME/.codex/prompts/`, invoked `/prompts:name`, positional/named/`$ARGUMENTS` substitution; explicit-invocation only (never auto-triggered). [learn.chatgpt.com custom-prompts](https://learn.chatgpt.com/docs/custom-prompts) | **Prompt templates**: Markdown files (e.g. `$HOME/.pi/agent/prompts/review.md` → `/review`), bash-style `$1`/`$@`/`${1:-default}`/`${@:N:L}` substitution; distinct from skills (no bundled scripts/references) and from extensions (no executable behavior). [github.com/badlogic/pi-mono prompt-templates.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md), [slash-commands.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/slash-commands.md) |
| **Plugins / extensions** | Plugin = directory bundling skills+agents+hooks+MCP servers+output styles under one `.claude-plugin/plugin.json`, installed from a marketplace (`.claude-plugin/marketplace.json`) at user/project/local scope; an enabled plugin's invocable-skill/agent descriptions sit in context on every turn even when unused. [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) | `marketplaces.<name>` (git or local source) + `plugins.<plugin>` config, bundling MCP servers with per-tool approval overrides; a local-marketplace model similar in shape to Claude Code's. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | **Extensions**: TypeScript modules exporting a factory `(pi: ExtensionAPI) => void`, run with full OS permissions of the Pi process, register tools/commands/providers/event-hooks/shortcuts. Loaded as single files or `index.ts` dirs from user/project dirs or `--extension <path>`; no separate "plugin bundle" or marketplace concept — an extension *is* the unit. [github.com/badlogic/pi-mono extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md) |
| **Compaction** | `/compact` (manual) or auto-compaction near the context limit: replaces conversation with a structured summary; startup content (system prompt, CLAUDE.md, memory, MCP tool list) reloads automatically; up to 5 most-recently-modified files re-read; skills you invoked are re-injected (capped 5,000 tokens/skill) — the skill *index* itself is not reloaded. [code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window) | `model_auto_compact_token_limit` (+ `_scope`), `compact_prompt` / `experimental_compact_prompt_file` to override the summarization prompt. Mechanics of what's kept vs. dropped **[unconfirmed in detail — only the trigger/override keys were confirmed, not the exact re-injection behavior]**. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | Auto-triggers when `contextTokens > contextWindow - reserveTokens` (reserve default 16,384); walks backward to a cut point keeping `keepRecentTokens` (default 20,000) verbatim; LLM-generates a **structured** summary (Goal / Constraints & Preferences / Progress / Key Decisions / Next Steps / Critical Context) plus tracked `readFiles`/`modifiedFiles`; on an overflow error it compacts and retries the failed turn automatically; branch-aware (summarizes abandoned branches too). Manual `/compact [instructions]` also available. [github.com/badlogic/pi-mono compaction.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md) |
| **Planning / todos** | Structured **Task tools** (TaskCreate/TaskUpdate/TaskList/TaskGet) persisted under `$HOME/.claude/tasks/`, multi-session, superseding the older ephemeral `TodoWrite` (now a legacy path, off by default in current versions). [code.claude.com/docs/en/agent-sdk/todo-tracking](https://code.claude.com/docs/en/agent-sdk/todo-tracking) **[not fetched directly — summarized from search index]** | `update_plan` tool for non-trivial multi-step work, described in the base system prompt as breaking work into "meaningful, verifiable steps." `features.goals` (default on) adds persisted goals with auto-continuation. [github.com/openai/codex base_instructions/default.md](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md), [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md) | **Deliberately absent as a built-in tool.** Stated rationale: "to-do lists generally confuse models more than they help... they add state the model has to track." Recommended substitute: the agent writes/updates a plain Markdown checklist or `PLAN.md` file itself, using the four base tools — observable, diffable, persists across sessions without a special primitive. [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/) |

---

## 2. Claude Code

Primary source: [code.claude.com/docs](https://code.claude.com/docs/en). Personal installation
settings and plugin configuration are omitted from this public study.

### System prompt and `--append-system-prompt`
The base system prompt isn't published or directly editable; the documented levers are `CLAUDE.md`
(injected as a user message, not the system prompt), an **output style** (replaces or extends the
coding-specific instructions), and `--append-system-prompt` (adds to the system prompt at launch,
works in interactive mode since v1.0.51, most useful for scripts/`-p` automation).
[code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) §"Use the /config menu"
says explicitly: "Claude Code's system prompt isn't published." The context-window visualization
places the system prompt at ~4,200 tokens, loaded first and invisibly, before auto memory, environment
info, deferred MCP tool names, and the skill index.
[code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window)

### Memory hierarchy
Five sources, broadest to narrowest, concatenated (not overridden) into context at launch: managed
policy CLAUDE.md → `$HOME/.claude/CLAUDE.md` (user) → project `./CLAUDE.md`/`./.claude/CLAUDE.md` →
`./CLAUDE.local.md` (personal, gitignored). Files in subdirectories load lazily when Claude reads a
file there. `@path/to/import` pulls in additional files (max depth 4, external imports need one-time
approval). `AGENTS.md` is read instead of `CLAUDE.md` when no `CLAUDE.md`/`CLAUDE.local.md` exists on
the path (configurable to read both). Separately, **auto memory** is Claude's own notes
(`user`/`feedback`/`project`/`reference` types) written to `$HOME/.claude/projects/<project>/memory/`,
with a `MEMORY.md` index (first 200 lines / 25 KB loaded every session) and on-demand topic files.
Project-root `CLAUDE.md` and auto memory both survive `/compact`; nested CLAUDE.md and path-scoped
rules reload only as matching files are read. [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)

### Skills, subagents, hooks, commands
All four are documented in depth in the comparison table above; the standout structural point is that
**slash commands have been merged into skills** — a `.claude/commands/*.md` file still works, but
`.claude/skills/<name>/SKILL.md` is now the canonical form, and the two share frontmatter almost
entirely. [code.claude.com/docs/en/slash-commands](https://code.claude.com/docs/en/slash-commands)
Hooks are the most exhaustively specified lifecycle system of the three harnesses reviewed: 25+ named
events, five handler types (command/http/mcp_tool/prompt/agent), and per-event schemas for what's
blockable and what JSON fields it returns.
[code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks)

### Plugins, MCP, settings, permissions
A plugin is a directory bundling any mix of skills, agents, hooks, and MCP servers under one
`.claude-plugin/plugin.json`, fetched from a marketplace (`.claude-plugin/marketplace.json`) or a raw
folder. Anthropic's official marketplace auto-adds on first interactive session.
[code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins) Settings resolve through
five precedence levels — managed > `--settings` (CLI) > project-local > shared-project > user — with
most list-valued keys (like `permissions.allow`) merging rather than overriding across levels, and a
short list of security-sensitive keys where the **stricter** value wins regardless of level.
[code.claude.com/docs/en/settings](https://code.claude.com/docs/en/settings) Permission modes run from
fully manual (`default`) through `acceptEdits`, `plan`, `auto` (classifier-checked), `dontAsk`
(auto-deny), to `bypassPermissions` (skip prompts, still protects `.git`/`.claude` and cross-session
messaging). [code.claude.com/docs/en/permissions](https://code.claude.com/docs/en/permissions)

### Agent SDK, todos, compaction
The Agent SDK exposes the same primitives programmatically: `systemPrompt` (string, or
`{type:'preset', preset:'claude_code', append}`), `hooks` as in-process callbacks for the same event
set, `agents` for subagent definitions, `permissionMode` including a mid-session `setPermissionMode()`.
[platform.claude.com/docs/en/agent-sdk](https://platform.claude.com/docs/en/agent-sdk/subagents)
**[synthesized from search index, not fetched from the SDK reference page directly]** Task planning
has moved from the older ephemeral `TodoWrite` tool to a persistent `TaskCreate`/`TaskUpdate`/
`TaskList`/`TaskGet` suite backed by `$HOME/.claude/tasks/`, which survives across sessions and broadcasts
updates; `TodoWrite` is now a disabled-by-default legacy path.
[code.claude.com/docs/en/agent-sdk/todo-tracking](https://code.claude.com/docs/en/agent-sdk/todo-tracking)
**[not fetched directly — summarized from search index; treat version/flag details as unconfirmed]**
Compaction (manual `/compact` or automatic) rebuilds the session as: reloaded startup content (system
prompt, CLAUDE.md, memory, MCP tool list) + a structured conversation summary + the five most recently
modified files re-read + the body of each skill actually invoked (capped 5,000 tokens/skill, index not
reloaded). [code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window)


---

## 3. Codex CLI (OpenAI)

Primary sources: the `openai/codex` GitHub repo and its hosted docs, which now live at
`developers.openai.com/codex` → redirect → `learn.chatgpt.com/docs/...` (the in-repo `docs/*.md` files
are largely stub pointers to the hosted docs as of this research).

### AGENTS.md discovery and precedence
Global scope first: `$HOME/.codex/AGENTS.override.md`, else `$HOME/.codex/AGENTS.md` (only the first
non-empty file loads). Project scope: from the Git root (or cwd if no Git root) down to the working
directory, checking `AGENTS.override.md` → `AGENTS.md` → any names in
`project_doc_fallback_filenames` at each level, at most one file per directory. Files concatenate
root-to-leaf with blank lines between them, so files closer to cwd "override earlier guidance because
they appear later in the combined prompt" — the same root-to-leaf-ordering trick Claude Code uses for
its own CLAUDE.md hierarchy. Total size caps at `project_doc_max_bytes` (32 KiB default); the chain
rebuilds fresh every run/session, no caching.
[learn.chatgpt.com agents-md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

Separately, the `openai/codex` repository's own root `AGENTS.md` is a contributor-facing Rust
development guide (crate-naming conventions, `codex-core` bloat warnings, `just test`, API versioning
rules, 500–800 line change-size guidance) — a reminder that a repo's `AGENTS.md` is itself just an
instance of the mechanism, aimed at whichever agent (human or model) reads it.
[github.com/openai/codex/blob/main/AGENTS.md](https://github.com/openai/codex/blob/main/AGENTS.md)

### config.toml, profiles, approval and sandbox modes
`config.toml` is large and organized by feature area (model/provider, approval/security, sandbox,
network proxy, permission profiles, MCP, notify/logging, profiles, hooks, browser/computer use, shell
environment, skills/apps, multi-agent, memories, instructions/personality, history, web search, feature
flags, UI, telemetry, plugins/marketplaces) — see the comparison table and full key list gathered from
the master reference. [learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)
**Profiles** are separate files at `$CODEX_HOME/<profile-name>.config.toml`, selected with
`--profile <name>`; a project-local `.codex/config.toml` is explicitly barred from overriding
machine-local keys (`model_provider`, `model_providers`, `notify`, `profile`, `profiles`, `otel`,
base URLs), which must live in user-level config — the opposite of Claude Code, where most values are
freely overridable by project settings but a short list of security keys is protected. Security is two
independent layers: **sandbox_mode** (`read-only` / `workspace-write` / `danger-full-access`, enforced
OS-natively — Seatbelt on macOS, bubblewrap on Linux/WSL2) and **approval_policy** (`on-request` /
`never` / a `granular` table for sandbox-escalation, exec-policy rules, MCP elicitations,
`request_permissions` calls, and skill-script approval, each independently toggle-able). The default
recommended pairing is `workspace-write` + `on-request`; `codex exec --sandbox danger-full-access` /
`--yolo` drops both. [learn.chatgpt.com sandboxing](https://learn.chatgpt.com/codex/sandboxing),
[learn.chatgpt.com agent-approvals-security](https://learn.chatgpt.com/codex/agent-approvals-security)

### MCP, skills, custom prompts
MCP config (`mcp_servers.<id>`) supports stdio and streamable-HTTP transports, OAuth (with
`callback_url`/`callback_port`), bearer tokens, static/env-derived headers, per-tool
`enabled_tools`/`disabled_tools` and `approval_mode` (`auto`/`prompt`/`writes`/`approve`), and
`required: true` to fail startup if a server can't initialize.
[learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)
Skills use the same `SKILL.md` convention as Claude Code and Pi, discovered repo → user → admin →
system, capped at 2% of context window (max 8,000 chars) for the always-loaded catalog.
[learn.chatgpt.com build-skills](https://learn.chatgpt.com/docs/build-skills) **Custom prompts**
(`$HOME/.codex/prompts/*.md`, `/prompts:name`) are explicitly marked deprecated in favor of skills, but
still work, explicit-invocation only, with `$1`.."$9"/`$ARGUMENTS`/`$UPPERCASE_NAME` substitution.
[learn.chatgpt.com custom-prompts](https://learn.chatgpt.com/docs/custom-prompts)

### Hooks
`config.toml` now documents `features.hooks` + a `hooks.<Event>` table (or `hooks.json`) using
**the same event names as Claude Code** — PreToolUse, PermissionRequest, PostToolUse, PreCompact,
PostCompact, SessionStart, SessionEnd, SubagentStart, SubagentStop, UserPromptSubmit, Stop, Interrupt —
plus `allow_managed_hooks_only` for org lockdown and per-handler `async`/`additionalContextLimit`.
[learn.chatgpt.com config-reference](https://learn.chatgpt.com/docs/config-file/config-reference.md)
This is close enough to Claude Code's vocabulary that it reads as intentional convergence rather than
coincidence, though I could not confirm from a primary source which events are fully shipped versus
still rolling out — a GitHub issue titled "Proposal: add PreToolUse/PostToolUse lifecycle hooks to
Codex hooks engine" suggests at least some of this was still being finalized.
[github.com/openai/codex/issues/14882](https://github.com/openai/codex/issues/14882) **[unconfirmed rollout status]**

### exec mode
`codex exec` is the non-interactive/headless entry point for scripts and CI: defaults to a read-only
sandbox, takes explicit `--sandbox`/`--ask-for-approval` overrides, supports `--json` for a JSONL event
stream (commands, file changes, agent messages) and `--ephemeral` to skip writing session rollout
files. Recommended auth for CI is a scoped `CODEX_API_KEY` passed only to the Codex invocation, not a
job-level env var, to avoid exposing it to other steps in the same job; a dedicated GitHub Action
exists to reduce that exposure further. [developers.openai.com/codex/noninteractive](https://developers.openai.com/codex/noninteractive)
**[page content summarized from search index, not fetched directly]**

### System prompt construction
Base instructions ship as a literal Markdown file in the OSS repo
(`codex-rs/protocol/src/prompts/base_instructions/default.md`): plain prose, not machine-checked
directives — "You are a coding agent running in the Codex CLI... expected to be precise, safe, and
helpful," sections on preambles (8–12 word status lines before tool calls), the `update_plan` tool for
non-trivial multi-step work, validation practices, and final-answer formatting (structured sections for
complex work, terse prose for simple tasks). This can be replaced wholesale (`model_instructions_file`)
or extended (`developer_instructions`/`developer_instructions_file`).
[github.com/openai/codex base_instructions/default.md](https://github.com/openai/codex/blob/main/codex-rs/protocol/src/prompts/base_instructions/default.md)

---

## 4. Pi (Mario Zechner, `badlogic/pi-mono`, `packages/coding-agent`)

Primary sources: the design-rationale blog post and the in-repo `docs/` directory (39 files), both
read directly. Note: search results also surfaced `earendil-works/pi` as a possible fork/rename of the
same project; I did not confirm which is canonical at research time. **[unconfirmed — org/rename status]**

### The four-tool, sub-1,000-token thesis
Pi ships exactly four tools — `read`, `write`, `edit`, `bash` — and argues explicitly that this is
sufficient because "all the frontier models have been RL-trained up the wazoo, so they inherently
understand what a coding agent is. There does not appear to be a need for 10,000 tokens of system
prompt." Anything else — ripgrep, `gh`, documentation lookup — is "run it via bash," not a bespoke
tool. The edit tool uses exact-text matching for surgical, non-destructive edits.
[mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)

### What's deliberately left out, and why
Four features other harnesses treat as core are explicitly omitted, each with a stated reason:
- **Todo lists** — "generally confuse models more than they help... add state the model has to track
  and update, which introduces more opportunities for things to go wrong." Substitute: the agent
  writes/updates a plain Markdown checklist file with its ordinary tools.
- **Plan mode** — no ephemeral in-session planning state; substitute is a persistent `PLAN.md` file,
  editable by both human and agent, that survives across sessions and is fully inspectable ("I get to
  see which sources the agent actually looked at and which ones it totally missed").
- **MCP** — measured token cost (Playwright MCP ≈ 13.7k tokens / 21 tools; Chrome DevTools MCP ≈ 18k
  tokens / 26 tools, loaded eagerly every session regardless of use — "7-9% of your context window
  gone before you even start working") is the stated reason to reject it in favor of CLI tools with a
  README the agent reads on demand.
- **Sub-agents** — rejected for the same observability argument as plan mode: a black-box process
  inside a black-box process. Substitute: spawn another Pi process via `bash` so the full transcript
  stays visible.
[mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/)

### AGENTS.md, skills, prompt templates, extensions
AGENTS.md (also accepting `CLAUDE.md` as an alias) loads hierarchically from a global "agent
directory" down through the working directory and its parents, independent of project trust;
`AGENTS.override.md` overrides same-directory `AGENTS.md`.
[github.com/badlogic/pi-mono configuration.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/configuration.md)
Skills follow the same open `SKILL.md` convention as Claude Code and Codex (name/description/license/
compatibility frontmatter, optional `allowed-tools`/`disable-model-invocation`), discovered from
`$HOME/.agents/skills/` and project `.agents/skills/` up to the repo root, with the same two-phase
progressive-disclosure load (index always in context, body on trigger or explicit `/skill:name`).
[github.com/badlogic/pi-mono skills.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/skills.md)
**Prompt templates** are the lighter-weight, non-executable sibling: plain Markdown with
`description`/`argument-hint` frontmatter, bash-style `$1`/`$@`/`${1:-default}`/`${@:N:L}` argument
expansion, filename becomes command name.
[github.com/badlogic/pi-mono prompt-templates.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/prompt-templates.md)
**Extensions** are the executable-behavior layer: TypeScript modules exporting a factory
`(pi: ExtensionAPI) => void` that can register tools, commands, providers, shortcuts/flags, and event
handlers across the full agent lifecycle (`session_start`, `before_agent_start`, `agent_start`…
`agent_end`, `tool_call`, `tool_result`, `context`/`context_with_system`, `user_bash`, etc.).
Extensions run with the **full OS permissions of the Pi process itself** — the docs are explicit that
loading an untrusted extension is equivalent to trusting arbitrary code with your credentials and
files. [github.com/badlogic/pi-mono extensions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)

### Sessions and compaction
Sessions are stored as a **tree** under `$HOME/.pi/agent/sessions/`, grouped by working directory; a path
through the tree is a "branch." `/fork` starts a new session from an earlier point, `/clone` duplicates
the active branch, `/tree` navigates within one file — three distinct primitives for "I want to try
something different from here," a finer-grained vocabulary than Claude Code's single fork-a-subagent
mechanism. [github.com/badlogic/pi-mono sessions.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/sessions.md)
Compaction auto-triggers on `contextTokens > contextWindow - reserveTokens` (reserve 16,384 tokens by
default), walks backward to keep the most recent `keepRecentTokens` (20,000 default) verbatim, and
LLM-summarizes everything before that cut point into a **fixed structured schema** (Goal / Constraints
& Preferences / Progress / Key Decisions / Next Steps / Critical Context) plus tracked `readFiles`/
`modifiedFiles` lists. On a context-overflow error it compacts and automatically retries the failed
turn; it also separately summarizes abandoned branches so their decisions aren't silently lost.
[github.com/badlogic/pi-mono compaction.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md)

### Security stance
No default sandbox: "full YOLO mode," OS-user permissions, no per-call approval prompts. The docs
argue directly against runtime-approval-as-security: once a process can read data, run code, and reach
the network, blocking exfiltration at that layer is "security theater"; real isolation must happen
*before* the process starts (container/VM being "usually the strongest practical option," down through
isolated-tool-execution-only, to a dedicated low-privilege OS user as the weakest still-real option).
Project trust gates whether `.pi/`-supplied extensions/skills/system-prompt overrides load at startup —
explicitly a startup control, not a runtime boundary; prompt injection from untrusted content is
treated as an expected, accepted risk rather than something the harness tries to contain.
[github.com/badlogic/pi-mono security.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/security.md)

---

## 5. Principles and lessons

**Stated design principles, by harness:**

- **Anthropic (Claude Code / Agent Skills):** progressive disclosure as the organizing idea for
  context economy — metadata (name+description) always loaded, full instructions only on trigger,
  supporting files/scripts only as referenced; explicit guidance to write skills with "the same
  conciseness test you would for CLAUDE.md content" because every resident line is a recurring token
  cost across the whole session, not a one-time cost.
  [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills) Settings vs. CLAUDE.md are
  explicitly split by enforcement guarantee: "Settings rules are enforced by the client regardless of
  what Claude decides to do. CLAUDE.md instructions shape Claude's behavior but are not a hard
  enforcement layer" — i.e., use a hook when something must never fail, use CLAUDE.md/skills when
  guidance is enough. [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)

- **OpenAI (Codex CLI):** two independent security axes — *what the process can technically do*
  (sandbox_mode) vs. *when a human must confirm* (approval_policy) — rather than one combined
  "permission mode" enum. This separation lets an operator choose, e.g., `workspace-write` +
  `never` for a trusted CI job, or `read-only` + `on-request` for an exploratory session, without the
  two axes fighting each other. [learn.chatgpt.com sandboxing](https://learn.chatgpt.com/codex/sandboxing)
  Context files also state their own precedence rule plainly: instructions closer to the working
  directory win *because they appear later in the concatenated prompt*, not through any special
  override syntax — precedence-by-position rather than precedence-by-rule.
  [learn.chatgpt.com agents-md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)

- **Pi:** "what you leave out matters more than what you put in," argued from evidence (Terminal-Bench
  competitiveness with 4 tools and a sub-1k-token prompt) rather than asserted as taste. The single
  clearest structural principle: **every standing feature should be justified against a measured
  context cost**, and if a file-based substitute (a Markdown checklist, a CLI tool with a README, a
  second agent process spawned via bash) achieves the same effect with full observability and zero
  standing token cost, prefer the substitute. Security follows the same discipline in reverse: don't
  spend engineering effort on a runtime permission system that can't be a real boundary anyway; spend
  it on process-level isolation instead. [mariozechner.at/posts/2025-11-30-pi-coding-agent](https://mariozechner.at/posts/2025-11-30-pi-coding-agent/),
  [github.com/badlogic/pi-mono security.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/security.md)

**Cross-cutting observations, relevant to a harness that writes business apps:**

1. All three have converged on the **same `SKILL.md` shape** (name+description frontmatter,
   progressive disclosure, optional scripts/references/assets subfolders) — this is close to a de
   facto open standard now, not a Claude Code idiosyncrasy. Building Conexus's own skill mechanism
   compatible with this shape costs little and buys tooling/portability for free.
2. All three separate a **repo-instructions file** (CLAUDE.md/AGENTS.md, read every session, meant to
   be short) from **skills** (loaded only on demand, meant to hold the long tail of procedure). The
   repeated warning across Claude Code's docs — keep CLAUDE.md under ~200 lines, move anything
   multi-step or narrow into a skill — is a concrete number worth adopting directly.
   [code.claude.com/docs/en/memory](https://code.claude.com/docs/en/memory)
3. Hooks/extensions are the one place all three insist on a **hard guarantee vs. a soft instruction**
   distinction: Claude Code (hooks vs. CLAUDE.md), Codex (`hooks.<Event>` vs. `developer_instructions`),
   Pi (extension event handlers vs. system-prompt text). For a business-app-building agent, anything
   that must never be skipped (say, "never write directly to a production table," "always run the
   schema migration check before a deploy tool call") belongs in the hook/extension layer, not in
   prose context, in any of these harnesses' own stated philosophy.
4. Pi's rejection of MCP is a genuine, measured trade-off (13-18k tokens per server, every session,
   whether used or not) worth weighing against Claude Code's answer to the same problem — **MCP tool
   search**, which defers full tool schemas until a task needs them rather than rejecting the protocol
   outright. [code.claude.com/docs/en/mcp](https://code.claude.com/docs/en/mcp) Either "defer
   eagerly-declared tools" or "don't eagerly declare tools in the first place" is a legitimate answer;
   paying the full eager-load cost by default is the one option none of the three recommends.
5. Pi's stance that runtime permission prompts are not a real security boundary, and that isolation has
   to be a startup-time process decision, is a useful check against over-investing in an in-agent
   permission UI if Conexus's actual threat model is "an app builder should not be able to touch
   another tenant's data" — that argues for enforcing tenancy at the infrastructure/process boundary
   the agent runs inside, not solely inside the agent's own tool-permission logic.
   [github.com/badlogic/pi-mono security.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/security.md)
6. Compaction design differs in what's preserved: Claude Code re-reads the 5 most recently modified
   files verbatim; Pi generates a fixed six-field structured summary and separately tracks
   `readFiles`/`modifiedFiles` as metadata rather than content. For an agent whose sessions can run
   long (building a business app end to end), Pi's structured-summary schema is a concrete, reusable
   template worth borrowing regardless of which harness Conexus's own agent is built on.
   [code.claude.com/docs/en/context-window](https://code.claude.com/docs/en/context-window),
   [github.com/badlogic/pi-mono compaction.md](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/compaction.md)

---

## Unconfirmed items (flagged inline above, collected here for visibility)

- Claude Code Agent SDK exact option names/behavior (`systemPrompt`, `hooks`, `agents`,
  `permissionMode`) — synthesized from search-index snippets, not fetched from
  `platform.claude.com/docs/en/agent-sdk` directly.
- Claude Code's Task tools (`TaskCreate`/`TaskUpdate`/`TaskList`/`TaskGet`) vs. legacy `TodoWrite` —
  version gating and current default-on/off status summarized from search index, not the primary
  `code.claude.com/docs/en/agent-sdk/todo-tracking` page.
- Codex hooks (`features.hooks`, `hooks.<Event>`) — key names confirmed from the official
  config-reference, but exact per-event rollout/shipped-vs-proposed status was not confirmed; a GitHub
  issue suggests at least PreToolUse/PostToolUse were still being proposed as of that issue's filing.
- Codex `codex exec` non-interactive mode details (flags, JSON event stream, `CODEX_API_KEY` handling)
  — summarized from a search-engine snippet of `developers.openai.com/codex/noninteractive`, not
  fetched directly (the direct fetch 404'd against the redirect target).
- Codex compaction internals (what's kept vs. summarized, whether files are re-read like Claude Code
  does) — only the trigger/override config keys were confirmed; the mechanics were not documented in
  any fetched primary source.
- Pi's canonical repository identity (`badlogic/pi-mono` vs. a possible `earendil-works/pi` fork or
  rename that appeared in search results and in extension import paths, e.g.
  `@earendil-works/pi-coding-agent`) — not resolved during this research.
- Pi's "modes" — no dedicated mode-selection document was found; behavior shaping is inferred to run
  entirely through system-prompt append, AGENTS.md, extensions, and prompt templates rather than a
  named mode enum, but no source states this negative directly.
