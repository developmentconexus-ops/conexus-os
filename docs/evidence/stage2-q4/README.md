# Stage 2 Q4 — Sankhya connector evidence

**Verdict:** pending. Part 1 (Q4.0 to Q4.5) is built and tested offline. Part 2 (G0 with the operator,
then Q4.6 to Q4.11) has not started, and no Sankhya request of any kind has been made.

Task: [Stage 2 Q4 — Sankhya connector qualification](../../tasks/stage2-q4-sankhya-connector-qualification.md).

## Contents

- [census.md](census.md): the Q4.0 native census, with installed versions, files and dated URLs.
- [design.md](design.md): the Q4.1 frozen design, the runner-to-Hub comparison the manager ruled on,
  and the map from P1 to P13 to tests.
- `integrations-screen.png`: the Integrações screen of Q4.2, drawn from fixture data. It shows no
  credential.

## Gate G0: read allow-list

The operator decided on 2026-09-24 that Q4 proceeds without relying on the scope of the gateway
credential. The broker is the barrier: it calls only the read services on its allow-list and refuses
any other before a request leaves the Hub. The operator watches the first real call.

| G0 item | State | Where |
| --- | --- | --- |
| The allow-list names only read services, each citing the documentation that shows it reads | Done | [census.md, "Sankhya read services admitted for G0"](census.md#sankhya-read-services-admitted-for-g0): the authentication and `CRUDServiceProvider.loadRecords`. `SANKHYA_SERVICES` in `apps/hub/src/connectors/sankhya/gateway.ts` holds `CRUDServiceProvider.loadRecords` alone. |
| A test proves the broker refuses a service outside the allow-list without any network call | Done | `tests/implementation/connector-broker.test.mjs`, "P4 (G0)": an operation asking for another service answers `SERVICE_REFUSED`, and a `write` operation answers `EFFECT_REFUSED`. In both cases the fake gateway records zero requests, the authentication included. |
| The adapter's source has no write-capable service name | Done | `tests/implementation/connector-adapter-source.test.mjs`: the service literals in `apps/hub/src/connectors/sankhya/*.ts` are exactly `CRUDServiceProvider.loadRecords`, no known write service name appears, and only the gateway file carries wire vocabulary. |
| The evidence records the decision and its date, never the credential | Done | This section. |

Until part 2, the Hub runs with no gateway destination configured
(`CONEXUS_SANKHYA_GATEWAY_ORIGIN` absent). Every call and every credential check then answers
`CONNECTOR_UNCONFIGURED` with no network, which `connector-broker.test.mjs` also proves.

### Real Sankhya calls

None. Each real call in part 2 is logged here with the service name, time and status, never a value.

## Part 1 proof

Every test below ran green on the executor's machine against a throwaway PostgreSQL and a throwaway
Applications cluster, never the pilot. CI runs the same tests at the pull request's head.

| Step | Check | Tests |
| --- | --- | --- |
| Q4.2 | A stored Connection holds only ciphertext; no Hub operation returns a credential field. A browser creates a Connection and a Grant, reloads, and finds no credential value in the page, the input values, the network responses or the Hub's log. | `connector-postgres`, `connector-routes`, `connector-integrations-browser` |
| Q4.3 | P7 and P8 against real PostgreSQL; `wire:bijection` at 31 operations. | `connector-postgres`, `connector-broker-postgres` |
| Q4.4 | A handler reads a fake order through the grant; the fake saw one fixed service with fixed fields; ten concurrent calls cause one authentication; a token is refreshed before it expires; the worker holds no credential; P3 to P6, P9 and P10. The manager's four conditions M1 to M4 (design.md section 5). | `connector-broker`, `connector-token-cache`, `connector-handler-port`, `connector-broker-postgres`, `application-runner-sandbox`, `application-invoker` |
| Q4.5 | No grant, no brief; with the grant, the operation's id and both contracts; the brief and the Skill hold no wire vocabulary, gateway origin or credential field name; an unreadable store gives a notice and the run goes on. | `connector-builder-brief`, `builder-factory-runtime` |

For M3, the socket on the host belongs to uid 1000 with mode `0600`. Inside the sandbox the handler
runs as uid 1000 and connects without any permission change.

## What public evidence may hold

The repository is public. Part 1 holds no value from Sankhya, because no request was made. The
fixture order in `tests/implementation/connector-fake-gateway.mjs` is invented, apart from the
document number 22790. From Q4.6 on, public artifacts keep only field names, types, counts, status
codes and digests. They never keep an order value or a raw response from Sankhya or a handler. The
document number 22790 is the one exception.

## Findings

1. **Resolved in part 1.** A second open Connection in one Workspace surfaced as a server error. It
   now answers 409, and the screen offers the form only when no Connection is open (`8f9ea4d1`).
2. **Resolved in review.** A create retry could not tell an identical credential from a changed one,
   so a changed credential was silently dropped, and every retry answered 201. The Connection now
   stores a keyed digest of the credential. An identical retry answers 200, a changed one 409, and
   concurrent retries converge on one row. `connector-postgres`, `connector-routes`.
3. **Resolved in review.** A malformed id in a path or body reached PostgreSQL as a `uuid` parameter
   and failed as a server error. The contract now types `connectionId` and `grantId` as uuids, in
   paths, bodies and responses, and the generated routes validate them, so a malformed one gets the
   declared 400. The shared `workspaceId` and `projectId` stay plain strings and are parsed in the
   handler, which answers 404, or 422 on create. None of these reaches the store. A create in a
   Workspace that does not exist answers 422. `connector-routes`, `connector-postgres`.
4. **Resolved in review.** A failed read of the grants aborted the Builder run. The run now goes on
   with a fixed notice in place of the brief (design.md section 9). `connector-builder-brief`,
   `builder-factory-runtime`.
5. **Resolved in review.** Disabling a Connection left the Project's grant open on it. Granting the
   replacing Connection then answered 200 with that old grant, and every call was `NOT_GRANTED`.
   Disabling a Connection now revokes its open grants in the same transaction, and a grant racing
   the disable is revoked by it. `connector-postgres` (P8 and the race test).

## Open for part 2

- The invocation timeout is 5 s and the broker deadline is 4 s. Q4.6 measures a cold call on the
  pilot before any bound changes.
- The field mapping in `sankhya/purchase-order.ts` is unverified: `NUMNOTA` with `TIPMOV = 'O'`, the
  status values, the date and decimal formats, and the reference field names. So is whether a
  refused token arrives as HTTP 401. Each lives in one file or one function.
- One authentication serves every concurrent miss under the first caller's deadline. If that caller
  times out, the others waiting on it fail too.
- The pilot needs `CONEXUS_CONNECTOR_SOCKET_DIR` for the Hub and the runner, and
  `CONEXUS_SANKHYA_GATEWAY_ORIGIN` for the Hub after G0. Both are operator configuration.
