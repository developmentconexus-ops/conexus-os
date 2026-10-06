---
name: conexus-frontend
description: This skill should be used for any change under `apps/web`, `packages/brand` or `apps/keycloak-theme` in Conexus OS, and whenever work adds or changes a screen, interface copy, a color, a font, spacing, layout, an icon, motion or any other visual. Triggers include "new screen", "nova tela", "tela de login", "sign-in page", "Keycloak theme", "redesign", "restyle", "layout", "cor", "ícone", "texto da interface", "copy", "brand", "tema escuro", "dark mode", "celular", "responsivo", "mobile", "acessibilidade", "screenshot", "print da tela", "Construir", "composer", "Encaixe", and requests to review, polish or verify the web UI.
---

# Conexus frontend

How to work on a Conexus screen: the web app (`apps/web`), the brand package (`packages/brand`) and
the Keycloak sign-in theme (`apps/keycloak-theme`). The flow is the Frontend flow of
[`conexus-development`](../conexus-development/references/flows.md#frontend) on top of Build, Fix or
Redesign. This skill holds no rule; the guides do.

## Read first

- [`DESIGN.md`](../../../DESIGN.md): color, type, shape, motion, interaction, accessibility, icons,
  voice, how a surface is approved, and the Build surface.
- [Product contract](../../../docs/product/contract.md): who the screen serves, its journeys, and
  what a screen never does.
- [Testing](../../../docs/development/testing.md#screens): how a screen is proved.
- [Architecture](../../../docs/reference/architecture.md#the-web-app): what the web app may own.
- The code is the reference: read the nearest screen. `packages/brand/src/tokens.css` wins over any
  text.

## Steps

1. For a surface that does not exist yet, walk
   [`references/product-surfaces.md`](references/product-surfaces.md) before any code.
2. Build with the nearest screen's pattern and the Mastra part that already does the job.
3. Run `npm run web:style:check` and fix what it prints; do not restate or work around it.
4. Prove the screen with the [`verify`](../verify/SKILL.md) skill, in light and dark, with
   `prefers-reduced-motion` emulated, by keyboard, at 390px and 200% zoom, with the console open.
   For the sign-in theme run `npm run keycloak-theme:check` and take screenshots; never type the
   operator's password.

## Where things are

[`apps/web/AGENTS.md`](../../../apps/web/AGENTS.md) has the commands and
[`verify/features`](../verify/features/README.md) the screens by feature.
