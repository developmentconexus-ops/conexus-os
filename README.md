# Conexus OS

Conexus OS is the platform the people at this company log in to. They open a
Workspace, open a Project, and talk to the Builder. The Builder writes the code for
a business application and serves it back as a Preview they can use.

Public route: [https://conexus.fun/conexus](https://conexus.fun/conexus)

## Start here

- [Agent bootstrap](AGENTS.md)
- [Documentation index](docs/index.md)
- [Roadmap](docs/roadmap.md)

## Verification

```bash
npm ci
npx --no-install playwright install chromium
npm run verify
```

Run this in Linux with the pinned Node and npm, and supply the disposable
PostgreSQL configuration in [the workflow](.github/workflows/verify.yml).

Do not run `npm run verify` locally. It is slow, and CI runs the same graph at your
exact head SHA. Run the focused checks your change touches, push, and read the CI
result. `npm test` runs the same graph. Paid model and E2B experiments need their
own explicit live commands.

A pull request is ready to merge when that `verify` check is green on its head SHA
and the coordinator has read the diff.

This README is a landing page. It owns no program status and no architecture authority.
