# Conexus OS Engineering Rules

> **Scope:** repository-local execution, Git/CI/proof, framework-sensitive work, and Conexus-specific safety rails. This file does not own Product semantics, current program status, or the content of the adopted engineering/frontend methods.

## Adopted local methods

Use the repository-local copies without locally redefining them:

- [`engineering-method.md`](engineering-method.md) — DevelopmentConexus Engineering Method v1.0.0;
- [`frontend-product-experience-planning-method.md`](frontend-product-experience-planning-method.md) — Frontend Product Experience Planning Method v2.3.

`AGENTS.md` and `docs/index.md` route directly to these files. There is no external methodology router, Repository Standard dependency, file-count limit, owner-count limit, or context budget.

## Local execution environment

Use Ubuntu WSL2 and a Linux-filesystem worktree where local execution is required. Preserve unowned state. Never reset, clean, stash, force-update, force-push, or discard work you do not own.

Current stage and implementation authorization are owned only by [`../roadmap.md`](../roadmap.md).

## Conexus-specific material stops

Stop and return to the smallest owning decision when work would create/change a Product requirement, semantic owner, trust boundary, structural runtime/database/service/module, delete accepted semantics without a destination, require unauthorized production effects/secrets, or otherwise contradict accepted authority required for correctness.

A downstream finding may reopen the smallest upstream owner according to the adopted Engineering/Frontend methods. Do not preserve a local maximum merely to avoid reopening accepted planning, and do not silently invent new authority to make a downstream artifact work.

## Framework-sensitive work

For Mastra-sensitive work, load `.agents/skills/mastra/SKILL.md`. Use current Context7/official documentation when materially useful, and decide version-specific claims from exact adopted package/source/configuration plus Evidence. Research/framework docs never become Product authority.

Qualification suites under `qualification/` prove only their named claims. Live provider/model/E2B/Sankhya execution requires explicit authority for the exact proof task; it is never implied by a green repository gate.

## Verification

Required verification:

```bash
npm ci
npm run verify
```

The protected GitHub check remains named `verify`. The required gate is intentionally objective and focused on current executable truth: basic repository/current-state integrity, the current P-02 functional-wireframe JavaScript parse smoke, and the executable wire/contract suite.

Historical repository tests, documentation-reachability checks, prior ratification/status-string guards, review-transport ceremony, and broader qualification checks remain available as targeted/extended proof. They are not permanent prerequisites for unrelated planning work.

Run additional targeted proof whenever the current claim actually depends on it. A mock/fake proves only the mocked boundary; claims about real providers, models, E2B, Sankhya, browser behavior, persistence, or runtime require Evidence proportional to the real dependency.

CI does not judge Global Maximum, architecture quality, UX quality, how many files were read, or whether planning used a preferred document shape.

## Publication

Keep the active PR reviewable and preserve shared history. Publish only authorized work. Never merge without explicit operator authority.
