#!/bin/bash
# Q1.0 storage mechanism, proved on the 1 GiB probe filesystem (never the pilot's 4 GiB one).
# 1. A missing pgdata source: the cluster script and Docker's --mount both refuse to start.
# 2. Fill: the Applications cluster script runs a throwaway cluster on the probe filesystem and one
#    session writes incompressible rows until the filesystem is full. Records the probe filesystem, the
#    WSL root filesystem and D: before and after, and the Hub cluster's start time and a write/read.
# Cleans up: removes the throwaway container and empties the probe pgdata directory.
set -uo pipefail
cd "$HOME/wt-q1"
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
probe=/var/lib/conexus/q1-storage-probe
pw="$HOME/q1c/fill-pw"
[ -f "$pw" ] || { (umask 077; head -c 24 /dev/urandom | base64 | tr -d '/+=' > "$pw"); }
free() { echo "probe=$(df -B1 --output=avail $probe | tail -1) root=$(df -B1 --output=avail / | tail -1) d=$(df -B1 --output=avail /mnt/d | tail -1)"; }
hub() {
  docker exec conexus-s7-postgres psql -U postgres -d postgres -Atc "select pg_postmaster_start_time()" 2>&1 | tr -d '\n'
  echo -n " restarts=$(docker inspect -f '{{.RestartCount}}' conexus-s7-postgres)"
  echo " write/read=$(docker exec conexus-s7-postgres psql -U postgres -d postgres -Atc "create temp table t(x int); insert into t values (1); select sum(x) from t" 2>&1 | tail -1)"
}

echo "== 1. missing storage"
bash scripts/run-application-cluster.sh q1c-fill 55445 "$probe/absent" "$pw" 2>&1 | tail -1
docker run --rm --mount "type=bind,source=$probe/absent,target=/var/lib/postgresql/data" "$image" true 2>&1 | grep -i error | head -1
echo "absent after both: $(ls -d $probe/absent 2>&1)"

echo "== 2. fill $(date -u +%FT%TZ)"
docker rm -f q1c-fill >/dev/null 2>&1
CONEXUS_APP_CLUSTER_MEMORY=512m bash scripts/run-application-cluster.sh q1c-fill 55445 "$probe/pgdata" "$pw" >/dev/null
for i in $(seq 1 60); do docker exec q1c-fill pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
echo "before: $(free)"
echo "hub before: $(hub)"
for round in $(seq 1 40); do
  out=$(docker exec -i q1c-fill psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 -q < "$HOME/q1c/fill.sql" 2>&1)
  status=$?
  echo "round $round status=$status $(echo "$out" | tail -1 | cut -c1-160) | $(free)"
  [ $status -ne 0 ] && break
done
sleep 5
echo "after: $(free)"
echo "fill container: $(docker inspect -f '{{.State.Status}} restarts={{.RestartCount}} oom={{.State.OOMKilled}}' q1c-fill)"
echo "probe fs: $(df -h --output=size,used,avail,pcent $probe | tail -1)"
echo "hub after: $(hub)"
docker logs q1c-fill 2>&1 | grep -E 'PANIC|No space|FATAL' | head -5
docker exec q1c-fill sh -c 'tail -n 5 /var/lib/postgresql/data/log/*.log' 2>&1 | cut -c1-200 | tail -5

echo "== cleanup"
docker rm -f q1c-fill >/dev/null
docker run --rm --mount "type=bind,source=$probe/pgdata,target=/d" "$image" sh -c 'rm -rf /d/* /d/.[!.]* 2>/dev/null; ls -A /d | wc -l'
echo "after cleanup: $(free)"
