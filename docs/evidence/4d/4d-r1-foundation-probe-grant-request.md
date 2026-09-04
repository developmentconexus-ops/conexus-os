# 4D — R1 Foundation Probe Grant request

Status: **APPROVED / OPERATOR APPROVED / 2026-08-30 / PROBE EXECUTION AUTHORIZED / PRODUCT IMPLEMENTATION BLOCKED**

Date: `2026-08-30`

This document records one operator-approved, bounded Evidence-only grant for
the approved `R1F-01..07` foundation selection. It authorizes only the exact
downloads, installs, process/container startup and probe execution below. It
does not authorize Product code.

The grant is intentionally separate from every R1 Product implementation or
tranche execution grant. A successful probe proves only the named mechanics;
it cannot grant implementation or change accepted Product authority.

## 1. Requested decision

The operator selected exactly:

```text
APPROVE R1 FOUNDATION PROBE GRANT / 2026-08-30
```

The approval authorizes only the scope, effects, budgets and cleanup in this
document. It does not authorize Product implementation, another runtime
family, paid services, live providers, push, PR or merge.

## 2. Inputs and fixed boundaries

The probe batch derives only from:

- the approved [R1 Foundation Batch](4d-r1-foundation-batch.md);
- the approved [R1 Foundation selection](4d-r1-foundation-selection-candidate.md);
- the candidate [machine-checkable pin manifest](4d-r1-foundation-pin-manifest.json);
- the converged [independent review](4d-r1-foundation-independent-review-adjudication.md);
- the accepted RF-01 compiler and 4D-A/B ownership contracts.

It may test an accepted claim. It may not repair a failed claim by inventing
Product meaning, changing an owner, selecting a new framework or writing into
the root/Product dependency graph.

## 3. Isolation and custody

Durable probe source and sanitized Evidence will live only under:

```text
qualification/4d/r1-foundation/
  README.md
  admission/
  profile-compiler/
  http-identity-session/
  browser-foundation/
  postgres-migrations/
  gates/
  evidence/
```

Rules:

- zero root/Product runtime dependency;
- no import from Product source and no mutation of Product manifests or locks;
- qualification manifests and exact locks are local to this tree;
- installs and mutable runtime data use a newly created OS temporary directory,
  never a retained workspace `node_modules`;
- all bound ports use loopback and are dynamically allocated;
- all realms, clients, users, roles, databases, schemas, volumes and credentials
  are synthetic and unique to the run;
- qualification code is disposable Evidence harness code, not a reusable
  Product implementation seed.

Example: the HTTP harness may register one generated fixture route to prove the
Fastify adapter rejects mutated input. It may not create the real Conexus Hub.

## 4. Admission phase — exact pin re-verification

Before any executable probe, admission must re-fetch and independently verify:

1. Linux x64 Node `24.20.0` archive SHA-256 and bundled/selected npm `12.0.2`;
2. all `25` corrected direct npm name/version/integrity rows;
3. a clean lockfile v3 and complete transitive tree from the configured official
   npm registry, with no floating selector or alternate registry;
4. package tarball integrity, registry signature/provenance when published,
   license and current advisory disposition;
5. lifecycle-script census and an explicit deny-by-default npm allow-scripts
   policy;
6. Keycloak `26.7.2`, PostgreSQL `17.10` and Atlas Community `1.3.0` source
   identities against their selected commits;
7. immutable SHA-256 digests for the exact Keycloak runtime image, Atlas
   executable and Playwright Chromium/Firefox/WebKit builds.

Admission writes an immutable observed-input receipt. Any missing, ambiguous or
mismatched identity is `FAIL` and stops the affected pack before execution.
Resolution of an image tag to a digest is discovery Evidence; execution always
uses the digest, never the mutable tag.

Example: if `keycloak:26.7.2` resolves to digest `D`, the harness records `D` and
starts only `image@D`. A later resolution to another digest does not silently
pass.

## 5. Real dependency substrates

Synthetic mocks cannot satisfy integration claims. After admission, the grant
would permit these exact local, non-production substrates:

