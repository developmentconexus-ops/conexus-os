# Independent Fable whole/global review — Product-realization working model

> **Status:** `INDEPENDENT REVIEW EVIDENCE / NOT AUTHORITY`
> **Reviewer:** Fable (independent challenger, fresh context)
> **Review target:** the current Product-realization working model, using the integrated 4C checkpoint as Evidence
> **Candidate:** `docs/restore-fable-whole-review` @ `9817f8a053b1dca5e16ae487f14377c9584fb229` (PR #60), base `main` @ `da78cb7`
> **Candidate verification:** Verify runs on the candidate branch independently confirmed `SUCCESS` (latest 2026-08-25, run 32891190668)
> **Review branch:** `review/4c-product-realization-fable` — never merges; this file is the only delta
> **Authority note:** every conclusion below is Evidence for Lead adjudication. Nothing here modifies canonical Product, architecture, or method authority.

---

## 1. Review scope reconstruction

Reconstructed independently from repository authority (AGENTS.md → roadmap → index → engineering-method → repository-method → frontend method v2.3 → blueprint-harness §10 → 4C phase contract → 4C Evidence tree → Git history across `origin/main`, `agent/4c-frontend-interaction`, and the F22 adversarial review branches), not from the handoff narrative.

Current stage, as the repository itself states it:

- 3A–3O, C-018, C-015 refinement, Realization Planning: closed/ratified.
- 4A closed at a fixed census now `122` Product operations; 4B closed with machine-checked `122 ↔ 122` wire bijection, per-owner checkers, generated-projection proof, and adversarial whole-wire proof.
- 4C open under Frontend Method v2.3: GF-01, W-01, W-02A, W-02B, W-03, W-04, P-01 operator-LOCKED; P-02 P7 operator-approved; P-02 P8 is a functional F22+F23 candidate in operator walkthrough, NOT LOCKED; P9/P10 blocked pending LOCK; P11 not assembled; 4D+ not started; Product implementation blocked.
- The candidate under review (PR #60) changes only two documents: it writes the whole-package independent review model into `blueprint-harness-design.md` §10.4–10.6 and the roadmap continuation posture, and defines this review's objective. It changes no Product authority, no method law, no tests, no CI.

The working model I am reviewing, as actually practiced (reconstructed from history, not prose):

```text
accepted 4A/4B authority
→ per-block P6/P7 hypotheses + authority-feasibility preflight
→ functional low-fi P8 HTML with required proof tests (RED → GREEN)
→ operator operates the candidate (walkthrough)
→ comprehension/coherence failures become findings
→ material upstream findings → Engineering Method → bounded 4A/4B recompile
→ machine-checked whole-wire reproof after every recompile
→ independent adversarial review when a trust boundary moves
→ operator LOCK gates P9/P10
→ meaningful checkpoint → squash-merge → whole-package independent review
```

I verified this loop against four concrete historical case families before judging any property (§3 below).

## 2. Representative cases inspected

**Case 1 — frontend Evidence caused bounded upstream recompiles (repeatedly).**
The P-02 chain is the strongest evidence in the repository:

- First operator walkthrough exposed three comprehension gaps → F20 (semantic Data structure) + F21 (human-readable Capabilities): `p02-p8-feedback-revision.md`. Bounded corrections, `+0/+0` operations.
- A later walkthrough with Mitra reference screenshots falsified F20's own rejection of a physical explorer ("stopped one level too early") → F22 `RESTRUCTURE NOW`, adding `PRJ-25..28` read-only Data Explorer: `p02-f22-data-explorer-design.md`. Ops `117 → 121`.
- The whole-P-02 walkthrough produced F23 `BRN-14 GetProjectBrainContext`: ops `121 → 122`.
- Earlier, the P-02 preflight itself produced F16–F19 (`p02-f16-f19-recompile-proof.md`), ops `113 → 117`, with a full RED→GREEN TDD chronology (Verify #883–#900) and post-recompile whole-wire proof `117 ↔ 117 / 0 missing / 0 extra / 0 duplicate`.

Each recompile was bounded: new operations, zero new semantic owners, zero new durable record classes, no 4A/4B restart, and the whole-wire bijection re-proved mechanically after each change. Measured cost: the entire F22 recompile — ledger, permission law, wire fragment, focused checker, census-derivation refactor, review routing — spans commits from 20:52 to 22:06 on 2026-08-24. **A full upstream Product/API recompile costs roughly an evening, not a phase.**

**Case 2 — a real problem stayed local and did not reopen accepted authority.**
The first F22 P8 artifact shipped with an inline-script `SyntaxError` that made it inoperable (`p02-p8-walkthrough-script-fix.md`). It was fixed as a local artifact bug with a new parse smoke guard (RED #981 → GREEN #982); no Product operation, Permission, owner, or wire was touched. Likewise the Product/Review surface separation (#1034) was handled as a presentation correction with explicit "Product behavior and authority semantics were not changed."

**Case 3 — frontend nearly became a second authority, and the model caught it.**
The first GREEN F22+F23 candidate (Verify #1000) had projected backend `SetProjectConnectionBinding` mechanics into a human "Switch connection" flow and carried an invented `purpose` field absent from the accepted wire (`p02-p8-f22-f23-revision.md`). This is exactly the failure class the method exists to prevent — and it survived RED→GREEN and reached the walkthrough. The operator coherence review caught it **before LOCK**; the correction removed the invented semantics (RED #1010 → GREEN 58963af) and explicitly routed any future "replace the system that fulfills role X" job to the smallest owning Product decision. The safety net fired at the designed layer (operator walkthrough / coherence review, pre-LOCK), not after implementation.

**Case 4 — process cost versus protected property.**
- Review cadence around F22: adversarial R1 (findings adjudicated), corrections, R2 confirmation — both rounds inside ~24 hours, and both justified by the Engineering Method's own independence floor, because F22 moves a trust boundary (already-issued `project.data.read` grants gain raw-row disclosure). R2 followed material corrections, matching blueprint §10.3.
- The verify suite is property-shaped, not ceremony-shaped: wire bijection, per-owner checkers, negative controls that demonstrably fire (8 F22 + 3 F23 firing negative controls), generated-projection determinism, and a mechanical bootstrap-size guard (`bootstrap_bytes ≤ 20480`) that caps the fresh-session context cost of the method itself.
- History shows active self-correction against ceremony: F19 hardening removed "stale temporal snapshot coupling" and "Product-count snapshot coupling" from guards; census checks were refactored to derive counts from canonical sources instead of hard-coding them (`test(4b): derive whole-wire census from canonical bundle`, etc.); roadmap compaction preserved only markers still consumed by regression guards.

Wall-clock: 4C spans 2026-07-31 → 2026-08-24 for seven operator-locked blocks plus P-02 mid-flight, while the Product operation census grew `113 → 122` purely from interaction Evidence.

## 3. Property attack matrix

| # | Property | Verdict | Deciding evidence |
| --- | --- | --- | --- |
| A | Abstract planning → coherent human Product behavior | **SURVIVES** | P-02 four-route model restructured by human jobs (human-first Capabilities, system-use-first Integrations, Brain Context primary), not by backend topology; F21 exists precisely because operationIds were not human-comprehensible |
| B | Functional interaction exposes what abstract planning cannot | **SURVIVES** | +9 operations (113→122) discovered only through walkthroughs/reference operation, after 4A had closed "complete"; F22's job ("open the data and inspect the records") was invisible to metadata-level planning |
| C | Product progress by default | **SURVIVES** | 7 blocks locked + P-02 near-lock in ~3.5 weeks; no observed idle stop without a named falsifier |
| D | Stop when — and only when — material falsifier appears | **SURVIVES** | F20/F21/F22/F23 stops each tied to a concrete falsified assumption; parse bug and surface separation correctly did NOT stop upstream work |
| E | Gaps routed to smallest real owner | **SURVIVES** | All four recompiles named exact owners/operations; 0 new semantic owners, 0 new durable record classes across all of them; explicit "4A/4B = NO REOPEN" in the Integrations correction |
| F | Global Maximum over first local fix | **SURVIVES** | F22 was `RESTRUCTURE NOW` (root cause: semantic/physical collapse), rejecting the "add another Fields tab" patch by name; note honestly that F20 itself was later falsified — see §5 |
| G | Accepted decisions survive unless falsified | **SURVIVES** (one execution-level defect, Finding 1) | P7 four-route structure preserved through every P-02 correction; W-blocks preserved through v2.2→v2.3 rebaseline with explicit reasoning |
| H | New falsifier can still reopen accepted planning | **SURVIVES** | F22 reopened and reversed an operator-accepted F20 rejection when new Evidence (walkthrough + Mitra screenshots) arrived |
| I | Bounded recompile, no cascade restart | **SURVIVES** | Every recompile re-proved the whole wire mechanically (`0 missing / 0 extra / 0 duplicate`) without restarting 4A/4B/locked blocks; cost per recompile ≈ hours |
| J | Frontend never a second authority | **SURVIVES — with a proven near-miss handled** | Invented `purpose` + switch semantics reached a GREEN candidate but were caught pre-LOCK and removed; wire negative controls fire; invented-operation count is machine-checked at 0 |
| K | Block-by-block does not hide late cross-block local maxima | **SURVIVES / NOT YET FULLY TESTABLE** | P11 not assembled, so unfalsifiable today. Mitigations exist and are real: GF-01 global frame locked first; W-02A/W-02B boundary adjudicated during blocks; P11/P12 are designed catch points with a re-LOCK loop. Residual risk stated in §5 |
| L | Operator walkthroughs produce real learning | **SURVIVES** | Walkthroughs produced F20/F21, F22, F23, and the Integrations rejection — four material outcomes from operation, zero rubber-stamp LOCKs observed; first candidate was explicitly NOT locked |
| M | Tests/gates proportional to protected properties | **SURVIVES** | Negative controls demonstrably fire; snapshot-coupling guards were removed when they became ceremony; bootstrap-size guard caps method overhead mechanically. One forward-looking pruning obligation in §6 (O-2) |
| N | Review cadence: meaningful package → one whole review | **SURVIVES** | F22 R1/R2 sat on the independence floor for a trust-boundary change, R2 followed material corrections; this whole-model review sits at an integrated checkpoint (PR #57 merged), not on a micro-iteration; roadmap now states "do not add another review round solely because a review occurred" |
| O | Neither over-stopping nor under-stopping | **SURVIVES** | Over-stopping: recompile ≈ 75 min, reviews ≈ same evening, no evidence of learning suppressed by ceremony. Under-stopping: the one observed invention (Case 3) was stopped pre-LOCK at the designed gate |

## 4. Material findings

### Finding 1 — stale "current" upstream facts inside the live 4C phase contract

**Classification:** `LOCAL EXECUTION GAP`

- **Evidence:** `docs/phases/4c-frontend-interaction-and-authority-realization.md:63-67` states, under "Current fixed upstream facts after accepted bounded 4C findings include": `fixed Conexus platform Product operations = 113` and `canonical fixed Product wire = 113 ↔ 113`. Canonical current authority says `122` (`docs/product/operation-ledger.md:12,27-30`, roadmap). The same document cites "Frontend Product Experience Planning Method **v2.2**" (`:58`, `:73`, `:125`, `:493`, `:598`) while the operator-ratified method is **v2.3** (2026-08-23) and the roadmap states `METHOD v2.3`.
- **Failure mode:** the 4C phase contract is on the mandatory fresh-session bootstrap route for any 4C task. A fresh actor reads two contradictory "current" facts inside current authority. This is precisely the defect class the repository already eliminated from its *guards* — `p02-f16-f19-recompile-proof.md` §1 deliberately stopped duplicating current truth into historical documents, and census checks were refactored to derive counts — but the same duplication survives in *live contract prose*. The stated exemption ("historical documents retain the counts true at their original closure") does not apply: 4C is OPEN and the document itself claims the facts are current.
- **Why material:** it drifted silently through three consecutive recompiles (113→117→121→122) and one method rebump without anyone noticing, which proves no control covers this path. Left alone, it will keep drifting for the remainder of 4C.
- **Assumption falsified:** "bounded recompile updates all affected current-authority surfaces." It updated ledger, roadmap, wire, and guards — but not embedded status claims in the open phase contract.
- **Smallest real owner:** the 4C phase document itself. No Product meaning is implicated.
- **Target invariant:** a mutable current fact (census, method version) has exactly one mutable home; open-phase contracts reference that home instead of restating the value.
- **Must current work stop?** No. Roadmap and ledger outrank the phase doc; the wire checkers enforce the real census. The walkthrough may continue in parallel.
- **What needs re-evaluation:** only the stale lines — replace hard-coded `113` counts with a reference to the operation ledger/roadmap (or the current value plus a "see ledger" pointer if a number must appear), and update the method citation to v2.3.
- **What must NOT be reopened:** 4A, 4B, the method itself, any locked block, F16–F23 ratifications, the census, or the recompile history. This is prose currency, not authority change.
- **Alternatives / Global Maximum:** (a) fix the lines by hand now — smallest, but leaves the defect class reachable; (b) fix the lines and remove the duplicated-mutable-fact pattern from the open phase contract so the class dies with the fix; (c) add a repository guard forbidding hard-coded census values outside ledger/roadmap/closed-evidence paths — strongest, but a new permanent gate for a defect observed once is disproportionate now (repository-method §7). **(b)** is the Global-Maximum-consistent correction: de-duplicate rather than re-synchronize. Escalate to (c) only if the class recurs after (b).
- **Smallest sustainable correction:** apply (b) in the next candidate commit on the working branch, after Lead adjudication.
- **Falsifiable closure proof:** `grep -n "113" docs/phases/4c-frontend-interaction-and-authority-realization.md` returns no current-fact claim, and the document cites no superseded method version; roadmap/ledger remain the only mutable homes of the census.

No other finding survived my challenge at material strength. Specifically, I attacked and could not sustain: "4A closed too early" (§5), "P8 TDD is ceremony" (§6 O-2), "the review cadence over-stops" (matrix N/O), and "block-by-block hides cross-block failure" (matrix K, residual risk only).

## 5. Honest method challenges that did NOT become findings

**Was Product/API authority made exact too early, before operating the Product?** The census has grown 8% (113→122) under interaction Evidence, and F20 — itself a correction — was falsified again within days by F22. Read adversarially, this says 4A's "complete" census was not complete and even fresh corrections can under-shoot. But the evidence cuts the other way on cost: precisely because 4A/4B closed into a machine-checked bijection with per-owner checkers and generated-projection proof, each 4C-discovered gap was recompiled and *re-proved whole* in hours, with `0 missing / 0 extra / 0 duplicate` asserted mechanically after every change. The alternative sequencing (operate interaction before an exact wire) would surrender exactly the instrument that makes late falsification cheap and provable. F20→F22 is not thrash: F22's deciding evidence (operating the candidate + Mitra reference screenshots) did not exist at F20 time, and evidence-first reasoning forbids inventing it retroactively. The loop converged in two bounded steps at trivial cost. **No METHOD FINDING; the observed growth is the loop functioning, not the plan failing.**

**Does block-by-block P8 create stop/start overhead?** Measured overhead per stop: F22 ≈ 75 minutes of recompile plus same-evening adversarial rounds. The stops observed all protected material properties (trust-boundary Permission consequence, invented semantics, authority census). No evidence of a stop that protected nothing. **No finding.**

**Should cross-block interaction be exercised earlier?** Untestable until P11; the risk that block-local optima surface late is real but bounded by GF-01-first locking, cross-block boundary adjudication already observed during W-blocks, and P11/P12's explicit finding→re-LOCK loop. Pulling P11 earlier would violate "P11 assembles already-LOCKED blocks" and reintroduce all-at-once wireframing pressure for no evidenced gain. **Residual risk accepted; revisit only if P11 produces multiple lock-falsifying findings — that outcome, not preference, is the reopen trigger.**

**Is the P9/P10 gate position right?** P9 after LOCK matches the evidence: P9 binds exact contracts, and P-02's interaction structure changed four times pre-LOCK; contracting earlier would have produced four discarded contract revisions. **No finding.**

## 6. Non-material observations

- **O-1 — review-model doctrine now lives in two places.** The candidate writes the whole-package review model into both blueprint §10.4–10.6 (durable doctrine) and the roadmap continuation posture (~60 lines of method prose plus a transient "Objective of the current Fable review" section that goes stale the moment this review completes). Finding 1 is the existence proof of what duplicated prose does over time. After adjudication, compact the roadmap to status + a pointer at the blueprint sections, per the repository's own compaction habit. Not material today.
- **O-2 — required-CI P8 fixture tests are earning their keep now, but carry a pruning obligation.** Tests pinning a disposable walkthrough candidate's content caught real breakage (parse smoke #981) and enforced the coherence correction (#1010). They are proportionate during candidate churn. When P-02 locks and P9/P10 produce the durable contract, prune or demote them rather than letting historical proof become a permanent required gate (repository-method §7 already commands this; just apply it at that moment).
- **O-3 — bootstrap-size guard is a genuinely good proportionality control** (observed 20245/20480 at F16–F19 closure, 18553 after compaction). Keep it; it is the one mechanical check that caps the method's own context cost.

## 7. Global-Maximum method assessment

Triggered only if evidence shows a material local optimum in the working model. It does not. The two credible structural alternatives — (a) close authority later / operate interaction earlier, (b) assemble cross-block interaction before per-block LOCK — were each tested against repository history in §5 and lose on evidence: (a) destroys the cheap-recompile property that history demonstrates four times; (b) trades an unobserved risk for a named prohibited failure mode (all-at-once wireframing) the method was built to prevent. The current model is, on present Evidence, the Global Maximum for this stage. Its known residual exposure (cross-block optima) already has designed catch points with explicit reopen mechanics.

## 8. Continuation verdict

```text
LOCAL EXECUTION CORRECTION ONLY
```

The Product-realization working model survives whole/global adversarial challenge on every attacked property. One local execution gap (Finding 1: stale current-facts/method-version claims in the open 4C phase contract) requires a bounded documentation correction inside the 4C owner. No method correction, no Product/plan reopen, no stop of the current walkthrough is justified by Evidence.

## 9. Exact next action

Lead adjudicates Finding 1 against current authority. If it survives (it should — it is a defect against the repository's own single-mutable-home law, not a new requirement), fold the §4 alternative-(b) correction into the next ordinary candidate commit. Then **continue the current P-02 operator walkthrough toward P8 LOCK** and keep advancing the Product block by block. Do not add another review round for this package: no surviving material finding changes the reviewed property, so blueprint §10.3's second-round condition is not met.
