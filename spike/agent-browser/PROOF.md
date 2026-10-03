# Proof: Mastra `AgentBrowser` against a Chromium in an E2B sandbox

Date 2026-10-02 (runs at 2026-10-03T00:08Z to 00:13Z). Throwaway spike. Branch `spike/agent-browser` (commit 129c6e31, pushed, no PR). Code in `spike/agent-browser/` of `~/wt-agent-browser`. Raw logs in `spike/agent-browser/out/*.log`. Screenshot: `~/conexus-study/2026-10-02/agent-browser/proof-screenshot.png`.

Versions: `@mastra/agent-browser` 0.5.3, `agent-browser` 0.19.0, `@mastra/e2b` 0.12.1, `e2b` 2.46.1, Chromium 153.0.8010.52 in the template, Node 24.20.0 in the sandbox. Template: `CURRENT_TEMPLATE_PIN.templateRef` (`537fnzf4c16x9d7oz21k:449fd9f1-...`). Sandboxes were created with `E2BSandbox` and the options `createConversationSandbox` uses (`allowPublicTraffic: false`, template, timeout 300 s).

## Verdict

Option A works. All five proofs pass, with three findings that change the wiring. Table of results:

| # | Proof | Result |
| --- | --- | --- |
| 1 | Reach the sandbox Chromium | Pass, but not with `cdpHeaders` and not without a forwarder |
| 2 | Snapshot, click, screenshot as image | Pass |
| 3 | Console, page errors, failed requests | Pass, with a small adapter and one call Mastra never makes |
| 4 | Stay on the app origin | Pass, hostname-level only |
| 5 | A Mastra `Agent` with `browser` | Pass on Haiku 4.5, needs Mastra memory |

## 1. Reaching the sandbox Chromium

**Template's Chromium.** `/usr/bin/chromium` 153, run by `application-check.ts:435-440` as user `conexus-agent` with `--headless=new --disable-gpu --no-sandbox --disable-dev-shm-usage --remote-debugging-port=0 --remote-debugging-address=127.0.0.1 ...`. The spike uses the same flags with a fixed port 9222.

**Host header refusal confirmed** (sandbox ix1o0h7sdqhxb33qnbco7):

```
curl -H "Host: 9222-abc.e2b.app" http://127.0.0.1:9222/json/version
  -> Host header is specified and is not an IP address or localhost.
GET https://9222-<id>.e2b.app/json/version  (with e2b-traffic-access-token)
  -> 500 Host header is specified and is not an IP address or localhost.
GET the same, no token
  -> 403 Sandbox is secured with traffic access token. Token header 'e2b-traffic-access-token' is missing
```

So the E2B edge needs the E2B host name and Chromium needs localhost. No Chromium flag lifts the Host check (`--remote-allow-origins` is for Origin only), so I did not try flags.

**Fix that works: a forwarder inside the sandbox.** A 15-line Node TCP forwarder on 0.0.0.0:9223 rewrites the `Host:` header to `localhost:9222` until the connection upgrades, then pipes to Chromium (`sandbox-side.mjs`, `FORWARDER`). The E2B host for port 9223 then reaches Chromium.

**Second finding: `cdpHeaders` does nothing in the installed stack.** `@mastra/agent-browser` copies `cdpHeaders` into the launch options (`dist/index.js:55`), but `agent-browser` 0.19.0 calls `chromium.connectOverCDP(cdpUrl, { timeout })` with no headers (`node_modules/agent-browser/dist/browser.js:1453`; no `cdpHeaders` string anywhere in its dist). Evidence:

```
P1a cdpUrl=public https + cdpHeaders -> Failed to connect via CDP to https://9223-isa79wawtmum6iwj23szh.e2b.app.
```

So the E2B traffic token cannot reach E2B through `cdpHeaders`. What worked is a Hub-side loopback tunnel (`hub-proxy.mjs`, about 20 lines): it listens on 127.0.0.1:random, and for each connection opens TLS to the sandbox host and rewrites the first request's `Host:` to the sandbox host plus an `e2b-traffic-access-token` header. The token never leaves the Hub process.

