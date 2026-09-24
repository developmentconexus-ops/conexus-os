---
name: conexus-frontend
description: This skill should be used for any change under `apps/web`, `packages/brand` or `apps/keycloak-theme` in Conexus OS, and whenever work adds or changes a screen, interface copy, a color, a font, spacing, an icon, motion or any other visual. Triggers include "new screen", "nova tela", "redesign", "restyle", "texto da interface", "copy", "brand", "tema escuro", "dark mode", "sign-in page", "Keycloak theme", "tokens.css", "mastra-theme.css", "Encaixe", "Claude Design", and requests to review, polish or verify the web UI.
---

# Conexus frontend

This skill is how Conexus screens are designed, written, built and verified. It covers the web app (`apps/web`), the brand package (`packages/brand`) and the Keycloak sign-in theme (`apps/keycloak-theme`).

Load `.agents/skills/conexus-development/SKILL.md` first for bootstrap, grant and delivery rules. This skill adds only the frontend layer.

## The repository is the source of truth

- `packages/brand/src/tokens.css` defines every color, font, radius and easing. When anything else disagrees with it, including this skill, `tokens.css` wins.
- The screens in `apps/web/src` are the reference implementation. Read the nearest existing screen before building a new one.
- The Claude Design project "Conexus Design System" is a mirror of `main`, made for prototyping. After a change to tokens, components or screens merges, re-sync Claude Design from `main`. Never copy its JSX kit into the repository: production composes Mastra `@mastra/playground-ui` components, restyled through `apps/web/src/mastra-theme.css`.
- `DESIGN.md` and `.impeccable/design.json` summarize the visual system for the impeccable tools. Regenerate both when a token changes.
- `PRODUCT.md` owns the users and the product principles. `docs/reference/frontend-and-product-surfaces.md` owns what each surface means, including the Build surface's functional contract (section 33.6).

## Workflow

1. **Locate.** Find the screen, its route and its styles in `references/components-map.md`.
2. **Decide the scope.** For a new route, a new region or a new material interaction, read `references/product-surfaces.md` first and answer its questions before writing code. A change inside an existing screen skips this step.
3. **Write the copy** in pt-BR per `references/voice-and-copy.md`.
4. **Build** with Mastra primitives, tokens and Lucide icons per `references/visual-foundations.md` and `references/iconography.md`.
5. **Verify** in a real browser, in both themes and under reduced motion, with screenshots, per `references/verification.md`.
6. **Sync.** If the change moved a token, update `DESIGN.md`, `.impeccable/design.json` and `tests/implementation/brand-tokens.test.mjs` in the same pull request. After merge, re-sync Claude Design.

## Rules that hold everywhere

**Language.** The interface is pt-BR only. Sentence case. Actions are verbs. Failures name the reason and what was preserved. No emoji.

**Color.**

- Every color is a `var(--cx-*)` token. No raw hex outside `tokens.css`; `npm run web:style:check` fails the build on one.
- One accent, ipê. It marks focus, selection, the active lens, hover tints on nav rows and round tools, the composer glow and the working state. It is not a button color.
- Primary buttons are ink (`--cx-ink` on `--cx-on-ink`).
- Status color always travels with a word and usually a mark. Color never carries meaning alone.
- Light and dark are both first class. Check every change in both.

**Type.** Bricolage Grotesque for headings, Hanken Grotesk for everything a person reads as language, JetBrains Mono for facts only (ids, paths, commands, times, durations, revisions, error codes). Use the `--cx-font-*` tokens. Numerals are tabular. Prose never goes below 12px.

**Shape and depth.** Hairlines separate; cards do not float. Radius comes from `--cx-radius-control` (6px), `--cx-radius-object` (10px) and `--cx-radius-composer` (16px), plus 14px for project cards and 999px for pills. Regions and panes take no radius. Shadows only on hovered project cards, the home composer, popovers, dialogs and the slider thumb.

**Motion.** "Encaixe" (the mark's two pieces sliding apart and fitting back) is the only authored motif. Controls transition in .15s. Everything stops under `prefers-reduced-motion`.

**Components.** Use the Mastra primitive when one exists and restyle it through tokens. Replace any English text a Mastra component brings. Build your own component only when Mastra has nothing close.

**Honesty.** Show only what the server says. Keep loading, empty, failed and unknown distinct. Never fake progress, counts or actions; mark unbuilt things "em breve".

## Checks

```bash
npm run web:style:check
npm run r1:a0:web:typecheck
npx --no-install biome check apps/web/src packages/brand/src
node --test tests/implementation/brand-tokens.test.mjs
```

`references/verification.md` covers the browser suites, the live Hub, both themes, reduced motion, screenshots and accessibility. `apps/web/AGENTS.md` lists the same commands for a quick start.

## Known gaps: work to shape, not rules

These have no settled design yet. Do not treat an existing one-off as the standard. When a task touches one, shape it with the operator per `references/product-surfaces.md`, then record the result in the matching reference file.

- **Overlays.** Dropdown menu, popover, tooltip, dialog and combobox have no specification beyond the Mastra defaults, the shared shadows and `--cx-radius-object`.
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
