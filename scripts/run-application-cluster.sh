#!/bin/bash
# Starts the Applications PostgreSQL: the Data Plane's own cluster, apart from the Hub's.
#
#   bash scripts/run-application-cluster.sh <container> <loopback-port> <storage-root> <superuser-password-file>
#
# <storage-root> is the cluster's fixed-size filesystem, mounted by
# scripts/mount-application-cluster-storage.sh, which leaves a marker file at its root and the cluster's
# `pgdata` directory inside it. Everything the cluster writes (PGDATA, pg_wal, server logs, temporary
# files) lands in `pgdata`; the container's own root is read-only and its Docker log is capped.
#
# The cluster refuses to start anywhere but on that filesystem, on every start. This script requires
# the marker, a mountpoint at <storage-root>, and, for a loop image, every block of the image
# allocated. Docker restarts the container without this script, after a crash or a reboot, so the
# container's own entrypoint checks again on every start: the marker is present, on the same
# filesystem as PGDATA, and that filesystem is still the dedicated one, not merely something with a
# marker and stale `pgdata` copied into the plain directory left behind once <storage-root> is
# unmounted. The entrypoint reads /proc/self/mountinfo and requires the mount covering the storage
# root to be ext4 from the exact identity this script found mounted at <storage-root> when it started
# the container, passed in as CONEXUS_APP_CLUSTER_STORAGE_SOURCE. For a loop device that identity is
# the loop's backing file, not the /dev/loopN path: loop numbers are assigned in mount order at boot,
# so a reboot can renumber the same image to a different number, while the backing file it was built
# from stays the same. A plain directory reports its own root filesystem's identity there, never a
# match.
#
# The settings below are cluster-level: set on the server command line, so no Project role can
# change them for the cluster. Roles get tighter per-role values from the application runner
# (apps/hub/src/app-runner/data-plane.ts). Memory is bounded by the container, not by work_mem,
# which any session may raise. Server logs rotate hourly into 24 files named by the hour, each
# truncated when its hour comes round again, so they hold at most the last day, inside PGDATA. No
# size-driven rotation: PostgreSQL truncates only on a time-driven one, and appends on the other.
#
# transaction_timeout and statement_timeout end any session that runs longer, a backup included.
# Dump this cluster with PGOPTIONS='-c transaction_timeout=0 -c statement_timeout=0'.
set -euo pipefail

container="${1:?container}"
port="${2:?port}"
root="${3:?storage root}"
password_file="${4:?superuser password file}"
image="${CONEXUS_APP_CLUSTER_IMAGE:-postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f}"
memory="${CONEXUS_APP_CLUSTER_MEMORY:-1g}"
cpus="${CONEXUS_APP_CLUSTER_CPUS:-2}"
marker=.conexus-apps-storage
storage=/var/lib/conexus-apps-storage

fail() { echo "$1" >&2; exit 1; }
[[ "$port" =~ ^[0-9]+$ ]] || fail "APPLICATION_CLUSTER_PORT_REFUSED"
case "$root" in /*) ;; *) fail "APPLICATION_CLUSTER_STORAGE_NOT_ABSOLUTE: $root" ;; esac
[ -f "$root/$marker" ] && [ -d "$root/pgdata" ] || fail "APPLICATION_CLUSTER_STORAGE_MISSING: $root"
mountpoint -q "$root" || fail "APPLICATION_CLUSTER_STORAGE_NOT_MOUNTED: $root"
device="$(findmnt -n -o SOURCE --mountpoint "$root")"
# A trim punches holes in the image even with nodiscard, and a sparse image reserves nothing.
case "$device" in
  /dev/loop*)
    image_file="$(cat "/sys/block/${device#/dev/}/loop/backing_file")"
    allocated=$(($(stat -c %b "$image_file") * $(stat -c %B "$image_file")))
    size="$(stat -c %s "$image_file")"
    [ "$allocated" -ge "$size" ] || fail "APPLICATION_CLUSTER_STORAGE_SPARSE: $allocated of $size bytes allocated in $image_file"
    identity="$image_file"
    ;;
  *)
    identity="$device"
    ;;
esac

# Runs as the container's entrypoint on every start, Docker's restarts included. Beyond the marker,
# it requires the mount covering $storage to still be the dedicated ext4 filesystem this script found
# at <storage-root>: a plain directory left behind by an unmount reports its own root filesystem's
# identity, which never matches CONEXUS_APP_CLUSTER_STORAGE_SOURCE below. For a loop mount, "identity"
# resolves the live source to its backing file too, since a reboot can remount the same image under a
# different /dev/loopN number and the raw device path would then never match either.
guard="[ -f $storage/$marker ] && [ \"\$(stat -c %d $storage/$marker)\" = \"\$(stat -c %d /var/lib/postgresql/data)\" ]"' && line=$(grep -F " /var/lib/conexus-apps-storage " /proc/self/mountinfo | tail -n1) && rest=${line#*" - "} && fstype=${rest%% *} && src=${rest#* } && src=${src%% *} && case $src in /dev/loop*) identity=$(cat "/sys/block/${src#/dev/}/loop/backing_file") ;; *) identity=$src ;; esac && [ "$fstype" = ext4 ] && [ "$identity" = "$CONEXUS_APP_CLUSTER_STORAGE_SOURCE" ] || { echo APPLICATION_CLUSTER_STORAGE_UNMOUNTED >&2; exit 1; }; exec docker-entrypoint.sh "$@"'

docker run -d --name "$container" \
  --restart unless-stopped \
  --publish "127.0.0.1:$port:5432" \
  --memory "$memory" --memory-swap "$memory" --cpus "$cpus" --pids-limit 512 --shm-size 128m \
  --read-only --tmpfs /var/run/postgresql:size=1m,uid=999,gid=999,mode=2775 --tmpfs /tmp:size=16m \
  --security-opt no-new-privileges \
  --log-opt max-size=10m --log-opt max-file=2 \
  --mount "type=bind,source=$root,target=$storage,readonly" \
  --mount "type=bind,source=$root/pgdata,target=/var/lib/postgresql/data" \
  --mount "type=bind,source=$password_file,target=/run/secrets/postgres-password,readonly" \
  --env POSTGRES_PASSWORD_FILE=/run/secrets/postgres-password \
  --env POSTGRES_INITDB_ARGS=--auth-host=scram-sha-256 \
  --env CONEXUS_APP_CLUSTER_STORAGE_SOURCE="$identity" \
  --entrypoint /bin/sh \
  "$image" \
  -c "$guard" conexus-storage-guard \
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
  -c log_filename=postgresql-%H.log \
  -c log_rotation_age=60 \
  -c log_rotation_size=0 \
  -c log_truncate_on_rotation=on \
  -c log_temp_files=16MB \
  -c log_lock_waits=on \
  -c log_checkpoints=on
