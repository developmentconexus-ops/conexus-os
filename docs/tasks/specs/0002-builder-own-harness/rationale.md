# 0002. Rationale: the Conexus Builder on its own harness

## Context

> ⚠️ Premise note: this is a full replacement of a working subsystem, the pattern where big bang
> rewrites most often fail. Two facts make it acceptable here: there are no customer users yet (the
> operator chose to start the data from zero), and the build is sliced as a tracer bullet on a branch
> while the old Builder keeps running, with a measured baseline to beat before the switch. The second
> concern is timing: the operator chose to do this before E-1, so the Q4 pilot waits. The spec keeps
> Q-5 merging first so the connector work is ported, not redone.

The Builder is the agent that turns a person's request in Portuguese into a working app. Since C-022
(2026-09-20) it runs inside the Mastra Factory, which sits on Mastra Code (`@mastra/code-sdk`), which
sits on Mastra's engine (`AgentController`, `createCodingAgent`, `buildBasePrompt` in `@mastra/core`).
The Factory was chosen for model credential custody, the GitHub App and its Work engine, proven
together in the sessions and Work qualification run. The prompt was not part of that choice.

Reading the real rendered prompt on 2026-09-28 showed what that stack gives the Builder. It opens as
"Mastra Code, an interactive CLI coding agent", spends most of its 16 thousand characters on git,
pull requests, `gh`, npm and terminal habits, and puts all of Conexus's rules (1,153 characters, about
6 percent) last, in a section framed as lower priority than everything else, including a repository's
own `AGENTS.md`. The Factory occupies the one slot designed for trusted host text, and Mastra Code
never passes a product name to `buildBasePrompt`, so no configuration inside this stack changes the
identity. The same study found 17 Factory `source_control_*` tools with a real installation token
missing from the Builder's deny list.

The product has also moved. Conexus serves people who do not code; a GitHub App per installation and
source on a forge are costs they never asked for, and the Factory's Work, boards and pull request
surface have no consumer in the Hub (the Hub already drops the Factory's workers). The operator's
view, after using it: running the Builder on the Factory "não faz sentido algum" for Conexus.

Forces: keep Mastra as the engine (the "Mastra first" rule); own the words and tools that shape the
Builder; keep what works today (E2B sandbox, observational memory, the model sign in flows, Q-5
connectors); remove parallel paths instead of keeping both; and measure the result against the old
Builder instead of trusting it.

## Options considered

### Option 1: Stay on the Factory and use the free layers

Keep the stack. The starter writes a strong Conexus `AGENTS.md` into every app; it loads as repository
instructions, above today's plugin section, and contradicts the base prompt where it conflicts.

**Pros**: almost no code; nothing is lost; it can be measured on the eval in a day.
**Cons**: the identity stays "Mastra Code" and the git, PR and npm guidance stays in the prompt; the
Builder can edit the file that carries our rules; GitHub custody and the Factory schema stay.

### Option 2: Stay on the Factory and ask Mastra for a prompt option

File a request (or a pull request) for a Factory option that sets the product name, the base prompt
and the modes.

**Pros**: the cleanest outcome inside the stack; Mastra keeps maintaining the harness.
**Cons**: the timing is Mastra's; it fixes only the prompt, not the GitHub custody or the Factory
surface the product does not use.

### Option 3: Drop the Factory, keep Mastra Code as a library

The Hub calls `createMastraCode` directly, which opens `modes`, `hostInstructions`, `subagents` and
`disabledTools`.

**Pros**: keeps Mastra Code's memory wiring, model gateway and AGENTS.md loading without copying.
**Cons**: the base prompt still says "Mastra Code" (the product name never reaches `buildBasePrompt`);
the credential store, the GitHub App path and the skills loader, all Factory owned, must be rebuilt
anyway.

### Option 4: Own Builder on Mastra's engine, copying what we need

Build the Builder on `AgentController` and `createCodingAgent`, write the prompt, modes and tool
contract, copy the parts of the Factory and Mastra Code we use (secret envelope, credential store,
OAuth sign in and model resolution, observational memory configuration) as our own code under their
Apache 2.0 license, and move source into a Conexus Git.

**Pros**: every word and tool the Builder sees is ours; no GitHub for users; the Hub loses the Factory
schema, the GitHub App and the forwarded routes; Mastra stays the engine.
**Cons**: the most work, and it delays the pilot; we maintain the copied parts; the engine API is
beta.

## Rationale

Options 1 and 2 fix the words and leave the shape. The shape is the larger problem: a forge per
installation, a Work engine and a pull request surface for users who build apps by talking, plus a
permission gap that exists because the Factory brings tools the Builder never needed. Option 3 pays
most of Option 4's cost (credentials, GitHub removal, skills) and still keeps the wrong identity,
because the product name does not reach the core prompt function through Mastra Code.

Option 4 matches what Mastra itself documents: `createCodingAgent` gives the coding runtime without a
prompt, and `AgentController` gives sessions, modes, permissions and routes. What the Factory and
Mastra Code add on top is product, and here the product is ours. The expensive parts of leaving
(observational memory and model sign in) are copyable code under Apache 2.0, not services. The Git
store is plain Git in a new folder on the Hub's disk, and its `main` branch is the admitted version,
so no second copy of that state is kept anywhere.

The Codex cross check (34 findings) was triaged with the poteto principles: 8 were errors in the first
draft, 17 real needs answered small, 7 were pulls to preserve today's design (subtracted instead:
mode in the message, the PLAN run rule, the duplicate admitted revision, private conversations now,
the Factory model catalog, model packs, the `fast` role), and 3 and a half were guards on guesses
(left for the proofs to justify). Its advice to keep the Hub's own run, Preview and E2B code was
taken; its advice to keep Mastra Code was not, because that keeps the identity this decision leaves.

