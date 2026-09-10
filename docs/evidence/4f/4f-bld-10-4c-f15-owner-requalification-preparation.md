# 4C-F15 BLD-10 owner requalification preparation

> **Status:** SUPERSEDED PREPARATION / DISPOSITION RECORDED 2026-09-09
> **Current gate:** The 4C-F15 owner disposition accepted the approved-Baseline
> meaning while preserving the frozen R1 ledger and wire bytes. This packet is
> retained as the contradiction record; it no longer awaits owner acceptance.
> Closure remains subject to the current BLD-10 review receipt and roadmap.

This packet routed the smallest Product-owner correction identified by the
fresh independent review. It did not change the operation ledger, frozen wire
bytes, route count, or Product meaning by itself. The accepted disposition is
recorded in
[`4f-bld-10-4c-f15-owner-disposition.md`](4f-bld-10-4c-f15-owner-disposition.md).

## Observed contradiction

The accepted 4C-F15 ledger text says that omitted `changeId` resolves the
“current canonical Project source” and binds `subjectDigest` to that source.
The accepted BLD-10 decision says `CURRENT_PROJECT` means the exact approved
Project Baseline; a divergent `project.source_revision` is unapproved
authoring/candidate state. The current resolver and negative-control proof
already implement the Baseline meaning.

This is an owner-text contradiction, not a reason to change the resolver to a
mutable Git head. The wire phrase remains frozen until its separate contract
requalification.

The Product ledger is also a pinned R1 source: its current SHA-256 is
`92faa951f7bc01bd9baf364094e4d17b59eb3f42946fa8f994b8022c5231eb2c`, and the
R1 input-set/source custody records that exact digest. Editing the owner text
therefore requires the separate R1 source-custody/requalification route; this
BLD-10 grant cannot silently rewrite the pinned ledger or generated R1 receipt.
A read-only hypothetical replacement of only the omitted-`changeId` phrase
produces ledger digest `3ad74e740fc3d5ccac6be43023ec211ced696758096600f1d54f25b6895a8950`,
which confirms that the pin would be invalidated.

## Proposed 4C-F15 owner wording

After owner acceptance, replace only the omitted-`changeId` semantic phrase in
the Product operation owner with:

```text
changeId omitted
→ server resolves the exact approved Project Baseline
→ returns CURRENT_PROJECT Preview
→ subjectDigest binds that exact approved Baseline digest/source revision
```

The exact-Change branch remains unchanged:

```text
changeId present
→ server re-resolves the exact Change inside the current Project
→ returns CHANGE_CANDIDATE Preview
→ subjectDigest binds that exact Change candidate Preview subject
```

The owner disposition preserved all existing laws: `CURRENT_PROJECT !=
CHANGE_CANDIDATE`, Preview is not an active Release or Published App, `ready !=
verified != live`, `live = false`, callers cannot choose a source revision, and
F15 adds no operation, Permission, owner, trust boundary, or durable record.

## Acceptance and proof route

The 4C-F15 owner disposition identified the accepted semantic meaning and
deferred any canonical wire wording change. If that wording changes later, the
contract owner must reopen the frozen wire custody and update its digest/checks
before any downstream closure claim. Until then, `contracts/`, the pinned
ledger, and the existing wire assertion remain unchanged.

The smallest proof after acceptance is:

1. the Product ledger and its F15 repository test agree on Baseline meaning;
2. the resolver negative control still proves a divergent Project Git head
   cannot change omitted-`changeId` identity;
3. the current candidate graph and repository checks pass;
4. a fresh dual-lane review reads this packet and the execution receipt, then
   attacks the owner wording and the six protected BLD-10 claims independently.

No artifact producer, immutable serving route, R3 mechanism, live provider,
deployment or Git publication is admitted by this preparation packet.
