# Conexus OS Engineering Rules

> **Scope:** repository-local execution, Git/CI/proof, framework-sensitive work, and Conexus-specific safety rails. This file does not own Product semantics, current program status, or the content of the adopted methods.

## Adopted local methods

Conexus OS consumes these repository-local operating method copies:

- [`engineering-method.md`](engineering-method.md) — DevelopmentConexus Engineering Method v1.3.0 (operator ratified);
- [`repository-method.md`](repository-method.md) — DevelopmentConexus Repository Method v1.1.0 (operator ratified);
- [`frontend-product-experience-planning-method.md`](frontend-product-experience-planning-method.md) — Frontend Product Experience Planning Method v2.3.

The operator approved the Conexus OS local amendment dated 2026-09-12 in
both methods. Do not propagate it to other repositories without authorization.
Normal Product work does not silently reinterpret methods.

## Local execution environment

Use Ubuntu WSL2 and a Linux-filesystem worktree where local execution is required. Preserve unowned state. Never reset, clean, stash, force-update, force-push, or discard work you do not own.

Current stage and implementation authorization are owned only by [`../roadmap.md`](../roadmap.md).

## Conexus-specific material stops

Stop and return to the smallest owning decision when work would create/change a Product requirement, semantic owner, trust boundary, structural runtime/database/service/module, delete accepted semantics without a destination, require unauthorized production effects/secrets, or otherwise contradict accepted authority required for correctness.

A downstream finding may reopen the smallest upstream owner according to the adopted Engineering/Frontend methods. Do not preserve a local maximum merely to avoid reopening accepted planning, and do not silently invent new authority to make a downstream artifact work.

## Framework-sensitive work

For Mastra-sensitive work, load `.agents/skills/mastra/SKILL.md`. Use current Context7/official documentation when materially useful, and decide version-specific claims from exact adopted package/source/configuration plus Evidence. Research/framework docs never become Product authority.

Qualification suites under `qualification/` prove only their named claims. Live provider/model/E2B/Sankhya execution requires explicit authority for the exact proof task; it is never implied by a green repository gate.

## Database migrations

The Hub's schema is one baseline file, `apps/hub/migrations/0001_baseline.sql`, plus the forward
migrations added after it. Every migration is four-digit, applied once, pinned by SHA-256 in
`scripts/run-hub-migrations.mjs`, and recorded in `iam.schema_migration`. A migration that has been
applied anywhere is never edited: correct it with the next number.

The baseline is regenerated only by an explicit squash decision by the operator, and only when
every real installation can be carried across it. The decision has to carry two things. The first is
a digest-equality proof: a database built from the new baseline alone produces the same
`scripts/hub-catalog.mjs` digest as a database built the old way, with any difference named and
justified. The second is an adoption path for every installation that is behind the new baseline,
which replaces its ledger in one transaction and refuses unless its catalog already equals the
baseline's. Both were done for the 2026-09-19 squash of migrations 001 to 059; the record is in that
pull request.

`scripts/generate-hub-baseline.mjs` is the only writer of the baseline file. It applies the
committed file to a throwaway database, reads the schema back with `pg_dump --schema-only` and
re-renders it, so the committed bytes are a fixed point of their own generator. Run
`npm run db:baseline:check` after touching it, and never edit the file by hand.

## Verification

Required verification:

```bash
npm ci
npx --no-install playwright install chromium
npm run verify
```

The protected GitHub check remains named `verify`. Required CI protects objective repository and executable-contract properties that must remain true for every change.

Local `npm run verify` accepts ordinary development edits and runs the same
current graph as CI. Historical R1C/RC-01 qualification commands are explicit
audits, not global prerequisites. Preserve current executable identity, types,
build, database, browser and behavior checks. Reviews follow material risk,
not stage names or a fixed number of mechanical steps.

Use targeted proof for the current task/block and extended proof for broader repository, historical, architecture, documentation-reachability, or qualification claims when those claims are actually in scope.

A mock/fake proves only the mocked boundary. Claims about real providers, models, E2B, Sankhya, browser behavior, persistence, or runtime require Evidence proportional to the real dependency.

CI does not judge Global Maximum, architecture quality, UX quality, how many files were read, or whether planning used a preferred document shape.

## Publication

Keep the active PR reviewable and preserve shared history. Publish only authorized work. Never merge without explicit operator authority.
