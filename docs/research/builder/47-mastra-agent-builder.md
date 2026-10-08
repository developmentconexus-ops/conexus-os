# 47. Mastra Agent Builder: is it the same thing as the Conexus Builder?

Date: 2026-09-30. Read-only study. Sources are the inspected Mastra source tree (paths below are relative to its root). One remote page was fetched; it is marked as a summary.

## Short answer

No. "Agent Builder" names two different things at Mastra, and neither one builds business apps for non-technical staff.

1. **`@mastra/agent-builder`** is a coding agent for developers. It writes Mastra code (agents, tools, workflows) into a Mastra project on local disk.
2. **The Agent Builder product** is a browser UI, inside a Mastra server, where people create and run stored AI agents. It builds agents, not apps.

The name is shared. The code is not: the UI product lives in `packages/playground/src/pages/agent-builder` and `packages/core/src/agent-builder/ee`. The npm package lives in `packages/agent-builder`.

## 1. What each one is

**The package.** `packages/agent-builder/README.md:3`: "a specialized agent that turns natural-language requirements into Mastra applications, agents, tools, and workflows". "Mastra applications" means Mastra backend projects. The output is TypeScript under `src/mastra/agents`, `workflows`, `tools`, `mcp`, `networks` (`src/defaults.ts:419-425`). No React, no UI, no Postgres migrations.

Its system prompt opens: "You are a Mastra Expert Agent, specialized in building production-ready AI applications using the Mastra framework" (`src/defaults.ts:25`). The audience is a developer who knows Mastra. The prompt assumes `@mastra/core`, Zod and `.env` files. It speaks English and gives no guidance for non-technical users.

**The product.** The docs call it "a browser-based UI for creating and editing stored agents" (`docs/src/content/en/reference/editor/mastra-editor.mdx:122`). Another doc says to use it "when collaborators need to create and manage fully stored agents in a browser rather than start from agents defined in code" (`docs/src/content/en/docs/studio/editor.mdx:29`). The remote overview (web fetch summary, not verbatim): "a UI for creating and operating Mastra agents. It runs inside your Mastra server", aimed at teams, with memory, workspace, tool providers and channels such as Slack.

Its admin switches (`packages/core/src/agent-builder/ee/types.ts:154-177`) are `tools`, `agents`, `workflows`, `scorers`, `skills`, `memory`, `variables`, `favorites`, `avatarUpload`, `browser`, `model`. So it assembles an agent from parts: a model, instructions, tools, skills, memory. The pages are agents, skills, library, favorites, infrastructure (`packages/playground/src/pages/agent-builder/`). It is closer to a no-code agent configurator than to a coding agent.

## 2. How the package works

- **Base class.** `class AgentBuilder ... extends Agent<'agent-builder', ...>` (`src/agent/index.ts:51`). A plain Mastra `Agent`. It is not an AgentController harness.
- **Generation settings.** `temperature: 0.3` and `maxSteps ... || 100` (`src/agent/index.ts:214-215`).
- **Memory.** `lastMessages: 20` (`src/defaults.ts:415-417`), in-memory storage unless given one (`src/agent/index.ts:70`).
- **Processors.** One input processor, `ToolSummaryProcessor`, which has a second model summarize old tool calls with a cache (`src/processors/tool-summary.ts:1-40`, wired at `src/agent/index.ts:86-91`). It keeps long sessions inside the token limit. A `write-file` processor exists only to dump context for debugging.
- **Tools** (`src/defaults.ts:429-1083`): `read-file`, `write-file`, `list-directory`, `execute-command`, `task-manager`, `multi-edit`, `replace-lines`, `show-file-lines`, `smart-search`, `validate-code`, `web-search`, `attempt-completion`, `manage-project`, `manage-server`, `http-request`. Two modes: `'template' | 'code-editor'` (`src/types.ts:31`).
- **File writing.** Plain disk writes under `projectPath`: "Write content to a file, with options for creating directories" (`src/defaults.ts:457-460`). No sandbox. Commands run on the host (`execute-command`, `manage-project` runs `pnpx create-mastra@latest`, `src/defaults.ts:1120`).
- **Check.** `validate-code` runs `types`, `lint`, `schemas`, `tests`, `build` (`src/defaults.ts:742-755`), with a fast syntax, semantic, lint path for named files. The prompt's loop is UNDERSTAND, PLAN, BUILD, VALIDATE (`src/defaults.ts:41-63`) and says "DO NOT INCLUDE TODOS IN THE CODE... CREATE REAL WORLD CODE" (`:39`).
- **Preview.** None for a human. `manage-server` plus `http-request` let the agent start the server and call its API (`src/defaults.ts:59-62`). Nothing opens a browser page or shows a live app.
- **Workflows.** Three bundled: template merge (clone a Mastra template repo, order units, merge with git checkpoints, `src/workflows/template-builder/template-builder.ts`), task planning with approval (`src/workflows/task-planning/task-planning.ts`), and a workflow builder.
- **Tests.** Integration tests run against a minimal Mastra fixture project (`integration-tests/src/fixtures/minimal-mastra-project`).

