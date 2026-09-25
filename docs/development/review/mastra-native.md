# Review: Mastra native

## Scope

Every pull request. The reviewer redoes the native census for each mechanism the diff adds or
changes. Paths, as [`areas.json`](areas.json) lists them:

- `**`

A mechanism is a new table, SQL function, module, cookie, provider setting or exported helper. The
[Mastra boundary](../../reference/mastra-boundary.md) records where the Hub crossed this line before
and what it does instead.

## What to check

- [ ] The reviewer redid the census at the head's installed versions. A census the author wrote in
      the pull request body is input, not evidence. Owner: [Working rules](../delivery.md#working-rules).
- [ ] Every mechanism in the diff has a row: the native offer examined, the exact source (installed
      `.d.ts` or `dist/docs` path, and the version from `node_modules/@mastra/<pkg>/package.json`),
      and KEEP, REPLACE or SIMPLIFY. A row without a source fails.
- [ ] A KEEP names the accepted requirement the native offer fails, and the smaller configuration or
      composition it rejected. Owner: [Authority and mechanism](../engineering-method.md#authority-and-mechanism).
- [ ] Building a mechanism Mastra ships is a blocking finding. The reviewer lists what the native
      alternative would delete.
- [ ] No Conexus table, type or lifecycle mirrors a Mastra one (thread, message, session,
      credential, secret, trace, score), and no wrapper exists only to hide Mastra. Binding to a
      Mastra id is fine. Model accounts stay whole in the Factory, per C-025 in the
      [decision register](../../decisions/index.md).
- [ ] Conexus never forks, patches or reaches into Mastra internals, never writes Mastra tables and
      never replaces a method on a Mastra object. A documented subclass or option is the extension
      point. Owner: [Mastra boundary](../../reference/mastra-boundary.md).
- [ ] Secrets at rest use the Factory's `secret-encryption`, never a new cipher or key path.
- [ ] Identity that reaches Mastra code travels in the `RequestContext` reserved keys the server
      sets, never in agent or tool input.
- [ ] Keycloak only authenticates. A change to `infra/keycloak/*.json` or to realm settings states
      its effect on every client in the realm.
- [ ] A provider setting that forces compensating code (locks, claims, retries, polling) names the
      requirement it serves. Otherwise the setting and the code go.
- [ ] One model per concept: session, handoff, invitation, caller, Origin check, opaque token. A
      second variant says why the first cannot serve.
- [ ] External data is parsed once at the boundary with the validator that boundary already uses:
      the OpenAPI and JSON Schema contract through AJV on control-plane HTTP routes, `zod`
      elsewhere. The TypeScript type derives from that schema, not from a hand-written parser.
- [ ] A rule PostgreSQL enforces (CHECK, `SECURITY DEFINER` function, partial index) is not
      re-implemented in TypeScript beyond boundary parsing.
- [ ] When two fixes in one review share a premise, the premise is questioned before a third fix.

## Proof required

The census table, in the review, with one row per mechanism. The reviewer builds it this way:

1. List the mechanisms in the diff, one per line, with their files and migrations.
2. Pin the versions at the head from `package.json`, `package-lock.json` and
   `node_modules/@mastra/<pkg>/package.json`. When this page was written they were `@mastra/core`
   1.67.0, `@mastra/factory` 0.15.0, `@mastra/code-sdk` 1.7.2, `@mastra/server` 1.67.0 and
   `@mastra/fastify` 1.5.11. Read them again at the head. Note the pilot's Keycloak and
   PostgreSQL versions.
3. Look up Mastra in the order [the Mastra skill](../../../.agents/skills/mastra/SKILL.md) gives:
   embedded docs in `node_modules/@mastra/*/dist/docs`, then types in `dist/**/*.d.ts`, including
   `@mastra/core/dist/_types/@internal_*`. Use `https://mastra.ai/llms.txt` only when the package
   is not installed, and say the source is remote. Always check `core`, `server`, `fastify`,
   `factory`, `code-sdk` and `auth*`.
4. Look up Keycloak in the documentation for the pilot's version. Where behavior matters (refresh,
   logout, session, token exchange), read the source at that version's tag. If the version read is
   not the pilot's, say so and ask for a probe.
5. Look up PostgreSQL in the documentation for the version in use. For a dependency, start from
   `package.json`, and use `npm ls <pkg>` for a transitive question.
6. Search the repository for an existing model of the same concept, for example
   `git grep -nE "createHash\('sha256'\)|randomBytes\(32\)" -- apps/hub/src` and the concept's name.
7. Give each mechanism KEEP, REPLACE or SIMPLIFY, with its source and a one-sentence reason. For
   REPLACE and SIMPLIFY, say what goes, the cost and the lane.

A row looks like this:

| Mechanism | Native offer examined | Source and version | Verdict |
| --- | --- | --- | --- |
| Model error classifier in `apps/hub/src/builder/runtime.ts` | `parseError` | `node_modules/@mastra/code-sdk/dist/utils/errors.d.ts`, `@mastra/code-sdk` 1.7.2 | REPLACE: the message patterns go |

A diff with no mechanism says so in one line instead of a table.

## Traps from history

- Repositories moved to a new GitHub App installation by writing three Factory tables directly,
  instead of through the storage handle's `migrateInstallation`. Fixed by #170 (`41878ffc`). Now at
  `apps/hub/src/builder/factory-provisioning.ts:174`.
- The sandbox's repository credential came from a function assigned to a method of a live
  `GithubIntegration`. The subclass that replaced it overrode `mintInstallationToken`, which was safe
  only while one caller used it. #182 (`a30def70`) narrowed the subclass to override only
  `getRepositoryAccess`. Now at `apps/hub/src/builder/factory.ts:258`.
- The Builder chat streamed a Conexus-invented projection over a hand-written SSE route that
  dropped tool arguments, tool output and reasoning. Fixed by #118 (`732b69ce`), which mounts
  Mastra's own session routes. Now at `apps/hub/src/builder/mastra-session-routes.ts:188`.
- The Hub classified model errors with its own status checks and message patterns. Fixed by #175
  (`0b8e91f8`), which uses Mastra Code's `parseError`. One text match stays, and its comment names
  the upstream issue that would remove it. Now at `apps/hub/src/builder/runtime.ts:46-54`.

## Principles

- **Laziness Protocol.** The smallest change is the native primitive plus configuration, not a
  Conexus module.
- **Subtract Before You Add.** A REPLACE deletes the Conexus mechanism in the same pull request.
- **Migrate Callers Then Delete Legacy APIs.** Every caller moves to the native API, then the
  Conexus one goes. No adapter stays behind.
- **Type System Discipline.** Import Mastra's types. A hand-written copy of a Mastra shape fails.
- **Attack the Premise.** A second fix around the same Mastra behavior asks why Conexus owns that
  behavior at all.
- **Prove It Works.** A census row cites the installed file the reviewer read, not memory.
