# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, a handoff, or remembered state:

1. run `npm run conexus:preflight` in the pinned WSL environment (after `nvm use`); it checks the Linux
   Node and npm against `.nvmrc` and `package.json`;
2. read [`docs/roadmap.md`](docs/roadmap.md) for what exists, what is in flight, and the next action;
3. use [`docs/index.md`](docs/index.md) to find the smallest owner of your question;
4. for any Conexus planning, execution, review or handoff, read [`.agents/skills/conexus-development/SKILL.md`](.agents/skills/conexus-development/SKILL.md);
5. load only the method that applies:
   - [`delivery.md`](docs/development/delivery.md) for lanes, approval, proof, merge, Git and CI;
   - the [`conexus-frontend`](.agents/skills/conexus-frontend/SKILL.md) skill for frontend work.

For Mastra-sensitive work, also load `.agents/skills/mastra/SKILL.md`.

Chat and handoffs are orientation only. **Global coverage does not require global context.**

## Authority

- [`docs/roadmap.md`](docs/roadmap.md) owns status, what exists, and the next action.
- The task the roadmap names owns the bounded execution contract and the evidence it owes. It does not own product or architecture meaning. [`docs/tasks/builder-repair-program.md`](docs/tasks/builder-repair-program.md) is closed and kept as a record, not as an execution path.
- [`docs/decisions/index.md`](docs/decisions/index.md) holds the decisions in force and their reopen triggers. C-021 owns the broader product destination; C-028 owns the accepted Stage 2 managed-application direction. [`docs/product/contract.md`](docs/product/contract.md) section 12 owns durable Product meaning, while [`docs/roadmap.md`](docs/roadmap.md) states which parts are already delivered and which qualification is current.
- The product, contract and technical-reference owners own their stated semantics.
- Methods govern how work is reasoned about. They create no product meaning.
- Evidence, code, tests, runtime output and Git history may challenge accepted authority. They do not silently replace it.
- If evidence falsifies a document, reopen the smallest owning document. Do not patch around the contradiction, and do not invent missing truth.

## Rails

- Trunk is `main`. Open pull requests against `main`.
- One writer per worktree. Work in an Ubuntu WSL2 worktree on the Linux filesystem.
- Stop on the conditions in [`delivery.md`](docs/development/delivery.md#stop-then-escalate).
- Before you write code, read the [never-list](docs/development/codebase-principles.md#never).
- Preserve state you do not own. Never reset, clean, stash, force-push or discard work you did not create.
- Never merge unless [`delivery.md`](docs/development/delivery.md) names you as the one who merges. It owns the lanes and the merge gate.
- An approved increment includes its routine reversible implementation and checks. Do not seek approval for each mechanical step.
- A contract change and its [`docs/product/operation-ledger.md`](docs/product/operation-ledger.md) change go in one commit. `npm run wire:bijection` gates on an exact count.

## Verification

```bash
npm ci # in a fresh clone
npx --no-install playwright install chromium
# Run the focused checks this change touches.
npm run verify:quick # before every push
```

Do not run `npm run verify` locally. CI runs the full graph in
[`.github/workflows/verify.yml`](.github/workflows/verify.yml) at your exact head
SHA. Run the focused checks your change touches, push, and confirm the run's head
SHA equals yours. GitHub skips the workflow without saying so when a pull request
conflicts with its base; if no run exists, merge trunk into your branch and push again.

The [merge gate](docs/development/delivery.md#merge-gate) is that `verify` check green
on the head SHA, plus the review verdicts and a read of the diff. A required CI failure should mean a broken repository or product
property, not a planning preference or a review ceremony.
