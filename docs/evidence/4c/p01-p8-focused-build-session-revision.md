# P-01 P8 — Focused Build Session revision

> **Status:** `OPERATOR ACCEPTED / P8 FOCUSED REVISED CANDIDATE / NOT LOCKED`
> **Block:** P-01 — Build workspace
> **Authority impact:** interaction-only; no Product/wire/Permission/owner change
> **Current P8 blob:** `02a07c7f8fd654a75eb066ee914247f0160a64f8`

## Operator falsifier

The shell-coherent P8 still rendered too much Builder truth at once. Changes, Preview, Plan, Findings, Evidence and execution detail competed for the same viewport, making the program difficult to see and making normal AI-assisted building feel like a governance dashboard.

The falsifier is density/focus, not missing Builder authority and not a rejection of P7.

## Target interaction invariant

```text
Build Overview != Focused Build Session

Build Overview
→ recognize / create / resume a Change

Focused Build Session
→ exact Change
→ Preview + Conexus = default focused work
→ Preview default / dominant
→ Code / Diff inspectable read-only lenses
→ Plan / Findings / Evidence / Details = on-demand inspector
```

This restores the accepted experience law:

```text
simple by default + inspectable by design
```

rather than making the product inspectable-by-default.

## Selected realization

The operator accepted the bounded design on 2026-08-24:

1. Keep the locked GF-01 Project shell unchanged.
2. Make Build root an overview for Change recognition and entry.
3. Opening an exact Change enters a focused session; the Changes collection leaves the work canvas.
4. Keep Conexus open by default beside the dominant Preview, but retractable for maximum Preview width.
5. Keep Plan, Findings, Evidence and execution details complete but closed behind one on-demand inspector.
6. Keep fixture/material-state controls outside the focused session.

## Preserved authority

```text
conversation != Change
conversation != Plan truth
conversation != Progress truth
conversation != verification
Hub progress != model narration
Preview ready != verified != live
project.build != project.review != project.source.read
```

No new operation, Permission, owner, durable record, source mutation, review grant or frontend-derived verification is introduced.

## Artifact lineage

```text
first P8                 0abcde6902a1540aabb07e54ff08d59ad430e7ab
shell-coherent revision  43ec72ec7443e6d28cbd3abcd0cb79f2d1955db7
focused-work revision    02a07c7f8fd654a75eb066ee914247f0160a64f8
```

## Proof chronology

```text
Verify #829 — selected focus RED
110 tests / 109 pass / 1 exact expected failure

Verify #830 — focused behavior passed; legacy Escape guard false-positive only

Verify #831 — focused behavior + formatting-insensitive accessibility guard GREEN
```

Current gate remains:

```text
APPROVE | REVISE
```

P-01 is NOT LOCKED. P-02+, P11, 4D and Product implementation remain blocked.
