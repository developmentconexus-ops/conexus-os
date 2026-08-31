# 4D — R1 Foundation Pack B profile/compiler result

Status: **CLOSED / PACK B PASS / `R1F-P03/P04` GREEN / OTHER PACKS NOT PROVEN**

Date: `2026-08-30`

Pack B executed under the operator-approved R1 Foundation Probe Grant using only
Pack-A-admitted Node/npm/package identities and isolated temporary installs.
[Executable Evidence](../../../qualification/4d/r1-foundation/evidence/pack-b-summary.md).

## Result

| Proof | Verdict | What actually fired |
| --- | --- | --- |
| `R1F-P03` | `PASS` | invalid UTF-8/BOM/duplicate/comment/trailing/lone-surrogate/unsafe-or-floating-number/schema inputs refused before canonicalization |
| `R1F-P04` | `PASS` | exact RFC 8785 bytes and sorting reproduced; noncanonical substitute detected |
| bounded RF-01 mechanics | `PASS` | deterministic tree/manifest/plan/receipt, plan digest, full census, APP preservation, protected drift, symlink, lock, stale-plan and receipt-last failure controls fired |

Example:

```text
human edits app/index.mjs (APP-OWNED)
→ regeneration plan = PRESERVE
→ bytes remain identical

human edits generated/settings.json (GENERATED)
→ regeneration plan = PROTECTED_DRIFT
→ no overwrite and no new receipt
```

The probe also caught a forged plan whose operations no longer matched its
digest (`PLAN_DIGEST_MISMATCH`), and a second writer could not delete the first
writer's lock.

## Claim boundary

The harness proves the selected algorithms are buildable and their named
controls fire. It is not the production compiler and does not prove multi-file
crash atomicity, Project duplication, distributed-asset/wire conformance or all
`RF01-P01..P14`. Those remain later exact consumers/proofs.

No Product owner, dependency or runtime family changed. Pack C remains separate.
Product implementation, push, PR and merge remain unauthorized.
