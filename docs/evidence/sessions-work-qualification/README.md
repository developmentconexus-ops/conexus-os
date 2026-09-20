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
| [`probe.mjs`](probe.mjs) with [`run.sh`](run.sh) | Conversations on the installed `@mastra/core`, one property at a time, across two separate OS processes | A scratch LibSQL file under `/tmp`, reading the product's `node_modules` without writing to it |
| [`factory-compat.sh`](factory-compat.sh) | Whether `@mastra/factory` resolves alongside the versions the product already has | `/tmp/factory-compat`, its own `package.json` and `node_modules` |
| [`factory-boot.mjs`](factory-boot.mjs) | Whether the Factory boots self-hosted, with no Mastra platform account and no auth provider | `/tmp/factory-compat` |
| [`factory-work.mjs`](factory-work.mjs) | Whether the Factory's Work domain is usable on its own, which is what one of the two compositions needs | `/tmp/factory-compat` |

## Reproducing

The product worktree used was `/home/leandrotheodoro/wt-stream` on trunk `0b7bca05`. Node is
not on `PATH` by default in this environment.

```bash
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
bash docs/evidence/sessions-work-qualification/run.sh
bash docs/evidence/sessions-work-qualification/factory-compat.sh
cd /tmp/factory-compat && cp <this directory>/factory-boot.mjs . && node factory-boot.mjs
cd /tmp/factory-compat && cp <this directory>/factory-work.mjs . && node factory-work.mjs
```

`run.sh` hard-codes the product worktree path, because the point of the probe is to read the
versions the product actually resolved rather than a fresh install of its own.

No probe calls a model, so none of this costs anything. `factory-compat.sh` and the two
Factory probes reach the public npm registry; the conversations probe reaches nothing.

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
