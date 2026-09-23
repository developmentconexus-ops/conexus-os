#!/bin/bash
# Q1.6 on the Applications cluster, part 2: after the runner restarted, the run-2 note is still there
# and the run-1 Preview shows its own note, not run-2's.
set -uo pipefail
ev=docs/evidence/stage2-q1/q1.6-apps
cd "$HOME/wt-q1"
bash "$HOME/q1/eval.sh" $ev/cases/read-after-restart.json $ev/read-after-restart --project a700a0f2-883b-427f-9f52-89c1eb476be3 --grade-only | grep -E '"outcome"'
bash "$HOME/q1/eval.sh" $ev/cases/second-project-isolation.json $ev/second-project-isolation --project 0429fa8e-3432-4ae5-93f1-648b53cf07cf --grade-only | grep -E '"outcome"'
cp /mnt/c/Users/LEANDR~1.THE/AppData/Local/Temp/claude/C--Users-leandro-theodoro-Documents-conexus-os/11f38be7-93ae-4208-9025-2fa53e017c7f/scratchpad/runner-2.log $ev/runner-after-restart.log
