# R3 P2/P3 — GPT-6 Astra Global Maximum advisor receipt

> **Status:** ADVISORY EVIDENCE / ADJUDICATED BY LEAD
> **Date:** 2026-09-09
> **Model:** `gpt-6-astra` (`xhigh` first attempt timed out; fresh `high` replacement completed)
> **Authority:** review/advisor output only; no Product or architecture authority

## Review subject

The advisor received the bounded R3 P2/P3 decision and the minimum current
authority route: the Engineering Method, R3 task packet and Project/data owner.
It was instructed not to edit files, install dependencies or execute a live
JobRun, Sankhya, provider or model call.

## Advisory verdict

```text
CURRENT STRUCTURE CONFIRMED, com bloqueios contratuais;
Global Maximum plausível, ainda não demonstrado.
```

The advisor agreed that a dedicated Project database, two explicit tables and
the current-root MAR tuple are the smallest credible direction. It rejected
business rows in Hub/MAR, a generic JSON read model, speculative sync
frameworks, and downgrading the root tuple merely to inherit old Evidence.

## Findings and adjudication

| Finding | Classification | Adjudication |
| --- | --- | --- |
| Full snapshot versus delta was not explicit; generation/key/deletion/resume semantics were underspecified | `PRODUCT / PLAN GAP` | Accepted. The decision now requires an explicit observation kind, `(generation, budget_ref)` identity, idempotent replay and no deletion from an incomplete delta. |
| A previously `CURRENT` checkpoint could remain current after drift or incomplete observation | `PRODUCT / PLAN GAP` | Accepted. The checkpoint may degrade freshness/coverage/merge state without deleting confirmed rows; only a complete, current observation can restore `CURRENT`/`COMPLETE`. |
| Direct DML would bypass the bounded Project merge contract | `METHOD FINDING` with correctness impact | Accepted. Runtime DML is denied; a Project-owned bounded database function is the sole write capability, with stale-writer rejection and a negative direct-DML proof. |
| Migration source/candidate identity and cross-Project/DEV/PROD isolation were not tied to the runner contract | `LOCAL EXECUTION GAP` | Accepted. The Project ledger records source revision and migration checksum; the runner and controlled PostgreSQL proof must demonstrate database/role isolation. |
| Root tuple requalification must precede any dependent R3 proof, not merely live occurrence | `LOCAL EXECUTION GAP` | Accepted. The root tuple is not declared green for an R3 row until its controlled requalification is bound to the exact candidate. |
| Complete provisioning/recovery operations need not be built in this increment | `DEFER SAFELY` | Accepted. Provisioning and first-production restore remain later work while the Project identity/DB boundary and replaceable MAR queue seam are fixed now. |

The receipt does not claim independent closure, Product acceptance or R3 proof
green. The Lead adjudication is recorded in the owner decision linked below.
