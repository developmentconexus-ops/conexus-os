# Review checklist

This file is the index of the Conexus review. It says which pages a review loads, the items every
pull request meets, and the verdict. Request changes only for a
failed item or a correctness defect, never for preference. Each item comes from
[the delivery rules](delivery.md) or the owner it links.

## Load the pages

The rules that judge a pull request come from `origin/main`, the approved reference, never from
its head or its base. A stacked pull request's base is another open pull request, which may change
the rules. The rules are this checklist, the pages, and `areas.json`. The code is still
compared with the pull request's base.

1. Fetch the approved reference first, because a local `origin/main` can be stale:
   `git fetch origin main`. Then read the map:
   `git show origin/main:docs/development/review/areas.json`.
2. List every changed path, across all pages:
   `gh api --paginate repos/developmentconexus-ops/conexus-os/pulls/<n>/files --jq '.[].filename'`.
   `gh pr view <n> --json files` stops at 100 files.
3. Match each changed path against each area's `paths`. The grammar is portable on purpose: an
   exact path, `dir/**` for every path under `dir` (dotfiles included), and `*` for any run of
   characters inside one segment. A test maps to the area of the code it proves.
4. Load every matched page with `git show origin/main:<page>`, and always
   [`mastra-native.md`](review/mastra-native.md).
5. A changed path is not covered when no area other than a universal one matches it in the map
   on `origin/main`. `mastra-native`, whose paths are `["**"]`, does not count. Judge such a path
   by the page the pull request's own map assigns, loaded from the head, and name it in the
   review: `new area path: <path>, page <page>, loaded from the head`.

The pages are [mastra-native](review/mastra-native.md), [identity-session](review/identity-session.md),
[data-migrations](review/data-migrations.md), [connectors](review/connectors.md),
[frontend](review/frontend.md), [builder-factory](review/builder-factory.md),
[contracts](review/contracts.md) and [platform](review/platform.md).

## Scope and lane

- [ ] The pull request links its issue and says what changes, for whom.
- [ ] The lane label matches the change. A `lane:fast` change has no Q trigger, fits one pull
      request, and stays inside accepted product meaning.
- [ ] `needs:aprovo` is present if the change migrates real data, touches security or
      authentication, or changes a screen the operator asked to see.
- [ ] The diff does only what the issue asks. Unrelated changes are in their own pull request.

## Authority and design

- [ ] No product meaning is invented in code. A new requirement, owner or trust boundary goes to
      its owning document or decision first.
- [ ] Each meaning has one owner. The change adds no second source of truth.
- [ ] A new dependency comes with the evidence the technology rule asks for.

## Types

These items judge the TypeScript the diff adds or changes. Biome in `biome.json` already fails
`any`, a non-null `!`, a `switch` that misses a union member, and `console` in `apps/web/src` and
`packages/*/src`. `tests/repository/hub-log-sinks.test.mjs` keeps the Hub's logs on its logger.

- [ ] A value with variants is a union on one literal field such as `kind`, not optional fields or
      flags whose valid combinations need a comment. A `default` arm on that union assigns the
      value to a `never` local, so a new variant fails the compile. Owner: Type System Discipline.
- [ ] Where the loose type forced a `!`, a cast or a "cannot happen" throw, the type is built so
      the illegal value cannot be written: `[T, ...T[]]` for non-empty, a start and a duration
      for a range. A plain `T[]` stays where every use is total. Owner: Type System Discipline.
- [ ] Two values that share a primitive but mean different things, such as two ids, are branded
      with `string & { readonly __brand: 'X' }` and created once by a parse function. Owner: Type
      System Discipline.
- [ ] A new `as` other than `as const` follows the validation that proves it. A literal checked
      against a type uses `satisfies`. A guard named `isX` or `hasX` checks every field its type
      claims. Owner: Type System Discipline.
- [ ] A type that repeats a shape another file owns derives from it with `Pick`, `Omit`,
      `ReturnType`, `Awaited`, `typeof` or `z.infer`, not a new interface. A new function whose
      positional arguments could be swapped unnoticed takes one object, except on a hot path.
      Owner: Type System Discipline.

## Tests and secrets

- [ ] Each new or changed test calls the code as its users do and asserts a literal value the code computes, never one that restates a hand-maintained constant, digest or prompt. A value an owner outside the code approved, such as a brand token in `DESIGN.md`, is not a restatement.
- [ ] No design was reshaped to keep a test passing. Tests whose subject is gone are deleted.
- [ ] No secret, token or credential appears in code, fixtures, logs or the pull request body.

## Documents

- [ ] Status and next actions live in the roadmap and GitHub, not in `AGENTS.md` or a skill.
- [ ] A rule has one home. Other files link to it instead of copying it.

## Verdict

- The review names the head SHA, the pages it loaded, the census table or "no new mechanism", and each failed or unevaluated item with its evidence. Any failed or unevaluated item, or a correctness defect, is `request changes`, otherwise `approve`.

## CI guards against repeated patching and forgotten flaky tests

- **Patch churn guard.** A pull request whose title starts with `fix` fails the `patch-churn` check
  (`scripts/check-patch-churn.mjs`, its own workflow) when it touches a file with three or more `fix(` or `fix:` commits on `main` in
  the last 30 days. Only production source under `apps/*/src` and `packages/*/src` counts, generated files excluded, so registries and tests that every fix touches do not trip it. The message lists the
  commits and asks you to check the premise first. If a redesign was considered, add the label `premise-checked`. `npm run verify:quick`
  prints the ten hottest files without failing.
- **Test quarantine.** A test that fails only sometimes may be listed in `tests/quarantine.json` as
  `{ "test": "<file>:<test name>", "issue": <number>, "until": "YYYY-MM-DD" }` (the file ships empty). The `test-quarantine` step
  fails when an entry is past `until`, more than 14 days ahead, has no issue number, or names a test that does not exist. The runner
  cannot run a quarantined test without blocking, so quarantine by hand: add the entry, open the tracking issue, and mark the test
  `{ skip: 'opt-in: quarantined, see #<issue>' }`, the one skip `only-opt-in-skips` accepts. When the date passes the check fails
  until the test is fixed and the entry removed.
