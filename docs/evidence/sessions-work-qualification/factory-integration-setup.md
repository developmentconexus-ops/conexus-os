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

**Who the owner actually is.** `developmentconexus-ops` is a personal GitHub account, not an
organization: `GET /users/developmentconexus-ops` answers `"type": "User"`, and the token in
this environment belongs to no organization. So the App is a user-owned App, its
installation is on that account, and "organization-wide access" is not a setting that
exists here. The repository selection still matters, because a user account can hold other
repositories.

**What a person has to do, once.** Create a private GitHub App under the
`developmentconexus-ops` account, named for this probe, and keep it private so nobody else
can install it. Generate a private key and keep the PEM. Generate a client secret. Install
the App on the single repository
`developmentconexus-ops/conexus-factory-integration-probe`, choosing "Only select
repositories" rather than all. The App's callback URL points at wherever the Factory server
runs during the test, which is `http://localhost:4111` by default. A webhook secret is
optional for the coding path and only matters for inbound deliveries, which a machine behind
NAT does not receive.

**The permissions the run path actually exercises**, read from the calls the integration
makes in `dist/integrations/github/*.js`: repository contents to clone and push, pull
requests to create, update, review and merge, issues for the comment surface it writes to,
and metadata, which GitHub grants implicitly. Nothing in that list needs access beyond the
one selected repository, and nothing needs administration.

The five values the App produces (`appId`, `slug`, `clientId`, `clientSecret`, `privateKey`)
are read by the Factory as its GitHub identity. Their values are never recorded here, and
the qualification reads them from the environment when the test runs.

## The operating envelope for the authenticated run

One configuration, not a menu. Everything the authenticated test will use is listed here so
the operator approves a known blast radius rather than a direction. Nothing in this section
has run yet.

| | |
| --- | --- |
| Repository | `developmentconexus-ops/conexus-factory-integration-probe` only, private |
| Account | `developmentconexus-ops`, a personal GitHub account; the App is user-owned and private |
| App permissions | repository contents read and write, pull requests read and write, metadata read. No issues, no webhooks, no administration, no second repository |
| App credentials | `appId`, `slug`, `clientId`, `clientSecret`, `privateKey`, supplied by the operator, read from the environment at run time |
| `stateSecret` | a random value generated for the run and held in the environment, required because the GitHub integration signs OAuth state |
| Storage | `LibSQLFactoryStorage` on a scratch file under `/tmp`, deleted afterwards |
| Sandbox | `LocalSandbox` from `@mastra/core/workspace`, one working directory per session under `/tmp`, with `git` and `gh` on PATH |
| Model | a local OpenAI-compatible stub on loopback for every turn the stub can answer. No paid provider is configured, so no paid call can happen by accident |
| Network | github.com for the App's own calls and the clone, plus loopback. Nothing else |
| Attempts | at most three attempts per stage. A stage that fails three times ends the run and is reported as it failed |
| Cleanup | scratch directories and the scratch database removed; the repository left for the operator to delete, or deleted on request |

**What the run is allowed to do**, inside that one repository: clone it, create a branch,
commit, push, open a pull request, create a review, and merge that pull request. Merging is
authorized there because the handoff authorized it, and because a merge inside a disposable
repository is the only way to show that nothing deploys when work completes.

**What the run may not do**: touch any other repository, install anything into the Conexus
product, use the pilot, enable a workflow, deploy, or call a paid model.

**Credential handling.** Secrets are never printed, logged, committed or written into this
directory. The `gh` credential in this environment has `repo` scope across the account, so
it is not exposed to the sandbox or to the agent; the sandbox gets only the installation
token the App mints for the one repository, which is what the Factory does on its own.

**Consumption.** With the local stub answering every turn, the expected spend is zero, and
the ceiling is zero because no paid provider is configured. The cost this run does carry is
time and GitHub API calls against one repository.

**The one thing that could change that.** If the Factory's Work lifecycle cannot be driven
to a pull request with a stub model, a real model becomes materially necessary. That is a
separate authorization, not a judgement call to make mid-run: the run stops, and the report
names the provider, the credential path, the bounded ceiling and what specifically could not
be answered locally.

## Handing the credentials over

The five values the App produces, plus the installation id GitHub assigns when it is
installed, are read from the environment by
[`integrated-factory.mjs`](integrated-factory.mjs) and never printed by it:
`GH_APP_ID`, `GH_APP_SLUG`, `GH_APP_CLIENT_ID`, `GH_APP_CLIENT_SECRET`,
`GH_APP_PRIVATE_KEY_FILE` (a path, not the key), `GH_APP_INSTALLATION_ID` and `GH_REPO`.

Put the private key in a file only you can read, for example `chmod 600` under your home
directory, and keep the other values in a file of the same kind. Nothing goes into this
repository, into a commit, into chat, or into a log. `[probe]` with none of them set, the
harness refuses with `nothing ran, because this test refuses to invent a GitHub state` and
exits non-zero.

The installation id can be read back afterwards with the App's own JWT, so it does not have
to be copied by hand from the browser.

## What this setup is not

It is not a migration of any Conexus Project, and no existing repository was touched. The
Factory is not installed in the product. The pilot was not used. Creating branches, pull
requests, reviews and merges inside this repository is authorized and stays inside it.
