#!/usr/bin/env bash
# A folder is named <stamp>.partial while it is written. It becomes <stamp> when complete, or stays .partial
# with --partial, so the caller can rename it after its own check.
# Back up the Hub and Applications databases, Git, sealing keys and identity realm into one folder.
# Each database's dump and row counts share its own exported snapshot while table writes continue.
set -euo pipefail
umask 077

usage() {
  echo "usage: conexus-backup.sh --container NAME --database NAME --applications-container NAME --applications-database NAME --git-root DIR --out-root DIR --key-file FILE [--key-file FILE ...] --keycloak-container NAME --keycloak-realm NAME [--partial] [--stamp STAMP] [--user postgres] [--password-file FILE] [--applications-user postgres] [--applications-password-file FILE]" >&2
  exit 2
}

container= database= git_root= out_root= db_user=postgres password_file= keycloak_container= keycloak_realm= partial= stamp=
applications_container= applications_database= applications_user=postgres applications_password_file=
key_files=()
while [ $# -gt 0 ]; do
  case "$1" in
    --container) container=${2:-}; shift 2 ;;
    --database) database=${2:-}; shift 2 ;;
    --applications-container) applications_container=${2:-}; shift 2 ;;
    --applications-database) applications_database=${2:-}; shift 2 ;;
    --applications-user) applications_user=${2:-}; shift 2 ;;
    --applications-password-file) applications_password_file=${2:-}; shift 2 ;;
    --git-root) git_root=${2:-}; shift 2 ;;
    --out-root) out_root=${2:-}; shift 2 ;;
    --user) db_user=${2:-}; shift 2 ;;
    --password-file) password_file=${2:-}; shift 2 ;;
    --partial) partial=1; shift ;;
    --stamp) stamp=${2:-}; shift 2 ;;
    --key-file) key_files+=("${2:-}"); shift 2 ;;
    --keycloak-container) keycloak_container=${2:-}; shift 2 ;;
    --keycloak-realm) keycloak_realm=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$container" ] && [ -n "$database" ] && [ -n "$git_root" ] && [ -n "$out_root" ] || usage
