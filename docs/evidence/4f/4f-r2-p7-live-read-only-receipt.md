# R2-P7 read-only Sankhya qualification receipt

**Receipt status:** `CLOSED PASS`
**Candidate:** `1833dfc62a22eba4f4376bfa794a8f1716ae898d`
**Execution date:** 2026-09-07
**Scope:** production Sankhya read-only proof for company `1` (Matriz) and
company `2` (Filial), plus the bounded whole-R2 composition.

This receipt records only admitted states and proof identity. Credential values,
tokens, response bodies, business rows, transaction identifiers and aggregate
counts are intentionally excluded.

## Live qualification

- Credential source: `/home/leandrotheodoro/.config/conexus/credentials/sankhya-p5-probe.json`, file mode `0600`; values were consumed by the file-backed adapter and were never printed or persisted.
- Entry point: `qualifySankhyaOm` in `apps/hub/src/integrations/sankhya/qualification.ts`, compiled in an ignored temporary cache.
- Provider endpoint: `https://api.sankhya.com.br`.
- Admitted response schema: `sankhya-om-production/v1`.
- Company `1`: `PROVIDER_CONFIRMED` / `PASSED`.
- Company `2`: `PROVIDER_CONFIRMED` / `PASSED`.

## Live Gateway observation

- Entry points: `createSankhyaKeyConformanceObserver` and
  `authenticateSankhya` in `apps/hub/src/integrations/sankhya/`.
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
- `npm run verify:local`: PASS before this receipt-only documentation change.
- `node scripts/check-current-state.mjs`: PASS on the candidate.

The receipt-last closure is complete for the bounded R2 scope. No push, PR,
merge, deployment or ERP write is authorized by this receipt.
