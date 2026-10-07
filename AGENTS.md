# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, a handoff, or remembered state, run `npm run conexus:preflight` in the pinned
WSL environment (after `nvm use`; see [environment](docs/development/environment.md)), then load the
skill for your task from `.agents/skills/`:

- a question, or the study of a wave: [`conexus-study`](.agents/skills/conexus-study/SKILL.md);
- a choice for the operator: [`conexus-decide`](.agents/skills/conexus-decide/SKILL.md);
- a wave's spec, or a sweep: [`conexus-spec`](.agents/skills/conexus-spec/SKILL.md);
- a wave unit, a small change or a screen: [`conexus-build`](.agents/skills/conexus-build/SKILL.md);
- the proof of a wave: [`conexus-prove`](.agents/skills/conexus-prove/SKILL.md);
- a pull request to judge: [`conexus-review`](.agents/skills/conexus-review/SKILL.md);
- wrong behavior someone saw: [`conexus-fix`](.agents/skills/conexus-fix/SKILL.md).

The guides a task needs come from [`areas.json`](docs/development/review/areas.json) by the paths
it touches; the [codebase principles](docs/development/codebase-principles.md) apply to every
change. For Mastra work, also load `.agents/skills/mastra/SKILL.md`.

Chat and handoffs are orientation only. **Global coverage does not require global context.**

## Authority

- [`docs/roadmap.md`](docs/roadmap.md) owns status, what exists, and the next action.
- The spec or task the roadmap names owns the bounded execution contract and the evidence it owes. It does not own product or architecture meaning.
- [`docs/decisions/index.md`](docs/decisions/index.md) holds the decisions in force and their reopen triggers. [`docs/product/contract.md`](docs/product/contract.md) owns durable product meaning, and the roadmap states which parts are delivered.
- Each guide listed in [`docs/index.md`](docs/index.md) owns its subject; a rule lives in one guide.
- Methods govern how work is reasoned about. They create no product meaning.
- Evidence, code, tests, runtime output and Git history may challenge accepted authority. They do not silently replace it.
- If evidence falsifies a document, reopen the smallest owning document. Do not patch around the contradiction, and do not invent missing truth.

## Rails

[Delivery](docs/development/delivery.md) owns the lanes, the stop conditions, Git, the local checks
and the merge gate. Never merge unless it names you as the one who merges.

The repository is public: no company data, secret or machine path in it, per
[security §7](docs/reference/security-and-authority.md#7-data-protection-and-egress).
