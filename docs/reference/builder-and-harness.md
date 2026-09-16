# Builder and Harness

## Current ordinary Builder owner

The ordinary internal Builder is owned by C-020 and the current technical reference [`builder-c020-mastra-native.md`](builder-c020-mastra-native.md).

Current ordinary line:

```text
Project
→ persistent Mastra Thread/messages
→ Message
→ Conexus BuilderRun
→ fresh scoped Mastra Session
→ fresh Workspace/E2B
→ source settlement
→ compiler / ArtifactRevision
→ last-good Preview
```

Mastra owns coding-harness mechanics. Conexus owns Product/system authority that Mastra must not own.

This file is a broader Builder/Harness routing reference. It must not define a second ordinary runtime lifecycle that conflicts with C-020.

## Current ownership split

### Mastra mechanics

```text
shared AgentController
shared coding Agent
persistent Project Thread/messages
fresh scoped Session per BuilderRun
Workspace/filesystem/search/edit/command mechanics
BUILD/PLAN tool exposure
Session.displayState + display_state_changed
```

### Conexus Product authority

```text
Account / Workspace / Project authorization
trusted Project/thread binding
BuilderRun durability/idempotency/concurrency/settlement
ProjectWorkingState
Git/source custody + late-result refusal
compiler / ArtifactRevision identity
last-good Preview
browser disclosure/redaction boundary
```

`Turn` remains a UX/conversation concept, not a durable Conexus record.

## Broader Project architecture

Workspace, Project, Project Baseline, Brain/Connection bindings, Release, Published Application, MANAGED/DEDICATED runtime profile, and cross-Project reuse semantics remain owned by the current Product and architecture references. They are broader than the ordinary C-020 coding loop and are not redefined here.

Use [`../product/contract.md`](../product/contract.md) and [`../architecture/index.md`](../architecture/index.md) for those meanings.

## Historical C-017 Builder graph

`Change`, `Plan`, `WorkUnit`, `ActorRun`, and `CodingSession` are historical or transitional Builder concepts. C-017 in [`../decisions/index.md`](../decisions/index.md) preserves its recorded history and any still-explicit non-ordinary/legacy consumer. C-020 supersedes that graph for ordinary internal coding chat.

Do not read the historical graph as the current ordinary execution line.

If a real current consumer still requires a legacy concept, keep that consumer bounded behind its existing owner until it is deliberately migrated. Do not restore the graph as a prerequisite for ordinary Project conversation/build/Preview.

Historical Plan/checklist/Change lifecycle detail remains available in Git history and the Product/decision owners. It is not duplicated here.

## Source and result custody

Mastra may edit the isolated Workspace. Conexus decides what becomes authoritative Project source.

The ordinary path preserves:

- exact admitted base source;
- bounded allowed-path/result validation;
- immutable source identity;
- stale-result refusal/CAS;
- working source distinct from last-good Preview;
- host-controlled canonical result creation/admission;
- compiler and Registry authority outside the coding agent.

A successful compile is not independent verification.

## E2B physical-incarnation guard

E2B remains a replaceable execution substrate, never Product/control truth.

Required property:

```text
write bound to exact observed physical sandbox/incarnation
→ incarnation dies
→ operation fails
→ no silent replay on a replacement sandbox
→ later work re-enters only through current Conexus owner authority
```

Do not treat pause/resume, runtime continuity, or a replacement sandbox as authorization.

## Credentials and effects

An E2B guest never inherits durable privileged credentials merely because Builder code runs there.

Do not place these in guest inheritance:

```text
Hub DB credentials
Project authoritative DB credentials
Connection/ERP credentials
CredentialBackend/root material
Git remote write credentials
model-provider credentials
backup credentials
DEDICATED private keys
```

Any guest-readable capability must be narrowly minted, bounded, expiring/revocable, and validated by the owning Conexus boundary.

## Independent material verification

When a claim asserts independent material verification, the verifier must use fresh cognition and an independently materialized exact candidate under Conexus custody.

```text
exact candidate X
→ fresh verifier context
+ fresh independent materialization of X
→ report binds exact X
```

Ordinary internal Preview does not require independent model review merely to become usable. Unreviewed does not mean VERIFIED.

## Engineering evaluation

Budget Analyzer remains a reproducible Builder regression/quality benchmark. Worker/runtime/model candidates should be compared on representative real tasks and current protected properties rather than anecdote.

Persistent Project conversation does not remove independent verification when a material claim requires it.
