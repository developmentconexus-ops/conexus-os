# Claude Account connection for Builder

This task owns the bounded connection work and its correction contract.
[The roadmap](../roadmap.md) owns status and permission to execute.
[C-020](../reference/builder-c020-mastra-native.md) owns the Builder runtime.

> Execution supersession, 2026-09-17: the operator approved the interactive Builder
> and its local account-login experience. The current execution contract is
> [builder-interactive-delivery.md](builder-interactive-delivery.md). The findings
> below remain evidence. Its former pauses, proposals, and narrow file envelope
> are not an independent current grant. Preserve provider-risk disclosures and
> unresolved proof limits; do not reinterpret them as Product acceptance.

## Protected result and boundaries

A Conexus Account connects its Claude account through provider sign-in and
uses that connection in the Builder. Keycloak remains the human login for
Conexus. Connecting Claude never grants Project access.

Preserve the Mastra AgentController, Project Thread, per-BuilderRun Session,
Workspace, source, compiler, Registry, and last-good Preview boundaries.
Do not replace the coding runtime to solve a credential problem.

Keep credential bytes behind the existing encrypted CredentialBackend.
The browser receives safe metadata and the temporary provider authorization
result, never access or refresh tokens. Tokens stay out of cookies, prompts,
Thread messages, traces, E2B, PostgreSQL, and Git. Do not generalize Sankhya
Connections or introduce another secret manager.

Same-Workspace sharing remains a requested capability. Internal permission to
share a connection does not establish provider permission to share its usage.
Neither a login demo nor an offline test establishes that permission.

## Evidence that reopens this candidate

Reviewed Product candidate: `f9fbb655463aa24da1c3e902c20d555487ce9629`.
The following paths refer to that candidate, not to a later implementation.

| Evidence | Finding and limit |
| --- | --- |
| `apps/hub/migrations/041_builder_claude_connections.sql`, `revoke_connection` | Only the first UPDATE checks ownership. Preference deletion and binding revocation still run when ownership does not match. This is a source-confirmed authorization defect. It was not executed against PostgreSQL in the planner environment. |
| `apps/hub/src/project/anthropic-oauth.ts` | Start generates independent state and verifier values. Exchange sends the verifier as state. An offline call through start, parse, and exchange confirms the mismatch, not a live provider rejection. |
| `apps/hub/src/project/oauth-token-store.ts` | One store coalesces refresh calls. Two stores sharing a connection issue two refresh calls. With a simulated single-use refresh token, one caller succeeds and one fails. |
| The same token store | A store admitted with generation 1 can read generation 2 for the same connection. The input snapshot remains unchanged. A revoked connection supplies an unexpired token but rejects renewal of an expired token. These observations require an explicit lifecycle contract. |
| The authorization table and `apps/hub/src/claude-account/store.ts` | Pending authorization is bound to Account and state digest, but does not record a Conexus session identifier. The earlier task promised Account and session binding. |

The planner's offline probes used Node 22.16.0 and no external credentials.
The two complete source copies matched Git blobs
`ede3eb488c6bfa1d692f5c3b1f22237c337ff275` and
`c2c6d25aad47eced23de25fb4e03ed4787688c40` before type stripping.
A state-continuity assertion failed on the original module and passed on an
isolated proposal that passes validated state into exchange. The real Hub
caller was not patched. These probes do not constitute pinned repository
verification, PostgreSQL proof, live integration, or independent acceptance.

## Provider and native reuse decision

