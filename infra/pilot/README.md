# Pilot: Hub and application runner

The pilot is the WSL laptop where each capability is proved before a server
([delivery rules](../../docs/development/delivery.md#git-and-pull-requests)). It runs the Hub and the application runner
from one fixed checkout of `main`. The Keycloak it signs in with is in [`../keycloak`](../keycloak/README.md).

| What | Where |
| --- | --- |
| Checkout | `~/conexus-pilot`, a detached worktree of `origin/main`. Nobody commits there. |
| Hub | [`hub.sh`](hub.sh) runs `scripts/build-hub-local.mjs` with the Hub env. Ports 3443 (Hub), 3444 (Preview), 3445 (applications). |
| Application runner | [`runner.sh`](runner.sh) runs `scripts/build-hub-local.mjs --runner`, which builds the Hub's TypeScript into a fresh `apps/hub/.conexus-build-local-*` directory, runs `app-runner/main.js`, and removes the build when the runner exits. |
| Hub env | `CONEXUS_PILOT_HUB_ENV` (required). Mode 600, never in Git. |
| Runner env | `~/q3/runner.env`, or `CONEXUS_PILOT_RUNNER_ENV`. |
| Logs | `~/conexus-pilot-logs/hub.log` and `runner.log`, or `CONEXUS_PILOT_LOGS`. Each run appends. Its first line reads `hub starting <time> head <sha>` (or `runner starting …`). |

Both scripts run in the foreground and refuse to start when the checkout has local changes. Run them under
systemd as described in the [supervision runbook](../../docs/reference/pilot-supervision.md), or hold each one in a terminal tab.

## Supervised by systemd

Two user units restart the Hub and the runner after a crash. [`install-units.sh`](install-units.sh) installs them.
The runbook is [`docs/reference/pilot-supervision.md`](../../docs/reference/pilot-supervision.md).

## Deploy main

Every step that touches the pilot needs the operator's approval for the issue that names the pilot proof. The
Hub and the runner both run from this checkout, so nothing in it changes while either one runs.
Before installing, qualify the exact selected SHA in a disposable test environment with
`npm run verify:qualification`, or dispatch the Verify workflow at that SHA and require its
complete integration and backup results. A routine isolated PR pass does not qualify an installation.

1. Fetch and list what the new head changes. The Hub restarts on every deploy. The runner also restarts when its
   code or the dependencies change, and `npm ci` runs only then:

   ```bash
   cd ~/conexus-pilot
   git fetch origin
   old=$(git rev-parse HEAD) new=$(git rev-parse origin/main)
   git diff --name-only "$old" "$new" -- apps/hub/migrations                       # migrations to apply
   git diff --name-only "$old" "$new" -- apps/hub/src/app-runner apps/hub/src/platform \
     package.json package-lock.json                                                # runner restart and npm ci
   ```

2. Stop the Hub (`systemctl --user stop conexus-hub.service`, or its `server.js` and the `build-hub-local.mjs` parent when run by hand). If the runner restarts, stop it too.
3. Move the checkout, and install only if the dependencies changed:

   ```bash
   git checkout --detach "$new"
   npm ci   # only when package.json or package-lock.json changed
   ```

4. If a migration changed, back up the pilot database and check that the file restores before migrating:

   ```bash
   mkdir -p ~/backups
   dump=~/backups/conexus_s7-before-$(git rev-parse --short "$new")-$(date -u +%Y%m%dT%H%M%S).dump
   docker exec conexus-s7-postgres pg_dump -U postgres -Fc conexus_s7 > "$dump"
   docker exec -i conexus-s7-postgres pg_restore --list < "$dump" > /dev/null && echo "backup ok: $dump"
   ```

   Then apply the migrations with `scripts/run-hub-migrations.mjs`. `CONEXUS_MIGRATION_DATABASE_URL_FILE` names
   the file that holds the migration role's URL. Migrations are forward-only, and the operator approves each one.
5. Start the Hub unit, and the runner unit if it was stopped (or `infra/pilot/hub.sh` and `infra/pilot/runner.sh` by hand). Sessions live in PostgreSQL and
   survive the restart.
6. Confirm the new head in the last `starting` line of each log you restarted:

   ```bash
   grep starting ~/conexus-pilot-logs/hub.log | tail -1
   ```
