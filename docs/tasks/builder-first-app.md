# Builder operational delivery program

This file owns the delivery sequence and cross-increment Product outcome.
[The roadmap](../roadmap.md) owns status and grant.
[C-020](../reference/builder-c020-mastra-native.md) owns technical meaning.
Each actionable delivery has one task.

## Functional target approved on 2026-09-17

The operator approved the interactive Builder HTML and explicitly deferred visual
polish. [Frontend section 33.6](../reference/frontend-and-product-surfaces.md#336-build-surface)
records the exact artifact and interaction contract. Do not repeat UI discovery.
The HTML is a behavior reference, not production code or live proof.

A user connects Claude, selects a model in chat, creates an application, sees real
agent activity, uses Preview, requests another change, and continues after reload
or failed compilation. Editing, read-only use, interruption, Code/Diff, and safe
execution details belong to this functional target.

The pilot retains the current React/Vite generated-app scope. The quotation app
contains fictitious products. It is not a live Metal Nobre pricing tool, generated
backend, ERP integration, publication feature, or complete business platform.

## Delivery sequence

The [interactive delivery task](builder-interactive-delivery.md) consolidates the
unfinished [first operational delivery](builder-first-operational-delivery.md)
and [Claude connection work](claude-account-connection.md). Their valid findings
remain input; their old order and restrictions do not create parallel tasks.

| Unit in the current task | Observable result |
| --- | --- |
| 1. Connection and admitted model | A connection has coherent authorization/renewal, and each run records the selected model rather than a hidden global default. |
| 2. Real interactive workspace | App-first Preview and chat operate together, with native activity and model selection in the composer. |
| 3. Continue and correct | Second edit, failed compile, explicit repair, interruption, and reload preserve the correct source and last-good Preview. |
| 4. Inspect and prove | Code/Diff, safe run details and native traces correspond to real execution; the complete browser journey and isolation checks pass. |

These units are not approval gates or separate product projects. Implement them
in order, exercise each result, and deliver one reviewable candidate. A missing
external credential does not prevent independent implementation/testing, but it
prevents claiming the affected live proof.

## Preserved boundaries

Mastra owns AgentController, Session registry, Thread/messages, tools, Workspace
binding, displayState, and agent observability. Conexus owns authorization,
BuilderRun, idempotency, admitted model and connection, source/version, CAS,
compiler/artifact identity, and last-good Preview. UI libraries own presentation.
There is no ordinary Change, WorkUnit, ActorRun, or second conversation system.

One active BuilderRun per Project remains enforced. A second request uses current
working source, including source that failed compilation. Failed or interrupted
work never substitutes an uncompiled artifact for the last-good Preview.
The user does not administer hashes, runtime identities, or manual preparation.

BUILD and PLAN remain write-capable and read-only permissions. Friendly labels
and model choice do not introduce a Plan/approval workflow. Native traces explain
execution and never replace Product settlement.

## Scope discipline

Take source/diff optimizations only when they serve this task's bounded reads.
Do not require a whole Git rewrite or full performance breakdown. Use native
Mastra observations before adding instrumented equivalents.
The [7R-2 samples](builder-7r-2-runtime-waterfall.md) remain partial evidence.
The old mandatory 7R-3/7R-4/7R-5/7U sequence stays superseded.

The requested safe run-detail panel is now part of the pilot. A complete Studio,
unrestricted traces, observability dashboards, workflows, subagent controls,
attachments, voice, generated backends, and Sankhya remain outside this delivery.
Color/theme fidelity and motion polish do not block it. Usability, keyboard
operation, hierarchy, responsive panels, and truthful state do.

## After this candidate

Review the real journey before adding more product scope. Address only remaining
material continuity gaps, then add one useful business capability at a time.
Broader crash recovery, multiple Hub processes, deployment, advanced model policy,
Brain/Sankhya and managed workflows receive tasks only when they become actionable.
No placeholder future tasks or speculative platform frameworks are required.
