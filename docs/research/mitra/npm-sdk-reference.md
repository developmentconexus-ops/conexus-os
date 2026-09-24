# Mitra SDK reference for the internal MVP

Inspected on 2026-09-12 after the operator supplied the
[joaoluistq npm profile](https://www.npmjs.com/~joaoluistq).
This is source inspection, not an executed integration or a new Product decision.
The npm website refused some requests. Package metadata and README files were
read directly from the npm registry without installing or executing packages.

## Package map

The registry search for `maintainer:joaoluistq` returned seven packages.
Six concern Mitra. `vue-selectable-j` was excluded as unrelated to this question.
Maintainer overlap is a discovery route, not evidence that every package has the
same support status or belongs in Conexus.

| Package | Observed version | Relevant role |
| --- | --- | --- |
| `mitra-sdk` | 1.0.62 | Platform administration and project deployment helpers |
| `mitra-interactions-sdk` | 1.0.66 | Application interactions, per registry description |
| `mitra-business-sdk` | 1.0.2 | Profile-filtered data consumption, per registry description |
| `@joaoluistq/mitra-platform-sdk-validation` | 1.1.0-beta.0 | Browser client for authentication, entities, functions and integrations |
| `@joaoluistq/mitra-sdk-core-validation` | 0.2.0-beta.0 | Shared environment-neutral contracts, per registry description |
| `@joaoluistq/mitra-functions-sdk-validation` | 0.2.0-beta.0 | Server Function SDK, per registry description |

The last three are validation packages. Do not describe them as stable releases
of the public `@mitralab.io` package names used in their examples.

## What the published files establish

The [mitra-sdk 1.0.62 package](https://registry.npmjs.org/mitra-sdk/-/mitra-sdk-1.0.62.tgz)
README, lines 472-476, documents `deployToS3Mitra` accepting a project archive,
`getDeployStatusMitra` reporting build/deploy status and errors, and
`pullFromS3Mitra` downloading source. This supports separating source transport,
build status and the usable application. It does not establish the final compiled
file layout, transaction protocol, backup strategy or authorization of each asset.

The [platform validation package](https://registry.npmjs.org/@joaoluistq/mitra-platform-sdk-validation/-/mitra-platform-sdk-validation-1.1.0-beta.0.tgz)
README documents a `createClient` configured with app identity and API URL.
It initializes application configuration and exposes data and integration modules.
Browser authentication belongs to that package; shared contracts belong to Core.
These are published API claims, not behavior verified by this session.

## Application to Conexus

Use a small app-facing client so generated code does not configure infrastructure.
Keep privileged Builder operations separate from app operations. Treat these as
reference patterns for Conexus generated applications (the first-app task that cited them is
no longer in the repository), not a reason to reproduce every Mitra module or replace Mastra.

For storage, compare total operational cost locally. S3 usage by Mitra alone
does not justify adding S3 to this pilot. Keep application files, application
business data and Builder conversation/source persistence distinct.

Next research is consumer-driven: inspect the relevant SDK method when selecting
the first Sankhya operation. No runtime compatibility, license-adoption decision,
Mitra backend reconstruction or authenticated service behavior was established.
