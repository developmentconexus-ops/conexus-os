# Review: Frontend

## Scope

The web app, the brand package and the Keycloak sign-in theme. [`areas.json`](areas.json) owns the paths.

The [`conexus-frontend`](../../../.agents/skills/conexus-frontend/SKILL.md) skill owns how screens
are designed, built and verified. This page does not restate it.

## What to check

The skill's [rules no check catches](../../../.agents/skills/conexus-frontend/SKILL.md#rules-no-check-catches)
are the checklist for how the screen looks and reads; each one the diff breaks is a failed item. Beyond
them:

- [ ] Values match the issue's literal numbers and copy. Using a token or a class is not proof the
      value is right.
- [ ] A token change updates `DESIGN.md`, `.impeccable/design.json` and
      `tests/implementation/brand-tokens.test.mjs` in the same pull request.
- [ ] A brand component the Keycloak sign-in theme renders has no inline `style` attribute. The
      theme's strict content security policy blocks it. Size goes through a `cx-*` class.
- [ ] A screen the operator asked to see carries `needs:aprovo`.

## Proof required

- The change was proved as the skill's
  [Prove it](../../../.agents/skills/conexus-frontend/SKILL.md#prove-it) section says, and
  `npm run web:style:check` passed.
- For a web app or brand change, the browser leaves ran at the head SHA. Every `verify` run
  executes the browser leaves. A skipped browser leaf is a failed item.
- A sign-in theme change proves itself differently: no browser suite exercises
  `apps/keycloak-theme/`, so browser suites passing is not proof for it. The proof is
  `npm run keycloak-theme:check`'s output pasted in the pull request, plus screenshots.

## Traps from history

- The wordmark was sized with an inline `style`, which the sign-in theme's strict content security
  policy blocks. The first fix commit also mapped `xs` to the wrong size against the issue's contract, and a
  second commit corrected it before merge. Fixed by #244 (`511c2fca`). Now at
  `packages/brand/src/tokens.css:134-137`.
- The web app imported `lucide-react` directly while only a transitive dependency supplied it.
  Fixed by #242 (`24fc75e3`). Now at `package.json:111`.

## Principles

- **Experience First.** Honest states and pt-BR copy are the product. A faster build with a fake
  state fails.
- **Prove It Works.** A screen is proven in a real browser, in both themes, not by a typecheck.
- **Laziness Protocol.** Compose the Mastra primitive and restyle it with tokens before building a
  component.
- **Test Behavior, Not Implementation.** A browser test asserts what a person sees, not a class
  name.
