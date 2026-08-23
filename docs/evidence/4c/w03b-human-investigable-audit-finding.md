# 4C-F12 — Human-investigable immutable Audit finding

> **Status:** `F12 = OPEN / MATERIAL W-03B P7 FINDING`
> **Block:** `W-03B — Audit`
> **Authority posture:** finding only; no Product implementation authority.

## Human job

An authorized investigator must be able to find and understand an immutable audited fact without treating one loaded browser page as the whole audit set or converting current labels into historical truth.

## Current authority

```text
OBS-04 ListAuditRecords
→ Workspace scope
→ projectId?
→ pageToken?

OBS-05 GetAuditRecord
→ exact immutable audit fact + Evidence
```

OBS is already the correct owner and `obs.audit_record` is already the correct durable record class.

## Material gaps

```text
no server-side period filter
no server-side actor filter
no server-side action filter
browser-local filter would search only loaded page
actor.kind/ref and subject.kind/ref are exact but human-poor
resolving current names at read time can rewrite historical presentation
```

## Target invariant

```text
server-side investigation filters over admitted audit set
→ filtering occurs before pagination
→ exact immutable actor/subject refs preserved
→ append-time immutable human presentation snapshots preserved
→ deterministic human summary comes from OBS
→ frontend never parses action/ref codes into semantic authority
```

while:

```text
Audit -X-> current business-state owner
current name -X-> rewrite historical presentation
loaded browser page -X-> audit search universe
summary/label -X-> authorization
```

## Reopen scope

Reopen only OBS audit read/projection semantics and bounded 4B OBS wire/checker. No new operation, Permission, owner or durable record is justified.