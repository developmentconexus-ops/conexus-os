# 49. Mastra memory kinds and the Project file memory

Installed: `@mastra/memory` 1.32.1, `@mastra/core` 1.71.0 (`node_modules/@mastra/{memory,core}/package.json:3`).

**DOCS** = `node_modules/@mastra/memory/dist/docs/references/`. **SRC** = `packages/memory/src/`. **B** = `apps/hub/src/builder/`. **MC** = `mastracode/sdk/src/`.

**Decided (the operator, 2026-09-30):** observational memory with thread scope as today, the Project file memory (`.conexus/memory/`), and `retrieval: true` on observational memory (resource scope, which is the Project; no vector store, nothing sent out). Working memory and semantic recall stay off. Mastra injects the recall tool's instructions itself, so the system prompt gets no line for it. Measure the three arms in the bakeoff.

## Answer in four lines

1. Yes, one Mastra kind spans conversations: observational memory with `scope: 'resource'`, or resource-scoped working memory. Both are keyed by resource id, and the Builder's resource id is already the Project (`project:<id>`). Observational resource scope is marked experimental.
2. They can run together. No code blocks any pairing, but the docs advise against observational plus working memory.
3. Neither fits "visible to developers, versioned with the app". Both live in the database. File memory is the only option that does.
4. Skipping semantic recall and working memory loses little. Having no way to recall old conversations loses something real; OM `retrieval` covers it cheaply.

## 1. The kinds, from the installed docs

**Message history.** Every message is stored per thread; the last N load into context, default 10 (DOCS/docs-memory-message-history.md:124). It needs storage only (docs-memory-overview.md:54). It costs the tokens of N messages, every turn.

**Observational memory (OM).** Background agents, an Observer and a Reflector, keep a dense observation log that "replaces raw message history as it grows" (docs-memory-observational-memory.md:9). Storage is the same DB (docs-memory-observational-memory.md:32). It needs no vector store and no embedder.
- Injection: raw messages grow to about 30k tokens, then shrink to about 6k. The log stays near 40k tokens (docs-memory-observational-memory.md:215, 404, 420-425).
- Cost per turn: background Observer calls every ~6k message tokens, plus Reflector calls (docs-memory-observational-memory.md:420). The prefix stays stable, so prompt caching works (docs-memory-observational-memory.md:198).
- Scope: `thread` is the default and "well tested". `resource` shares observations across all threads of a resource and is "experimental" (docs-memory-observational-memory.md:601-618, 633).
- Raw-message recall: `retrieval: true` registers a `recall` tool over the raw messages behind each observation, "No vector store needed", resource scope by default, so it reads other threads (docs-memory-observational-memory.md:435). `retrieval: { vector: true }` adds semantic search, reusing the vector store and embedder (docs-memory-observational-memory.md:450-466).

**Working memory.** It is a Markdown block, or a JSON schema, that the agent rewrites through a tool (docs-memory-working-memory.md:48, 277-278; core removed any other mode, `packages/core/src/memory/memory.ts:393`). It is stored in DB (`mastra_resources`). Resource scope is the default and needs libSQL, PG, Oracle, Upstash or Mongo (docs-memory-working-memory.md:17-20, 126-136). It goes into the system message every turn, which breaks the prompt cache when it changes. `useStateSignals: true` delivers it as a state signal instead (docs-memory-working-memory.md:405-426; docs-memory-observational-memory.md:323). It is small by design (docs-memory-observational-memory.md:897).

**Semantic recall.** It embeds each new message into a vector store and, each turn, embeds the user's query and retrieves similar messages. Defaults: topK 4, range 1 before and 1 after (docs-memory-memory-class.md:50). Scope is `thread` or `resource` (docs-memory-semantic-recall.md:159-184). It needs storage, a vector store and an embedder. It "adds latency" each call (docs-memory-semantic-recall.md:412). It is off by default.

