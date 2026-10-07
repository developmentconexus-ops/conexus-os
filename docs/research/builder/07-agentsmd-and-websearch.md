# AGENTS.md vs. system prompt, and web search for the Builder

Date: 2026-09-28. Read-only research for the Conexus Builder design (Mastra `AgentController` +
`createCodingAgent`, apps built inside an E2B sandbox). Two questions: (1) what belongs in the
Builder's own system prompt versus a per-project `AGENTS.md` versus on-demand skills, and (2) what
web search option fits a coding agent that also has connector access to company data.

---

## Part 1 — AGENTS.md vs. the system prompt

### The open AGENTS.md format (agents.md)

`AGENTS.md` is a plain-Markdown, tool-agnostic convention, not a schema. The site's own framing:
README is for humans ("quick starts, project descriptions, contribution guidelines"); AGENTS.md is
"the extra, sometimes detailed context coding agents need: build steps, tests, and conventions."
There's no mandated structure — "use any headings you like; the agent simply parses the text you
provide" — but common sections are project overview, build/test commands, code style, testing
instructions, security notes, and PR/deployment conventions. For monorepos it supports nesting:
multiple `AGENTS.md` files can live in subproject directories, and "the closest AGENTS.md to the
edited file wins; explicit user chat prompts override everything." No file-size rule is given; the
guidance is qualitative — include what you'd tell a new teammate, keep it out of the main README.

### OpenAI Codex guidance

Codex (developers.openai.com/codex, redirected to learn.chatgpt.com) implements AGENTS.md with a
concrete, layered discovery chain: `$HOME/.codex/AGENTS.md` (personal defaults) → repository root → walk
down to the current working directory, concatenating each level on top of the last, so files closer
to the edited file take precedence. Codex also supports `AGENTS.override.md` at any level, which
*replaces* rather than extends parent instructions (Codex-specific; not part of the open format).
There's a hard default cap, `project_doc_max_bytes` = 32 KiB, with guidance to "raise the limit or
split instructions across nested directories" once you hit it. Codex rebuilds the instruction chain
on every run — no manual cache to clear. Its own best-practices page recommends: use AGENTS.md for
durable guidance, not one-off task notes; put team standards at the repo root and overrides in
subdirectories; and turn repeated work into reusable skills rather than growing the file. The
documentation gives no guidance either way on whether the agent itself should edit AGENTS.md.

### Anthropic guidance: CLAUDE.md and system-prompt "altitude"

Claude Code's own docs (code.claude.com/docs/en/best-practices — the old
anthropic.com/engineering/claude-code-best-practices URL now redirects there) describe CLAUDE.md as
"a special file that Claude reads at the start of every conversation," used for "Bash commands, code
style, and workflow rules" — persistent context the agent can't infer from code alone. Key points:

- **Generate with `/init`, then refine by hand.** `/init` inspects the repo and drafts a starting
  file; it's explicitly a starting point, not a finished product.
- **Keep it short and prune ruthlessly.** "For each line, ask: would removing this cause Claude to
  make mistakes? If not, cut it. Bloated CLAUDE.md files cause Claude to ignore your actual
  instructions." `/doctor` on a checked-in file proposes cuts for anything derivable from the
  codebase.
- **Include vs. exclude table**: include bash commands Claude can't guess, non-default code-style
  rules, testing instructions, repo etiquette (branch/PR conventions), project-specific architectural
  decisions, environment quirks, and non-obvious gotchas. Exclude anything Claude can figure out by
  reading code, standard language conventions, detailed API docs (link instead), information that
  changes frequently, long tutorials, and file-by-file descriptions.
- **Scope discipline**: "CLAUDE.md is loaded every session, so only include things that apply
  broadly. For domain knowledge or workflows that are only relevant sometimes, use skills instead."
  This is the explicit prompt-vs-skill split Anthropic recommends.
