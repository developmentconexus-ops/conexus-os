# 4F(R1) — Code architecture directed convergence proposal

> **Status:** `OPERATOR APPROVED / CORRECTION CONVERGED / A0-P1 OPEN`
> **Scope:** `A0 CODE ARCHITECTURE CONFORMANCE BEFORE S2`
> **Implementation authority:** `A0 ONLY UNTIL PASS`

## 1. Lead resolution

Insert one engineering-only, independently granted boundary before S2:

```text
S1 PASS
→ A0 Code Architecture Conformance
→ separate S2 grant
→ S2 unchanged
```

`A0` realizes zero Product operations, creates zero Product records/tables,
changes zero Product semantics and enters no R2–R7 owner. Its purpose is to make
the already-approved S2 mechanics unambiguous while the Hub is still small.

The selected structure is a pragmatic hybrid:

- `apps/hub` and `apps/web` remain the two deployable composition roots;
- semantic owners are vertical modules inside the owning app;
- only a stable primitive with at least two current consumers may live in
  `packages/`;
- no generic `shared`, `common`, Repository, Service, Store, UnitOfWork, base
  handler, event bus or operation framework exists;
- import law and public surfaces are executable repository properties;
- future packages/processes appear only on named triggers.

## 2. Exact A0 target tree

```text
apps/
  hub/
    migrations/
      001_iam_foundation.sql              # unchanged bytes and ownership
    public/                               # generated browser build; rebuilt, not hand edited
    src/
      server.ts                           # sole process/composition root
      http/
        app.ts                            # Fastify/Ajv/cookie/helmet/static host only
        problem.ts                        # RFC 9457 emitter only
      identity-access/
        module.ts                         # narrow composition API
        routes.ts                         # OIDC + IAM-01..03 HTTP adapter
        store.ts                          # exact iam.* commands/queries; no raw query
        oidc.ts                           # exact openid-client adapter
        errors.ts                         # owner-local discriminated codes
      platform/
        config.ts                         # environment admission
        secrets.ts                        # restrictive secret-file mechanics
        postgres.ts                       # pool/client construction only
      generated/
        s1-routes.ts                      # generated; no handwritten DTO twin
    tsconfig.json
  web/
    index.html
    vite.config.mjs
    src/
      main.tsx                            # S1 behavior retained at A0
      styles.css
      generated/iam-client.ts
    tsconfig.json
packages/
  canonical-json/
    src/index.mjs                         # canonicalBytes + sha256, public entry only
    src/index.d.mts                       # package-owned strict declaration
  profile-compiler/
    schemas/*
    src/{admission,compiler,index}.mjs
scripts/
  check-import-law.mjs
  record-r1-a0-receipt.mjs
tests/
  repository/import-law.test.mjs
  implementation/r1-a0-admission.test.mjs
runtime/
  r1/generated/r1/operations.{json,mjs}  # retained G0 census/output
  r1/.conexus/a0-{ownership-manifest,generation-receipt}.json
profiles/
  r1/v1/a0-code-architecture-migration.json
tsconfig.base.json
biome.json
```

The tree above is exact for persisted Product/G0 production inputs and outputs
affected by A0. Existing tests, scripts, profiles and evidence outside the named
paths persist unchanged unless the A0 proof contract explicitly names them.

No empty Workspace/Project/Git/Mastra/R2–R7 directory or port is created by A0.
The engineering profile compiler may remain `.mjs`; the Product Hub becomes
strict TypeScript now because the architecture already selects a
Node/TypeScript Hub and delaying through S2–S6 multiplies migration risk.

The Hub build uses the already-pinned TypeScript `6.0.2`, ESM `NodeNext`, `.js`
source specifiers, `strict`, `noUncheckedIndexedAccess`,
`exactOptionalPropertyTypes`, `useUnknownInCatchVariables` and an untracked
build output. `@types/pg` is a known missing type dependency and must receive an
exact Foundation admission/pin under an A0 execution grant before conversion;
it is not installed by this planning event. If that admission fails, A0 stops;
it does not weaken type checking or add a handwritten ambient `pg` facade.