| Pack | Real substrate | Permitted use |
| --- | --- | --- |
| admission/compiler/gates | admitted Linux x64 Node/npm tree | clean installs, build, validation, canonicalization and negative gate fixtures |
| identity/session | digest-pinned Keycloak `26.7.2` plus PostgreSQL `17.10` | one ephemeral realm/client/account set and Conexus-owned session/bootstrap fixture records |
| browser | digest-pinned Playwright Chromium, Firefox and WebKit | localhost-only interaction/security checks against the qualification harness |
| persistence/migrations | PostgreSQL `17.10`, `pg 8.23.0` and digest-pinned Atlas Community `1.3.0` | ephemeral roles/databases/schemas, owner isolation and versioned migration checks |

Container use is allowed only when the admitted digest is exact. Host binaries
are allowed only when their archive/executable digest is exact. Docker/WSL is
transport, not Evidence or authority.

No model, Mastra, E2B, Sankhya, cloud control plane, remote database, paid API or
real organizational account is in scope.

## 6. Probe packs and negative controls

Every proof emits `PASS | FAIL | INCONCLUSIVE | NOT_PROVEN`. Missing Evidence is
never `PASS`.

### Pack A — dependency admission

- `R1F-P01`: reproduce one exact Linux lock/tree from a clean temporary install;
  reject a changed version, floating selector, integrity mismatch and alternate
  registry.
- `R1F-P02`: enumerate every lifecycle script; reject an unapproved script and
  missing/invalid available signature or provenance. Record unavailable
  provenance as an explicit admission fact, not an invented success.

### Pack B — profile admission and compiler mechanics

- `R1F-P03`: reject invalid UTF-8, BOM, duplicate key, comment, trailing comma,
  lone surrogate, unsafe number and schema violation before canonicalization.
- `R1F-P04`: reproduce RFC 8785 vectors byte-for-byte and run validator plus
  canonicalizer replacement-equivalence controls.
- bounded RF-01 mechanics: deterministic `GenerationPlan`, exclusive lock,
  digest preconditions, ignored/untracked/symlink census, receipt and safe
  regeneration are exercised only with fixture profiles and fixture trees.

Example: two identical fixture profiles must produce the same plan digest; an
edited APP-OWNED fixture must make regeneration stop instead of overwrite it.

### Pack C — HTTP, identity, session and bootstrap

- `R1F-P05`: prove an exact generated fixture-route census, one sealed root Ajv
  validator and refusal of plugin/default fallback that coerces, defaults or
  removes input.
- `R1F-P06`: against real Keycloak, reject forged issuer, audience, signature,
  state, nonce, PKCE and redirect; prove a Keycloak role alone grants neither a
  Conexus session nor Product authority.
- `R1F-P07`: against real PostgreSQL, prove opaque session digest custody,
  rotation, idle/absolute expiry, `IAM-02` termination, one-shot exact-subject
  bootstrap, secret redaction and denied revoked/cross-Workspace/app-vs-Control-
  Plane access.

Example: adding an `admin` Keycloak role still leaves a user without the
corresponding Conexus grant denied.

### Pack D — browser foundation

- `R1F-P08`: build one minimal React/Vite/TanStack fixture and prove bundles
  contain no server secret/authority; URL/search/cache mutation cannot create
  owner truth; Origin/Fetch-Metadata/CSRF failures are denied. Chromium is the
  ordinary path; Firefox and WebKit close readiness compatibility.

Example: changing `?workspaceId=other` may change a requested coordinate, but
the server still denies access because the URL is not authorization.

### Pack E — PostgreSQL and migrations

- `R1F-P09`: prove real roles deny cross-owner/store access, `SET ROLE`, object
  ownership, superuser and `BYPASSRLS`; assert R1 creates no CR-1 function.
- `R1F-P10`: prove edited checksum, reordered migration and role/schema drift
  stop before target admission.

CR-1 implementation and its concurrent-narrowing race remain R6 work because
R1 has no consuming operation. This probe must not build it early.

### Pack F — deciding platform and proportional gates

- `R1F-P11`: reproduce the deciding Linux lock/tree and record any optional-
  native developer-host delta as explicit and non-authoritative.