- **Symptom-driven maintenance**: if Claude keeps doing the unwanted thing despite a rule, the file
  is too long and the rule is getting lost; if Claude asks things already answered in the file, the
  phrasing is ambiguous. Treat it like code — review when things go wrong, check it into git so the
  team can contribute, and it "compounds in value over time." Files can `@path/to/import` other
  files (a lightweight nesting mechanism, different from Codex's directory-walk).
- **"Over-specified CLAUDE.md" is named as a common failure pattern**, alongside "kitchen sink
  session" and "correcting over and over" — fix is the same in each case: prune / `/clear` and
  restate.

Anthropic's separate engineering post, **"Effective context engineering for AI agents"**
(anthropic.com/engineering/effective-context-engineering-for-ai-agents), gives the system-prompt
"altitude" framing directly relevant to splitting prompt vs. AGENTS.md vs. skills: avoid two
failure extremes — hardcoded, brittle if-else logic in the prompt, and vague high-level guidance
that gives the model no concrete signal. Aim for "the minimal set of information that fully outlines
expected behavior," organized into clearly delineated sections (XML tags or Markdown headers, e.g.
`<background_information>`, `<instructions>`, `## Tool guidance`). It explicitly recommends a hybrid
strategy: keep stable instructions in the system prompt, and pull dynamic information — memory files,
just-in-time docs — at runtime instead of pre-loading it, by analogy to how humans use external
indexes rather than memorizing everything. It also covers tool design: tools must be self-contained,
error-robust, and unambiguous in when to use them; "if a human engineer can't definitively say which
tool should be used in a given situation, an AI agent can't be expected to do better" — directly
applicable to how we describe AGENTS.md-reading or skill-invoking behavior in the Builder's tool
descriptions.

### What practitioners report

Two independent practitioner write-ups converge on tighter numbers and diverge on one point (who
maintains the file):

