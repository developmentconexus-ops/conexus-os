#!/usr/bin/env bash
# Runs the two probes that back this increment. Both fail closed: any false claim exits non-zero,
# and the last run is a negative control whose claim is false on purpose, so a green run is also
# proof that the harness can fail.
set -uo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
root="$(cd "$here/../../.." && pwd)"
cd "$root"

if [ ! -d node_modules/@mastra/code-sdk ]; then
  echo "install the repository's dependencies first: @mastra/code-sdk is missing" >&2
  exit 1
fi
node -e 'const p = require("./package-lock.json"); for (const name of ["@mastra/code-sdk", "@mastra/core", "@mastra/libsql"]) console.log(name, p.packages["node_modules/" + name].version)'

state="$(mktemp -d)"
trap 'rm -rf "$state"' EXIT
export CONV_PROBE_ROOT="$state"

echo "=== conversations, pass 1: writes ==="
CONV_PROBE_PASS=1 node "$here/conversations.mjs" || exit 1
echo "=== conversations, pass 2: reads them back in a new process ==="
CONV_PROBE_PASS=2 node "$here/conversations.mjs" || exit 1
echo "=== model selection ==="
node --experimental-strip-types "$here/model-selection.mjs" || exit 1
echo "=== negative control: this run must fail ==="
if CONV_PROBE_PASS=2 CONV_PROBE_NEGATIVE=1 node "$here/conversations.mjs"; then
  echo "the negative control passed, so these probes cannot be trusted" >&2
  exit 1
fi
echo "all probes passed and the negative control failed"
