# 4D — R1 Foundation Selection Candidate

> **Status:** `CLOSED / OPERATOR APPROVED / R1F-A01+R1F-E01 CORRECTED / P01..P12 EVIDENCE OPERATOR APPROVED`
> **Batch:** `R1F-01..07 / ONE PACKAGE / SEVEN INDEPENDENT OUTCOMES`
> **Research date:** `2026-08-30`
> **Probe authority:** bounded operator-approved grant; current pack routed only by roadmap
> **Implementation authority:** none

## 1. Decision summary

| Row | Outcome candidate | Exact selected shape |
| --- | --- | --- |
| `R1F-01` | `ADOPT + ADAPT` | Node `24.20.0` LTS + npm `12.0.2`, Linux x64 deciding build environment, canonical npm lock/install/admission policy |
| `R1F-02` | `ADAPT` | `jsonc-parser 3.3.1` strict raw-tree preflight + `Ajv 8.20.0` Draft 2020-12 strict non-mutating validation |
| `R1F-03` | `ADAPT` | `canonicalize 4.0.0` behind the RF-12 RFC 8785 port after I-JSON/duplicate/safe-number admission |
| `R1F-04` | `ADAPT` | Fastify `5.12.1` + `openid-client 6.8.7` + Keycloak `26.7.2` + narrow official Fastify plugins |
| `R1F-05` | `ADOPT` | React `19.2.8` + Vite `8.2.2` + TanStack Router/Query + native CSS custom properties/CSS Modules |
| `R1F-06` | `ADOPT + ADAPT / CR-1 PRESERVE_SEAM TO R6` | PostgreSQL `17.10` + `pg 8.23.0` + Atlas Community `1.3.0`; narrow I&A `SECURITY DEFINER` CR-1 contract selected but not instantiated before its R6 consumer |
| `R1F-07` | `ADOPT` | TypeScript `6.0.2`, Biome `2.5.11`, Node test runner, Playwright `1.62.1`, existing exact wire tools; no Vitest in R1 |

The seven rows share one compatibility/provenance review and one operator
adjudication. A finding may revise one row without reopening unrelated Product
or another foundation row.

## 2. Exact observed identities

Research used Context7 official-source acceleration, official release/source
repositories and npm/Node registries. Registry observation is not runtime proof.

### Runtime and admission

| Component | Exact identity / provenance |
| --- | --- |
| Node | `24.20.0` LTS `Krypton`, released 2026-08-26; Linux x64 tar SHA-256 `2f2c0da162318f0de47665410c7c8c2ed3d36c8f3105de4bbc61176c70a7cbf2` |
| npm | `12.0.2`; integrity `sha512-uIXokLlBj6FpNUTQX1PmT5pz7BlIN9QlixX+zdaSNHsd0qUXsbDLr50xzY6Sw7cJVr0uzHKDOle0swmPW/p5Qw==`; Artistic-2.0 |
| TypeScript | `6.0.2`; integrity `sha512-bGdAIrZ0wiGDo5l8c++HWtbaNCWTS4UTv7RaTH/ThVIgjkveJt83m74bBHMJkuCbslY8ixgLBVZJIOiQlQTjfQ==` |

TypeScript `7.0.2` was current in the registry but is a newly available major
with no current R1 consumer requiring it. `6.0.2` is selected as the smaller
supported exact baseline; upgrade requires the normal affected-property proof.

### Profile admission

| Component | Exact identity / provenance |
| --- | --- |
| `jsonc-parser` | `3.3.1`; integrity `sha512-HUgH65KyejrUFPvHFPbqOY0rsFip3Bo5wb4ngvdi1EpCYWUQDC5V+Y7mZws+DLkr4M//zQJoanu1SP+87Dv1oQ==`; MIT |
| `ajv` | `8.20.0`; integrity `sha512-Thbli+OlOj+iMPYFBVBfJ3OmCAnaSyNn4M1vz9T6Gka5Jt9ba/HIR56joy65tY6kx/FCF5VXNB819Y7/GUrBGA==`; MIT |
| `canonicalize` | `4.0.0`; integrity `sha512-FEdXzwWs+N3rZqEqpqleiY9M1A6IAf9oo1zHFABnLW9FcJ/jzsu+G/Ks3Hq3FglmPKe80GeGBw8ZXLEnwPB0vQ==`; Apache-2.0; `erdtman/canonicalize` |

