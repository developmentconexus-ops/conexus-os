# 4C W-03 — People/access + audit authority-feasibility preflight

> **Status:** `W-03 OPEN / P6 COMPLETE / F11+F12 RECOMPILED GREEN / P7 CANDIDATE / OPERATOR ADJUDICATION / P8 BLOCKED`
> **Split:** `W-03A — People & access` + `W-03B — Audit`
> **Method:** Frontend Product Experience Planning Method v2.2 + DevelopmentConexus Engineering Method.
> **Implementation authority:** none.

## 1. Why W-03 splits

```text
W-03A People & access
= inspect + mutate current authorization facts
= workspace.access.manage

W-03B Audit
= investigate immutable historical Evidence
= audit.read
```

The two jobs share governance context but not semantic owner behavior. They must not be collapsed into one generic administration owner or screen-shaped backend.

## 2. P6 reference result

Mature access-management products make people human-recognizable, make group-derived versus direct access understandable, and let administrators inspect current access before changing it. Mature audit products provide server-side investigation filters over the audited set and immutable detail rather than filtering only a browser page.

References are Evidence only; Conexus Product authority remains repository-owned.

## 3. P7 authority findings

### F11 — human-reviewable access administration

The pre-correction wire had writes for Workspace membership, Area membership, direct Account→Project grants and Area→Project grants, but read/presentation authority was insufficient for a human to review the exact subject and current effective access safely.

Material defects proved by the finding:

```text
IAM-04 member presentation = opaque accountId only
WS-04 Area presentation = opaque areaId only
WS-05 cannot establish Area human identity
no human candidate lookup for IAM-05
no exact current member-access projection with access sources
no exact Area access projection with members + Project grants
```

### F12 — human-investigable immutable Audit

The pre-correction `OBS-04/05` owned the correct immutable audit surface, but list filtering and presentation were insufficient for honest investigation:

```text
OBS-04 filters = projectId? + pageToken? only
browser-local filtering -X-> whole audit search
actor/subject kind+ref alone = machine-readable, not human-reviewable
current resource names -X-> historical presentation rewrite
```

## 4. Operator-approved Global-Maximum direction

```text
F11
→ preserve I&A / Workspace / Project owners
→ Account human presentation on iam.account
→ Area.name on Workspace Area
→ add only three real I&A reads: IAM-18 / IAM-19 / IAM-20
→ I&A derives effective Project access + exact DIRECT|AREA sources
→ narrow access-administration disclosure on existing WS-04 / PRJ-01
→ no generic RBAC, no Keycloak authorization mirror, no grant CRUD API

F12
→ preserve OBS owner and OBS-04/05
→ server-side period/actor/action/Project filtering before pagination
→ immutable audit actor/subject presentation snapshots
→ deterministic human-readable audit summary
→ no new Audit operation/domain/Permission/record
```

Current topology after F11/F12:

```text
fixed Product operations = 116
canonical fixed Product wire = 116 ↔ 116
IAM operations = 19
ordinary Permissions = 25
durable record classes = 46
semantic owners = 13
Project operations = 23
Brain operations = 11
Connections operations = 9
OBS operations = 5
Technical Ingress = 3 / Product impact 0
```

## 5. Recompile proof

```text
selected-realization RED
→ Verify #715 / expected F11+F12 failures only

bounded 4A + 4B recompile
→ AccountSummary / AreaSummary
→ IAM-18 / IAM-19 / IAM-20
→ effective DIRECT|AREA source truth
→ OBS-04 server filters before pagination
→ AuditSubjectSnapshotRef + deterministic summary

whole-wire GREEN
→ Verify #737 = SUCCESS
→ 116 ↔ 116 schema-closed
→ Technical Ingress remains 3 / Product impact 0
→ generated projection/Kubb GREEN
→ Budget proof GREEN
→ whole-4B adversarial GREEN

P7 structural RED
→ Verify #738 / 87 tests / 86 pass / 1 expected failure
→ missing W-03 structural record only

P7 structural candidate
→ Verify #739 = SUCCESS
```

F11/F12 therefore no longer block P7. No new Permission, semantic owner, trust boundary or durable record class was introduced.

## 6. Current gate

The recompiled P7 candidate is owned by [W-03 structural hypotheses](w03-structural-hypotheses.md).

```text
Hypothesis A = LEADING CANDIDATE
W-03 = NOT LOCKED
P8 BLOCKED
exact next decision = APPROVE | REVISE P7 structure
```

Only explicit operator approval of the P7 structure may authorize creation of a functional low-fidelity P8 candidate. That approval would not itself LOCK W-03; the exact P8 must later be operated and explicitly adjudicated.

W-04/P-01+, P11, 4D, merge and Product implementation remain blocked.
