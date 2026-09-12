# Factory packages and Builder reference

Inspected on 2026-09-12 after the operator supplied
[droid on npm](https://www.npmjs.com/package/droid).
Only public metadata and documentation were read. No package was installed,
no Droid process was started and no Factory API key was used.

## Verified package origin and discovery

The [official CLI reference](https://docs.factory.ai/droid-cli/cli-reference)
explicitly names npm installation of `droid`. Registry metadata for
[`droid`](https://registry.npmjs.org/droid/latest) reported version 0.218.1,
repository `Factory-AI/factory`, directory `apps/cli`, and maintainers
`factory-davidgu` and `arman-factory`. This establishes a stronger association
than the package name alone.

Registry searches for each maintainer returned the same fourteen packages.
The relevant names were `droid`, `@factory/cli`, `@factory/droid-sdk`, and nine
platform-specific CLI distributions. `@factory/eslint-plugin` and
`@factory/nanobanana` were excluded from this storage/Builder question.
This is a bounded maintainer search, not an exhaustive inventory of Factory.

[`@factory/droid-sdk`](https://registry.npmjs.org/@factory%2fdroid-sdk/latest)
reported version 0.9.1 and root plus `/node` entrypoints. Metadata does not prove
that all current documentation applies unchanged to that exact release.

## Useful documented behavior

The [TypeScript SDK guide](https://docs.factory.ai/sdk/typescript) documents
one-shot runs, ongoing sessions, saved-session continuation and streamed results.
A session includes a working directory and conversation state. Resuming it
requires reattaching runtime handlers and tools that cannot be serialized.
The Node client starts the Droid executable or uses a daemon. This is not a
standalone app hosting or artifact storage service.

For Conexus, the useful pattern is a Builder working in an application's folder,
with explicit session identity and observable tool/results events. Conversation
continuation alone must not be treated as proof that the exact source files or
compiled application survived. These need their own durable identity and recovery.

## What to reuse and what not to assume

Apply the session and result distinctions to the existing
[first-app task](../../tasks/builder-first-app.md). Do not switch from Mastra to
Droid, install these packages, or add a second agent runtime based on this study.
Any replacement proposal needs a concrete gap in the existing Builder and a
bounded comparison using the same app request.

The public package map does not expose Factory's complete backend, hosted storage,
deployment topology or internal prompts. No claims about those are made here.
Future inspection should target a specific continuation, tool or event question,
not expand to every collaborator's unrelated packages.
