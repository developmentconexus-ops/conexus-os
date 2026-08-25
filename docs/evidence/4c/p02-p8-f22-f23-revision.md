# P-02 P8 — F22 + F23 functional revision

> **Status:** `FUNCTIONAL LOW-FI CANDIDATE / WALKTHROUGH REQUIRED / NOT LOCKED`
> **Scope:** exact current P-02 `Data / Capabilities / Integrations / Brain` functional walkthrough Evidence after F22 + F23.
> **Product implementation authority:** none.

## Product model proved by this P8

```text
Data         = facts / real authorized data
Brain        = enterprise meaning adopted/available in this exact Project
Capabilities = human-readable Product behavior contracts
Integrations = external systems/resources used through governed bindings
```

The four routes remain distinct human jobs inside one Project. A generic `Resources` hub and a backend-owner/revision/binding console remain rejected. Cross-route relationships require exact server-owned coordinates; the browser does not infer semantic relationships.

## Functional scope

### Data

F22 remains the physical read-only explorer: source tree, multiple object tabs, Data default, Structure/Relationships/Rules, bounded filter/sort/column visibility, paging and Row Inspector. Semantic `PRJ-18/19` meaning stays complementary. Analyze remains `BRN-13 → BRN-12`, never SQL.

### Brain

F23 changes the default Project Brain experience materially:

```text
BRN-14 Project Brain Context = primary
→ adopted/available Domains + Concepts
→ definitions / business rules / caveats / evidence requirements / provenance

PRJ-10/11/12 binding administration = secondary
Workspace Brain governance = separate W-02A boundary
```

Project Brain Context is neither the whole Workspace Brain nor a runtime effective Brain slice. No runtime ToolProjection, publication/review/proposal command or browser-derived applicability is represented.

### Capabilities

Human name/purpose and logical Inputs/Outputs come first. Technical operation identity is inspectable secondarily. Inspection does not imply a generic Run/Execute grant.

### Integrations

Systems used by the Project and current bindings are primary. Project-private Connection lifecycle is a secondary contained region; Workspace/shared Connection lifecycle remains W-02B.

## TDD proof

RED changed only the current P8 proof contract and made that contract part of `test:required`; the prior HTML was left untouched.

```text
RED HEAD    = a9c3d7a5ad7b51bf614f2061b92b18af7d1dfec1
Verify #999 = EXPECTED FAILURE
P8 tests    = 7 total / 2 pass / 5 fail
```

The five failures were exactly the missing F22+F23 product-model projection: F22+F23 identity, human-first Capability detail, system-use-first Integrations, BRN-14 Brain Context and Brain material-state distinctions. Existing Data behavior and JavaScript parse smoke remained green.

GREEN replaced the old F22-only walkthrough artifact with the current F22+F23 candidate.

```text
GREEN HEAD  = b59162c085194f882b3a289db6f49f5427e412ae
Verify #1000 = SUCCESS
P8 tests     = 7 / 7 PASS
HTML blob    = 7624694b86017c83deed661ee5ae17dc05495dc3
```

Verify #1000 also preserves the current authority stack:

```text
4A ↔ OAS              = 122 ↔ 122 / 0 missing / 0 extra / 0 duplicate
F22 focused proof     = PASS / 8 firing negative controls
Brain operations      = 13
F23 focused proof     = PASS / 3 firing negative controls
projection / Kubb     = PASS / 122 deterministic Product entries
wire topology         = 12 reachable YAML fragments / 0 dead
whole 4B adversarial  = PASS / 122
whole 4B executable   = PASS
Product implementation = BLOCKED
```

Known non-failing Redocly/bundler/Budget/technical-OIDC warnings remain unchanged.

## Gate

This Evidence proves a functional candidate, not product acceptance.

```text
P-02 = OPEN
P7 = OPERATOR APPROVED
F22 + F23 = RATIFIED
P8 = WALKTHROUGH REQUIRED / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Only explicit operator approval after walkthrough may LOCK this P8 and open P9/P10.
