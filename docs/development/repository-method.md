# DevelopmentConexus Repository Method

**Version:** 1.1.0 with Conexus OS local amendment 2026-09-12
**Status:** ACCEPTED METHOD / OPERATOR RATIFIED
**Authority:** organizational repository operating method  
**Scope:** DevelopmentConexus product and platform repositories

## Objective

A fresh actor must be able to recover current state, find the correct authority, and continue work without chat archaeology or speculative whole-repository reading.

Repository organization exists to increase decision signal, not ceremony.

The 1.1 amendment was accepted by the operator on 2026-09-08 as part of the
operating-model correction recorded in the
[execution/result owner](../evidence/4d/4d-development-operating-model-execution-result.md).
It distinguishes stage, part and PR authority; requires one integrator for
disjoint writers; and makes the flat verification graph a shared executable
profile with explicit environment classes. Acceptance applies to this
repository; propagation to other repositories is not claimed or authorized.
Existing Product, publication, merge and proof authority boundaries remain unchanged.

The operator ratified the local verification cleanup on 2026-09-12 in
[repository consolidation](../tasks/repository-consolidation.md). One current
verification graph serves local work and CI. Historical admission is explicit
audit work, not a prerequisite for unrelated development. This amendment applies
only to Conexus OS.

## 1. Authority surfaces

```text
AGENTS.md
  bootstrap/router only

docs/roadmap.md
  sole mutable current stage/status/allowed-work/next-action authority

docs/index.md
  task/intention and knowledge router

docs/decisions/index.md
  current decision disposition and reopen routing

docs/product/
docs/architecture/
contracts/
  semantic/current authority according to stated ownership

docs/evidence/
docs/research/
qualification/
Git history
  supporting proof, provenance and history; not implicit Product authority
```

Methods govern how work is reasoned about and operated. They do not create Product meaning.

## 2. Context law

**Global coverage != global context.**

Start with the smallest sufficient context:

```text
repository state
+ roadmap
+ index
+ applicable method
+ current task owner(s)
```

Expand only because of a named:

- question;
- unknown;
- contradiction;
- dependency;
- falsifier;
- proof need.

There is no rigid file-count ceiling. There is also no permission for speculative whole-repository loading.

Indexes provide coverage by making authority discoverable. They are maps, not knowledge dumps.

## 3. Fresh-session route

```text
revalidate repo / branch / HEAD / main / PR / CI
→ roadmap
→ index
→ applicable method
→ task owner(s)
→ additional authority/Evidence only on demand
```

Chat and handoff may accelerate orientation but never replace repository authority.

## 4. Decisions and downstream findings

Accepted decisions are not reopened for preference.

Material downstream Evidence may reopen the smallest owning upstream decision.

```text
smallest owner reopen != smallest patch
```

Frontend, implementation, and runtime work must not invent Product truth to avoid an upstream replan.

## 5. Evidence and history

Keep durable Evidence when it has a current or credible future consumer, including:

- deciding proof;
- falsifier/provenance;
- qualification reproducibility;
- locked implementation/frontend contract.

Intermediate reasoning, review rounds, handoffs, and superseded candidates normally belong to Git history after their surviving obligations have been absorbed into current authority.

Do not delete still-current Evidence merely to reduce file count.

## 6. Git and PRs

Concurrent writers must receive disjoint file envelopes and report to one named
integrator. The integrator owns overlap resolution, whole-diff review and the
deciding proof; collaborative writers are not independent closure reviewers.

Prefer one coherent acceptance increment per PR.

A stage/tranche owns an authorized outcome; a part is a mechanical unit inside
that grant; a PR is only a review/publication container. Do not turn part or PR
boundaries into new approval gates when the active grant already covers the
remaining mechanical work. Publication and merge still require their exact
authority.

Do not stack unrelated stages by default. Do not rewrite shared history merely to make it look cleaner. Never force-push shared work. Squash merge is the normal integration shape. Merge always requires explicit operator authority when the repository says so.

A legacy or long-running PR may be completed without historical rewrite when restructuring it would create more risk than value. Do not use that exception as the default for future work.

## 7. Verification

Required CI protects objective properties that must remain true for every change.

Targeted proof protects the current task or block.

Extended audits protect broader historical or structural claims when explicitly needed.

For a candidate gate, compose the applicable checks as a flat claim graph:
each equivalent leaf runs once, while intentionally distinct environment or
coverage checks remain explicit. Local shortcuts do not replace candidate or
publication coverage.

Expose that graph through a shared executable profile used by local and CI
callers. Environment classes (for example static/local, browser, PostgreSQL or
custody) must be explicit; sharing a command name must not erase different
fixtures, credentials, patterns or claim coverage.

Parallelize only leaves whose resource and state isolation is established.
Workflow-event or concurrency changes require evidence that branch protection
and trigger coverage remain equivalent.

Do not promote every historical proof into a permanent required gate.

Run `npm run verify` with ordinary tracked and untracked development edits.
CI alone requires a clean checkout after verification. Checks must not regenerate
their expected output to conceal drift. Use explicit generation commands when
intentionally updating a current generated artifact.

Document names, working notes and historical phase wording are not correctness
gates. Keep broken-link, conflict-marker and unsafe-workflow detection. Preserve
historical receipts unchanged and reproduce them only against their named subject.

A red required check should mean integration would violate a protected property, not that a preferred process shape was skipped.

## 8. Repository evolution

Repository structure may evolve when current work demonstrates a real navigation, authority, context, Git, or proof failure.

Apply the Engineering Method:

```text
Evidence → Root Cause → Global Maximum → smallest sustainable correction
```

Do not create synchronization infrastructure, metadata systems, or governance layers without a real consumer.
