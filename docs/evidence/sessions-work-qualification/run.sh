#!/usr/bin/env bash
# Runs the conversations probe from this checkout, in two separate OS processes over one
# scratch store, so "survives a process restart" is asserted by a process that never saw
# the writer. Fails loudly: a failing assertion in either process fails this script.
#
# Dependencies are read from an existing install rather than a fresh one, because the point
# is to qualify the versions the product actually resolved. Point CONEXUS_NODE_MODULES at
# another install to run this elsewhere.
set -euo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
PROBE="$HERE/probe.mjs"
MODULES=${CONEXUS_NODE_MODULES:-~/wt-stream/node_modules}

[ -f "$PROBE" ] || { echo "probe.mjs not found beside this script"; exit 2; }
[ -d "$MODULES/@mastra/core" ] || { echo "no @mastra/core under $MODULES; set CONEXUS_NODE_MODULES"; exit 2; }

echo "# node:        $(node --version)"
echo "# modules:     $MODULES"
for pkg in core memory libsql; do
  echo "# @mastra/$pkg: $(node -p "require('$MODULES/@mastra/$pkg/package.json').version")"
done

STORE=$(mktemp -d "${TMPDIR:-/tmp}/conexus-qual-XXXXXXXX")
trap 'rm -rf "$STORE"' EXIT
echo "# store:       $STORE"

HANDLES=$(CONEXUS_NODE_MODULES="$MODULES" node "$PROBE" "$STORE" write)
echo "# writer process exited 0, pid gone"

CONEXUS_NODE_MODULES="$MODULES" PROBE_HANDLES="$HANDLES" node "$PROBE" "$STORE" read

# Negative control. The reader is asked to assert something false about the same store; if
# the harness cannot fail, every PASS above is worthless.
CONTROL=$(mktemp -d "${TMPDIR:-/tmp}/conexus-qual-control-XXXXXXXX")
trap 'rm -rf "$STORE" "$CONTROL"' EXIT
CONEXUS_NODE_MODULES="$MODULES" node "$PROBE" "$CONTROL" negative-control && {
  echo "negative control passed, which means the harness cannot fail"; exit 1
}
echo "# negative control failed as required, so a false claim does exit non-zero"