- **HumanLayer** (humanlayer.dev/blog/writing-a-good-claude-md): file should cover WHAT (stack,
  structure/map — critical in monorepos), WHY (purpose of components), HOW (build/test/verify
  workflows). Leave out exhaustive command lists or style rules better enforced by a linter,
  task-specific notes, and code snippets that go stale (reference files instead, don't paste code).
  Consensus size: **under ~300 lines**, shorter is better; their own root file is under 60 lines;
  cites research suggesting frontier models reliably follow roughly 150–200 instructions before
  degrading. Their strongest, and most opinionated, claim: **humans should hand-write it — avoid
  auto-generation via `/init`** — because CLAUDE.md is "the highest leverage point of the harness."
  For staying current as the project grows, they recommend **progressive disclosure**: keep
  evolving topics in separate, descriptively-named files (e.g. `agent_docs/building_the_project.md`)
  that the agent is told to consult when relevant, rather than growing the root file. Named
  anti-patterns: using the file as a dumping ground for one-off behavior "hotfixes," stuffing in
  formatting/linting detail, auto-generating without review.
- **Blake Crosley** (blakecrosley.com/blog/agents-md-patterns), testing against Codex specifically:
  what reliably changes behavior is command-first instructions ("what command proves this was
  done?"), explicit closure criteria (exit codes, not "looks done"), and task-organized sections so
  the agent can pick the relevant slice. What's reliably ignored: prose paragraphs with no
  actionable step, vague directives ("be careful," "optimize where possible"), contradictory
  priorities without an explicit order, and style guidance with no enforcement command behind it.
  His size rule is tighter still: **under 50 lines per section, under 150 lines total**, reasoning
  that agents read the file at the start of every session and verbosity risks truncation. He gives
  no guidance on agent self-updates — an open question in the literature, not just for us.

Net read across all four sources: nobody proposes a hard universal number, but "a few hundred lines,
organized, command-first, reviewed" is the shared shape, and the two live warnings that matter most
for us are (a) a bloated file gets *silently* ignored, not gracefully degraded, and (b) putting
anything conditional/rare in the always-loaded file is strictly worse than a skill or an on-demand
doc reference.

### Mastra support: AgentsMDInjector and instructions loading

Read from `node_modules/@mastra/core/dist/docs/references/`:

- **`reference-processors-agents-md-injector.md`** — `AgentsMDInjector` is a Mastra input processor
  (`@mastra/core/processors`) built exactly for this. It runs before each model step, scans
  *completed tool calls* in the message list (newest first), and looks at their path arguments for
  `AGENTS.md`, `CLAUDE.md`, or `CONTEXT.md` anywhere in the directory ancestry of a touched file.
  Each invocation injects **at most one new instruction file per turn**, as a persisted `reactive`
  signal, and it skips paths already loaded. In other words: it's reactive/lazy, triggered by the
  agent actually touching a directory, not a static preload — this is the mechanism that would give
  the Conexus Builder deterministic, per-directory AGENTS.md loading inside an app repo, including
  nested AGENTS.md in subfolders if we ever have them. Key constructor knobs: `maxTokens` (default
  1000, an approximate per-file token cap), `reminderText` (fallback if a file is empty/unreadable),
  `pathExists`/`isDirectory`/`readFile` overrides (for E2B's sandboxed filesystem instead of the
  local one), `getIgnoredInstructionPaths` (skip files already in static instructions, so we don't
  double-inject a file we already baked into the system prompt), `isEnabled` (per-request kill
  switch), and `getReader`/`ReminderFileReader` (swap in a virtual filesystem or trusted git-ref
  reader — relevant if we want to read AGENTS.md from a trusted commit rather than the live sandbox
  checkout, to reduce injection risk from an agent-editable file). One documented trust caveat: the
  reminder text stays in context and storage even if the caller hides its stream chunks from the UI
  — **stream exclusion is not a trust boundary**; `isEnabled` plus a trusted reader is the actual
  control if we don't want checkout-controlled instructions to load unconditionally.
- **`reference-file-based-agents-instructions.md`** — separately, Mastra's file-based agent
  convention has its own `instructions.md`/`instructions.ts` at the agent root for the **always-on**
  system prompt (identity, tone, standing rules, output format). Its explicit guidance mirrors
  Anthropic's: "Move anything conditional, large, or action-oriented into `tools/` or `skills/`,
  which the model uses only when relevant." This is Mastra's own version of the prompt/skill split,
  independent of AGENTS.md.
- **`reference-coding-agent-build-base-prompt.md`** / **`reference-coding-agent-create-coding-agent.md`**
  — `createCodingAgent()` (the function the Builder is built on) does **not** ship a prompt or
  AGENTS.md loading by default; it only wires up workspace, error-processors, task-signal provider,
  and an optional goal judge. `buildBasePrompt()` is a separate, optional helper that generates
  Mastra Code's own base behavioral prompt (parameterized by `productName`), unrelated to
  AGENTS.md. So AGENTS.md loading is not automatic just from using `createCodingAgent` — the Builder
  has to add `AgentsMDInjector` to `inputProcessors` itself (or load it statically) to get it.

Practical read for us: `AgentsMDInjector` is close to a ready-made version of the "deterministic
loading, not a request to the model" mechanism the Mitra study (below) says Mitra itself lacks — but
it's still reactive on tool-call paths, not a guaranteed preload at session start. If we want a
per-project `AGENTS.md` guaranteed in context on turn one (not only once the agent has touched a file
in that directory), we'd want to read it once ourselves at session start and fold it into the system
prompt (or a `reactive` signal fired before the first model step), then let `AgentsMDInjector` handle
any *nested* AGENTS.md the agent discovers later in subdirectories.

### Recommended split for the Conexus Builder

**System prompt (always-on, Conexus-authored, not editable by the app or the end user):**
what Conexus is, the Builder's identity/tone, the fixed build/run/test/validate loop, the sandbox
and tool contract (E2B paths, allowed commands, MCP/connector surface, verification requirement
before declaring done), safety and scope boundaries (no destructive ops, no credentials in code,
domain allowlist for web access), and the always-true product conventions (React/Vite front, small
server handlers, how a "done" app looks). This is the harness's contract with itself; it should stay
in the few-hundred-line range and be reviewed like code, per both Anthropic's and HumanLayer's
guidance.

**Per-project AGENTS.md (inside the app repo, versioned, short):** this specific app's structure,
its actual data sources/connectors and IDs, decisions already made and why (so the Builder doesn't
re-litigate them turn to turn), naming/schema conventions established for this app, and known
gotchas specific to this project (the Mitra study's `integracao-sankhya.md` pattern — discovery
findings the agent wrote once and rereads as memory). Anything a new teammate joining *this project*
would need, and nothing a new Conexus engineer joining *any project* would need — that split is what
keeps it from creeping toward duplicating the system prompt.

**Skills (on-demand):** anything conditional, rare, or long — a specific integration's quirks,
a multi-step workflow only some apps need (e.g. "set up a recurring import"), narrow domain
knowledge. Same logic Anthropic and Mastra's own `instructions.md` doc give: load on demand rather
than bloating every turn.

**Should the Builder write/update its own AGENTS.md?** The two practitioner sources disagree on
authorship in general (HumanLayer: humans should hand-write CLAUDE.md; Codex/agents.md: silent on
this). But our situation is closer to Mitra's than to a human engineer's CLAUDE.md: the *user* is
non-technical and can't write or review Markdown conventions, so **the Builder has to be the
author** — the open question is only the guard around it. Recommendation: yes, the Builder creates
and updates the per-project AGENTS.md, but only as a side effect of an already-reviewed step, not as
a freeform edit:
- **Create** it once, after the discovery/planning phase (the Mitra "checkpoint" gate — contract
  confirmed with the user before code), seeded with the project's data sources, canonical
  definitions, and structure. This mirrors Mitra's `integracao-sankhya.md`/`featuresearquitetura.md`
  pattern, which the Mitra study rates ADOPT as "memory in a versioned file, reread turns later."
- **Update** it only at defined checkpoints (end of a turn that changed structure/decisions, not
  mid-turn), and only append/amend facts that were actually confirmed with the user or proven
  against real data — not speculative notes. This matches the operator's own standing rule ("prove
  end to end first, then harden by measurement" / no speculative content).
- **Guard**: treat it like any other file the agent's own output can corrupt over many turns — cap
  its size (reuse the same "under a few hundred lines, prune don't accumulate" rule), and since
  `AgentsMDInjector`'s docs flag that instruction files loaded from the live checkout are not a
  trust boundary by default, read AGENTS.md through a **trusted reader** (e.g. last-known-good
  commit, or diffed before trusting) rather than blindly re-reading whatever the sandbox currently
  has on disk — this closes the same gap the Mitra study calls out generally ("Mitra admits reading
  CLAUDE.md is not guaranteed"; our answer is a reader that's deterministic *and* trusted, not just
  deterministic).

---

## Part 2 — Web search for a coding agent

### Options available in Mastra

From the same local docs folder:

- **Provider-native web search via the model router — `webSearchTool`.** Documented in
  `docs-agents-tools.md`: import `webSearchTool` from `@mastra/core/tools`, add it to an agent's
  `tools`, and "Mastra resolves it at run time from the active model, then passes the
  provider-managed tool to the model." Its tool ID is `<provider.defined>` — i.e. whichever native
  search tool the active model (Anthropic, OpenAI, etc.) exposes, run by that provider, not by
  Mastra's own infrastructure. There's a companion **`webFetchTool`** (tool ID `web_fetch`) that
  fetches a URL and returns its text — the read-only complement. Both are listed as Mastra's
  "built-in agent-agnostic tools," alongside `askUserTool`, `submitPlanTool`, and the task tools.
- **Mastra "Gateway" web search**, mentioned in `reference-templates-overview.md`: the
  `template-docs-expert` starter template is described as answering documentation questions "with
  Gateway web search, citations, memory." This is Mastra's own model-gateway-mediated search rather
  than a third-party API — consistent with `webSearchTool` being resolved through "the active
  model"/gateway rather than a separate Mastra-hosted search index. I did not find a distinct,
  separately documented "Gateway search API" beyond this — it appears to be the same
  provider-native mechanism as `webSearchTool`, described from the template's point of view.
  `template-claw-assistant` similarly "operates a workspace with filesystem, sandbox, browser, and
  web-search tools," reinforcing that web search is treated as one workspace capability among
  several, not a bespoke integration.
- **Firecrawl**, documented as a first-class integration
  (`integrations-tools-firecrawl.md`): install the `firecrawl` SDK, wrap `firecrawl.search()` and
  `firecrawl.scrape()` as two `createTool()` definitions (`firecrawlSearch`, `firecrawlScrape`), and
  attach both to an agent. This is the pattern to reach for when we want **search plus clean-markdown
  extraction** of a page in one coherent tool pair, with a self-hosted option
  (`FIRECRAWL_API_URL`) if we ever need to run it inside our own network boundary.
  `docs-browser.md` separately documents a **Firecrawl Browser Sandbox** provider
  (`@mastra/browser-firecrawl`) for full hosted-browser automation, a heavier tool than we need for
  "search library docs and examples."
- No local doc surfaced a Mastra-authored Tavily, Exa, Brave, or Jina integration — those exist only
  as note-your-own `createTool()` wrappers around each vendor's SDK/API, same shape as the Firecrawl
  example. I found no `code-sdk` package or `web_search`/`web_extract` tool names anywhere under
  `@mastra/core/dist/docs` — that naming (`web_search`, `web_extract`) matches Anthropic's own Claude
  Agent SDK / Claude API tool names, not a Mastra concept; if the "code-sdk" the brief refers to is
  the Claude Agent SDK rather than something inside this Mastra install, it wasn't present in the
  folder this task restricted me to, so I can't confirm its exact tool shape from local docs alone.

**Fit for "search library docs and examples":** `webSearchTool` (provider-native, zero extra
dependency or billing surface, resolved automatically from whatever model the Builder is running)
is the cheapest and lowest-integration-risk default — no new vendor key, no new domain to add to an
allowlist beyond what the provider itself already searches, and it's literally what Mitra's own
"Acessando URL" behavior looked like in the wild (see below). Reach for Firecrawl's
search+scrape pair specifically when we need clean, structured Markdown of a doc page beyond what
the provider's native search snippet gives — e.g. pulling a full API reference page into context
for the agent to read precisely, which is closer to `webFetchTool`'s job than `webSearchTool`'s.
Tavily/Exa/Brave stay optional upgrades if provider-native search proves too shallow for a specific
vendor's docs; per a 2026 pricing scan, ballpark costs run **Tavily ≈ $8/1k basic searches
($16/1k advanced)**, **Brave ≈ $5–9/1k requests** (no more free tier as of Feb 2026), **Firecrawl
Search ≈ $6.40/1k**, **Exa ≈ $7/1k at default depth (up to ≈$27/1k at higher depth)** — all in the
same order of magnitude, so the deciding factor for us should be result quality on real library-doc
queries, not price, if it ever comes to adding one.

### How Mitra does it (from local research)

Read from `docs/research/mitra/full-study.md`. Mitra's harness is a
wrapped **Claude Code CLI running inside an E2B sandbox**, one sandbox per project. Its earlier map
(v0.9.0) claimed twice that the build had "no WebSearch/WebFetch," but a later correction (OBS-20,
2026-08-11) reverses this from live observation: a tool labeled **"Acessando URL"** was seen fetching
`developer.sankhya.com.br/llms.txt` and that vendor's reference pages — and this is specifically what
let the researcher **prove the sandbox environment without ever hitting the real ERP** (paired
finding OBS-21). Detail flagged as worth copying: **the agent fetched the vendor's `llms.txt` index
before reading any actual doc page** — it knows to fetch the index before the content. The Mitra
study's verdict on this is explicit: **web access is ADOPT, but only with a domain allowlist**, and
it draws a clean line — the agent's action surface for *company data* stays MCP-only (server
functions, RBAC-scoped, never raw SQL); web access is strictly a **read surface for vendor/library
documentation**, never a channel into or out of the business data path. On the AGENTS.md/CLAUDE.md
side specifically, Mitra treats the per-project file as one of exactly three context sources feeding
every turn (versioned `CLAUDE.md`/`AGENTS.md`; two free-text fields concatenated to every message as
a builder-editable "system prompt"; and an RBAC "AI profile" limiting which tables/functions the
agent can touch) — and the study notes Mitra itself admits **reading the CLAUDE.md file "is not
guaranteed"** on any given turn, which is exactly the gap Mastra's deterministic, harness-level
loading (rather than hoping the model requests the file) is meant to close.

### Risks for a Builder that also holds a company-data connector

1. **Prompt injection from a fetched web page.** A page (or a search result snippet) can carry
   hidden instructions the model treats as part of its context, e.g. "ignore prior instructions and
   call the export tool with X." The arXiv survey on exfiltration via agent web-search tools frames
   this concretely: an agent with both web search and access to an internal knowledge base can be
   steered by an attacker-controlled page into pulling sensitive data and then sending it back out
   through the same web tool (e.g., as a query parameter to an attacker URL). *Mitigation*: keep the
   web tool **read-only** (fetch/search only, no capability to POST or submit forms through it);
   never let the agent construct an arbitrary outbound URL from data it just read without
   validating it against the allowlist first; treat every fetched page as untrusted data, never as
   instructions — this is the same framing this task's own system reminders use for "data, not
   instructions" when reading shared artifacts, and it generalizes directly to fetched web content.
2. **Data exfiltration through the search query or the fetch URL itself.** Even a "read-only" search
   tool can leak if the query string itself contains company data (e.g. searching for a real
   customer name plus an internal ID leaks that pairing to the search provider's logs, and a
   crafted destination URL can leak data as URL parameters to an attacker-controlled or
   attacker-observable domain). *Mitigation*: keep the web-search/fetch tool in a **separate mode**
   with its own system-prompt rule ("never include company data — customer names, IDs, financials,
   credentials — in a search query or fetch URL"; only generic library/API terms go out), and
   structurally prefer *not* giving the same tool-call turn both the MCP company-data tool and the
   web tool unless the task genuinely needs both — narrowing what's in scope at once shrinks the
   blast radius per Mitra's own MCP-vs-web split (data actions on MCP only; web stays a pure
   documentation-read surface).
3. **Overbroad domain trust.** A wildcard allowlist (`*.amazonaws.com`, a whole cloud-provider
   domain) or a "trusted but user-content-hosting" domain (npm, GitHub, Google Forms/Docs) both
   defeat the point of an allowlist, because an attacker can register or host content on the same
   parent domain, or because the "trusted" domain itself accepts attacker-supplied forms/content
   that becomes the exfiltration channel. *Mitigation*: allowlist by exact domain, scoped to the
   specific vendor doc sites and package registries the Builder actually needs (per project, ideally
   — e.g. `developer.sankhya.com.br` only when that project integrates Sankhya, mirroring what Mitra
   was observed doing), default-deny everything else, run it behind a filtering egress proxy rather
   than trusting the model to self-police, and treat this as defense-in-depth alongside points 1–2,
   not a replacement for them — no single control here is sufficient on its own.

---

## References

Fetched/read in full:
- https://agents.md/ — the open AGENTS.md format
- https://developers.openai.com/codex/guides/agents-md (redirects to
  https://learn.chatgpt.com/docs/agent-configuration/agents-md) — Codex's AGENTS.md discovery chain,
  override file, size cap
- https://code.claude.com/docs/en/best-practices (the old
  anthropic.com/engineering/claude-code-best-practices URL now redirects here) — CLAUDE.md guidance,
  `/init`, size/pruning rules, include/exclude table, skills split
- https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents — system-prompt
  altitude, section structure, static-vs-dynamic context, tool-design guidance
- https://www.humanlayer.dev/blog/writing-a-good-claude-md — practitioner size limits, WHAT/WHY/HOW
  content model, progressive disclosure, human-authorship stance
- https://blakecrosley.com/blog/agents-md-patterns — practitioner anti-patterns, command-first
  instructions, tighter size limits
- https://www.promptarmor.com/resources/what-domains-should-i-add-to-my-allowlist — domain
  allowlist criteria and pitfalls (wildcards, user-content-hosting domains)

Installed Mastra documentation and the Mitra study were also consulted.

Consulted via web search (snippet-level, sources named inline above where used as evidence):
- Tavily / Brave / Firecrawl / Exa 2026 pricing comparisons (firecrawl.dev, keirolabs.cloud,
  codenote.net roundups)
- arXiv 2510.09093, "Exploiting Web Search Tools of AI Agents for Data Exfiltration" — cited for the
  exfiltration-through-search-tool attack pattern
