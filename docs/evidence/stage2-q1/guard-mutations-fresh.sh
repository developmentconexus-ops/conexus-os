#!/bin/bash
# Runs the guard mutation lever on freshly created throwaway clusters, so no earlier run's roles or
# grants decide an outcome: the Applications test cluster (q1c-apps-smoke, 55442) and the Hub test
# cluster (q1c-hub-test, 55443). The two cluster-state mutations each get fresh clusters of their own.
set -uo pipefail
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
out="$HOME/wt-q1/docs/evidence/stage2-q1/guard-mutations.txt"
fresh() {
  docker rm -f q1c-apps-smoke q1c-hub-test >/dev/null 2>&1
  docker run --rm --mount "type=bind,source=$HOME/q1c/smoke,target=/s" "$image" sh -c 'rm -rf /s/pgdata && mkdir -m 700 /s/pgdata && chown 999:999 /s/pgdata'
  bash "$HOME/q1c/smoke-run.sh" > /dev/null
  bash "$HOME/q1c/test-setup.sh" > /dev/null
}
lever() { bash "$HOME/q1c/run.sh" node tests/implementation/guard-mutations.mjs "$@"; }
: > "$out"
fresh; lever no-reserved-connections-inherit >> "$out"
fresh; lever no-public-connect-revoke >> "$out"
fresh; lever no-language-revoke no-tls-key-check no-valid-until no-ledger-rls runtime-gets-create schemas-open-to-public \
  no-role-temp-file-limit no-role-transaction-timeout no-language-startup-check no-relay-dir-files-check no-relay-dir-mode-check \
  no-unshare-net no-relay-cancel no-hub-cluster-refusal >> "$out"
cat "$out"
