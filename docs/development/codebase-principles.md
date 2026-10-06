# Code guide

How Conexus code is written. This guide adapts the
[Google TypeScript Style Guide](https://google.github.io/styleguide/tsguide.html) (CC BY 3.0) and
follows its order. Where this guide is silent, the Google guide applies. Biome owns formatting.
Each rule uses the words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and
**must not** are defects in review, **should** and **should not** need a stated reason to break,
and **may** is a free choice. A rule marked **Conexus decision** departs from or adds to the Google
guide, and says why.

The guide states the target. Code that departs from it is a defect, listed in
[architecture section 11](../reference/architecture.md#11-risks-and-technical-debt) with the wave
that removes it. Copy a neighbor only when it follows this guide. A wave that settles a shape moves
every instance of the old shape and deletes it.

Owners next door: [architecture](../reference/architecture.md) for who owns each concept and native
first, [testing](testing.md) for tests, and [delivery](delivery.md) for review and shipping. The
general method lives in the pstack skills `typescript-best-practices`, `principle-model-the-domain`,
`principle-type-system-discipline`, `principle-boundary-discipline`,
`principle-minimize-reader-load` and `principle-laziness-protocol`.

## 1. Source files and modules

- A file **must** hold one subject and hide its decisions behind a small interface.
- Code **must** use named exports. It **must not** use default exports, except where a tool
  requires one (a config file or a route file).
- Code **must not** export a mutable binding (`export let`).
- **Conexus decision.** A module is a function that returns a frozen object of its operations.
  Its state lives in the closure. A module reaches another only through that object, never by a
  deep import (`scripts/check-import-law.mjs`).
- A function **must not** run a whole lifecycle, and a wrapper with one caller **must not** exist.
  A file or function **must not** grow under a size suppression.

**Why.** A reader, person or agent, answers "where is X" by the subject name and changes one file
for one decision. A closure keeps state private at runtime without `this`, and nothing in the Hub is
extended, so a class buys nothing over a function.

**Right.**

```ts
export const createProjectModule = (deps: ProjectDeps) => {
  const store = createProjectStore(deps.db)
  return Object.freeze({ create: (input: CreateProject) => store.create(input) })
}
```

**Wrong.** `startHub` in `hub.ts` composes every module in one function, kept past the size limit
by a `biome-ignore`.

## 2. Classes

- **Conexus decision.** A class **must** be one of four kinds:
  - an error that extends `Error` or `Failure`,
  - a subclass of a library base (for example the E2B `Sandbox`),
  - a nominal type with a `#private` field that only its own module constructs (`Admitted`,
    `Checked`, `Gate`),
  - a value that hides a secret in a `#value` field (`Redacted`, `AccessToken`).
- A class **must not** exist only to group static members (Google).
- **Conexus decision.** `#private` is allowed for the last two kinds, against the Google guide.
  TypeScript's `private` disappears at runtime, so it can neither brand a type nor keep a secret out
  of `JSON.stringify`.

**Why.** better-auth, Documenso and the TypeScript compiler write the same rule: functions and
closures, classes only where the language needs one. Mastra uses classes because its users extend
its classes, and nobody extends a Hub module.

**Right.** `class Checked { #brand = true }`, constructed only by `admission.ts`, so no other module
can forge a checked read.

**Wrong.** A class with mutable state and methods that a module could have been, such as a scope
object with `live()`, `spend()` and `revoke()`.

## 3. Functions

- **Conexus decision.** A named function **may** be a `const` arrow, where the Google guide prefers
  a function declaration. The module's operations are arrows in its frozen object, and the code
  keeps one shape.
- A function **should** take one object when it takes more than two parameters, and **must not**
  take two neighboring parameters of the same type that a caller can swap (Effective TypeScript,
  "Avoid repeated parameters of the same type").
- A function **must not** use `this` outside a class.

**Why.** One shape for a module's operations keeps every module readable the same way. Swapped
arguments of the same type compile and fail at runtime.

**Right.** `grant({ projectId, accountId })`.

**Wrong.** `grant(projectId, accountId)`, with both typed `string`.

## 4. Data modeling and types

- A lifecycle **must** be a state machine: a union discriminated on one literal field, with one
  owner of its transitions.
- A type **must** make an illegal state unrepresentable. A variant **must not** be told apart by a
  sentinel value such as `''`, `-1` or `null`, or by a set of booleans.
- An id **must** be a branded type from `packages/contract/src/ids.ts`. A module port **must not**
  take an id as `string`.
- Optional properties **should** be rare. A field that exists in one state belongs to that state's
  variant (Effective TypeScript, "Limit the use of optional properties").
- Code **must not** use `any` (use `unknown`), `as`, or the non-null assertion `!`. Biome refuses
  them.
- **Conexus decision.** Code **should** use `type`, where the Google guide prefers `interface` for
  object shapes. Zod schemas produce types with `z.infer`, and a union can only be a `type`. An
  `interface` **may** declare a shape a library extends.
- A fact **must** have one owner: each type, state, contract, failure code and constant lives in one
  place, and the rest is generated or derived from it. A consumer reads a fact from its owner or
  from an event that carries it, never infers it from a phase change, timing or message text.

**Why.** When the type allows only valid states, the compiler checks the domain, and a reader sees
the lifecycle in one place instead of in scattered `if` statements.

**Right.**

```ts
type ProjectState =
  | { kind: 'ACTIVE'; revision: SourceRevision }
  | { kind: 'DELETING'; requestedAt: Instant }
```

**Wrong.** `{ archived: boolean; deleting: boolean; projectRevision: string }`, where
`projectRevision: ''` means the Project was purged.

## 5. Boundaries

- Data from outside **must** be parsed once, at the edge, with a Zod schema: HTTP bodies, database
  rows, environment, files and model output. Inside, code **must** trust the type and **must not**
  validate it again.
- A row schema **must** use the contract's types, not `z.string()` for a value the contract
  narrows.
- The app manifest is the one hand-written validator, because it stops at the first fault in a
  large untrusted file (`server-manifest.ts`).

**Why.** One parse at the edge gives the inside one trusted type. A second check inside hides
which value is the truth and grows with every caller.

**Right.** `const row = ProjectRow.parse(result.rows[0])`, then `row.revision` is a
`SourceRevision`.

**Wrong.** `const body = (await response.json()) as Account`.

## 6. Errors

- Code **must** throw only `Failure`, or a subclass of `Error` in code that runs outside the Hub.
- Every failure **must** carry a code from the one failure table (`contracts/technical/failures.json`),
  with its category decided where it is raised.
- A refusal its caller branches on **must** be a result union on `ok`. Every other failure throws.
- An error from a library or a service **must** be mapped by a field it carries (a status, a code,
  an SQLSTATE), never by its message text.
- A `catch` **must** rethrow, map at a vendor boundary, or log. It **must not** be empty.
- A failure a person sees **must** leave a structured log line with its code and trace id.
- A platform failure **must** be fixed in code, never offered to the person as "try again".

**Why.** One table of codes gives every failure one meaning, one text for the person and one log
line for the developer. Mastra (`MastraError` with a domain and a category) and better-auth (one
table of error codes) work the same way.

**Right.** `throw new Failure('BUILDER_SOURCE_BASE_MOVED')`.

**Wrong.** `if (/ADMISSION_ROW/.test(error.message))`.

## 7. State and concurrency

- Two flows **must not** share mutable module state. Pass the value, or give it one owner. A
  write-once registry keyed by a token its module mints is an owner (`opened` in `platform/db.ts`).
- Every operation **must** reach the same end when it runs again after a crash.
- A race **must** be closed in the design. It **must not** be covered by a poll or a retry.
- Code **must not** keep state beside what Mastra, E2B or PostgreSQL already holds.

**Why.** Shared mutable state and polls hide the order of events, so a bug shows up only under load
or after a restart.

**Right.** The Hub publishes a run's settlement from the committed row, and the screen reads it.

**Wrong.** The Hub swallows a failed publish because a browser poll will read the run anyway.

## 8. Naming

- Names **must** use the domain's words, the same names as [the product guide](../product/contract.md#4-concepts)
  and the [architecture glossary](../reference/architecture.md#12-glossary). One concept has one
  name.
- Names follow the Google guide: `camelCase` for values and functions, `PascalCase` for types,
  `CONSTANT_CASE` for module constants, and no prefix or suffix such as `I` or `Impl`.

**Why.** When the code, the screen and the guides use one word, a search finds every place a
concept lives.

**Right.** `ModelAccountId`, `ConnectionBinding`.

**Wrong.** `model_connection` for a model account, beside `connection` for a company system.

## 9. Comments

- A comment **must** say a why the code cannot show. It **must not** narrate what the code does.
- Exported functions **may** carry a JSDoc line when the name does not say enough.

**Why.** A narrating comment repeats the code and drifts from it at the first change.

**Right.** `// The compare-and-swap: main moves from exactly the run's base.`

**Wrong.** `// Loop over the rows and push each one.`

## 10. Redundancy and abstraction

- One need **must** have one pattern: one way to handle an error, run a transaction, schedule a
  job, call the Hub from the web and draw each UI part. A second way is a defect. Replace the old
  way everywhere in the wave that adds the new one.
- An abstraction **must** have at least two real callers. Three similar lines are better than a
  helper with one caller.
- Code **must not** add a retry, timeout, fallback or guard for a failure nobody has seen.
  Reproduce it, then guard what you measured.
- Nothing dead stays: no unused code, no layer for an old shape, no code kept because it exists.
  Each wave leaves the code smaller.

**Why.** Every second way and every speculative layer is code an agent copies and a reader must
understand. Deleting is the cheapest way to keep the base clear.

**Right.** A native `title` attribute beside the `Tooltip` component is replaced everywhere by
`Tooltip`.

**Wrong.** A fix that adds far more than it deletes, to keep an old shape alive.

## 11. Lessons become structure

A rule a reviewer writes twice becomes a check that fails: a Biome rule, a type, a census that may
only fall, or a test. A rule lives in one guide. A finding names the guide section, the file and
line, and the wave that fixes it.
