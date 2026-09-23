#!/bin/bash
# Times cold start: images already pulled by compose-pull.sh, so this
# measures container creation through every healthcheck passing.
set -uo pipefail
cd /home/leandrotheodoro/spike-supabase/supabase-src/docker

START=$(date +%s)
docker compose up -d
UP_ISSUED=$(date +%s)
echo "compose up -d returned after $((UP_ISSUED - START))s"

for i in $(seq 1 120); do
  TOTAL=$(docker compose ps --format '{{.Name}} {{.Health}}' | wc -l)
  HEALTHY=$(docker compose ps --format '{{.Name}} {{.Health}}' | grep -c 'healthy' || true)
  UNHEALTHY=$(docker compose ps --format '{{.Name}} {{.Health}}' | grep -c 'unhealthy' || true)
  if [ "$UNHEALTHY" -gt 0 ]; then
    echo "UNHEALTHY container(s) present after $(( $(date +%s) - START ))s:"
    docker compose ps
    break
  fi
  if [ "$HEALTHY" -ge 9 ]; then
    NOW=$(date +%s)
    echo "all healthchecked services healthy after $((NOW - START))s (total $((NOW - START))s wall)"
    docker compose ps
    break
  fi
  sleep 2
done
