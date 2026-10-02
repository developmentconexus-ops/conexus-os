#!/usr/bin/env bash
# One scheduled run: back up, prove the restore, keep the result only when the check passes.
# Takes the arguments of conexus-backup.sh. A failed run renames its folder to <name>.failed, keeps every
# earlier good folder, and exits 1. Logs one line, "BACKUP_RUN code=<CODE> ...", that a person can search.
# Only the newest .failed folder is kept. Only the newest 7 good folders are kept.
set -euo pipefail

here="$(dirname "$0")"
out_root=
args=("$@")
for i in "${!args[@]}"; do
  [ "${args[$i]}" = "--out-root" ] && out_root="${args[$((i + 1))]:-}"
done
[ -n "$out_root" ] || { echo "usage: conexus-backup-run.sh <conexus-backup.sh arguments>" >&2; exit 2; }
keep=7

fail() {
  ls -d "$out_root"/*.failed 2>/dev/null | head -n -1 | xargs -r rm -rf
  echo "BACKUP_RUN code=$1 $2"
  exit 1
}

if ! output="$("$here/conexus-backup.sh" --partial "$@" 2>&1)"; then
  for partial in "$out_root"/*.partial; do
    [ -d "$partial" ] && mv "$partial" "${partial%.partial}.failed"
  done
  fail BACKUP_FAILED "$(printf '%s' "$output" | tail -1)"
fi
partial="$(printf '%s\n' "$output" | sed -n 's/^BACKUP //p')"
final="${partial%.partial}"

if ! check="$("$here/conexus-restore-check.sh" --backup "$partial" 2>&1)"; then
  mv "$partial" "$final.failed"
  fail RESTORE_CHECK_FAILED "folder=$final.failed $(printf '%s' "$check" | sed -n '2p')"
fi
mv "$partial" "$final"

verified=()
for dir in "$out_root"/[0-9]*T*Z; do
  [ -f "$dir/manifest.txt" ] && verified+=("$dir")
done
if [ ${#verified[@]} -gt "$keep" ]; then
  rm -rf "${verified[@]:0:${#verified[@]}-keep}"
fi
ls -d "$out_root"/*.failed 2>/dev/null | head -n -1 | xargs -r rm -rf
echo "BACKUP_RUN code=OK folder=$final $check"
