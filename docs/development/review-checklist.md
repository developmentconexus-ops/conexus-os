# Review checklist

Check a Conexus OS pull request against these rules. The Factory reads this file from the base ref.
Request changes only for a failed rule or a correctness defect, never for preference. Each rule
comes from [the delivery rules](delivery.md) or the owner it links.

## Scope and lane

- [ ] The pull request links its issue and says what changes, for whom.
- [ ] The lane label matches the change. A `lane:fast` change has no Q trigger, fits one pull
      request, and stays inside accepted product meaning.
- [ ] `needs:aprovo` is present if the change migrates real data, touches security or
      authentication, or changes a screen the operator asked to see.
- [ ] The diff does only what the issue asks. Unrelated changes are in their own pull request.

## Authority and design

- [ ] No product meaning is invented in code. A new requirement, owner or trust boundary goes to
      its owning document or decision first.
- [ ] Each meaning has one owner. The change adds no second source of truth.
- [ ] A new dependency comes with the evidence the technology rule asks for.

## Mastra first, no parallel logic

Every pull request that adds a mechanism states a native census: what Mastra, Keycloak, PostgreSQL
and the installed dependencies already provide, with source and version. A mechanism is a new
table, SQL function, module, cookie, provider setting or exported helper. Use
[`.agents/skills/mastra/SKILL.md`](../../.agents/skills/mastra/SKILL.md) to find the Mastra offer.

- [ ] The pull request body has a "Native census" table: each mechanism added, the native offer
      examined, the exact source (installed `.d.ts` path and version, a versioned doc URL, or a
      source file at a tag), and KEEP, REPLACE or SIMPLIFY. A claim without a source does not count.
- [ ] Each Conexus-owned mechanism names the accepted requirement the native offer fails, and the
      smaller configuration or composition it rejected, per
      [Authority and mechanism](engineering-method.md#authority-and-mechanism).
- [ ] No Conexus table, type or lifecycle mirrors a Mastra one (thread, message, session,
      credential, secret, trace, score), and no wrapper exists only to hide Mastra. Binding to a
      Mastra id is fine.
- [ ] Secrets at rest use the Factory's `secret-encryption`, never a new cipher or key path.
- [ ] Identity that reaches Mastra code travels in the `RequestContext` reserved keys the server
      sets, never in agent or tool input.
- [ ] Keycloak only authenticates. A change to `infra/keycloak/*.json` or to realm settings states
      its effect on every client in the realm.
- [ ] A provider setting that forces compensating code (locks, claims, retries, polling) names the
      requirement it serves. Otherwise the setting and the code go.
- [ ] One model per concept: session, handoff, invitation, caller, Origin check, opaque token. A
      second variant says why the first cannot serve.
- [ ] External data is parsed once at the boundary with `zod`, and the TypeScript type derives from
      that schema.
- [ ] A rule PostgreSQL enforces (CHECK, `SECURITY DEFINER` function, partial index) is not
      re-implemented in TypeScript beyond boundary parsing.
- [ ] When two fixes in one review share a premise, the premise is questioned before a third fix.
- [ ] If a native alternative meets the accepted requirement, the custom mechanism is a failed
      rule, not a preference. The reviewer lists what the alternative would delete.

To check this section:

1. List the mechanisms in the diff, one per line, with their files and migrations.
2. Pin the versions from `package.json` and `package-lock.json` at the head. In a worktree with
   `node_modules`, read `node_modules/@mastra/<pkg>/package.json`. Note the pilot's Keycloak and
   PostgreSQL versions.
3. Look up Mastra in the order the Mastra skill gives: embedded docs in
   `node_modules/@mastra/*/dist/docs`, then types in `dist/**/*.d.ts`, including
   `@mastra/core/dist/_types/@internal_*`. Use `https://mastra.ai/llms.txt` only when the package is
   not installed, and say the source is remote. Always check `core`, `server`, `fastify`,
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
8. Record the table in the pull request's "Native census" section or in the review comment.

## Data, contracts and security

- [ ] A migration is a new, next-numbered file. No applied migration or the baseline is edited by
      hand, and the catalog snapshot is regenerated with `npm run db:catalog:snapshot`.
- [ ] A contract change and its operation-ledger change are in the same commit.
- [ ] No secret, token or credential appears in code, fixtures, logs or the pull request body.
- [ ] Generated application code does not run in the Hub process.

## Tests and proof

- [ ] Each new or changed test calls the code as its users do and asserts a literal expected value.
- [ ] No design was reshaped to keep a test passing. Tests whose subject is gone are deleted.
- [ ] Each claim about a real provider, model, E2B, Sankhya, browser or database has evidence from
      that dependency, not from a mock.
- [ ] CI `verify` is green on the exact head SHA.

## Documents

- [ ] Status and next actions live in the roadmap and GitHub, not in `AGENTS.md` or a skill.
- [ ] A rule has one home. Other files link to it instead of copying it.
