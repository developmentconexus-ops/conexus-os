# 4D OPP-B05 — Scaffold Generation and Distribution Study

> **Status:** `PASS 1 OPERATOR APPROVED / PROFILE COMPILER + OWNERSHIP MANIFEST LEADING`
> **Inputs:** `SCF-01..09`; `CON-01..05`; 4D-A; Blueprint Harness §12; SoftwareForge D1/D4; P13 generated/platform/app-owned seam
> **Research date:** `2026-08-28`
> **Prototype execution:** `NOT PERFORMED`
> **Implementation authority:** `BLOCKED`

## 1. Decision questions

1. What is the smallest mechanism that reproduces one exact Paved-Road profile
   without making a template engine the owner of Product or Project meaning?
2. How can regeneration update generated/platform files while preserving
   app-owned Product source and refusing ambiguous overlap?
3. How are skills, hooks and rules distributed from one versioned source while
   still being locally available to Builder/Worker tooling?
4. Which useful generator ecosystems should be adopted, adapted, retained as
   challengers or rejected for the current consumer?

## 2. Binding owner model

```text
PavedRoadProfile source
→ deterministic profile compiler
→ OwnershipManifest + staged output tree
→ conflict/drift/conformance checks
→ admitted Project tree + GenerationReceipt
```

The compiler owns mechanics only. Exact Product, wire, Permission, screen,
runtime and application meaning remains in its accepted owners.

Every materialized path has exactly one class and one update law:

| Class | Initial generation | Regeneration/update | Ordinary Builder mutation |
| --- | --- | --- | --- |
| `GENERATED` | emit canonical bytes | replace only from exact profile inputs; drift is detected before replacement | forbidden |
| `PLATFORM-CONTRACT` | emit protected seam/default | versioned migration or exact replacement after prior-digest validation | consume/extend only through admitted extension point |
| `APP-OWNED` | optional seed, then ownership transfers to Project | preserve byte-for-byte; generator does not merge or overwrite | allowed inside current Change authority |

One path cannot belong to two classes. A class change is a profile migration,
not a template-side surprise.

## 3. Candidate horizon

### A — Conexus profile compiler with a small tree abstraction

A TypeScript compiler consumes a schema-validated profile and explicit inputs,
renders into a staged virtual tree, emits manifests/digests and applies only
after conflict checks.

Strengths:

- ownership and stop laws are first-class rather than conventions;
- deterministic output can normalize ordering, paths, line endings, modes and
  exclude time/random/environment from deciding bytes;
- can generate multiple renderings in one compilation act from the same input;
- fits existing Node/TypeScript and repository verification mechanics;
- no mandatory monorepo, prompt or framework topology;
- duplication, upgrade and conformance can share one manifest grammar.

Risk: a custom compiler can grow into an unbounded build system. Keep template
rendering, tree operations, manifest compilation and application narrow; reuse a
proven library if its exact adoption reduces risk.

**Disposition:** `LEADING ARCHITECTURE / MECHANISM NOT YET SELECTED`.

### B — Nx Devkit generators

Current official documentation exposes a virtual `Tree`, `generateFiles`,
project-configuration updates, generator composition and formatting. It is a
strong TypeScript-native implementation candidate for staged tree mechanics and
composable profile operations.

Nx does not, from the inspected contracts, supply Conexus ownership semantics,
digest-pinned distributed policy, or the required app-owned preservation law.
Adopting the whole Nx workspace/build system is not justified by generation
alone.

**Disposition:** `LEADING LIBRARY CANDIDATE FOR TREE/GENERATOR MECHANICS / NO NX PLATFORM ADOPTION`.

### C — Copier

Copier provides a valuable update-aware model: versioned Git templates, saved
answers, update from prior template state, migrations, clean-repository guards
and conflicts through VCS comparison. It is the strongest current challenger
for brownfield template upgrades.

Material mismatches:

- Python runtime and a second templating ecosystem in a Node-first Project;
- update expects Git/template ancestry and a clean repository;
- template tasks/migrations are executable and require explicit trust;
- ignored untracked files do not participate in its dirty check;
- template-wide update semantics do not themselves enforce the three Conexus
  ownership classes or forbid authority-bearing overlap.

**Disposition:** `STRONG UPDATE-SEMANTICS REFERENCE / BOUNDED SPIKE CHALLENGER`.

### D — Plop

Plop is a compact Node generator with `add`, `addMany`, `modify`, `append`,
custom actions, programmatic execution and failure reporting. `force` can
overwrite existing files.

It is attractive for local, app-owned add-only recipes. Its regex/text mutation
and force-overwrite model does not provide profile provenance, migrations,
ownership metadata or conflict-aware regeneration.

**Disposition:** `REFERENCE FOR LOCAL APP-OWNED RECIPES / REJECT AS PROFILE COMPILER`.

### E — projen / synth-owned repository

Code-as-configuration and repeated synthesis are useful for repositories whose
project configuration is intentionally generator-owned. That model risks making
too much of a mixed Product repository generated or forcing app decisions into
one synth program.

**Disposition:** `REFERENCE / REJECT CURRENT WHOLE-REPOSITORY OWNERSHIP`.

### F — Yeoman, Cookiecutter and Git template repositories

Useful mature creation patterns, composition or initial-copy ergonomics, but no
current property requires their runtime and none closes Conexus regeneration,
ownership and distributed-authority laws by itself.

**Disposition:** `REFERENCE ONLY`.

### G — Backstage Scaffolder or a remote template service

Catalog workflows, remote actions and organizational template discovery are
strategically interesting if a future multi-team portal consumer appears. The
current consumer needs a reproducible local compiler, not a new service/catalog
owner or remote task authority.

