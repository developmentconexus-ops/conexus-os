# 4D-05 RF-01 — Profile Compiler and Distribution Selection

> **Status:** `CLOSED / OPERATOR APPROVED / BUILD SELECTED / 2026-08-29`
> **Outcome:** `BUILD BOUNDED CONEXUS PROFILE COMPILER V1`
> **Direct third-party generator/template dependency:** `0`
> **Implementation authority:** `BLOCKED`
> **Selection scope:** `RF-01 ONLY`; all other G0/R1 families remain unselected

## 1. Decision

Select a small Conexus-owned compiler core with an in-memory canonical tree,
closed declarative render operations, exact three-class ownership comparison,
staged application and receipt-last admission.

```text
admitted profile + admitted canonical input set
→ ConexusProfileCompiler/v1
→ canonical staged tree + OwnershipManifest + exact apply plan
→ protected-path preconditions + conformance
→ GenerationReceipt committed last
```

**Outcome:** `BUILD`.

Do not adopt Nx, Copier, Plop or a whole-repository synthesis system as the
profile compiler. Retain Nx Devkit as a falsifier-triggered `ADAPT` alternative,
Copier as update-semantics `REFERENCE_ONLY`, and Plop as an app-owned local-
recipe `REFERENCE_ONLY` mechanism.

The reason to build is narrow and evidenced: no studied component supplies the
approved `GENERATED | PLATFORM-CONTRACT | APP-OWNED` custody law, receipt-pinned
admission, deny-only distributed assets and refusal semantics. Adapting a broad
generator still requires the Conexus compiler core while adding more dependency
and execution surface than its tree operations remove.

## 2. Protected scope

RF-01 closes the exact mechanics for:

```text
SCF-01..07
SCF-09..11
WIR-01..02
CON-01
CON-05
VER-01
VER-10
```

It does not select the Hub router, OIDC client, frontend runtime, database
driver/migration tool, Gateway adapter, Builder runtime or any other RF family.

## 3. Current-source Evidence

Research date: `2026-08-29`.

### 3.1 Context7

| Candidate | Context7 source | Current behavior relevant to RF-01 |
| --- | --- | --- |
| Nx Devkit | `/websites/nx_dev` | public `@nx/devkit` API exposes virtual `Tree`, `generateFiles`, `formatFiles` and generator composition |
| Copier | `/copier-org/copier` | records answers, updates from versioned templates and represents unresolved changes as inline or `.rej` conflicts; migrations/tasks are executable |
| Plop | `/plopjs/plop` | exposes `add`, `addMany`, `modify`, `append`, custom actions and programmatic `node-plop`; `force` may overwrite an existing add target |

Context7 is acquisition Evidence, not version or Product authority. Registry and
official source identities below bind the exact observed releases.

### 3.2 Exact observed releases and provenance

| Candidate | Exact observed identity | Relevant supply-chain facts |
| --- | --- | --- |
| `@nx/devkit` | `23.1.2`; npm integrity `sha512-NBk4cWde0QKnNfomA0lSHPadDVyqA0Cu8/vVy7crCO6Dk0FIrati9pZXuj3TQzfFJLWuZ/XzJpzuIkOovYrFGA==` | MIT; 6 direct dependencies; peer `nx >=22 <=24 || ^23.0.0-0`; 339,374 unpacked bytes / 116 files; official source repository `nrwl/nx` |
| `nx` peer | `23.1.2`; npm integrity `sha512-Qn0D3QOjBqEVH2abVCjkrs15m3OmsU7gOz7PYMhSbmJECAO1PHSKDyMJTaxIaP10E7R3JEdgehkqIBMPVOIYiw==` | MIT; broad CLI/build-platform dependency graph plus native optional packages; 17,611,236 unpacked bytes / 1,285 files |
| Copier | `9.17.2`; PyPI sdist SHA-256 `02e9c0d05281603c06d52f48350e48ffca0b4283d9f025664fbce4befabaa555`; Git tag commit `76239f5250ed14280a6fe45cbf1ffa9c6bb57185` | MIT in official source; Python `>=3.10`; separate Jinja/Pydantic/YAML/CLI dependency ecosystem |
| Plop | `4.0.5`; npm integrity `sha512-pJz6oWC9LyBp5mBrRp8AUV2RNiuGW+t/HOs4zwN+b/3YxoObZOOFvjn1mJMpAeKi2pbXADMFOOVQVTVXEdDHDw==`; source git head `c304c4354145d1cbde886bb8376249aea8439506` | MIT; Node `>=18`; CLI wraps `node-plop` |
| `node-plop` | `0.32.3`; npm integrity `sha512-tn+OxutdqhvoByKJ7p84FZBSUDfUB76bcvj0ugLBvgE9V52LFcnz8cauCDKi6otnctvFCqa9XkrU35pBY5Baig==`; source git head `47de192eb7acae78b00cc2222a2e936c3d18a8eb` | MIT; Node `>=18`; Handlebars/prompt/glob/change-case dependency surface |

