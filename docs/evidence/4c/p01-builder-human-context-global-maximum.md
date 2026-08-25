# 4C P-01 F14 — Builder Human Context Global-Maximum Adjudication

> **Status:** `OPERATOR ACCEPTED / GLOBAL MAXIMUM SELECTED / REALIZATION REQUIRES RED`
> **Finding:** Change human meaning disappears from reads; BLD-16 cannot bind exact optional Change context.

## 1. Decision objective

Repair the smallest owning authority so P-01 can remain human-first and contextual without creating a second Builder model, screen-shaped API or new semantic owner.

Global-Maximum criteria:

```text
human recognition
exact subject binding
current owner truth
least authority
YAGNI
no new topology
future P-01 composition remains possible
```

## 2. Alternatives

### A — frontend derives a Change title from `changeId` / local history

**REJECTED.** This creates parallel presentation truth that is not durable Product meaning and fails on re-entry/session changes.

### B — add independent `Change.title` / rename/update metadata

**REJECTED.** `intent` already is the accepted bounded human meaning of a Change. A second title/name plus mutation authority duplicates meaning and invents lifecycle surface without a consumer.

### C — keep reads unchanged and show opaque IDs

**REJECTED.** Human operators cannot reliably recognize or compare Changes by opaque machine coordinates.

### D — encode selected Change only into assistant prose

**REJECTED.** Prompt text is not Product identity. The server could not revalidate the exact semantic subject independently from model/browser narration.

### E — introduce a universal `ContextRef` / arbitrary selected-resource union now

**REJECTED.** P-01 currently proves one concrete missing anchor: exact current Change. Generalizing before repeated consumers would be speculative framework authority.

### F — preserve existing `intent` in Change reads + optional exact `changeId` on BLD-16

**SELECTED GLOBAL MAXIMUM.**

```text
CreateChange.intent
→ same intent projected by ChangeSummary
→ same intent projected by Change

BLD-16(question)
→ Project-level Builder assistance

BLD-16(question, changeId?)
→ optional exact current Change anchor
→ same project.build route
→ server validates exact Project/Change containment + current disclosure
```

## 3. Selected semantic law

```text
changeId = stable exact Change identity / untrusted reference
intent = required nonblank human semantic statement of what must become true

intent != authorization
intent != mutable display-name domain
intent != unique key
intent != status
```

Assistant law:

```text
changeId absent → Project-level Builder context
changeId present → exact Change-context narrowing

changeId -X-> project.source.read
changeId -X-> project.review
changeId -X-> runtime control
question text -X-> semantic subject authority
```

## 4. Count / owner impact

```text
fixed Product operations = 116 unchanged
Builder operations       = 17 unchanged
ordinary Permissions     = 25 unchanged
semantic owners          = unchanged
durable record classes   = 46 unchanged
trust boundaries         = unchanged
```

No new endpoint is needed. Existing `bld.change` owns the durable semantic fact; existing BLD-16 owns the assistant interaction.

## 5. Why this is not a screen-shaped correction

The missing facts are useful independent of one proposed P-01 layout:

- any human Change list/detail needs the authored intent to recognize the subject;
- any exact Change-scoped contextual assistance needs a server-revalidatable Change reference;
- neither property dictates card/table/sidebar/modal composition.

Therefore F14 repairs Product meaning/wire expressibility, while P7 remains free to compare UX structures afterward.
