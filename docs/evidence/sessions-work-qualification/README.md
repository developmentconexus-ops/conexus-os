# Sessions and Work qualification, recorded evidence

This directory holds the throwaway probes the qualification ran, the output they produced,
and the procedure to reproduce them. None of it is part of the product. Nothing here is
imported by the Hub, runs in CI, or is installed into the product's dependency tree.

The task being answered is [sessions-work-qualification](../../tasks/sessions-work-qualification.md).
The qualification is **not** concluded: the comparison it asks for is answered in
[report.md](report.md), which also names what remains without evidence.

## What was run, and where

| Probe | What it exercises | Where it runs |
| --- | --- | --- |
| [`probe.mjs`](probe.mjs), driven by [`run.sh`](run.sh) | Conversations on the installed `@mastra/core`, one property at a time, across two separate OS processes | A fresh scratch LibSQL file, reading an existing `node_modules` without writing to it |
| [`factory-compat.sh`](factory-compat.sh) | Whether `@mastra/factory` resolves alongside the versions the product already has, with a single copy of `@mastra/core` | A fresh scratch directory with its own `package.json` and `node_modules` |
| [`factory-boot.mjs`](factory-boot.mjs) | The Factory's whole boot lifecycle, `prepare()` then `new Mastra(...)` then `finalize()` then `shutdown()`, self-hosted with no platform account | That scratch install |
| [`factory-work.mjs`](factory-work.mjs) | The Factory's Work engine, `FactoryTransitionService`, which is what evaluates a move. Not its storage | That scratch install |
| [`factory-binding.mjs`](factory-binding.mjs) | Conversations under the Factory's own controller, and the step that starts a Work item | That scratch install |
| [`coding-session.mjs`](coding-session.mjs) with [`fixture-model.mjs`](fixture-model.mjs) | An interactive session running its own code tools over a source directory the host owns, from a message to a changed file | A scratch git repository and a scratch store |
| [`code-sdk-mount.mjs`](code-sdk-mount.mjs) | The `@mastra/code-sdk` mount the Factory itself uses, handed a host workspace | That scratch install |
| [`code-sdk-turn.sh`](code-sdk-turn.sh) with [`code-sdk-turn.mjs`](code-sdk-turn.mjs) and [`local-provider-stub.mjs`](local-provider-stub.mjs) | One whole agent turn through that mount, from a message to a changed file, with a local stub answering the model calls | A scratch project and store, plus a loopback HTTP server |
| [`capture.sh`](capture.sh) | Runs all of the above and produces [output.md](output.md) verbatim | Creates its own scratch directories |

`fixture-model.mjs` is a deterministic fake model that emits a scripted tool call and a final
message, and `local-provider-stub.mjs` is a loopback HTTP server that answers the OpenAI
Chat Completions streaming API with the same script. They exist so the tool path can run
without a provider and without cost. Both are integration fixtures, not evidence about a
real model, and each run prints what they were asked for.

Every probe exits non-zero when an assertion fails, and each run ends with a negative
control whose claim is false on purpose, so a run proves the harness can fail. Each probe
creates its own scratch directory with `mktemp -d` and deletes nothing it did not create.

[factory-integration-setup.md](factory-integration-setup.md) records the disposable private
repository the integrated Factory test uses, and what is deliberately absent from it.

## Reproducing

```bash
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
bash docs/evidence/sessions-work-qualification/capture.sh
```

`run.sh` reads an existing install rather than making its own, because the point is to
qualify the versions the product actually resolved. It defaults to
`/home/leandrotheodoro/wt-stream/node_modules` on trunk `0b7bca05` and prints the path and
the three versions it found. Point `CONEXUS_NODE_MODULES` at another install to run it
elsewhere. `factory-compat.sh` takes `FACTORY_VERSION`, `CONEXUS_CORE_VERSION` and
`CONEXUS_LIBSQL_VERSION` the same way.

No probe calls a model, so none of this costs anything. `factory-compat.sh` reaches the
public npm registry; the conversations probe reaches nothing.

## Versions this evidence rests on

Resolved from `node_modules`, not from the declared ranges.

| Package | Declared | Resolved |
| --- | --- | --- |
| `@mastra/core` | 1.67.0 | 1.67.0 |
| `@mastra/memory` | 1.30.0 | 1.30.0 |
| `@mastra/libsql` | 1.23.0 | 1.23.0 |
| `@mastra/server` | 1.67.0 | 1.67.0 |
| `@mastra/fastify` | 1.5.11 | 1.5.11 |
| `@mastra/client-js` | 1.46.0 | 1.46.0 |
| `@mastra/react` | 1.5.0 | 1.5.0 |
| `@mastra/factory` | not declared | not installed in the product; 0.15.0 installed in the scratch directory |

Node v24.20.0.

## Output

Recorded verbatim in [output.md](output.md). Ids are random per run, so a reproduction
produces different ones.
