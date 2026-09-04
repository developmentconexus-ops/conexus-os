# 4D(R1) — R1C-14 Linux-native successor final closure brief

> **Status:** `FROZEN NEUTRAL REVIEW INPUT / NO VERDICT`
> **Identity:** `v14 / result d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6`
> **Boundary:** final R1C-14 successor closure only; no S3 Product bytes
> **Review posture:** fresh, isolated, read-only, adversarial

## Why this final round is justified

The prior v14 correction round found concrete defects in the reliability of the
receipt-last deciding proof. The current bytes now recompute the closed
historical result/metadata/receipt, derive every changed inherited
`PLATFORM-CONTRACT` transition, scope Product delta to the qualification-run
window, bind the deciding build invocation, require fresh canonical review
lanes and derive qualified Lead deferrals/unresolved counts. Those corrections
changed deciding-proof reliability enough to invalidate the prior challenge.

This is the one final isolated round over the corrected package. Do not expand
it into a review of unrelated recovery machinery, framework quality, repository
process or S3 implementation design.

## Exact candidate

```text
repository HEAD              = fd6f771be45102009f1887afaa9fc8a7e487e777
candidate                    = native-readmission-linux-2026-09-01-v14
result SHA-256               = d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6
OCI index                    = sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851
Linux/amd64 manifest         = sha256:5c4c1731bb91b227c26ab40efd8298a8a9b3a3f8a5a40642d65817d581a72276
Git executable SHA-256       = b5d1f9f76f9805ce8721accc9d8bbff9af9b7407e182ab07a5677dafa6c22201
build metadata SHA-256       = 841a96b0bdfca1f96e1b4b532f35e05c5ea5f11486b61f49d246e7fb93a4aa6a
qualification               = 17 / 17 PASS
admission unit suite         = 12 / 12 PASS
Product delta                = 0 during the qualification-run window
secret contamination        = 0 / 334 scanned files
```

## Authority bootstrap

Reconstruct current authority before judging the candidate:

1. `AGENTS.md`;
2. `docs/roadmap.md`;
3. `docs/index.md`;
4. `docs/development/engineering-method.md`;
5. `docs/development/repository-method.md`;
6. `docs/development/blueprint-harness-design.md` §§10.4–10.6;
7. `.agents/skills/conexus-development/SKILL.md` and its review reference;
8. this brief and only the exact subject files below.

The brief is orientation and attack framing, not authority or proof. Reviewer
output is Evidence; Lead adjudication owns the closure decision.

## Frozen protected-claim and blocker census

Only these six claims are in the final gate:

1. **Exact OCI identity / no substitution.** S3 can bind only OCI index
   `sha256:5e5c...f7851`; host Git, mutable tags, the platform manifest, the
   unavailable historical index and both live rejected indices are forbidden.
2. **False-PASS resistance.** The read-only consumer and receipt-last path fail
   closed on forged/stale/incomplete evidence, missing controls, partial
   promotion, undeclared inherited mutation or unqualified adjudication.
3. **Qualification-run Product delta.** The v14 run measured identical before
   and after Product censuses and claims only zero delta during that run window,
   not a standing pin over mutable Product roots.
4. **Secret non-disclosure.** The qualification protocol proves both secret
   detectors fire, removes only owned canaries, rescans cleanly and retains no
   secret in request target, filesystem, Evidence or promoted result.
5. **Historical Evidence preservation.** The closed 2026-08-31 result,
   metadata, receipt and eight deciding protocol identities remain byte-bound;
   v8–v13 are retained or digest-linked as superseded, never current authority.
6. **Deciding-review integrity.** Exactly one fresh Opus/xhigh/plan lane and one
   fresh Gemini/high/plan+sandbox lane bind this exact brief/result; raw verdicts
   remain subordinate to digest-bound Lead adjudication, and any `DEFER_SAFE`
   finding carries why-safe, revisit-trigger and later-owner fields.

A finding blocks receipt publication only if it demonstrates a reproducible
route to falsify one of those six claims, violate its accepted authority, cause
an unauthorized effect, or make its deciding proof unreliable. The blocker
census is therefore exactly:

