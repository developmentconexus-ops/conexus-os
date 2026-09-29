#!/usr/bin/env bash
# Restore a backup folder into a scratch Postgres and a scratch folder, then compare
# per-table row counts against the manifest and run git fsck on every restored repository.
# Never connects to the source database.
# Prints PASS, or the differences and exits 1.
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
  actual="$(sha256sum "$backup/$name" | cut -d' ' -f1)"
  [ "$actual" = "$sha" ] || failures+=("checksum differs for $name")
done < "$backup/manifest.txt"

port="$(python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1])')"
docker run --rm -d --name "$scratch_name" -e POSTGRES_PASSWORD=scratch -p "127.0.0.1:$port:5432" postgres:17.10-bookworm >/dev/null
for _ in $(seq 1 60); do
  docker exec "$scratch_name" pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break
  sleep 1
done
docker exec "$scratch_name" pg_isready -U postgres -h 127.0.0.1 >/dev/null
sleep 1

docker exec "$scratch_name" createdb -U postgres restored
docker exec -i "$scratch_name" pg_restore -U postgres -d restored --no-owner --no-privileges --exit-on-error < "$backup/database.dump"

count_sql="SELECT n.nspname || '.' || c.relname || ' ' || (xpath('/row/c/text()', query_to_xml(format('SELECT count(*) AS c FROM %I.%I', n.nspname, c.relname), false, true, '')))[1]::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE c.relkind IN ('r','p') AND n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'"
sed -n 's/^rows //p' "$backup/manifest.txt" | LC_ALL=C sort > "$scratch_dir/manifest.counts"
docker exec "$scratch_name" psql -U postgres -d restored -At -c "$count_sql" | LC_ALL=C sort > "$scratch_dir/restored.counts"
if ! diff_out="$(diff "$scratch_dir/manifest.counts" "$scratch_dir/restored.counts")"; then
  failures+=("row counts differ (< manifest, > restored):"$'\n'"$diff_out")
fi
tables="$(wc -l < "$scratch_dir/restored.counts")"

mkdir "$scratch_dir/git"
tar -C "$scratch_dir/git" -xzf "$backup/git.tar.gz"
repos=0
while IFS= read -r repo; do
  repos=$((repos + 1))
  git --git-dir="$repo" fsck --strict >/dev/null 2>"$scratch_dir/fsck.err" || failures+=("git fsck failed for $(basename "$repo"): $(head -3 "$scratch_dir/fsck.err")")
done < <(find "$scratch_dir/git" -mindepth 2 -maxdepth 2 -name '*.git' -type d | sort)

if [ ${#failures[@]} -eq 0 ]; then
  echo "PASS tables=$tables repositories=$repos"
else
  echo "FAIL"
  printf '%s\n' "${failures[@]}"
  exit 1
fi
