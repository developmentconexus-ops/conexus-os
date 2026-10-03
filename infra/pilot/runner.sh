#!/usr/bin/env bash
# Builds the Hub's TypeScript into a fresh directory and runs the application runner in the foreground from
# the checkout that holds this script. The build is removed when the runner exits. README.md says which
# checkout that is and how to deploy main to it.
#
# Env: CONEXUS_PILOT_RUNNER_ENV (default ~/q3/runner.env), CONEXUS_PILOT_LOGS (default ~/conexus-pilot-logs),
# CONEXUS_DIAGNOSTIC_DIR (default $CONEXUS_PILOT_LOGS/diagnostics: heap snapshots and fatal reports).
set -euo pipefail
cd "$(dirname "$0")/../.."
source "$HOME/.nvm/nvm.sh" >/dev/null
nvm use >/dev/null
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then echo "pilot checkout has local changes" >&2; exit 1; fi
env_file="${CONEXUS_PILOT_RUNNER_ENV:-$HOME/q3/runner.env}"
logs="${CONEXUS_PILOT_LOGS:-$HOME/conexus-pilot-logs}"
mkdir -p "$logs"
exec > >(tee -a "$logs/runner.log") 2>&1
build="$(mktemp -d apps/hub/.conexus-build-runner-XXXXXX)"
trap 'rm -rf "$build"' EXIT
node node_modules/typescript/bin/tsc --project apps/hub/tsconfig.json --noEmit false --outDir "$build"
set -a
source "$env_file"
set +a
echo "runner starting $(date -u +%FT%TZ) head $(git rev-parse --short HEAD)"
export CONEXUS_SERVICE_VERSION="$(git rev-parse --short HEAD)"
diagnostics="${CONEXUS_DIAGNOSTIC_DIR:-$logs/diagnostics}"
mkdir -p "$diagnostics"
mapfile -t node_args < <(node --input-type=module -e "
import { hubNodeArguments } from './scripts/build-hub-local.mjs'
console.log(hubNodeArguments({ buildRoot: process.argv[1], diagnosticDir: process.argv[2], entry: 'app-runner/main.js' }).join('\\n'))
" "$PWD/$build" "$diagnostics")
node "${node_args[@]}"
