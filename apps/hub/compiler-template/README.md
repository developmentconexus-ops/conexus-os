# Compiler template recipe

The application compiler runs inside an E2B template pinned by `TEMPLATE_REF` in
`apps/hub/src/builder/application-artifact-runtime.ts`, repeated in
`apps/hub/src/registry/application-artifact-store.ts`, and enforced again inside
`reg.retain_application_execution` in `apps/hub/migrations/0001_baseline.sql`.

Until now the recipe that produced that template existed only inside the image. These three files
are its contents, read back out of the running template and committed so it can be rebuilt. The
template also carries Node 24.20.0 and npm 12.0.2 on Debian 12 bookworm, the same Node the agent
template pins in `scripts/builder-e2b-template.mjs`.

The template lays them out under `/opt/conexus/compiler`, and the compile step symlinks
`/opt/conexus/compiler/node_modules` into `/workspace/app/node_modules` before running vite.

`tests/implementation/builder-compiler-template-recipe.test.mjs` holds these files to the paths and
versions the compile step relies on, so the two cannot drift apart silently.