Registry observation does not prove security or compatibility. Any later
admission still requires exact lock, signatures/provenance where available,
license/advisory review and real proof.

## 4. Alternatives

### A — `BUILD` Conexus compiler core — selected candidate

Strengths:

- encodes ownership, drift, update and admission laws directly;
- no generator/template dependency or executable profile task surface;
- no monorepo/workspace or second language/runtime commitment;
- small replacement boundary: canonical tree + render units + plan/apply;
- every byte and refusal remains attributable to profile/input/compiler digests.

Risk: custom machinery can grow into a build platform.

Control: v1 has a closed operation set, no plugins, no arbitrary code, no task
runner, no package/workspace graph and no generic merge engine.

**Disposition:** `BUILD / SELECTED CANDIDATE`.

### B — `ADAPT @nx/devkit@23.1.2`

Useful capability:

- mature virtual `Tree` and file generation/composition utilities.

Material gap/cost:

- does not own Conexus classification, prior-receipt comparison, protected drift,
  app-owned byte preservation, admission or deny-only distribution;
- `@nx/devkit` declares the broad `nx` peer range, so bounded use still admits a
  much larger build-platform surface and transitive graph;
- formatting is not canonical byte generation and cannot be deciding output by
  default;
- the Conexus compiler core remains necessary around the library.

**Disposition:** `DEFER AS FALSIFIER-TRIGGERED ADAPT ALTERNATIVE`.

Reopen only if the custom tree/apply core becomes materially more complex or
defect-prone than the bounded Nx dependency surface and a prototype proves use
without workspace/platform adoption.

### C — Copier `9.17.2`

Useful reference:

- explicit template version/update, prior answers and conflict presentation.

Material mismatch:

- second Python/template ecosystem in the Node-first Project;
- Git/template ancestry and project-wide merge semantics instead of exact
  ownership classes;
- migrations/tasks are executable and need separate trust;
- conflict behavior can modify app-owned material, whereas RF-01 must preserve
  it byte-for-byte and refuse overlap;
- clean-tree assumptions and update rollback instructions do not constitute
  receipt-last Conexus admission.

**Disposition:** `REFERENCE_ONLY / NOT ADMITTED`.

### D — Plop `4.0.5` / `node-plop 0.32.3`

Useful reference:

- compact app-owned add/modify recipe and programmatic failure result.

Material mismatch:

- `modify`/`append` are text mutation, not ownership-aware regeneration;
- `force` can overwrite existing add targets;
- no prior receipt, profile migration, class transition, canonical tree or
  atomic admission law;
- prompts/helpers/custom actions increase non-deciding/executable surface.

**Disposition:** `REFERENCE_ONLY FOR APP-OWNED LOCAL RECIPES / NOT RF-01`.

### E — prior rejected/deferred horizon

projen whole-repository synthesis, Yeoman/Cookiecutter/Git templates and remote
Backstage-style scaffolding remain outside the credible RF-01 comparison. No new
consumer or falsifier reopens their approved B05 disposition.

## 5. Exact selected compiler boundary

### 5.1 Identity

```text
compilerProtocol = conexus-profile-compiler/v1
profileSchema     = conexus.project-scaffold-profile/v1
inputSchema       = conexus.project-scaffold-input-set/v1
ownershipSchema   = conexus.project-ownership-manifest/v1
planSchema        = conexus.project-generation-plan/v1
receiptSchema     = conexus.project-generation-receipt/v1
attemptSchema     = conexus.project-generation-attempt/v1
```

The future executable is a content-addressed internal artifact. Its source,
build and artifact digests must be pinned in every receipt. That artifact digest
does not exist yet because implementation remains unauthorized; it is an
execution-time admission requirement, not a floating dependency.