### Hub and authentication

| Component | Exact identity / provenance |
| --- | --- |
| Fastify | `5.12.1`; integrity `sha512-FWi+tQvwxR/PeRX7Z2mhfEF5ozJ3jn9asiiclzKXNSzJRHAYcU924aIOKAdHFJ+YIKieh3cqr1IwCOvTr41B3Q==`; MIT |
| `@fastify/cookie` | `11.1.2`; integrity `sha512-Dtrpk/YOGUsbRMvP/8ZqPpwnMRv0qSqodFdoQ2B589Obc7jw4s4Qla+cV72Bsm7WsZJnqlYFX/i7uSBq0xzg6g==` |
| `@fastify/helmet` | `13.1.1`; integrity `sha512-bSat5DTq8geASv8G6P0KW1UbltZ+xGD/zyd9S72pT7ogAHehcsWL85GdjMRCjDsExJvaEvgEZ52qU/2HXirVCw==` |
| `@fastify/static` | `10.1.3`; integrity `sha512-W6jqajYS974XjPjB5hQWoxPM8NKM4+p8YmQT6G5IbCa4uhdWSVadZUv75siy1wEA/3ty8RYdpBydfWeu9AqAqQ==` |
| `openid-client` | `6.8.7`; integrity `sha512-gtKthNu7evSBvTdrrlHb4F3Fi9dcwlb5QaITlCs+9mfpvuOi0Q3qtBf5+iY4sEP8hy1qCoAdxBNPDcmZeVSDzQ==`; MIT |
| Keycloak | `26.7.2`; source tag commit `289376b142480b4d600aca7acb1e4651862ed2a1`; OCI index `sha256:9d1f1b2b7261ff53c66cb1092dfcdc34a5fb77e81f9e6a6e75b8b6a795de8067`; Linux amd64 manifest `sha256:c2a17fe407e892196d0b7cf9cef54e60952d6c372a9205f661a9efa0911463b0` |

Probe admission pins the exact Linux amd64 manifest; the mutable tag cannot
execute.

### Browser host

| Component | Exact version |
| --- | --- |
| `react`, `react-dom` | `19.2.8` |
| `vite` | `8.2.2` |
| `@vitejs/plugin-react` | `6.1.1` |
| `@tanstack/react-router` | `1.170.32` |
| `@tanstack/router-plugin` | `1.168.35` with peer `@tanstack/react-router ^1.170.32` |
| `@tanstack/react-query` | `5.102.8` |
| Type packages | `@types/node 24.13.3`, `@types/react 19.2.18`, `@types/react-dom 19.2.5` |

### Persistence and gates

| Component | Exact identity |
| --- | --- |
| PostgreSQL | `17.10`; source tag commit `25c49f3a4a742ba283f5cc43cc7f1d361552e917` |
| `pg` | `8.23.0`; integrity `sha512-Ip2EQCngowJLGOfCwkFhPXU7/ljlhn6Rxlmy4XYfL2Y+vyRM59+8uR2xqRWKdYmbXmxCFOAmKxBuSUCdF34qLg==`; MIT |
| Atlas Community | `1.3.0`; source tag commit `9a6bc601212130aaaefcbc8dd36c710baf9716ff`; Linux amd64 community executable SHA-256 `10d7913e3dce43ab99b8d71534a4cbadaf11a16dc293adf3b91d10e83a0ac70b`; primary/fallback bytes equal |
| Biome | `2.5.11`; integrity `sha512-Tj0dnkLPdW0ASjHfj2D/ZkkvPU2wrFmnE1jWTD2xzV1ycapV1DutbYXk4NDnR3rYTi1ZCbNFD4G2gRMEY65WaA==` |
| Playwright | `@playwright/test 1.62.1`; integrity `sha512-DTcUc8qii+cpHvtOwggMtBRMjKZHXYWdw8syRYu2vtzuq4Wxphqq4NfCs5Zt44L6mA8rfDfj+PHnxFc/FeK6mQ==`; exact Chromium `1234`, Firefox `1538`, WebKit `2336` and supporting archive SHA-256 pins live in the manifest |
| Wire lint | `@redocly/cli 2.47.0`; integrity `sha512-4sv638LZxiUSsNGqfWPzA2hrNM4KrNRc9jOaH9igqDJlZimiGCYliVpbdrWvfL/YlaSnIBpJE1O1CveXDYTTWw==` |
| Schema gate | bounded Conexus Node adapter over `Ajv 8.20.0` + `ajv-formats 3.0.1`; `ajv-cli` removed by operator-approved `R1F-A01` |

