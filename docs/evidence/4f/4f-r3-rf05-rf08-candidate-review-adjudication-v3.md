# R3 — RF-05 / RF-08 V3 review adjudication

> **Status:** V3 CORRECTIONS IN PROGRESS / FRESH REVIEW REQUIRED
> **Scope:** [`candidate-review-result-v3.md`](4f-r3-rf05-rf08-candidate-review-result-v3.md)

| Finding | Adjudication | Action / boundary |
| --- | --- | --- |
| Raw vendor DDL cannot be applied verbatim | **CORRECTED IN PLAN** | Freeze and qualification reference now distinguish exact vendor source provenance from a hardened Project migration wrapper. The wrapper must explicitly provision `mar`, close privileges/security, use one runner envelope, preserve provider object definitions, and requalify the new bytes. |
| Freeze self-identity absent | **CORRECTED** | Added external candidate attestation JSON binding freeze SHA, brief SHA, base, manifest and migration digests; checker verifies it without adding a circular custody row. |
| RF-05 source paths absent | **CORRECTED** | Added postgres platform and all transaction-owning Hub store paths to the required custody set and freeze table. |
| Dirty worktree identity | **ROUTED / LIMIT PRESERVED** | Attestation records exact current bytes; freeze remains unpublished Evidence and is not called a Git checkpoint. Commit/publication remain ungranted. |
| Package-D P1..P6 vs R3-P7 | **CORRECTED** | Freeze now states Package-D fixture subset does not claim `R3-P7`; read-only recovery remains a later R3 proof. |
| BLD-10 non-consumption route | **CORRECTED IN SCOPE** | Exact contract/operation/table identity is a source-census prerequisite for R3; Package-D criteria are not used as that proof. |
| RF-05 transaction-law mechanism | **CORRECTED IN PLAN** | R3 packet must add shared helper/static guard and a negative test for split checkout, rollback masking and owner bypass; no current implementation PASS is claimed. |
| Schema/inventory concern | **NO ARCHITECTURE REOPEN** | MAR-owned provider substrate remains inside the accepted `mar` boundary and outside the 46 semantic records, with explicit grants and hardened wrapper still required. |
| Root tuple mismatch | **RETAINED BOUNDARY** | Package-D remains isolated; no transfer to root `pg 8.23.0`/Node 24.20.0 is claimed. |

These changes remain planning/repository-proof work. No dependency install, live
target, JobRun, provider call, Release, publication or R3 implementation is
authorized. A fresh Opus/Gemini review is required because the vendor-DDL plan
and deciding-proof identity changed materially.