### 5.2 Dependency and prerequisite boundary

```text
RF-01 direct third-party generator/template dependencies = 0
Node core substrate = accepted architecture / exact G0 runtime pin still separate
ProfileAdmission/schema validator + canonical JSON = RF-12 prerequisite / not silently built here
```

RF-12 validates the profile/input schemas and trust/provenance and provides a
conformant RFC 8785 JSON Canonicalization Scheme port, producing exact admitted
digests. RF-01 accepts only admitted artifacts, rechecks their digests and
enforces the structural invariants it consumes. This keeps validation and
canonicalization explicit without handwritten parallel implementations.

### 5.3 Canonical tree

The compiler tree is a private ordered map:

```text
normalized POSIX-relative path
→ bytes
+ executable/mode class where material
+ GENERATED | PLATFORM-CONTRACT | APP-OWNED
+ source/profile digest
+ expected prior output digest where applicable
```

Path normalization and filesystem census include tracked, untracked, ignored,
symlink and reparse-point entries. They reject absolute paths, traversal,
symlink/reparse escape, case/Unicode collision, duplicate targets and ownership
overlap before rendering.

Closed v1 operations:

```text
read exact staged/current entry
declare new exact entry
replace exact expected protected entry
remove exact expected protected entry
list in canonical path order
```

There is no append, regex modify, force, arbitrary filesystem access or plugin
operation.

### 5.4 Declarative rendering

Profile artifacts contain data/assets, never executable tasks or arbitrary
template code. v1 render units are closed:

```text
COPY_BYTES
SERIALIZE_CANONICAL_JSON
RENDER_TOKEN_TEXT with an explicit compiler-owned encoder per declared token
```

No expressions, loops, includes, helpers, time, randomness, environment reads,
network access or arbitrary command execution are admitted. A new render
capability requires a compiler protocol/version decision, not a profile-side
escape.

### 5.5 Compare, plan and apply

```text
compile isolated staged tree
→ compare prior receipt + current tree + new staged tree
→ preserve APP-OWNED bytes without merge
→ refuse protected drift, overlap or unsafe transition
→ emit digest-pinned GenerationPlan with expected active receipt and affected-path preconditions
→ acquire one exclusive Project generation-writer lock
→ recheck active receipt, complete path census and protected preconditions under the lock
→ write protected output through sibling temporary files and replace exact path
→ run conformance
→ write GenerationReceipt last
→ release the generation lock
```

Filesystem multi-file mutation is not claimed atomic. Admission is receipt-
gated: until the new receipt commits, the tree is not admitted and all deciding
consumers stop on receipt/tree mismatch. A failed attempt retains the old active
receipt and exact plan/attempt Evidence. A retry with the same plan may complete
only when every affected path matches either its expected prior digest or its
exact planned output digest; any third value is conflict/stop. It cannot expose
a half-generated tree as current.

Only one generator writer may hold the Project generation lock. A stale lock is
never stolen merely by age: the recovery path proves the prior process cannot
write, reconciles receipt/plan/tree state and then explicitly releases or
replaces the lock. Builder edits to unrelated APP-OWNED paths need not be
blocked, but a new affected-path collision fails the under-lock recheck.

The compiler never writes or deletes an existing `APP-OWNED` path.

### 5.6 Distributed assets

Skills, hooks, rules and tool wrappers are `GENERATED` from one admitted profile
source in the same compilation. Each receipt records source/output digest and
consumer scope. Local edits make every deciding consumer `STALE`; they do not
become authority.

## 6. Authority and replacement boundary

The compiler owns only:

```text
canonical tree mechanics
render/apply planning
ownership/drift refusal
manifest/receipt generation
```

It does not own Product, Project Baseline, wire, Permission, screen, runtime,
Release, verification acceptance, source truth or dependency admission.

Replacement contract:

```text
same v1 admitted profile/input bytes
→ same canonical tree/manifest/receipt deciding digests
→ same refusal classes
```

A later adapter/library may replace the private tree implementation without
changing protocol or owner truth only after this equivalence proof.

## 7. Proof and firing controls