```text
EXACT_IDENTITY_SUBSTITUTION
FALSE_PASS_ROUTE
QUALIFICATION_RUN_PRODUCT_DELTA_FALSE
SECRET_DISCLOSURE
HISTORICAL_EVIDENCE_LOSS_OR_FALSE_CURRENT_AUTHORITY
DECIDING_REVIEW_INTEGRITY_FAILURE
```

Do not add a seventh blocker class. A valid recovery, durability, external
custody, generic framework, CLI ergonomics or repository-process finding that
cannot reach one of the six claims must be reported as `DEFER SAFELY` with why
safe, exact revisit trigger and later owner. It must not widen this gate.

## Exact subject files

- `qualification/4d/r1-git-source-custody/Dockerfile`;
- `qualification/4d/r1-git-source-custody/run.mjs`;
- `qualification/4d/r1-git-source-custody/probe.mjs`;
- `qualification/4d/r1-git-source-custody/finalize-result.mjs`;
- `qualification/4d/r1-git-source-custody/native-readmission-pin.json`;
- `qualification/4d/r1-git-source-custody/evidence/native-readmission-linux-2026-09-01-v14/`;
- `qualification/4d/r1-git-source-custody/evidence/native-readmission-rejections/`;
- `qualification/4d/r1-git-source-custody/evidence/superseded-protocol/`;
- the v8→v14 digest-linked supersession chain;
- `scripts/check-r1c14-native-readmission.mjs`;
- `scripts/record-r1c14-native-readmission-receipt.mjs`;
- `scripts/conexus-review.mjs`;
- `tests/implementation/r1-r1c14-native-readmission.test.mjs`;
- `tests/implementation/r1-r1c14-finalizer.test.mjs`;
- `tests/repository/conexus-review.test.mjs`;
- `docs/evidence/4d/4d-r1-r1c14-native-readmission-result.md`;
- `docs/evidence/4d/4d-r1-r1c14-native-readmission-v13-review-adjudication.md`;
- `docs/evidence/4d/4d-r1-foundation-pin-manifest-r1c14-native-successor.json`;
- `docs/evidence/4d/4d-r1-operator-pending-actions.md`;
- `docs/evidence/4f/4f-r1-s3-git-execution-binding-candidate.md` only to
  test exact-image consumption and forbidden substitution.

The retained prior v14 correction outputs are correction provenance, not a
preferred verdict. Do not compare the current lane with the other current lane.

## Required attack and reconstruction

Independently reconstruct and try to falsify each frozen claim. At minimum:

- recompute the brief, result, manifest Evidence and historical identities;
- run the read-only native checker and admitted targeted tests if useful;
- demonstrate whether each relevant negative control genuinely fires rather
  than trusting its name;
- inspect the receipt builder/consumer transition derivation and adjudication
  validation without publishing a receipt;
- keep Docker-dependent observations unknown unless an admitted read-only
  diagnostic is already available; do not mutate the daemon.

Do not edit files, install dependencies, run another reviewer, call Product
providers, create a Docker builder, build/pull/tag/load/push/remove an image,
publish a receipt, or propose commit, push, PR or merge.

## Output contract

Classify every concrete finding as exactly one of:

```text
METHOD FINDING
PRODUCT / PLAN GAP
LOCAL EXECUTION GAP
NO FINDING
```

For every finding state evidence/reproduction, failure mode, implicated frozen
claim or `NONE`, materiality, smallest owner, whether receipt/S3 must stop, and
narrowest correction. For a valid non-blocker use `DEFER SAFELY` and include
why safe, revisit trigger and later owner.

End with:

```text
R1C14_NATIVE_READMISSION = ADMISSIBLE | REVISE | BLOCKED
MATERIAL_BLOCKERS = <integer>
EXACT_OCI_IDENTITY = PASS | FAIL
FALSE_PASS_RESISTANCE = PASS | FAIL
QUALIFICATION_RUN_PRODUCT_DELTA = PASS | FAIL
SECRET_NON_DISCLOSURE = PASS | FAIL
HISTORICAL_EVIDENCE_PRESERVED = PASS | FAIL
DECIDING_REVIEW_INTEGRITY = PASS | FAIL
VERDICT = <independent raw verdict>
```
