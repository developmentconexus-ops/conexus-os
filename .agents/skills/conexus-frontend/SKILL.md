---
name: conexus-frontend
description: This skill should be used for any change under `apps/web`, `packages/brand` or `apps/keycloak-theme` in Conexus OS, and whenever work adds or changes a screen, interface copy, a color, a font, spacing, layout, an icon, motion or any other visual. Triggers include "new screen", "nova tela", "tela de login", "sign-in page", "Keycloak theme", "redesign", "restyle", "layout", "cor", "ícone", "texto da interface", "copy", "brand", "tema escuro", "dark mode", "celular", "responsivo", "mobile", "acessibilidade", "screenshot", "print da tela", "Construir", "composer", "Encaixe", and requests to review, polish or verify the web UI.
---

# Conexus frontend

How Conexus screens look, read and are proved: the web app (`apps/web`), the brand package (`packages/brand`) and the Keycloak sign-in theme (`apps/keycloak-theme`). The flow is the Frontend flow of [`conexus-development`](../conexus-development/references/flows.md#frontend) on top of Build, Fix or Redesign; this skill adds the rules below and owns no check. The code is the reference: read the nearest screen, and when `packages/brand/src/tokens.css` disagrees with any text here, the file wins.

## Rules no check catches

- **pt-BR only.** Sentence case, verbs on buttons, no emoji. [voice-and-copy](references/voice-and-copy.md).
- **One accent.** Ipê marks focus, selection, the active lens and the agent at work. It is never a button fill.
- **Ink primary buttons.** The primary action is `--cx-ink` with `--cx-on-ink`.
- **Color never alone.** Every status travels with a word and usually a mark.
- **Three faces by role.** Display for headings, body for language, mono for facts only.
- **Hairlines, not shadows.** Radius comes from the scale in `tokens.css`; regions and panes take none.
- **Encaixe is the only authored motion.** Everything stops under `prefers-reduced-motion`.
- **Honest states.** Show only what the server says; keep loading, empty, failed and unknown apart; never fake progress, counts or actions; mark unbuilt things "em breve".
- **One way per need (C-031).** Conexus designs structure and page patterns. `@mastra/playground-ui` supplies parts only: basic parts and agent display parts, repainted through `apps/web/src/mastra-theme.css`; structure blocks (`AppShell`, `MainSidebar`, `ChatShell`) stay where they are and no new screen adopts one. Never fork a part. [`docs/decisions/index.md`](../../../docs/decisions/index.md) owns the decision.

## What a check decides

`npm run web:style:check` decides raw colors, fonts, native `title`, the CSRF cookie and every class a screen writes. Run it and fix what it prints; do not restate or work around it.

## Prove it

Do not stop at the typecheck. Prove the screen with the [`verify`](../verify/SKILL.md) skill: a disposable Hub with real PostgreSQL and Keycloak, driven in a browser. Its limit: the model and E2B are fake, so a Builder turn cannot be proved there. The browser suites in `tests/` and `npm run test:live` cover flows `verify` cannot. Then:

- Light and dark, and `prefers-reduced-motion` emulated.
- Keyboard: Tab reaches every action in reading order, the focus ring shows, Esc closes what opened, no drag without a keyboard path.
- Names: every input has a label, every icon-only button a pt-BR `aria-label`.
- Reflow at 390px and 200% zoom, no sideways scroll. Console without errors or CSP violations.
- No English left by a Mastra component, `aria-label` and placeholder included.
- Sign-in theme: `npm run keycloak-theme:check`; no browser suite exercises it. Never type the operator's password.

## References

- [`voice-and-copy.md`](references/voice-and-copy.md): voice, nouns, failure and agent copy.
- [`iconography.md`](references/iconography.md): Lucide rules.
- [`visual-foundations.md`](references/visual-foundations.md): the intent of color, type, layout and motion.
- [`product-surfaces.md`](references/product-surfaces.md): shape a new surface before building it.
- Owners: [`frontend-and-product-surfaces.md`](../../../docs/reference/frontend-and-product-surfaces.md) (section 33.6 owns Build), [`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md) (commands), [`review/frontend.md`](../../../docs/development/review/frontend.md) (what the reviewer checks), [`verify/features`](../verify/features/README.md) (screens by feature), `PRODUCT.md` (users).
