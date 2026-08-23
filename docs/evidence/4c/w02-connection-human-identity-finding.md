# 4C-F04 — Connection Human-Readable Identity Finding

> **Status:** `OPERATOR ACCEPTED / GLOBAL-MAXIMUM ADJUDICATED / 4A→4B RECOMPILE ACTIVE`
> **Exposed by:** W-02B Connections reference/structural study after W-02 authority preflight.
> **Selected owner:** existing logical Connection Product semantic identity + exact 4B Connection projection.
> **Implementation authority:** none.

## 1. Human falsifier

W-02B must let an authorized human browse and choose among Connections in an exact Workspace or Project scope. Before F04 recompilation, `CON-03 ListConnections` returned `Connection` projections containing:

```text
connectionId
ownerScopeKind
ownerId
connectorDefinitionId
connectorVersion
currentRevisionId
credentialConfigured
```

No stable human-readable Connection presentation identity was admitted.

The Product permits repeated Connection creation for the same owner scope / Connector definition; no law proves one Connection per provider. Therefore a real human list may need to distinguish two or more same-provider logical Connections.

## 2. Root defect

The Product gave the frontend machine identity and operational facts, but no provider-independent human recognition source.

Target invariant:

```text
stable human recognition
+ server-owned presentation identity
+ provider-independent semantics
+ continuity across ConnectionRevision changes
```

The identity:

```text
must not be derived from provider-specific configuration
must not require secret readback
must not become routing, containment or authorization authority
```

## 3. Global-Maximum adjudication

The bounded assessment is:

```text
docs/evidence/4c/w02-connection-human-identity-global-maximum.md
```

It compared:

```text
A opaque ID / provider
B configuration or external-account derived identity
C ConnectorDefinition-owned label derivation
D explicit human identity owned by logical Connection
E mutable name + rename authority now
F new ConnectionProfile / presentation-owner domain
```

Operator-accepted outcome:

```text
CURRENT STRUCTURE CONFIRMED
→ logical Connection remains the correct owner
→ explicit provider-independent human presentation identity is essential
→ selected realization = Connection.name
→ rename = DEFER SAFELY
```

This outcome is accepted because it fixes the root defect at the existing semantic owner with the lowest sustainable total complexity, not because it is the smallest textual patch.

## 4. Selected bounded semantics

```text
Connection.name
```

Accepted properties:

- required non-blank human-readable presentation identity;
- explicit on `CON-05 CreateConnection`;
- returned by the canonical logical `Connection` projection used by `CON-03/04/05`;
- independent from `connectionId`;
- stable across `ConnectionRevision` changes;
- immutable after creation in current F1 authority;
- not authorization, containment, routing, slug or uniqueness authority.

Explicitly not admitted:

```text
RenameConnection
UpdateConnectionMetadata
generic Connection metadata patch
name-derived routing or authorization
provider/configuration-derived fallback identity
secret/account-derived identity
ConnectionRevision-owned name
```

`CON-06 ReviseConnection` remains configuration-revision authority only.

## 5. External Evidence

Current official Workato and Zapier documentation confirms that mature integration products support multiple connections/accounts for the same app and use human-recognizable names/renames to distinguish them. This proves the problem class is real; it does not import their lifecycle or API design into Conexus.

## 6. Proof state

Solution-neutral inquiry proof:

```text
Verify #545 = SUCCESS
→ finding isolated from realization
→ Product/wire remained unchanged during Global-Maximum decision
```

Selected-realization RED:

```text
Verify #546 = EXPECTED RED
→ repository tests = 58
→ PASS = 56
→ FAIL = 2 exactly
→ F04-A Product human identity not yet recompiled
→ F04-B CON-05 / canonical Connection wire not yet recompiled
```

Current bounded GREEN work must recompile only the selected 4A property authority, exact 4B Connection wire/checker and downstream W-02 evidence while preserving counts and protected Connection boundaries.

## 7. Decision boundary

Accepted:

```text
4C-F04 GLOBAL MAXIMUM = OPERATOR ACCEPTED
```

Not authorized by this decision:

```text
Product implementation
Connection rename lifecycle
W-02B structural lock
W-03/W-04/P-01
4D
PR #57 merge
```
