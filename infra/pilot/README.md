# Pilot: Hub and application runner

The pilot is the WSL laptop where each capability is proved before a server
([delivery rules](../../docs/development/delivery.md#working-rules)). It runs the Hub and the application runner
from one fixed checkout of `main`. The Keycloak it signs in with is in [`../keycloak`](../keycloak/README.md).

| What | Where |
| --- | --- |
| Checkout | `~/conexus-pilot`, a detached worktree of `origin/main`. Nobody commits there. |
| Hub | [`hub.sh`](hub.sh) runs `scripts/build-hub-local.mjs` with the Hub env. Ports 3443 (Hub), 3444 (Preview), 3445 (applications). |
| Application runner | [`runner.sh`](runner.sh) builds the Hub's TypeScript into `apps/hub/.conexus-build-runner` and runs `app-runner/main.js`. |
| Hub env | `~/wt-rmmc/.audit/slice7/hub.env`, or `CONEXUS_PILOT_HUB_ENV`. Mode 600, never in Git. |
| Runner env | `~/q3/runner.env`, or `CONEXUS_PILOT_RUNNER_ENV`. |
| Logs | `~/conexus-pilot-logs/hub.log` and `runner.log`, or `CONEXUS_PILOT_LOGS`. Each run's first line reads `hub starting <time> head <sha>` (or `runner starting …`). |

Both scripts run in the foreground and refuse to start when the checkout has local changes. Hold each one in a
terminal tab, or detach it with `setsid nohup infra/pilot/hub.sh >/dev/null 2>&1 < /dev/null &`.

## Deploy main

Every step that touches the pilot needs the operator's approval for the issue that names the pilot proof.

1. Update the checkout and note the old head:

   ```bash
   cd ~/conexus-pilot
   old=$(git rev-parse HEAD)
   git fetch origin && git checkout --detach origin/main
   npm ci
   ```

2. List what changed that the pilot must act on:

   ```bash
   git diff --name-only "$old" HEAD -- apps/hub/migrations      # migrations to apply
   git diff --stat "$old" HEAD -- apps/hub/src/app-runner apps/hub/src/platform  # runner restart needed
   ```

3. If a migration changed, back up the pilot database, then apply it with `scripts/run-hub-migrations.mjs`
   (`CONEXUS_MIGRATION_DATABASE_URL_FILE` names the file with the migration role's URL), as the
   [baseline rules](../../docs/reference/data-and-persistence.md#baseline-and-forward-migrations) require.
4. Stop the running Hub (its `server.js` and the `build-hub-local.mjs` parent) and start `infra/pilot/hub.sh`.
   Sessions live in PostgreSQL and survive the restart.
5. If the runner changed, stop it and start `infra/pilot/runner.sh`.
6. Confirm the head in the first line of each log you restarted.
