# Testing

What counts as proof for a change in this repository. Owners next door:
[delivery](delivery.md) for CI and the merge gate, [`scripts/conexus-verify.mjs`](../../scripts/conexus-verify.mjs)
for the exact test graph, the [`verify`](../../.agents/skills/verify/SKILL.md) skill for driving
screens, [Builder eval](builder-eval.md) for Builder experiments, and
[evidence](../../.agents/skills/conexus-development/references/evidence.md) for where facts are
found. General method: `principle-test-behavior-not-implementation`, `principle-prove-it-works`.

## A test asserts behavior

- A test calls the code as its user does and compares with a literal value the code computes,
  never one that restates a hand-maintained constant, digest or prompt. A value an owner outside the
  code approved, such as a brand token in [`DESIGN.md`](../../DESIGN.md), is not a restatement.
  Enforced by review.
- No test reads production source text, and no test asserts only truthiness. Enforced by review.
- A route behavior change has an HTTP test that sends the request and asserts the literal status and
  body. Enforced by review.
- Only an `opt-in:` reason skips a test or leaves it todo. Enforced by `scripts/check-test-skips.mjs`.

## Where a test lives

A test joins a group by its folder and suffix, never by a list: `*.browser.test.mjs` drives a real
browser, `*.postgres.test.mjs` needs PostgreSQL, `tests/live` boots a whole Conexus of its own, and
`tests/manual` runs by hand. Enforced by `scripts/conexus-verify.mjs` and
`tests/repository/conexus-verify.test.mjs`, which a change to the graph updates. A harness that runs
in parallel or in a sandbox binds port 0 and reads the port back. Enforced by review.

Expected output changes only through the explicit generation command (`npm run generate`), never by
hand to hide drift. Enforced by the clean tree check after `npm run generate`, and review.

## Real dependencies

- A mock proves only the mocked boundary. A claim about a real provider, model, E2B, Sankhya,
  browser, persistence or runtime needs evidence from that dependency. A test that fakes the boundary
  executing generated code proves nothing about that code: parse or run the generated artifact.
  Enforced by review.
- A live provider, model, E2B or Sankhya run needs explicit authority for that proof; a green
  repository gate never implies it. Enforced by review.
- A claim about Keycloak behavior (refresh, logout, token exchange) cites the documentation or source
  at the pilot's version, or asks for a probe. Enforced by review.

## Negative proof

- Each refusal a change adds has a negative case: another Workspace, another Project, an expired or
  revoked session, a missing or foreign `Origin`. A test of only the allowed path fails. Enforced by
  review.
- A security claim about the runner, the sandbox or the data plane tries each escape on the direct
  path with the other layers off, on the real configuration. A check that cannot fail is not proof.
  Enforced by review.

## Screens

A screen is proved in a real browser against a real Hub with the `verify` skill, in light and dark,
against the accessibility rules of [`DESIGN.md`](../../DESIGN.md). The `verify` model and E2B are
fake, so it cannot prove a Builder turn; the browser suites and `npm run test:live` cover what it
cannot. CI runs the `browser` group; a browser test skipped without an `opt-in:` reason fails
`scripts/check-test-skips.mjs`. The
sign-in theme has no browser suite: its proof is `npm run keycloak-theme:check` output and
screenshots. Enforced by the `browser` group, `npm run web:style:check`, and review.

## Builder proof

A hand-written example can prove a platform mechanism. It cannot close an application-architecture
gate. Where a gate concerns the generated-application programming model, the deciding proof includes
a real Project, a product-language request, the real model path, the Builder finding the paved-road
guidance unaided, Builder-written source, the Project's own check, a Conexus build and Preview,
browser interaction, and the gate's negative proof. Record repair iterations and failures. A Builder
turn is proved on the local Conexus with a real model and a real E2B sandbox. Enforced by review.
