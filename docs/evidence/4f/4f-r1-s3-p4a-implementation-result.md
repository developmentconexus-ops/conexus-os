# 4F(R1) S3-P4-A — implementation result and Lead adjudication

> **Verdict:** `CLOSED PASS`
> **Parent gate:** `S3-P4 OPEN / P4-B STOP-SPLIT PREREQUISITE`
> **Product operation delta:** `0`

## Delivered vertical outcome

P4-A adds only three Project-private named custody operations to the exact-image
Git port:

```text
promoteStagedProjectSource
createProjectSourceBundle
restoreProjectSourceBundle
```

A verified staged bare repository now promotes by same-filesystem atomic rename,
exact canonical re-entry adopts the same revision, mismatch quarantines only the
candidate, bundle creation verifies before owner-local publication, and restore
accepts only the same Project path and exact revision before using the same
promotion boundary. Every Git process remains fixed, no-network, capability-free,
no-new-privileges, read-only-root and bound to the admitted OCI index.

The deciding negative control exposed one real local defect: corrupt-bundle
refusal left `verify.git` scratch, so the corrected bundle could not restore on
the same attempt. The correction removes that scratch inside every in-image
restore exit and again in host failure/finally cleanup. The same-attempt canary
then passed. One diagnostic script used to isolate an accidentally introduced
test regression was removed before the candidate was frozen.

## Exact final implementation bytes

```text
apps/hub/src/project/git-execution.ts = de72cef1a373003262c33cca4c865ff3cd2bd487acf3ce7abde2eff6a62c5c3d
scripts/check-r1-s3-git-execution.mjs = 333aaaaa2a4e5234264c541fa9e3e853010e7d0a62c71b1b38ce9ef9e94ed84a
tests/implementation/r1-s3-git-execution.test.mjs = 9e394fccf22ca763994ea462bd46d194bef313f52bfaf7ee4dc99f1168328140
package.json = 1a8b07914d2957838bbd6e1b78b2bb54af68488c66be0fdfb63c3404dfc785fb
```

The independent review froze candidate manifest
`795d352d12b4b7cb97ccdd610340b44fee34d8b9155257106713b890ca92559a`
and brief
`f7620f6cc0afcb2d94da6ff9682ba170c04c26be410851957c02b098cf173d76`.
After both lanes completed, only the test file changed: its reviewed digest
`3c8058fe...` became the final digest above by adding the reviewer-requested
deterministic P4-A RED matrix and correcting its empty-canonical fixture. No
production, packet, roadmap or package byte in the reviewed subject changed.

## Deciding proof

```text
npm run r1:s3:p4a:check
  PASS / 29 active / 4 live skipped
  P4-A RED submatrix 4/4 PASS

npm run r1:s2:hub:typecheck
  PASS

targeted Biome
  PASS

NEW exact-image canary
  PASS / 353306 ms
  stage → promote → bundle create/verify
  corrupt refusal → same-attempt exact restore
  exact re-adoption → mismatch quarantine/canonical preservation

EXISTING_GIT exact-image canary
  PASS / 336598 ms
  exact OID 1bc328d363b387d9be353e47d516ffcc79983a69
  catalog + secret-file transport → promote → bundle → restore → re-adopt

npm ci
  PASS / 192 packages audited / 0 vulnerabilities

npm run verify
  PASS / A0 + repository check + complete wire verification
```

The direct canaries used OCI index
`sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.
No host Git, mutable tag, platform manifest or rejected index substituted it.

## Independent closure and Lead adjudication

The review was justified only after the real scratch-reentry correction changed
the protected recovery property and deciding-proof reliability.

| Lane | Actual identity | Raw verdict |
| --- | --- | --- |
| Claude Code Fable | CLI `2.1.257`; alias `fable`; canonical model `claude-fable-5-1`; `xhigh`; plan/read-only; session `74650650-44fb-4c89-a261-0c6e05e8085b` | `CLEAR / NO MATERIAL BLOCKER / METHOD FINDING=0 / PRODUCT-PLAN GAP=0 / LOCAL EXECUTION GAP=6 NON-BLOCKING DEFER SAFELY` |
| AGY Gemini | CLI `1.1.23`; `gemini-3.1-pro-high`; `high`; plan+sandbox; conversation `00ee0f63-a878-4095-9579-c5b4ecc1cdcf` | `CLEAR` |

The first AGY conversation `15803a60-2837-414b-8762-119822b43403` produced no
review because its scratch `pwd` tool request was auto-denied. It is discarded,
not Evidence. The valid fresh lane used only read/search tools over the admitted
workspace. Neither valid lane received the other's output.

Lead adjudication:

1. verification failure and revision mismatch currently share candidate
   quarantine classification — `DEFER SAFELY`; canonical is untouched and no
   route/receipt consumes the code yet; revisit in S3-P5 before terminal receipt
   mapping;
2. a crash after request-file `wx` can cause one fail-closed retry — `DEFER
   SAFELY`; no false PASS or canonical mutation exists; revisit in S3-P5 re-entry
   proof;
3. Linux rename makes the existing-bundle digest branch unreachable — `DEFER
   SAFELY`; the published candidate is still in-image verified for the same
   revision and no receipt records a bundle digest; revisit before any bundle
   digest/custody claim or external export;
4. P4-A lacked its own deterministic RED matrix — `ACCEPTED + CORRECTED` in the
   test-only post-review delta; four subtests now cover refusal, canonical
   preservation, no bundle publication and same-attempt restore re-entry;
5. canonical-only adoption after promotion-before-settlement is not composed in
   P4-A — `DEFER SAFELY`; no Product route or settlement exists; revisit in
   P4-B/P5 before PRJ-03 can be exposed;
6. bundle creation relies on the staging hierarchy and leaves an empty attempt
   directory — `DEFER SAFELY`; P4-B owns bounded cleanup; revisit when P4-B and
   P5 compose.

The accepted test-only correction does not change a reviewed production
property and therefore does not invalidate either challenge. No further
reviewer/model call is justified.

## Remaining boundary

P4-A is closed, but S3-P4 is not. The exact PostgreSQL 17.10 manifest
`sha256:6e5a6518f9d2ff9e9f4cba2a5a87d8f41b0f067f6f92ac847c344351a6c8d923`
remains absent. P4-B receipt-locked abandoned-attempt claim and cleanup
composition therefore remain `STOP / SPLIT PREREQUISITE` until the operator
authorizes exact external input acquisition. P5/P6, Product/provider calls,
cognition/R1C-13, external OCI/input custody, commit, push, PR and merge remain
blocked.
