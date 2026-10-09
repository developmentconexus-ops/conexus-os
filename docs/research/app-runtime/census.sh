#!/usr/bin/env bash
# App runtime census: what runs a generated app's server code and serves its files today, and the
# contract that code sees. Rerun from the root of any checkout: bash docs/research/app-runtime/census.sh
set -euo pipefail
cd "${CONEXUS_OS:-$(git rev-parse --show-toplevel)}"  # CONEXUS_OS: a conexus-os checkout, when run from elsewhere
line() { printf '\n## %s  [%s]\n' "$1" "$(printf '%s' "$2" | grep -c . || true)"; printf '%s\n' "$2" | sed '/^$/d'; }
count() { cat "$@" 2>/dev/null | wc -l | tr -d ' '; }

line 'R1 the application runner (process, supervisor, sandbox, relay, data plane)' "$(ls apps/hub/src/app-runner/*.ts)"
echo "   lines: $(count apps/hub/src/app-runner/*.ts)"
line 'R2 hosting of Previews and apps in the Hub' "$(ls apps/hub/src/hosting/*.ts)"
echo "   lines: $(count apps/hub/src/hosting/*.ts)"
line 'R3 Applications cluster setup scripts' "$(ls scripts/provision-application-database.mjs scripts/confine-application-cluster.mjs scripts/run-application-cluster.sh 2>/dev/null)"
echo "   lines: $(count scripts/provision-application-database.mjs scripts/confine-application-cluster.mjs scripts/run-application-cluster.sh)"
line 'C1 the handler call: input plus three capabilities, nothing else' \
  "$(grep -n 'Reflect.apply(handler' apps/hub/src/app-runner/worker.ts)"
line 'C2 the capabilities the Builder skill teaches handlers' \
  "$(grep -n -e '^type Db' -e '^type Caller' -e '^type Connectors' builder-skills/conexus-server/SKILL.md)"
line 'C3 what the skill forbids handlers' "$(grep -n 'no file system and no environment' builder-skills/conexus-server/SKILL.md)"
line 'K1 kernel features the sandbox requires' \
  "$(grep -n -e "'--unshare-user'" -e 'unprivileged_userns_clone' -e 'max_user_namespaces' apps/hub/src/app-runner/sandbox.ts)"
line 'K2 the per-call relay and its client certificate' "$(grep -n -e 'tls.connect' -e 'relay.pem' apps/hub/src/app-runner/pg-relay.ts)"
