# Wire contract

The rules for the Hub's public boundary: where an operation is declared, how a request is parsed,
how errors, preconditions and retries look on the wire. Owners next door: the
[operation ledger](operation-ledger.md) holds the census, [security](../reference/security-and-authority.md)
decides who may call and how a request proves where it comes from, [product](contract.md) owns the
journeys, [database](../reference/database.md) the SQL. Exact shapes live in `packages/contract`.

## One declaration per operation

- An operation is declared once: in Zod in `OPERATIONS` of `packages/contract` (its id, access kind,
  method, path, params, query, body, successes and failures), or, until it is ported, in the YAML
  leaf files of `contracts/api/product/`. A new operation is declared in Zod.
  `contracts/api/product/openapi.json` is emitted from the union; `npm run contract:check` refuses a
  stale file or an operation declared in both.
- Every operation has one ledger row, and a contract change and its ledger row ship together.
  `npm run wire:bijection` counts both ways and fails when they disagree.
- The Hub's route types and the web client derive from the contract. Generated files are never
  edited: `npm run generate` followed by the clean tree check. A hand-written parser beside the
  schema is a defect. Review.
- No path selects an arbitrary operation: a `{operationSlug}` variable or an `execute` segment fails
  `npm run wire:bijection`. Every current operation lives under `/api/control/...` or `/api/session`;
  a path namespace grants nothing. Review.
- A surface that is not built has no contract; it is deleted, not kept for later. Review.
- The technical ingress (`contracts/api/technical/openapi.yaml`) is separate and never counts in the
  Product census. Live observation of a Builder run is technical ingress: a Mastra id is never a
  Product identity, and the end of a stream is never the run's terminal truth; the Hub's settlement
  is. `wire:bijection` reads only the Product contract; `npm run wire:technical-lint` lints the
  technical document; the rest is review.
- A generated application declares one literal path per operation with exact input and output
  schemas; `{}` and boolean schemas are refused. Enforced by the Hub's application check.

## Parsing

A request is parsed once at its route against the contract schema, and the handler trusts the parsed
value. A route with an id in its path has a params schema with the id's format, so a malformed id
fails before any store call. In a Zod operation it answers its `malformed` row (a 404 for a Project
or Workspace id), which the contract type requires for every path id; a route not yet ported
answers `REQUEST_VALIDATION_FAILED` (400). Safe methods never change state. Enforced by the route tests and
review.

## Names and values

Reusable schemas have stable PascalCase semantic names. A wire name is not a table name, a component
name or a provider's DTO name. No generic carriers (`AnyResource`, `GenericResult`,
`ProviderPayload`) without a proven repeated meaning. Money never rides on binary floating point,
and a response with money names one ISO 4217 `currencyCode`. Unknown is not zero, partial is not
complete, and stale is not current: uncertainty is a state, never a nullable or zero business
number. Review.

## Errors

A failure answers RFC 9457 Problem Details as `application/problem+json`. Its code comes from
`failures.json` with the status that row names; `detail` is for people and is never parsed.

| Status | Meaning |
| --- | --- |
| 400 | a malformed request |
| 401 | not authenticated |
| 403 | authenticated, the subject may be disclosed, and the action or the request's authenticity is refused |
| 404 | absent, or not disclosable to this caller |
| 409 | conflicts with current state, uniqueness or a single flight |
| 413, 415, 429 | too large, wrong media type, a bound reached |
| 422 | a valid request with business input the owner refuses |
| 500 | an unexpected system failure, recorded |
| 502, 504 | an upstream failed or timed out |
| 503 | a required dependency is unavailable |

A subject the caller may not know about answers 404, never a 403 that confirms it exists.
`scripts/generate-failures.mjs` keeps every row's status in 400-599 (500 by default); which row
gets which status is review.

## Preconditions and retries

- No operation takes `If-Match` today. A command that needs current state carries the expected
  revision in its own payload. An operation that later takes `If-Match` carries the ETag of the
  target it mutates, answers a stale one with 412 and adds that row to `failures.json`. Review.
- `Idempotency-Key` is scoped to the exact operation and subject. Reusing it with a different payload
  is refused; a duplicate never creates a second effect; an ambiguous downstream effect stays fenced
  and the key never authorizes a blind replay. A Project or Workspace receipt lives while its entity
  lives. Enforced by the idempotency tests and review.

## Session carriage

The session travels in the opaque cookie `__Host-conexus_session` (Secure, HttpOnly, Path `/`, no
Domain, SameSite Lax), declared in OpenAPI only as a security scheme. Possession of the cookie is
authentication, never authorization; Keycloak tokens, roles and groups are never accepted as Product
authorization. There is no credentialed cross-origin Product API. Review.

## Lists and bytes

There is no global filter, sort or include language: each operation exposes its accepted filters.
A list that can grow returns an opaque continuation token, which is not authorization, source
identity or a snapshot, and the server controls the page size. Bytes are reached through their
owning operation; a storage key, object path or signed URL never authorizes by possession. Review.
