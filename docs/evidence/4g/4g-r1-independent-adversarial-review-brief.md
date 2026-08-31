# 4G(R1) — Independent adversarial implementation-readiness brief

> **Status:** `NEUTRAL REVIEW INPUT / NOT AUTHORITY`
> **Implementation authority:** `0`

## 1. Revalidated repository subject

```text
repository = Conexus OS
branch = codex/4c-p02-integrations-ux
HEAD = 1eb096f6748c4bca45f096ac678e1a0902bab0c6
origin/main = 1619f14d9caed172b6cada9430e6b49ff77a4316
divergence = 0 behind / 2 ahead
open PR = none
main Verify = green
```

Reconstruct authority from the repository. Do not trust this brief, chat or
handoff as authority.

## 2. Current gate

```text
4E(R1) = CLOSED / OPERATOR APPROVED / 13↔13
4F(R1) = CLOSED / OPERATOR APPROVED / GLOBAL MAXIMUM
4G(R1) = OPEN / ADVERSARIAL READINESS ONLY
Product implementation/install/provider/push/PR/merge = BLOCKED
```

The deciding subject is
[`4F(R1) approved execution graph`](../4f/4f-r1-implementation-slice-plan.md)
plus its [independent adjudication](../4f/4f-r1-independent-global-review-adjudication.md).
Use `docs/index.md` to load only the exact 4D/4E owner implicated by a finding.

## 3. Review objective

Assume a capable implementation team begins tomorrow. Try to prove that the
approved plan still forces them to invent Product meaning, authority, recovery,
storage, process, dependency or acceptance semantics; or that its named proof
could pass while the intended property is false.

Challenge every required 4G class:

```text
orphan operation or consumer
missing/broad Permission or scope
duplicate owner or persistence class
screen-shaped/parallel wire authority
generic executor/SDK/helper escape
mechanism/dependency without consumer/property
scaffold ownership ambiguity or silent class bypass
unowned partial failure/restart/concurrency/migration state
unfalsifiable flow or non-firing negative control
stale PASS/dependency closure escape
R1 ordering or later-tranche leak
slice not bound to exact Paved Road
Phase-3 falsifier no longer reachable
credential/network/provider/telemetry leakage
operator checkpoint that cannot be honestly exercised
stop/completion condition that admits partial success
```

Also attack the hardest concrete seams:

1. `WS-01` command-role/function transaction and replay;
2. `PRJ-03` receipt → Git staging/promotion → DB settlement → cleanup;
3. EXISTING_GIT HTTPS admission, redirects, credentials and default ref;
4. `S4` test-only candidate injection versus production composition;
5. per-slice Chromium and `S5` three-browser cadence;
6. R1C-14 and R1C-13 locality, pin/probe authority and zero egress;
7. final subject/dependency digest validity and complete `13/13` journey.

Do not demand implementation detail that is safely mechanical (local names,
private function decomposition) unless different choices would change an
accepted invariant or make proof ambiguous.

## 4. Required output

For each finding provide:

```text
ID
classification = METHOD | PRODUCT/PLAN GAP | LOCAL EXECUTION GAP | NO FINDING
materiality = MATERIAL | NON-MATERIAL
exact authority/evidence
counterexample or false-green path
smallest owning correction
stop/reopen target
```

Finish with:

```text
4G_VERDICT = CLEAR | REVISE | STOP
IMPLEMENTATION_READY_FOR_OPERATOR_GRANT = YES | NO
MATERIAL_UNCORRECTED_FINDINGS = <integer>
STRONGEST_COUNTERARGUMENT = <one paragraph>
```

Reviewer output is Evidence, not authority. Do not edit files, install, call
providers, execute Product effects, push or open a PR.