[ -n "$applications_container" ] && [ -n "$applications_database" ] || usage
[ "$applications_container" != "$container" ] || { echo "APPLICATIONS_CLUSTER_NOT_SEPARATE" >&2; exit 2; }
[[ "$applications_database" =~ ^[a-z_][a-z0-9_]{0,62}$ ]] || { echo "APPLICATIONS_DATABASE_INVALID" >&2; exit 2; }
case "$applications_database" in postgres|template0|template1) echo "APPLICATIONS_DATABASE_RESERVED" >&2; exit 2 ;; esac
[ ${#key_files[@]} -gt 0 ] && [ -n "$keycloak_container" ] && [ -n "$keycloak_realm" ] || usage
[ -d "$git_root" ] || { echo "git root not found: $git_root" >&2; exit 1; }
declare -A seen_key_names=()
for key_file in "${key_files[@]}"; do
  [ -f "$key_file" ] || { echo "BACKUP_KEY_FILE_MISSING $(basename "$key_file")" >&2; exit 1; }
  [ -z "${seen_key_names[$(basename "$key_file")]:-}" ] || { echo "BACKUP_KEY_FILE_DUPLICATE_NAME $(basename "$key_file")" >&2; exit 1; }
  seen_key_names[$(basename "$key_file")]=1
done

final="$out_root/${stamp:-$(date -u +%Y%m%dT%H%M%SZ)}"
folder="$final.partial"
mkdir -p "$out_root"
mkdir "$folder"

count_sql="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"

snapshot_dump() (
  set -e
  source_container=$1 source_database=$2 source_user=$3 source_password_file=$4 artifact=$5 options=$6
  shift 6
  export PGPASSWORD="${PGPASSWORD:-}" PGOPTIONS="$options"
  [ -z "$source_password_file" ] || PGPASSWORD="$(cat "$source_password_file")"
  coproc SNAP { docker exec -i -e PGPASSWORD -e PGOPTIONS "$source_container" psql -U "$source_user" -d "$source_database" -At -q -v ON_ERROR_STOP=1; }
  snap_pid=$SNAP_PID snap_in=${SNAP[1]} snap_out=${SNAP[0]}
  close_snapshot() {
    exec {snap_in}>&-
    exec {snap_out}<&-
    wait "$snap_pid" || true
  }
  trap close_snapshot EXIT
  snap_reply() {
    local line
    reply=
    while IFS= read -r -t 120 line <&"$snap_out"; do
      [ "$line" = "__END__" ] && return 0
      reply+="${reply:+$'\n'}$line"
    done
    echo "snapshot session did not answer" >&2
    return 1
  }
  echo "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot(); \\echo __END__" >&"$snap_in"
  snap_reply
  snapshot_id="$reply"
  echo "$count_sql; \\echo __END__" >&"$snap_in"
  snap_reply
  counts="$reply"
  docker exec -e PGPASSWORD -e PGOPTIONS "$source_container" pg_dump -U "$source_user" -d "$source_database" --format=custom --snapshot="$snapshot_id" "$@" > "$folder/$artifact"
  echo "ROLLBACK; \\q" >&"$snap_in"
  wait "$snap_pid"
  trap - EXIT
  printf '%s' "$counts" | LC_ALL=C sort
)

counts="$(snapshot_dump "$container" "$database" "$db_user" "$password_file" database.dump '')"
# The snapshot holder is idle during pg_dump; the Applications cluster also bounds idle transactions.
applications_options='-c transaction_timeout=0 -c statement_timeout=0 -c idle_in_transaction_session_timeout=0'
applications_counts="$(PGPASSWORD= snapshot_dump "$applications_container" "$applications_database" "$applications_user" "$applications_password_file" applications.dump "$applications_options" --create)"
(
  export PGPASSWORD= PGOPTIONS="$applications_options"
  [ -z "$applications_password_file" ] || PGPASSWORD="$(cat "$applications_password_file")"
  docker exec -e PGPASSWORD -e PGOPTIONS "$applications_container" pg_dumpall -U "$applications_user" --globals-only --no-role-passwords --no-tablespaces > "$folder/applications-globals.sql"
)

tar -C "$(dirname "$(realpath "$git_root")")" -czf "$folder/git.tar.gz" "$(basename "$(realpath "$git_root")")"

mkdir "$folder/keys"
key_names=()
for key_file in "${key_files[@]}"; do
  key_names+=("$(basename "$key_file")")
  install -m 600 "$key_file" "$folder/keys/$(basename "$key_file")"
done
"$(dirname "$0")/../infra/keycloak/export-realm.sh" --from-container "$keycloak_container" --from-realm "$keycloak_realm" --out "$folder/identity-realm.json"

{
  echo "# sha256  bytes  file"
  for f in database.dump applications.dump applications-globals.sql git.tar.gz identity-realm.json "${key_names[@]/#/keys/}"; do
    echo "$(sha256sum "$folder/$f" | cut -d' ' -f1)  $(stat -c %s "$folder/$f")  $f"
  done
  echo "# git-root-name $(basename "$(realpath "$git_root")")"
  echo "# database $database"
  echo "# applications-database $applications_database"
  echo "# applications-tables $(printf '%s\n' "$applications_counts" | sed '/^$/d' | wc -l)"
  echo "# identity-realm $keycloak_realm"
  printf '%s\n' "$counts" | sed '/^$/d; s/^/rows /'
  printf '%s\n' "$applications_counts" | sed '/^$/d; s/^/applications-rows /'
} > "$folder/manifest.txt"

cat "$folder/manifest.txt"
if [ -z "$partial" ]; then
  mv "$folder" "$final"
  folder="$final"
fi
echo "BACKUP $folder"
