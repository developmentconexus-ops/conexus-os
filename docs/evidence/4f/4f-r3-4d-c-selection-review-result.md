# 4F — R3 4D-C selection independent review result

> **Status:** COMPLETE / GEMINI + OPUS COMPLETE — R3 NOT ADMITTED
> **Candidate result:** docs/evidence/4f/4f-r3-4d-c-selection-candidate-result.md
> **Candidate result SHA-256:** 52a359cf41b4edccd8d640230f08857126459ee927167f2d75b95a07deb2980b
> **Brief SHA-256:** 0523f1aafbf2cf6c3e16d82cc764379f74d521dd9706514037a88d4c496b3059
> **Review outputs:** /tmp/conexus-r3-4d-c-review-gemini/conexus-review-result.json; /tmp/conexus-r3-4d-c-review-opus/conexus-review-result.json

## Lane status

| Lane | Model/CLI | Status | Identity | Disposition |
| --- | --- | --- | --- | --- |
| Gemini | gemini-3.1-pro-high / AGY 1.1.28 | SUCCESS | 2b202fe6-54df-454c-9483-529575716c54 | Usable independent Evidence |
| Opus | Claude Code 2.1.257 / explicit `opus` | SUCCESS | 4fec686d-9b9a-4e2a-90c5-e4b1ccfeefbd | Usable independent Evidence |

The first Fable-configured attempt returned `429 out_of_credits`. Per operator
direction, the replacement lane used the explicit Claude Code `opus` model over
the same frozen candidate. That lane completed read-only with a self-contained
report. The provider failure is retained as execution history only; it is not a
reviewer finding and did not alter the candidate.

## Gemini report

I have completed the read-only inspection of the routed 4D-C/R3 selection packet and its associated repository proofs, strictly following the engineering method and boundary laws.

Here is the self-contained independent report requested:

# 4F — R3 4D-C Selection Packet Independent Review Report

**Review Target:** Operator-directed 4D-C/R3 selection preparation and repository-proof correction

## 1. Owner Integrity
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** The docs/evidence/4f/4f-r3-admission-preparation.md explicitly maps semantics to exact single owners: Project owns business schema and cursor/merge; MAR owns occurrence admission and recovery; Builder authors candidate; Connections/Gateway owns transport; Registry/Release owns immutable artifact composition.
**Failure Mode:** A row assigning the same meaning to two owners or leaving terminal truth unassigned.
**Why it is material:** Protects the system against duplicate/circular ownership or unauthorized domain cross-talk.
**Smallest Real Owner / Stage:** 4D-C Selection Preparation
**Protected Property / Target Invariant:** One semantic authority per meaning.

## 2. Selection Honesty
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** The packet and retained upstream studies (4d-opp-b02, 4d-opp-b03, 4d-04-runtime-family-applicability.md) explicitly declare technologies like `pg` and `pg-boss` as "INCUMBENT EVIDENCE" and "NOT SELECTED". The preparation packet reiterates that "Existing code is Evidence and may challenge a choice, but it cannot silently create the missing authority."
**Failure Mode:** Promoting a package, version, or topology from precedent without owner acceptance and exact proof route.
**Why it is material:** Prevents accidental or silent dependency adoption before 4D-C comparative proof.
**Smallest Real Owner / Stage:** 4D-C Selection Preparation
**Protected Property / Target Invariant:** Explicit selection-opening falsifiers and exact dependency/version selection truth.

## 3. R3/R7 Boundary
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** docs/evidence/4f/4f-r3-admission-preparation.md legally limits R3 to candidate fixture verification and definition of the recovery seam. It firmly routes real governed sync occurrences and live-source reconciliation to R7 (under exact served Release pins).
**Failure Mode:** Inferring a real occurrence, serving Release, or live source claim within R3 planning.
**Why it is material:** Protects against mistaking the definition of a contract for its live production reconciliation.
**Smallest Real Owner / Stage:** 4D-C Selection Preparation
**Protected Property / Target Invariant:** Bounded candidate authoring (R3) vs. live-source reconciliation (R7).

