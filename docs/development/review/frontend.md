# Review: Frontend

## Scope

The web app, the brand package and the Keycloak sign-in theme. [`areas.json`](areas.json) owns the paths.

The [`conexus-frontend`](../../../.agents/skills/conexus-frontend/SKILL.md) skill owns how screens
are designed, built and verified. This page does not restate it.

## What to check

- [ ] The change follows the skill's
      [rules that hold everywhere](../../../.agents/skills/conexus-frontend/SKILL.md#rules-that-hold-everywhere).
      Each rule the diff breaks is a failed item.
- [ ] Production composes `@mastra/playground-ui` components. A Conexus component that
      reimplements one fails the [Mastra native](mastra-native.md) census.
- [ ] Values match the issue's literal numbers and copy. Using a token or a class is not proof the
      value is right.
- [ ] A token change updates `DESIGN.md`, `.impeccable/design.json` and
      `tests/implementation/brand-tokens.test.mjs` in the same pull request.
- [ ] A brand component the Keycloak sign-in theme renders has no inline `style` attribute. The
      theme's strict content security policy blocks it. Size goes through a `cx-*` class.
- [ ] A screen the operator asked to see carries `needs:aprovo`.

## Proof required

- For a web app or brand change, the browser leaves ran at the head SHA. The `verify` run log says
  "browser-relevant change detected". If it says the browser suites will be skipped, the proof is
  missing and the item fails. The path list that decides this is in `.github/workflows/verify.yml`.
- A sign-in theme change proves itself differently: no browser suite exercises
  `apps/keycloak-theme/`, so a green "browser-relevant change detected" line is not proof for it.
  The proof is `npm run keycloak-theme:check`'s output pasted in the pull request, plus the
  screenshots below.
- Screenshots in both themes and under reduced motion, per the skill's
  [verification reference](../../../.agents/skills/conexus-frontend/references/verification.md).
- `npm run web:style:check` passed.

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
