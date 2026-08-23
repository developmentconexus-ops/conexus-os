# 4C-F04 — Connection Human-Readable Identity Finding

> **Status:** `OPEN / MATERIAL FINDING / GLOBAL-MAXIMUM OPERATOR GATE / NOT YET ADMITTED`
> **Exposed by:** W-02B Connections reference/structural study after W-02 authority preflight.
> **Smallest implicated owner:** Connections Product semantic identity + exact 4B Connection projection, unless the Global-Maximum analysis proves a different owner.
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

The Product also permits repeated Connection creation for the same owner scope / Connector definition; no current law proves one Connection per provider. Therefore a real human list may need to distinguish two or more same-provider logical Connections.

## 2. Root defect

The current Product gives the frontend machine identity and operational facts, but no provider-independent human recognition source.

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

## 3. Why current substitutes fail

Opaque `connectionId`, provider/Connector identity and provider-specific configuration are Evidence inputs, not a universal human-identity contract. A frontend-derived label would create a second, unstable authority.

A generic metadata subsystem is also not implied by the finding.

## 4. Global-Maximum decision required

The finding does **not** preselect `Connection.name` or any other schema change.

The bounded assessment is:

```text
docs/evidence/4c/w02-connection-human-identity-global-maximum.md
```

It compares:

```text
A opaque ID / provider
B configuration or external-account derived identity
C ConnectorDefinition-owned label derivation
D explicit human identity owned by logical Connection
E mutable name + rename authority now
F new ConnectionProfile / presentation-owner domain
```

The current leading candidate after that comparison is explicit human presentation identity owned by the logical Connection, with `Connection.name` as the leading spelling. That is **Decision Evidence only** until the operator accepts it.

**The solution is not admitted by finding existence.**

## 5. External Evidence

Current official Workato and Zapier documentation confirms that mature integration products support multiple connections/accounts for the same app and use human-recognizable names/renames to distinguish them. This proves the problem class is real; it does not import their lifecycle or API design into Conexus.

## 6. Current proof state

The current-state falsifier should prove:

```text
same-provider instances are structurally possible
current Connection projection has no provider-independent human presentation identity
frontend/provider/secret heuristics are not accepted authority
```

It should **not** fail merely because a preselected field such as `Connection.name` is absent before the Global-Maximum decision.

After operator acceptance of an exact outcome, derive a new selected-realization RED before changing Product/wire authority.

## 7. Decision boundary

Do not modify 4A/4B yet.

```text
operator decision required:
ACCEPT GLOBAL-MAXIMUM CANDIDATE | REVISE | REJECT
```

If accepted, reopen only the owner/contract actually selected by the Global-Maximum assessment, then recompile affected downstream artifacts. If the assessment is revised to a different owner or strategy, the implementation scope follows that decision rather than the currently leading schema candidate.
