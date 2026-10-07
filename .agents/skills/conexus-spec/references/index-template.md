# Spec `index.md` template

What the builder reads. Copy it into `docs/specs/NNNN-title/index.md`.

```markdown
# NNNN. <Title: the outcome, as a noun phrase>

**Date**: YYYY-MM-DD
**Status**: Proposed | Approved by the operator on <date>, commit <sha>
**Lane**: lane:shaped | lane:qualification (<which trigger>)
**Wave branch**: wave/<name>
**Study**: <link to the study report, or where it lives>

## Summary

<Two to four plain sentences: what changes for the person or the code, why now, what it deletes.>

## Requirements

- **AC-1**: <observable, checkable outcome>
- **AC-2**: <the key failure or edge case>
- **AC-N**: ...

<!-- Every unit names the ACs it satisfies. No AC without a unit, no unit without an AC. -->

## References copied

| Mechanism | Reference (`repo/file:line`) | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| <e.g. the permission check> | `documenso/.../get-envelope-by-id.ts:128-140` | <rule in the where clause> | <our subject names its own 404> |
| <mechanism with no reference> | not found (looked in <where>) | | <why we build it anyway> |

## Code shape

The target, compiled. Files in `shape/` beside this spec; `npx tsc --noEmit -p shape` exits 0 at
<commit>. The wave's last unit deletes `shape/`.

- `shape/types.ts`: the data model as types (unions on one literal field, branded ids, no optional
  field that belongs to one state).
- `shape/<module>.ts`: each module's operations and signatures, bodies `not implemented`.
- `shape/usage.ts`: two or three real call sites written as the new code reads.
- `shape/negative.ts`: one `@ts-expect-error` per type rule.

<Short prose only for what the types cannot say.>

## Design

**Data and migration**: <tables, columns, constraints; the one migration; no data statement when
development data is reset>
**API surface**: <table: operation, input, output, refusal codes>
**Value sourcing**: <table: action, value, where it comes from. A value with no source is a question
for the operator, not for the builder>
**Invariants**: <rules that always hold, and where each is enforced>
**Security**: <who may do what, and what an outsider receives>
**Test scenarios**: <one line each, mapped to an AC>

## Deletes and census

| What | Today | Target | Check that holds it |
| --- | --- | --- | --- |
| <e.g. reads that skip admission> | 15 | 0 | <script or lint rule, and its CI step> |

Delete list: <files, exports, functions, tables, failure codes, tests>

## Units

<!-- One card per unit, in order. The builder reads only its card, the sections it cites, and
     shape/. In a wave that changes structure, U1 is the pin: characterization tests or an
     equivalence harness for every surface the wave touches, green on main before any structure
     moves. At most 8 units. The last unit deletes shape/. -->

### U1. <Name>

- **Already there**: <commits, types, contracts this unit uses, each with its file. Nothing from a
  later unit>
- **Creates**: <types, modules, tables, from shape/>
- **Satisfies**: AC-n, ...
- **Files**: <paths written; paths it must not touch>
- **Copies**: <reference row(s) above>
- **Guide sections**: <e.g. C §3, §4, §5; D §5, §6>
- **Deletes**: <what leaves in this unit, with every caller moved>
- **Proof**: <tests by name with literal values; the negative type test; the census number after
  this unit; `npm run verify:quick`>
- **Out of scope**: <what a nearby builder might be tempted to do>
- **Stop if**: <the condition that sends it back>

### U2. ...

## Non-goals

- <what the wave does not do, and who owns it>

## What breaks the premise

- <a fact that, if false, stops the wave; how a spike or the proof would show it>

## Stop rule

Stop and return to the operator when: a unit cannot end green without changing a decision; a
premise line is disproved; the plan grows past <N> product files.
```
