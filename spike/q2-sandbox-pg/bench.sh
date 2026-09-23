#!/bin/bash
# Runs inside the spike sandbox as conexus-agent. Times initdb+start+ready (fresh) and
# copy-seed+start+ready (warm, from the build-time baked /opt/conexus/pg-seed), 10 runs each,
# entirely under /tmp with no root and no privileged port.
set -euo pipefail
PGBIN=/usr/lib/postgresql/17/bin
N=10
PORT=55432

fresh=()
for i in $(seq 1 "$N"); do
  rm -rf /tmp/pgdata-fresh
  t0=$(date +%s%N)
  "$PGBIN/initdb" -D /tmp/pgdata-fresh -E UTF8 --auth=trust --no-instructions >/tmp/initdb.log 2>&1
  "$PGBIN/pg_ctl" -D /tmp/pgdata-fresh -l /tmp/pglog-fresh.log -o "-p $PORT -k /tmp -c listen_addresses=''" start >/tmp/pgctl-fresh.log 2>&1
  until "$PGBIN/pg_isready" -h /tmp -p "$PORT" >/dev/null 2>&1; do sleep 0.02; done
  t1=$(date +%s%N)
  fresh+=($(( (t1 - t0) / 1000000 )))
  "$PGBIN/pg_ctl" -D /tmp/pgdata-fresh -m fast stop >/dev/null 2>&1
done

warm=()
for i in $(seq 1 "$N"); do
  rm -rf /tmp/pgdata-warm
  t0=$(date +%s%N)
  cp -a /opt/conexus/pg-seed /tmp/pgdata-warm
  "$PGBIN/pg_ctl" -D /tmp/pgdata-warm -l /tmp/pglog-warm.log -o "-p $PORT -k /tmp -c listen_addresses=''" start >/tmp/pgctl-warm.log 2>&1
  until "$PGBIN/pg_isready" -h /tmp -p "$PORT" >/dev/null 2>&1; do sleep 0.02; done
  t1=$(date +%s%N)
  warm+=($(( (t1 - t0) / 1000000 )))
  "$PGBIN/pg_ctl" -D /tmp/pgdata-warm -m fast stop >/dev/null 2>&1
done

echo "FRESH_MS ${fresh[*]}"
echo "WARM_MS ${warm[*]}"
