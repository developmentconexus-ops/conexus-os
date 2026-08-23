# 4C-F08 — Brain Discovery Project-context selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / P8 REVISION RED`
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

The Discovery region must contain one labeled Project-context control before `Run discovery`.

Fixture options must be shaped only from accepted `ProjectSummary` truth:

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
archived = truthful visible status, not client-side eligibility policy
source / Connection / credential selection = never frontend authority
```

The helper text must make the ownership boundary understandable before action: choosing a Project chooses context only; Brain/server authority resolves the already-admitted source/Connection context.

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

No `localStorage`, `sessionStorage`, persisted hidden default or previous-route Project may become Discovery authority.

## 5. Proof sequence

```text
operator accepts candidate C
→ selected-realization test expects explicit Project context
→ RED while current P8 lacks that control
→ revise only Discovery entry/context
→ GREEN
→ operator re-walkthrough / re-approval
→ only then final W-02A LOCK + P9/P10 closure
```

The previous P8 approval remains valid as direction but is not yet a final lock.