# packages/canonical-json

Two functions: `canonicalBytes` serializes a value as RFC 8785 canonical JSON through `canonicalize` 4.0.0, and `sha256` hashes bytes to hex. The Hub's stores use them to digest idempotent requests, and the contract generators use them to digest their projections.

## Traps

- The digest is persisted, not the bytes. `iam.operation_idempotency` and the other idempotency tables keep `request_digest`, the SHA-256 of these bytes. Any change to the output changes the digest, so a retry of a request made before the deploy fails with `IDEMPOTENCY_CONFLICT`. Plan an output change with its data effect, not as a refactor.
- `src/index.d.mts` is written by hand next to `src/index.mjs`. Change both together.
- The route generators write `*_ROUTE_PROJECTION_DIGEST` into `apps/hub/src/generated/` and the web clients. An output change makes every generated file drift. Regenerate them in the same commit; see [`contracts/AGENTS.md`](../../contracts/AGENTS.md).

## Verify

```bash
npm run r1:s2:hub:typecheck
npm run r1:s2:import-law
npm run r1:s2:check
npx --no-install biome check packages/canonical-json/src
```

## Review

Review: load the pages [`areas.json`](../../docs/development/review/areas.json) maps your paths to (mostly [`data-migrations.md`](../../docs/development/review/data-migrations.md); [`contracts.md`](../../docs/development/review/contracts.md) for the generators).
