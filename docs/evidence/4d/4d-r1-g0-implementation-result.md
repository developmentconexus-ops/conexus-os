# 4D(R1) — G0 implementation result

> **Status:** `CLOSED / PASS / AWAITING SEPARATE S1 GRANT`
> **Boundary:** `G0 — admitted root/profile/wire`
> **Product operations realized:** `0`
> **Projected operation census:** `13↔13`

## 1. Admitted result

The operator grant opened only G0. The implementation materializes the exact
Foundation runtime/package pins used by this boundary, a strict profile and
input admission port, deterministic compiler, three-class ownership manifest,
digest-bound generation plan, receipt-last admission and non-admitting attempt
Evidence.

The admitted production scaffold contains:

- two `GENERATED` R1 wire projections with exactly `IAM-01..03`, `WS-01/02`
  and `PRJ-01/02/03/07/08/09/23/24`;
- one `PLATFORM-CONTRACT` sealed-validator/ingress-separation contract;
- an exact empty production `APP-OWNED` seed;
- no Product table, listener, route implementation, provider, Git substrate,
  Mastra dependency or later-tranche runtime.

Canonical sources remain the 4B OpenAPI owners. The projection records their
exact digests and owns no Product meaning.

## 2. Admission and recovery law proved

Raw input refuses malformed UTF-8, BOM, duplicate keys, comments, trailing
commas, lone surrogates, unsafe integers, floats and schema violations before
canonicalization. RFC 8785 bytes and SHA-256 identities are independently
reproduced.

Generation normalizes NFC/path/class/source/output identities, refuses path or
case collisions, symlinks, protected drift, unsafe class transition, protected
removal and APP overwrite. One exclusive writer lock is used; a competing
writer's lock is never removed.

Before the first output mutation, the exact canonical plan is persisted under
the internal compiler boundary. The receipt is replaced only after every final
byte is re-censused. If an apply stops between files, the prior admitted receipt
remains active. A retry may resume only the identical pending plan and only when
every affected path is still exactly its authenticated before or after digest;
foreign bytes fire `PENDING_PLAN_DIVERGED`. Successful admission removes the
pending plan. An identical completed rerun performs zero writes and preserves
the receipt digest.

## 3. Exact subjects

```text
profileDigest  = 04541fd4ff23123a0795afbcfd88d6a7af74c40164cd441d90912e869f750994
inputDigest    = 0bf21b19d57fb9a7ec9fd2b079e8cd76b9d99513f8abf5357e63a6e8ce6223fc
wireDigest     = 9838085a99a5a649ddb1226eec6e1dfbf12b64380f25f1ea9b49899af386005e
manifestDigest = f8371085edf10bd61d7b759aea62b56b80ff9268bed0ea36b858d2a0ec1f25f1
treeDigest     = c674689a0746f77667e605969315f2f16f55c23366fa8afae412dbe477a12a7f
admissionPlan  = 8e699ba854d00152c83379393e76ef21fcf1b461a8cba4478668e2414892e6e1
receiptDigest  = be9227c82de4aa1b603626c0beeef1221f6ae7781c07e42a67965df627bf3289
no-op writes   = 0
```

The no-op plan has a different digest because it truthfully binds the admitted
tree as its expected prior census; it reuses the exact receipt above and does
not constitute a second admission.

## 4. Qualification and falsifiers

Deciding qualification ran in `node:24.20.0-bookworm`, Linux x64, with Node
`24.20.0` and npm `12.0.2`. The repository was mounted read-only and dependency
state was isolated in a container volume.

```text
npm ci                         = PASS / 0 vulnerabilities
npm run r1:g0:verify           = PASS / 12 of 12
npm run verify                 = PASS
two clean generation subjects  = byte/tree/receipt identical
completed no-op regeneration   = PASS / writes 0
foreign partial-retry bytes    = RED / PENDING_PLAN_DIVERGED
secret-pattern census          = CLEAR
git diff --check               = PASS (line-ending notices only)
```

The 12 targeted cases cover `R1C-01..05`, applicable `R1C-09..12` and
`SCF-01..06/09..11`: exact manifest/lock integrities; strict admission;
canonical identity; exact `13↔13` and source pins; ownership/path constraints;
clean reproduction; no-op stability; writer exclusion; protected drift and
APP preservation; receipt-last failure Evidence; exact partial-plan recovery;
the foreign-byte negative control; and the crash window between receipt
publication and pending-plan cleanup.

The root gates use the admitted local Ajv adapter for Project declaration and
Budget Analyzer fixture validation. Historical implementation-status guards
were removed; the objective workflow `contents: write` denial remains.

## 5. Completion and next boundary

```text
G0 = CLOSED / PASS
S1 = BLOCKED / REQUIRES SEPARATE OPERATOR GRANT
R1C-14 = STILL REQUIRED IMMEDIATELY BEFORE S3
R1C-13 = STILL REQUIRED IMMEDIATELY BEFORE S6
REAL PROVIDER CALL = UNAUTHORIZED
PUSH / PR / MERGE = UNAUTHORIZED
```

No G0 result grants S1. Any digest mismatch, non-firing control, added operation,
parallel wire authority or owner contradiction reopens the smallest affected
G0 owner.
