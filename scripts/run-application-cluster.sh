#!/bin/bash
# Starts the Applications PostgreSQL: the Data Plane's own cluster, apart from the Hub's.
#
#   bash scripts/run-application-cluster.sh <container> <loopback-port> <pgdata-dir> <superuser-password-file>
#
# <pgdata-dir> is the directory scripts/mount-application-cluster-storage.sh creates inside the
# cluster's fixed-size filesystem. It is bound with --mount, which refuses a missing source: when that
# filesystem is not mounted the directory does not exist and the container does not start, instead
# of initialising a cluster on the root filesystem. Everything the cluster writes (PGDATA, pg_wal,
# server logs, temporary files) lands in that directory; the container's own root is read-only and
# its Docker log is capped.
#
# The settings below are cluster-level: set on the server command line, so no Project role can
# change them for the cluster. Roles get tighter per-role values from the application runner
# (apps/hub/src/app-runner/data-plane.ts). Memory is bounded by the container, not by work_mem,
# which any session may raise.
set -euo pipefail

container="${1:?container}"
port="${2:?port}"
pgdata="${3:?pgdata dir}"
password_file="${4:?superuser password file}"
image="${CONEXUS_APP_CLUSTER_IMAGE:-postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f}"
memory="${CONEXUS_APP_CLUSTER_MEMORY:-1g}"
cpus="${CONEXUS_APP_CLUSTER_CPUS:-2}"

[[ "$port" =~ ^[0-9]+$ ]] || { echo "APPLICATION_CLUSTER_PORT_REFUSED" >&2; exit 1; }
[ -d "$pgdata" ] || { echo "APPLICATION_CLUSTER_STORAGE_MISSING: $pgdata" >&2; exit 1; }

docker run -d --name "$container" \
  --restart unless-stopped \
  --publish "127.0.0.1:$port:5432" \
  --memory "$memory" --memory-swap "$memory" --cpus "$cpus" --pids-limit 512 --shm-size 128m \
  --read-only --tmpfs /var/run/postgresql:size=1m,uid=999,gid=999,mode=2775 --tmpfs /tmp:size=16m \
  --security-opt no-new-privileges \
  --log-opt max-size=10m --log-opt max-file=2 \
  --mount "type=bind,source=$pgdata,target=/var/lib/postgresql/data" \
  --mount "type=bind,source=$password_file,target=/run/secrets/postgres-password,readonly" \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
  --env POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 \
  "$image" \
  -c shared_preload_libraries=pg_stat_statements \
  -c max_connections=60 \
  -c reserved_connections=4 \
  -c superuser_reserved_connections=3 \
  -c shared_buffers=128MB \
  -c statement_timeout=60s \
  -c transaction_timeout=120s \
  -c lock_timeout=10s \
  -c idle_in_transaction_session_timeout=30s \
  -c temp_file_limit=1GB \
  -c max_wal_size=512MB \
  -c min_wal_size=80MB \
  -c logging_collector=on \
  -c log_directory=log \
  -c log_filename=postgresql-%a.log \
  -c log_rotation_age=1d \
  -c log_rotation_size=16MB \
  -c log_truncate_on_rotation=on \
  -c log_temp_files=16MB \
  -c log_lock_waits=on \
  -c log_checkpoints=on
