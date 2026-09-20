#!/usr/bin/env bash
# Regenerates every line of output.md from the versioned probes in this directory.
# Usage: bash capture.sh > transcript.txt 2>&1
# It installs the Factory into a scratch directory of its own and removes nothing else.
# The only sanitization output.md applies is declared there: scratch paths and the random
# ids inside a run change every time.
set -uo pipefail

HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
status=0
section () { printf '\n===== %s =====\n' "$1"; }

section 'conversations probe, two processes, from this checkout'
bash "$HERE/run.sh" 2>&1 || status=1

section 'factory resolution against the versions the product already has'
SCRATCH_FILE=$(mktemp "${TMPDIR:-/tmp}/factory-scratch-path-XXXXXX")
bash "$HERE/factory-compat.sh" 2>&1 1>"$SCRATCH_FILE" || status=1
SCRATCH=$(tail -1 "$SCRATCH_FILE")
rm -f "$SCRATCH_FILE"
if [ ! -d "${SCRATCH:-}/node_modules" ]; then
  echo "the compatibility probe did not produce a scratch install, so the Factory probes cannot run"
  exit 1
fi

section 'factory boot through prepare, finalize and shutdown'
cp "$HERE/factory-boot.mjs" "$SCRATCH/"
( cd "$SCRATCH" && node factory-boot.mjs 2>&1 ) || status=1

section 'factory work engine'
cp "$HERE/factory-work.mjs" "$SCRATCH/"
( cd "$SCRATCH" && node factory-work.mjs 2>&1 ) || status=1

section 'factory conversations and the step that starts Work'
cp "$HERE/factory-binding.mjs" "$SCRATCH/"
( cd "$SCRATCH" && node factory-binding.mjs 2>&1 ) || status=1

section 'interactive coding over a source the host owns'
cp "$HERE/coding-session.mjs" "$HERE/fixture-model.mjs" "$SCRATCH/"
( cd "$SCRATCH" && node coding-session.mjs 2>&1 ) || status=1

section 'the code-sdk mount the Factory itself uses, with a host workspace'
cp "$HERE/code-sdk-mount.mjs" "$SCRATCH/"
( cd "$SCRATCH" && node code-sdk-mount.mjs 2>&1 ) || status=1

section 'interactive coding, negative control'
CODING_OUT=$(mktemp "${TMPDIR:-/tmp}/coding-negative-control-XXXXXX")
( cd "$SCRATCH" && node coding-session.mjs --negative-control >"$CODING_OUT" 2>&1 )
coding=$?
tail -1 "$CODING_OUT"
rm -f "$CODING_OUT"
if [ "$coding" -eq 0 ]; then
  echo 'negative control passed, so the harness cannot fail'; status=1
else
  echo 'negative control failed as required'
fi

section 'factory work engine, negative control'
CONTROL_OUT=$(mktemp "${TMPDIR:-/tmp}/factory-negative-control-XXXXXX")
( cd "$SCRATCH" && node factory-work.mjs --negative-control >"$CONTROL_OUT" 2>&1 )
control=$?
tail -1 "$CONTROL_OUT"
rm -f "$CONTROL_OUT"
if [ "$control" -eq 0 ]; then
  echo 'negative control passed, so the harness cannot fail'; status=1
else
  echo 'negative control failed as required'
fi

section 'verdict'
[ "$status" = 0 ] && echo 'every probe passed and every negative control failed' || echo 'a probe failed'
echo "scratch install kept at $SCRATCH"
exit "$status"
