#!/usr/bin/env bash
set -eu
repo=$(cd -- "$(dirname -- "$0")/.." && pwd -P)
ledger_dir=$(mktemp -d "${TMPDIR:-/tmp}/conexus-test-ledger.XXXXXX")
export CONEXUS_TEST_LEDGER="$ledger_dir/tests.jsonl"
export CONEXUS_TEST_LEDGER_ROOT="$PWD"
export NODE_OPTIONS="${NODE_OPTIONS:-} --test-reporter=tap --test-reporter-destination=stdout --test-reporter=$repo/scripts/test-ledger-reporter.mjs --test-reporter-destination=stdout"
# A subprocess inherited from node:test must load its own reporters.
unset NODE_TEST_CONTEXT
finish() {
  result=$?
  trap - EXIT
  if ! node "$repo/scripts/check-test-skips.mjs"; then result=1; fi
  rm -rf -- "$ledger_dir"
  exit "$result"
}
trap finish EXIT
node --test "$@" </dev/null