The [Mastra Code documentation](https://code.mastra.ai/) describes provider
login while retaining a Mastra coding agent. That is a technical precedent,
not evidence that Conexus executes the Claude Code binary.

First-party source inspected at
[`a473b4b3b2bacee48bf20739ceb8509641c6fb35`](https://github.com/mastra-ai/mastra/tree/a473b4b3b2bacee48bf20739ceb8509641c6fb35):

- [`auth/providers/anthropic.ts`](https://github.com/mastra-ai/mastra/blob/a473b4b3b2bacee48bf20739ceb8509641c6fb35/mastracode/sdk/src/auth/providers/anthropic.ts) separates `startAnthropicLogin`, `completeAnthropicLogin`, and refresh. Its start and exchange both use the verifier as state. Its scopes include `org:create_api_key`, which the Conexus candidate does not request.
- [`auth/types.ts`](https://github.com/mastra-ai/mastra/blob/a473b4b3b2bacee48bf20739ceb8509641c6fb35/mastracode/sdk/src/auth/types.ts) exposes an injectable `CredentialStore`. Implementations own refresh serialization.
- [`providers/claude-max.ts`](https://github.com/mastra-ai/mastra/blob/a473b4b3b2bacee48bf20739ceb8509641c6fb35/mastracode/sdk/src/providers/claude-max.ts) accepts that store in its OAuth fetch. Its model helper uses an API-key test path when `NODE_ENV` is `test` or `VITEST` is set. A green test through that path does not prove OAuth transport.

`package.json` declares `@mastra/core` 1.63.2 and `@ai-sdk/anthropic` 4.0.48.
It does not directly declare `@mastra/code-sdk`. The inspected upstream commit
is research evidence, not an installed or qualified Conexus dependency.

Before adopting native code, verify exact published exports, dependency cost,
version compatibility, caller isolation, and the real OAuth execution path.
Preserve Conexus egress limits, redirect denial, safe errors, and custody.
Do not copy extra scopes, introduce global account selection, or bypass guards
to make an upstream helper fit. Reuse must reduce total complexity.

The [Anthropic authentication conditions](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use), checked on 2026-09-17,
restrict third-party collection and intermediation of Claude account tokens.
The same page describes conditional hosting of the unmodified Claude Code
binary with each end user authenticating independently. Those conditions do
not establish authorization for this Hub-owned Mastra transport or sharing.

Keep the requested account-login experience. Do not silently switch to an API
key, Claude Agent SDK, or Claude Code CLI. Before live connection or sharing
proof, establish an applicable supported arrangement for the selected design.
A successful provider response proves compatibility, not that arrangement.
Any runtime replacement returns to C-020 planning and is outside this task's
bounded correction work.

## Bounded corrections with a fixed target

### Protect the complete revoke operation

Only the owner may revoke a connection and remove its dependent preferences
and bindings. An unauthorized or unknown connection request returns false
with no changes in any of the three tables.

Serialize the ownership check and mutation on the connection row. Return a
result determined by the authorized operation, not by the last unrelated SQL
statement's FOUND value. A repeated owner request converges to the revoked
state. A non-owner request never performs cleanup, even for a revoked row.

Use a new forward migration. Preserve published migration 041, function
signatures, role separation, and existing operational passwords. Test both
the function through the deployed database role and the authenticated route.
Cover owner, shared non-owner, unrelated Account, unknown connection,
repetition, and concurrent share/revoke. Repeated cleanup must not conceal an
unauthorized side effect or a concurrent active binding on a revoked row.

### Preserve one authorization transaction across its steps

Keep the independent state and verifier used by the current start operation.
Pass the validated transaction state to exchange as state. Pass the stored
PKCE verifier only as code_verifier. Do not change the provider client,
redirect URI, or scopes. Do not weaken validation to match a mock.

Test start, callback parse, and exchange together. Assert that exchange state
matches the authorization URL and that the verifier matches its challenge.
Reject wrong, expired, replayed, and other-Account results before exchange.
The complete route must use the stored Account-bound transaction, not a
client-supplied expected state. Tokens and verifier must not enter diagnostics.

## Lifecycle decisions still requiring design closure

The following target is a planning proposal, not permission to change durable
meaning or implement an unreviewed refresh coordinator.

| Question | Proposed target and required check |
| --- | --- |
| Connection identity versus token generation | Pin the logical connection on BuilderRun. Retain the admission generation for audit and idempotency. A refresh may advance secret storage for that same connection without rewriting the admitted snapshot or consulting a new preference. Reconcile the prior generation-freeze wording before implementation. |
| Preference change versus connection revocation | Preference selection affects future runs. Recommend that completed disconnect deny subsequent credential acquisitions, while already-acquired requests may finish. This differs from changing preference and requires explicit owner closure before implementation. Do not let token expiry choose the policy. No promise can guarantee use after provider-side revocation. |
| Concurrent refresh | All consumers of one connection share the serialization boundary before calling the provider. A per-model promise and a compare-and-swap after the external call are insufficient. Verify the supported process topology before choosing the existing native, process, or database mechanism. Do not add a new service. |
| Refresh interruption | Bound attempts and waits. Test interruption after provider rotation and after secret publication but before metadata advancement. Immutable storage must not leave an endless conflict loop. Do not blindly retry an external exchange whose result is unknown. |
| Pending authorization session | Expose the existing IAM session identity only as needed to bind start and completion. Do not create another session system. Reject a second session for the same Account if the promised session binding is retained. Reconcile the owner explicitly if Account-only binding is selected instead. |

## Code envelope and verification

Keep `apps/hub/src/builder/module.ts`, the shared AgentController, existing
CredentialBackend, Keycloak, and the Project conversation model.
The bounded correction envelope is a forward migration,
`apps/hub/src/project/anthropic-oauth.ts`, its exchange call in
`apps/hub/src/claude-account/store.ts`, and focused connection tests.
Change route wiring only where a correction requires it. No visual redesign.

Resolve the lifecycle table before editing refresh behavior in
`apps/hub/src/project/oauth-token-store.ts` or
`apps/hub/src/claude-account/module.ts`. Consolidate duplicated token-response
handling only within the selected transport. Delete old paths only after
checking their current callers. No generic provider framework or new runtime.

Use the repository's pinned WSL environment and disposable PostgreSQL.
Run focused behavioral tests, then the applicable `npm run verify` graph.
A source-pattern test or an assertion matching a mocked request is not enough.
The offline correction pass must not contact Anthropic, E2B, or Sankhya and
must not load real tokens or reconcile operational database passwords.

After the provider arrangement and lifecycle are closed, the final proof is
Settings sign-in, safe connection status, selection, a Builder prompt, and a
second prompt on the same Project Thread with distinct BuilderRun Sessions.
Then prove authorized sharing, denial across Accounts and Workspaces,
revocation, restart, idempotency, refresh concurrency, and last-good Preview.
Record blocked paths without relabeling them as successful or removing them.

Before acceptance, reconcile the smallest security and C-020 owners, Product
API contracts, generated clients, and roadmap. Apply risk-triggered independent
review. The planner's probes and self-review do not replace that review.
Stop at any unresolved lifecycle decision, unsupported provider arrangement,
new trust boundary, required role-grant change, or unowned local state.
Do not merge or start the next program increment.
