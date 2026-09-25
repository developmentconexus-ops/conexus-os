# Review: Platform

## Scope

The rest of the Hub (server, HTTP, platform helpers, the application runner, application hosting,
registry, projects, workspaces), shared packages, repository scripts, CI and root configuration.
Paths, as [`areas.json`](areas.json) lists them:

- `apps/hub/src/server.ts`
- `apps/hub/src/http/**`
- `apps/hub/src/platform/**`
- `apps/hub/src/app-runner/**`
- `apps/hub/src/mar/**`
- `apps/hub/src/registry/**`
- `apps/hub/src/project/**`
- `apps/hub/src/workspace/**`
- `apps/hub/tsconfig.json`
- `packages/canonical-json/**`
- `scripts/build-hub-local.mjs`
- `scripts/check-agent-context.mjs`
- `scripts/check-current-state.mjs`
- `scripts/check-import-law.mjs`
- `scripts/check-review-areas.mjs`
- `scripts/check-web-style.mjs`
- `scripts/conexus-preflight.mjs`
- `scripts/conexus-verify.mjs`
- `scripts/labels.mjs`
- `.github/workflows/**`
- `package.json`
- `package-lock.json`
- `biome.json`
- `tsconfig.base.json`
- `.nvmrc`

## What to check

- [ ] The import law holds. Platform code does not import an application layer, and the
      composition root's allowlist names every platform module `server.ts` imports.
      `tests/repository/import-law.test.mjs` enforces it.
- [ ] Generated application code never runs in the Hub process.
- [ ] Verification stays a flat graph of leaf checks in `scripts/conexus-verify.mjs`, and each leaf
      runs once. A new test file is run by a leaf. A test file no leaf runs protects nothing. Owner:
      [Proof and verification](../delivery.md#proof-and-verification).
- [ ] A leaf that drives a real browser is tagged `browser`, and the path list in
      `.github/workflows/verify.yml` that decides whether browser suites run covers every path the
      leaf depends on.
- [ ] A change to workflow events or concurrency shows that the required `verify` check and trigger
      coverage stay equivalent.
- [ ] Expected output is regenerated only with the explicit generation command, never by hand to
      hide drift.
- [ ] A new dependency meets the [technology rule](../delivery.md#technology-rule).
- [ ] A sandbox or runner change states which layer blocks each escape, and a test shows the escape
      refused with the other layers off.

## Proof required

- `verify` ran at the exact head SHA and every leaf the change touches passed without skips. A
  skipped PostgreSQL or browser leaf is a failed item. When no run exists at the head, GitHub
  skipped the workflow because the pull request conflicts with its base.
- A security claim about the runner or the sandbox runs each escape with the other layers off, and
  on the real configuration and paths. A check that cannot fail is not a proof.
- A change to `scripts/conexus-verify.mjs` updates `tests/repository/conexus-verify.test.mjs`, and
  that test passed.

## Traps from history

- Platform modules imported a projection under `apps/hub/src/generated/`, and `server.ts` imported
  a platform module missing from the allowlist, so the import law failed on trunk. Fixed by #100
  (`6ac6db76`), which moved the projection into the platform layer. Now at
  `scripts/check-import-law.mjs:249`.
- #169 skipped browser leaves for pull requests that did not touch web paths, but the
  `c020-compiler-runtime` leaf drove a real Chromium without the `browser` tag. Every Builder-only
  pull request then failed Verify on a timeout. Fixed by #177 (`aa67e19e`), which tags the leaf and
  widens the path list. Now at `scripts/conexus-verify.mjs:83` and `.github/workflows/verify.yml:54`.
- The runner sandbox tests ran with Node's permission layer on, so they could not show what the
  bubblewrap namespaces alone allowed, and their network check against `127.0.0.1:5432` could not
  fail. Review rounds of #196 (`b90c54f7`) added a `nodePermission` switch, a network test that
  fails when `--unshare-net` is removed, and a probe on the pilot's real paths. Now at
  `apps/hub/src/app-runner/sandbox.ts:11-24`.

## Principles

- **Encode Lessons in Structure.** A rule a script can check becomes a leaf, not a sentence.
- **Prove It Works.** Read the run log at the head SHA. A green badge is a proxy.
- **Laziness Protocol.** A gate that nothing runs, or that already fails on trunk, is deleted.
- **Separate Before Serializing Shared State.** Leaves share no mutable state. Each owns its
  database, port and temporary directory.
- **Boundary Discipline.** Configuration and environment are parsed once at startup into a typed
  value. Code below it trusts that value.
