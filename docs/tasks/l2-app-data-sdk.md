# L2 — Application data and SDK task plan

## Goal and design

Builder creates applications that persist, query and change their own business
data. Conexus supplies the repeatable scaffold, migration and registered
operation path so every app does not rebuild platform infrastructure.
Build-time authoring/provisioning and restricted runtime execution are distinct.
No generic SQL or arbitrary-operation API is introduced.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
The roadmap alone owns status/grants. This is a dependency-aware task plan;
exact code interfaces and new file names are frozen in L2.1 before execution,
not guessed from an SDK package name.

## Required context and existing source

- [Project operation grammar](../product/operation-ledger.md#4-project-defined-capability-admission-grammar),
  [permissions](../product/permission-contract.md),
  [data and Registry](../reference/data-and-persistence.md),
  [scaffold](../reference/frontend-and-product-surfaces.md),
  [4D-A/B](../phases/4d-project-paved-road-and-runtime-realization.md).
- [R3 candidate/owner envelope](r3.md) and its linked P2/P3 decision; candidate
  `budget_analyzer` tables are not a platform schema/template.
- Existing files: `scripts/run-project-migrations.mjs`,
  `scripts/run-hub-migrations.mjs`, `apps/hub/src/project/read-model.ts`,
  `apps/hub/project-migrations/`, `apps/hub/src/registry/`,
  `packages/profile-compiler/`, `apps/hub/src/generated/r1-new-project-seed.ts`.
- Proof starting points: `tests/implementation/r3-project-read-model.test.mjs`,
  `tests/implementation/r1-g0-profile-compiler.test.mjs` and
  `tests/implementation/r1-s3-project-command.test.mjs`. Their existing claims
  do not prove a generic app mutation runtime.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L2.1 scaffold | [C-012](../decisions/index.md); [4D](../phases/4d-project-paved-road-and-runtime-realization.md), 4D-A/B; [frontend owner](../reference/frontend-and-product-surfaces.md), §§33.1–33.3 | Preserve versioned React/TS/Vite/TanStack and generated/platform/app ownership. Select exact SDK exports, regeneration inputs and real app consumer, not a new stack |
| L2.1–2 operation | [operation ledger](../product/operation-ledger.md), §§4.1–4.3; [data owner](../reference/data-and-persistence.md), §§5.4 and 11.1–11.3 | Derive concrete Query/Action input/output, transaction and runtime permission interfaces from the accepted grammar |
| L2.1 R3 reuse | [R3](r3.md), P1 reconciliation matrix and P2/P3 owner decision | List exact reused migration/runtime capability claims and accepted proof; identify what remains candidate or is irrelevant to native app data |
| L2.1–2 comparative SDK | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §§2–3 and 7; technical appendix §§11.1–11.2 and 12 only for a named signature question | Build/runtime separation and prepared templates inform the seam. Conexus §11.2 retains privilege separation; do not copy Mitra numeric IDs, SQL interpolation or observed SDK exports as Conexus API |
| L2.3 verification | [Factory influence](../research/factory-ai/influence-on-conexus.md), §§8–9; [Engineering method](../development/engineering-method.md), “Proof Strategy Before Implementation” | Define behavioral assertions before code decomposition: persistence, denied cross-Project access, stale write and regeneration preservation |

For driver/transaction or codegen uncertainty, inspect the adopted `pg`, schema
and compiler source first; consult official PostgreSQL/driver/framework docs
only for the unresolved behavior. A Mitra historical SDK snapshot describes its
observed mechanism, not our current package API or a reason to install it.

## Implementation work breakdown

### L2.1 — Freeze data/operation and SDK boundaries

- [ ] Name the Project/I&A/Registry integrator and classify each reused R3
  claim: accepted input, preserved candidate, owner reopening or not consumed.
  Resolve runtime capability adoption before production code depends on it.
- [ ] Derive concrete Query/Action declarations from the existing grammar:
  inputs/outputs, ownership, caller, permissions, transaction/precondition,
  revision and error behavior. Separate Project data mutation from external I/O.
- [ ] Select build SDK/scaffold and restricted runtime client interfaces,
  package/file locations and generated/platform/app mutation boundaries. Bind
  each helper to the generated app that will actually consume it.
- [ ] Resolve how data-backed Preview obtains isolated test/dev data access
  without inheriting Published App or Control Plane authority. If it requires
  L3 admission machinery, move that exact prerequisite here before claiming a
  usable data-backed app; delivery numbering cannot create an unsafe shortcut.
- [ ] Freeze failing cases, exact commands and the first code increment in
  this packet; obtain its execution grant through the roadmap.

### L2.2 — Realize persistent app operations

- [ ] Implement the admitted migration/runtime-role boundary and registered
  reads/writes with schema validation, real bind parameters and owner-managed
  transactions; SDK callers cannot choose raw SQL, credentials or other Projects.
- [ ] Wire code generation, runtime clients and Builder context to the same
  declarations. A field/operation change must update generated consumers or
  fail contract validation, never leave a silent runtime mismatch.
- [ ] Exercise creation, editing and querying through a Builder-authored app
  and show retained data after reload/restart under the admitted environment.

### L2.3 — Complete data usability and proof

- [ ] Connect accepted Data/Capabilities inspection to real admitted data and
  operation identities; inspection does not grant mutation authority.
- [ ] Decide private attachment/storage applicability from Product operations
  requiring bytes; preserve its owner-bound path and do not create a generic
  file API. Record inclusion or the actual follow-on consumer explicitly.
- [ ] Verify cross-Project refusal, invalid inputs, conflicting writes,
  transaction failure, runtime DDL denial and preservation of app-owned source
  during scaffold regeneration. Prove both app behavior and backend enforcement.

## Dependencies, proof and exit

Consumes L1 exact source/artifact custody and accepted Project data/role meaning.
Produces registered operation/client and data-runtime contracts consumed by
L3/L4/L5. R3 sync/cursor proof is required only for a consumer that asserts sync
truth; its candidate acceptance and aggregate provenance cannot be inherited.

Exit is an app created through Builder that can persistently create, edit and
read its own data through the platform, with negative boundary proof. The same
platform machinery must accept a different app schema without Budget-specific
code. Code-ready detail includes exact interfaces, file envelope and commands
from L2.1; the roadmap's candidate/CI checks remain additional requirements.
