# P-02 P8 — F22 + F23 functional revision

> **Status:** `LOCKED / OPERATOR APPROVED`
> **Scope:** exact operator-approved P-02 `Data / Capabilities / Integrations / Brain` functional P8 after F22 + F23 and the bounded operator coherence + usability corrections to Integrations.
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

Systems currently used by the Project are primary. Each used system is operable: the human can open its Project-use detail, recognize the exact bound revision/environment, stop using it, and—when independently authorized—inspect the owning Connection. `Use connection` may add exact Project use of an eligible disclosed Connection; `Stop using` may remove an exact current use. The P8 does **not** model a generic replacement/switch relationship between unrelated Connections because current Product authority defines no integration role/slot that would make such replacement semantically meaningful.

The fixture projects only accepted `ProjectConnectionBinding` presentation truth (`connectionId`, `connectionName`, `connectionRevisionId`, `environment`) and does not manufacture a binding `purpose`. Project-private Connection lifecycle remains a secondary contained region, reusing the locked W-02B lifecycle grammar for browse/detail/configuration/access/test/create. Workspace/shared Connection lifecycle remains owned by W-02B even when its independently authorized detail is reachable contextually from a Project use.

## Original F22 + F23 P8 proof

RED changed only the current P8 proof contract and made that contract part of `test:required`; the prior HTML was left untouched.

```text
RED HEAD     = a9c3d7a5ad7b51bf614f2061b92b18af7d1dfec1
Verify #999  = EXPECTED FAILURE
P8 tests     = 7 total / 2 pass / 5 fail
```

The five failures were exactly the missing F22+F23 product-model projection: F22+F23 identity, human-first Capability detail, system-use-first Integrations, BRN-14 Brain Context and Brain material-state distinctions. Existing Data behavior and JavaScript parse smoke remained green.

The first F22+F23 candidate then went green:

```text
GREEN HEAD   = b59162c085194f882b3a289db6f49f5427e412ae
Verify #1000 = SUCCESS
P8 tests     = 7 / 7 PASS
HTML blob    = 7624694b86017c83deed661ee5ae17dc05495dc3
```

## Operator coherence correction — Integrations

The subsequent operator walkthrough did **not** LOCK that candidate. Global-coherence review found that its Integrations interaction had projected backend `SetProjectConnectionBinding` mechanics into a human `Switch connection` flow without an accepted Product subject describing what role was being replaced. The fixture also carried a `purpose` field absent from the accepted `ProjectConnectionBinding` wire.

The bounded decision was:

```text
P7 four-lens structure        = PRESERVE
F22 Data                       = PRESERVE
F23 Brain                      = PRESERVE
Capabilities                   = UNAFFECTED
Integrations ownership model  = PRESERVE
Switch/replacement semantics  = REMOVE
invented binding purpose      = REMOVE
4A / 4B                       = NO REOPEN
```

TDD correction proof:

```text
RED HEAD      = 559e00260dbafd582d173ac61e34b16df605a3bf
Verify #1010  = EXPECTED FAILURE
P8 tests      = 7 total / 6 pass / 1 fail
exact failure = replacement semantics still present in Integrations
JS parse      = PASS

GREEN commit  = 58963af84d343f26d32565f14746d2416c9c47d2
HTML blob     = bc1898682a459e532b9efaf6e549073d3ce591f3
P8 tests      = 7 / 7 PASS
npm ci        = PASS
npm run verify = PASS
```

The GREEN publisher changed only the P8 HTML after the RED test. Its transient workflow was then removed from the branch; it is not part of the durable candidate.

The correction adds no Product operation, Permission, owner, trust boundary, durable record, integration-role ontology or new wire field. If later operator/user Evidence proves a real job such as “replace the system that fulfills role X,” that missing `X` must be adjudicated at the smallest owning Product authority rather than invented by frontend fixtures.

## Operator usability correction — operable Connection lifecycle

The next operator walkthrough found a different, surviving falsifier: Integrations showed used systems and two Project-owned Connections, but those records were effectively static. A human could neither open details nor configure/test a Project-owned Connection, and no action explained how a new Project-owned Connection was created. The secondary lifecycle region required by approved P7 existed as a label, not as a functional P8 interaction.

This is a **local P8 projection failure**, not a missing Product/API authority:

| Human job | Accepted owner operation | Permission boundary |
|---|---|---|
| See exact Project use | `PRJ-13 ListProjectConnectionBindings` | `project.read` |
| Add/change/remove exact Project use | `PRJ-14 SetProjectConnectionBinding`, `PRJ-15 RemoveProjectConnectionBinding` | `project.manage + connection.use` |
| Discover eligible choices | purpose-bound `CON-03 ListConnections` | `project.manage + connection.use` |
| Inspect Connection detail | `CON-04 GetConnection` | `connection.read` |
| Create a private Project Connection | `CON-05 CreateConnection`, owner scope `PROJECT` | `connection.manage` |
| Save non-secret configuration as a new revision | `CON-06 ReviseConnection` | `connection.manage` |
| Replace a write-only credential | `CON-07 SetConnectionCredential` | `connection.manage` |
| Test exact revision/environment and inspect evidence | `CON-08 QualifyConnection`, `CON-09 GetConnectionQualification` | `connection.qualify` / `connection.read` |

The Global-Maximum choice is bounded by four separations:

```text
ProjectConnectionBinding != Connection
connection.use != connection.read != connection.manage != connection.qualify
Connection revision != Project binding revision
configured != qualified != bound != healthy
```

Therefore the revised P8 now proves:

1. `Systems used by this Project` remains primary, and each item has `Open details` plus the separate `Stop using` action.
2. A contextual Connection panel discloses configuration, credential state and test evidence only when the caller has the corresponding independent permission. The Slack fixture proves that `connection.use` does not grant generic `connection.read`.
3. `Connections owned by this Project` is visible without a disclosure toggle and provides `New connection`, `Open details` and `Test connection`.
4. Creation fixes owner scope to this exact Project, collects only name/connector/non-secret configuration, then continues to the locked detail lifecycle for write-only credentials and qualification.
5. Saving configuration creates a new immutable current Connection revision and requires retest. It never silently moves an existing Project binding.
6. After the exact current revision/environment passes, the human may explicitly make the Project use it or explicitly move an existing same-Connection binding to it.

Rejected alternatives remain:

- redirect every private-Connection job to a detached Workspace Connections page;
- disclose full configuration merely because the caller can use a Connection;
- automatically bind a newly created or revised Connection;
- restore generic switch/replacement semantics or invent binding purpose/role.

Focused TDD proof:

```text
RED  = 7 total / 5 pass / 2 fail
       missing CON-04..09 lifecycle projection
       missing Integrations permission/material-state harness
GREEN = 7 / 7 PASS
inline JavaScript parse = PASS
```

Browser walkthrough proof exercised the actual self-contained artifact:

```text
used Workspace Connection
→ open detail
→ inspect exact bound revision vs newer tested current revision
→ explicitly adopt newer tested revision

detail denied
→ retain recognizable Project-use truth
→ withhold configuration/access/test evidence

new Project-owned Connection
→ create in exact Project scope
→ inspect non-secret configuration
→ save new revision
→ set write-only credential
→ qualify exact revision/environment
→ explicitly use it in the Project
```

No Product operation, wire field, Permission, owner, integration role or production implementation authority was added. The correction reuses `PRJ-13..15`, `CON-03..09`, the accepted permission algebra and the locked W-02B lifecycle grammar.

The current candidate still preserves the accepted authority stack:

```text
4A ↔ OAS               = 122 ↔ 122 / 0 missing / 0 extra / 0 duplicate
F22 focused proof      = PASS / 8 firing negative controls
Brain operations       = 13
F23 focused proof      = PASS / 3 firing negative controls
projection / Kubb      = PASS / 122 deterministic Product entries
wire topology          = 12 reachable YAML fragments / 0 dead
whole 4B adversarial   = PASS / 122
whole 4B executable    = PASS
Product implementation = BLOCKED
```

Known non-failing Redocly/bundler/Budget/technical-OIDC warnings remain unchanged.

## Operator lock and downstream closure

The operator explicitly approved the corrected functional P8 after the Integrations usability walkthrough. The approved artifact is pinned and traced in [`p02-project-product-surfaces-screen-contract.md`](p02-project-product-surfaces-screen-contract.md).

```text
P-02 = LOCKED / OPERATOR APPROVED
P7 = OPERATOR APPROVED
F22 + F23 = RATIFIED
P8 = LOCKED
P9/P10 = CLOSED
P-03 = NEXT / NOT OPEN
P11 = LATER ASSEMBLED PRODUCT
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Only a later material falsifier may reopen the smallest affected P-02 owner or route. This lock does not authorize P-03 opening, P11 assembly, 4D, merge or Product implementation.
