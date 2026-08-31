# 4G(R1) — Independent adversarial implementation-readiness adjudication

> **Status:** `CLOSED / OPERATOR APPROVED / SEMANTIC CLEAR / INDEPENDENT CONVERGENCE CLEAR`
> **Checkpoint authority:** `GRANTED FOR THIS AUTHORITY COMMIT`
> **Implementation authority:** `0`

## 1. Independent passes

Both reviewers reconstructed authority read-only from the same
[neutral brief](4g-r1-independent-adversarial-review-brief.md).

| Reviewer | Exact execution | First result |
| --- | --- | --- |
| Claude Code Fable | Claude Code `2.1.220`; `claude-fable-5`; `xhigh`; plan/read-only; session `88db9d49-7bd2-4e6c-a897-2981816d6641` | `CLEAR` with four local proof/checkpoint tightenings |
| AGY Gemini Pro | AGY `1.1.22`; `gemini-3.1-pro-high`; `high`; plan/sandbox/read-only; conversation `8c81e3c0-7e43-4aa4-a83a-3d4b486cb6a3` | `REVISE` with Git redirect, cleanup trigger and PRJ-07 tool ambiguity |

Neither reviewer edited repository files, installed dependencies, called a
provider/Product effect, pushed or opened a PR.

## 2. Lead adjudication and corrections

| Finding | Disposition | Smallest correction absorbed into 4F |
| --- | --- | --- |
| Git subprocess may follow a redirect after catalog admission | `ACCEPT / MATERIAL FALSE-GREEN` | `http.followRedirects=false` plus redirect canary |
| cleanup function has no caller under no-scheduler topology | `ACCEPT / MATERIAL AMBIGUITY` | same-key recovery plus bounded 16-oldest opportunistic pre-reservation cleanup; fail closed |
| PRJ-07 tool allowlist is abstract | `ACCEPT / MATERIAL AMBIGUITY` | exactly two invocation-bound tools with closed input/output/refusal/provenance law; three is call budget |
| `--network none` can hide egress attempts | `ACCEPT / MATERIAL FALSE-GREEN` | enabled instrumented observation of zero non-admitted attempts plus firing canary |
| Git/Mastra gate pins may escape grant-time manifest enumeration | `ACCEPT / MATERIAL FALSE-GREEN` | gate PASS publishes exact identities into successor of existing pin-manifest class |
| S4 fixture absence not proved in production composition | `ACCEPT / MATERIAL FALSE-GREEN` | S4 negative requires absent/refused production resolution |
| 4D–4G authority exists only in the working tree | `ACCEPT / GRANT BLOCKER` | operator-authorized checkpoint commit required before any implementation grant; no push/PR/merge implied |

All six plan findings are closed without adding a Product operation, owner,
Permission, durable record class, runtime family, scheduler or background task.
The approved graph and `13↔13` remain unchanged.

## 3. Directed convergence

Both reviewers attacked the corrected plan and returned:

```text
Fable:
  CONVERGENCE = ACCEPT
  4G_SEMANTIC_VERDICT = CLEAR
  MATERIAL_PLAN_FINDINGS = 0
  CHECKPOINT_GRANT_BLOCKER = YES

Gemini Pro:
  CONVERGENCE = ACCEPT
  4G_SEMANTIC_VERDICT = CLEAR
  MATERIAL_PLAN_FINDINGS = 0
  CHECKPOINT_GRANT_BLOCKER = YES
```

## 4. Coverage result

No remaining counterexample survived for orphan operation/consumer, Permission
scope, duplicate owner/persistence, parallel wire/DTO, generic executor,
unconsumed dependency, ownership bypass, partial failure/restart/concurrency,
stale PASS, later-tranche leak, Paved-Road binding, Phase-3 falsifier reachability,
credential/provider leakage, operator checkpoint honesty or partial completion.

## 5. Operator adjudication and terminal result

```text
4G_R1_SEMANTIC_VERDICT = CLEAR
INDEPENDENT_CONVERGENCE = CLEAR
MATERIAL_PLAN_FINDINGS = 0
OPERATOR_ADJUDICATION = APPROVED
CHECKPOINT_COMMIT_AUTHORITY = GRANTED
CHECKPOINT_SUBJECT = THIS AUTHORITY COMMIT
IMPLEMENTATION_READY_FOR_OPERATOR_GRANT_AFTER_CHECKPOINT = YES
PRODUCT_IMPLEMENTATION_AUTHORITY = 0
PUSH_PR_MERGE_AUTHORITY = 0
```

The operator approved the converged 4G result and separately authorized this
checkpoint commit. The checkpoint preserves the current owned 4D–4G authority
while leaving `.wireframe-preview/`, `PRODUCT.md` and unrelated/unowned state
outside the commit. Once this commit exists, R1 is eligible only for a separate
implementation-grant decision; no such grant is recorded here.
