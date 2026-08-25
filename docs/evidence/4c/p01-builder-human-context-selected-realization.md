# 4C P-01 F14 — Selected Builder Human Context Realization

> **Status:** `OPERATOR ACCEPTED / SELECTED REALIZATION / RED REQUIRED`
> **Authority impact:** bounded Builder recompile only; no operation/Permission/owner/record-count change.

## Selected realization

### 1. Preserve Change intent in current reads

`ChangeSummary` becomes:

```text
required:
- changeId
- projectId
- intent
- state
```

`Change` becomes:

```text
required:
- changeId
- projectId
- intent
- baselineDigest
- planningDepth
- rigorProfile
- state
```

`intent` remains the exact nonblank semantic statement already admitted by `BLD-03 CreateChange`.

No `title`, `name`, rename or generic update authority is admitted.

### 2. Narrow BLD-16 with optional exact Change context

Current request:

```text
{
  question
}
```

Selected request:

```text
{
  question,
  changeId?
}
```

Rules:

```text
question = required human query
changeId = optional untrusted exact current Change reference

changeId absent
→ current authorized Project/platform Builder context

changeId present
→ server resolves the exact Change inside current Project
→ current project.build authority/disclosure still applies
→ response remains provenance-preserving guidance only
```

### 3. Explicit negatives

```text
BLD-16 does not gain project.source.read
BLD-16 does not gain project.review
BLD-16 does not gain source file / diff / Finding / Evidence content by convenience
changeId does not authorize
intent does not authorize
assistant answer does not mutate Change/Plan/progress
```

## RED contract

Before changing Product/wire authority, repository proof must fail because current schemas do not yet satisfy:

```text
ChangeSummary requires intent
Change requires intent
BLD-16 admits optional changeId
Builder checker guards all three
4C-F14 is projected into current Builder authority
```

After the selected RED fires, recompile only:

```text
docs/product/operation-ledger.md
contracts/api/product/builder-paths.yaml
scripts/check-wire-builder.mjs
```

plus only exact status/evidence projections needed to record F14.

P7 and P8 remain blocked until whole-wire GREEN.