## 4. Proof Completeness for Admission
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** docs/evidence/4f/4f-r3-admission-preparation.md maps every critical falsifier—migration identity, isolation, cursor/merge, duplicate admission, process loss, one catch-up, and read-only effect denial—to exact negative controls and fixtures assigned to R3, leaving real live source oracles strictly to R7.
**Failure Mode:** An essential claim has only prose, a non-firing check, or a fixture mistaken for live integration.
**Why it is material:** Ensures no capability is declared proven without owner-authored fixtures and explicitly assigned negative controls.
**Smallest Real Owner / Stage:** 4D-C Selection Preparation
**Protected Property / Target Invariant:** Falsifiable proof and independent material verification.

## 5. Candidate Custody
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** The guard scripts check-doc-index.mjs and check-repository-hygiene.mjs securely scan non-ignored untracked files via `git ls-files --cached --others --exclude-standard`. Negative controls in repository-contract.test.mjs verifiably crash when exposed to untracked transient paths and untracked broken links.
**Failure Mode:** An untracked broken link or transient path passes the guard.
**Why it is material:** Prevents dirty worktree evidence or uncommitted transient notes from escaping repository proofs.
**Smallest Real Owner / Stage:** Repository Proof Owner
**Protected Property / Target Invariant:** Exact candidate custody and deterministically inspected evidence paths.

## 6. Operating-Mode Truth
**Classification:** NO FINDING
**Evidence / Reproducible Observation:** docs/roadmap.md and docs/index.md record the autonomous goal as explicitly "PAUSED / OPERATOR-DIRECTED PLANNING".
**Failure Mode:** Preflight or authority routing still representing an active overnight Goal.
**Why it is material:** Prevents the agent/runtime from hallucinating an autonomous execution grant while planning is underway.
**Smallest Real Owner / Stage:** Roadmap Authority
**Protected Property / Target Invariant:** Immutable current stage, status, and allowed-work authority.

`VERDICT = CURRENT STRUCTURE CONFIRMED / NO CHANGE REQUIRED`
The read-only inspection and evaluation have been fully executed according to the plan. No further code changes, dependency installations, or command execution are required for this task, as specified by the constraints of the review brief.

The task is now complete. You can review the final report output above, which aligns with the independent review protocol and firmly confirms the current repository structure without any material gaps.

## Opus report

I reconstructed authority from AGENTS.md → roadmap → index → both methods → blueprint §§10.1–10.6, then read only the routed evidence, and verified custody and guard behaviour by read-only execution. Report follows.

---

# Independent whole/global review — 4D-C/R3 selection packet + repository-proof correction

**Lane:** independent challenger. **Subject:** `docs/evidence/4f/4f-r3-4d-c-selection-review-brief.md` and the paths its candidate manifest binds.
**Custody check (evidence):** all 8 SHA-256 values in `4f-r3-4d-c-selection-candidate-result.md` reproduce exactly, and `git diff --binary | sha256sum` = `4eeb2944d2fff2906610cf1ce58555f00dfdfbefa9829a5f53655f3d7048610f`, matching the manifest. The subject is intact and correctly bound as far as it reaches (see F6 for how far that is).
**Deviation disclosed:** I read `docs/decisions/index.md`, which the brief's inspect-list omits, because AGENTS.md §Authority names it an authority surface and the roadmap's `OWNER DISPOSITION ACCEPTED` depends on it. I did **not** read `docs/evidence/4f/4f-r3-4d-c-selection-review-result.md`.

---

## F1 — LOCAL EXECUTION GAP · material

**The deciding negative controls for the reviewed correction have no execution route in any gate or recorded receipt.**

