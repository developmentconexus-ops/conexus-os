#!/bin/bash
# Q1.8 item 6: one ordinary stop of the Applications container while the Hub keeps serving.
# Before, during and after the stop: a Hub heartbeat (IAM, Workspace, Project, a real write to the Hub
# PostgreSQL read back and restored), the Hub PostgreSQL's start time and restart count, the Hub
# process id, and a Preview read of a note on the Applications cluster through the live Hub.
set -uo pipefail
source "$HOME/.nvm/nvm.sh" >/dev/null
cd "$HOME/wt-q1" && nvm use >/dev/null
ev=docs/evidence/stage2-q1/q1.8
export CONEXUS_STATE="$(bash "$HOME/q1/test-session.sh" 2>/dev/null | tail -1)"
hub_pg() { echo "hub-pg start=$(docker exec conexus-s7-postgres psql -U postgres -Atc 'select pg_postmaster_start_time()') restarts=$(docker inspect -f '{{.RestartCount}}' conexus-s7-postgres)"; }
hub_proc() { echo "hub pids=$(pgrep -f 'conexus-build-local-.*/server.js' | tr '\n' ' ')runner pids=$(pgrep -f 'q1/runner-build/app-runner/main.js' | tr '\n' ' ')"; }
apps() { echo "apps $(docker inspect -f '{{.State.Status}} restarts={{.RestartCount}}' conexus-apps-postgres)"; }
preview() {
  bash "$HOME/q1/eval.sh" $ev/../q1.6-apps/cases/read-after-restart.json "$ev/preview-$1" --project a700a0f2-883b-427f-9f52-89c1eb476be3 --grade-only 2>&1 | grep -m1 '"outcome"' | tr -d ' ,'
}
beat() { node $ev/hub-heartbeat.mjs "$1"; }
stamp() { date -u +%FT%T.%3NZ; }

echo "== before $(stamp)"; hub_pg; hub_proc; apps
beat before
echo "preview before: $(preview before)"

echo "== docker stop conexus-apps-postgres $(stamp)"
docker stop conexus-apps-postgres >/dev/null
echo "stopped $(stamp)"; apps
for n in 1 2 3; do
  beat "during-$n"
  sleep 5
done
echo "preview during: $(preview during)"
hub_pg; hub_proc

echo "== docker start conexus-apps-postgres $(stamp)"
docker start conexus-apps-postgres >/dev/null
for i in $(seq 1 60); do docker exec conexus-apps-postgres pg_isready -U postgres -h 127.0.0.1 >/dev/null 2>&1 && break; sleep 1; done
echo "ready $(stamp)"; apps
beat after
echo "preview after: $(preview after)"
hub_pg; hub_proc