**Disposition:** `STRATEGIC REFERENCE / DEFER`.

## 4. Profile and manifest contract candidate

The exact schema remains for 4D-A closure, but the minimum facts are:

```text
PavedRoadProfile
→ profileId
→ profileVersion
→ profileDigest
→ generatorProtocolVersion
→ supported source/target profile range
→ declared inputs and validation schema
→ ordered generation/migration units
→ ownership path rules
→ distributed-asset declarations
→ required conformance assertions
```

```text
GenerationReceipt
→ profile identity + digest
→ compiler identity + protocol version
→ canonical input digest
→ OwnershipManifest digest
→ generated/platform tree digest
→ per-path source/output digests and class
→ applied migration chain
→ preserved app-owned path census
→ conflicts/refusals
```

`ProjectBaseline` pins the profile and receipt identities needed to reproduce
and adjudicate the Project. The receipt is generated Evidence; it owns no
Product meaning.

## 5. Deterministic compilation and application

```text
validate profile + inputs + current Baseline
→ resolve exact profile artifact by digest
→ compile into isolated staged tree
→ normalize paths/case/newlines/modes/order
→ compile OwnershipManifest and output digests
→ compare current admitted tree against prior receipt
→ preserve APP-OWNED paths
→ reject overlap, unexplained platform drift or unsafe class transition
→ preview exact add/change/remove/preserve set
→ apply atomically enough to avoid a half-generated admitted tree
→ run conformance and emit new receipt
```

Time, machine path, unordered filesystem enumeration, network-latest lookup and
random IDs cannot affect deciding output. Secrets are inputs to runtime
credential authority, never template values or receipt material.

Deletion is class-sensitive:

- removing `GENERATED` output is allowed only when the new exact profile no
  longer emits it;
- removing `PLATFORM-CONTRACT` requires an admitted migration and preserved
  invariant replacement/removal proof;
- the compiler never deletes `APP-OWNED` output.

## 6. Skills, hooks and rules distribution

The canonical assets live once in the versioned profile artifact. A Project may
need repository-local renderings because coding agents and Git hooks consume
local paths. Those copies are `GENERATED` projections:

```text
profile asset + exact digest
→ same compilation act
→ local skill/hook/rule rendering
→ receipt path/source/output digest
→ freshness check at material consumption
```

Rules:

- no deciding local asset without an exact source digest;
- local edits mark the projection `STALE`; they do not become authority;
- a hook may detect only its declared proven-firing classes;
- profile version changes recompile all distributed renderings together;
- executable hooks/tasks are not run merely because a template was downloaded;
  artifact trust/admission and capability remain separate B06 concerns;
- generated tool-specific wrappers may differ, but shared meaning comes from
  one profile input in the same compilation act.

This avoids divergent `.cursor`, Claude/Codex, Git-hook and CI copies while
still serving their different physical formats.

## 7. Duplication and upgrade

Project duplication does not copy a repository wholesale. It derives a bounded
duplication manifest:

```text
source profile/Baseline intent
+ admitted APP-OWNED source/config intent
- credentials
- Connection/Brain bindings
- Project DB/data
- membership/grants
- Release/runtime/run/Evidence history
→ new Project identity
→ fresh generation from the pinned profile
→ explicit re-binding/requalification
```

Upgrade is `old profile + receipt + current tree → new profile`, never “run the
latest template”. If an APP-OWNED change blocks a required platform migration,
the result is a named conflict/escape-hatch decision, not an overwrite.

## 8. Required falsifiers

1. `B05-P1`: identical admitted inputs produce identical canonical tree and receipt digests.
2. `B05-P2`: changed time, machine path, filesystem order and offline execution do not alter output.
3. `B05-P3`: every materialized path has exactly one ownership class; overlap fails compilation.
4. `B05-P4`: regeneration preserves representative APP-OWNED files byte-for-byte.
5. `B05-P5`: hand-edited GENERATED or PLATFORM-CONTRACT files become drift/conflict, never silent authority.
6. `B05-P6`: removal and ownership-class transition require their exact admitted laws.
7. `B05-P7`: distributed skill/hook/rule source drift makes every deciding consumer stop as `STALE`.
8. `B05-P8`: tool-specific renderings from one compilation cannot diverge silently.
9. `B05-P9`: duplication excludes credentials, bindings, DB/data, grants and runtime/history.
10. `B05-P10`: failed compilation/application cannot leave an admitted half-generated tree.
11. `B05-P11`: an untrusted profile cannot execute a task/hook/migration by template inclusion alone.
12. `B05-P12`: a normal app feature is implementable without editing protected seams.

## 9. Corrected opportunity outcome

```text
OPP-B05 PASS 1 = OPERATOR APPROVED
Conexus profile compiler + OwnershipManifest = LEADING ARCHITECTURE
small TypeScript tree/generator mechanism = LEADING IMPLEMENTATION SHAPE / NOT SELECTED
Nx Devkit = LEADING LIBRARY CANDIDATE / BOUNDED USE ONLY
Copier = STRONG UPDATE-SEMANTICS REFERENCE / SPIKE CHALLENGER
Plop = APP-OWNED LOCAL RECIPE REFERENCE / REJECT AS PROFILE COMPILER
projen whole-repository synthesis = REJECT CURRENT OWNERSHIP MODEL
Yeoman/Cookiecutter/Git templates = REFERENCE ONLY
Backstage Scaffolder = STRATEGIC REFERENCE / DEFER
local skills/hooks/rules = DIGEST-PINNED GENERATED PROJECTIONS
exact generator dependency/profile schema/physical tree = 0
Product implementation authority = 0
```
