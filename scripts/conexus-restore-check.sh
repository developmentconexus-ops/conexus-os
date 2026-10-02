#!/usr/bin/env bash
# Restore a backup folder into a scratch Postgres and a scratch folder, then compare
# per-table row counts against the manifest and run git fsck on every restored repository.
# Never connects to the source database.
# Prints PASS, or FAIL followed by one "CODE detail" line per problem, and exits 1.
set -euo pipefail

usage() {
  echo "usage: conexus-restore-check.sh --backup DIR" >&2
  exit 2
}

backup=
while [ $# -gt 0 ]; do
  case "$1" in
    --backup) backup=${2:-}; shift 2 ;;
    *) usage ;;
  esac
done
[ -n "$backup" ] || usage

scratch_name="conexus-restore-check-$$"
scratch_dir="$(mktemp -d)"
failures=()

cleanup() {
  timeout 60 docker stop "$scratch_name" >/dev/null 2>&1 || true
  rm -rf "$scratch_dir"
}
trap cleanup EXIT

while read -r sha bytes name; do
  case "$sha" in '#'*|rows) continue ;; esac
  if [ ! -f "$backup/$name" ]; then
    failures+=("MISSING_FILE $name")
    continue
  fi
  actual="$(sha256sum "$backup/$name" | cut -d' ' -f1)"
  [ "$actual" = "$sha" ] || failures+=("CHECKSUM_MISMATCH $name")
  case "$name" in keys/*) [ "$(stat -c %a "$backup/$name")" = 600 ] || failures+=("KEY_FILE_MODE $name") ;; esac
done < "$backup/manifest.txt"

if [ ${#failures[@]} -gt 0 ]; then
  echo "FAIL"
  printf '%s\n' "${failures[@]}"
  exit 1
fi

docker run --rm -d --name "$scratch_name" -e POSTGRES_PASSWORD=scratch postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f >/dev/null
for _ in $(seq 1 60); do
  docker exec "$scratch_name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$scratch_name" pg_isready -U postgres -h 127.0.0.1 >/dev/null
sleep 1

docker exec "$scratch_name" createdb -U postgres restored
if ! docker exec -i "$scratch_name" pg_restore -U postgres -d restored --no-owner --no-privileges --exit-on-error < "$backup/database.dump" 2>"$scratch_dir/restore.err"; then
  echo "FAIL"
  echo "RESTORE_FAILED $(head -3 "$scratch_dir/restore.err" | tr '\n' ' ')"
  exit 1
fi

count_sql="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"
sed -n 's/^rows //p' "$backup/manifest.txt" | LC_ALL=C sort > "$scratch_dir/manifest.counts"
docker exec "$scratch_name" psql -U postgres -d restored -At -c "$count_sql" | LC_ALL=C sort > "$scratch_dir/restored.counts"
if ! diff_out="$(diff "$scratch_dir/manifest.counts" "$scratch_dir/restored.counts")"; then
  failures+=("ROW_COUNTS_DIFFER (< manifest, > restored):"$'\n'"$diff_out")
fi
tables="$(wc -l < "$scratch_dir/restored.counts")"

mkdir "$scratch_dir/git"
tar -C "$scratch_dir/git" -xzf "$backup/git.tar.gz"
repos=0
while IFS= read -r repo; do
  repos=$((repos + 1))
  git --git-dir="$repo" fsck --strict >/dev/null 2>"$scratch_dir/fsck.err" || failures+=("GIT_FSCK_FAILED $(basename "$repo") $(head -3 "$scratch_dir/fsck.err")")
done < <(find "$scratch_dir/git" -mindepth 2 -maxdepth 2 -name '*.git' -type d | sort)

projects=0
if [ "$(docker exec "$scratch_name" psql -U postgres -d restored -At -c "SELECT to_regclass('project.project') IS NOT NULL")" = t ]; then
  projects="$(docker exec "$scratch_name" psql -U postgres -d restored -At -c 'SELECT count(*) FROM project.project')"
fi
[ "$repos" -gt 0 ] || [ "$projects" -eq 0 ] || failures+=("GIT_EMPTY_WITH_PROJECTS repositories=0 projects=$projects")

if ! node -e 'process.exit(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).realm === process.argv[2] ? 0 : 1)' "$backup/identity-realm.json" "$(sed -n 's/^# identity-realm //p' "$backup/manifest.txt")" 2>/dev/null; then
  failures+=("IDENTITY_EXPORT_INVALID identity-realm.json")
fi

if [ ${#failures[@]} -eq 0 ]; then
  echo "PASS tables=$tables repositories=$repos"
else
  echo "FAIL"
  printf '%s\n' "${failures[@]}"
  exit 1
fi
