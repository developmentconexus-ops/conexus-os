# R3 — RF-05 / RF-08 corrected candidate review adjudication

> **Status:** V2 CORRECTIONS IN PROGRESS / FRESH REVIEW REQUIRED
> **Scope:** [`candidate-review-result-v2.md`](4f-r3-rf05-rf08-candidate-review-result-v2.md)

| Finding | Adjudication | Action / boundary |
| --- | --- | --- |
| Candidate freeze in permanent CI | **CORRECTED** | Removed `repository:r3-candidate-freeze` from `CANDIDATE_GRAPH`; it remains an explicit review-lane command and test. Required-main CI continues to assert repository/Product properties only. |
| Package-D omitted runtime config | **CORRECTED** | Freeze now binds `schema=mar`, `createSchema=false`, `migrate=false`, `schedule=false`, `retryLimit=0`, vendor DDL SHA-256/export surface, criteria, receipt and vendor SQL. |
| B02/B03 rows dropped | **CORRECTED** | Freeze now maps every B02-P1..P10 and B03-P1..P9 to pending R3/R7 proof or explicit `DEFER SAFELY` owner/trigger. No row is claimed green. |
| Stale `atlas.sum` | **CORRECTED** | Moved to `docs/evidence/4d/atlas.sum-legacy-019.txt`; native runner remains sole selected authority. Historical references remain historical. |
| `after023` catalog window | **CORRECTED** | Runner now sets `after023: applied.has('023')`; the candidate test proves the old unconditional form is rejected. |
| Decision register omission | **CORRECTED** | Added the 4D-RF05/RF08 candidate disposition and reopen trigger to `docs/decisions/index.md`. |
| Custody scope/base/substitution | **CORRECTED** | Checker now enforces the exact required path set, verifies `HEAD` against declared base, and tests base drift; routed criteria, receipt, vendor, references and contract are bound. |
| Fixture restated as Product | **CORRECTED** | B03 study and freeze now say Package-D is test-only fixture Evidence and does not prove Product `mar.job_run` identity. |
| Cross-owner MAR write concern | **ROUTED / NO ARCHITECTURE REOPEN** | Freeze states MAR-owned co-admission and denies arbitrary Project/Gateway writes into MAR; provider tables remain substrate outside the 46 semantic records. |
| Exact-23 extension concern | **DEFER SAFELY** | Current checker intentionally rejects unannounced migration 024. R3 must update runner census/conformance and issue a new freeze in the same implementation change. |
| BLD-10 structural references | **NO FINDING** | References to migration 023 and the boundary test establish identity only; the freeze explicitly forbids R3 value consumption and requires exact non-consumption proof. |
| Root `pg-boss` absence | **NO FINDING** | Package-D is isolated and runtime installation is outside the current grant; no production claim is made. |

These corrections do not install dependencies, execute a JobRun, read live
Sankhya, admit physical MAR, create a Release, publish Git or authorize R3
implementation. A third review round is required because the second review
identified material corrections to the reliability of the deciding proof.