| Proof | Required result |
| --- | --- |
| `RF01-P01` | identical admitted inputs produce identical canonical tree, manifest and receipt digests across clean repetitions |
| `RF01-P02` | time, environment, machine path, enumeration order and offline execution do not alter deciding bytes |
| `RF01-P03` | absolute/traversal/case/Unicode/duplicate/ownership-collision paths refuse before apply |
| `RF01-P04` | representative APP-OWNED source remains byte-identical across same-profile regeneration and upgrade |
| `RF01-P05` | edited GENERATED/PLATFORM-CONTRACT path becomes drift/conflict, never overwrite authority |
| `RF01-P06` | class transition and protected deletion require exact admitted migration law |
| `RF01-P07` | distributed asset edit makes the exact consumer `STALE` and cannot grant/accept |
| `RF01-P08` | duplication excludes credentials/bindings/data/grants/history and emits a fresh destination receipt |
| `RF01-P09` | injected render task/expression/command/network/environment read is structurally unrepresentable or refused |
| `RF01-P10` | injected failure during apply leaves no new admitted receipt and deciding consumers stop on mismatch |
| `RF01-P11` | canonical wire projection drift or generic Project executor fails generated census/conformance |
| `RF01-P12` | a normal app feature is added only through APP-OWNED source/declared extension without protected edits |
| `RF01-P13` | concurrent generator writers, stale saved plan and changed affected path lose under the exclusive lock with no new receipt |
| `RF01-P14` | RFC 8785 conformance vectors reproduce exact UTF-8 bytes; invalid I-JSON/schema input aborts before compilation |

These are implementation/prototype obligations for later authorized proof. This
planning artifact does not claim they have executed.

## 8. Upgrade and security law

- profile/compiler protocol versions and artifact digests are immutable pins;
- no mutable `latest` or network resolution participates in generation;
- compiler/profile upgrade uses old receipt/current tree/new exact pins and an
  ordered admitted migration chain;
- compiler executable code is trusted build input and follows RF-12 supply-chain
  admission; downloaded profile data cannot execute code;
- a vulnerability or determinism/ownership defect in the compiler stales the
  affected admitted version and triggers bounded repin/requalification;
- old Projects remain reproducible from retained exact compiler/profile artifacts
  until an admitted migration replaces them;
- Nx reopens only on demonstrated custom tree/apply complexity or defect;
- RF-12A reopens RF-01 if schema-validation/canonicalization admission proves the
  combined custom boundary materially more complex, less replaceable or less
  reliable than the bounded Nx `ADAPT` alternative;
- a new non-Node consumer, remote catalog/service consumer or unavoidable
  semantic merge requirement reopens the smallest RF-01 decision.

## 9. Strongest challenge

### “Building a tree is reinventing Nx.”

The selected custom surface is not a generator platform. It is an ordered map,
three render operations, protected compare/plan/apply and receipt admission.
Nx would remove some tree code but retain all Conexus ownership/admission code,
while adding its peer platform and dependency graph. If implementation Evidence
shows the private tree grows beyond this boundary or accumulates defects, the Nx
`ADAPT` trigger fires.

### “Without a template engine every new profile needs compiler code.”

v1 supports static assets, canonical JSON and encoded scalar token text. A real
profile that cannot fit this grammar is a protocol reopen, not permission for
downloaded arbitrary expressions/tasks. This preserves trust and determinism.

### “Receipt-last does not make filesystem writes atomic.”

Correct. It makes **admission** atomic and fail-closed. A physical partial state
is visible as mismatch and cannot be consumed as current. Claiming cross-file
filesystem atomicity would be false; recovery/retry is part of RF01-P10.

### “A receipt alone does not prevent concurrent writers.”

Correct. External reference review added an exclusive Project generation lock
and a saved plan bound to the expected active receipt and affected paths.
Receipt-last controls admission; the lock controls concurrent writers; per-path
temporary-file rename controls individual file visibility. None substitutes for
the others.

## 10. Approval and downstream route

```text
RF-01 = CLOSED / OPERATOR APPROVED / 2026-08-29
selection = BUILD ConexusProfileCompiler/v1
direct third-party generator/template dependency = 0
RF-12A ProfileAdmission/schema-validation/canonicalization = NEXT
other RF families = BLOCKED
Product implementation authority = 0
```

The selection approves architecture and replacement/proof law only. No
dependency is installed and no compiler/source/topology is implemented. RF-12A
must select the profile/input schema validator, RFC 8785 canonicalization port
and admission Evidence boundary before RF-01 can later be implemented or
proved. Other RF families, Product implementation, push, PR and merge remain
unauthorized.
