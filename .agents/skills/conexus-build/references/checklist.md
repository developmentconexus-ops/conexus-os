# Build checklist

Each item names the guide rule it comes from: C is the
[code guide](../../../../docs/development/codebase-principles.md), T the
[testing guide](../../../../docs/development/testing.md). The report's `## Checklist` table lists
every item.

## Before you write

1. Every type, contract and value the card uses exists at the head you started from, or this unit
   creates it. One fact has one owner (C §4).
2. Your code will match the `shape/` files the card names: the same names, unions and signatures.
   If a `shape/` file conflicts with a guide, stop and report the conflict with both `file:line`s;
   do not choose one ([L, Stop, then escalate](../../../../docs/development/delivery.md#stop-then-escalate)).
3. You read each reference the card copies, at its `file:line`.
4. You read the guide sections the card cites and the `AGENTS.md` of each area you touch.

## While you write

5. A named top level function is a `function` declaration (C §3).
6. A module is a function that returns a frozen object of its operations; named exports only; no
   wrapper with one caller; no size suppression (C §1).
7. A lifecycle is a union on one literal field. No state told apart by `''`, `-1`, `null` or a set
   of booleans. A field that exists in one state lives in that state's variant (C §4).
8. An id is a branded type from `packages/contract/src/ids.ts`. No port takes an id as `string`
   (C §4).
9. No `any`, no `as` other than `as const`, no `!` (C §4).
10. Outside data is parsed once, at the edge, with Zod, and row schemas use the contract's types.
    Nothing inside validates it again (C §5).
11. Only `Failure` is thrown, with a code from the failure table. A refusal the caller branches on
    is a result union on `ok`. No empty `catch`. A library error is mapped by a field, never by its
    message (C §6).
12. One need, one pattern. No speculative retry, timeout, fallback or guard. The old shape is
    deleted and every caller moved in this unit (C §10).
13. Names are the domain's words from the product contract and the glossary. A comment says only a
    why the code cannot show (C §8, §9).
## Proof

14. A test calls the code as its user does and compares with a literal value (T §1), and sits in
    the group its size names (T §2).
15. Each refusal the unit adds has a negative test (T §6). A route change has an HTTP test with the
    literal status and body (T §7).
16. Each type rule the unit adds has a negative type test that does not compile
    (`@ts-expect-error`).
17. Generated output changed only through `npm run generate` (T §5).
18. The census number the card names is reached.
19. `npm run verify:quick` is green, and the `deslop` and `no-comments` passes of the skill's step 5
    ran.