Exact execution Evidence exposed one declaration-only incompatibility in the
adopted `openid-client 6.8.7`: its `Configuration.timeout` implementation type
is `number | undefined` while the implemented optional interface is
incompatible under `exactOptionalPropertyTypes`. A0 may use
`skipLibCheck: true` only as the bounded declaration waiver permitted by the
Foundation contract:

- all owned Hub source remains under every selected strict flag;
- the exact `openid-client` lock/source/integrity remains pinned;
- a standing declaration-drift probe runs `skipLibCheck: false` in every
  `npm run verify` and must observe exactly the admitted fingerprint: the exact
  TypeScript diagnostic code, declaring module path and symbol
  `openid-client Configuration.timeout`;
- any lockfile, TypeScript configuration or dependency change reruns that probe;
  a changed, additional or zero fingerprint invalidates the waiver and stops the
  boundary for explicit waiver removal or redecision;
- a temporary declaration RED fixture introduces a distinct dependency
  declaration diagnostic and must make the probe stop on the changed
  fingerprint before the control is accepted;
- owned adapter compile tests and Pack C runtime/cryptographic negatives remain
  required. `skipLibCheck` is not proof of the adapter boundary.

The web becomes strictly typechecked TypeScript/Vite with
`moduleResolution: Bundler`, `skipLibCheck: false` and no emit;
`apps/web/tsconfig.json` is new.
Generated sources and built browser assets remain excluded from Biome mutation
as their generators own them.

`packages/canonical-json/src/index.d.mts` is the module-owned type surface for
its `.mjs` runtime entry. It is checked by the strict Hub compile and runtime
canonicalization/digest fixtures. This is not a handwritten ambient facade for
an external library. A0 must not proceed with an untyped import or `any` escape.

The Hub no longer imports the untyped
`runtime/r1/generated/r1/operations.mjs`. The S1 generator reads canonical G0
`operations.json` at generation time, proves each selected owner/method/path
against the dereferenced Product OpenAPI and emits the exact typed server route,
request/header/query/body/response projection. G0 output bytes remain unchanged;
no handwritten DTO or untyped runtime census adapter is admitted.

The new web tsconfig includes `types: ["vite/client"]` so the existing owned CSS
side-effect import is checked without an ambient workaround.

## 3. Public module contracts

### 3.1 Backend composition API

`identity-access/module.ts` exports one builder whose returned surface is named,
not generic:

```text
createIdentityAccessModule(dependencies) → {
  registerIdentityAccessRoutes(app),
  resolveCurrentSession(request),
  close()
}
```

The internal store exposes only named IAM operations required by IAM-01..03 and
OIDC/session mechanics. It never exposes `query`, a pool, arbitrary transaction,
generic `save/find`, SQL text or an owner-role capability. Tests that need SQL
create their own harness pool.

`http/app.ts` accepts named route registrars and current-session middleware from
the composition root. It does not import an owner store. Fastify plugins remain
HTTP encapsulation tools; no per-owner plugin is created until an owner needs a
scoped hook/decorator or lifecycle.

Errors are owner-local discriminated values. Each owner HTTP adapter owns an
exhaustive mapping to stable RFC 9457 problem types/statuses. PostgreSQL errors
are translated at the owner store boundary. There is no universal domain error
class.

### 3.2 Import matrix

