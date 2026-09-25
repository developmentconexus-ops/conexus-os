#!/usr/bin/env bash
# Builds the Hub's TypeScript and runs the application runner in the foreground from the checkout that holds
# this script. README.md says which checkout that is and how to deploy main to it.
#
# Env: CONEXUS_PILOT_RUNNER_ENV (default ~/q3/runner.env), CONEXUS_PILOT_LOGS (default ~/conexus-pilot-logs).
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$HOME/.nvm/nvm.sh" >/dev/null
nvm use >/dev/null
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "pilot checkout has local changes" >&2; exit 1; fi
env_file="${CONEXUS_PILOT_RUNNER_ENV:-$HOME/q3/runner.env}"
logs="${CONEXUS_PILOT_LOGS:-$HOME/conexus-pilot-logs}"
build=apps/hub/.conexus-build-runner
mkdir -p "$logs"
exec > >(tee "$logs/runner.log") 2>&1
rm -rf "$build"
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --noEmit false --outDir "$build"
source "$env_file"
echo "runner starting $(date -u +%FT%TZ) head $(git rev-parse --short HEAD)"
exec node "$build/app-runner/main.js"
