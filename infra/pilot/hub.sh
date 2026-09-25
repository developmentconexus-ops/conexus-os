#!/usr/bin/env bash
# Runs the pilot Hub in the foreground from the checkout that holds this script. README.md says which
# checkout that is and how to deploy main to it.
#
# Env: CONEXUS_PILOT_HUB_ENV (default ~/wt-rmmc/.audit/slice7/hub.env), CONEXUS_PILOT_LOGS (default ~/conexus-pilot-logs).
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$HOME/.nvm/nvm.sh" >/dev/null
nvm use >/dev/null
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "pilot checkout has local changes" >&2; exit 1; fi
env_file="${CONEXUS_PILOT_HUB_ENV:-$HOME/wt-rmmc/.audit/slice7/hub.env}"
logs="${CONEXUS_PILOT_LOGS:-$HOME/conexus-pilot-logs}"
mkdir -p "$logs"
exec > >(tee -a "$logs/hub.log") 2>&1
echo "hub starting $(date -u +%FT%TZ) head $(git rev-parse --short HEAD)"
exec node --env-file="$env_file" scripts/build-hub-local.mjs
