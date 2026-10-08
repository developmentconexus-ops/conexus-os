# Spec `index.md` template

What the builder reads. Copy it into `docs/specs/NNNN-title/index.md`.

## Unit cards

A card resolves implementation decisions before build. Map every file action and proof to its unit
and AC. Trace callers, reexports, executable scripts and CI discovery, including intersecting tests,
fakes, manual tools, configuration and generated or pinned artifacts. A names-only file list is
insufficient. Use shared baseline, contract, reference and consumer rows once; cards cite those rows.
Separate moves from behavior changes and order prerequisites so each unit uses only existing owners
or owners it creates. Register an owner with native verifiers in the first unit that consumes it.
Use [delivery's CI impact rule](../../../../docs/development/delivery.md#proof-and-verification)
for closure and reused evidence. The compiled shape proves contracts; concise sequences capture
transaction, refusal, error and concurrency decisions that types cannot express.

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

| Mechanism | Reference (revision, `repo/file:line`) | Kept as is | Adapted, and why |
| --- | --- | --- | --- |
| <e.g. the permission check> | `documenso/.../get-envelope-by-id.ts:128-140` | <rule in the where clause> | <our subject names its own 404> |
| <mechanism with no reference> | not found (looked in <where>) | | <why we build it anyway> |

## Code shape

The target, compiled. Record the inspected source head, dependency lock and installed library
versions. Files in `shape/` beside this spec; `npx tsc --noEmit -p shape` exits 0 at <commit>.
The wave's last unit deletes `shape/`. For uncertain contracts or architecture, record a minimal
executable proof against actual repository owners and installed libraries, with negative call sites,
command, head, result and unproved limits. Declaration stubs do not prove native implementability.

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

- **Baseline**: <inspected source head and pinned dependency versions, or shared baseline row>
- **Already there**: <prerequisite units and actual imported owners, public entries and types,
  each with its file. Nothing from a later unit>
- **Creates**: <final responsibilities and target signatures from shape/, citing shared contracts>
- **Satisfies**: AC-n, ...
- **Files**: <the action map below; protected paths it must not touch>
- **Copies**: <reference row(s) above>
- **Guide sections**: <owning rules and any justified guide change, assigned to an action row>
- **Deletes**: <action rows that remove the old ownership, API and assumptions with all callers>
- **Logic**: <short sequence or small pseudocode for decisive operation, transaction, refusal,
  escaping failure and concurrency behavior. Cite actual owner contracts; do not copy whole bodies>
- **Proof**: <the proof map below, including `npm run verify:quick` and full CI impact closure>
- **Out of scope**: <what a nearby builder might be tempted to do>
- **Stop if**: <the condition that sends it back>

| Path and symbol | Current owner and callers | Action and target | Unit and AC | Proof |
| --- | --- | --- | --- | --- |
| <exact product path/export> | <actual imports/reexports and responsibility> | <create/change/move-to/delete; target signature or contract row> | U1, AC-n | P1 |
| <test/fake/script/config/generated/CI path> | <consumer and native command/discovery edge> | <migrate/delete/register now, with guard retained> | U1, AC-n | P2 |

| Proof | Unit and AC | Command and observable result | Head and status | Reused evidence and why valid |
| --- | --- | --- | --- | --- |
| P1 | U1, AC-n | <behavior with literal values and negative call sites against actual owners> | <source/dependency head; passed or unproved limit> | <receipt/head, or none> |
| P2 | U1, AC-n | <affected CI groups, verifier registration, deletes/census and artifact/pin checks> | <source head and result> | <unaffected receipt/head and validity reason> |

### U2. ...

## Non-goals

- <what the wave does not do, and who owns it>

## What breaks the premise

- <a fact that, if false, stops the wave; how a spike or the proof would show it>

## Stop rule

Stop and return to the operator when: a unit cannot end green without changing a decision; a
premise line is disproved; the plan grows past <N> product files.
```