Exact browser and executable bytes are admitted only by the machine manifest;
package/source version alone remains insufficient.

## 3. `R1F-01` — Node/npm/supply chain

**Outcome:** `ADOPT Node 24.20.0 + npm 12.0.2 / ADAPT strict admission`.

```text
deciding build runtime = Linux x64 + exact Node/npm identities
development hosts      = non-deciding convenience
canonical graph        = one package-lock, lockfileVersion 3
install                = npm ci only
```

Controls:

- `package.json`/lock mismatch fails;
- no floating ranges in admitted direct pins;
- no Git/file/remote dependency without an exact separately approved exception;
- npm patch/package-extension features that would require lockfile v4 are not
  admitted in R1;
- inspection install uses `--ignore-scripts`;
- script-enabled install first derives the exact package script census and
  requires a root allowlist with strict refusal;
- registry/source configuration is pinned;
- `npm audit signatures` verifies available registry signature/provenance;
- missing provenance remains explicit; it is not automatic rejection or success;
- no `audit fix`, auto-admission, auto-merge or unreviewed lock rewrite;
- all future R1 gate tools are exact dev dependencies in the canonical lock;
  current planning-time `npx --yes` scripts must be replaced in the implementation
  checkpoint before they can count as admitted gates;
- `.nvmrc`, `package.json.engines`, build image and admission receipt repin to
  exact Node `24.20.0` + npm `12.0.2` together;
- deterministic tree proof compares the Linux x64 deciding lock/install;
  platform-gated optional native packages on developer hosts are separately
  inventoried and cannot change the deciding Release tree;
- SBOM/build-attestation tooling remains R6-bound; package-lock inventory is
  sufficient for R1 admission Evidence.

Node `24.20.x` security releases may replace the patch after exact repin and
affected-property proof. Node 26/current is not admitted without an LTS/consumer
trigger.

## 4. `R1F-02` — strict Draft 2020-12 validation

**Outcome:** `ADAPT jsonc-parser 3.3.1 + Ajv 8.20.0`.

```text
raw bytes + fatal UTF-8 decode / BOM refusal
→ strict jsonc syntax tree (comments/trailing commas disabled)
→ duplicate-key + lone-surrogate + depth/size preflight
→ ordinary JSON value
→ Ajv2020 strict schema validation
→ admitted value + exact validation Evidence
```

Invalid UTF-8, a UTF-8 BOM and any non-UTF-8 input fail before syntax parsing.
Ajv configuration law:

```text
strict = true
strictSchema = true
strictTypes = true
allErrors = true for admission diagnostics
coerceTypes = false
useDefaults = false
removeAdditional = false
```

Validation never mutates input. Unknown format semantics are not added unless
the exact schema owns and tests them. `ajv-formats` remains limited to canonical
wire schemas that already declare those formats.

Ajv standalone code generation is not needed for R1 and remains deferred unless
runtime startup/performance Evidence fires.

## 5. `R1F-03` — RFC 8785 canonicalization

**Outcome:** `ADAPT canonicalize 4.0.0 behind RF-12 port`.

Only an R1F-02-admitted I-JSON value reaches canonicalization. Profile/input v1
schemas forbid floating numbers and restrict integers to the ECMAScript safe
integer range; no current profile consumer requires floating-point input.

The port:

- produces exact UTF-8 RFC 8785 bytes;
- rejects values outside admitted I-JSON/schema rather than normalizing them;
- has no `toJSON`, custom class, environment or time input;
- runs official RFC vectors plus duplicate/Unicode/safe-integer RED controls;
- is replaceable only through byte-for-byte vector/equivalence proof.

