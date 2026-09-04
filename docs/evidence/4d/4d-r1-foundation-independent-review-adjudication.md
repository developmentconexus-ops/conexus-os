# 4D — R1 Foundation Independent Review Adjudication

> **Status:** `PASS 2 CONVERGED / OPERATOR APPROVED / 2026-08-30`
> **Candidate:** `R1F-01..07` batched selection
> **Review date:** `2026-08-30`
> **Probe / implementation authority:** none

## 1. Independent review

One batched review used Claude Code Fable and AGY Gemini Pro over the exact R1
Foundation candidate and owners. No Product probe or package installation was
authorized. Fable performed repo-only review because its external registry/test
tools were denied; the Lead independently acquired current Context7/official/
registry Evidence before review.

Both reviewers returned `REVISE`. Reviewer findings are Evidence, not authority.

## 2. Lead adjudication

| Finding | Disposition | Basis / correction |
| --- | --- | --- |
| future gate lane uses `npx --yes` outside lock | `ACCEPT` | selected R1 gates must become exact locked dev dependencies before probe/implementation |
| Node 24.20 selection lacks `.nvmrc`/engines migration | `ACCEPT` | repin runtime/build metadata together and guard exact identity |
| npm tree differs by OS-native optional packages | `ACCEPT` | Linux x64 is deciding tree; dev-host delta is explicit/non-authoritative |
| CR-1 lacks exact row-lock mechanic | `ACCEPT CONTRACT / DEFER EXECUTION` | canonical row locks selected, but map proves first consumer is R6; remove R1 race probe |
| opaque Conexus session unspecified | `ACCEPT` | add PostgreSQL `iam.session`, opaque digest, expiry/rotation/revocation and multi-process truth |
| `AUT-06` bootstrap unspecified | `ACCEPT` | exact issuer/sub one-shot IAM-03-only transient path + negative proof |
| server secret sourcing unspecified | `ACCEPT` | server-only secret-file provider boundary, no values in env/repo/log/Evidence |
| invalid UTF-8/BOM admission hole | `ACCEPT` | fatal decode/BOM refusal before syntax tree + RED controls |
| Fastify default Ajv mutation fallback | `ACCEPT` | seal one root compiler; plugins cannot set/fallback; negative fixture |
| canonicalize adds little after restrictions | `RETAIN ADAPT / CLARIFY` | still avoids string escaping, recursive ordering and ECMAScript serialization edge code; equivalence proof remains |
| RF-01/RF-12 `VER-01` double ownership | `CLARIFY` | RF-01 owns distribution mechanics; RF-12/R1F-07 owns actual R1 gate selection |
| coupled prose pins are unverifiable | `ACCEPT` | machine-readable pin manifest required before probe grant |
| Hub and Project DB must share physical DB for CR-1 | `REJECT` | CR-1 consumer is Hub Release/I&A in `hub_control`; Project DB isolation remains intact |
| npm lacks per-package script allowlist | `REJECT` | selected npm 12 exposes strict allow-scripts policy; probe must prove it |
| Keycloak logout must immediately revoke Conexus session | `REJECT / NEW REQUIREMENT` | C-015 intentionally separates Keycloak authentication from Conexus session/authorization |
| `R1F-P10` should run CR-1 in R1 | `REJECT BY REACHABILITY` | `PromoteRelease` first reaches R6; incremental law moves implementation/proof JIT |

## 3. Test/guard corrections

- reachability test must parse exact tranche buckets, assert declared bucket
  counts and prove zero cross-bucket duplicates rather than compare only deduped
  global sets;
- candidate guard must cover all selected version identities and critical
  integrity/source pins;
- independent review Evidence must be routed before operator adjudication;
- remove dangling Vitest compatibility claim while Vitest is deferred.

## 4. Material change requiring directed recheck

The pass changed three material boundaries:

1. session/bootstrap/secrets are now exact R1F-04 mechanics;
2. CR-1 implementation/probe moved from R1 to its R6 consumer;
3. install/runtime/pin Evidence became stricter and machine-readable before
   probe admission.

A second directed review is justified over only these corrections. It must not
reopen unrelated selected versions without a new falsifier.

## 5. Current conclusion

```text
R1F-01..07 candidate = REVISED
accepted findings = 11
rejected findings = 4
Product owner reopen = 0
CR-1 contract weakened = NO / execution moved to first consumer R6
probe authority = 0
implementation authority = 0
terminal selection verdict = READY FOR OPERATOR ADJUDICATION
```

## 6. Directed recheck

Gemini returned `ACCEPT` with zero material findings and explicitly confirmed
that C-015, Conexus session authority, Project DB isolation and the incremental
law remain intact.

Fable confirmed the corrected session/bootstrap/secrets boundary and CR-1→R6
reachability, then identified local Evidence/guard/status cleanup only:

- removed the dangling Vitest compatibility statement;
- removed deferred `SECURITY DEFINER` execution from R1F-P09;
- added the machine-readable pin manifest and guard;
- rejected the claim that `iam.session` is new: the accepted durable inventory
  already contains `iam: ... session ...`; the cookie shares the owner identity
  but is not the database object itself;
- bootstrap cannot re-arm through Product because no Account-delete operation is
  admitted and the exact `(issuer,subject)` mapping is durable;
- roadmap/headers advance only after this adjudication.

No selected package/version or material boundary was reopened. Fable stated a
third independent round was unnecessary after these punctual corrections.

```text
PASS 2 MATERIAL FINDINGS = 0
LOCAL CORRECTIONS = APPLIED
INDEPENDENT CONVERGENCE = CLEAR
PROBE AUTHORITY = 0
IMPLEMENTATION AUTHORITY = 0
```
