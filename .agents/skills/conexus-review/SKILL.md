---
name: conexus-review
description: Review a Conexus pull request, or a whole wave diff, against the guides that own its paths, its unit card when it is a wave unit, and the native census, and give one verdict. Use when your instructions name a review, or when a reviewer (the Factory included) is sent here.
---

# Review

A review judges the pushed head against what was asked (the issue, or the unit card) and the guides,
never the author's summary. It does not fix the code it reviews. The verdict follows
[references/verdict.md](references/verdict.md).

## Steps

1. Read the rules from `origin/main` after `git fetch origin main`, never from the head. `main` holds
   only what the operator approved, so a pull request cannot change the rules it is judged by.
2. Load the guides. List every changed path
   (`gh api --paginate repos/developmentconexus-ops/conexus-os/pulls/<n>/files --jq '.[].filename'`;
   `gh pr view --json files` stops at 100), match each against the `paths` of
   `git show origin/main:docs/development/review/areas.json`, and load the guides its matched areas
   name, plus the codebase principles and delivery. The grammar: an exact path, `dir/**` for every
   path under `dir`, `*` inside one segment. A test maps to the area of the code it proves. A path no
   area matches on `origin/main` is judged by the head's map and named in the review.
3. A wave unit is also judged against its card in `docs/specs/<wave>/index.md`: every line of
   Creates, Satisfies and Deletes is done, nothing is outside its Files, its Proof ran, and every
   item of the [build checklist](../conexus-build/references/checklist.md) is `ok` or `n/a` with
   evidence.
4. Redo the native census for each mechanism the diff adds: pin the versions at the head from
   `node_modules/@mastra/<pkg>/package.json`, read the embedded docs (`dist/docs`) then the types,
   look up Keycloak and PostgreSQL at the versions in use, search the repository for an existing
   model of the concept, and give each mechanism KEEP, REPLACE or SIMPLIFY with its source.
5. On a `lane:qualification` wave, the whole diff `main...wave/<name>` is also reviewed with pstack
   `interrogate`; without pstack, two fresh reviewers on different models read it independently
   against the spec and the guides. A bot finding is evidence, not a requirement: fix, dismiss with a
   reason, or ask.
6. Write the verdict. Any failed or not evaluated rule, or a correctness defect, is
   `request changes`; otherwise `approve`. Findings follow the
   [review loop](../../../docs/development/delivery.md#review-loop): symptom, evidence, the guide
   section; a preference starts with `Nit:` and does not block. An independent reviewer has seen no
   draft of the work; a timeout or a missing report is an incomplete review, not a pass.