The dependency avoids handwritten recursive property ordering, JSON string
escaping and ECMAScript number-serialization edge behavior. Its small size does
not waive provenance or equivalence proof.

Canonicalization and validation remain independent verdicts despite sharing one
admission pipeline.

## 6. `R1F-04` — Hub, OIDC and session

**Outcome:** `ADAPT Fastify + openid-client + Keycloak`.

### HTTP boundary

- generated canonical 4B route registry plugs into Fastify;
- Fastify plugin encapsulation may group adapters but never owns module/owner
  topology;
- one custom `validatorCompiler` uses the R1F-02 Ajv instance;
- default coercion/default/removal behavior is forbidden;
- handler outputs are owner DTOs validated before serialization; serializer
  convenience cannot hide output-contract violations;
- the root composition installs exactly one R1F-02 validator compiler before
  registering generated routes; application/plugins receive no setter-capable
  Fastify instance, and static/runtime controls refuse a second compiler or any
  route using Fastify's mutating defaults;
- `inject` supports isolated HTTP proof; `listen` waits for admitted readiness;
- shutdown stops new admission and closes resources idempotently.

### OIDC/session boundary

```text
exact Keycloak 26.7.2 issuer
→ openid-client 6.8.7 discovery with issuer validation
→ confidential Authorization Code + PKCE S256 + state + nonce
→ verified ID Token issuer/audience/signature/expiry/nonce
→ exact (issuer, subject) Account mapping
→ opaque Conexus server session
```

- implicit and direct/password grants disabled;
- exact redirect URI and client identity server-controlled;
- Keycloak roles/groups/Authorization Services ignored for Product authority;
- provider tokens never enter browser Product authority or durable session truth;
- `@fastify/cookie` carries only opaque `HttpOnly`, `Secure`, `SameSite=Lax`
  session identity;
- unsafe same-origin commands additionally require server-controlled Origin/
  Fetch-Metadata and anti-CSRF checks;
- `@fastify/helmet` provides reviewed CSP/security headers;
- `@fastify/static` serves exact Vite manifest-addressed bytes only for admitted
  R1 host paths; possession of a path is not authorization.

### Conexus session and bootstrap

- session truth is the existing PostgreSQL `iam.session` owner record, shared by
  Hub processes but isolated from Keycloak persistence;
- the browser receives a 256-bit cryptographically random opaque identifier;
  only its SHA-256 digest is stored server-side;
- candidate policy is `30m` idle / `8h` absolute expiry, rotation on successful
  authentication and immediate server-side revocation for `IAM-02 EndSession`;
- every protected request rechecks session validity and current Conexus owner
  authority; Keycloak roles/logout do not mutate Conexus session truth;
- `TRUSTED_BOOTSTRAP_CONTEXT` accepts only the exact configured `(issuer,sub)`
  while no Account maps it, reaches only `IAM-03`, provisions only itself and
  invalidates immediately; repeat/other-subject/normal-route attempts fail;
- DB passwords, Keycloak client secret and cookie/CSRF key enter through a
  server-only secret-file provider: environment/config carries only an absolute
  file reference, files are outside repo/artifacts/Evidence, read with restrictive
  permissions, never logged and replaceable later by production secret-file
  mechanisms without changing the consumer boundary.

Global Keycloak logout/back-channel logout is not selected: C-015 explicitly
owns Conexus session termination independently. A real SSO/global-logout
requirement must reopen C-015.

Keycloak tag/source is selected; exact image digest, realm/client export and
upgrade compatibility are probe-admission Evidence.

## 7. `R1F-05` — browser foundation

**Outcome:** `ADOPT React/Vite/TanStack + native CSS`.

```text
React root + exact route tree
→ generated Product transport
→ owner-scoped TanStack Query projection
→ app/platform-owned composition
```

- TanStack Router route tree is `GENERATED`; URL coordinates remain references;
- search params are validated and never authorization;
- Query keys include exact owner coordinates and operation meaning;
- mutation retries remain `0`; query retries are bounded only for safe reads;
- owner commands invalidate/refetch instead of making cache canonical;
- Vite manifest and hashed assets enter later Release identity;
- only explicitly public `VITE_*` build values exist; secrets/runtime authority
  never enter browser bundles;
