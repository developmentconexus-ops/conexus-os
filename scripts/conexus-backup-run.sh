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

if ! output="$("$here/conexus-backup.sh" "$@" 2>&1)"; then
  echo "BACKUP_RUN code=BACKUP_FAILED $(printf '%s' "$output" | tail -1)"
  exit 1
fi
folder="$(printf '%s\n' "$output" | sed -n 's/^BACKUP //p')"

if ! check="$("$here/conexus-restore-check.sh" --backup "$folder" 2>&1)"; then
  mv "$folder" "$folder.failed"
  ls -d "$out_root"/*.failed | head -n -1 | xargs -r rm -rf
  echo "BACKUP_RUN code=RESTORE_CHECK_FAILED folder=$folder.failed $(printf '%s' "$check" | sed -n '2p')"
  exit 1
fi

ls -d "$out_root"/[0-9]*T*Z | head -n -"$keep" | xargs -r rm -rf
echo "BACKUP_RUN code=OK folder=$folder $check"
