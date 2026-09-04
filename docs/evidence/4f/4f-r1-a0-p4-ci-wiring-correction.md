# 4F(R1) — A0-P4 objective-CI wiring correction

## Finding

The first independently green A0-P4 candidate implemented strict web
typechecking, Biome and an AST import law with firing RED controls, but the
required GitHub workflow still ran only `npm ci` and `npm run verify`.
Consequently, a later architecture regression could leave required CI green.
This was an objective enforcement defect, not a Product-semantic change.

The pre-correction `.github/workflows/verify.yml` SHA-256 was
`9a1ba5c883355df909bfbd8caaf9f2b0722656c92c1bcf16dd5616bb33eaa7ce`.

## Authority adjudication

The autonomous charter authorizes correction inside A0 and autonomous
adjudication of non-Product implementation ambiguities. Its engineering law
requires a required CI check to protect an objective property, and its stop law
does not require operator intervention when the contradiction is resolvable
without new Product meaning, trust authority or production effect.

The frozen migration plan, validation and A0-P1..P3 receipts were not rewritten.
Their stable digests remain:

- plan: `7115405d511276b19fc67ace77cab41752a883e88e8a56efde67dcc885dd1fe5`;
- validation: `0f39ebbaa699af5c39a12d924269318ed740a78b63f6c6a5e65072b2225a5e4a`.

The Repository Method owns CI. The workflow mutation is protected by a machine
content law in `tests/repository/import-law.test.mjs`, which is an exact
`PLATFORM-CONTRACT` path whose A0-P4 mutation window is open. That test asserts
the unique ordered presence of every objective CI command and includes a RED
falsifier with the import-law step removed. The P4 part receipt therefore binds
the test that binds the workflow. The A0-P5 ownership manifest and final receipt
must additionally bind this Evidence path and the workflow path with their final
digests.

## Exact correction

After `npm ci`, the required workflow executes, in this order:

```text
node --test --test-concurrency=1 tests/repository/import-law.test.mjs
npx --no-install biome check apps/hub/src apps/web/src packages/canonical-json/src packages/profile-compiler/src scripts/check-import-law.mjs tests/repository/import-law.test.mjs
npm run r1:a0:web:typecheck
npm run verify
```

The post-correction `.github/workflows/verify.yml` SHA-256 is
`a02905914909d676c90e253ad22fd74274ca40a4fb4f1b8cf2491f04fe5f6fae`.

No dependency, `package.json`, Product contract, Product operation, owner,
permission, schema, table or runtime behavior changed.

## Reproduced proof

The final bytes were reproduced in a fresh ephemeral Linux workspace using the
admitted Node `24.20.0` / npm `12.0.2` runtime. `npm ci` installed 191 packages,
audited 192 packages with zero vulnerabilities, and the exact workflow sequence
then exited zero:

- the import-law and wiring suite passed 24 of 24 tests;
- Biome checked 20 files with zero errors and five pre-existing warnings in
  closed web files;
- strict web typechecking passed;
- the complete required repository verification passed.

The A0 migration custody proof was the post-validation in-flight command
`node scripts/check-r1-a0-migration.mjs --in-flight --part A0-P4`. It passed
with the frozen plan and validation digests, 76 scoped paths and two admitted
transitions. The bootstrap test is intentionally a pre-validation baseline
proof and was not misrepresented as a post-migration proof.

The canonical proof-protocol bindings are:

- `A0:BIOME`
  `db66ede9ea295ef9387c19bacb91dd42700f8d9e70874b7b322a1345c7722e88` —
  `npx --no-install biome check apps/hub/src apps/web/src packages/canonical-json/src packages/profile-compiler/src scripts/check-import-law.mjs tests/repository/import-law.test.mjs`, expected 20 checked, zero errors and five warnings;
- `A0:IMPORT-LAW`
  `163b8c585e8de19dd560813149df9d47dfaf9b97f599fe131d996fcce7a063c5` —
  `node --test --test-concurrency=1 tests/repository/import-law.test.mjs`,
  expected 24 pass and zero fail;
- `A0:WEB-TYPECHECK`
  `162ee120bbabd4a579f63cd7c92269f0736f23d4753f0d57693b1e226ec54089`;
- `REPOSITORY:VERIFY`
  `5cacf4937f9928aeee844da1dc2076302018c655e480ed79a18bf80af44c573c` —
  `npm run verify`, expected exit zero.

All protocol runtime bindings are Linux x64, Node `24.20.0` and npm `12.0.2`.

## Independent convergence

- Claude Code `2.1.220`, Fable session
  `b3021101-ca57-49c2-b4da-aeaa7d691e99` found the missing CI protection,
  verified all seven initial checker findings closed and derived the
  workflow-plus-open-window-test custody route.
- AGY `1.1.22`, Gemini Pro conversation
  `148b9f4d-148b-4c98-aa32-be6af3c76fd5` first proposed reopening the frozen
  plan, then rejected that route after the current validators' falsifiers were
  presented and returned `THIRD_ROUTE: ACCEPT`, `FALSIFIER: NONE`,
  `HISTORY_TRUTHFUL: YES`, `CI_OBJECTIVE_PROTECTED: YES` and
  `P4_AUTHORIZATION: AUTHORIZED`.

## Residual and stop conditions

- Removing or reordering any required workflow command must fail the frozen
  wiring law.
- Changing either workflow semantics or its digest after A0 closure requires
  the smallest future Repository/A0 ownership reopen; it may not be patched
  around.
- Push and PR are blocked, so this run proves workflow content and every command
  locally in the exact admitted runtime; it does not claim a remote PR run.
- Product implementation and S2 remain blocked.
