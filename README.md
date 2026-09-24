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

CI runs the full verification graph in [the workflow](.github/workflows/verify.yml)
at every ready pull request head. Do not run `npm run verify` locally: it is slow.
Run the focused checks your change touches, push, and read the CI result. Paid
model and E2B experiments need their own explicit live commands.

The [delivery rules](docs/development/delivery.md) own the merge gate.

This README is a landing page. It owns no program status and no architecture authority.
