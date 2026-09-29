#!/usr/bin/env bash
# Back up one Hub database and the Conexus Git root into one dated folder.
# Read-only against the database. The dump and the per-table row counts in manifest.txt
# share one exported snapshot, so they describe the same point in time.
set -euo pipefail

usage() {
  echo "usage: conexus-backup.sh --container NAME --database NAME --git-root DIR --out-root DIR [--user postgres] [--password-file FILE]" >&2
  exit 2
}

container= database= git_root= out_root= db_user=postgres password_file=
while [ $# -gt 0 ]; do
  case "$1" in
    --container) container=${2:-}; shift 2 ;;
    --database) database=${2:-}; shift 2 ;;
    --git-root) git_root=${2:-}; shift 2 ;;
    --out-root) out_root=${2:-}; shift 2 ;;
    --user) db_user=${2:-}; shift 2 ;;
    --password-file) password_file=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$container" ] && [ -n "$database" ] && [ -n "$git_root" ] && [ -n "$out_root" ] || usage
[ -d "$git_root" ] || { echo "git root not found: $git_root" >&2; exit 1; }

if [ -n "$password_file" ]; then
  PGPASSWORD="$(cat "$password_file")"
  export PGPASSWORD
fi

folder="$out_root/$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$out_root"
mkdir "$folder"

count_sql="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"

# One session holds a REPEATABLE READ snapshot open so the counts and the dump are one point in time.
coproc SNAP { docker exec -i -e PGPASSWORD "$container" psql -U "$db_user" -d "$database" -At -q -v ON_ERROR_STOP=1; }
reply=
snap_reply() {
  local line
  reply=
  while IFS= read -r -t 120 line <&"${SNAP[0]}"; do
    [ "$line" = "__END__" ] && return 0
    reply+="${reply:+$'\n'}$line"
  done
  echo "snapshot session did not answer" >&2
  return 1
}
echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot(); \\echo __END__" >&"${SNAP[1]}"
snap_reply
snapshot_id="$reply"
echo "$count_sql; \\echo __END__" >&"${SNAP[1]}"
snap_reply
counts="$(printf '%s\n' "$reply" | LC_ALL=C sort)"

docker exec -e PGPASSWORD "$container" pg_dump -U "$db_user" -d "$database" --format=custom --snapshot="$snapshot_id" > "$folder/database.dump"

echo "ROLLBACK; \\q" >&"${SNAP[1]}"
wait "$SNAP_PID"

tar -C "$(dirname "$(realpath "$git_root")")" -czf "$folder/git.tar.gz" "$(basename "$(realpath "$git_root")")"

{
  echo "# sha256  bytes  file"
  for f in database.dump git.tar.gz; do
    echo "$(sha256sum "$folder/$f" | cut -d' ' -f1)  $(stat -c %s "$folder/$f")  $f"
  done
  echo "# git-root-name $(basename "$(realpath "$git_root")")"
  echo "# database $database"
  echo "$counts" | sed 's/^/rows /'
} > "$folder/manifest.txt"

cat "$folder/manifest.txt"
echo "BACKUP $folder"
