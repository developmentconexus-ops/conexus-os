# 4D-05 RF-01 — Global-Maximum Reference Review

> **Status:** `REFERENCE REVIEW COMPLETE / SELECTION APPROVED / RUNTIME PROOF OPEN`
> **Reviewed decision:** `BUILD ConexusProfileCompiler/v1`
> **Research date:** `2026-08-29`
> **Implementation authority:** `BLOCKED`

## 1. Question

Does the RF-01 algorithm represent the smallest sustainable structure when
challenged against mature generation, update, ownership, hermetic-build,
plan/apply and atomic-write designs?

This review searches for structural falsifiers, not new dependencies to adopt.

## 2. References and lessons

| Reference | Mature mechanism | Lesson applied to RF-01 |
| --- | --- | --- |
| [Nx Devkit Generator/Tree](https://nx.dev/docs/reference/devkit/Generator) | generators schedule changes against a virtual tree before filesystem application; generators compose | confirms isolated staged tree and composition; does not supply Conexus ownership/admission |
| [Copier updating](https://github.com/copier-org/copier/blob/master/docs/updating.md) | template version/answers history, smart diff, conflicts and clean-Git precondition | confirms prior-generation provenance and explicit conflict; reveals ignored files must still enter the Conexus collision census |
| [Terraform plan/apply](https://developer.hashicorp.com/terraform/cli/run) | saved plan applies exact proposed actions; state locking and stale-plan rejection protect admission | requires a digest-pinned GenerationPlan, expected active receipt and exclusive Project generation lock |
| [Bazel hermeticity](https://bazel.build/reference/glossary#hermeticity) | declared inputs only; network/environment/time/randomness excluded or fixed | confirms RF-01 closed input set and offline deterministic proof |
| [Kubernetes Server-Side Apply](https://kubernetes.io/docs/reference/using-api/server-side-apply/) | manager ownership metadata and conflicts prevent accidental overwrite; topology changes are risky | confirms explicit ownership/refusal; Conexus deliberately chooses the simpler whole-path single-owner model instead of field-level shared merge |
| [Git lockfile API](https://git-scm.com/docs/api-lockfile) | exclusive lock, write temporary file, atomic rename, rollback/cleanup | requires writer exclusion and sibling-temp per-file replacement; also proves multi-file atomicity must not be claimed |
| [RFC 8785 JCS](https://www.rfc-editor.org/rfc/rfc8785) | I-JSON constraints, deterministic property sorting and UTF-8 canonical bytes for repeatable hashing | requires a conformant canonicalization port and test vectors; handwritten ad-hoc JSON sorting is rejected |

Context7 refreshed Nx (`/websites/nx_dev`), Copier
(`/copier-org/copier`) and Terraform
(`/websites/developer_hashicorp_terraform`) before the official-source review.

## 3. Structural convergence

The references independently converge on this shape:

```text
declared/admitted immutable inputs
→ pure staged representation
→ exact preview/plan bound to prior admitted state
→ explicit ownership conflict instead of silent overwrite
→ exclusive writer + current-state recheck
→ bounded physical writes
→ admitted-state record committed only after success
```

No reference supports the unsafe shortcuts RF-01 rejects:

```text
live direct writes while deciding
mutable latest/template lookup
implicit environment/network/time inputs
force-overwrite of another owner
unlocked concurrent apply
claiming multi-file filesystem atomicity
state/receipt update before real apply/conformance
```

## 4. Findings

### `RF01-R01` — exclusive generation writer was missing

**Finding:** receipt-last protects admission but does not stop two compilers from
interleaving filesystem writes.

**Correction:** one Project-scoped exclusive generation lock is held from final
state recheck through receipt commit. Stale lock recovery proves quiescence and
reconciles exact attempt/plan/tree state; age alone never steals the lock.

**Basis:** Terraform state locking and Git lockfile mutual exclusion.

### `RF01-R02` — plan identity and stale-plan refusal needed to be explicit

**Finding:** a human-readable preview without a saved exact identity can differ
from what apply executes.

**Correction:** `conexus.project-generation-plan/v1` binds compiler/profile/input,
expected active receipt, affected paths, prior/output digests and operations.
Apply rechecks it under the lock; any changed deciding precondition is stale or
conflict.

**Basis:** Terraform saved-plan behavior.

### `RF01-R03` — current-tree census must exceed Git dirty state

**Finding:** Copier's dirty check can ignore ignored files. An ignored/untracked
path can still collide with a generated/protected target.

**Correction:** census covers tracked, untracked, ignored, symlink and Windows
reparse-point entries. Symlink/reparse escape is refused.

**Basis:** Copier update behavior plus RF-01 ownership/security invariant.

### `RF01-R04` — canonical JSON must not be improvised

**Finding:** naïve key sorting is not full canonical JSON, especially for nested
objects, Unicode and number serialization.

**Correction:** RF-12 supplies an RFC 8785/I-JSON conformant port and official
test-vector proof. RF-01 does not handwrite a second canonicalizer.

**Basis:** RFC 8785.

## 5. Why whole-path ownership is the Global Maximum here

Kubernetes proves that granular shared ownership can work, but it requires
field-manager metadata, schema-aware merge topology and explicit ownership
transfer. Conexus does not have a real consumer for two actors editing the same
materialized file.

The approved model instead uses:

```text
one path = one class = one update law
cross-owner collaboration = explicit interface between separate paths
```

This removes the hardest merge class while preserving legitimate Project
freedom. If a future real file cannot be separated without destructive cost,
that is the reopen trigger for more granular ownership—not a reason to prebuild
structured merge now.

## 6. Build feasibility

The compiler is bounded because it deliberately does **not** implement:

- a programming language or arbitrary template engine;
- schema validation/canonicalization internals;
- a generic three-way merge;
- workspace/package/task orchestration;
- remote catalog/service execution;
- Product or Release authority.

Expected implementation units:

```text
contract/types and digest identities
path normalization + full filesystem census
canonical in-memory tree
three closed render operations
prior/current/staged comparison + GenerationPlan
exclusive generation lock + apply/recovery
manifest/receipt/attempt emission
RF01-P01..P14 proof harness
```

The algorithms are ordinary maps, sorted traversal, byte hashing, exact
preconditions and per-file temp/rename. The difficulty is not computational
complexity; it is correctness at path, concurrency, crash and ownership edges.
Because RF-01 refuses semantic merge and arbitrary execution, the state space is
materially smaller than Nx/Copier/Kubernetes-style generality.

This is a moderate bounded engineering component, not a trivial script. A
prototype must prove RF01-P01..P14 before runtime correctness can be claimed.

## 7. Adversarial conclusion

```text
BUILD decision                 = SURVIVES
candidate architecture         = CURRENT GLOBAL MAXIMUM
material reference findings    = 4
findings corrected in contract = 4/4
authority movement             = 0
new external dependency        = 0
runtime correctness proof      = OPEN / REQUIRES AUTHORIZED PROTOTYPE
```

The strongest honest claim is:

> RF-01 is the current planning-level Global Maximum because it composes mature
> staged-tree, hermetic-input, saved-plan, ownership-conflict, exclusive-lock,
> atomic-file and canonical-byte patterns while omitting unneeded merge,
> workspace and execution generality.

It is not yet proven as an implementation. The operator approved the selection
architecture on 2026-08-29; executable proof remains later and cannot be
replaced by this reference review.
