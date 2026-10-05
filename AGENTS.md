# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, a handoff, or remembered state, run `npm run conexus:preflight` in the pinned
WSL environment (after `nvm use`), then read
[`.agents/skills/conexus-development/SKILL.md`](.agents/skills/conexus-development/SKILL.md). It
picks the flow and the guides your task needs; the
[codebase principles](docs/development/codebase-principles.md) apply to every change. For Mastra
work, also load `.agents/skills/mastra/SKILL.md`; for a screen, the
[`conexus-frontend`](.agents/skills/conexus-frontend/SKILL.md) skill.

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
