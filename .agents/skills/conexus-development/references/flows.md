# Flows

Copy the flow's steps into your notes and tick them. A step you skip stays with `skip: <reason>`.
Each step says what to do, then the skill that does it. A Claude session invokes a skill as
`/<name>` (`/pstack:<name>` for Poteto's pstack), a Codex session as `$<name>`. Where a step names a
pstack skill the session does not have, it gives the rule to follow by hand.
[Delivery](../../../../docs/development/delivery.md#the-conexus-skills-own-the-stages) says which
Conexus skill owns each wave stage.

## Investigate

A question about how the code works, why it is built this way, or where the time goes; and the
study of a wave before its spec. Follow [`conexus-study`](../../conexus-study/SKILL.md): attack the
premise down to the root cause, take the census as a script, read the references in their code. Read
the evidence first, per [evidence.md](evidence.md). Telemetry before logs, logs before guesses.

## Fix

The poteto-mode Bug fix playbook, when the session has it; without it, reproduce, find the root
cause, fix it there and add the test that would have caught it. Reproduce on the surface where it
was seen, with telemetry on. The
[review loop](../../../../docs/development/delivery.md#review-loop) says when a fix goes back to its
spec.

## Wave

For a roadmap wave, a redesign, or new behavior across modules. The stages run in order, each a
fresh session, as [delivery](../../../../docs/development/delivery.md#waves) says.

1. Study: [`conexus-study`](../../conexus-study/SKILL.md). The operator agrees with what the wave
   wants, what stays out and when it ends.
2. Spec: [`conexus-spec`](../../conexus-spec/SKILL.md), on the wave branch `wave/<name>`, with its
   draft pull request into `main`. The operator approves it.
3. Build: [`conexus-build`](../../conexus-build/SKILL.md), one fresh builder per unit card, one pull
   request into the wave branch per unit. A gap or a contradiction in the card stops the builder and
   goes back as a report, with the evidence.
4. Prove: [`conexus-prove`](../../conexus-prove/SKILL.md) on the head of the wave branch, read only.
5. The operator merges the wave's pull request into `main`.

## Small change

A `lane:fast` change inside accepted meaning: no study, no spec.

1. The issue names the result, the non-goals and "done when". A missing decision goes back to the
   operator; never invent product meaning in code.
2. Take the native census ([native first](../../../../docs/reference/architecture.md#native-first))
   before adding any mechanism.
3. Build it with failing tests first, under [guide C](../../../../docs/development/codebase-principles.md)
   (pstack `typescript-best-practices` when the session has it), and delete the shape it replaces
   in the same change.
4. Prove each "done when" item on the real surface with the [`verify`](../../verify/SKILL.md) skill.
5. Before review, run pstack `deslop` and `no-comments`. Without pstack: reread the diff and remove
   what a careful engineer would not write, then delete every comment that does not state a why the
   code cannot show.
6. The pull request body says what the change deletes, measured by
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
4. The Factory reviews every pull request, a wave's unit pull requests included. On a
   `lane:qualification` wave, the whole diff `main...wave/<name>` is also reviewed with pstack
   `interrogate`; without pstack, two fresh reviewers on different models read it independently
   against the spec and the guides. A bot finding is evidence, not a requirement: fix, dismiss with
   a reason, or ask. Findings follow the
   [review loop](../../../../docs/development/delivery.md#review-loop).
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