## 2. Combining them

- OM plus working memory: "We recommend using either observational memory or working memory because they cover overlapping needs. Running both adds latency and token cost without much benefit." (docs-memory-multi-user-threads.md:122). OM can also manage working memory itself with `manageWorkingMemory` (docs-memory-observational-memory.md:321).
- OM plus semantic recall: "OM replaces both working memory and message history, and has greater accuracy (and lower cost) than Semantic Recall." (docs-memory-observational-memory.md:903). No code forbids the pairing: `getInputProcessors` adds each processor independently (SRC/index.ts:3749-3765).
- Resource scope limits: async buffering is turned off (docs-memory-observational-memory.md:789); the first run processes all unobserved messages of all threads together and "can be slow" (docs-memory-observational-memory.md:639); one thread may continue work another had started, so the system prompt may need tuning (docs-memory-observational-memory.md:633).

## 3. What the Builder configures today

- Storage: Postgres (B/module.ts:192-193). No vector store or embedder appears in `B` (grep found none).
- `Memory` options (B/memory.ts:57-72): `lastMessages: 40`, `semanticRecall: false`, OM enabled with `scope: 'thread'`, `activateAfterIdle: 'auto'`, `activateOnProviderChange: true`. Thresholds default to 30,000 message tokens and 40,000 observation tokens (B/memory.ts:19-21). No working memory, no `retrieval`.
- Thread id = the conversation id (B/run-runtime.ts:630, `threadId: conversationId`).
- Resource id = the Project: `` `project:${projectId}` `` (B/conversations.ts:11), used when opening sessions (B/run-runtime.ts:603, 630). So it is neither the person nor the company. Every member's conversations are threads under one Project resource (B/conversations.ts:6-8).
- The Project's `AGENTS.md` (8 KB cap) already goes into the prompt as "Project knowledge" (B/project-knowledge.ts:1-11; B/harness/prompt.ts:61): a first file memory.

## 4. What Mastra Code does

- `Memory` with OM on, `retrieval: vector ? { vector: true } : true`, scope from `getOmScope` (default `'thread'`), fastembed as embedder only if a vector store exists. No `semanticRecall`, no `workingMemory` (MC/agents/memory.ts:205-216; MC/utils/project.ts:492-493).
- Its experimental "Subconscious" knowledge graph is off unless an env flag and a vector store exist (MC/agents/memory.ts:125-127).
- Cross-session project knowledge is files: `AGENTS.md` and `CLAUDE.md`, project and global (MC/agents/prompts/agent-instructions.ts:2-13; MC/agents/prompts/index.ts:146).

So Mastra's own coding agent splits as we plan: OM for the conversation, files for the project.

## 5. Mapping to Conexus needs

| Need | Mastra kind that fits | File memory | Verdict |
|---|---|---|---|
| (a) Continuity inside one long conversation | OM, thread scope. Built for this (docs-memory-observational-memory.md:206-209). | Not its job. | Keep OM thread scope. |
| (b) Project knowledge across conversations and people | OM resource scope (key `project:<id>`, experimental, see section 2) or working memory resource scope (same key). | Files in the app repo, one fact each, an index in the prompt. | File memory. |
| (c) Recall a detail from an old conversation | OM `retrieval: true` (recall tool, resource scope by default). Optional vector search. Semantic recall is the heavier alternative. | Only if the Builder chose to write the fact. | Enable OM retrieval. |

Why file memory wins (b):
- **Shared by several people.** `project:<id>` works as the resource key. But OM resource scope merges every person's threads into one log, and one thread may continue another's work (docs-memory-observational-memory.md:633, 635).
- **Visible and editable by developers.** OM and working memory rows sit in Postgres, reachable only through our API. Files in `.conexus/memory/` are readable and editable in the repo.
- **Versioned with the app.** DB rows are not. A reverted app version would keep memory of code that no longer exists. Files revert with the commit.
- **Company data rules.** Our rule: never store company values in memory (system-prompt-v2.md:22). The Builder chooses each fact it writes to a file, and a reviewer can read it. OM and semantic recall distill or embed whatever the conversation held, including values read through a Conexão. The Observer sees the raw messages and its model call already sends them to the provider today (docs-memory-observational-memory.md:215-219).

