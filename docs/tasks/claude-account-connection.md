# Claude Account connection for Builder

This task is the operator-approved continuation of the Builder operational
program. The roadmap owns the grant and status. C-020 owns the Builder runtime
boundary. The Hub owns provider authorization, credential custody, Account and
Workspace authorization, and BuilderRun admission.

## Protected result

An authenticated Conexus Account can open Settings, start the already-admitted
Anthropic OAuth flow, complete it with the provider authorization result, and
use the resulting Claude connection for new BuilderRuns. A connection can be
shared with explicitly authorized Accounts in the same Workspace. The Project
Thread remains persistent while each BuilderRun keeps its own Mastra Session,
Workspace, and credential generation snapshot.

The browser sees only safe connection metadata. Tokens never enter browser
state, cookies, prompts, Thread messages, traces, E2B, PostgreSQL, or Git.

## Authority and preserved boundaries

- C-020 remains authoritative for Project, Thread, BuilderRun, Session,
  Workspace, source, and Preview ownership.
- Keycloak remains the only human login for Conexus Accounts.
- The Anthropic OAuth exchange is a provider protocol owned by the Hub. It is
  not a second Conexus identity system and does not grant Project access.
- The existing Sankhya Connections domain is not generalized for AI provider
  credentials.
- The existing Mastra AgentController, persistent Project Thread, and native
  Session lifecycle remain in use.
- Published migrations remain immutable. The new schema is forward-only.

## Target shape

```text
ClaudeConnection
  → immutable credential generations in CredentialBackend
  → explicit Account/Workspace bindings
  → BuilderRun connection + generation snapshot
```

The logical connection owns label, owner Account, state, and current
generation. Credential bytes are stored only behind the existing encrypted
CredentialBackend coordinate `(connectionId, generation)`. A pending OAuth
transaction owns the Account/session binding, PKCE verifier, state digest,
expiry, and one-shot completion state.

The current MVP uses the existing Anthropic authorization contract from the
qualified local OAuth flow. It opens the provider authorization URL, then
accepts the provider's `code#state` result through a same-origin Hub form. The
Hub performs the authorization-code exchange server-side. No new provider
redirect URI, client, or scope is invented in this task.

The selected connection and immutable generation are admitted before dispatch
and persisted on BuilderRun. Idempotent replay returns the original snapshot.
Changing or revoking the preference affects new runs only. An admitted run
does not silently switch credentials.

## Implementation units

1. Add forward PostgreSQL state and bounded owner functions for connection,
   binding, pending authorization, preference, and BuilderRun snapshot.
2. Add the Hub Claude connection module. Reuse the current PKCE and token
   exchange contract, encrypt token sets through CredentialBackend, and return
   safe projections only.
3. Add same-origin session/CSRF routes for status, start, complete, select,
   revoke, and same-Workspace sharing. Keep provider protocol details inside
   the Hub module.
4. Resolve the selected connection at BuilderRun admission and pass only an
   opaque credential coordinate through RequestContext. Resolve the model per
   run using the installed Mastra dynamic model primitive.
5. Add the smallest Settings route and account-menu link. The UI supports
   connect, paste authorization result, select, share, and revoke states.
6. Add focused behavioral tests, negative authorization tests, restart and
   idempotency coverage, then run the real browser flow and Builder proof.

## Non-goals

No API-key fallback, generic provider framework, second secret manager,
second runtime, Mitra websocket protocol, Claude conversation store, account
password handling, arbitrary provider/model selection, or ordinary Change
pipeline is admitted here.

## Falsifiers and proof

The slice fails if a callback can be replayed or bound to another Account, a
token appears in any public response or persisted Product record, a Workspace
boundary can be forged, refresh can overwrite a newer generation, a BuilderRun
can change its credential after admission, or the Project Thread is replaced
when a Session is recreated.

Proof must cover authorization state/PKCE, provider refusal, custody, refresh
generation concurrency, same-Workspace sharing, cross-Workspace denial,
revocation, idempotency, restart, two prompts on one Thread, and distinct
BuilderRun Sessions. The browser proof must show Settings → connect → safe
status → select/share → Builder prompt and a second prompt continuing the same
Project conversation.

## Owner reconciliation and stop law

After proof, reconcile C-020, the security/authority reference, product API
contracts, generated clients, the documentation index, and the roadmap. Do
not claim provider authorization beyond the supplied Anthropic contract.

Stop before implementation if the installed OAuth contract or Mastra dynamic
model API contradicts the target shape, if the credential backend cannot
preserve immutable generations, or if the existing database role separation
cannot be maintained without changing grants or operational passwords.
