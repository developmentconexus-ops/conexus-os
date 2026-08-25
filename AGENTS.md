# Conexus OS — Agent Bootstrap

## Start

Before relying on chat, handoff, or remembered state:

1. revalidate repository identity, current branch/HEAD, remote `main`, and the relevant PR state;
2. read [`docs/roadmap.md`](docs/roadmap.md) to understand current Product/planning state and the implementation gate;
3. for material engineering decisions, follow [`docs/development/engineering-method.md`](docs/development/engineering-method.md);
4. for frontend Product Experience planning, follow [`docs/development/frontend-product-experience-planning-method.md`](docs/development/frontend-product-experience-planning-method.md);
5. use [`docs/index.md`](docs/index.md) as a navigation aid when useful, never as a reading boundary.

There is **no fixed file count, owner count, or context budget**. Investigate any repository area, Git history, Evidence, code, contracts, qualification result, runtime behavior, research, or external source that can materially change, challenge, or falsify the conclusion. Whole-repository review is explicitly allowed when the task calls for it. Context efficiency is an optimization, not a correctness boundary.

## Methods and authority

The repository adopts these local method files:

- [`engineering-method.md`](docs/development/engineering-method.md) — DevelopmentConexus Engineering Method v1.0.0;
- [`frontend-product-experience-planning-method.md`](docs/development/frontend-product-experience-planning-method.md) — Frontend Product Experience Planning Method v2.3.

Their contents are intentionally shared unchanged across the DevelopmentConexus product repositories. Do not locally rewrite or reinterpret them by convenience.

- Current accepted repository authority outranks chat, handoff, memory, historical snapshots, and reviewer preference.
- `docs/roadmap.md` owns current stage/status/allowed work/next action.
- Accepted Product, architecture, contract, and decision artifacts own their stated semantics.
- Research, code, tests, runtime, framework documentation, qualification output, Git history, and reviewer output are Evidence/mechanics; they do not become Product authority merely by existing.
- Seek the **Global Maximum**, not merely the best answer inside the current structure.
- If downstream Evidence falsifies an upstream decision, stop only the affected scope and reopen the smallest owning authority according to the adopted methods. Do not silently patch around the contradiction.

## Conexus OS rails

- Product implementation begins only when [`docs/roadmap.md`](docs/roadmap.md) explicitly permits it.
- Stop on a material Product requirement, semantic-owner, trust-boundary, structural runtime/database/service/module contradiction, unauthorized production effect, or missing authority required for correctness.
- For Mastra-sensitive work, load `.agents/skills/mastra/SKILL.md`; use current official/Context7 documentation when materially useful, and decide version-specific claims from the exact adopted package/source/configuration plus Evidence.
- Qualification suites prove only their named claims. Live provider/model/E2B/Sankhya execution requires explicit authority for the exact proof task.
- Preserve unowned state. Never reset, clean, stash, force-update, force-push, or discard work you do not own.
- Never merge without explicit operator authority.

## Verification

Required verification is intentionally objective:

```bash
npm ci
npm run verify
```

`npm run verify` protects current executable wire/contracts, the P-02 functional-wireframe JavaScript parse smoke, basic repository identity/current-state properties, and the implementation block. Run additional targeted or extended proof only when the current claim requires it.

A red required CI check should mean an objective repository/Product property is broken, not that a planning preference, context budget, router convention, review ceremony, historical status string, or documentation layout was violated.
