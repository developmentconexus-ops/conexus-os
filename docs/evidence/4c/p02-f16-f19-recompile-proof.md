# P-02 F16–F19 bounded recompile proof

> **Status:** AUTHORITY RECOMPILE CLOSED / VERIFY #900 GREEN / P7 NEXT / P8 BLOCKED
> **Scope:** P-02 authority/wire recompile only. P8, P-03+, P11, 4D and Product implementation remain blocked.

## 1. Authority and proof boundary

The operator-approved selected correction is immutable in:

```text
docs/evidence/4c/p02-f16-f19-selected-correction-contract.md
selected spec commit = 95da831f43b51781a112bb8cf1f756fab0636f21
execution plan commit = ed6ce609da48d06bac0ffb61eb87bf178b0d9856
```

Current truth is intentionally not duplicated into every historical 4A/4B closure document. The current recompile is proved from the canonical mutable/current sources:

```text
docs/product/operation-ledger.md
+ docs/product/permission-contract.md
+ contracts/api/product/openapi.yaml and reachable owner fragments
+ executable wire checkers / generated projection proof
+ docs/roadmap.md
+ this bounded closure proof
```

Historical phase/evidence documents retain the counts and wording that were true at their original closure. This avoids temporal snapshot coupling while preserving audit history.

## 2. Exact TDD chronology

| Slice | RED | Hardened GREEN |
| --- | --- | --- |
| F16 — Data human identity | commit `00d7e2565e8a71fccdf684a2bb1d3e60d620b210`; Verify #883 = expected failure | commit `1d3a6ca9a4d439bc77661c187f2f9f22aa1dd864`; Verify #885 = SUCCESS |
| F17 — Project Connection binding disclosure | commit `13d28868b936a73390ddb4755e58853482a26ccf`; Verify #886 = expected failure | commit `39413dac07423373c4c136e9a2dde0a24c0e4ec7`; Verify #888 = SUCCESS |
| F18 — Project Brain binding disclosure | commit `b0c773f7c04a2ca20d833a542b3a37a94a0651ff`; Verify #889 = expected failure | commit `38f1c6b39d7152959e17e8c3b5662d677d3c76f1`; Verify #892 = SUCCESS |
| F19 — AnalyticQuery semantic-input catalog | commit `ad1ee2f2a0b9da5c047816110f7da780950f072c`; Verify #893 = expected failure | realization `0899d32255b713d6dfa14f52fe90d516b892f0ed`, integration/hardening through `10116204bbb3123998c131ea455fe64e83df282b`; Verify #897 = SUCCESS |

F19 hardening exposed and removed two non-semantic maintenance defects rather than hiding them:

```text
019530ecd1bb1982c4de210bec9099ac607396cc
→ removed stale temporal snapshot coupling from unrelated repository guards

cecd16c8feae308db7332c0080eb98b38e49fc69
→ aggregated BRN-13 into the canonical Product OpenAPI root

10116204bbb3123998c131ea455fe64e83df282b
→ removed Product-count snapshot coupling from Technical Ingress while preserving Product impact = 0
```

Verify #897 then completed the full repository + wire proof with no failures.

## 3. Whole-wire result

Verify #897 proves:

```text
fixed Product authority = 117
fixed Product OAS       = 117
4A ↔ OAS                = 117 ↔ 117
missing                  = 0
extra                    = 0
duplicate                = 0

Project = 23
Builder = 17
Brain = 12
Connections = 9
Identity & Access = 19
Observability & Audit = 5

ordinary Permissions = 25
semantic owners = unchanged
durable record classes = unchanged
Technical Ingress = 3
Technical Ingress Product-count impact = 0
Budget Analyzer operations = 2
Budget Product-count impact = 0
```

The real generated-projection/Kubb proof also reports 117 deterministic Product entries. Whole-4B adversarial proof passes at 117 and keeps Technical Ingress, Project grammar, generated authority and generic-executor negative controls separated.

## 4. Selected semantic result

```text
F16
→ PRJ-18/19 gain required server-owned nonblank human Data-resource name
→ dataResourceId remains machine identity
→ +0 operations

F17
→ ProjectConnectionBinding gains human Connection presentation
→ CON-03 gains exact-Project purpose-bound selection disclosure
→ project.manage + connection.use
→ connection.use -X-> generic connection.read
→ +0 operations

F18
→ BRN-02 gains exact-Project purpose-bound immutable revision selection
→ project.manage + brain.bind
→ brain.bind -X-> generic brain.read
→ +0 operations

F19
→ +1 operation: BRN-13 GetProjectAnalyticQueryCatalog
→ brain.read + project.data.read
→ exact current Project Brain binding + admitted semantic choices
→ no SQL / physical schema / generic semantic search / natural-language planner
```

## 5. Closure-gate RED

The whole-recompile closure guard was introduced alone at:

```text
commit = 8f27b32947c3373b42884bf7dbf14b8c1ec6dc1b
Verify #898 = EXPECTED RED
repository tests = 121
pass = 120
fail = 1
exact failure = current closure projection was not yet recorded
```

All pre-existing repository checks remained green in that RED. The failure therefore isolates the closure/status projection rather than Product or wire regression.

## 6. Closure GREEN / bootstrap / routing

The bounded closure projection and compact historical markers converge at:

```text
closure HEAD = 42cabd1e32e41c18a24565404220a2f08432dde1
Verify #900 = SUCCESS
repository tests = 121 / 121
bootstrap_bytes = 20245
bootstrap limit = 20480
4A ↔ OAS = 117 ↔ 117
Brain = 12
ordinary Permissions = 25
Technical Ingress Product-count impact = 0
generated Product projection entries = 117
Whole 4B executable/adversarial proof = PASS
```

The roadmap compaction preserves only the historical gate markers still consumed by regression guards instead of restoring the former status worklog. The closure therefore gains bootstrap margin while retaining the exact historical progression checks.

Next permitted work:

```text
P-02 = OPEN / AUTHORITY CLOSED
P7 = NEXT
P8 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```
