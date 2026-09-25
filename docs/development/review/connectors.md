# Review: Connectors

## Scope

Code that reaches a system Conexus does not own or holds its credential: the application data plane and its PostgreSQL relay, the GitHub App installation, model accounts, Google AI Pro, E2B, and the Applications PostgreSQL cluster. Paths, as [`areas.json`](areas.json) lists them:

- `apps/hub/src/app-runner/data-plane.ts`
- `apps/hub/src/app-runner/pg-relay.ts`
- `apps/hub/src/builder/factory-github.ts`
- `apps/hub/src/builder/installation-github-routes.ts`
- `apps/hub/src/builder/repository-routes.ts`
- `apps/hub/src/builder/model-accounts.ts`
- `apps/hub/src/builder/chat-models.ts`
- `apps/hub/src/builder/google-ai-pro/**`
- `apps/hub/src/builder/factory-provisioning.ts`
- `apps/hub/src/platform/secrets.ts`
- `scripts/builder-e2b-template.mjs`
- `scripts/provision-application-database.mjs`
- `scripts/confine-application-cluster.mjs`
- `scripts/run-application-cluster.sh`
- `scripts/mount-application-cluster-storage.sh`
