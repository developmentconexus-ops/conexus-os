#!/bin/bash
# Does writing into the probe filesystem consume the WSL root filesystem? Writes 400 MiB of random
# bytes into the probe filesystem, syncs, and records the root filesystem's free bytes before and after.
set -uo pipefail
image=postgres:17.10-bookworm@sha256:9b18b78397054fce88a9552e9d5a3ad5bb7fd258c5b3cc1c5028e46373d6ea8f
probe=/var/lib/conexus/q1-storage-probe
root_free() { sync; df -B1 --output=avail / | tail -1 | tr -d ' '; }
for label in idle-1 idle-2; do echo "$label root=$(root_free)"; sleep 5; done
before=$(root_free)
docker run --rm --mount "type=bind,source=$probe,target=/p" "$image" sh -c 'dd if=/dev/urandom of=/p/reserve-test bs=1M count=400 conv=fsync status=none; ls -l /p/reserve-test'
after=$(root_free)
echo "root before=$before after=$after delta=$((before - after)) img=$(stat -c %b /var/lib/conexus/q1-storage-probe.img)"
docker run --rm --mount "type=bind,source=$probe,target=/p" "$image" rm -f /p/reserve-test
echo "root after delete=$(root_free)"