*Evidence (observed):*
- `tests/repository/repository-contract.test.mjs:49-85` holds the only two controls that prove the widened census fires.
- `scripts/conexus-verify.mjs` `CANDIDATE_GRAPH` is 69 steps; `verification-tool-regressions` (line 47) names only `conexus-preflight.test.mjs` and `conexus-verify.test.mjs`. A repo-wide grep for `repository-contract` across `*.mjs`/`*.json`/`*.yml` matches only RC-01 inventory JSONs — never the graph.
- `.github/workflows/verify.yml` is one job: `npm run verify` (= `conexus:verify --scope candidate`), `git diff --check`, `test -z "$(git status --porcelain)"`. `docs/development/engineering-rules.md:38-43` fixes that floor and names `verify` the protected check.
- The only route is `verify:extended` → `test:repository` (glob), invoked by no gate.
- The most recent recorded full round, `docs/evidence/4f/4f-bld-10-preview-verification-receipt.md:23-27`, lists `verify:local`, `rb:first:check`, `repository:check:extended`, `conexus:preflight`, `git diff --check` — not `test:repository`/`verify:extended`.
- The R3 candidate manifest records **no** proof execution at all.
- Inconsistency inside the same candidate: the BLD-10 leaf *was* wired (`conexus-verify.mjs:86` plus `EXPECTED_CANDIDATE_SCOPES` in `tests/repository/conexus-verify.test.mjs`). So this is an omission, not a stated scope decision.

*Failure mode:* claim 5's falsifier is asserted but never demonstrated. Reverting `--others --exclude-standard`, or narrowing the pathspec, passes every gate. Compounding it: in CI the tree is clean, so `--others` yields nothing and the widened behaviour is a **no-op in CI** — it executes only locally, where nothing pins it.

