# Verification

A frontend change is done when you have seen it work in a real browser, in both themes and under reduced motion, and you can show the screenshots. Typecheck and lint are necessary. They are not proof that a screen works.

Run everything in the WSL worktree after `source "$HOME/.nvm/nvm.sh"; nvm use`. Do not run `npm run verify` locally. CI runs it at your head SHA.

## Static checks

Run the ones your change touches:

```bash
npm run web:style:check                                   # no raw hex, only the three brand fonts
npm run r1:a0:web:typecheck                               # apps/web TypeScript
npx --no-install biome check apps/web/src packages/brand/src
node --test tests/implementation/brand-tokens.test.mjs    # after any change to tokens.css
npm run keycloak-theme:check                              # after any change to apps/keycloak-theme
```

## See it in a real browser

Pick one of two ways.

**Stubbed API, no Hub.** The browser suites serve `apps/web` through Vite (`tests/implementation/web-dev-server.mjs`) and answer every `/api` call with Playwright `page.route` fixtures. Extend the suite that owns the screen:

| Suite | Screens |
| --- | --- |
| `tests/implementation/project-browser.test.mjs` | Entry, Workspaces, Workspace home, Pessoas, Sobre o Projeto |
| `tests/implementation/builder-browser.test.mjs` | Construir, the composer, the lenses |
| `tests/implementation/settings-browser.test.mjs` | Settings |

```bash
npx --no-install playwright install chromium
node --test --test-concurrency=1 tests/implementation/project-browser.test.mjs
```

Assert what a person sees: the text, the role, the state after an action. A test that only proves the page rendered is not enough.

**Live Hub.** `npm run hub:local` builds the web app and the Hub and serves them at `https://hub.conexus.localhost:3443`. It needs the local `.audit/slice7/hub.env`, which is not in the repository. Use it when the change depends on real server behavior. Never type the operator's password. Sign in with the local test operator or a saved session.

## Both themes and reduced motion

The theme follows `prefers-color-scheme` unless the person picks one with the top-bar toggle, which the Mastra `ThemeProvider` stores under `localStorage` key `conexus-theme` and applies as `.light` or `.dark` on `<html>`.

- In Playwright, switch with `page.emulateMedia({ colorScheme: 'dark' })`, and test the toggle itself once.
- Emulate reduced motion with `reducedMotion: 'reduce'`. Check that the mark sits still, the composer ring stops, nothing slides, and the final state is complete without the animation.
- Look at both themes yourself. A color that reads in light can vanish in dark, and a status tint can turn muddy.

## Screenshot proof

`project-browser.test.mjs` saves desktop (1440x900) and phone (390x844) screenshots, light and dark, of every screen it visits when `CONEXUS_SCREENSHOT_DIR` is set:

```bash
CONEXUS_SCREENSHOT_DIR=/tmp/shots node --test --test-concurrency=1 tests/implementation/project-browser.test.mjs
```

Copy its `shoot()` helper when another suite needs the same. Put the before and after screenshots in the pull request. Commit them under `docs/evidence/screens/<topic>/` only when a later reader needs them, as `tests/implementation/settings-screenshots.mjs` does for Settings.

## Accessibility basics

Check each of these on the changed screen:

- **Keyboard.** Every action is reachable with Tab, in reading order, and the 2px ipê focus ring is visible on each stop. Esc closes what opened. Nothing depends on drag alone; a resizable pane or slider also moves with the keyboard.
- **Semantics.** Actions are `<button>`, navigation is `<a>`. Headings go in order. Tabs use `role="tab"` with `aria-selected`, as the lens bar does.
- **Names.** Every input has a label. Every icon-only button has a pt-BR `aria-label`. The page keeps `lang="pt-BR"` (`apps/web/index.html`).
- **Not color alone.** Every status has a word next to it.
- **Contrast.** Body text uses `--cx-text` and secondary text `--cx-text-2`, both chosen for contrast on `--cx-canvas` and `--cx-surface`. Do not put `--cx-text-2` on `--cx-surface-4` or on a status tint without checking the ratio (4.5:1 for text).
- **Reflow.** At 390px wide and at 200% zoom nothing scrolls sideways. `project-browser.test.mjs` measures horizontal overflow; reuse `measureOverflow`.
- **Console.** No errors and no Content Security Policy violations in the console. The Hub's CSP has broken the app before.
- **No English leak.** Search the rendered page for English left by a Mastra component, including `aria-label`, `title` and placeholder text.
