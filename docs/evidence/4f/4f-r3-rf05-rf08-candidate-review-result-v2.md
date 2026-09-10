# R3 — RF-05 / RF-08 corrected candidate independent review result

> **Status:** REVIEW COMPLETE / CORRECTIONS REQUIRED / R3 NOT ADMITTED
> **Review mode:** fresh read-only Opus + Gemini lanes
> **Candidate:** [`4f-r3-rf05-rf08-candidate-freeze.md`](4f-r3-rf05-rf08-candidate-freeze.md)
> **Brief:** [`4f-r3-rf05-rf08-candidate-review-brief.md`](4f-r3-rf05-rf08-candidate-review-brief.md)

Both lanes independently reproduced the final candidate's then-current 16-row
custody, aggregate manifest, 23-file migration digest and base commit. The
findings below were raised against those bytes. This result is Evidence only.

## Lane receipts

| Lane | Tool/version | Session | Result |
| --- | --- | --- | --- |
| Opus | Claude 2.1.257 / canonical `claude-opus-5` | `4049973c-29dd-4cd2-b845-81dfea88a115` | Custody sound; corrections required before R3 checkpoint/publication |
| Gemini | AGY 1.1.28 / `gemini-3.1-pro-high` | `50c704d4-b6e6-41e2-969f-248570831e5f` | Adversarial findings; no live execution or provider call |

Machine receipt: `/tmp/conexus-r3-rf05-rf08-review-v2/conexus-review-result.json`.

## Opus findings

1. **METHOD FINDING:** the candidate freeze was wired into the permanent
   required-main CI graph, pinning mutable `docs/roadmap.md` and exact 23-file
   census that the future R3 migration must extend.
2. **PRODUCT / PLAN GAP:** Package-D custody named versions but omitted the
   validator-enforced pg-boss runtime configuration and vendor-DDL identity.
3. **PRODUCT / PLAN GAP:** B02-P1..P10 and B03-P1..P9 were named as required
   before selection but had no traceable disposition after the seven-row R3
   census was introduced.
4. **LOCAL EXECUTION GAP:** the archived `atlas.sum` was stale and still
   co-located as an apparently current integrity manifest.
5. **LOCAL EXECUTION GAP:** migration 023 catalog exclusion was active one
   applied-state too early in `run-hub-migrations.mjs`.
6. **PRODUCT / PLAN GAP:** RF-05/RF-08 disposition lacked a durable row in
   `docs/decisions/index.md`.
7. **LOCAL EXECUTION GAP:** custody omitted routed deciding evidence, did not
   enforce the base commit, and accepted substitutions under a count-only rule.
8. **LOCAL EXECUTION GAP:** retained B03 text described test-only fixture
   evidence as if it had already proven Product `mar.job_run`.

Opus found the accepted owner choice, native runner, Package-D selection,
R3/R7 split and subject boundary otherwise unfalsified.

## Gemini findings

Gemini additionally challenged: missing root `pg-boss` (not applicable while the
planning candidate explicitly forbids installation), cross-owner writes into
MAR, vendor substrate record-count closure, the exact-23 future-extension
coupling, BLD-10 structural references, and the fixture/Product distinction.
The first is a **NO FINDING** because root installation is expressly outside
the grant. The remaining concerns are addressed as explicit MAR-owner boundary,
provider-substrate inventory, migration-024 re-freeze, qualified subject
identity and fixture wording in the corrected packet.

## Verdict

`VERDICT = CANDIDATE CUSTODY SOUND; R3 IMPLEMENTATION CHECKPOINT NOT ADMITTED UNTIL THE METHOD, PACKAGE-D, B02/B03 ROUTING, ARCHIVED MANIFEST, RUNNER, DECISION REGISTER AND CUSTODY-SCOPE CORRECTIONS ARE REVIEWED AGAIN.`