| From | May import | Must not import |
| --- | --- | --- |
| `server.ts` | owner `module.ts`, `http/app.ts`, exact platform constructors | owner internals, generated routes directly, compiler internals |
| `http/*` | Fastify/HTTP mechanics | owner stores, owner errors, database, compiler, `runtime/**` |
| `identity-access/routes.ts` | own module/errors, own generated route definitions, HTTP problem API | Workspace/Project, SQL text, compiler |
| `identity-access/store.ts` | own errors, platform postgres types, canonical-json | other owner, HTTP, generated routes, compiler |
| `platform/*` | exact technical library for that file | semantic owner, generated Product code |
| `generated/*` | only explicitly generated dependencies | owner internals, handwritten DTO/schema |
| `profile-compiler` | canonical-json and engineering inputs | any app/owner |
| `apps/web/src/**` | browser packages and web-generated clients | Hub, Node/server libraries, compiler/runtime internals |
| `tests/scripts` | public entries; internals only for named unit/negative harnesses | production may never import tests/scripts |

No broad barrel exists. `module.ts` and `packages/*/src/index.mjs` are narrow
public entries. `index.*` files that re-export a directory census are forbidden.

### 3.3 Objective enforcement

`scripts/check-import-law.mjs` uses the already-pinned TypeScript compiler API to
parse static and dynamic import edges in production trees. It checks:

- the matrix above;
- cycles;
- relative paths escaping their admitted owner;
- deep imports that bypass public entries;
- owner-to-owner edges;
- browser-to-server/Node edges;
- Product runtime-to-profile-compiler edges;
- imports from generated code into handwritten owner internals.
- imports from any `apps/**` production tree into `runtime/**`;
- every production dynamic import has a string-literal specifier; computed
  `import(variable)` is forbidden because it evades the static edge graph.

A temporary RED fixture for each rule, including a computed dynamic import and
an `apps/**` production import of `runtime/**`, must fail. The checker is
preferred over a new dependency at the current scale.
Adopt dependency-cruiser only if a named edge rule cannot be expressed reliably
with the TypeScript AST or the production graph exceeds the bounded checker's
documented capability. ArchUnitTS remains research only.

## 4. Exact S2 realization after A0

S2 adds only:

```text
apps/hub/migrations/002_workspace_foundation.sql
apps/hub/src/workspace/{module,routes,store,errors}.ts
apps/hub/src/generated/s2-routes.ts
apps/web/src/app/{router,query-client,shell}.tsx
apps/web/src/routes/{__root,index,setup,workspace-new}.tsx
apps/web/src/features/identity-access/api.ts
apps/web/src/features/workspace/{api,components/*}.tsx
apps/web/src/generated/workspace-client.ts
```

Workspace JavaScript/TypeScript never imports the I&A store/module. Its exact
WS-01 transaction checks out one client under `hub_ws01_command` and calls only:

```text
workspace.reserve_or_replay_create_workspace
workspace.create_workspace
iam.establish_workspace_creator_access
workspace.complete_create_workspace_receipt
```

This consumes the accepted initial-authority correction: creator receives only
Workspace membership/access plus `project.create`. The cross-owner atomicity is
inside enumerated owner SQL functions and the operation-specific EXECUTE-only
role, not a generic JS orchestration/repository capability.

The same rule carries forward to PRJ-03: `R1C-14` exact Git pin/probe first,
then the Project module owns its receipt/Git/settlement flow and invokes only the
accepted I&A grant function through `hub_prj03_command`. Git code remains
Project-owned and does not become a generic repository package.

Frontend state law at S2:

- TanStack Router owns navigation/URL state;
- TanStack Query owns remote server state and uses only feature adapters over
  generated clients;
- component state owns transient form/presentation state;
- no persisted browser authority or generic global store;
- sign-out/401 clears the query cache before re-entry;
- features never import another feature; routes/app shell compose them;
- direct imports replace broad barrels.

Router/Query files are selected now but created only with S2's first consumer,
so A0 creates no dormant frontend framework.

## 5. Later evolution without speculative implementation

