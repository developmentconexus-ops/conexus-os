# 4G(R1) — Lead directed-convergence proposal

> **Status:** `REVIEW INPUT / NOT AUTHORITY`
> **Implementation authority:** `0`

## 1. Accepted corrections

The approved 4F graph is unchanged. The following proof/mechanics gaps are
accepted and corrected in the deciding plan:

1. Git runs with `http.followRedirects=false`; a redirect canary proves the Git
   subprocess does not follow a redirect after Node/catalog admission.
2. PRJ-03 cleanup has no scheduler: same-key recovery plus a pre-reservation
   bounded opportunistic scan of at most 16 oldest expired receipts invokes the
   already enumerated cleanup function. Cleanup failure blocks the intake.
3. PRJ-07 has exactly two read-only tools. One returns the complete sorted
   invocation-bound source manifest or refuses unsupported size; the other
   reads a bounded batch of listed UTF-8 regular files. Inputs contain no
   Project/revision/URL/filesystem authority; outputs enter provenance.
4. R1C-13 zero-egress proof uses enabled instrumented network observation with
   zero non-admitted attempts and an unauthorized-egress canary proving the
   observer fires. `--network none` alone is explicitly insufficient.
5. R1C-14/R1C-13 PASS publish exact Git/Mastra/peer identities into a versioned
   successor of the existing pin-manifest class before their consuming slice.
6. S4 explicitly proves the fixture capability is absent/refused through the
   production composition.

These corrections add no Product operation, owner, Permission, durable class,
runtime family or background process.

## 2. Lead classification

| Review signal | Disposition |
| --- | --- |
| Git redirect bypass | `ACCEPT / MATERIAL FALSE-GREEN` |
| missing cleanup trigger | `ACCEPT / MATERIAL EXECUTION AMBIGUITY`, corrected opportunistically without scheduler |
| PRJ-07 allowlist undefined | `ACCEPT / MATERIAL EXECUTION AMBIGUITY`; max 3 calls is not three tools |
| zero-egress proved only by disabled network | `ACCEPT / MATERIAL FALSE-GREEN` |
| gate pins absent from grant-time manifest enumeration | `ACCEPT / MATERIAL FALSE-GREEN` |
| S4 fixture not negatively tested in production composition | `ACCEPT / MATERIAL FALSE-GREEN` |
| current authority not recoverable at committed checkpoint | `ACCEPT / GRANT BLOCKER`, not a plan/4G semantic defect |

The checkpoint blocker remains unresolved by design: current user authority did
not authorize commit/push/PR. 4G may converge, but
`IMPLEMENTATION_READY_FOR_OPERATOR_GRANT` must remain `NO` until an exact
operator-authorized checkpoint commit makes the deciding 4D–4G authority
recoverable. Push/PR/merge remain separately blocked.

## 3. Requested directed result

Read the corrected plan and return only:

```text
CONVERGENCE = ACCEPT | REVISE
4G_SEMANTIC_VERDICT = CLEAR | NOT_CLEAR
MATERIAL_PLAN_FINDINGS = <integer>
CHECKPOINT_GRANT_BLOCKER = YES | NO
```

Then list only a remaining material counterexample, if any. Work read-only.
