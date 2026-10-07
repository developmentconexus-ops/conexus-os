# Screens

For any change under `apps/web`, `packages/brand` or `apps/keycloak-theme`, or any screen, copy,
color, font, spacing, layout, icon or motion, on top of the unit card or the small change:

1. Read [`DESIGN.md`](../../../../DESIGN.md), the [product contract](../../../../docs/product/contract.md)
   and [what the web app may own](../../../../docs/reference/architecture.md#the-web-app).
   `packages/brand/src/tokens.css` wins over any text.
2. For a surface that does not exist yet, walk
   [product-surfaces.md](../../conexus-spec/references/product-surfaces.md) before any code.
3. Build with the nearest screen's pattern, if it follows the guides, and the Mastra part that
   already does the job.
4. Run `npm run web:style:check` and fix what it prints.
5. Prove the screen with the [`verify`](../../verify/SKILL.md) skill as
   [testing](../../../../docs/development/testing.md#8-screens) says. For the sign-in theme run
   `npm run keycloak-theme:check` and take screenshots; never type the operator's password.

[`apps/web/AGENTS.md`](../../../../apps/web/AGENTS.md) has the commands and
[`verify/features`](../../verify/features/README.md) the screens by feature.
