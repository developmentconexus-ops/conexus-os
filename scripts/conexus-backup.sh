#!/usr/bin/env bash
# Back up one Hub database and the Conexus Git root into one dated folder.
# Read-only against the database: pg_dump only.
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

docker exec -e PGPASSWORD "$container" pg_dump -U "$db_user" -d "$database" --format=custom > "$folder/database.dump"
tar -C "$(dirname "$(realpath "$git_root")")" -czf "$folder/git.tar.gz" "$(basename "$(realpath "$git_root")")"

{
  echo "# sha256  bytes  file"
  for f in database.dump git.tar.gz; do
    echo "$(sha256sum "$folder/$f" | cut -d' ' -f1)  $(stat -c %s "$folder/$f")  $f"
  done
  echo "# git-root-name $(basename "$(realpath "$git_root")")"
  echo "# database $database"
} > "$folder/manifest.txt"

cat "$folder/manifest.txt"
echo "BACKUP $folder"
