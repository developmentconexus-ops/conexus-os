# Components map

Where things live. Every path below exists on `main`. If one does not, the map is stale: fix it in the same change.

## Production primitives come from Mastra

The web app composes `@mastra/playground-ui` components. It does not have its own component kit.

- `apps/web/src/mastra-theme.css` re-points every Mastra custom property (surfaces, neutrals, borders, accents, notices, badges, its green and blue ramps, the focus ring) at a `--cx-*` token. That file is how Mastra looks like Conexus.
- `apps/web/src/main.tsx` loads `@mastra/playground-ui/style.css` once, up front, then the brand tokens, then `styles.css`. Keep that order. Loading the Mastra stylesheet later changed margins on every page.
- `apps/web/src/styles.css` puts element defaults in `@layer base`, so Mastra's utilities still win on its own controls, and keeps class rules unlayered so they win over both.

Mastra primitives in use today: `Button`, `Input`, `Textarea`, `Label`, `Select`, `Combobox`, `DropdownMenu`, `Popover`, `Tooltip`, `AlertDialog`, `Avatar`, `Skeleton`, `Notice`, `toast` with `Toaster`, `Breadcrumb` with `Crumb`, `Collapsible`, `ScrollArea`, `Tree`, `AppShell`, `MainSidebar`, `ChatShell`, `MessageScrollerItem`, `MarkdownRenderer`, `PanelGroup` with `PanelSeparator`, `ThemeProvider`, `useCodemirrorTheme`, and the model provider icons.

To add UI:

1. Use the Mastra primitive when one exists. Change its palette through `mastra-theme.css`, by re-pointing a property it reads. Change its size or layout through a `cx-*` class next to the screen. Never fork the component.
2. When Mastra hardcodes English text, replace it in pt-BR. `apps/web/src/features/builder/construir/ask-user-pt.tsx` and `task-list-pt.tsx` show the pattern; `builder-copy.ts` holds the strings.
3. Build a component of your own only when Mastra has nothing close. Keep it in the feature that uses it until a second feature needs the same behavior.

Do not copy the Claude Design JSX kit (`ConexusDesignSystem_*`, `cx-btn`, `cx-chip` and the rest) into the repository. Those components re-create the look of the Mastra-based screens for prototyping. They are not the production API.

## Where each token lives

| What | File |
| --- | --- |
| Colors, both themes | `packages/brand/src/tokens.css` |
| `@font-face` rules and `--cx-font-*` | `packages/brand/src/tokens.css`, faces in `packages/brand/fonts/` |
| Radii `--cx-radius-*` and easings `--cx-ease-*` | `packages/brand/src/tokens.css` |
| The mark, its Encaixe keyframes, the wordmark | `packages/brand/src/tokens.css` (CSS), `packages/brand/src/conexus-mark.tsx` (`ConexusMark`, `ConexusWordmark`) |
| Logo files, favicon, app icons | `packages/brand/assets/`, served as the web app's `publicDir` by `apps/web/vite.config.mjs` |
| Mastra properties mapped to tokens | `apps/web/src/mastra-theme.css` |
| Element defaults, focus, selection, scrollbar, global reduced motion | `apps/web/src/styles.css` |
| Top bar, rail, page column | `apps/web/src/app/frame.css` |

`tests/implementation/brand-tokens.test.mjs` pins the token names and the key values. Adding a color token means adding it to all three theme blocks in `tokens.css` and to that test.

## Screen to file

| Screen | Route | Route file | Components and styles |
| --- | --- | --- | --- |
| Frame: top bar, scope rail, theme toggle, access | every signed-in route | `apps/web/src/app/router.tsx` | `app/shell.tsx`, `app/theme-toggle.tsx`, `app/access-gate.tsx`, `app/frame.css` |
| Entry: where to go, first-run setup, signed out, no access | `/`, `/setup`, `/signed-out`, `/no-access` | `routes/index.tsx`, `routes/setup.tsx`, `routes/entry-pages.tsx` | `features/entry/entry-screens.tsx`, `features/entry/entry-destination.ts`, `features/entry/entry.css` |
| Workspaces list | `/workspaces` | `routes/workspaces.tsx` | rendered in the route file; `features/workspace/workspace.css` |
| Create a Workspace | `/workspaces/new` | `routes/workspace-new.tsx` | `features/workspace/components/workspace-create-form.tsx` |
| Workspace home: prompt and Projects grid | `/workspaces/$workspaceId/projects` | `routes/workspace-projects.tsx` | `features/project/components/prompt-box.tsx`, `features/project/components/project-grid.tsx`, `features/project/projects-home.css` |
| Create a Project | `/workspaces/$workspaceId/projects/new` | `routes/workspace-project-new.tsx` | `features/project/components/project-create-form.tsx` |
| People | `/workspaces/$workspaceId/settings/people` | `routes/workspace-members.tsx` | `features/identity-access/components/workspace-members.tsx`, `features/identity-access/people.css` |
| Construir | `/projects/$projectId`, `/projects/$projectId/build`, `/projects/$projectId/c/$conversationId` | `routes/construir.tsx` | `features/builder/construir/construir.tsx`, `construir.css`, `lens-preview.tsx`, `lens-code.tsx`, `lens-diff.tsx`, `lens-details.tsx`, `lens-surfaces.css`, `result-card.tsx`, `pending-card.tsx`, `working-state.tsx`, `tool-sentences.ts`; `features/builder/components/builder-conversation.tsx` |
| Composer and model picker | inside Construir and the Workspace home | none | `features/builder/composer/composer.tsx`, `model-picker.tsx`, `reasoning-labels.ts`, `composer.css` |
| Project settings | `/projects/$projectId/settings` | `routes/project-settings.tsx` | `features/project/project-settings.css` |
| Settings frame and rail | `/settings` | `routes/settings.tsx` | `features/settings/components/rail.tsx`, `features/settings/sections.ts`, `features/settings/settings.css` |
| Account | `/settings/account` | `routes/settings-account.tsx` | `features/settings/components/account-screen.tsx` |
| Model accounts | `/settings/models` | `routes/settings-models.tsx` | `features/settings/components/models-screen.tsx`, `model-account-row.tsx`, `connect-account.tsx`, `reconnect-account.tsx`, `google-ai-pro-account.tsx`, `my-defaults-section.tsx` |
| Installation: models, model defaults, GitHub, memory, administrators | `/settings/installation/*` | `routes/settings-installation-*.tsx` | `features/settings/components/installation-page.tsx` and the matching `*-screen.tsx` |
| Keycloak sign-in | Keycloak realm | `apps/keycloak-theme/src/login/KcPage.tsx` | `apps/keycloak-theme/src/login/Template.tsx`, `apps/keycloak-theme/src/login/pages/*.tsx`, `apps/keycloak-theme/src/styles.css` |

Paths in the last two columns are under `apps/web/src/` unless they start with `apps/`.

The sign-in theme imports the same `packages/brand` tokens and mark as the web app. It is a separate npm package: `npm run keycloak-theme:check` typechecks and builds it.

## Product meaning lives elsewhere

This map says where code is. `docs/reference/frontend-and-product-surfaces.md` owns what the surfaces mean, including the Build surface's functional contract in section 33.6. `PRODUCT.md` owns who the users are and the product principles.
