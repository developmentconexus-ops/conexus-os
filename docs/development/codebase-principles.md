# Codebase principles

What the code itself must look like. Agents copy what surrounds them, so a clean base is one where
copying the neighbor gives the right result and the wrong way fails to compile or fails CI. Owners
next door: [architecture](../reference/architecture.md) for who owns what, [testing](testing.md)
for proof, [delivery](delivery.md) for shipping. `Method:` names the pstack leaf that holds the
general method; this file does not copy it.

Copy a neighbor only when it follows these rules. A wave that settles a shape migrates every
instance of the old shape and deletes it, not only the lines its diff touched. Old code no open
wave owns is counted by a census that may only fall.

1. **One fact, one owner.** Each type, state, contract, failure code and constant lives in one
   place; the rest is generated or derived. A consumer reads a fact from its owner or from an event
   that carries it, never infers it from a phase change, a timing or message text.
   Enforced by: `scripts/generate-log-codes.mjs`, `scripts/generate-builder-run-vocabulary.mjs`, `scripts/generate-iam-contracts.mjs`, `scripts/generate-hub-role-register.mjs`, `scripts/generate-failures.mjs` (each run by `npm run generate`, then the clean tree check), `npm run contract:check`, `npm run db:callers:check`, and review.
2. **The domain is in the structure.** A lifecycle is a state machine, variants are a union on one
   literal field, ids are branded, and no variant is told apart by a sentinel value such as `''`.
   Method: `principle-model-the-domain`, `principle-type-system-discipline`, `typescript-best-practices`.
   Enforced by: `biome:useExhaustiveSwitchCases`, `packages/contract/src/ids.ts`, `tests/repository/admission-types.test.mjs`, and review.
3. **Firm boundaries.** HTTP, database rows, environment and model output are parsed once at the
   edge with a schema; inside, the type is trusted: no `as`, no `any`, no second validation. A row
   schema uses the contract's types; a module port takes branded ids, never `string`. The app
   manifest is the one hand validator (`server-manifest.ts` stops at the first fault).
   Method: `principle-boundary-discipline`.
   Enforced by: `biome:noUnsafeTypeAssertion`, `biome:noExplicitAny`, `biome:noNonNullAssertion`, `apps/hub/src/reset.d.ts`, `apps/web/src/reset.d.ts`, `biome:noRestrictedImports`, `pgQueryRows`, `pgImportFiles`, `webResponseJson`, `sqlWrites`, `authorityTableWrites`, `gateReferences` (`scripts/census-boundaries.mjs`), `unsafeAssertionDebt`, `unsafeAssertionExemptions` (`scripts/census-builder-run.mjs`), `npm run db:catalog:check`.
