# The Factory integration test, and its disposable repository

This records the external setup for the integrated test: whether the real `MastraFactory`
composition, not only the mount it wraps, can serve as a Project's development environment.
Everything here is disposable and holds nothing of the company's.

## The repository

| | |
| --- | --- |
| Repository | `developmentconexus-ops/conexus-factory-integration-probe`, private |
| Created | 2026-09-20, for this qualification only |
| Default branch | `main` |
| Initial commit | `908cfa907e1967318a5113b82874df0a7be09ade` |
| Contents | `app/counter.js` holding `export const counter = 0`, `package.json`, `README.md` |
| Workflows | none, and none are to be added |
| Secrets | none |
| Deployment | none, and no deployment hook exists |

Nothing in it is company data, credentials or production code. It can be deleted at any time
without consequence, and deleting it is the intended end state.

## Authentication, and what is recorded

Credential values are never recorded here, printed, or committed. What gets recorded is the
mechanism, the identity it acts as, the repositories it was scoped to, and the permissions
granted, so a reader can judge the blast radius without holding the secret.

The `gh` CLI in this environment is authenticated as the `developmentconexus-ops` account
with the scopes `gist`, `read:org`, `repo` and `workflow`. That is what created and seeded
the repository above. Whether the Factory's own GitHub integration can use a credential of
that kind, or requires a GitHub App installation, is settled in the report rather than
assumed here.

## What this setup is not

It is not a migration of any Conexus Project, and no existing repository was touched. The
Factory is not installed in the product. The pilot was not used. Creating branches, pull
requests, reviews and merges inside this repository is authorized and stays inside it.
