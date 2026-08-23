# 4C-F08 — Brain Discovery Project-context selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / REVISED P8 GREEN / OPERATOR RE-WALKTHROUGH REQUIRED`
> **Block:** `W-02A — Workspace Brain`
> **Selected alternative:** `C — explicit Project context selector inside Brain Discovery using PRJ-01`.
> **Authority posture:** frontend interaction realization only. No Product operation, Permission, owner, record or wire semantic changes.

## 1. Operator decision

The operator accepted the F08 Global-Maximum candidate after P9 proved that the previously approved P8 hid the exact Project subject required by `BRN-04 StartBrainDiscovery`.

Selected interaction:

```text
PRJ-01 ListProjects
→ already-disclosed ProjectSummary[]
→ human explicitly recognizes/selects one Project by name
→ selected projectId = FORM_DRAFT / untrusted reference
→ BRN-04 StartBrainDiscovery { projectId }
→ Brain resolves admitted source / Connection context server-side
```

## 2. Exact revised P8 contract

The Discovery region contains one labeled Project-context control before `Run discovery`.

Fixture options are shaped only from accepted `ProjectSummary` truth:

```text
projectId
workspaceId
name
archived
```

Interaction laws:

```text
no selected Project → Run discovery disabled
explicit selection → selected projectId held only as FORM_DRAFT
Run discovery → fixture BRN-04 interaction uses that exact selected projectId
changing Project context → old Discovery result is discarded from fixture UI
archived = truthful visible status, not client-side eligibility policy
source / Connection / credential selection = never frontend authority
```

The helper text makes the ownership boundary visible before action: choosing a Project chooses context only; Brain/server authority resolves the already-admitted source/Connection context.

## 3. Preserved P8 authority

F08 revises only the Discovery entry/context region. It does not reopen:

```text
Knowledge → Domain → Concept
F07 structured source-bound browse
Discovery hypotheses / provenance
explicit humanResolution
KnowledgeProposal review
APPROVE | REJECT
approval != publication
Revisions
Health overlay
GF-01 / W-01
```

## 4. Client-state law

```text
PRJ-01 disclosed Project summaries = SERVER
selected projectId before submit    = FORM_DRAFT
BRN-04 result                        = SERVER
source/Connection context            = server-resolved authority
```

No `localStorage`, `sessionStorage`, persisted hidden default or previous-route Project becomes Discovery authority.

## 5. RED → GREEN proof

Historical selected RED marker preserved:

```text
OPERATOR ACCEPTED / SELECTED REALIZATION / P8 REVISION RED
Verify #631 = EXPECTED RED
→ 70 tests / 69 pass / 1 fail
→ only missing explicit Discovery Project control
```

Revised P8:

```text
docs/evidence/4c/w02a-brain-functional-wireframe.html
blob = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e
Verify #633 = SUCCESS
```

The revised artifact proves the selected interaction mechanically. It does not create final operator lock by itself.

## 6. Remaining gate

```text
revised P8 GREEN
→ operator re-walkthrough / re-approval
→ rerun exact P9 trace
→ only then W-02A LOCK + P10 closure
```

The prior P8 approval remains valid for preserved regions; the revised Discovery context requires explicit operator re-approval before final lock.