| Mechanic | Reserved law | First execution trigger |
| --- | --- | --- |
| npm workspaces/package `exports`/TS project references | owner public entries already match future export maps | a module has a second deployable consumer, independent build, or resolver privacy that the checker cannot enforce |
| Fastify owner plugin | plugin is HTTP composition only | first owner-scoped decorator/hook/lifecycle |
| shared UI/design system | no generic component dump | second admitted Product surface and its owning 4D study |
| GitInfra | Project-private adapter | R1C-14 PASS immediately before S3 |
| ProjectMastra | Project-private stateless cognition adapter | R1C-13 PASS immediately before cognition-last S6 |
| Mastra pin/provider/telemetry | no dependency/directory/provider now | safe exact source/peer pin, closed provider entry, telemetry opt-out before import and zero-egress proof; separate real-call authority |
| process/package extraction | current public API becomes extraction seam | independent deployment/scale/failure/trust-boundary falsifier accepted by architecture owner |

Mastra requires ES2022 modules. At S6 the adopted exact version/source/types —
not current web docs or this plan — decide API shape. No storage, memory,
workflow, scorer, exporter, background task, MCP/A2A or provider fallback enters
through this architecture contract.

## 6. A0 mutation, proof and stop contract

### 6.0 Prior-receipt migration custody

Before the first production move or dependency mutation, A0-P1 publishes and
validates `conexus.r1-a0-code-architecture-migration/v1`. Its canonical plan
contains:

```text
migrationId + sourceRefs[path, digest]
priorS1ReceiptDigest + priorManifestDigest + g0ReceiptDigest
custodyScope[recursiveRoots[], exactFiles[]]
priorToolingPaths[path, digest]
oldToNew[oldPath, oldDigest, class, newPath, class, sourceRef]
changedPaths[path, priorDigest, class, sourceRef, transitionRef?, transitionRole?]
unchangedProtected[path, digest]
adoptedExistingPaths[path, preDigest, class, mutationLaw, sourceRef]
addedPaths[path, class, sourceRef, transitionRef?, transitionRole?]
removedPaths[path, priorDigest, class, reason, transitionRef?, transitionRole?]
bootstrapPaths[path, outputDigest, class, sourceRef]
controlArtifacts[path, kind, publicationPhase]
dependencyTarget[name, version, integrity, class]
affectedClaims + requiredConformanceIds
expected Product/operation/owner/schema/table/role/record delta (zero)
```

Every mutable entry declares its exact `mutationWindows[A0-Pn]`; more than one
window is allowed only when the same path must remain live across independently
green parts before its final disposition. `changedPaths` is the only
authorization for in-place byte replacement of a
path already owned by the prior S1 subject.
`adoptedExistingPaths.mutationLaw` is exactly `PRESERVE` or `REPLACE` and is
mutually exclusive with every other path category; `REPLACE` natively authorizes
replacement from its anchored `preDigest`. A 1→N or N→1 split/join is encoded by
the participating changed/adopted/removed/added entries sharing one
`transitionRef` and an exact `INPUT`, `OUTPUT` or `INPUT_OUTPUT` role. The validator derives each
transition set from those entries, requires at least one input and one output,
and forbids an orphan, duplicate or separately declared transition census. A
1→1 rename remains `oldToNew`.

The migration schema, validator and its admission tests are governance-only
`bootstrapPaths`. They may be added before plan validation only with their exact
digests declared by the plan. Bootstrap code imports only Node built-ins and
already-locked dependencies; it cannot use the not-yet-admitted dependency. A
separate standing bootstrap-digest check uses only Node built-ins to recompute
the plan, bootstrap and prior-tooling digests. Its tampered-byte RED fixture must
fire before the control counts. The exact bootstrap diff and subject digest are
independently reviewed by Fable and Gemini before validation. At that boundary
the check proves that every non-bootstrap production/dependency byte still
equals the prior subject; bootstrap authority cannot authorize its own later
drift or any Product/runtime mutation.

