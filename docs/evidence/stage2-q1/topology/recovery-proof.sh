#!/bin/bash
# After the Applications cluster fills its filesystem, can it recover without touching the Hub?
# Probe filesystem only. A root-owned 64 MiB ballast file sits beside pgdata; the fill runs until the
# cluster fails; the cluster's state is watched for 60 s; then the ballast is deleted (a root container,
# no sudo), the cluster restarts, the fill table is dropped, and a row is written and read back.
set -uo pipefail
cd "$HOME/wt-q1"
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
probe=/var/lib/conexus/q1-storage-probe
pw="$HOME/q1c/fill-pw"
as_root() { docker run --rm --mount "type=bind,source=$probe,target=/v" "$image" sh -c "$1"; }
state() { echo "$(docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' q1c-fill) ready=$(docker exec q1c-fill pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && echo yes || echo no) avail=$(df -B1 --output=avail $probe | tail -1 | tr -d ' ')"; }
docker rm -f q1c-fill >/dev/null 2>&1
as_root 'rm -rf /v/pgdata/* /v/pgdata/.[!.]* /v/ballast; fallocate -l 64M /v/ballast; ls -ln /v'
CONEXUS_APP_CLUSTER_MEMORY=512m bash scripts/run-application-cluster.sh q1c-fill 55445 "$probe/pgdata" "$pw" >/dev/null
for i in $(seq 1 60); do docker exec q1c-fill pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
for round in $(seq 1 40); do
  docker exec -i q1c-fill psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$HOME/q1c/fill.sql" >/dev/null 2>&1 || { echo "fill failed at round $round"; break; }
done
for t in 5 20 40 60; do sleep $((t == 5 ? 5 : 20)); echo "t+${t}s: $(state)"; done
docker logs q1c-fill 2>&1 | grep -E 'PANIC|No space|could not write' | tail -3 | cut -c1-200
echo "== delete ballast"
as_root 'rm -f /v/ballast'
docker restart q1c-fill >/dev/null
for i in $(seq 1 60); do docker exec q1c-fill pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
echo "after ballast: $(state)"
docker exec q1c-fill psql -X -U postgres -d postgres -At -c 'DROP TABLE fill' -c 'CHECKPOINT' -c 'CREATE TABLE ok (i int)' -c 'INSERT INTO ok VALUES (42)' -c 'SELECT i FROM ok' 2>&1 | tail -2
echo "after drop: $(state)"
docker rm -f q1c-fill >/dev/null
as_root 'rm -rf /v/pgdata/* /v/pgdata/.[!.]*; ls -A /v/pgdata | wc -l'
