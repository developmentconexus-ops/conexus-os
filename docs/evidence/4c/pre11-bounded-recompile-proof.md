# 4C pre-P11 bounded recompile proof

> **Status:** `GREEN / 128↔128 / REPOSITORY 224↔224 / W-03 SHELL RE-LOCKED / P11 LOCKED`
> **Scope:** `4C-PRE11-F02..F05` + terminal P10/faithful-assembly gate
> **P11:** not assembled; faithful re-authoring authorized
> **Implementation:** blocked

## 1. Accepted corrections

```text
F02 coverage
→ current browser-facing set mapped bidirectionally
→ 127/127 after PAR-05 explicit no-direct-browser disposition

F03 trusted bootstrap
→ TRUSTED_BOOTSTRAP_CONTEXT
→ IAM-03 ordinary + bootstrap request variants
→ bootstrap subject server-derived
→ WS-01 initial creator access explicit

F04 exact effect investigation
→ GW-01 optional originatingRun deep-object filter
→ server-side before deterministic pagination

F05 build-safe reference discovery
→ PRJ-16/17 purpose-bound project.build
→ BRN-14 authoringRef + detailDisclosed
→ PRJ-29 Project-owned model-policy summaries
→ NEW optional unowned refs empty
→ EXISTING protected refs preserved
```

Current authority:

```text
N_platform  = 128
Project     = 28
Builder     = 20
Brain       = 13
Gateway     = 2
Permissions = 25
4A↔4B       = 128↔128
```

## 2. RED evidence

Before realization:

```text
F04 targeted tests = 0/3
F03/F05 tests      = 0/5
coverage test       = RED with PRJ-25..28, BLD-18..20, BRN-13/14 missing
```

The initial whole repository run after recompile correctly exposed 19 stale historical/current-status guards. They were corrected without weakening locked artifact hash checks or Product invariants.

## 3. GREEN evidence

Executed in WSL Ubuntu after loading the repository-pinned native Node through NVM:

```text
source /home/leandrotheodoro/.nvm/nvm.sh
node = v24.18.0

npm ci                  = GREEN
npm run verify          = GREEN
npm run test:repository = GREEN / 224 passed / 0 failed
```

Required verify proves:

- Product OpenAPI lint/bundle;
- project-operation schema;
- `128` operation bijection/carriers;
- Identity/Workspace, Project, Builder, Brain, Connections, Release, PAR, Gateway, MAR and OBS closures;
- Technical Ingress remains three protocol-only operations with Product-count impact zero;
- generated projection/no-parallel-DTO proof over `128` entries;
- Budget Analyzer proving-instance positive/negative truth controls;
- whole-4B adversarial proof over `128` operations.

Targeted proof:

```text
F03/F05 selected realization = 5/5 GREEN
F04 originatingRun           = 3/3 GREEN
faithful P11 gate            = 3/3 GREEN
candidate coverage           = 1/1 GREEN / bidirectional
```

The terminal approved delta identities are pinned by their Screen Contracts and final-lock test: T-01 `3955589...`, GF-01 `e83a0e8...`, P-01 `8ff34e1...`, P-03 `b462c3b...`. No new P11 HTML, Product implementation, framework, component, SDK or runtime selection was created during this closure.

## 4. Closed frontend gates

The bounded frontend gates required before P11 are now closed:

1. `T-01 Trusted setup / first access` completed P6–P10 and operator LOCK;
2. GF-01 Account-menu/EndSession was operated and re-locked;
3. P-01 Agent Studio consumes PRJ-16/17, BRN-14 and PRJ-29, preserves protected refs and is re-locked;
4. P-03 reference presentation is re-locked;
5. terminal P10 is reconciled against the exact blobs;
6. the faithful assembly contract authorizes only a new, preservation-bound P11.

P12, 4D, merge and Product implementation remain unauthorized.