`priorToolingPaths` includes the current canonical-byte/digest oracle, G0/S1
generators and receipt recorder. Their digests are recomputed with `node:crypto`,
not by importing the oracle under test. `custodyScope` is a closed census, not a
hand-picked changed-file list: it covers all A0 production, dependency,
generator, test, profile and runtime inputs plus every YAML beneath
`contracts/api/product/`. Every path in scope has exactly one disposition; case
collisions, unsafe paths, symlinks and unclassified bytes are refused.
An adopted path already covered by an admitted receipt must match that receipt;
an unanchored adopted path must match both its declared `preDigest` and a named
prior part-PASS Evidence `sourceRef`, and its complete adoption census is exposed
in the A0-P1 review packet.

The baseline check first reproduces the admitted G0 and S1 receipt/manifest
subjects and refuses any mismatch. The migration validator refuses unlisted
add/remove/move/change, incomplete transition, bootstrap drift, class transition,
APP mutation, dual old/new generated route, or drift in the SQL migration,
Product OpenAPI, profile/input and G0 outputs.

Successful bootstrap validation publishes canonical
`conexus.r1-a0-migration-plan-validation/v1` by temporary file and final rename.
It binds the external SHA-256 of the complete canonical plan bytes, every prior
receipt/manifest/tooling/bootstrap digest, both bootstrap-review session IDs and
verdicts, and `PASS`. The plan contains no self-hash. Every in-flight check and
the P5 receipt require this validation-record digest, making post-hoc plan
creation distinguishable from the authorized order.

Intermediate A0 work is non-admitted: the prior S1 receipt remains the last
admitted subject and may be stale against the working tree. From the first
post-plan-validation A0.1 mutation until P5, the migration validator is the
conformance authority for every declared path disposition; standing receipt checks
accept the prior subject only when paired with that validated plan and must not
demand or create a premature successor. Exact successor-receipt conformance
resumes at P5. P5 publishes the A0 manifest and receipt last through temporary
files and final rename only after all named proof completes. The successor
receipt binds:

```text
previousReceiptDigest + migrationPlanDigest
planValidationDigest + finalPartPassDigest
complete owned manifest + manifestDigest
G0 receipt + compiler/canonical-json closureDigest
exact lock/tree/pin identities
Product OAS/projection digests + IAM-01..03 census
conformanceResultDigest + proof identities + per-class counts
APP-OWNED=0 + unresolvedConflicts=0
```

Each part publishes canonical `conexus.r1-a0-part-pass/v1` Evidence only after
its proof and dual review. It binds the validation record, previous part-PASS
digest, exact affected-path and dependency digests, command/protocol identities,
status vector and reviewer session IDs/verdicts. Later parts refuse drift in a
closed path unless the plan explicitly assigns that path a later mutation
window. These records prove byte custody and review ordering; hashes do not
pretend to prove semantic correctness, which remains the job of named tests,
falsifiers and reviewer adjudication.

Before that receipt, qualification publishes canonical
`conexus.r1-a0-conformance-result/v1` with the exact deciding runtime, command
identities, status vector, exact successor `manifestDigest`, package/lock/tree
digests and subject digests. The recorder independently recomputes the successor
manifest and every bound digest at record time, validates every exact required
status, and refuses free-form CLI assertions or any mismatch. The conformance
result is written before the temporary manifest/receipt; the receipt's final
rename remains the last A0 boundary mutation. Manifest census excludes the
plan-validation, part-PASS, conformance, manifest, receipt and `*.tmp` artifacts
to avoid a digest fixed point; their digests are bound explicitly instead.

Historical S1 Evidence and receipt are never rewritten to claim the new subject.
A new A0 result records the prior-to-successor transition.

### Mutations under a future A0 grant

| Class | Exact mutation |
| --- | --- |
| `GENERATED` | regenerate/rename only the S1 Fastify projection to typed source; rebuild the web client/browser outputs as a byte-identical falsifier, never as an admitted mutation; refuse surviving old `.mjs`; preserve web semantics |
| `PLATFORM-CONTRACT` | exact migration plan/validator/receipt; file moves; strict TS/Biome configs; canonical-json extraction; named composition APIs; raw SQL escape removal; affected generators/recorders/tests/live runner; import-law and RED fixtures |
| `APP-OWNED` | none |

