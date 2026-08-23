# 4C-F04 — Connection Human-Readable Identity Finding

> **Status:** `OPEN / MATERIAL FINDING / RED REQUIRED / NOT YET ADMITTED`
> **Exposed by:** W-02B Connections reference/structural study after W-02 authority preflight.
> **Smallest implicated owner:** Connections Product semantic identity + exact 4B Connection wire projection.
> **Implementation authority:** none.

## 1. Human falsifier

W-02B must let an authorized human browse and choose among Connections in an exact Workspace or Project scope. Current `CON-03 ListConnections` returns `Connection` projections containing:

```text
connectionId
ownerScopeKind
ownerId
connectorDefinitionId
connectorVersion
currentRevisionId
credentialConfigured
```

No stable human-readable Connection presentation identity is admitted.

The Product also permits repeated Connection creation for the same owner scope / Connector definition; no current law proves one Connection per provider, and mature integration products explicitly support multiple named app instances/connections. Therefore a real human list may need to distinguish, for example, two same-provider Connections representing different accounts/environments.

## 2. Why current substitutes fail

### A — display `connectionId`

**REJECT.** Stable opaque identity is necessary for routing/authority but insufficient as primary human recognition.

### B — derive a label from provider-specific `configuration`

**REJECT.** Configuration shape is Connector-specific, may not contain a suitable label, may change by revision, and is not admitted as universal Connection presentation identity. The frontend would invent identity semantics from provider payloads.

### C — use Connector provider/definition name only

**REJECT.** Multiple Connections may use the same Connector definition/provider; provider identity cannot distinguish logical Connection instances.

### D — create a generic Connection metadata/update subsystem

**REJECT / YAGNI.** The human need is recognition, not arbitrary metadata CRUD.

## 3. External reference Evidence

Current official Workato documentation explicitly models multiple connections when users have multiple app instances (for example production and testing), and its Connections API includes a human `name` alongside provider and authorization state. This is reference Evidence that same-provider logical connection instances need a human recognition label; it is not Conexus authority.

The finding does not import Workato's connection lifecycle or status vocabulary.

## 4. Leading smallest correction — NOT YET OPERATOR ACCEPTED

```text
Connection.name
```

Proposed bounded semantics:

- required non-blank human-readable presentation identity;
- supplied explicitly on `CON-05 CreateConnection`;
- returned on `Connection` projections from `CON-03/04` and any response already using that canonical representation;
- independent from stable opaque `connectionId`;
- never authorization, containment, Connector selection or uniqueness authority;
- not required to be unique by this correction;
- immutable after creation in F1 because no current rename consumer has been proven;
- no new Product operation, Permission, owner, trust boundary or durable record class.

Explicitly not admitted:

```text
RenameConnection
UpdateConnectionMetadata
generic Connection patch
name-derived routing/slug
global or owner-scope name uniqueness
frontend ID→name registry
configuration-derived fallback identity
```

`CON-06 ReviseConnection` remains configuration-revision authority only and does not become a rename path.

## 5. Expected derived impact if accepted

```text
fixed Product operation count = unchanged (113)
Connections operations        = unchanged (9)
ordinary Permissions          = unchanged (25)
new operation                 = 0
new owner                     = 0
new durable record class      = 0
```

Only existing creation/read payload semantics would recompile.

## 6. RED contract

Executable falsifiers should fail exactly because:

```text
F04-A current Product human-identity authority does not admit Connection.name
F04-B current CON-05 / Connection wire does not require/project Connection.name
```

All W-01 locks, W-02 split laws, Connection secret/qualification boundaries, 113↔113 bijection and prior whole-wire proofs must otherwise remain green.

## 7. Decision boundary

Do not modify 4A/4B yet.

```text
operator decision required:
ACCEPT CORRECTION | REVISE | REJECT
```

If accepted, reopen only the bounded human-identity Product contract + CON-05/Connection wire and exact affected checks, then recompile W-02 authority Evidence before structural hypotheses.
