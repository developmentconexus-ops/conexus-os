# Testing guide

What counts as proof for a change. This guide adapts the automated testing section of the
[Microsoft Code With Engineering Playbook](https://github.com/microsoft/code-with-engineering-playbook/tree/main/docs/automated-testing)
(CC BY 4.0) and Google's [test sizes](https://testing.googleblog.com/2010/12/test-sizes.html). Each
rule uses the words of [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119): **must** and **must not**
are defects in review, **should** and **should not** need a stated reason to break, and **may** is
a free choice.

The guide states the target. Tests that depart from it are listed in
[architecture section 11](../reference/architecture.md#11-risks-and-technical-debt) with the wave
that removes them. Owners next door: [delivery](delivery.md) for CI and the merge gate,
[`scripts/conexus-verify.mjs`](../../scripts/conexus-verify.mjs) for the exact test graph, the
[`verify`](../../.agents/skills/verify/SKILL.md) skill for driving screens, and
[security](../reference/security-and-authority.md) for escape tests.

## 1. A test asserts behavior

- A test **must** call the code the way its user does and compare the result with a literal value.
- A test **must not** read production source text, and **must not** assert only that a value is
  truthy.
- A test **should** follow arrange, act, assert, with one behavior per test.

**Why.** A test that reads the source or checks only truthiness still passes when the behavior
breaks.

**Right.** `assert.deepEqual(await grant(input), { ok: false, reason: 'FORBIDDEN' })`.

**Wrong.** `assert.ok(source.includes('FORBIDDEN'))`.

## 2. Test sizes

Every test **must** fit one size, and its group **must** follow from its folder and suffix:

| Size | May touch | Group |
| --- | --- | --- |
| Small | Memory only: no network, database or disk | `tests/repository`, and `tests/implementation` without a suffix |
| Medium | Services on this machine: PostgreSQL, a browser, a local Hub | `*.postgres.test.mjs`, `*.browser.test.mjs` |
| Large | Real outside services: a model, E2B, Keycloak | `tests/live`, `tests/manual` |

- A test joins a group by its folder and suffix, never by a list.
- A harness that runs in parallel **must** bind port 0 and read the port back.
- A test **must** create and remove what it uses, and **must not** sleep to wait for a result.

**Why.** A size says what a test needs and how long it may take, so a fast check stays fast and a
slow one runs where its services exist.

**Right.** A new store test that needs PostgreSQL is named `project-store.postgres.test.mjs`.

**Wrong.** A test in the Small group that opens a TCP port on a fixed number.

## 3. A test that does not run

- Only an `opt-in:` reason **may** skip a test or leave it todo.
- A test **must not** pass silently when the service it needs is missing. It fails, or it is skipped
  with an `opt-in:` reason.

**Why.** A skipped test reports green and proves nothing.

**Right.** `test.skip('opt-in: needs a real E2B key')`.

**Wrong.** A PostgreSQL test that returns early when no database is configured.

## 4. Doubles and real dependencies

- A double **must** prove only the boundary it replaces. A claim about a real provider, model, E2B,
  Keycloak, browser, persistence or runtime **must** have evidence from that dependency.
- A fake of a protocol **should** be preferred over a mock of a function.
- A test of generated code **must** parse or run the generated artifact.
- A run against a live provider, model, E2B or company system **must** have explicit authority for
  that proof.

**Why.** A mock proves the code calls the mock. Only the real dependency proves the system works.

**Right.** A Keycloak refresh claim cites a probe against the pilot's Keycloak version.

**Wrong.** A green test with a mocked model offered as proof that the Builder can build an app.

## 5. Generated output

- Expected output **must** change only through `npm run generate`, never by hand.

**Why.** A hand edit hides drift between the source and what it generates.

**Right.** A new failure row, then `npm run generate`, then a clean tree.

**Wrong.** A test fixture edited to match a generator's new output.

## 6. Negative cases

- Each refusal a change adds **must** have a negative test: another Workspace, another Project, an
  expired or revoked session, a missing or foreign `Origin`.
- An escape test for the runner, the sandbox or the data plane **must** try the direct path with the
  other layers off, on the real configuration.

**Why.** A test of only the allowed path cannot fail when the check is removed.

**Right.** A test where a member of another Workspace reads the Project and gets 404.

**Wrong.** A new access rule tested only with the owner.

## 7. Routes

- A route behavior change **must** have an HTTP test that sends the request and asserts the literal
  status and body.

**Why.** The HTTP test is the contract seen from the caller, including parsing and access.

**Right.** `POST` with a malformed id, asserting 404 and the `code`.

**Wrong.** A test that calls the handler function and skips the route.

## 8. Screens

- A screen **must** be proved in a real browser against a real Hub with the `verify` skill, in light
  and dark, against the accessibility rules of [`DESIGN.md`](../../DESIGN.md).
- What `verify` cannot prove, a Builder turn with a real model, **must** be proved by `tests/live` or
  on the local Conexus.

**Why.** A person sees the screen, not the component. Only a real browser shows what they see.

**Right.** The `verify` recipe opens the Project, sends a request, and checks the Preview.

**Wrong.** A component test with a stubbed fetch offered as proof of the screen.

## 9. Builder proof

- A Builder turn **must** be proved on the local Conexus with a real model and a real E2B sandbox.
- A gate about the generated app's programming model **must** be closed by a real Project: a
  request in product language, the real model, Builder-written source, the Project's own check, a
  Preview, browser interaction, and the gate's negative case.

**Why.** A hand-written example proves a platform mechanism, not that the Builder finds and uses it.

**Right.** A person asks for an app in Portuguese, and the Preview works in the browser.

**Wrong.** A gate closed by an app the developer wrote by hand.

## 10. From change to proof

| Change | Proof |
| --- | --- |
| A function or module | Small tests of its behavior |
| A store or a migration | Medium tests against PostgreSQL |
| A route | An HTTP test, with its negative cases |
| A screen | `verify` in a real browser, light and dark |
| A Builder or agent change | A real turn on the local Conexus |
| A security rule | Negative cases and the escape test |