## 3. License and stability

Two signals that disagree.

- `packages/agent-builder/package.json` says `"license": "Apache-2.0"`.
- The README says: "This experimental package requires a Mastra Enterprise license for production use, and its APIs may change without notice" (`README.md:3`). Also "intended for the Mastra Agent Builder product rather than as a stable general-purpose public API" (`README.md:34`).
- `docs/src/content/en/docs/license.mdx:14-20` puts `@mastra/core/agent-builder/ee` under the EE license. That is the UI product's core. Code in any `ee/` folder "require[s] a valid enterprise license for production use but can be freely used for development and testing" (`license.mdx:46`).
- The project template says: "A valid `MASTRA_EE_LICENSE` for running Agent Builder in production" (`templates/template-agent-builder/README.md`).

Terms from `ee/LICENSE` that matter to Conexus:

- "may only be used in production if you ... have entered into, and remain in compliance with, a written agreement with Kepler Software, Inc."
- "you are free to modify this Software for your own internal development and testing purposes".
- "it is forbidden to copy, merge, publish, distribute, sublicense, and/or sell the Software."
- "'production' means any use of the Software beyond development and testing on your own systems."
- Rights end automatically on breach, with a 30 day cure.

Reading: any Conexus customer running the UI product, or code copied from `ee/` folders, needs a signed commercial agreement with Mastra. Copying EE code into our repo is forbidden. The package's own Apache label is unclear, so assume the stricter README unless Mastra confirms in writing. I did not find a price or terms for the agreement.

Install check: `@mastra/agent-builder` is not in `node_modules/@mastra/` (listing has core, e2b, factory, memory, pg and others, no agent-builder). The installed core docs mention the Builder only as a link to the remote site.

## 4. Side by side

| Capability | Mastra Agent Builder (package) | Mastra Agent Builder (UI product) | Conexus Builder today |
|---|---|---|---|
| Builds | Mastra code: agents, tools, workflows | Stored agents from parts | Business apps: React 19 + Vite front, `conexus/` server half (manifest, handlers, Postgres migrations) |
| For whom | Developers | Teams and admins configuring agents | Non-technical company staff |
| Language | English prompt | English UI | Portuguese chat and prompt |
| Base | `Agent` subclass | Editor and stored agents | AgentController harness |
| Where code runs | Local disk and host shell | No code written | E2B sandbox |
| Check | `validate-code` (types, lint, build, tests) | None | Type check, build, open in a browser |
| Live preview | None | Chat with the agent | Prévia |
| Company systems | `http-request`, web search | Tool providers (for example Composio), channels | Conexões |
| Memory | Last 20 messages, tool summaries | Memory config per agent | Our own |
| Prompt | Mastra expert, MASTRA method | Per agent instructions | Ours, for this product |
| License | EE for production (README) | EE for production | Ours |
| Stability | "may change without notice" | EE, in active development | Ours |

## 5. What we could reuse without adopting

Ideas only. No code copying from `ee/` paths.

- **ToolSummaryProcessor.** A second, cheaper model summarizes old tool calls so long builds stay in context. The idea is small. Check first whether our harness already compacts tool output.
- **`validate-code` shape.** Fast path for named files (syntax, then types, then lint) before a slow full check. Useful if our check step is slow.
- **Prompt passages.** "Real code only, no TODOs" and the four step loop. Our draft in `system-prompt-draft.md` likely covers both. Worth a diff, nothing more.
- **Multi-edit and replace-lines tools.** Cheaper than rewriting whole files. Our harness may already provide edit tools.
- **Template merge with git checkpoints.** The auto, ask, block rule set for merging files (`src/agent/index.ts:33-36`) is a good model if Conexus ever ships starter templates.
- **Feature flags per builder** (`AgentFeatures`). A neat pattern for switching Builder abilities per company.

## 6. What adopting would cost or block

- **Wrong output.** It writes Mastra backend code, not our React plus manifest apps. We would rewrite the prompt and tools, which leaves little of it.
- **Wrong place.** Host disk and host shell, no sandbox. Conexus needs E2B isolation for other people's code.
- **Missing pieces.** No Prévia, no browser check, no Conexões, no Portuguese, no plain-language guidance.
- **Wrong audience.** The UI product targets builders of agents, not staff describing an app.
- **License risk.** Production needs a signed Mastra agreement, APIs "may change without notice", and we cannot fork EE code into our repo.
- **Lock-in.** Our Builder already runs on AgentController, which Mastra ships openly. Moving would replace a working base with an experimental one.

## 7. Verdict

- It is not the same thing as Conexus. The package builds Mastra code for developers. The product builds stored AI agents in a browser.
- The "building things" impression is half right: the package does write files and run checks, but only for Mastra projects.
- Do not adopt and do not use it directly. The license gate and the wrong output make it a net cost.
- Keep our Builder on AgentController. Use Agent Builder as a reference only: the tool summary idea, the fast validate step, the template merge rules.
- Revisit only if Mastra ships an Agent Builder that targets full apps with a sandbox and preview, under terms we can accept.
