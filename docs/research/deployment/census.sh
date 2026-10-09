#!/usr/bin/env bash
# Deployment census: what any host must give the Hub today (configuration, secret files, disks, listeners) and
# what keeps it, and its database, always on. Rerun from the root of any checkout: bash docs/research/deployment/census.sh
set -euo pipefail
cd "$(git rev-parse --show-toplevel)"
line() { printf '\n## %s  [%s]\n' "$1" "$(printf '%s' "$2" | grep -c . || true)"; printf '%s\n' "$2" | sed '/^$/d'; }
# Names read from the environment: through the config helpers or env.X; error codes and log codes are not counted.
names() {
  grep -rhoE "(required|optional|secret|durationMs|integer)\((environment, |env, )?'CONEXUS_[A-Z0-9_]+'|(environment|env|process\.env)\.CONEXUS_[A-Z0-9_]+" \
    apps/hub/src --include='*.ts' --exclude='*.generated.ts' | grep -oE 'CONEXUS_[A-Z0-9_]+' | sort -u
}

line 'E1 configuration names the Hub and the runner read' "$(names)"
line 'E2 secret files (mounted by the host, *_FILE)' "$(names | grep -E '_FILE$')"
line 'E3 directories and roots that must persist or exist on the host' "$(names | grep -E '_(DIR|ROOT)$')"
line 'E4 sockets and binaries on the host' "$(names | grep -E '_(SOCKET|BIN)$')"
line 'E5 network listeners opened by Hub code' "$(grep -rn '\.listen(' apps/hub/src --include='*.ts')"
line 'E6 periodic jobs in the Hub process, with their interval' \
  "$(grep -rn -e 'everyMs: [A-Z_]' apps/hub/src --include='*.ts'; grep -rn -e 'RUN_LEASE_EVERY_MS =' -e 'IAM_REAP_EVERY_MS =' apps/hub/src --include='*.ts')"
line 'E7 a session-level lock held for the life of the Hub: one Hub per database, one connection always open' \
  "$(grep -n -e 'pg_try_advisory_lock' -e 'pg_advisory_lock_shared' apps/hub/src/platform/db.ts)"
line 'E8 container image, Compose file or deploy workflow for the Hub' \
  "$(git ls-files | grep -iE '(^|/)(Dockerfile|Containerfile|compose[^/]*\.ya?ml|fly\.toml|render\.yaml|app\.yaml)$' | grep -v '^infra/telemetry/' || true)"
