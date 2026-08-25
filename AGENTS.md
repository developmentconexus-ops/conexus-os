# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, handoff, or remembered state:

1. revalidate repository identity, current branch/HEAD, remote `main`, the relevant PR, and current CI state;
2. read [`docs/roadmap.md`](docs/roadmap.md) for current stage, allowed work, implementation gate, and exact next action;
3. use [`docs/index.md`](docs/index.md) to locate the smallest current authority for the task;
4. select only the methods that apply:
   - [`engineering-method.md`](docs/development/engineering-method.md) for material engineering and Global Maximum decisions;
   - [`repository-method.md`](docs/development/repository-method.md) for repository, context, Git, documentation, and CI;
   - [`frontend-product-experience-planning-method.md`](docs/development/frontend-product-experience-planning-method.md) for frontend Product Experience;
5. load the current task owner(s).

Expand into additional Product, architecture, contracts, Evidence, research, Git history, code, runtime, qualification, or external sources only because of a named material question, uncertainty, contradiction, dependency, falsifier, or proof need.

**Global coverage does not require global context.** Do not recursively read the repository by default.

## Authority

- [`docs/roadmap.md`](docs/roadmap.md) owns current stage/status/allowed work/next action.
- [`docs/decisions/index.md`](docs/decisions/index.md) exposes current decision disposition and reopen routes.
- Accepted Product, architecture, contract, and decision owners own their stated semantics.
- Methods govern how work is reasoned about and operated; they do not create Product meaning.
- Evidence, research, code, tests, runtime, qualification output, Git history, framework documentation, and reviewer output may challenge accepted authority but do not silently replace it.
- If downstream Evidence falsifies upstream planning, reopen the smallest owning authority. Do not patch around the contradiction and do not invent missing truth.

## Conexus OS rails

- Product implementation begins only when [`docs/roadmap.md`](docs/roadmap.md) explicitly permits it.
- Stop on a material Product requirement, semantic-owner, trust-boundary, structural runtime/database/service/module contradiction, unauthorized production effect, or missing authority required for correctness.
- For Mastra-sensitive work, load `.agents/skills/mastra/SKILL.md`; use current official/Context7 documentation when materially useful, and decide version-specific claims from exact adopted package/source/configuration plus Evidence.
- Qualification suites prove only their named claims. Live provider/model/E2B/Sankhya execution requires explicit authority for the exact proof task.
- Preserve unowned state. Never reset, clean, stash, force-update, force-push, or discard work you do not own.
- Never merge without explicit operator authority.

## Verification

Required verification:

```bash
npm ci
npm run verify
```

Run additional targeted or extended proof only when the current claim requires it. A required CI failure should represent a broken objective repository/Product property, not a planning preference, context convention, review ceremony, or historical status projection.
