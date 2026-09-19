# Contributing to Conexus OS

Start with `AGENTS.md`, then [`docs/index.md`](docs/index.md) and
[`docs/roadmap.md`](docs/roadmap.md).

Work in an Ubuntu WSL2 worktree on the Linux filesystem. Trunk is
`analysis/internal-mvp-2026-09-12`, not `main`. Open one focused branch and one
pull request per coherent change, against that trunk.

Define the proof before the implementation, and show that a meaningful negative
control can fire. Run the focused checks your change touches. Do not run
`npm run verify` locally; CI runs the full graph at your exact head SHA.

A pull request is ready to merge when its `verify` check is green on that head SHA
and the coordinator has read the diff. The operator merges. You never do.

A claim about a framework, a dependency or a live integration needs current primary
documentation plus the exact pinned source or configuration. Research never becomes
product authority without an accepted decision in
[`docs/decisions/index.md`](docs/decisions/index.md).
