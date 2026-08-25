# 4C-F08 — Brain Discovery explicit Project-context finding

> **Status:** `F08 = OPEN / MATERIAL P9 INTERACTION FINDING`
> **Block:** `W-02A — Workspace Brain`
> **Trigger:** exact P9 trace of the operator-approved functional P8 after F07 structured knowledge browse became GREEN.
> **Authority posture:** interaction finding Evidence only. This file does not change Product operations, Permissions, owners, scopes, wire semantics or implementation authority.

## 1. Trigger

The operator-approved Brain P8 presents Discovery as Workspace Brain work and provides one visible action:

```text
Run discovery
```

The accepted Product/wire operation is:

```text
BRN-04 StartBrainDiscovery
request = { projectId }
```

The `projectId` identifies the Project whose already-admitted source/Connection context Brain resolves server-side for read-only Discovery.

The approved HTML currently has no visible Project selector/context inside Discovery and no Project in the current Workspace breadcrumb.

## 2. Material falsifier

A human must know which Project context drives Discovery before invoking BRN-04.

Without that, a production frontend must choose one misleading substitute:

```text
hidden/default Project
OR arbitrary fixture Project
OR stale Project remembered only in browser state
OR imply Workspace-wide Brain scanning although BRN-04 is Project-context bound
```

All are structurally dishonest.

Target interaction law:

```text
human chooses/recognizes exact Project context
→ browser carries untrusted projectId
→ BRN-04
→ Brain resolves admitted source / Connection context server-side
```

The browser projectId remains an untrusted reference. source / Connection resolution remains server-owned.

## 3. Existing sufficient authority

No upstream Product gap is currently proven.

`PRJ-01 ListProjects` already returns the Projects currently disclosable in the Workspace through `ProjectSummary`:

```text
projectId
workspaceId
name
archived
```

`name` is the human-readable Project identity. The frontend therefore has an existing truthful way to let a human recognize and select a Project without inventing source metadata, provider eligibility or Connection facts.

`BRN-04 StartBrainDiscovery` already owns the correct Brain action and requires only the untrusted `projectId`; server-side Brain authority resolves the admitted source/Connection context.

## 4. Target invariant

A valid correction must make all of the following true:

```text
Workspace Brain remains the Discovery work owner/surface
+ human can see the Project context before Run discovery
+ Project identity comes from PRJ-01 current disclosure
+ selected projectId is FORM_DRAFT / untrusted reference until BRN-04 submit
+ frontend does not choose source, Connection, credential or physical table
+ frontend does not claim a Project is Discovery-eligible from sparse summary data
+ archived state remains truthful presentation; server decides current BRN-04 admission
+ BRN-04 semantics/wire remain unchanged
+ no new Product operation/Permission/owner/record
```

## 5. Why this is P8/P9 interaction scope

The backend already exposes both necessary truths:

```text
PRJ-01 → human-recognizable Project candidates
BRN-04 → exact Project-context Brain Discovery action
```

The missing property is how the approved Brain interaction composes those existing truths. Therefore this is currently a frontend interaction correction, not a 4A/4B reopen.

## 6. Prior P8 approval preservation

```text
W-02A P8 knowledge-first structure = OPERATOR APPROVED
F07 structured knowledge-browse correction = GREEN
```

F08 does not reopen:

```text
Knowledge → Domain → Concept
content-class presentation
Discovery → resolution → Proposal → decision → publication
approval != publication
Revisions
Health overlay
GF-01 / W-01
```

It reopens only the Discovery entry/context region because the operator-approved artifact did not make the BRN-04 Project subject visible.

## 7. Reopen boundary

Do not change BRN-04 to Workspace-wide discovery, add source/Connection selectors, add an eligibility endpoint or move canonical Brain authority into Project merely to repair this presentation gap.

The correction must use existing accepted authority unless a later falsifier proves it insufficient.