Exact text that leaves, per kind:
- **OM (today).** Conversation messages and attachments go to the Observer and Reflector models, the provider the person's account uses (B/memory.ts:50-51). Observations, which may restate values, return into the prompt.
- **Semantic recall.** Each new message's text parts go to the embedder provider (SRC/index.ts:1565-1585). Each turn, the user's query text goes to it too (SRC/index.ts:803). Embeddings land in the vector store. Setting `fastembed` runs the embedder locally and sends nothing out (docs-memory-semantic-recall.md:310-312). Tool results are not embedded, but assistant text quoting them is.
- **Working memory.** The agent writes it and decides what to store; nothing filters values.
- **File memory.** Only what the Builder writes into a file, which the Hub can scan and a developer can review.

## 6. Recommendation

**Use OM (thread scope, as today) + file memory + OM `retrieval: true` for old conversations.** Skip working memory and semantic recall.

- **Skip resource-scope OM.** It is experimental, turns off async buffering, may blur threads of different people, and stores unreviewed text in the DB. The files give the same continuity.
- **Skip working memory.** Docs say it overlaps with OM (docs-memory-multi-user-threads.md:122); the files do the same job in the repo. Loss: none.
- **Skip semantic recall.** It needs a vector store and embedder (new infrastructure), adds per-turn latency, sends message text to a provider, and Mastra rates OM as more accurate and cheaper (docs-memory-observational-memory.md:903). Loss: fuzzy search over old messages, which `recall` browsing partly covers.
- **Add OM `retrieval: true`, scope `resource`.** One config line in B/memory.ts. It needs no embedder. The agent can list the Project's threads and read the raw messages behind an observation (docs-memory-observational-memory.md:435, 470). This answers "what did we decide about the late rule last month?" without a fact file. The recall tool reads every conversation of the Project, which fits a shared Project; Mastra enforces no access control (docs-memory-message-history.md:249).
- **Risk:** a fact decided in conversation 1 and never written to a file is gone from conversation 2 unless `retrieval` is on, so the prompt must push the Builder to write decisions down.

### Bakeoff test (cheap)

Same Project, three arms: (A) OM only (today); (B) OM + file memory; (C) B + `retrieval: true`.
1. Conversation 1 (person X): state a rule ("orders more than 5 days late are flagged red") and a preference ("table, not cards"). Let the Builder finish. End the conversation.
2. Conversation 2 (new thread, person Y, same Project): ask "add the late orders screen". Score 1 if it applies the rule and the preference without being told. Also ask "what did we decide about the late rule?" and score the answer against the truth.
3. Repeat the question after a week of other conversations. Count turns to the right answer.
4. Privacy check: scan stored files and observations for a planted fake value read through a Conexão.
Five repeats per arm. Record prompt tokens per turn and latency as the cost column.

## Sources

- DOCS/docs-memory-overview.md, docs-memory-message-history.md, docs-memory-observational-memory.md, docs-memory-working-memory.md, docs-memory-semantic-recall.md, docs-memory-multi-user-threads.md, reference-memory-memory-class.md, reference-memory-observational-memory.md
- SRC/index.ts; `packages/core/src/memory/memory.ts`
- B/memory.ts, B/conversations.ts, B/run-runtime.ts, B/module.ts, B/project-knowledge.ts, B/harness/prompt.ts
- MC/agents/memory.ts, MC/utils/project.ts, MC/agents/prompts/agent-instructions.ts, MC/agents/prompts/index.ts
- the historical system prompt v2 (not published here) (Memory section, data rule)