*Why material:* engineering-method §Enforcement — "A control counts only when its firing can be demonstrated or credibly falsified." repository-method §7.
*Smallest owner:* repository proof owner / the 4D-C packet's parallel output 4.
*Protected property:* claim 5 (guards inspect tracked **and** non-ignored untracked candidate paths).
*Stop?* Planning need not stop. The packet must not be closed asserting claim 5 is proven.
*Re-evaluate:* a gate route for the two controls; whether the candidate manifest should carry a proof receipt.
*Do not reopen:* the census widening itself — I verified it operates (`1218` cached + `19` others = `1237`, matching the guard's own output); the AGENTS.md floor; BLD-10 closure.

---

## F2 — LOCAL EXECUTION GAP · material

**The new controls mutate the live Evidence tree, and post-widening a leftover fixture makes a gated guard permanently red.**

*Evidence (observed):* `repository-contract.test.mjs:49-85` writes `docs/evidence/4f/untracked-doc-index-fixture.md` and `docs/evidence/4f/untracked-handoff-fixture.md` into the real worktree; cleanup is `finally`-only (no signal/crash coverage). Before this change those leftovers were invisible to both guards. After it, a leftover `untracked-handoff-fixture.md` produces `transient path: …` and a leftover `untracked-doc-index-fixture.md` produces `broken link: …` on every subsequent run — including `repository:check:extended`, which **is** in the candidate graph (`conexus-verify.mjs:93`) and in CI.

*Root cause (observed):* `check-repository-hygiene.mjs:5` and `check-doc-index.mjs:6` hardcode their root from `import.meta.url`. The sibling guard `check-architecture-verification.mjs:4-5` accepts `process.argv[2]` as root, and `tests/repository/architecture-verification.test.mjs:26-34` uses `mkdtempSync` + copy. That isolation seam exists and was not extended to the two widened guards, so their controls had to contaminate the real tree. *Constraint the owner must weigh:* `git ls-files --others` only sees files inside a git worktree, so a plain tmpdir copy is insufficient — an isolated root would have to be a real worktree or clone.

*Disclosure:* a grep for `verify:extended` surfaced `docs/evidence/4b/fable-independent-review.md:81`, which records the same defect class at an earlier stage. Per the brief I did not use it as reasoning or authority; I note only that the class has repository history.

*Why material:* an unrelated interruption becomes a red required gate whose cause is a test fixture, and non-Evidence files are written into `docs/evidence/`.
*Smallest owner:* repository proof owner. *Protected property:* local and CI idempotence of the gated guards.
*Stop?* No — `DEFER SAFELY`. But if F1 is resolved by gating this file, F2 must be fixed **first**: gating a tree-mutating suite is what makes the hazard reachable in the protected check.
*Do not reopen:* the census widening; having negative controls at all.

---

## F3 — LOCAL EXECUTION GAP · low

**The hygiene control's assertion is not bound to its fixture (weak falsifier).**

*Evidence (observed):* line 78 asserts `output.includes('transient path')`; its doc-index sibling at line 59 correctly asserts the fixture filename. Because the census now spans the whole dirty candidate, any *other* untracked transient path emits the same string, so the assertion can pass without the fixture ever being observed. Currently sound — `git ls-files --others --exclude-standard | grep -Ei '(handoff|dialogue|round|correction-handoff)'` returns none — but not self-guarding. Line 41 (`!output.includes('docs/work')`) has the same shape (pre-existing), which is evidence this is a class rather than a one-off.
*Smallest owner:* repository proof owner. *Stop?* No.

---

## F4 — PRODUCT / PLAN GAP · material

**An accepted blocking precondition for the next slice exists only in the decision register, and is absent from both the roadmap and the R3 admission packet.**

*Evidence (observed):*
- `docs/decisions/index.md:58` (new in this candidate): 4F-BLD-10 status includes `WIRE REQUALIFICATION DEFERRED`; its reopen trigger includes *"separately admitted R1/wire requalification **before any next slice consumes `subjectDigest` semantics**"*.
- R3 is the next slice (`docs/phases/realization-planning.md:318`; roadmap `## Exact next action`).
- `grep -i "subjectdigest|requalif|4C-F15|wire"` over `4f-r3-admission-preparation.md` returns only generic lines 87/117/139 ("requalification trigger when source, package, schema or topology changes") — no reference to the deferred R1/wire requalification. The same grep over `docs/roadmap.md` returns nothing.
- The trigger is concretely reachable: `subjectDigest` is a live wire field in `apps/hub/src/brain/context.ts:143,161,177`, `apps/hub/src/gateway/sankhya-key-conformance-observer.ts:78,115,156-159,189`, the new `apps/hub/src/builder/preview.ts:5,13,25`, and `apps/web/src/features/builder/api.ts:26,32`.

*Failure mode:* the packet's declared role is the admission checklist ("ready to close only after it resolves, or explicitly routes to the smallest owner, all of the following"). An actor using it admits R3 without the deferred requalification, silently consuming `subjectDigest` semantics the register says must be requalified first. A reopen trigger nobody routes to the actor who would trip it is not enforcement.
*Why material:* AGENTS.md §Authority — the roadmap owns allowed work and next action; repository-method §4 — downstream work must not proceed past an upstream owner condition.
*Smallest owner:* roadmap (allowed work) plus the 4D-C/R3 selection packet.
*Protected property:* claim 3 (R3/R7 boundary) and the accepted 4C-F15 disposition.
*Stop?* R3 must not be admitted until the precondition is carried into R3's admission conditions. Planning may continue.
*Do not reopen:* the 4C-F15 Baseline interpretation, its operator approval, or the R1 wire bytes. This is a propagation defect, not a re-decision.

---

## F5 — PRODUCT / PLAN GAP · moderate

**The R3 proof crosswalk is narrower than the accepted RF-05/RF-08 proof lists it cites, with no recorded R3/R7 narrowing.**

*Evidence (observed):* `4d-04-runtime-family-applicability.md` — RF-08 Proof includes *"quiescence and missing observation honesty"*; RF-05 Proof includes *"coverage/drift matrix"*. `grep -i "drift|quiesc|observ|telemetr|honest|coverage"` over `4f-r3-admission-preparation.md` returns **no match**. Separately, `realization-planning.md:378` assigns `3N-V18` to `R3/R7` and `:322` lists `3N-V18` among R7's invariants, while the packet's crosswalk marks the catch-up row R3-only and its sole R7 row is the reconciliation oracle.
*Failure mode:* false completeness — a later actor treating the crosswalk as the R3/R7 split of record concludes V18 is discharged at R3, and that missing-observation honesty and drift coverage have no owner in the sync contract.
*Note:* the brief's protected claim 4 enumerates the same narrower set, so the brief does not catch this.
*Smallest owner:* the 4D-C/R3 selection packet. *Stop?* No — resolve before R3 admission, not before continuing planning.
*Do not reopen:* the RF-05/RF-06/RF-08 postures and owner/trust rows, which the packet reproduces faithfully.

---

## F6 — METHOD FINDING · material

**Lane isolation is enforced only by prose, inside a shared worktree that already holds a completed peer output; and the candidate has no exact HEAD.**

*Evidence (observed):*
- blueprint §10.1 accepted pattern: candidate branch exact HEAD → isolated review branch → only a bounded temporary review artifact differs. engineering-method §Periodic independent assurance: *"Neither lane may receive the other lane's output before both complete."*
- The subject is uncommitted: 18 modified + 19 untracked paths at `main`/`e9ff12e`. The manifest's `Base:` is the merge base, not a candidate commit — there is no exact candidate HEAD to hand a challenger.
- `docs/evidence/4f/4f-r3-4d-c-selection-review-result.md` (7255 bytes, mtime `2026-09-09 15:01`) sits in the routed evidence directory, written after the brief (14:52) and manifest (14:53), with **0** inbound links from any document and absent from the manifest. Not read.
- The repository already implements the structural control it skipped: `check-repository-hygiene.mjs:35-46` enforces `REVIEW_CANDIDATE_REF` so a review branch differs from the candidate only by `docs/work/current/ai-dialog.md`.
- Custody scope mismatch: the identity anchor is `git diff --binary | sha256`, which by construction excludes untracked files; only 3 of 19 untracked paths are individually hashed. `apps/hub/src/builder/preview.ts`, `apps/hub/migrations/023_rb_builder_preview_subject.sql` and `tests/implementation/bld-10-preview.test.mjs` are unbound executable candidate content sitting inside the very census the reviewed guards now inspect. A whole-repository enforcement change is frozen by a manifest covering 8 of 1237 files.
- Handoff completeness vs §10.4: the brief omits *accepted upstream work that must not be casually reopened*, *why this package is now meaningful enough for whole/global review*, *required verification reconstruction*, and *review Evidence destination*. The operator supplied the first verbally in this lane's instruction — which is evidence the brief under-specifies, not that the property is absent.

*Failure mode:* independence becomes unverifiable after the fact, and the frozen subject is not closed under the blast radius of the change it freezes.
*Why material:* independence is the property the entire two-lane assurance floor rests on, and it cannot be re-established once lost.
*Smallest owner:* Lead / blueprint §10.1 plus repository-method §6 (one named integrator).
*Stop?* No stop of the planning work. The Lead should not treat lanes run this way as satisfying §10.1 without recording why.
*Do not reopen:* §10.2 (reviewer is not authority), BLD-10 closure, the brief's non-goals.

---

## F7 — METHOD FINDING · moderate

**Assurance volume is disproportionate to the delivered property, and roadmap status has degraded into unchecked prose.**

*Evidence (reproducible counts):*
- BLD-10 slice code: `git diff --stat -- apps/ tests/implementation/` = 6 files / 245 insertions, plus untracked `preview.ts` 29, migration 44, `bld-10-preview.test.mjs` 40 ⇒ **~358 lines**.
- New untracked Evidence for the same cycle: **16 files / 1537 lines** in `docs/evidence/4f/`, including 4 distinct review briefs/results for one bounded slice. `docs/evidence/4f/` now holds 105 files.
- Roadmap rows 4D, 4F and `Product implementation` each carry 7–8 slash-separated status tokens, and `CURRENT_PROJECT BASELINE DECISION ACCEPTED / OWNER DISPOSITION ACCEPTED / CLOSURE REVIEWED` is **triplicated across all three rows**.
- Nothing checks them: `check-current-state.mjs:41-55` matches only `^3([A-O]|B–3K)$` against the exact literals `'OPEN / ACTIVE'` and `'CLOSED'`; `conexus-preflight.mjs:461-477` prints 4D and Product-implementation status verbatim. Compound status is unguarded, and the 4D row can no longer match any status predicate.
- The 4D row states a next action in its **Reopen trigger** column ("Freeze and independently review the 4D-C/R3 selection packet") that differs from `## Exact next action` ("Consolidate the 4D-C/R3 selection packet").

*Why material:* this is the OVER-STOPPING direction §10.5 asks a whole/global challenger to test, now measurable rather than impressionistic; and engineering-method §Authority ("Two authorities for the same meaning are presumed wrong until justified") plus its LLM-first rule ("state each normative rule once") are both degraded inside the single file AGENTS.md designates as sole current authority.
*Smallest owner:* roadmap owner + Lead (proportionality reset, engineering-method §Delivery and convergence).
*Stop?* No. This is explicitly **not** authority to reopen any accepted decision — a reviewer finding is evidence, not requirement authority.
*Do not reopen:* any accepted 4A–4C/C-018 disposition, the BLD-10 owner decisions, or retained Evidence (repository-method §5 forbids deleting still-current Evidence to reduce file count).

---

## F8 — LOCAL EXECUTION GAP · low

**The widened census depends on non-candidate local state; one widened guard resolves its root unsafely.**

*Evidence (observed):* `--exclude-standard` honours `.gitignore`, `$GIT_COMMON_DIR/info/exclude` and `core.excludesFile`. Verified here: common `info/exclude` empty, no per-worktree exclude, `git config --get core.excludesFile` exits 1, no `~/.gitignore*`. The census is therefore complete **today** (1218 + 19 = 1237). The dependency is latent, not live. Tracked `.gitignore` additionally hides `apps/hub/public/`, `*.log`, `.env*`, `dist/`, `coverage/`, `.worktrees/`. Separately, `check-repository-hygiene.mjs:5` uses `resolve(new URL('../', import.meta.url).pathname)` while `check-doc-index.mjs:6` uses `fileURLToPath`; under a percent-encoded root the hygiene guard fails to resolve — a fail-closed crash, not a false pass.
*Stop?* No. Recorded for the owner's decision.

---

## NO FINDING — attacked and survived

- **Candidate custody integrity** — all manifest digests and the tracked-diff digest reproduce exactly. (Coverage caveat is F6; integrity itself holds.)
- **Claim 1, owner integrity** — RF-05 and RF-08 owner/trust rows in `4d-04` are reproduced faithfully; queue/scheduler is explicitly denied admission and terminal truth in both source and packet. One internal inconsistency noted but not elevated: the evidence census gives `Registry/Release/MAR` for immutable artifacts/serving while the owner-law crosswalk gives `Registry/Release`; `realization-planning.md:321` lists all three as R6 owners, so the census row is faithful and the crosswalk silently narrows. Non-material while R3 is unadmitted.
- **Claim 2, selection honesty** — B02 (`PG + NARROW I&A GUARD LEADING / MIGRATION TOOLING UNSELECTED`; §9 `pg = LEADING RUNTIME DRIVER CANDIDATE / NOT SELECTED`) and B03 (`pg-boss = INCUMBENT LEADING ADAPT CANDIDATE / NOT SELECTED`; incumbent pin `12.26.3`, current `12.28.1` requiring exact DDL/behaviour requalification) match the packet's census in substance. No package, version or topology is promoted from precedent.
- **Claim 3, R3/R7 boundary** — `realization-planning.md:326` and the packet agree: R3 builds the contract and recovery seam; R7 admits the real JobRun under exact served-Release pins. F5 concerns narrowing inside the crosswalk, not a boundary breach.
- **Claim 6, operating-mode truth** — `conexus-preflight.mjs:461-477` surfaces the `Product implementation` row, which carries `AUTONOMOUS GOAL PAUSED / OPERATOR-DIRECTED PLANNING`; `4f-autonomous-roadmap-execution-goal.md:3` carries the same pause. No surface represents an active overnight Goal.
- **Guards operate on the dirty candidate** — both run clean read-only here; hygiene reports 1237 files including the 19 untracked paths.

## Unknowns kept as unknowns

1. **Whether the two new controls actually fire.** Establishing it requires writing fixtures into the worktree, which is not admitted read-only. Reading the source, they would fire and would discriminate against the pre-change code — that is *inference*, not observation.
2. **Whether the full candidate graph is green on this dirty candidate.** Not run; note `repository-check` → `check-current-state.mjs:60` fails by design on a dirty tree without `CONEXUS_ALLOW_DIRTY_WORKTREE=1`.
3. **Contents and conclusions of `4f-r3-4d-c-selection-review-result.md`** — deliberately not read.
4. **Whether the deferred R1/wire requalification is captured in `4f-bld-10-4c-f15-owner-requalification-preparation.md`** (3 inbound links, all from other 4f BLD-10 docs; not routed from the R3 packet, `docs/index.md` or the roadmap). Outside the routed set. F4 stands regardless, since it is about propagation into R3's admission conditions, which is verified absent.

---

`VERDICT = CURRENT STRUCTURE CONFIRMED, WITH BLOCKING CONDITIONS — claims 1, 2, 3 and 6 survive attack on primary sources; claim 5 is NOT PROVEN because no gate, workflow or recorded receipt executes its deciding controls (F1) and the controls themselves are tree-contaminating (F2) and one is fixture-unbound (F3); the 4D-C selection packet must not be closed, and R3 must not be admitted, until F1, F4 and F5 are resolved; F6 and F7 are recorded against the working model and are not authority to reopen any accepted decision; planning work may continue now.`

Reviewer output is Evidence, not authority — the Lead/operator adjudicates each finding against current owners.
## Closure disposition

Both independent lanes completed against the same frozen candidate. Gemini found
no finding across its six named claims. Opus confirmed claims 1, 2, 3, and 6 but
reported blocking conditions for closing the packet or admitting R3: F1 (the new
repository negative controls are not on a deciding gate or recorded receipt), F4
(the deferred R1/wire `subjectDigest` requalification is not propagated into the
R3 admission conditions), and F5 (the R3/R7 proof crosswalk is narrower than the
accepted RF-05/RF-08 proof lists without recording that narrowing). F2 must be
resolved before F1 is gated because the fixtures mutate the live Evidence tree;
F3 and F8 are low execution gaps. F6 and F7 are method findings about custody,
independence, and proportionality, not authority to reopen accepted decisions.

The result is independent-review complete but not a closure or implementation
grant. The Lead adjudication and bounded corrections are recorded in
[4f-r3-4d-c-method-findings-adjudication.md](4f-r3-4d-c-method-findings-adjudication.md).
Planning may continue. R3 remains PREPARATION ONLY / NOT ADMITTED; no mechanism,
runtime, live source, JobRun, Release, serving path or Git publication is
admitted. A future closure checkpoint must freeze an exact candidate and fresh
isolated lanes before any admission.
