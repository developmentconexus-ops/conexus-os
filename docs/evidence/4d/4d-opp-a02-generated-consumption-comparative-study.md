# 4D OPP-A02 — Canonical Generated Product Consumption Comparative Study

> **Status:** `PASS 1 COMPLETE / KUBB LEADING CANDIDATE / NO PACKAGE SELECTION`
> **Inputs:** closed 4B generated-projection Evidence; `WIR-01..05`; `FE-03`; `VER-01/06`
> **Research date:** `2026-08-28`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

> Which generated-consumption composition gives Conexus deterministic types,
> transport, frontend query mechanics and optional runtime validation without
> creating a second wire/DTO authority or weakening OpenAPI 3.1 / JSON Schema
> 2020-12 truth?

Required properties:

```text
canonical Product OAS / exact Project operation declaration
→ deterministic generated output
→ strict TypeScript
→ exact method/path/security/carriers/Problems
→ frontend/server consumption

-X-> handwritten parallel DTO
-X-> editable generated authority
-X-> generic execute(anySlug, anyInput)
-X-> generator-specific weakening of Product schemas
```

## 2. Existing deciding Evidence

The current executable verifier already runs an isolated real-OAS Kubb probe on
every `wire:verify`:

```text
Kubb 5.0.0
+ @kubb/plugin-ts 5.0.0
+ @kubb/plugin-fetch 5.0.0
+ current canonical bundled Product OAS
→ generate twice / byte identical
→ current 128 exact method+path pairs
→ no missing/invented route
→ If-Match + Idempotency-Key preserved
→ __Host-conexus_session preserved
→ 401/403/404/409/412/422/503 type distinctions present
→ explicit public any = 0
→ strict TypeScript compile GREEN
```

This is stronger than a sample-project comparison. It proves current exact
Conexus OAS viability for TypeScript + Fetch only. It does not prove React Query,
runtime validation, server handlers, per-operation Problem subsets, bundle
behavior or final Project topology.

The tool-neutral `conexus-wire-projection/v1` manifest remains the independent
comparison oracle. It must survive even if Kubb is later selected; generator
output cannot verify itself exclusively against its own representation.

## 3. Current sources and candidate identity

Primary/current sources examined:

