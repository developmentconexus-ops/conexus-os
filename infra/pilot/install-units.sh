#!/usr/bin/env bash
# Installs and enables the pilot Hub and runner as systemd user units, rendered from infra/pilot/units/.
# Safe to run again: it rewrites the unit files, reloads systemd and enables. A running unit keeps
# running until you restart it. README.md has the runbook.
#
# Env (all optional):
#   CONEXUS_UNIT_CHECKOUT      checkout the units run from (default ~/conexus-pilot)
#   CONEXUS_PILOT_HUB_ENV      Hub env file (default ~/wt-rmmc/.audit/slice7/hub.env)
#   CONEXUS_PILOT_RUNNER_ENV   runner env file (default ~/q3/runner.env)
#   CONEXUS_PILOT_LOGS         log directory (default ~/conexus-pilot-logs)
#   CONEXUS_UNIT_PREFIX        unit name prefix (default conexus; a throwaway prefix proves the units
#                              without touching the pilot's)
# Flags: --start also starts the units. --only hub|runner installs one of them.
set -euo pipefail
source_dir="$(cd "$(dirname "$0")" && pwd)/units"
checkout="${CONEXUS_UNIT_CHECKOUT:-$HOME/conexus-pilot}"
hub_env="${CONEXUS_PILOT_HUB_ENV:-$HOME/wt-rmmc/.audit/slice7/hub.env}"
runner_env="${CONEXUS_PILOT_RUNNER_ENV:-$HOME/q3/runner.env}"
logs="${CONEXUS_PILOT_LOGS:-$HOME/conexus-pilot-logs}"
prefix="${CONEXUS_UNIT_PREFIX:-conexus}"
start=0
roles=(hub runner)
while [ $# -gt 0 ]; do
  case "$1" in
    --start) start=1 ;;
    --only) roles=("${2:?--only needs hub or runner}"); shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done
target="$HOME/.config/systemd/user"
mkdir -p "$target" "$logs"
units=()
for role in "${roles[@]}"; do
  template="$source_dir/conexus-$role.service"
  [ -f "$template" ] || { echo "no unit template for: $role" >&2; exit 2; }
  unit="$prefix-$role.service"
  sed -e "s|@CHECKOUT@|$checkout|g" -e "s|@HUB_ENV@|$hub_env|g" -e "s|@RUNNER_ENV@|$runner_env|g" -e "s|@LOGS@|$logs|g" \
    "$template" > "$target/$unit"
  units+=("$unit")
done
systemctl --user daemon-reload
systemctl --user enable "${units[@]}"
if [ "$start" = 1 ]; then systemctl --user start "${units[@]}"; fi
echo "installed: ${units[*]}"
