---
name: conexus-frontend
description: This skill should be used for any change under `apps/web`, `packages/brand` or `apps/keycloak-theme` in Conexus OS, and whenever work adds or changes a screen, interface copy, a color, a font, spacing, layout, an icon, motion or any other visual. Triggers include "new screen", "nova tela", "tela de login", "sign-in page", "Keycloak theme", "redesign", "restyle", "layout", "cor", "ícone", "texto da interface", "copy", "brand", "tema escuro", "dark mode", "celular", "responsivo", "mobile", "acessibilidade", "screenshot", "print da tela", "Construir", "composer", "tokens.css", "mastra-theme.css", "Encaixe", "Claude Design", and requests to review, polish or verify the web UI.
---

# Conexus frontend

This skill is how Conexus screens are designed, written, built and verified. It covers the web app (`apps/web`), the brand package (`packages/brand`) and the Keycloak sign-in theme (`apps/keycloak-theme`).

Load `.agents/skills/conexus-development/SKILL.md` first for bootstrap and the route of each lane. This skill adds only the frontend layer.

## The repository is the source of truth

- `packages/brand/src/tokens.css` defines every color, font, radius and easing. When anything else disagrees with it, including this skill, `tokens.css` wins.
- The screens in `apps/web/src` are the reference implementation. Read the nearest existing screen before building a new one.
- The Claude Design project "Conexus Design System" mirrors `main` for prototyping. Never copy its JSX kit into the repository: production composes Mastra `@mastra/playground-ui` components. When a pull request changes tokens, components or screens, say "Claude Design: re-sync from `main`" in its body. The operator re-syncs after merging.
- `DESIGN.md` and `.impeccable/design.json` summarize the visual system for the impeccable tools. When a token changes, edit both by hand in the same pull request, or rerun `/impeccable document`.
- `PRODUCT.md` owns the users and the product principles. `docs/reference/frontend-and-product-surfaces.md` owns what each surface means, including the Build surface's functional contract (section 33.6).

## Workflow

1. **Locate.** Find the screen, its route and its styles in `references/components-map.md`.
2. **Decide the scope.** For a new route, a new region or a new material interaction, read `references/product-surfaces.md` first and answer its questions before writing code. A change inside an existing screen skips this step.
3. **Write the copy** in pt-BR per `references/voice-and-copy.md`.
4. **Build** with Mastra primitives, tokens and Lucide icons per `references/visual-foundations.md` and `references/iconography.md`.
5. **Verify** in a real browser, in both themes and under reduced motion, with screenshots, per `references/verification.md`.
6. **Sync.** If the change moved a token, update `DESIGN.md`, `.impeccable/design.json` and `tests/implementation/brand-tokens.test.mjs` in the same pull request, and ask for the Claude Design re-sync.

## Rules that hold everywhere

`references/visual-foundations.md` carries the values. These are the rules:

- **pt-BR only.** Sentence case, verbs on buttons, failures that name the reason and what was preserved, no emoji.
- **Tokens for color.** Every color is a `var(--cx-*)` token; `npm run web:style:check` fails on a raw hex outside `tokens.css`. The only exception is the black in shadows.
- **One accent.** Ipê marks focus, selection, the active lens, hover tints and the agent at work. It is not a button fill, except the send button on hover.
- **Ink primary buttons.** Fill `--cx-ink`, label `--cx-on-ink`.
- **Color never alone.** Every status travels with a word and usually a mark.
- **Both themes.** Light and dark are first class; check every change in both.
- **Three faces.** Bricolage Grotesque for headings, Hanken Grotesk for language, JetBrains Mono for facts only, through the `--cx-font-*` tokens.
- **Hairlines, not shadows.** Radius comes from the scale; regions and panes take none. Shadows only where `visual-foundations.md` lists them.
- **Encaixe is the only authored motion.** Everything stops under `prefers-reduced-motion`.
- **Mastra first.** Use the Mastra primitive when one exists. Change its palette through `apps/web/src/mastra-theme.css`, and its size or layout through a `cx-*` class next to the screen. Replace any English text it brings.
- **Honest states.** Show only what the server says. Keep loading, empty, failed and unknown distinct. Never fake progress, counts or actions; mark unbuilt things "em breve".

## Checks

`references/verification.md` lists the checks for each kind of change: the style check, the typecheck, biome, the brand token test, `npm run keycloak-theme:check` for the sign-in theme, the browser suites, both themes, reduced motion, screenshots and accessibility. `apps/web/AGENTS.md` repeats the web app commands for a quick start.

## Known gaps: work to shape, not rules

These have no settled design yet. Do not treat an existing one-off as the standard. When a task touches one, shape it with the operator per `references/product-surfaces.md`, then record the result in the matching reference file.

- **Overlays.** Dropdown menu, popover, tooltip, dialog and combobox have no specification beyond the Mastra defaults, the popover shadow and `--cx-radius-object`.
- **Q3 access screens.** The no-access screen, the access-grant screen and the application sign-in screen for Stage 2 Q3 are not designed.
- **Keycloak theme.** `apps/keycloak-theme` follows the tokens but has no reviewed layout, copy or state set of its own.
- **Mobile.** The frame and Construir adapt below 768px, but no screen has a reviewed phone layout, and there is no mobile navigation standard.
- **State catalog.** Empty, loading and error states differ per screen. There is no shared catalog of their structure and copy.

## References

- `references/voice-and-copy.md`: voice, product nouns, failure copy, agent activity, in pt-BR.
- `references/visual-foundations.md`: color roles, type, spacing and frame, radii, elevation, Encaixe, hover and focus.
- `references/iconography.md`: Lucide usage, sizes and the icon vocabulary.
- `references/components-map.md`: Mastra primitives, where each token lives, and the screen-to-file map.
- `references/verification.md`: static checks, browser proof, themes, reduced motion, screenshots, accessibility.
- `references/product-surfaces.md`: how to shape a new product surface before building it.
