# Review: Contracts

## Scope

The wire contracts: the OpenAPI documents, the routes generated from them, canonical JSON, and the
checks that bind contracts to routes and to the operation ledger. [`areas.json`](areas.json) owns the paths.

## What to check

- [ ] A contract change and its [operation ledger](../../product/operation-ledger.md) change are in
      one commit. Owner: [Git and pull requests](../delivery.md#git-and-pull-requests).
- [ ] Generated route files are regenerated, never edited. Each starts with "Do not edit", and its
      `contract-projection-check-*` leaf refuses drift.
- [ ] Every leaf path in `contracts/api/product/*-paths.yaml` is bundled into `openapi.yaml`, and
      every bundled operation comes from a leaf. `npm run wire:bijection` gates on an exact count.
- [ ] A route with an id in its path has a `params` schema with the id's format, so a malformed id
      answers 400 before any store call.
- [ ] The route's TypeScript types derive from the contract. A hand-written parser beside the
      schema fails the [Mastra native](mastra-native.md) census.
- [ ] A contract file with no gate does not exist. A surface that is not built is deleted, not
      kept for later.

## Proof required

- `wire-openapi-lint`, `wire-bijection`, `wire-bijection-gate` and the `wire-*` leaves for the
  changed surface passed at the head SHA.
- A behavior change on a route has an HTTP test that sends the request and asserts the literal
  status and body.

## Traps from history

- The bijection gate matched leaf paths to the bundle by ledger id, so a leaf whose id the ledger
  lacked skipped the check. A planted `ZZZ-99` passed silently. Fixed by #107 (`d71c410e`), which
  makes the bijection unconditional. Now at `scripts/check-wire-bijection.mjs:14-20`.
- The S1 generator emits no `params` schema, so membership routes passed malformed ids to
  PostgreSQL and answered 500. Fixed by #107 (`d71c410e`), which merges a `uuid` params schema onto
  each generated route. Now at `apps/hub/src/identity-access/membership.ts:22-29`.

## Principles

- **Type System Discipline.** The OpenAPI contract is the authoritative schema. Types derive from
  it.
- **Encode Lessons in Structure.** A contract rule belongs in a `wire-*` check, not in review prose.
- **Subtract Before You Add.** Delete an unbuilt surface rather than keep contract for it.
- **Boundary Discipline.** AJV validates the request against the contract at the route. Handlers
  trust the parsed value.