`001_iam_foundation.sql`, Product OpenAPI bytes, Product route census and S1
behavior remain unchanged. No migration ledger relocation, new migration, schema,
role, Product operation or later-owner directory is admitted in A0.

### Ordered execution

```text
A0.1 reproduce/freeze prior G0/S1 subjects; publish the exact A0 migration plan;
     admit @types/pg and bounded openid-client declaration waiver; prove the
     future typed census/request APIs in-memory; add strict Hub/web build config
A0.2 extract canonical-json; repoint compiler and IAM; fresh G0/S1 proof
A0.3 move Hub files; introduce named module/composition/error surfaces; remove
     unused store.query and iamStoreSourceDigest with no replacement
A0.4 convert Product Hub and generated route projection to strict TypeScript;
     generator-time G0 census/OAS cross-check becomes the persisted route owner
A0.5 add web strict typecheck and Biome check without formatting unrelated files
A0.6 add final-layout import-law checker + per-rule firing controls
A0.7 replace source-regex security assertion with an adapter test double that
     captures authorizationCodeGrant options and proves execute contains only
     the exact injected enableNonRepudiationChecks function; retain Pack C's
     real cryptographic negative as the behavior proof
A0.8 rebuild, run full exact-runtime G0/S1/A0 proof, then publish the A0
     successor manifest/receipt last without rewriting historical S1 Evidence
```

Each step must leave all prior deciding claims green. A move preserves mutation
class and history; unrelated/unowned state is untouched.

`A0:MIGRATION-CUSTODY` means the bootstrap custody test before validation and
`node scripts/check-r1-a0-migration.mjs --in-flight --part A0-Pn` after
validation, with the exact current part. The in-flight protocol refuses drift
in every path whose first mutation window is later than that part. The
bootstrap test is not rerun as though the working tree were still a baseline.

### Completion

- exact route census remains `IAM-01..03`;
- G0/S1 complete proof is fresh PASS with affected digests/receipts;
- strict Hub/web typecheck and Biome check pass;
- the declaration-drift probe's distinct failing fixture fires;
- every import-law RED control fires and the real graph passes;
- every A0 migration/receipt RED control fires; prior receipt and plan digests
  chain to the receipt-last successor;
- no raw SQL/pool/query escape appears on a production owner public surface;
- HTTP/database errors have exhaustive owner-local mappings;
- `APP-OWNED` mutation is zero and later-operation census is zero;
- no package/service/provider call or future owner was admitted except the exact
  type-only dependency approved for A0.

### Stop

Stop and reopen the smallest owner if type migration needs semantic behavior
change, generated wire truth diverges, a required import edge violates the
matrix, a RED control does not fire, an affected S1 claim fails, exact type pin
admission fails, receipt drift reaches unrelated bytes, or an empty/generic
abstraction is required merely to make the layout look complete.

## 7. Questions for final convergence

Reviewers must return `ACCEPT` or `REVISE` on the proposal and specifically
answer:

1. Does strict Hub TypeScript now dominate deferral, given the missing
   `@types/pg` must be admitted and may block A0?
2. Is `packages/canonical-json` the narrowest stable shared primitive, or does
   it still create an unjustified package/API?
3. Does the named module API avoid both a god composition root and ceremonial
   ports?
4. Does the WS-01/PRJ-03 realization preserve exact initial authority and
   cross-owner transaction ownership without a forbidden JS dependency?
5. Are the import law, RED fixtures, completion and stop conditions sufficient
   to make S2 mechanical?
6. Identify any remaining MATERIAL ambiguity. Do not propose Product changes.

Terminal form:

```text
CONVERGENCE = ACCEPT | REVISE
MATERIAL_REMAINING = <count>
GLOBAL_MAXIMUM = CLEAR | NOT_CLEAR
```
