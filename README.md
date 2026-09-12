# Conexus OS

Conexus OS is an AI-first enterprise platform for building, evolving, and operating governed business applications and Product Agents over real enterprise systems and data, with reusable enterprise knowledge, explicit authority, verifiable engineering, and truthful operational evidence.

Public route: [https://conexus.fun/conexus](https://conexus.fun/conexus)

## Start here

- [Agent bootstrap](AGENTS.md)
- [Documentation index](docs/index.md)
- [Current roadmap](docs/roadmap.md)

## Verification

```bash
npm ci
npx --no-install playwright install chromium
npm run verify
```

`npm test` runs the same graph. `test:repository`, `verify:extended` and the
named historical audits remain explicit tools; they are not the MVP's default
gate. Paid model/E2B experiments require their explicit live commands.

Use pinned Node/npm in Linux and the disposable PostgreSQL configuration in
[the workflow](.github/workflows/verify.yml). Local verification accepts ordinary
development edits. CI runs the same current checks and checks checkout cleanliness.
Historical admission is not required for unrelated MVP work.

This README is a landing page only; it owns no mutable program status or architecture authority.
