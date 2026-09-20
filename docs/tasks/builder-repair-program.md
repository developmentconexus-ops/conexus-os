# Builder repair program plan

**Closed on 2026-09-20.** Every unit is merged. One of them, P-06, does not work as
merged and its corrections are open; [the roadmap](../roadmap.md) owns that status and
what is next. This file is the record of what each unit owed and what it proved. It is
not an execution path and nothing in it is a next action.

| Unit | Outcome |
| --- | --- |
| P-01 | Verification floor restored, 2026-09-18. |
| P-02 | A failed request stays on screen with a named reason, and an internal failure code never reaches the browser. Migration `0005` carries the request text on the run. |
| P-03 | The Preview states a grant and then a frame that navigated, and never that the application loaded. The iframe gained the load handler it never had, counted only after the entry submit for that lease. |
| P-04 | A past run is selectable and drives Details, Diff and the trace. A send whose outcome is unknown keeps its idempotency key. A retried diagnostic collapses onto one message. |
| P-05 | Overtaken rather than executed. The deployment model catalog and the pinned model and admission constants had already gone with Mastra-native model choice, and `apps/hub/src/claude-account` no longer exists. What remained, naming the connection that pays for the next request, shipped with P-04. The unit below records the original intent; do not run it. |
| P-06 | The compile answers whether the artifact boots, and a build or boot failure keeps the source and the previous Preview. The build-failure contract is proven and holds. The smoke itself does not run as merged: its script cannot parse, its verdict was discarded, and it drove the wrong DevTools target. Two open pull requests fix those, and the pilot proof was taken with them applied. |

Three defects were found by running the result rather than by the suites, and each was
fixed with a test that fails without the fix: a tree refusal that killed the whole run
instead of settling as a build failure, a smoke script that could not parse and so never
ran, and a verdict that was discarded because the sandbox raised a non-zero exit as an
error. Two of those corrections were still open as pull requests when this file closed.

The checklists below are historical. Their boxes are not instructions, their ten-lane
swarm and review-gate blocks were not the process actually used, and the live and perf
lanes record what was owed rather than what to do next.

## What each unit changed

Compact record. The execution checklists, their ten-lane swarm blocks, their perf rules
and their review gates were removed on 2026-09-20 rather than left readable as
instructions. Git history holds them.

| Unit | Code it moved | Evidence it left |
| --- | --- | --- |
| P-02 | `builder/failure-vocabulary.ts` maps internal codes onto nine public categories and is the one place a run becomes wire shape; migration `0005` adds `builder_run.request_text`; the Build screen renders a request the thread has no message for. | `builder-failure-vocabulary.test.mjs`, `builder-run-request-text-postgres.test.mjs`, three pilot lanes: preparation failure, success, cancellation. |
| P-03 | `project-build.tsx` gains an iframe load handler counted only after the entry submit for that lease, and states a grant and then a navigation. | A browser test that holds the entry route open so the grant resolves while the frame is still blank; a cold pilot load. |
| P-04 | A selected run drives Details, Diff and the trace; an uncertain send keeps its idempotency key; `appendDiagnostic` derives its message id from the run and the code. | Three tests, each mutated to confirm it fails for the reason it claims. No pilot lane. |
| P-05 | Nothing. Overtaken by Mastra-native model choice; the remaining line shipped with P-04. | The absence is the evidence: the constants and `apps/hub/src/claude-account` do not exist. |
| P-06 | `buildApplicationInSandbox` gains a smoke step; the run carries a build outcome instead of raising one, so a build or boot failure still admits the source and settles `SOURCE_CHANGED_BUILD_FAILED`. | The build-failure contract is proven by dispatch tests and holds. The smoke does not run as merged; see the roadmap. |

## What the units found that the plan did not predict

- A refused application tree killed the whole run instead of settling as a build failure. It is a build failure now.
- Codes a build failure can settle with were not all declared, so a run that kept its source could have reported an internal error. One open pull request fixes that and ties the table to the branch that feeds it.
- Twelve tests covered the boot smoke and passed against a script that could not parse, because they faked the sandbox and never the script itself. The lesson is specific: a generated program tested only through its caller is not tested.

## Alternatives rejected along the way

Adding a second catalog entry by hand to unblock the model-switching proof. It institutionalises the parallel list the operator objects to, even as a temporary step. P-05 removes the reason instead.

Deriving the offered model list from `PROVIDER_REGISTRY`. The registry carries fourteen Anthropic ids with no date, latest or deprecation metadata, mixing aliases, dated snapshots and superseded generations. Any ordering or filtering would be Conexus opinion, which is the thing being removed. The catalog shrinks instead of disappearing.

A postMessage readiness handshake from the preview document. Conexus serves the artifact's own bytes and checks sha256 per request, so injecting at serve time defeats the integrity invariant. A beacon inside `app/**` is the agent's claim, since section 8.3 makes those files the agent's. No comparable product has a positive health signal either; StackBlitz, CodeSandbox, Replit, v0, bolt and E2B all define ready as a port binding or a painted frame.

Ten separate PRs, one per ledger item. The lane discipline exposed the decomposition as too fine. A PR with fewer than ten real scenarios is not a PR, it is a commit inside one. Six PRs each carry ten genuine scenarios.

Two claims carried by the predecessor delivery contract were false and are recorded here because its file is gone. Restarting the Hub does not invalidate the operator session; the cause is ordinary idle expiry, per Appendix A. Native discovery cannot replace the catalog for Mastra 1.63.2, which has no per-credential discovery at all.

## Risks that outlived the program

- P-06 added Chromium to the template, roughly 281 MB. The build budget was not breached.
- A live lane needs an operator session, which idles out after thirty minutes.
- A lane that drives a real build creates E2B sandboxes and spends the operator's model quota.

## Reading before touching this area

`docs/reference/builder-c020-mastra-native.md`, `AGENTS.md`, `.agents/skills/mastra/SKILL.md`
and the installed Mastra packages.
