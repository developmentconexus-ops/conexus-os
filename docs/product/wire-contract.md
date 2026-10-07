# API guide

How the Hub's public API is designed. This guide adapts the
[Zalando RESTful API Guidelines](https://opensource.zalando.com/restful-api-guidelines/) (CC BY 4.0)
and follows their order. Errors follow [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457). Each rule
uses the words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and **must not** are
defects in review, **should** and **should not** need a stated reason to break, and **may** is a
free choice.

The guide states the target. Code that departs from it is listed in
[architecture section 11](../reference/architecture.md#11-risks-and-technical-debt) with the wave
that removes it. Owners next door: the contract is the census of operations, [security](../reference/security-and-authority.md) decides who may call and how the
session travels, [product](contract.md) owns the journeys, and [database](../reference/database.md)
the SQL.

## 1. Contract first

- An operation **must** be declared once, in Zod, in `OPERATIONS` of `packages/contract`: its id,
  access, method, path, params, query, body, successes and failures.
- `contracts/api/product/openapi.json` **must** be emitted from that declaration, never written by
  hand. The Hub's route types and the web client **must** derive from it.
- The contract is the census. `OPERATIONS` and the emitted `contracts/api/product/openapi.json`
  list every fixed Product operation, and no table beside them does.
- An operation **must** be named by its verb and noun in camelCase (`deleteProject`). That one string
  is its export, its `id`, its OpenAPI `operationId`, its log field, its query key and its receipt key.
  The registry key **must** equal the `id`, and a mismatch fails to compile. Every operation **must**
  carry a one-sentence `summary`, which the emitted `summary` repeats.
- Every Product operation **must** enter through one ingress. `CONTROL_PLANE` is an authenticated
  Control Plane interaction, and every current operation uses it. `SYSTEM` is an owner-internal
  transition and `APPLICATION_HOST` is a request to one application's own host (its files, its sign-in
  handoff, its sign-out, its manifest-declared operations); neither is a Product operation, and an
  application's operations belong to its own manifest. An OIDC callback, a provider token refresh, a
  model provider call, an E2B call, Git transport and static byte transport are mechanics, not
  operations. The first installation administrator is the configured subject's first sign in; every
  later one is `addInstallationAdministrator`.
- An operation **must** have a real consumer. These stay rejected: `execute(anySlug, anyInput)`,
  `execute(anySql)`, `execute(anyProviderOperation)`, a caller-selected connection, a
  caller-selected target URL, `GetBlob(storageKey)` and `UploadAnyFile`. The wire gate refuses a
  Product path containing `{operationSlug}` or a segment `execute`. A screen, a button, a persona or
  an internal function does not create an operation, and internal dispatch by identifier is
  mechanism, not authority.
- A surface that is not built **must not** have a contract.
- The live stream of a Builder run is technical ingress, declared apart in
  `contracts/api/technical/openapi.yaml`. A Mastra id **must not** be a product identity, and the
  end of a stream **must not** be read as the run's result. The Hub's settlement is.

**Why.** One declaration gives the Hub, the web app and the documentation the same shape, so a
change that breaks a caller fails to compile instead of failing in production.

**Right.** A new operation is one entry in `OPERATIONS`, and `npm run generate` updates the client.

**Wrong.** A route parses its body with a hand-written check beside the schema.

## 2. URLs

- Every path **must** live under `/api/control/...` or `/api/session`. A path namespace grants
  nothing.
- A path **must** name resources with plural nouns and ids, for example
  `/api/control/projects/{projectId}/conversations`.
- A path **must not** select an arbitrary operation, such as a `{operationSlug}` variable or an
  `execute` segment.

**Why.** A path that names the resource tells the reader and the access rule what is touched. A
path that names an operation turns the API into a remote procedure call that no rule can read.

**Right.** `POST /api/control/workspaces/{workspaceId}/projects`.

**Wrong.** `POST /api/control/execute/{operationSlug}`.

## 3. Requests and methods

- A request **must** be parsed once, at its route, against the contract schema. The handler trusts
  the parsed value.
- A path id **must** have a params schema with the id's format. A malformed id **must** answer the
  operation's `malformed` row before any store call. Malformed and undisclosed Workspace/Project
  subjects use the shared `SUBJECT_NOT_FOUND` mapping exported by the contract.
- `GET` and `HEAD` **must not** change state.
- A `POST` that creates something **must** take an `Idempotency-Key`.

**Why.** A safe method that changes state breaks caches, retries and prefetching. A create without
a key creates a duplicate when the network retries.

**Right.** `GET /api/control/projects/{projectId}` reads, and a retried create with the same key
returns the first result.

**Wrong.** A `GET` that marks a notification as read.

## 4. Payload and names

- Bodies **must** be JSON objects, never a top-level array.
- Field names **must** be `camelCase`. Reusable schemas **must** have stable `PascalCase` names from
  the domain. A wire name **must not** be a table name, a component name or a provider's name.
- Dates and times **must** be RFC 3339 strings in UTC (`z.iso.datetime()`).
- A schema **must not** be a generic carrier such as `AnyResource`, `GenericResult` or
  `ProviderPayload`.
- An unknown or partial value **must** be a state in the schema, never a `null` or a zero.
- Bytes **must** be reached through their owning operation. A storage key, object path or signed URL
  **must not** authorize by possession.

**Why.** A top-level object can gain a field without breaking callers. Domain names keep the API
readable when the tables or the screens change.

**Right.** `{ "usage": { "kind": "UNAVAILABLE" } }`.

**Wrong.** `{ "usage": 0 }` when the provider reported nothing.

## 5. Status codes and errors

- A failure **must** answer `application/problem+json` with `type`, `title`, `status` and `code`,
  plus `traceId` for a Conexus fault. It **must not** carry a stack trace or a `detail` a client
  parses.
- `code` **must** come from `contracts/technical/failures.json`, with the status its row names.
- The application runner's handled prepare and invoke answers **must** use its validated private
  `Result` over the existing owner channel, with HTTP 200 JSON. Only a public HTTP boundary projects
  a table code and validated trace into a Problem; private repair facts **must not** establish
  authority.
- A subject the caller may not know about **must** answer 404, never a 403 that confirms it exists.
- A success **must** answer 200 with a body, 201 for a create, or 204 with no body.

| Status | Meaning |
| --- | --- |
| 400 | A malformed request |
| 401 | Not authenticated |
| 403 | Authenticated, the subject may be disclosed, and the action is refused |
| 404 | Absent, or not disclosable to this caller |
| 409 | A conflict with current state, uniqueness or a single flight |
| 412 | A stale `If-Match` |
| 413, 415, 429 | Too large, the wrong media type, or a limit reached |
| 422 | A valid request whose business input the owner refuses |
| 500 | An unexpected failure, recorded |
| 502, 503, 504 | An upstream failed, a dependency is unavailable, or an upstream timed out |

**Why.** One code per failure lets the web app show the person the right text and lets the
developer find the log line. A parsed `detail` turns prose into a contract nobody declared.

**Right.** `{ "type": "urn:conexus:problem:IDEMPOTENCY_CONFLICT", "title": "IDEMPOTENCY_CONFLICT",
"status": 409, "code": "IDEMPOTENCY_CONFLICT" }`.

**Wrong.** A client that branches on `detail.includes('already exists')`.

## 6. Headers

- `Idempotency-Key` **must** be scoped to the exact operation and subject. A reuse with a different
  payload **must** answer `IDEMPOTENCY_CONFLICT`. A duplicate **must not** create a second effect,
  and an ambiguous downstream effect **must not** be replayed blindly.
- A command that needs current state **must** carry the expected revision in its payload, or take
  `If-Match` with the target's `ETag` and answer a stale one with 412.
- A cacheable read **should** send `ETag` and `Cache-Control`, as the Project thumbnail does.

**Why.** Retries happen on every network. The key makes a retry safe, and the revision makes a
stale write visible instead of silent.

**Right.** A second `POST` with the same key and body returns the first Project.

**Wrong.** A second `POST` with the same key and another body creates a second Project.

## 7. Lists and pagination

- A list that can grow **must** return an opaque continuation token, and the server **must** control
  the page size. The token **must not** be authorization, a source identity or a snapshot.
- A list **must** expose only the filters its operation declares. There is no global filter, sort
  or include language.

**Why.** An unbounded list grows with the company's data until a request times out.

**Right.** `GET .../conversations?pageToken=...` returns `{ items, nextPageToken }`.

**Wrong.** A list that returns every row and a client that slices it.

## 8. Compatibility

- The API **must not** carry a version in its path or headers. The Hub and the web app ship from
  one repository, and a change **must** update both in the same pull request.
- A removed field or operation **must** leave the contract, the Hub and the client together. There
  is no deprecation period.

**Why.** One deploy carries both sides, so a version or a deprecation window only keeps dead code.

**Right.** A renamed field changes in the contract, and the compiler finds every caller.

**Wrong.** `/api/v2/projects` beside `/api/v1/projects`.

## 9. Generated apps

- A generated app **must** declare one literal path per operation in `conexus/manifest.json`, with
  closed input and output schemas (`additionalProperties: false`).
- It **must** call its server only through the client generated from that manifest.

**Why.** A closed schema lets the Hub check every call an app makes, the same way it checks its
own.

**Right.** `"path": "/orders/pending"` with an object schema that lists its fields.

**Wrong.** `"path": "/{anything}"` with an open schema.
