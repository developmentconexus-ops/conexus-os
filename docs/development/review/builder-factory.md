# Review: Builder and Factory

## Scope

The Builder: the Mastra Factory the Hub runs, its routes and runtime, the compiler template, the
Factory skills, and the Builder scripts and evaluation cases. Paths, as [`areas.json`](areas.json)
lists them:

- `apps/hub/src/builder/**`
- `apps/hub/src/factory-cli.ts`
- `apps/hub/compiler-template/**`
- `factory-skills/**`
- `scripts/builder-eval/**`
- `scripts/builder-e2b-template.mjs`
- `scripts/hub-factory.mjs`

## What to check

- [ ] The Hub runs the Mastra Factory as it ships. Conexus overrides only what the
      [Mastra boundary](../../reference/mastra-boundary.md) records, through documented extension
      points.
- [ ] Generated application code never runs in the Hub process. It runs in the E2B sandbox or the
      application runner.
- [ ] Every error code the Builder can throw is declared in
      `apps/hub/src/builder/failure-vocabulary.ts`. An undeclared code reaches the wire as a generic
      internal error.
- [ ] Setup steps that depend on each other keep their order, and a test fails on the old order.
- [ ] A harness that runs in a sandbox or in parallel binds port 0 and reads the port back. A fixed
      port fails.
- [ ] A headless browser check in a sandbox without network intercepts subresource requests, so an
      app that links an external asset does not time out.
- [ ] A change to Factory skills or the compiler template keeps the paved road the Builder finds
      without the operator naming files. Owner: [Builder proof rule](../delivery.md#builder-proof-rule).

## Proof required

- A test that fakes the boundary which executes generated code proves nothing about that code. The
  generated script, template or artifact is parsed or run for real.
- The Builder leaves the change touches (for example `c020-builder-postgres`, `factory-runtime`,
  `factory-composition`, `factory-recovery-postgres`) ran at the head SHA with zero skipped cases.
- A change that closes an application-architecture gate meets the
  [Builder proof rule](../delivery.md#builder-proof-rule): a real Project, a product-language
  request, the real model path, a Conexus build and Preview, and browser interaction.
- A claim about model, E2B or Factory behavior has evidence from that dependency, with explicit
  authority for a live run.

## Traps from history

- The generated boot smoke script had a top-level `return` in a `.mjs` file, so every build failed
  its smoke. Twelve tests passed because they faked `commands.run`. Fixed by #133 (`9c0c62cb`),
  which runs `node --check` on the exact script. Now at
  `tests/implementation/builder-application-runtime.test.mjs:62`.
- Two refusal codes were thrown but not declared, so they reached the wire as internal errors.
  Fixed by #132 (`d5bd96bb`). Now at `apps/hub/src/builder/failure-vocabulary.ts:77-79`.
- Memory settings could switch a model before tenant credentials and custom providers were primed,
  so runs failed intermittently and lost completed edits. Fixed by #160 (`033e34ed`), which primes
  first and adds an order test. Now at `apps/hub/src/builder/factory-runtime.ts:381-388`.
- The smoke server and DevTools used fixed ports, and two smokes on one host collided. Fixed by #186
  (`3ab95f09`). Now at `apps/hub/src/builder/application-artifact-runtime.ts:262-267`.
- An app that loaded a web font hung the network-isolated smoke until it timed out. Fixed by #141
  (`b3f61d8a`), which answers foreign requests through CDP `Fetch`. Now at
  `apps/hub/src/builder/application-artifact-runtime.ts:330-337`.

## Principles

- **Prove It Works.** Run the generated artifact. A mocked executor is not proof.
- **Fix Root Causes.** A Builder failure is reproduced on a real run id before the fix, as #160 did.
- **Make Operations Idempotent.** Provisioning, recovery and run settlement converge after a crash
  or a retry.
- **Model the Domain.** One failure vocabulary maps every code. A new code is a row, not a branch.
- **Test Behavior, Not Implementation.** A test asserts the run's outcome, not the calls the
  runtime made.
