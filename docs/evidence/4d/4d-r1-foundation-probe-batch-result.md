# 4D — R1 Foundation Probe Batch result

Status: **P01..P12 ALL GREEN / OPERATOR APPROVED / IMPLEMENTATION BLOCKED**

Date: `2026-08-30`

The operator-approved Evidence-only grant executed six isolated packs. One
supply-chain falsifier and one migration-order gap fired, were corrected at their
smallest owners and rerun GREEN.

| Pack | Proofs | Verdict | Durable result |
| --- | --- | --- | --- |
| A | `P01/P02` | `PASS` | exact pins/tree/scripts/signatures/licenses/advisories; `ajv-cli` finding corrected |
| B | `P03/P04` | `PASS` | strict I-JSON/schema admission, RFC 8785 and bounded compiler mechanics |
| C | `P05/P06/P07` | `PASS` | Fastify, real Keycloak OIDC/JWKS and real PostgreSQL sessions |
| D | `P08` | `PASS` | Vite bundle and Chromium/Firefox/WebKit authority/security paths |
| E | `P09/P10` | `PASS` | PostgreSQL owner/store isolation and Atlas migration admission |
| F | `P11/P12` | `PASS` | deciding Linux reproducibility and seven RED/GREEN gates |

## Findings that improved the selection

### `R1F-A01`

`ajv-cli 5.0.0` carried a HIGH vulnerable transitive package. It was removed;
the bounded Ajv `8.20.0` adapter passed the corrected admission tree with zero
audit vulnerabilities.

### `R1F-E01`

`atlas.sum` protected bytes but did not itself reject a newly inserted older
migration after rehash. The bounded Conexus admission now checks Atlas applied
versions and refuses out-of-order additions before apply.

### OIDC signature invariant

The probe demonstrated that `openid-client` claim processing alone is not
application-level signature verification. `enableNonRepudiationChecks` plus real
Keycloak JWKS is mandatory; the forged-signature negative then failed correctly.

## Non-grants

```text
qualification Evidence = complete
Product implementation = 0
R1 tranche execution = 0
production/live-provider authority = 0
push / PR / merge = 0
```

## Operator adjudication

The operator approved the completed Evidence on `2026-08-30`:

```text
APPROVE R1 FOUNDATION PROBE EVIDENCE
```

Approval accepts the foundation proof results only. It does not skip applicable
4D-D/4E/4F/4G tranche gates or grant Product implementation. The downstream
route is `4D-D(R1) → 4E(R1) → 4F(R1) → 4G(R1) → separate operator R1 execution
grant request`.
