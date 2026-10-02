# Builder Context7 documentation tools

**Status:** DONE. Merged in pull request #386.\
**Type:** dependency and trust-boundary qualification. Q-b: the Hub gains an outbound call to a
third party. Q-d: `@mastra/mcp` becomes a direct dependency
([delivery rules](../development/delivery.md#pick-the-lane-by-risk)).\
**Aprovo:** required, because the change touches security: a new egress and an optional bearer
credential.\
**Verdict:** ACCEPT_WITH_BOUNDARY, from the operator on 2026-10-02 (#392). The boundary: no real
Builder run has used Context7 yet, so the first real run that does is recorded as its evidence.

## Question

Can the Builder read current library documentation from Context7 with what leaves the Hub bounded
to a library name and a short technical question, and without Context7 being able to stop a run?

## What enters

- `@mastra/mcp` 2.1.0, exact. It is Mastra's own MCP client and the Hub's only MCP code.
- One adapter, `apps/hub/src/builder/harness/context7.ts`, that exposes two Builder tools:
  `context7_resolve_library_id` and `context7_query_docs`. No other remote tool is passed on.
- An optional installation key, read from the file in `CONEXUS_BUILDER_CONTEXT7_API_KEY_FILE`.
  Without it the calls are anonymous.

## Boundary

| Property | How it holds | Proof |
| --- | --- | --- |
| One host | The client is built with `allowedHosts: [url.host]` | `tests/implementation/builder-context7.test.mjs` |
| Only two tools | `REMOTE_TOOLS` is an allow list; any other remote tool is dropped | same test, with a third fake tool that never reaches the Builder |
| The key leaves only to Context7 | It is a request header of that one server, set only when configured | same test, which reads the `Authorization` header the fake server received |
| What is sent | The tool boundary accepts a library id of the form `/org/project`, a library name of at most four words and 50 characters, and a one-line query of at most 200 characters. It refuses, before any call, text with a line break, an email or a run of six or more digits. The tool descriptions and the Builder prompt also forbid company or Project data | `builder-context7.test.mjs`, the refusal test, which also shows nothing reached the fake server |
| Context7 down costs the tools, not the run | Discovery is bounded to 3 s, never throws, and retries after 60 s | same test, with a closed server |
| Not in the sandbox | The Hub runs the client; the E2B guest never sees the key or the URL | [security and authority, section 3](../reference/security-and-authority.md) |

## Technology rule

| Requirement | Answer |
| --- | --- |
| Current consumer | The Builder harness, through `createContext7Docs` in `module.ts` |
| Named limitation | The model's memory of a library is stale. Study 17 found it writing against old APIs, and the checkout holds only the starter's pinned stack |
| API and version examined | `MCPClient`, `listToolsWithErrors` and `allowedHosts` of `@mastra/mcp` 2.1.0 |
| Falsifiable probe | The test file starts a real `MCPServer` from the same package over HTTP and drives the adapter against it. It fails if a third tool leaks, a key goes out unset, or a down server throws |
| Alternative | Hand-written HTTP calls to Context7 would copy the MCP protocol, session and timeout handling that Mastra already maintains ("Mastra first"). A web search tool gives pages, not version-matched snippets |

## Residual risk

The Hub keeps no list of the values the Builder read through Conexões, so the boundary cannot prove
a query is free of company data. It bounds the size and refuses the usual shapes of data. A short
one-line sentence that names company words still passes, and Context7 may keep what it receives. The
operator accepts this with the boundary (`ACCEPT_WITH_BOUNDARY`), or asks for more (`REWORK`).
The first real uses are watched in the MCP spans.

## Not proven

No call to the real `mcp.context7.com` ran from this task or its tests, and no full Builder run used
the tools. A live provider run needs explicit authority
([proof and verification](../development/delivery.md#proof-and-verification)), and the tests prove
only the mocked boundary. The operator can grant that run, or accept with the boundary that the first
real use is watched.

## Done when

The operator gives a verdict on this pull request. The technology row is in the
[roadmap baseline](../roadmap.md#technology-baseline) and the egress line is in the security
reference.