4. **Native first.** Owned by [architecture](../reference/architecture.md#native-first).
5. **Modules by subject, not by step.** A file knows one subject and hides its decisions behind a
   small interface; no god file, no function that runs a whole lifecycle, no one-caller wrapper, and
   nothing grows under a size `biome-ignore`. A module is a function returning a frozen object. A class only extends `Error`, `Failure` or a
   library base, or is nominal with a `#private` field its module alone constructs (`Admitted`,
   `CommandGate`); a value hiding a secret (`Redacted`, `AccessToken`) is a class with `#value`.
   Method: `principle-minimize-reader-load`.
   Enforced by: `biome:noExcessiveLinesPerFunction`, `biome:noExcessiveLinesPerFile`, `scripts/check-import-law.mjs`, and review.
6. **One pattern per need.** One way to handle an error, run a transaction, schedule a job, call the
   Hub from the web and draw each UI part. A refusal its caller branches on is a result union on
   `ok`; every other failure throws `Failure`. A second way is a defect.
   Enforced by: `scripts/check-web-style.mjs`, `biome:noRestrictedGlobals`, `biome:noProcessEnv`, `scripts/check-access-owner.mjs`, `apps/hub/src/platform/db.ts`, `apps/web/src/app/http.ts`, and review.
7. **Named failures.** Every failure has a code from one table, its category decided where it is
   raised. An error from a library or service maps by a field it carries, never its message text.
   A `catch` rethrows, maps at a vendor boundary, or logs. A platform failure is fixed in code,
   never offered as "try again".
   Enforced by: `scripts/generate-log-codes.mjs`, `biome:noEmptyBlockStatements`, `biome/plugins/no-error-code.grit`, `DATABASE_FAILURES`, and review.
8. **Operations converge.** Every step can run again after a crash and reach the same end. One
   runner for periodic jobs, one reaper for what expires. What is published after a write is read
   from the committed row; a race is closed in the design, never covered by a poll or a retry.
   Method: `principle-make-operations-idempotent`, `principle-separate-before-serializing-shared-state`.
   Enforced by: `biome:noRestrictedGlobals`, `repeatedTimerSuppressions` (`scripts/census-builder-run.mjs`), `tests/implementation/iam-reaper.postgres.test.mjs`, and review.
9. **Tests of behavior.** Owned by [testing](testing.md).
10. **Observable.** Structured logs with a code and a trace id; every error a person sees leaves a
    log line.
   Enforced by: `tests/repository/hub-log-sinks.test.mjs`, `scripts/generate-log-codes.mjs`.
11. **Nothing dead.** No unused code, no layer for old shapes, no guard for a failure never seen,
    no comment that narrates. Each wave leaves the code smaller. Method: `principle-laziness-protocol`.
   Enforced by: `knip.jsonc`, `biome:noUnusedImports`, `biome:noUnusedVariables`.
12. **Lessons become structure.** A rule repeated becomes a failing check; a rule has one home,
    and status lives in the roadmap and GitHub. Method: `principle-encode-lessons-in-structure`.
   Enforced by: `scripts/check-agent-context.mjs`, `scripts/check-enforced-by.mjs`, and review.

A finding names the principle by number, the file and line, and who fixes it: the change or the
wave owning the shape.

## Never

Each item happened here; review judges it. An item a check comes to fail leaves the list.

- **Never keep state beside what Mastra, E2B or PostgreSQL holds.** A Hub map kept parked runs next
  to Mastra's `pendingSuspensions`. Read the Mastra session. Principle 4.
- **Never create and delete a long-lived resource on every run.** #380 paused the sandbox each run.
  The conversation owns one sandbox and session. Principle 1.
- **Never fix one premise a third time.** Eight pull requests kept "an answer is a new run" alive.
  Stop after the second fix. Principle 12.
- **Never encode a lifecycle in booleans or a sentinel.** `parked`, `answered`, `parking`;
  `projectRevision: ''` in `ProjectPurged`. Write a union with one owner. Principle 2.
- **Never connect two flows through mutable module state.** `fedMirrors`; the web's `liveRuns`.
  Pass the value or give it an owner; a write-once registry keyed by a token its module mints
  (`opened` in `platform/db.ts`) is an owner. Principle 5.
- **Never add a retry, timeout or fallback for an unseen failure.** #486 deleted one such guard.
  Reproduce, then guard what you measured. Principle 11.
- **Never offer "try again" for a Conexus failure.** #481 removed it. Principle 7.
- **Never edit a test so an old shape keeps passing.** Tests kept `fedMirrors` alive. Fix tests
  of behavior, delete tests whose subject is gone. Principle 9.
- **Never assert on production source text.** #486 and #493 removed them. Principle 9.
- **Never keep code because it exists.** #486 deleted 24 scripts, 21 failure codes. A fix adding far
  more than it deletes stops and reports. Principle 11.
- **Never ship a second way for one need.** A native `title` beside `Tooltip`. Replace the old way
  everywhere, or count it in a falling census until a wave settles it. Principle 6.
- **Never infer a fact its producer can carry.** The web reads the check verdict from a phase change;
  `gitFailureName` reads `error.message`. Carry it in the event, row or error. Principle 1.
- **Never cover a race with a poll.** A browser poll repairs a failed run publish. Principle 8.
- **Never write a rule in a second place.** Three never-lists drifted. Link the one home or make
  it a check. Principle 12.
