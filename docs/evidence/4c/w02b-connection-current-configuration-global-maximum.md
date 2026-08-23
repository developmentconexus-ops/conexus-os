# 4C-F09 — Connection current-configuration Global-Maximum assessment

> **Status:** `DECISION EVIDENCE / OPERATOR ACCEPTED CANDIDATE / NOT PRODUCT AUTHORITY`
> **Finding:** [Connection current non-secret configuration finding](w02b-connection-current-configuration-finding.md)
> **Question:** how should an authorized human inspect/revise the exact current non-secret Connection configuration after refresh/re-entry without secret readback or speculative new lifecycle APIs?

## 1. Evidence

Current authority already says:

```text
CON-05 / CON-06 configuration
= provider-specific
= non-secret
= validated against exact ConnectorDefinition/version
= Connection/ConnectionRevision owner meaning

CON-07 credential
= write-only secret ingress
= no readback
```

Current `CON-04 GetConnection` exposes the exact logical Connection and `currentRevisionId` but not the current revision's configuration values.

## 2. Target invariant

```text
Get exact Connection
→ know exact currentRevisionId
→ inspect exact current non-secret configuration
→ initialize intentional revision draft
→ CON-06 expectedCurrentRevisionId + complete configuration
```

while:

```text
credential -X-> readback
qualification -X-> inferred from configuration
binding / health / authorization -X-> collapsed status
```

## 3. Credible alternatives

### A — reopen revise form blank

**REJECT.**

Technically caller-expressible but poor Product semantics: the human cannot inspect current truth and must reconstruct the entire provider configuration from outside the Product. It also makes accidental destructive replacement more likely.

### B — retain current configuration in browser state after create/revise

**REJECT.**

Fails refresh, new device, another operator and stale-state cognition. Browser state becomes a pseudo-authority for durable Connection meaning.

### C — return configuration only from CON-05/CON-06 success

**REJECT.**

Improves same-session convenience but leaves exact re-entry unresolved. It does not establish a durable read path.

### D — add GetConnectionRevision + revision history now

**DEFER.**

A dedicated immutable revision detail/history family could become useful if rollback, historical audit or revision comparison becomes a real locked consumer. Current F1 only proves the need to inspect the **current** revision before revising it.

### E — add GetConnectionConfiguration operation

**DEFER.**

Adds a new Product operation and potential Permission/disclosure surface for meaning already owned by the existing exact Connection detail read. No independent consumer or authority distinction currently justifies it.

### F — enrich CON-04 GetConnection with current non-secret configuration

**LEADING GLOBAL-MAXIMUM CANDIDATE / OPERATOR ACCEPTED.**

Keep the existing lightweight `Connection` projection for `CON-03 ListConnections` and `CON-05 CreateConnection`. Add one detail projection for `CON-04` only:

```text
ConnectionDetail
= existing Connection fields
+ configuration
```

`configuration` is:

```text
server-owned
provider-specific
non-secret
validated/shaped from the exact ConnectorDefinition configuration schema
bound to the returned currentRevisionId
read-only projection until CON-06 submit
```

This fixes inspection/re-entry without inflating every list item, without creating a new operation and without exposing credential material.

## 4. Global Maximum / YAGNI

Local minimum:

```text
blank form / browser cache
```

fails durable truth and human inspection.

Architecture maximum:

```text
revision browser + configuration API + history + rollback
```

fails YAGNI.

Current Global Maximum:

```text
CURRENT OWNER CONFIRMED
→ Connections remains owner
→ CON-04 remains exact detail read
→ currentRevisionId + current non-secret configuration travel together
→ CON-03 remains lightweight
→ CON-07 remains write-only
```

## 5. Protected negative laws

```text
configuration -X-> credential material
configuration presence -X-> qualification
credentialConfigured -X-> qualification
qualification -X-> binding
binding -X-> health
health -X-> authorization
```

No new Product operation, Permission, principal, trust boundary or durable record class is admitted.

## 6. Operator disposition

The operator accepted candidate F.

Next proof sequence:

```text
selected-realization RED
→ bounded 4A semantic clarification
→ bounded 4B CON-04 detail recompile
→ Connections checker + whole-wire GREEN
→ W-02B P7 preflight recompile
→ structural hypothesis adjudication
```