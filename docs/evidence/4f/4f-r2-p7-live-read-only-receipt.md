# R2-P7 read-only Sankhya qualification receipt

**Receipt status:** `CLOSED PASS / POST-MERGE TRACEABILITY NOTE`
**Execution candidate recorded at proof time:** `1833dfc62a22eba4f4376bfa794a8f1716ae898d`
**Execution candidate remote resolution:** `UNRESOLVED` — GitHub does not resolve this SHA; this receipt does not claim that it is the merged-tree identity.
**PR #63 head:** `3c18ebcb18777fa11287955a54fce7e05922f114`
**Integrated `main`:** `87598b38c4b2167b4face4f75a6493f562a2752b`
**Post-merge Verify:** run `34138333401`, `success` on the exact integrated `main` SHA.
**Execution date:** 2026-09-07
**Scope:** production Sankhya read-only proof for company `1` (Matriz) and
company `2` (Filial), plus the bounded whole-R2 composition.

This receipt records only admitted states and proof identity. Credential values,
tokens, response bodies, business rows, transaction identifiers and aggregate
counts are intentionally excluded.

The proof-time execution candidate above was recorded by the local execution
lane before PR #63 was merged. Because that SHA is not resolvable in the current
GitHub object graph, no candidate-to-merge equivalence is invented here. The
merged repository identity is the PR #63 head plus the integrated `main` squash
commit recorded above. The post-merge Verify establishes the repository gate on
the integrated tree; it does not retroactively turn the unresolved local SHA
into a GitHub commit.

## Live qualification

- Credential source: `/home/leandrotheodoro/.config/conexus/credentials/sankhya-p5-probe.json`, file mode `0600`; values were consumed by the file-backed adapter and were never printed or persisted.
- Entry point: `qualifySankhyaOm` in `apps/hub/src/connections/qualification.ts`, compiled in an ignored temporary cache.
- Provider endpoint: `https://api.sankhya.com.br`.
- Admitted response schema: `sankhya-om-production/v1`.
- Company `1`: `PROVIDER_CONFIRMED` / `PASSED`.
- Company `2`: `PROVIDER_CONFIRMED` / `PASSED`.

## Live Gateway observation

- Entry points: `createSankhyaKeyConformanceObserver` in
  `apps/hub/src/gateway/sankhya-key-conformance-observer.ts` and
  `authenticateSankhya` in `apps/hub/src/connections/transport.ts`.
- The exact registered production descriptor and subject were used for each
  company; the observer performed the permitted read-only request.
- Company `1`: `PROVEN`, `complete=true`, coherence `SINGLE_STATEMENT`, response
  shape `ADMITTED`.
- Company `2`: `PROVEN`, `complete=true`, coherence `SINGLE_STATEMENT`, response
  shape `ADMITTED`.
- Count-bearing fields and provider payloads remained ephemeral and were not
  written to Evidence, logs or chat.

## Whole-R2 composition

Command: `CONEXUS_R2_P4_GIT_LIVE=true` with the isolated PostgreSQL runner, executing
`tests/implementation/r2-p6-production-composed-postgres.test.mjs`.

Result: `1/1 PASS` in `401.917s`; browser composition traversed 27 method/path
pairs across the exact 20 R2 operations. Sankhya was a controlled loopback
transport in this composition; this result is not a second live-provider claim.

## Review and verification disposition

- Fable closure review: completed; code/composition/trust boundaries passed, but
  identified this missing durable receipt and stale 1.2 cadence text (corrected
  in the same continuation).
- AGY/Gemini closure lane: `PASS`; the independent report found no Product,
  Method or local-execution gap in the receipt-bound scope.
- `npm run verify:local`: PASS before the original receipt-only documentation change.
- `node scripts/check-current-state.mjs`: PASS on the locally recorded execution candidate at proof time; the candidate SHA is not independently resolvable from current GitHub.
- Post-merge `Verify` run `34138333401`: PASS on integrated `main@87598b38c4b2167b4face4f75a6493f562a2752b`.

The receipt-last closure remains complete for the bounded R2 claims. This
post-merge note repairs path and identity traceability only; it does not broaden
the live-provider claim, claim a second live-provider execution, authorize ERP
writes or authorize a successor implementation tranche.
