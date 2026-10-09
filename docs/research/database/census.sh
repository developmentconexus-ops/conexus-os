#!/usr/bin/env bash
# Database census: the stores, the machinery that keeps them and the units of app data.
# Rerun from the root of any checkout: bash docs/research/database/census.sh
# The catalog counts (tables, policies, roles) need a migrated database: see spike.sh, S0.
set -euo pipefail
cd "${CONEXUS_OS:-$(git rev-parse --show-toplevel)}"  # CONEXUS_OS: a conexus-os checkout, when run from elsewhere
line() { printf '\n## %s  [%s]\n' "$1" "$(printf '%s' "$2" | grep -c . || true)"; printf '%s\n' "$2" | sed '/^$/d'; }
lines() { cat "$@" 2>/dev/null | wc -l | tr -d ' '; }

line 'S1 Hub migrations (files)' "$(ls apps/hub/migrations/*.sql)"
echo "   lines: $(lines apps/hub/migrations/*.sql)"
line 'S2 schemas the Hub migrations create' "$(grep -hoiE 'CREATE SCHEMA (IF NOT EXISTS )?"?[a-z_]+' apps/hub/migrations/*.sql | awk '{print $NF}' | tr -d '"' | sort -u)"
line 'S3 roles named in the role register' \
  "$(node -e 'const r=require("./contracts/technical/hub-database-roles.json");for(const [k,v] of Object.entries(r))if(Array.isArray(v))for(const x of v)console.log(k, typeof x==="string"?x:(x.role??JSON.stringify(x)))')"
line 'M1 database machinery scripts' "$(ls scripts/run-hub-migrations.mjs scripts/hub-catalog*.mjs scripts/generate-hub-*.mjs scripts/provision-hub-roles.mjs \
  scripts/function-callers.mjs scripts/provision-application-database.mjs scripts/confine-application-cluster.mjs scripts/run-application-cluster.sh \
  scripts/conexus-backup*.sh scripts/conexus-restore-check.sh 2>/dev/null)"
echo "   lines: $(lines scripts/run-hub-migrations.mjs scripts/hub-catalog*.mjs scripts/generate-hub-*.mjs scripts/provision-hub-roles.mjs \
  scripts/function-callers.mjs scripts/provision-application-database.mjs scripts/confine-application-cluster.mjs scripts/run-application-cluster.sh \
  scripts/conexus-backup*.sh scripts/conexus-restore-check.sh)"
line 'M2 generated database registers' "$(ls contracts/technical/hub-*.json)"
echo "   lines: $(lines contracts/technical/hub-*.json)"
line 'M3 the Hub data layer and the Applications data plane' "$(ls apps/hub/src/platform/db.ts apps/hub/src/app-runner/data-plane.ts apps/hub/src/app-runner/pg-relay.ts)"
echo "   lines: $(lines apps/hub/src/platform/db.ts apps/hub/src/app-runner/data-plane.ts apps/hub/src/app-runner/pg-relay.ts)"
line 'A1 the unit of app data: a schema and two roles per Project and environment' \
  "$(grep -n -e 'schema: `p_' -e 'runtimeRole: `' -e 'migrationRole: `' apps/hub/src/app-runner/data-plane.ts)"
line 'A2 the one Applications database, named by configuration' "$(grep -rn 'CONEXUS_APP_DB_NAME' apps/hub/src/app-runner/*.ts | head -3)"
line 'A3 certificate-only login for Project roles' "$(grep -n 'hostssl' scripts/confine-application-cluster.mjs)"
line 'X1 Mastra storage the Hub uses (package and schema)' \
  "$(grep -rn --include='*.ts' -e "from '@mastra/pg'" -e "schemaName: 'factory'" -e "schemaName:" apps/hub/src/builder | head -5)"
line 'X2 Mastra retention (native prune) in the Hub' "$(grep -rn --include='*.ts' 'storage.prune' apps/hub/src | head -3)"
line 'X3 database images pinned in the repository' "$(grep -rhoE 'postgres:[0-9.]+-[a-z]+@sha256:[0-9a-f]{12}' scripts tests .github 2>/dev/null | sort | uniq -c)"
