#!/usr/bin/env bash
# Runs the qualification probe in two separate OS processes over one store,
# so "survives a process restart" is asserted by a process that never saw the writer.
set -euo pipefail
export PATH="$HOME/.nvm/versions/node/v24.20.0/bin:$PATH"
STORE=$(mktemp -d /tmp/conexus-qual-XXXXXX)
trap 'rm -rf "$STORE"' EXIT
cd /home/leandrotheodoro/wt-stream
echo "# store: $STORE"
echo "# node:  $(node --version)"
HANDLES=$(node /home/leandrotheodoro/qual-probe2.mjs "$STORE" write 2>/dev/null | tail -1)
echo "# writer process exited, pid gone"
PROBE_HANDLES="$HANDLES" node /home/leandrotheodoro/qual-probe2.mjs "$STORE" read
