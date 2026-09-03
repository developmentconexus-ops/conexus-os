# 4F(R1) S6-P2 — Baseline candidate explanation result

> **Status:** `CLOSED PASS`
> **Delivered property:** `PRJ-24 EXACT-CANDIDATE EXPLANATION REALIZED`
> **Stage posture:** `S6 OPEN`; browser consumption remains a separate outcome

## Delivered result

PRJ-24 now traverses the generated client/route contract, authenticated
same-origin HTTP, the Project owner and one tool-free stateless
BaselineExplanationAgent step. Project resolves the caller-named immutable
candidate under current `project.manage`, supplies its server-owned bytes to the
Agent, admits only a non-blank answer with exactly the candidate digest and
source revision as provenance, re-resolves the candidate/current authority after
generation, and emits the candidate identity itself.

The route is read-only and creates no candidate, Baseline, approval, grant,
conversation, memory or framework record. The fixed profile is one step, no
tools, `toolChoice=none`, zero retries, 2048 output tokens and 45000/45000 ms
timeouts. The proof used only a fake model; no OAuth/API-key bytes or real
Product/provider call were used.

The optional wire-level `reviewContext` remains closed. Because no current
server-owned candidate projection/version resolves a DOM or selected-text
anchor, any supplied context returns explicit `422` before candidate lookup or
model execution. Browser presentation cannot silently become Project truth.

Generated projection identity:

```text
Product OAS digest  = 67d141e946e933c8a031d456f9d51ed44389053e5b2c50979b10c927dae07cd3
S3 route projection = 1b568887e36cfa37576905de38eb751d6d190738976ae1b10c4bd8d4048ec9aa
route census        = 8
```

## Deciding proof

| Proof | Result |
| --- | --- |
| S6-P2 HTTP → Project → tool-free Mastra → Project recheck | PASS, 1/1 |
| exact candidate/question reaches the Agent | PASS |
| no-tool/one-step/fixed-output profile | PASS |
| wrong provenance falsifier | PASS; explicit `422`, no late response |
| unowned review-context falsifier | PASS; no store/model call |
| missing candidate falsifier | PASS; `404`, no model call |
| late authority/candidate loss falsifier | PASS; generated answer discarded |
| S6-P0/P1 directed regression | PASS, 3/3 |
| Hub/Web typechecks and import law | PASS; import law 26/26 |
| changed-file Biome and workflow YAML | PASS |
| clean dependency reconstruction | `npm ci` PASS; 336 packages; 2 known low-severity advisories |
| required repository verification | `npm run verify` PASS; current-state check 387 changed paths before receipt docs |
| R1C-14 native protected property | manifest 17/17 PASS; targeted suite 31/31 PASS |

The first focused run contained a test-only assertion that expected the retry
setting at the provider call boundary, although Mastra consumes that setting
outside the provider options. The assertion was corrected to bind the exact
Agent invocation configuration; unchanged Product behavior and all negative
controls then passed. No protected property or deciding Evidence changed.

## Lead adjudication and deferrals

`CLEAR`. The implementation remains inside the packet's mutation ceiling and
the accepted Project/Mastra boundary. No correction changed Product meaning,
authority, credential custody or deciding-proof reliability, so an additional
Fable/AGY review round is not justified under Engineering Method 1.1.

Browser consumption and any future server-owned review projection are deferred
safely to a separate packet. Real provider execution, production/multi-user
OAuth custody, framework expansion, publication and external OCI/input custody
decisions remain blocked.

No commit, push, PR or merge was performed.