- [Kubb official docs](https://docs.kubb.dev/)
- [Kubb React Query plugin](https://kubb.dev/plugins/plugin-react-query)
- [Kubb source](https://github.com/kubb-labs/kubb)
- [Orval official docs](https://orval.dev/docs/)
- [Orval React Query guide](https://orval.dev/docs/guides/react-query/)
- [Orval Zod/runtime-validation configuration](https://orval.dev/docs/reference/configuration/output/)
- [Hey API OpenAPI TypeScript source/docs](https://github.com/hey-api/openapi-ts)

Registry observations are Evidence, not pins:

| Package | Observed version | License | Observation |
| --- | --- | --- | --- |
| `kubb` / `@kubb/core` | `5.0.4` | MIT | current core family; existing Conexus proof remains pinned at `5.0.0` |
| `@kubb/plugin-ts` | `5.0.0` | MIT | current registry version lags current core patch |
| `@kubb/plugin-fetch` | `5.1.1` | MIT | version line is ahead of core and depends on TS + Zod plugins |
| `@kubb/plugin-react-query` | `5.0.1` | MIT | generates TanStack Query hooks over a client plugin |
| `@kubb/plugin-zod` | `5.1.2` | MIT | current plugin line is ahead of core |
| `orval` | `8.26.0` | MIT | Fetch, TanStack Query, Zod runtime validation and MSW in one toolchain |
| `@hey-api/openapi-ts` | `0.99.0` | MIT | plugin architecture for SDK, Fetch, TanStack Query and Zod |
| `@tanstack/react-query` | `5.102.8` | MIT | current accepted architecture family; exact pin remains open |
| `zod` | `4.5.1` | MIT | optional generated projection only; canonical AJV/schema authority remains above it |

The observed Kubb family has cross-package version skew and rapid publication.
An eventual pin must prove one coherent exact set rather than combine `latest`
packages independently.

## 4. Candidate analysis

### A — Kubb TypeScript + Fetch base

Strengths:

- only candidate with an exact current Conexus real-OAS proof;
- deterministic directory output and strict TypeScript already demonstrated;
- modular plugins allow TypeScript/Fetch without forcing hooks/mocks/runtime UI;
- official plugins exist for React Query, Zod, MSW and other consumers;
- current output preserves Conexus route/carrier/security/status properties under
  the existing bounded assertions.

Gaps/risks:

- current proof checks that each important status appears in the corpus, not
  the correct Problem subset for every operation;
- generated-client output shape and `.ts` import behavior already required one
  harness-specific compiler accommodation;
- plugin-fetch carries a Zod plugin dependency even when only Fetch is selected;
- current package versions are not released as one visibly synchronized number;
- React Query/query-key/invalidation semantics and Zod truth fidelity remain
  unproven on the Conexus OAS;
- server handler generation is not part of the accepted probe;
- update/migration stability and generated-tree diff quality need proof.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / LEADING ADOPT
CANDIDATE` for the generated TypeScript + Fetch base. No package selection yet.

### B — Kubb React Query plugin

Useful properties:

- generates typed `useQuery`, mutation, infinite and query-key mechanics from
  the same OpenAPI AST/client;
- aligns with the accepted TanStack Query direction;
- may eliminate a large class of handwritten transport/query glue.

Boundary:

```text
generated query key/fetch mechanics = allowed
owner-specific currentness/invalidation policy = not generator authority
optimistic consequential success = forbidden unless exact owner contract admits it
```

Required proof includes exact opaque pagination, conditional/idempotency
carriage, same-origin credentials, Problem decoding and feature-controlled
invalidation. Generating a hook for every operation does not prove that every
operation should be invoked or optimistically projected the same way.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / TARGETED PROBE
REQUIRED`.

### C — Kubb Zod plugin

Potential value:

- generated runtime validation can protect untrusted browser/server boundaries;
- one AST/toolchain could reduce extra glue and align types/validators.

Material risk:

The canonical schemas use OpenAPI 3.1 and JSON Schema 2020-12 properties such as
conditional `if/then/not`, exact additional-property closure and truth-dependent
required/forbidden data. Type generation success does not prove equivalent Zod
validation.

```text
AJV / canonical JSON Schema = deciding schema proof
generated Zod               = subordinate runtime projection
```

If the generated validator cannot reject every current negative fixture, it is
not an admissible replacement. It may still be used only on a proven subset if
that subset has an explicit consumer and boundary.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / FIDELITY PROBE
REQUIRED`; never canonical authority.

### D — Orval

Useful properties:

- mature integrated Fetch/React Query/Zod/MSW generation;
- per-operation overrides and query options;
- explicit response runtime validation support with Zod;
- can generate separate client and schema outputs.

Gaps/risks:

- no exact current Conexus real-OAS probe;
- broad all-in-one CLI/dependency surface increases generated configuration and
  migration coupling;
- automatic mutation invalidation/reset and per-operation override features can
  accidentally become owner semantics if used as global convenience;
- Zod fidelity has the same subordinate-projection burden;
- would duplicate the already-proven Kubb comparison cost without a named Kubb
  falsifier unless it demonstrates a materially stronger property.

**Pass-1 disposition:** `KEEP_AS_IMPLEMENTATION_ALTERNATIVE / FALLBACK`.

### E — Hey API OpenAPI TypeScript

Useful properties:

- active plugin architecture for generated SDKs, Fetch, Zod and TanStack Query;
- substantial customization and modern TypeScript focus;
- credible current ecosystem usage and alternative code-generation structure.

Gaps/risks:

- no exact Conexus OAS/falsifier probe;
- pre-1.0 generator version communicates significant migration volatility;
- broad plugin/customization surface can create divergent local conventions;
- current issue history demonstrates that security-carrier behavior still
  requires exact regression proof rather than trust by feature list;
- no current Kubb defect requires switching.

**Pass-1 disposition:** `KEEP_REFERENCE_ONLY / CREDIBLE FALLBACK CANDIDATE`;
promote to exact probe only on material Kubb/Orval gap or materially better
property.

### F — tool-neutral generated projection manifest

This is not the final client generator. Its value is independent conformance:

- exact operation identity/method/path/carriers/security census;
- deterministic, simple and stable comparison input;
- protects against a selected generator silently dropping/inventing wire;
- can later feed traceability/impact/drift mechanics.

**Pass-1 disposition:** `PROMOTE_TO_4D_PROPERTY / KEEP` as the independent
generated wire/traceability projection, regardless of client generator choice.

## 5. Composition decision space

Leading structure:

```text
canonical OpenAPI 3.1 / JSON Schema 2020-12
→ deterministic bundle
→ tool-neutral independent projection/conformance manifest
→ selected generated TypeScript + Fetch client
→ optional generated TanStack Query mechanics
→ optional generated runtime validators only for proved-fidelity subsets
→ feature consumer
```

Authority order remains:

```text
OpenAPI/JSON Schema + AJV proof
> generated TypeScript/Fetch
> generated query mechanics
> generated runtime validators
```

The likely Global Maximum is not “turn on every Kubb plugin.” It is the smallest
proven plugin set for each real consumer, with independent conformance and
owner-specific feature behavior outside generated machinery.

## 6. Required targeted probes before selection

### Base client repin

1. Select one coherent exact Kubb package set from official package/source
   provenance; never mix `latest` versions independently.
2. Re-run current 128-operation deterministic/type/fetch proof.
3. Assert the correct per-operation Problem/status subset for consumers that
   branch materially.
4. Prove same-origin session credentials and Problem body decoding, not cookie
   scheme text presence alone.
5. Pin generated-tree identity and measure diff/migration behavior across one
   controlled repin.

### React Query

1. Generate only the exact current consumer set or prove unused hooks create no
   Product exposure.
2. Verify opaque pagination and stable query-key identity.
3. Verify conditional/idempotency carriers on mutations.
4. Keep invalidation/currentness rules owner/feature-controlled.
5. Prove failure/unknown/partial states remain distinguishable.

### Runtime validation

1. Generate validators for representative conditional schemas.
2. Run all current positive and negative Budget truth fixtures through both AJV
   and generated validators.
3. Require identical accept/reject disposition for the admitted subset.
4. Reject/adapt the generated validator rather than weaken canonical schemas.

### Fallback trigger

Probe Orval or Hey API only if Kubb cannot satisfy a required property, coherent
version admission, migration/reproducibility constraint or generated-boundary
shape. Comparison by feature count alone is insufficient.

## 7. Pass-1 outcome

```text
OPP-A02 PASS 1 = COMPLETE
Kubb TypeScript + Fetch = LEADING ADOPT CANDIDATE / NOT SELECTED
Kubb React Query = TARGETED PROBE REQUIRED
Kubb Zod = FIDELITY PROBE REQUIRED / SUBORDINATE ONLY
Orval = FALLBACK IMPLEMENTATION ALTERNATIVE
Hey API = REFERENCE_ONLY / CREDIBLE FALLBACK
tool-neutral projection manifest = KEEP / PROMOTE TO 4D PROPERTY
exact package/version selection = 0
Product implementation authority = 0
```

This pass confirms the existing Kubb preference through stronger current
comparison rather than historical inertia. Exact admission remains 4D-C work
after 4D-A/B closes the generated-tree and consumption contract.
