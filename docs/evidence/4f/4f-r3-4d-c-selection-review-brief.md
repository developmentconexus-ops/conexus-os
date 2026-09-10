# 4F — R3 4D-C selection packet independent review brief

> **Status:** REVIEW BRIEF / NO VERDICT
> **Review target:** operator-directed 4D-C/R3 selection preparation and repository-proof correction
> **Candidate result:** `docs/evidence/4f/4f-r3-4d-c-selection-candidate-result.md`
> **Implementation authority:** `0` — R3 remains PREPARATION ONLY / NOT ADMITTED

## Review question

Does the current 4D-C/R3 planning packet accurately route the next material
selection without inventing Project/MAR/Gateway meaning, silently selecting a
package or topology, weakening the R3/R7 boundary, or allowing candidate
Evidence to escape repository proof checks?

## Independent bootstrap

Reconstruct current authority in this order:

```text
AGENTS.md
docs/roadmap.md
docs/index.md
docs/development/engineering-method.md
docs/development/repository-method.md
docs/development/blueprint-harness-design.md §§10.4–10.6
docs/evidence/4f/4f-r3-admission-preparation.md
docs/phases/realization-planning.md (R3–R7 rows)
docs/evidence/4d/4d-04-runtime-family-applicability.md
```

Inspect only the named planning and repository-proof paths:

```text
docs/evidence/4f/4f-r3-admission-preparation.md
docs/evidence/4f/4f-r3-4d-c-selection-candidate-result.md
docs/roadmap.md
docs/index.md
scripts/check-doc-index.mjs
scripts/check-repository-hygiene.mjs
tests/repository/repository-contract.test.mjs
docs/evidence/4d/4d-opp-b02-postgresql-migrations-cr1-study.md
docs/evidence/4d/4d-opp-b03-governed-sync-mar-study.md
docs/evidence/4d/4d-04-runtime-family-applicability.md
```

Do not read prior BLD-10 reviewer output, another lane's report, or historical
review adjudication as evidence. Do not edit files, install dependencies, call
providers, run live model/E2B/Sankhya paths, deploy or publish Git changes.
Unknowns must remain unknowns.

## Protected planning claims and falsifiers

1. **Owner integrity:** Project owns the business read model and cursor/merge;
   MAR owns occurrence admission/recovery; Builder authors the candidate; the
   queue, repository proof and runtime do not become semantic authorities.
   Falsifier: a row assigns the same meaning to two owners or leaves terminal
   truth without an owner.
2. **Selection honesty:** RF-05, RF-08, RF-06 and Builder runtime evidence are
   correctly classified as candidates/incumbent Evidence rather than selected
   dependencies. Falsifier: a package, version or topology is promoted from
   precedent without owner acceptance and proof route.
3. **R3/R7 boundary:** R3 defines the contract and bounded recovery seam while
   R7 owns real JobRun/live-source reconciliation. Falsifier: the packet infers
   a real occurrence, serving Release or live source claim from R3 planning.
4. **Proof completeness for admission:** migration identity, isolation,
   cursor/merge, duplicate admission, process loss, one catch-up and read-only
   effect denial each have a firing falsifier. Falsifier: an essential claim
   has only prose, a non-firing check or a fixture that is mistaken for live
   integration.
5. **Candidate custody:** documentation and hygiene checks inspect tracked and
   non-ignored untracked candidate paths. Falsifier: an untracked broken link
   or transient path passes the guard.
6. **Operating-mode truth:** roadmap and Goal record state that autonomous
   execution is paused and operator-directed planning is current. Falsifier:
   preflight or authority routing still represents an active overnight Goal.

Classify every concrete finding as exactly `METHOD FINDING`, `PRODUCT / PLAN
GAP`, `LOCAL EXECUTION GAP` or `NO FINDING`. For every material finding include
evidence, failure mode, materiality, smallest owner/stage, protected property,
stop condition and required re-evaluation. Reviewer output is Evidence only;
the Lead adjudicates it. If a conclusion is included, emit only your own line
as `VERDICT = ...`.

## Explicit non-goals

This review does not select a migration tool, queue dependency, runtime,
transport or topology; admit R3 code; admit a real JobRun; execute Sankhya,
provider/model or E2B calls; admit Release/serving; rerun the BLD-10 full graph;
or authorize commit, push, PR, merge or deployment.
