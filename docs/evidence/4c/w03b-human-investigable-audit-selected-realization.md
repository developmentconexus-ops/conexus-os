# 4C-F12 — Human-investigable immutable Audit selected realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED`
> **Block:** `W-03B — Audit`
> **Selected alternative:** `E — enrich OBS-04/05 with server-side filters + immutable presentation snapshots`.
> **Authority posture:** bounded 4A→4B contract recompile only; no Product implementation authority.

## Selected semantic realization

`OBS-04 ListAuditRecords` remains the one audit collection read and gains bounded optional filters:

```text
from
to
actorQuery
actionQuery
projectId
pageToken
```

OBS applies the admitted filters to the disclosable Workspace audit set **before pagination**. Browser-local filtering never defines the search universe.

Audit actor and subject use an audit-specific immutable presentation snapshot:

```text
AuditSubjectSnapshotRef
→ kind
→ ref
→ label
```

`label` is captured as append-time human presentation Evidence. Exact `kind/ref` remains machine/provenance identity; label is never authorization.

`AuditRecordSummary` and exact `AuditRecord` gain deterministic nonblank human-readable `summary` owned by OBS. Exact detail retains `evidenceRefs`.

## Required preservation

```text
F12 new Product operations = 0
OBS operations = 5
Permissions = 25
records = 46
owners = 13
```

After F11+F12:

```text
N_platform = 116
IAM = 19
```

Forbidden:

```text
browser page as search universe
current resource lookup as historical label authority
frontend parsing action/ref codes into semantic meaning
new SearchAudit operation
generic Event/search owner
audit mutation/retry/undo authority
```

## Proof sequence

```text
selected-realization test
→ EXPECTED RED against current OBS wire
→ bounded 4A audit semantic clarification
→ bounded 4B OBS OAS/checker recompile
→ whole-wire GREEN
→ W-03 P7 recompile
```

This selection does not authorize W-03 P8.