- native CSS custom properties + CSS Modules are the R1 styling baseline;
- no Redux/Zustand/global business store, Tailwind, component registry, React
  Aria/Base UI/Radix or universal design-system dependency in R1;
- native semantic controls and P13 structure are sufficient for the minimum R1
  shell; repeated complex widget Evidence may reopen primitives later.

## 8. `R1F-06` — PostgreSQL, migrations and CR-1

**Outcomes:** `ADOPT pg`, `ADAPT Atlas Community`, `PRESERVE_SEAM CR-1 TO R6`.

```text
PostgreSQL 17.10
→ one pg Pool per physical owner/role boundary
→ explicit owner-local SQL and parameterized queries
→ exact same checked-out client for every transaction
```

- no ORM, generic Repository or cross-owner UnitOfWork;
- Kysely remains a later owner-local challenger only if typed-query complexity
  becomes material;
- migration source is exact reviewed PostgreSQL SQL in Git;
- Atlas Community versioned workflow supplies `atlas.sum`, lint/status/validate/
  apply and real schema inspection;
- declarative apply, cloud/registry, auto-remediation and paid-only features are
  not authority or R1 requirements;
- BuildValidationDatabase rehearsal precedes any real target apply;
- production down migration remains forbidden as Release rollback.

The CR-1 selected contract uses one narrow I&A-owned `SECURITY DEFINER` function
invoked inside the consuming-owner transaction:

- exact current subject/Workspace/Project/action inputs only;
- fixed trusted `search_path`, `pg_temp` last;
- function owner is non-login and narrowly privileged;
- `PUBLIC EXECUTE` revoked in the same creation transaction;
- caller receives only `EXECUTE`, never I&A table/role access;
- it locks every supporting mutable authority row in canonical order with
  explicit row locks held by the same checked-out client/transaction;
- invalid/revoked authority or concurrent narrowing conflicts/aborts the owner
  mutation.

The reachability map proves no R1 operation exercises the CR-1 concurrent-
narrowing consumer: representative `PromoteRelease` first appears in R6.
Therefore R1 selects/preserves the contract only. Function implementation and
real CR-1 race proof move to the R6 tranche; R1 proves owner/store isolation and
ordinary transaction capability only.

## 9. `R1F-07` — proportional R1 gates

**Outcome:** `ADOPT small complementary gate set`.

Required:

```text
Biome ci                        → format/lint/assist drift, no writes
TypeScript 6.0.2 --noEmit       → strict type gate
Vite production build          → exact browser build/manifest
node --test                     → compiler/backend/unit/integration
Playwright                      → real browser/session/P13 negative paths
Redocly + bounded Ajv adapter   → canonical wire/schema checks
existing repository checks      → operation/owner/status/provenance guards
```

TypeScript profiles:

