# Compiler template recipe

The application compiler runs inside an E2B template. Its `TEMPLATE_REF` and `RECIPE_SHA256` live in
`apps/hub/src/registry/application-template-pins.ts`, the one table the runtime, the registry and
migration `0037` share. `scripts/builder-e2b-template.mjs` builds the template from the files in
this folder, which it writes into `/opt/conexus/compiler`. The template also carries Node 24.20.0 and
npm 12.0.2 on Debian 12 bookworm, and runs commands as the unprivileged `conexus-agent` user (uid
1500), which owns `/workspace`. The compiler stays root-owned.

## The app stack

`package.json` pins the app stack of spec 0003 exactly and `package-lock.json` is what `npm ci`
installs. The recipe installs into `full/node_modules` and then links only the manifest's own packages
into `node_modules` (`allowlist.mjs link`). An app resolves `node_modules`, so a package that is only
somebody's dependency (`immer`, `scheduler`) cannot be imported: `tsc` says `Cannot find module` and
names it. `vite.config.mjs` adds the same rule at build time, by name, and refuses a path that
reaches into the compiler's packages. Every other tool the check runs (`vite`, `tsc`) is found under
`node_modules` as before.

`@types/node` is installed but never linked into `node_modules`: `tsconfig.server.json` reads it from
`full/node_modules/@types` for the handlers under `conexus/`, and the app project never sees it, so `node:`
imports work in handlers and fail in screens.

## The TypeScript projects

`tsconfig.mjs` builds two projects for one checkout, `app` (screens, browser only, `@/` for the app's
`src`) and `server` (handlers, Node built-ins, no DOM). The committed `tsconfig.json` and
`tsconfig.server.json` are its output for the compile sandbox layout (`/workspace`). A check that
runs on another root calls `typescriptProjects({ compilerRoot, root })` and writes the result.

The compile step points the app's `node_modules` at `/opt/conexus/compiler/node_modules`, the view.

`tests/implementation/builder-compiler-template-recipe.test.mjs`,
`builder-compiler-recipe-stack.test.mjs` and `builder-compiler-allowlist.test.mjs` hold these files to
the paths, versions and rules the compile step relies on.
