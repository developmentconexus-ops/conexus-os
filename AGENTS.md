# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, a handoff, or remembered state:

1. run the read-only preflight in the pinned WSL environment;
2. read [`docs/roadmap.md`](docs/roadmap.md) for what exists, what is in flight, and the next action;
3. use [`docs/index.md`](docs/index.md) to find the smallest owner of your question;
4. for any Conexus planning, execution, review or handoff, read [`.agents/skills/conexus-development/SKILL.md`](.agents/skills/conexus-development/SKILL.md);
5. load only the method that applies:
   - [`engineering-method.md`](docs/development/engineering-method.md) for material engineering decisions;
   - [`repository-method.md`](docs/development/repository-method.md) for repository, Git, documentation and CI;
   - [`frontend-product-experience-planning-method.md`](docs/development/frontend-product-experience-planning-method.md) for frontend work.

For Mastra-sensitive work, also load `.agents/skills/mastra/SKILL.md`.

```bash
source "$HOME/.nvm/nvm.sh"
nvm use
npm run conexus:preflight
```

The preflight reports facts. It does not grant work. Chat and handoffs are
orientation only. **Global coverage does not require global context.**

## Authority

- [`docs/roadmap.md`](docs/roadmap.md) owns status, what exists, and the next action.
- [`docs/tasks/builder-repair-program.md`](docs/tasks/builder-repair-program.md) owns the Builder work sequence and the evidence each unit owes. It does not own product or architecture meaning.
- [`docs/decisions/index.md`](docs/decisions/index.md) holds the decisions in force and their reopen triggers.
- The product, contract and technical-reference owners own their stated semantics.
- Methods govern how work is reasoned about. They create no product meaning.
- Evidence, code, tests, runtime output and Git history may challenge accepted authority. They do not silently replace it.
- If evidence falsifies a document, reopen the smallest owning document. Do not patch around the contradiction, and do not invent missing truth.

## Rails

- Trunk is `analysis/internal-mvp-2026-09-12`, not `main`. Open pull requests against it.
- One writer per worktree. Work in an Ubuntu WSL2 worktree on the Linux filesystem.
- Stop on a material product requirement, an owner or trust-boundary contradiction, an unauthorized production effect, or missing authority needed for correctness.
- Preserve state you do not own. Never reset, clean, stash, force-push or discard work you did not create.
- Never merge. The operator merges.
- An approved increment includes its routine reversible implementation and checks. Do not seek approval for each mechanical step.
- Migrations are forward-only. After a migration change, run `npm run db:catalog:snapshot` and commit the snapshot.
- A contract change and its [`docs/product/operation-ledger.md`](docs/product/operation-ledger.md) change go in one commit. `npm run wire:bijection` gates on an exact count.
- Tests serve the product. Never reshape a design because a test or fixture would break. Fix every test that exercised real behaviour, and delete every test whose subject is gone.

## Verification

```bash
npm ci
npx --no-install playwright install chromium
npm run verify
```

Do not run `npm run verify` locally. CI runs the same graph in
[`.github/workflows/verify.yml`](.github/workflows/verify.yml) at your exact head
SHA. Run the focused checks your change touches, push, and confirm the run's head
SHA equals yours. GitHub skips the workflow without saying so when a pull request
conflicts with its base; if no run exists, merge trunk into your branch and push again.

The merge gate is that `verify` check green on the head SHA, plus the coordinator
reading the diff. A required CI failure should mean a broken repository or product
property, not a planning preference or a review ceremony.