**Third detail.** `/json/version` through the tunnel returns `ws://localhost:9222/devtools/browser/<id>` (the forwarder's rewritten Host). So `cdpUrl` is an async function that fetches `/json/version` through the tunnel and returns `ws://127.0.0.1:<tunnelPort>/devtools/browser/<id>`. Mastra accepts a function there.

Evidence of a working connection (sandbox isa79wawtmum6iwj23szh, run 1):

```
P1b /json/version through tunnel+forwarder: {"Browser":"Chrome/153.0.8010.52","ws":"ws://localhost:9222/devtools/browser/c60d51be-..."}
P1b connected; goto -> {"success":true,"url":"http://127.0.0.1:4173/","title":"Conexus stub app",...}
```

## 2. Seeing an app

I used a 20-line Node server on 127.0.0.1:4173 inside the sandbox (stub page: heading, an Add item button, a Break it button, an external link). The template's starter app needs `npm run build` in the sandbox, which I did not spend sandbox time on. A built app would only change what is served.

Tools were obtained from `browser.getTools()` (16 tools) and run with `tool.execute(input, { agent: { threadId } })`. Run 3, sandbox i6x3td1rhfdyzhpiyxov6:

```
browser_snapshot -> {"snapshot":"- button \"Add item\" @e1\n- button \"Break it\" @e2\n- link \"External link\" @e3","elementCount":3,...}
browser_click {ref:"@e1"} -> {"success":true,...}
browser_screenshot -> keys base64,url,title; 10775 bytes;
  tools.browser_screenshot.toModelOutput -> [{type:"media", mediaType:"image/png", data:<base64>}]
```

The screenshot file shows "Stub notebook", "Items: 1", "Item 1" and the buttons, so the click took effect: `proof-screenshot.png`. `toModelOutput` returns a media part, which is how the model sees an image.

**Finding: the default snapshot is interactive-only.** After the click, the default snapshot still lists three controls and not the text "Items: 1". The model must pass `interactiveOnly: false` to read page text (the Haiku run did, after I put that in the instructions). With it the tree shows `paragraph: "Items: 1"`, `listitem: Item 1`. The Builder prompt must say so, or the Conexus wiring should default it.

## 3. Reading errors

Through `await browser.getManagerForThread(threadId)`:

- `getPageErrors()` after clicking Break it: `[{"message":"undefinedFunction is not defined"}]`. Pass.
- `getConsoleMessages()`: `stub boot error: deliberate` (type error), `api status 404`, `Failed to load resource: ... 404`, and the blocked cross-origin loads. Pass.
- `getRequests()` returned `[]`-style data only after I called `mgr.startRequestTracking()` myself. Mastra never calls it. It records requests only (url, method, resource type), with no status and no failure.
- Failed requests and 4xx need page listeners. The spike attaches `page.on('requestfailed')` and `page.on('response')` on `mgr.getPage()` and got:

```
{"kind":"http","url":"http://127.0.0.1:4173/api/missing","status":404}
{"kind":"failed","url":"http://localhost:4174/pixel.png","why":"net::ERR_BLOCKED_BY_CLIENT.Inspector"}
```

A clean PR must call `startRequestTracking()` and add those listeners (and re-add them for new tabs) inside the Conexus tool. Console, page errors and failed requests all work over `connectOverCDP`.

## 4. Staying on the app's origin

`AGENT_BROWSER_ALLOWED_DOMAINS=127.0.0.1`, set in the Hub process before the first manager launch. It applies over CDP (the library installs the filter in `connectViaCDP`). Evidence (run 3):

```
browser_goto https://example.com/   -> net::ERR_BLOCKED_BY_CLIENT
browser_goto http://localhost:4174/ -> net::ERR_BLOCKED_BY_CLIENT
browser_goto file:///etc/passwd     -> net::ERR_BLOCKED_BY_CLIENT
page sub-requests to http://localhost:4174/ (img and fetch) -> requestfailed net::ERR_BLOCKED_BY_CLIENT.Inspector
in-sandbox server on :4174 hit log: file never created (zero hits)
```

**Limit.** The filter matches hostnames, not ports. `browser_goto http://127.0.0.1:9223/json/version` succeeded: the page's own loopback host can reach any other loopback port in the sandbox, including Chromium's CDP port. The study already accepted that the agent can reach its own Chromium. A real PR can narrow it with an exact-origin check in the Conexus layer if wanted. The env var is process-wide, so concurrent runs need the same host set, or the library's `allowedDomains` launch option, which Mastra's config does not expose.

## 5. An agent using it

`Agent` from `@mastra/core/agent` with `browser`, model `claude-haiku-4-5` through `opencodeClaudeMaxProvider` (the Hub's own route for an `oauth` Anthropic account, `apps/hub/src/builder/anthropic/route.ts:26-28`), and one extra Conexus-style tool `conexus_browser_problems`. Sandbox i6e69gz456nsiemmfyixw, 35 s.

**Credential note.** The Hub keeps accounts sealed in its database, which I did not open. No `ANTHROPIC_API_KEY` exists on this machine. I read Leandro's Mastra Code login (`~/.local/share/mastracode/auth.json`) through the SDK's `AuthStorage` in-process, never printed. The library may rewrite that file when it refreshes the token. Leandro should know a Haiku 4.5 call went through his subscription login.

Tool call loop:

```
browser_goto > browser_snapshot > browser_click > browser_click > browser_snapshot > browser_snapshot > browser_click > conexus_browser_problems > browser_screenshot
```

Final text excerpt: `Items: 1` and `"undefinedFunction is not defined" (PageError)`. Usage: 40,637 input tokens (23,432 cached), 778 output, for 9 tool calls.

Two findings:

- **Memory is required.** With `browser` set, the `browser-context` processor fails without Mastra memory: `computeStateSignal requires Mastra memory with an active resourceId and threadId`. I gave the agent a `Memory` on LibSQL and passed `memory: { thread, resource }`. The Builder already has memory, so this costs nothing there.
- **Two clicks, one item.** The agent clicked `@e1` twice and the page showed `Items: 1`. The refs are renumbered when a non-interactive snapshot is taken, but the clicks came before that snapshot, so I did not root-cause why the second click did not add an item. Needs its own test (click the same ref twice, read the count) before relying on repeated clicks.

I cannot prove the model looked at the image itself. The final text describes the page correctly, but the snapshot also holds that. What is proven is that the tool returns an image media part.

## Sandboxes and lifetimes

Every sandbox was created inside `try` and killed in `finally` with `e2b.kill()` plus Mastra `_destroy()`. One at a time, 300 s timeout, never reached. Ids and lifetimes, all killed:

| id | lifetime | what |
| --- | --- | --- |
| ix1o0h7sdqhxb33qnbco7 | 10 s | Host header probe |
| isa79wawtmum6iwj23szh | 24 s | proofs 1 to 4, first run (click regex was wrong) |
| i0j60p3bblatr0ccxasvy | 23 s | rerun, regex edit had not applied |
| i6x3td1rhfdyzhpiyxov6 | 24 s | proofs 1 to 4, final run |
| idnanp168qqsv1qk3kkcd | 7 s | agent run, bad import path of mine |
| i6xy9b5hk4vcabuuuacd9 | 9 s | agent run, Chromium not up yet |
| ig0wrc0gjy3rn9ntbarzu | 9 s | agent run, memory missing |
| i6e69gz456nsiemmfyixw | 35 s | proof 5, final run |

End-of-run listing (`list.mjs`, whole account, all states): one sandbox, `idarijtfic1hfnntzngoi`, state `paused`, with the `conexus-builder-conversation` metadata. It is a Builder conversation machine, not mine. None of the eight above remain.

## Wiring that worked

```
Hub process                                         E2B sandbox (template pin, user conexus-agent)
  Agent({ browser, memory })                          chromium --remote-debugging-port=9222 (127.0.0.1)
    AgentBrowser({ cdpUrl: async () => ws://127.0.0.1:T/devtools/browser/<id> })
      agent-browser 0.19.0 -> Playwright connectOverCDP    forwarder :9223  (Host -> localhost:9222)
  loopback tunnel :T  --TLS, Host=9223-<id>.e2b.app, e2b-traffic-access-token-->  E2B edge
  AGENT_BROWSER_ALLOWED_DOMAINS=127.0.0.1                  app on 127.0.0.1:4173
```

## What a clean PR needs

1. Move `@mastra/agent-browser` and `playwright-core` (and `agent-browser`) into the Hub's own dependencies. They are only transitive through `@mastra/code-sdk` today.
2. Put the Chromium launch and the Host-rewriting forwarder into the check/sandbox tooling the Hub owns (next to `check.mjs`, same flags), started per run as the agent user, killed with its process group.
3. Replace the spike tunnel with a typed Hub module: one loopback listener per run, bound to 127.0.0.1, torn down with the run, token read from `sandbox.e2b.trafficAccessToken` and never logged. Or raise the `cdpHeaders` gap upstream (`agent-browser` does not forward them), and keep the tunnel only until that lands.
4. `cdpUrl` as an async resolver that fetches the browser id through the tunnel on each (re)connect, so a Chromium restart after a sandbox resume gets a fresh id. Not proven here (proof item 6 of the study).
5. `conexus_browser_problems`: call `startRequestTracking()`, add the `requestfailed` and `response` listeners, redact and cap output like `redactEvidence` in `application-check.ts`.
6. Narrow the origin wall to the exact app origin (port included) if the hostname-level wall is not enough, and set the allowed domains per run, not through the process env.
7. `excludeTools`: at least `browser_evaluate` and `browser_tabs`, per the study's security table.
8. Builder prompt line: snapshot with `interactiveOnly: false` to read text; look at the app before saying done.
9. `browser` option and Memory on `createBuilderController` (`apps/hub/src/builder/harness/controller.ts`). Test the repeated-click behavior.
10. Credentials: a real run must use the Hub's own sealed model account, not a local login.

## Not proven

Chromium crash, and sandbox pause and resume (study proof 6). Token cost on a real built app (the notebook app from Q2). A seeded-fault run where the agent finds and fixes a bug. Whether `AgentController` accepts the same `browser` option end to end here (the study read the source; I used a plain `Agent`).