The operator's rule is validate first, then harden. The build plan follows it: a measured baseline on
the old Builder, a thin end to end thread first, and four proofs (eval, browser, real Sankhya read,
the operator's reading of the prompt) before the switch merges. The operator chose to build now,
before E-1; the pilot then runs on the Builder it will keep, which avoids proving Q4 twice.

(basis: Mastra's AgentController and createCodingAgent docs; the harness audit files 04 to 08 of
2026-09-28; C-022's own reopen trigger, "the custody decision that puts a Project's source on a forge
is reversed"; strangler practice adapted to a branch plus a measured cut over.)

## Evidence

- `builder-system-prompt.md` and `render/rendered-output.txt` in the operator's study notes:
  the real rendered prompt and its section order.
- `04-builder-layers.md`: what each Mastra layer gives the Builder, rebuild cost per capability, the
  `source_control_*` gap, and why C-022 chose the Factory.
- `05-agent-controller-path.md`: every customization point of `AgentController` and
  `createCodingAgent`, what Mastra Code adds, a sketch of a Conexus controller, and risks.
- `06-opcoes-prompt-builder.md`: the four options in Portuguese for the operator.
- `07-agentsmd-and-websearch.md`: the split between prompt, `AGENTS.md` and skills; who maintains
  `AGENTS.md`; web search options in Mastra; risks and mitigations; Mitra's practice.
- `08-factory-removal-map.md`: the files, routes, tables, variables and tests that change.

Licenses checked on 2026-09-28: `@mastra/factory`, `@mastra/code-sdk` and `@mastra/core` are
Apache 2.0, and none of the copied paths is under an `ee/` directory.

## References

**Project sources**:
- `docs/decisions/index.md`: C-020, C-021, C-022, C-025, C-026, C-027, C-029, C-030.
- `docs/reference/builder-c020-mastra-native.md`, `docs/reference/mastra-boundary.md`,
  `docs/reference/single-owner-map.md`.
- `docs/evidence/sessions-work-qualification/report.md` (the run behind C-022).
- `docs/research/mitra/full-study.md` (Mitra's harness: Claude Code in E2B, project memory files, web
  access).
- Local Mastra docs in `node_modules/@mastra/core/dist/docs/references/`: the AgentController guide
  and references, `createCodingAgent`, `buildBasePrompt`, `AgentsMDInjector`, agent tools
  (`webSearchTool`, `webFetchTool`, `submitPlanTool`, `askUserTool`).

**Practices & standards**:
- Keep the system prompt short and stable, put project facts in a project file, and load long or rare
  knowledge on demand as skills.
- Treat fetched web content as data, never instructions; keep company data out of outbound queries.
- Measure against a baseline before replacing a working system; migrate behind a branch and switch
  once proven.

**Links** (read by the research on 2026-09-28):
- Mastra, Building a coding agent: https://mastra.ai/blog/building-a-coding-agent
- agents.md format: https://agents.md/
- OpenAI Codex, AGENTS.md guide: https://developers.openai.com/codex/guides/agents-md
- Claude Code best practices: https://code.claude.com/docs/en/best-practices
- Anthropic, Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- HumanLayer, Writing a good CLAUDE.md: https://www.humanlayer.dev/blog/writing-a-good-claude-md
- Blake Crosley, AGENTS.md patterns: https://blakecrosley.com/blog/agents-md-patterns
- PromptArmor, domains for an allowlist: https://www.promptarmor.com/resources/what-domains-should-i-add-to-my-allowlist
- Agent Skills specification: https://agentskills.io
