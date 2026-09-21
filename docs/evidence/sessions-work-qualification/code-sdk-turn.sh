#!/usr/bin/env bash
# Drives one full agent turn through the @mastra/code-sdk mount, over a source directory the
# host owns, with no paid model: a local OpenAI-compatible stub answers the model calls.
#
# Usage: bash code-sdk-turn.sh <scratch-install-dir> [--fail]
# The scratch install is the directory factory-compat.sh printed. `--fail` inverts the
# assertion, so a run proves the assertion is load bearing rather than a tautology.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INSTALL=${1:?usage: bash code-sdk-turn.sh <scratch-install-dir> [--fail]}
ASSERT_FALSE=0
[ "${2:-}" = "--fail" ] && ASSERT_FALSE=1

[ -d "$INSTALL/node_modules/@mastra/code-sdk" ] || { echo "no @mastra/code-sdk under $INSTALL"; exit 2; }

WORK=$(mktemp -d "${TMPDIR:-/tmp}/code-sdk-turn-XXXXXXXX")
PROJECT_ROOT="$WORK/project"
mkdir -p "$PROJECT_ROOT/app"
printf 'export const counter = 0\n' > "$PROJECT_ROOT/app/counter.js"

# The probe scripts have to sit beside node_modules for bare-specifier resolution to find
# @mastra/code-sdk, so they are copied into the scratch install rather than run from here.
cp "$HERE/local-provider-stub.mjs" "$HERE/code-sdk-turn.mjs" "$INSTALL/"

STUB_LOG="$WORK/stub.log"
node "$INSTALL/local-provider-stub.mjs" > "$STUB_LOG" 2>&1 &
STUB_PID=$!
# An EXIT trap that calls `exit "$code"` does not propagate that code out of the script, so
# the stub is killed inline on every path instead.

PORT=""
for _ in $(seq 1 50); do
  if grep -q 'STUB_LISTENING' "$STUB_LOG" 2>/dev/null; then
    PORT=$(grep -o 'port=[0-9]*' "$STUB_LOG" | head -1 | cut -d= -f2)
    break
  fi
  sleep 0.1
done
if [ -z "$PORT" ]; then
  echo "the local stub never reported STUB_LISTENING"
  cat "$STUB_LOG"
  kill "$STUB_PID" 2>/dev/null
  rm -rf "$WORK"
  exit 1
fi
echo "# local stub on 127.0.0.1:$PORT, project at $PROJECT_ROOT"

cd "$INSTALL"
MC_PROJECT_ROOT="$PROJECT_ROOT" \
MC_STUB_BASE_URL="http://127.0.0.1:$PORT/v1" \
MC_SCRATCH="$WORK" \
MC_ASSERT_FALSE="$ASSERT_FALSE" \
node "$INSTALL/code-sdk-turn.mjs"
STATUS=$?

echo "--- the stub's own request log ---"
cat "$STUB_LOG"

kill "$STUB_PID" 2>/dev/null
rm -rf "$WORK"
exit $STATUS
