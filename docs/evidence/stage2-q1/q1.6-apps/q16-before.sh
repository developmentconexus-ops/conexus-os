#!/bin/bash
# Q1.6 on the Applications cluster, part 1: write a note in each of two Projects through the live
# Preview, show where the rows landed, then SIGKILL the runner.
set -uo pipefail
ev=docs/evidence/stage2-q1/q1.6-apps
run1=0429fa8e-3432-4ae5-93f1-648b53cf07cf
run2=a700a0f2-883b-427f-9f52-89c1eb476be3
cd "$HOME/wt-q1"
bash "$HOME/q1/eval.sh" $ev/cases/write-second-project.json $ev/write-second-project --project $run1 --grade-only | grep -E '"outcome"|"previewUrl"'
bash "$HOME/q1/eval.sh" $ev/cases/write-before-restart.json $ev/write-before-restart --project $run2 --grade-only | grep -E '"outcome"|"previewUrl"'
echo "== rows on the Applications cluster"
docker exec conexus-apps-postgres psql -U postgres -d conexus_apps -At -F ' | ' \
  -c "select 'run-1', id, purchase_order_id, note from p_0429fa8e34324ae593f1648b53cf07cf_preview.purchase_order_notes" \
  -c "select 'run-2', id, purchase_order_id, note from p_a700a0f2883b427f9f5289c1eb476be3_preview.purchase_order_notes"
echo "== the same marked notes on the Hub cluster (expect none)"
docker exec conexus-s7-postgres psql -U postgres -d conexus_apps -At \
  -c "select count(*) from p_a700a0f2883b427f9f5289c1eb476be3_preview.purchase_order_note where note like 'Q1.6 nota no cluster%'"
echo "== runner SIGKILL"
pids=$(pgrep -f 'q1/runner-build/app-runner/main.js')
echo "killing $pids at $(date -u +%FT%T.%3NZ)"
kill -KILL $pids
for i in $(seq 1 50); do pgrep -f 'q1/runner-build/app-runner/main.js' >/dev/null || break; sleep 0.1; done
echo "runner gone: $(pgrep -f 'q1/runner-build/app-runner/main.js' >/dev/null && echo no || echo yes) at $(date -u +%FT%T.%3NZ); hub answers $(curl -s -o /dev/null -w '%{http_code}' --cacert ~/.local/share/conexus-local-tls/ca/rootCA.pem https://hub.conexus.localhost:3443/)"
echo "runner state dir: $(find ~/.local/state/conexus-runner -maxdepth 2 | head -20 | tr '\n' ' ')"