- Node packages use `module/moduleResolution = NodeNext`;
- Vite/browser packages use `module = ESNext`, `moduleResolution = Bundler`;
- `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
  `noImplicitOverride`, `useUnknownInCatchVariables` and
  `forceConsistentCasingInFileNames` enabled;
- `skipLibCheck` is not accepted as a substitute for owned boundary type proof;
  any bounded use must be justified against exact third-party declaration drift.

Playwright:

- Chromium is the ordinary required browser gate;
- Firefox/WebKit run at R1 readiness and on affected browser/security changes;
- browser binaries are installed/pinned only under the later probe grant;
- traces/screenshots/ARIA snapshots are Evidence, never acceptance authority.

Vitest is `DEFER`: R1 does not need a second unit runner. React behavior is
proved through pure owner/state tests in Node plus real browser Playwright.

## 10. Compatibility and absence decisions

```text
Node 24.20.0 satisfies npm/Fastify/Vite/Router/Playwright engines
React 19.2.8 satisfies Router/Query peers
Ajv 8.20.0 satisfies ajv-formats peer range; the gate adapter uses the exact same validator
PostgreSQL 17.10 + pg 8.23.0 preserve accepted architecture
```

Not admitted in R1:

- TypeScript 7, Vitest, ORM, Kysely, Tailwind, headless primitive/design system,
  Redux-like store, generic DI/module framework, Keycloak authorization services,
  SBOM/signing platform, remote migration/cloud control plane or workflow engine.

Absence is not permanent rejection. Each has a named consumer/falsifier route.

## 11. Proof obligations before any R1 execution grant

Selection approval does not satisfy these proofs. A separate operator probe
grant is required.

| Proof | Firing property |
| --- | --- |
| `R1F-P01` | clean exact Node/npm environment reproduces one lock/tree; mismatched/floating/alternate registry input fails |
| `R1F-P02` | install-script census/allowlist and signature/provenance failures stop admission |
| `R1F-P03` | invalid UTF-8/BOM, duplicate key, comment, trailing comma, lone surrogate, unsafe number and schema violation all fail before canonicalization |
| `R1F-P04` | RFC 8785 vectors reproduce exact bytes; validator and canonicalizer replacement equivalence fires |
| `R1F-P05` | generated Fastify route census is exact, one root validator is sealed and plugin/default fallback cannot mutate data |
| `R1F-P06` | forged issuer/audience/signature/state/nonce/PKCE/redirect or Keycloak role grants no Conexus session/authority |
| `R1F-P07` | PostgreSQL session expiry/rotation/EndSession, one-shot bootstrap, secret redaction and revoked/cross-Workspace/app-vs-Control-Plane access fail correctly |
| `R1F-P08` | browser bundle contains no secret/authority and cache/URL state cannot manufacture owner truth |
| `R1F-P09` | pg roles deny cross-owner/store/SET ROLE/object-owner/superuser/BYPASSRLS access; R1 creates no CR-1 function |
| `R1F-P10` | migration checksum/edit/order/role/schema drift fails before target admission |
| `R1F-P11` | Linux deciding lock/tree is reproducible while developer-host optional-native delta is explicit and non-authoritative |
| `R1F-P12` | Biome/type/build/unit/schema/browser negative fixtures each make their exact gate red |

## 12. Upgrade and reopen law

- exact lock/source/runtime/browser/image identities are rechecked before probe
  and later implementation admission;
- a security release may replace a patch through bounded source/advisory and
  affected-property proof without reopening the whole batch;
- major Node, TypeScript, React, Vite, Fastify, Keycloak or PostgreSQL changes
  reopen only their compatibility/proof row;
- RF-12A reopens RF-01 if combined custom admission/canonicalization cost makes
  the selected BUILD boundary materially worse than the Nx `ADAPT` alternative;
- real probes may return `STOP` for one row without granting another row;
- package presence in qualification `node_modules` remains irrelevant to
  admission.
- before probe grant, emit one machine-checkable pin manifest containing every
  selected package/source/runtime/browser/tool identity and expected integrity;
  prose tables alone are not admission Evidence.

The current candidate pin manifest is
[`conexus.r1-foundation-pin-manifest/v1`](4d-r1-foundation-pin-manifest.json).
It records `P01_P12_GREEN_OPERATOR_APPROVED`: exact npm/source/
image/executable/browser identities passed Pack A, strict profile/compiler
mechanics passed Pack B and real local HTTP/OIDC/session mechanics passed Pack C;
three-browser foundation mechanics passed Pack D; no later functional probe is
implied. Real PostgreSQL owner/store and Atlas migration admission passed Pack E;
Linux reproducibility and proportional RED/GREEN gates passed Pack F.

## 13. Approval and downstream route

```text
R1F-01..07 = CLOSED / OPERATOR APPROVED / 2026-08-30
R1 Foundation selection batch = CLOSED
pin manifest = P01_P12_GREEN_OPERATOR_APPROVED
R1 Foundation Probe Grant = OPERATOR APPROVED
R1F-A01 = CORRECTED / PACK A PASS
R1F-P03/P04 = PACK B PASS
R1F-P05/P06/P07 = PACK C PASS
R1F-P08 = PACK D PASS / CHROMIUM+FIREFOX+WEBKIT
R1F-P09/P10 = PACK E PASS / R1F-E01 CORRECTED
R1F-P11/P12 = PACK F PASS
R1 Foundation Probe Evidence = OPERATOR APPROVED / 2026-08-30
Product implementation authority = 0
```

Only isolated qualification dependencies and admission probes executed under
the grant. No Product/runtime implementation executed. Product implementation,
push, PR and merge remain unauthorized.
