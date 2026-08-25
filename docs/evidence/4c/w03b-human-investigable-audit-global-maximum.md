# 4C-F12 — Human-investigable immutable Audit Global Maximum

> **Status:** `GLOBAL MAXIMUM / OPERATOR ACCEPTED`
> **Block:** `W-03B — Audit`
> **Finding:** `w03b-human-investigable-audit-finding.md`

## Decision problem

Make immutable Audit honestly searchable and human-readable without introducing a new Event/Search owner or allowing browser-local presentation to rewrite Evidence.

## Credible alternatives

### A — browser-local filters over loaded audit page
**REJECT.** Pagination makes the displayed search universe incomplete and misleading.

### B — current Account/Project/Area lookup at render time only
**REJECT AS HISTORICAL PRESENTATION.** Current labels can change and silently rewrite the apparent historical fact.

### C — generic event/search domain or event-sourcing framework
**REJECT / OVERENGINEERING.** OBS already owns the exact immutable audit read and record.

### D — add new SearchAudit Product operation
**REJECT.** Search/filter is a query shape of existing `OBS-04`, not an independent Product meaning.

### E — enrich OBS-04/05 with server-side filters + immutable presentation snapshots
**SELECTED GLOBAL MAXIMUM / OPERATOR ACCEPTED.**

```text
OBS-04 ListAuditRecords
→ from?
→ to?
→ actorQuery?
→ actionQuery?
→ projectId?
→ pageToken?
→ OBS applies filters before pagination

AuditRecordSummary / AuditRecord
→ exact auditRecordId
→ actor = immutable kind + ref + label snapshot
→ subject = immutable kind + ref + label snapshot
→ action
→ occurredAt
→ deterministic nonblank human summary
→ exact Evidence remains on detail
```

Use an audit-specific presentation snapshot schema rather than widening generic `OwnerSubjectRef` used by other observability projections.

## Protected laws

```text
kind/ref = exact machine/provenance subject
label = immutable append-time human Evidence snapshot
summary = deterministic OBS presentation
label/summary != authorization
current owner name != historical audit presentation authority
filtering before pagination
loaded browser page != search universe
```

No new Product operation, Permission, semantic owner, durable record class, generic Event domain, retry/undo mutation, or current-state authority is admitted.

## Topology result

F12 adds zero operations. After F11+F12 the fixed Product topology remains `N_platform=116`, Permissions=25, records=46, owners=13.