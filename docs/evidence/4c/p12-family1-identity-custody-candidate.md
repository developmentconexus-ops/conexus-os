# P12 — Family 1 integrated identity custody candidate

> **Status:** `LOCKED / OPERATOR APPROVED / BROWSER GREEN / P9-P10 CONSOLIDATED`
> **Family:** `A/B/C — T-01 → GF-01 → W-01 → P-01 → honest P-04 boundary`
> **Parent decision:** [`P12 integrated scenario edge matrix`](p12-integrated-scenario-edge-matrix.md)
> **Operator lock:** 2026-08-28
> **P11 consequence:** historical P11 blob remains preserved but its current-input assembly stays invalidated until all implicated families re-lock and P11 is reassembled
> **Product / 4A / 4B impact:** none

## 1. Preserved approved baselines

```text
T-01 approved = 3955589bfd983923b74a4cd72f6ef13f2b9867e7
GF-01 approved Account/session delta = e83a0e8c9e64ee47d28a58d267f5fb1169b41ed3
W-01 approved = 3d1d475d3ca7ce06ea549da12152cd386ab170a2
P-01 approved PRE11-F05 delta = 8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec
```

These remain preserved as the prior approved baselines.

## 2. Operator-approved Family 1 identities

```text
T-01 = 4da586d8a421bb03413bc82ee5b2e82432d6f620
GF-01 = 603b47ccaba1fe6557e557b48efa4f40207d3724
W-01 = d466d66a125605471f2f879bbe376e4de7681d95
P-01 = e5782b3f9e828a5c247b405821589d52039cc179
```

## 3. Realized edge custody

### A — T-01 → GF-01 → W-01

```text
T-01 normal re-entry + WS-01 success
→ acct-leandro / ws-metal-nobre / initialAccessEstablished=true
→ owner-issued T-01_TO_GF-01 egress
→ GF-01 IAM-01/WS-02 fixture re-resolution
→ READY only for exact Account/Workspace
→ GF-01_TO_W-01 Projects egress
→ W-01 owner-resolved Workspace collection
```

Invalid, 401, 403, 404 and dependency states do not render a false GF-01 Ready shell. W-01 missing/unknown/denied/dependency Workspace ingress does not render the default Project collection.

### B — W-01 → P-01

```text
W-01 exact PRJ-09 success
→ ws-metal-nobre / prj-sales-ops / exact current candidate digest
→ owner-issued W-01_TO_P-01 egress
→ P-01 Project/candidate re-resolution
→ no Change created by navigation
```

The deterministic candidate family includes the base candidate and the two existing W-01 refinement outputs. Arbitrary URL digests remain stale and cannot create work.

### C — P-01 → P-04 boundary

```text
Build instruction
→ chg:fixture
→ candidate READY + VERIFIED
→ owner-issued Project/Change/Plan/Finding/Evidence coordinates
→ honest P-04 boundary
→ no Release identity inferred
```

## 4. Browser Evidence

Localhost walkthrough proved:

```text
GF invalid Workspace → CONTEXT_NOT_FOUND / shell hidden / retry visible
GF exact ingress → shell visible / Metal Nobre / acct-leandro / ws-metal-nobre egress
W-01 invalid Workspace → WORKSPACE_UNKNOWN / collection hidden
W-01 exact Workspace → WORKSPACE_READY / collection visible
W-01 base approval → cand_7f2c9e1a owner egress
W-01 refined approval → cand_7f2c9e1b owner egress
P-01 arbitrary candidate → CANDIDATE_STALE / no active Change
P-01 exact refined candidate → PROJECT_READY / no active Change on navigation
Build instruction → chg:fixture
candidate advance → READY + VERIFIED
boundary → Project/Change/Plan/Finding/Evidence exact; Release absent
T-01 Account → sealed bootstrap → normal re-entry → Workspace
→ acct-leandro / ws-metal-nobre / initialAccessEstablished=true
→ egress state EMITTED only after Continue to Projects
```

## 5. Authority and scope negatives

- no new Product operation, Permission, semantic owner or wire field;
- URL identity remains untrusted navigation input;
- child fixtures re-resolve rather than authorize locally;
- no browser persistence or network call;
- no parent-owned business identity registry;
- egress messages are same-origin and use explicit edge envelopes;
- P-01 Change does not infer Release;
- no P11, 4D, SDK, framework, runtime, Budget Analyzer UI or Product implementation work.

## 6. Current gate

The operator exercised the four candidates and explicitly locked Family 1.

```text
Family 1 = LOCKED / OPERATOR APPROVED
historical P11 = preserved exact blob
current P11 assembly = INVALIDATED / NOT CURRENT
Family 2 = NEXT / AUTHORIZED BY APPROVED EDGE MATRIX
Family 3+ HTML = LOCKED / NOT AUTHORIZED
```
