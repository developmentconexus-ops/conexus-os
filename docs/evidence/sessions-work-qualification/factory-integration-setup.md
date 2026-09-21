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

## The external gate, and why it is one

`[package]` the published integration is a GitHub App and nothing else.
`GithubIntegrationConfig` in `dist/integrations/github/integration.d.ts:91` requires `appId`,
`privateKey` as a PEM, `clientId`, `clientSecret` and `slug`, and the class mints
installation tokens with them. There is no constructor that takes a personal access token,
so the `gh` credential that created this repository cannot drive the Factory's own
integration. Building an object that merely satisfies the class's shape would not be a test
of the integration, and this qualification does not do it.

Creating a GitHub App is a browser action. GitHub's REST API has no endpoint that creates
one outright; the only programmatic path is the App Manifest flow, which still redirects a
signed-in person through github.com. So the setup stops at exactly one human step.

**What a person has to do, once.** Create a GitHub App owned by the
`developmentconexus-ops` organization, named for this probe. Generate a private key and keep
the PEM. Install the App on the single repository
`developmentconexus-ops/conexus-factory-integration-probe`, choosing "Only select
repositories" rather than all. The App's callback URL points at wherever the Factory server
runs during the test, which is `http://localhost:4111` by default. A webhook secret is
optional for the coding path and only matters for inbound deliveries, which a machine behind
NAT does not receive.

**The permissions the run path actually exercises**, read from the calls the integration
makes in `dist/integrations/github/*.js`: repository contents to clone and push, pull
requests to create, update, review and merge, issues for the comment surface it writes to,
and metadata, which GitHub grants implicitly. Nothing in that list needs organization-wide
access, and nothing needs administration.

The five values the App produces (`appId`, `slug`, `clientId`, `clientSecret`, `privateKey`)
are read by the Factory as its GitHub identity. Their values are never recorded here, and
the qualification reads them from the environment when the test runs.

## What this setup is not

It is not a migration of any Conexus Project, and no existing repository was touched. The
Factory is not installed in the product. The pilot was not used. Creating branches, pull
requests, reviews and merges inside this repository is authorized and stays inside it.
