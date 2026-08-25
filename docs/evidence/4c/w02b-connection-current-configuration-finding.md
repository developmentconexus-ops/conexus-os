# 4C-F09 — Connection current non-secret configuration finding

> **Status:** `F09 = OPEN / MATERIAL W-02B P7 FINDING`
> **Block:** `W-02B — Connections`
> **Trigger:** exact v2.2 P7 authority/data trace before structural wireframing.
> **Authority posture:** finding Evidence only. This file does not change Product operations, Permissions, owners, scopes, wire semantics or implementation authority.

## 1. Trigger

The accepted Connections surface admits provider-specific **non-secret** configuration as durable Connection revision meaning:

```text
CON-05 CreateConnection
→ configuration

CON-06 ReviseConnection
→ expectedCurrentRevisionId + configuration
→ new immutable ConnectionRevision
```

Credentials are separate and remain write-only through `CON-07`.

However current read wire is:

```text
CON-04 GetConnection
→ connectionId
→ name
→ ownerScopeKind + ownerId
→ connectorDefinitionId + connectorVersion
→ currentRevisionId
→ credentialConfigured
```

Neither `CON-04` nor the current `ConnectionRevision` response exposes the non-secret configuration bound to `currentRevisionId`.

## 2. Material falsifier

W-02B must let an authorized human inspect and intentionally revise the current non-secret Connection configuration after refresh/re-entry.

Without a server-owned current configuration read, a production frontend must choose at least one dishonest substitute:

```text
browser-persist prior configuration
OR reopen revision form blank and require full re-entry
OR reconstruct from stale local/fixture state
OR display provider fields without authoritative current values
```

Those substitutes either make browser state a pseudo-authority or make current configuration unknowable to the human who is asked to revise it.

Target invariant:

```text
exact logical Connection
→ exact currentRevisionId
→ server-owned current non-secret configuration for that exact revision
→ human inspection / form initialization
→ explicit CON-06 revision command
```

Credential material is never part of this read.

## 3. Root cause / owner

The semantic owner is already correct:

```text
Connections
→ logical Connection
→ immutable ConnectionRevision
→ non-secret configuration
```

This is not a new Settings domain, credential read requirement or Project binding concern. The missing property is a read projection of existing Connections-owned current revision meaning.

## 4. Existing boundaries that must survive

```text
Connection.name = logical human identity
configuration = provider-specific non-secret revision meaning
credential = write-only secret material
qualification = exact revision/environment Evidence
ProjectConnectionBinding = Project-owned downstream use
Gateway health/effect admission = separate runtime truth
```

Therefore:

```text
configured != qualified != bound != healthy != caller-authorized
```

remains binding.

## 5. Reopen boundary

A valid correction must not introduce by convenience:

```text
secret readback
credential handles/tokens/password projection
qualification history
latestQualification
revision history/rollback
Connection rename/delete
new Settings owner
new Product operation/Permission/durable record
```

Reopen only the smallest real Connections read property needed to inspect the current non-secret configuration.