- `R1F-P12`: make each Biome, TypeScript, Vite build, Node test, Redocly/Ajv and
  Playwright negative fixture turn its exact gate red, then prove the clean
  fixture green.

## 7. Allowed external and local effects

Under this approval, the probe executor may:

- read official registries, source hosts and advisory/license/provenance sources;
- download only admitted archives, npm tarballs, images, executables and browser
  builds needed above;
- create the isolated qualification tree and OS temporary run directories;
- start/stop digest-pinned local containers/processes on loopback;
- create/drop synthetic Keycloak and PostgreSQL state;
- generate ephemeral high-entropy credentials and secret files with restrictive
  permissions;
- write sanitized durable Evidence under the isolated qualification tree.

It may not:

- access production, staging, customer networks/data, real providers or real
  organization identity tenants;
- send email/messages, publish packages/images, deploy, create cloud resources or
  incur paid usage;
- use or persist a real secret, token, cookie, user datum or connection string;
- modify root dependencies, Product code, accepted owners/contracts or unrelated
  qualification trees;
- push, open a PR or merge.

Budget: no monetary spend; one local run envelope of at most `10 GiB` additional
disk, `8 GiB` RAM and `6` concurrent local containers/processes. Exceeding it is
`STOP` pending a revised grant.

## 8. Cleanup and recovery

Each pack owns an idempotent cleanup path. On pass, failure or interruption it
must:

1. stop its local processes/containers;
2. remove ephemeral realm/client/users, databases/schemas/roles, volumes,
   networks, temporary installs and secret files;
3. verify no qualification listener remains bound;
4. retain no workspace `node_modules`, credential or mutable database state;
5. report any cleanup failure as `FAIL`, never hide it behind probe success.

Immutable downloaded container/browser/tool caches may remain in the user's
local shared cache to avoid repeated downloads, but the Evidence must list them
and provide exact removal instructions. They are not repository state and do
not count as proof.

## 9. Durable Evidence outputs

The batch must retain, without secrets:

```text
README.md                         reproduction and claim limits
admission/input-receipt.json      exact observed pins/digests/sources
admission/package-lock.json       clean qualification-only lock
admission/script-census.json      lifecycle scripts + explicit decisions
admission/supply-chain.json       integrity/provenance/license/advisory facts
evidence/environment.json         OS/arch/runtime/container/browser fingerprint
evidence/results.json             P01..P12 verdicts and artifact digests
evidence/negative-controls.json   expected failure → observed failure mapping
evidence/cleanup.json             destroyed/retained resources and verification
evidence/summary.md               claims proved, failed, inconclusive, not proved
```

Probe source, schemas, migrations and fixtures required to reproduce the result
are also durable. Logs are sanitized and content-addressed. Tokens, cookies,
passwords, private keys and raw secret files are forbidden Evidence.

## 10. Stop and reopen conditions

Stop the affected pack and return to the smallest owner when:

- an exact pin, integrity, source identity, compatibility, license or current
  material advisory cannot be admitted;
- a required real substrate or negative control cannot be exercised;
- proof would require Product/root dependency, owner/contract change, a new
  dependency or an unrelated runtime family;
- an unexpected install script or network destination appears;
- a probe would require CR-1 implementation before its R6 consumer;
- a paid, live-provider, production or real-secret effect becomes necessary;
- cleanup cannot restore the declared local boundary.

One failed row does not silently invalidate or approve another row. The output
identifies the smallest selection/property that must be revised.

## 11. Exit and non-grants

The probe batch is complete only when all `R1F-P01..P12` have an explicit
verdict, every allowed effect is accounted for, cleanup is verified and required
Evidence is reproducible from exact pins.

Even a fully green batch grants none of the following:

```text
Product implementation = 0
R1 tranche execution = 0
unrelated RF selection/probe = 0
production/live-provider effect = 0
push / PR / merge = 0
```

Execution began with Pack A and proceeds one adjudicable pack at a time. Current
status and the only open next pack are owned by the roadmap; prior pack success
does not authorize Product implementation.
