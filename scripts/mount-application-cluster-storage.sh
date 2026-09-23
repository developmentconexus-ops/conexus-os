#!/bin/bash
# Gives the Applications PostgreSQL a filesystem of its own with a fixed size, so nothing the Data
# Plane writes (PGDATA, pg_wal, server logs, temporary files) can consume the storage the Hub needs.
# An installation step run as root, once per host: on a VPS the same role is played by a separate
# block volume mounted at the same path.
#
#   sudo bash scripts/mount-application-cluster-storage.sh install <image> <size-MiB> <mountpoint>
#   sudo bash scripts/mount-application-cluster-storage.sh remove  <image> <mountpoint>
#
# install allocates every block of the image (never a sparse file), makes an ext4 filesystem on it
# that initialises its inode tables and journal now rather than lazily after mount, mounts it through
# a systemd mount unit that survives reboot, and creates <mountpoint>/pgdata owned by the postgres
# image's uid. The cluster binds only that directory; if the filesystem is not mounted the directory
# does not exist and the container refuses to start rather than write to the root filesystem. Reruns
# converge.
#
# mke2fs and the kernel zero ranges of a loop device by punching holes in its backing file, so an image
# that was fully allocated before mkfs comes out sparse. The image is allocated again after mkfs and
# its allocation checked again once mounted: a sparse image would reserve nothing.
set -euo pipefail

POSTGRES_UID=999
action="${1:-}"
image="${2:-}"

fail() { echo "$1" >&2; exit 1; }
[ "$(id -u)" = 0 ] || fail "STORAGE_NEEDS_ROOT"
case "$image" in /*) ;; *) fail "STORAGE_IMAGE_PATH_NOT_ABSOLUTE" ;; esac

unit_for() { systemd-escape -p --suffix=mount "$1"; }
allocated_bytes() { echo $(($(stat -c %b "$1") * $(stat -c %B "$1"))); }
require_allocated() {
  local allocated
  allocated="$(allocated_bytes "$1")"
  [ "$allocated" -ge "$2" ] || fail "STORAGE_IMAGE_SPARSE: $allocated of $2 bytes allocated ($3)"
}

if [ "$action" = install ]; then
  size_mib="${3:-}"
  mountpoint="${4:-}"
  [[ "$size_mib" =~ ^[0-9]+$ ]] && [ "$size_mib" -ge 256 ] || fail "STORAGE_SIZE_REFUSED"
  case "$mountpoint" in /*) ;; *) fail "STORAGE_MOUNTPOINT_NOT_ABSOLUTE" ;; esac
  wanted=$((size_mib * 1024 * 1024))
  install -d -m 755 "$(dirname "$image")"
  if [ -e "$image" ]; then
    [ "$(stat -c %s "$image")" = "$wanted" ] || fail "STORAGE_IMAGE_SIZE_MISMATCH: $image"
  else
    rm -f "$image.partial"
    fallocate -l "$wanted" "$image.partial"
    mkfs.ext4 -q -E nodiscard,lazy_itable_init=0,lazy_journal_init=0 -L conexus-apps "$image.partial"
    mv "$image.partial" "$image"
  fi
  chmod 600 "$image"
  fallocate -l "$wanted" "$image"
  require_allocated "$image" "$wanted" "after mkfs"
  unit="$(unit_for "$mountpoint")"
  cat > "/etc/systemd/system/$unit" <<UNIT
[Unit]
Description=Conexus Applications PostgreSQL storage
Before=docker.service

[Mount]
What=$image
Where=$mountpoint
Type=ext4
Options=loop,nodiscard,noatime

[Install]
WantedBy=local-fs.target
UNIT
  systemctl daemon-reload
  systemctl enable --now "$unit"
  findmnt -n "$mountpoint" > /dev/null || fail "STORAGE_NOT_MOUNTED"
  require_allocated "$image" "$wanted" "after mount"
  # Numeric ids: the host has no user named after the postgres image's uid.
  install -d -m 700 "$mountpoint/pgdata"
  chown "$POSTGRES_UID:$POSTGRES_UID" "$mountpoint/pgdata"
  df -B1 --output=size,avail "$mountpoint" | tail -1 | awk -v unit="$unit" -v bytes="$(allocated_bytes "$image")" \
    '{ printf "{\"verdict\":\"MOUNTED\",\"unit\":\"%s\",\"imageAllocatedBytes\":%s,\"filesystemBytes\":%s,\"availableBytes\":%s}\n", unit, bytes, $1, $2 }'
elif [ "$action" = remove ]; then
  mountpoint="${3:-}"
  case "$mountpoint" in /*) ;; *) fail "STORAGE_MOUNTPOINT_NOT_ABSOLUTE" ;; esac
  unit="$(unit_for "$mountpoint")"
  systemctl disable --now "$unit" 2>/dev/null || true
  rm -f "/etc/systemd/system/$unit"
  systemctl daemon-reload
  rm -f "$image"
  rmdir "$mountpoint" 2>/dev/null || true
  echo "{\"verdict\":\"REMOVED\",\"unit\":\"$unit\"}"
else
  fail "USAGE: install <image> <size-MiB> <mountpoint> | remove <image> <mountpoint>"
fi
