# Independent Global Review: R1C-14 Linux-native readmission

## Findings

### 1. Exact OCI Identity & TOCTOU Closure
- **Classification:** NO FINDING
- **Evidence:** `run.mjs` resolves the index digest from `image.tag` and stores it as `immutableImage`. All subsequent `docker run` executions use `immutableImage`. The S3 execution binding requires `docker run --pull never` against the exact index `sha256:5e5c...f7851`. The `run.mjs` file successfully validates metadata hashes from `docker image inspect` against the pin before execution.
- **Materiality:** This successfully closes the mutable tag time-of-check to time-of-use (TOCTOU) vulnerability and ensures zero substitution happens.

### 2. False-Pass Resistance
- **Classification:** NO FINDING
- **Evidence:** The read-only validation tool `check-r1c14-native-readmission.mjs` fully recomputes material digests including `build-metadata.json`, manifest, and candidate result. Test coverage explicitly demonstrates refusal of forged result digests, mutated inputs, partial output records, incomplete check censuses, and undeclared inherited mutations.
- **Materiality:** The boundaries of validation are rigorously defended against stale evidence or partial success artifacts.

### 3. Qualification-Run Product Delta
- **Classification:** NO FINDING
- **Evidence:** `run.mjs` invokes `product-census.mjs` before and after generating the result. The `finalize-result.mjs` script strictly checks that the census is unchanged before permitting promotion, strictly setting `productDelta` to 0.
- **Materiality:** Ensures that qualification tests do not invisibly leak state or mutate the main product boundary.

### 4. Secret Non-Disclosure
- **Classification:** NO FINDING
- **Evidence:** `probe.mjs` dynamically generates a synthetic secret canary, injects it into a read-only script, explicitly attempts to exfiltrate it across filesystem boundaries and URL requests, and then verifies that the file and request logs do not disclose it. The finalizer enforces string-exclusion of the secret within the JSON candidate result bytes.
- **Materiality:** The synthetic canary confirms isolation and credential non-disclosure across execution environments.

### 5. Historical Evidence Preservation
- **Classification:** NO FINDING
- **Evidence:** The protocol scripts from prior executions are retained unmodified in `evidence/superseded-protocol/`. `check-r1c14-native-readmission.mjs` reads the full supersession chain (`conexus.r1c14.native-readmission-supersession/v1`) backwards to verify that rejected iterations are properly bound to the accepted successor and not orphaned.
- **Materiality:** Maintains the continuous lineage of authority and validation history.

### 6. Deciding-Review Integrity
- **Classification:** NO FINDING
- **Evidence:** `conexus-review.mjs` enforces the use of specific canonical binaries (e.g. `claude`, `agy`) in explicitly sandboxed and read-only modes (e.g. `--permission-mode plan` for `opus` and `--mode plan --sandbox` for `gemini`). The `check-r1c14-native-readmission.mjs` module validates that the exact CLI commands were used, preventing execution escapes.
- **Materiality:** Independent Opus and Gemini reviews are completely sandboxed and neutrally aggregated to provide independent convergence prior to gate release.

## Final Summary

R1C14_NATIVE_READMISSION = ADMISSIBLE
MATERIAL_BLOCKERS = 0
EXACT_OCI_IDENTITY = PASS
FALSE_PASS_RESISTANCE = PASS
QUALIFICATION_RUN_PRODUCT_DELTA = PASS
SECRET_NON_DISCLOSURE = PASS
HISTORICAL_EVIDENCE_PRESERVED = PASS
DECIDING_REVIEW_INTEGRITY = PASS
VERDICT = PASS
