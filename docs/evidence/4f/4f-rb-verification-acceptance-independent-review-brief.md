# RB verification and acceptance — independent implementation challenge

## Subject and authority

Repository: `https://github.com/developmentconexus-ops/conexus-os.git`.
Exact implementation candidate:
`9cb777a237ef5890bb0168e2df48b54ff1bf1537` on
`rb-builder-verification-acceptance`.
Implementation comparison base:
`839d5496359b95261c59906f51c0ce439d20c251`.
This brief and later adjudication-only commits are not additional
implementation. This is a material diff challenge, not merge, deployment or
Change acceptance.

Exact candidate changed-path census (inspect these current files directly; no
Git command is required):

```text
apps/hub/migrations/020_rb_builder_verification_acceptance.sql
apps/hub/src/builder/module.ts
apps/hub/src/builder/routes.ts
apps/hub/src/builder/service.ts
apps/hub/src/builder/source.ts
apps/hub/src/builder/store.ts
apps/hub/src/builder/verification-runtime.ts
apps/hub/src/platform/config.ts
apps/hub/src/project/module.ts
apps/hub/src/server.ts
apps/web/src/features/builder/api.ts
apps/web/src/features/builder/components/project-build.tsx
apps/web/src/styles.css
docs/evidence/4f/4f-rb-verification-acceptance-stage-code-packet.md
docs/roadmap.md
scripts/run-hub-migrations.mjs
scripts/conexus-review.mjs
tests/implementation/rb-builder-browser.test.mjs
tests/implementation/rb-builder-first-vertical.test.mjs
tests/implementation/rb-builder-production-composed-live.test.mjs
tests/repository/conexus-review.test.mjs
```

Reconstruct `AGENTS.md`, the current roadmap/index, applicable Engineering and
Repository methods, the existing Builder Product/wire owners and
`docs/evidence/4f/4f-rb-verification-acceptance-stage-code-packet.md`. Current
repository authority supersedes this orientation. R1, R2, the first Builder
vertical and its live composition are integrated. The operator authorized this
bounded verification/acceptance increment; R3 and later Builder/Product-Agent
work remain inactive.

## Protected claims and falsifiers

- After exact candidate custody, Hub creates a separate verifier ActorRun and
  a fresh controlled E2B sandbox. It never reuses or trusts the writer sandbox.
- The verifier is independently admitted through the existing Project-owned
  purpose-bound model catalog. No model/provider identity is hardcoded into the
  domain, and a model object that disagrees with admission is refused.
- The verifier model receives no shell, process tool or generic filesystem.
  One Conexus-owned Mastra `createTool` admits only manifest-listed paths and
  `BASE | CANDIDATE` sides, reads through the official E2B SDK, verifies exact
  Git blob OID and byte length, bounds calls/bytes atomically, coalesces
  concurrent identical reads and requires inspection coverage before PASS.
- The verifier sandbox receives no Hub/Project database, Git remote, arbitrary
  secret, provider credential or Connection credential. Guest networking is
  deny-all. Sandbox/model output has no direct owner-state authority.
- Candidate and Baseline files come from immutable Git identities. The manifest
  distinguishes added, modified and deleted files and preserves per-side mode,
  blob OID and byte length sufficiently to verify disclosed bytes and produce
  the existing exact Change diff.
- Mastra structured output is only untrusted Evidence input. Only the Hub-owned
  transaction may record Finding/Evidence and create current
  `change_acceptance`, after rechecking Change, candidate, current approved
  Baseline, Plan, contract revision, required assertion, verifier incarnation,
  required Evidence coverage and absence of unresolved blocking Findings.
- Late, interrupted, cancelled or replaced verifier output cannot settle the
  current Change. Repeated identical human intents remain valid distinct
  Changes; assertion references do not impose accidental global uniqueness.
- `project.review` remains a human review-material disclosure permission, not
  authority over the system verifier. It is checked independently before
  Findings/Evidence disclosure. Cross-Project references disclose nothing.
- Public `Evidence` and `ActorRunProjection` responses retain exactly the closed
  Builder wire fields (`additionalProperties: false`); internal report/outcome
  and verifier purpose do not leak as parallel Product semantics.
- The ordinary Project Build experience displays honest VERIFYING, VERIFIED,
  VERIFICATION_FAILED or UNVERIFIED progress and lets an eligible user inspect
  Findings, Evidence and the real diff. Empty Evidence observed while VERIFYING
  is refetched after terminal state, and long evidence/diff content fits the
  360px Product viewport.
- Existing first-vertical, R1/R2, import-law, migration-custody and 128-operation
  Product wire properties remain intact.

A reproducible violation, owner/contract contradiction, secret/authority escape,
stale-settlement path or false PASS is material. Preference, future runtime
breadth, missing ACP/private MCP/eval infrastructure, a hypothetical generic
filesystem adapter or desire for another planning ceremony is not.

## Proof reconstruction and explicit limits

Lead used Linux Node `24.20.0` and npm `12.0.2`. On the exact final candidate:

- `npm ci` and Playwright Chromium installation completed;
- `npm run verify:local` passed while iterating;
- clean-tree `npm run verify` passed;
- `npm run r1:r1c14:native:check` passed `31/31`;
- the targeted Builder suite passed unit, HTTP, browser, migration-custody and
  runtime refusal controls;
- real PostgreSQL 17 migration/role/transaction tests passed, including repeated
  intents and a Baseline changed after verifier claim;
- real OCI Git custody passed, including added/modified/deleted manifest sides;
- a final real user composition passed through Chromium UI, HTTP, PostgreSQL,
  Git, Mastra `1.63.2`, the explicitly pinned E2B template, writer E2B sandbox,
  fresh verifier E2B sandbox, Evidence/acceptance settlement and desktop/mobile
  UI read-back.

The live replay used protected local credential files and intentionally did not
persist or disclose their contents. Existing OpenAPI warnings and npm's two low
severity audit findings remain unchanged and did not falsify this increment.
Reviewers must not invoke live providers, read credential material, start
containers, edit files, publish branches or perform any external write.

This increment intentionally does not implement BLD-05, BLD-13, generic source
tree/file browsing, Preview, correction WorkUnits, Change source integration,
ACP/private MCP, generic eval/telemetry, concurrent writers, R3, Release or
deployment. Report only if one of these omissions concretely breaks a protected
claim of the implemented vertical.

## Output and limits

Use the repository review classes: `METHOD FINDING`, `PRODUCT / PLAN GAP`,
`LOCAL EXECUTION GAP`, or `NO FINDING`. Every finding must provide exact code or
owner evidence, a reproducible failure path, materiality, smallest owner/stage,
protected invariant, stop scope, required correction and what must not reopen.
Distinguish an unproven property from a concrete defect. Review the whole exact
candidate independently and do not consult the other lane. Lead adjudicates all
output. Reviewers cannot accept RB, merge, deploy or expand the authorized slice.
