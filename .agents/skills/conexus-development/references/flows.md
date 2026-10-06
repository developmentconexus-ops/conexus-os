# Flows

Copy the flow's steps into your notes and tick them. A step you skip stays with `skip: <reason>`.
Each step says what to do, then the skill that does it when the session has it (`/pstack:*` from
Poteto's pstack, `/jm-*` from the jm suite). Without the skill, do the step by hand. When the jm
steps and the pstack playbooks disagree,
[delivery](../../../../docs/development/delivery.md#when-the-methods-disagree) says which wins.

## Investigate

The poteto-mode Investigation playbook, with one Conexus step: read the evidence first, per
[evidence.md](evidence.md). Telemetry before logs, logs before guesses.

## Fix

The poteto-mode Bug fix playbook. Reproduce on the surface where it was seen, with telemetry on.
The [review loop](../../../../docs/development/delivery.md#review-loop) says when a fix goes back
to its spec.

## Build

1. The issue or spec names the result, the non-goals and "done when". A missing decision goes back
   to the operator; never invent product meaning in code.
2. Take the native census ([native first](../../../../docs/reference/architecture.md#native-first))
   before adding any mechanism.
3. Build it with `/jm-develop`, failing tests first, under `/pstack:typescript-best-practices`.
4. Prove each "done when" item on the real surface: `/jm-check verify`.
5. Before review: `/pstack:deslop` and `/pstack:no-comments`.

## Redesign

For a roadmap wave or a shape that keeps breaking. The census, the redesign and the spec are done
before code by the session that plans the work, and the operator approves the spec. Here you build it.

1. Read the approved spec in `docs/specs/`: what it deletes, what stays and why. It is the
   contract; do not redesign it.
2. Build as in Build. Migrate every instance of the shape the spec replaces, not only the lines the
   change touches, and delete the old shape in the same wave.
3. A gap or a contradiction in the spec stops the work and goes back as a report, with the evidence.
4. The pull request body says what the change deletes, measured by
   `git diff --numstat origin/main...HEAD` with product code apart from tests, SQL and generated files.

## Review

1. Review the pushed head against its issue or spec and the current guides, not the author's
   summary. Read the rules from `origin/main` after `git fetch origin main`, never from the head.
2. Load the guides. List every changed path
   (`gh api --paginate repos/developmentconexus-ops/conexus-os/pulls/<n>/files --jq '.[].filename'`;
   `gh pr view --json files` stops at 100), match each against the `paths` of
   `git show origin/main:docs/development/review/areas.json`, and load the guides its matched areas
   name, plus the codebase principles and delivery. The grammar: an exact path, `dir/**` for every
   path under `dir`, `*` inside one segment. A test maps to the area of the code it proves. A path
   no area matches on `origin/main` is judged by the head's map and named in the review.
3. Redo the native census for each mechanism the diff adds: pin the versions at the head from
   `node_modules/@mastra/<pkg>/package.json`, read the embedded docs (`dist/docs`) then the types,
   look up Keycloak and PostgreSQL at the versions in use, search the repository for an existing
   model of the concept, and give each mechanism KEEP, REPLACE or SIMPLIFY with its source.
4. Run `/pstack:interrogate`. A bot finding is evidence, not a requirement: fix, dismiss with a
   reason, or ask. Findings follow the [review loop](../../../../docs/development/delivery.md#review-loop).
5. The verdict names the head SHA, the guides loaded, the census table or "no new mechanism", and
   each failed or unevaluated rule with its evidence. Any failed or unevaluated rule, or a
   correctness defect, is `request changes`; otherwise `approve`. A review does not fix the code it
   reviews. An independent reviewer has seen no draft of the work; a timeout or a missing report is
   an incomplete review, not a pass.

## Frontend

On top of the flow above, for any change under `apps/web`, `packages/brand` or
`apps/keycloak-theme`, or any screen, copy, color, font, spacing, layout, icon or motion:

1. Read [`DESIGN.md`](../../../../DESIGN.md), the [product contract](../../../../docs/product/contract.md)
   and [what the web app may own](../../../../docs/reference/architecture.md#the-web-app).
   `packages/brand/src/tokens.css` wins over any text.
2. For a surface that does not exist yet, walk [product-surfaces.md](product-surfaces.md) before any
   code.
3. Build with the nearest screen's pattern, if it follows the guides, and the Mastra part that
   already does the job.
4. Run `npm run web:style:check` and fix what it prints.
5. Prove the screen with the [`verify`](../../verify/SKILL.md) skill as
   [testing](../../../../docs/development/testing.md#8-screens) says. For the sign-in theme run
   `npm run keycloak-theme:check` and take screenshots; never type the operator's password.

[`apps/web/AGENTS.md`](../../../../apps/web/AGENTS.md) has the commands and
[`verify/features`](../../verify/features/README.md) the screens by feature.
