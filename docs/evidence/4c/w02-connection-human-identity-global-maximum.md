# 4C-F04 — Connection Human Identity Global-Maximum Assessment

> **Status:** `OPERATOR ACCEPTED / CURRENT STRUCTURE CONFIRMED / SELECTED REALIZATION = Connection.name`
> **Scope:** only the human-recognition defect exposed by W-02B Connections.
> **Implementation authority:** none; this acceptance authorizes bounded 4A→4B contract recompilation only.

This assessment applies the DevelopmentConexus Engineering Method decision core before and during the bounded 4A/4B correction.

## 1. Evidence

Before F04 recompilation, canonical `Connection` projected:

```text
connectionId
ownerScopeKind
ownerId
connectorDefinitionId
connectorVersion
currentRevisionId
credentialConfigured
```

Current Product permits more than one logical Connection in one owner scope and does not prove one instance per provider/Connector.

External reference Evidence:

- Workato documents multiple connections for multiple instances of the same app and exposes a connection `name` in its Connections API.
- Zapier documents multiple accounts for the same app and explicitly supports renaming app connections when usernames/emails are unclear.

These references prove the human-recognition problem is real in mature integration products. They do not decide Conexus semantics.

## 2. Root Cause

The logical Connection owner is structurally sound for lifecycle/configuration/credential/qualification authority, but its prior Product representation modeled machine identity and operational facts without provider-independent human presentation identity.

The defect class is broader than a missing frontend label:

```text
human must choose one logical Connection
+ same-provider instances are valid
+ provider/configuration/secret cannot be universal identity
→ frontend needs an authoritative recognition source
```

A UI-only label, provider-specific heuristic or secret/account-derived fallback would preserve the root cause by creating a second, unstable presentation authority outside the Connection owner.

## 3. Target Invariant

For every currently disclosable logical Connection:

```text
stable human recognition
+ server-owned presentation identity
+ provider-independent semantics
+ continuity across ConnectionRevision changes
+ no secret readback requirement
+ no frontend-derived identity heuristic
```

The presentation identity:

```text
must not be derived from provider-specific configuration
must not become routing, containment or authorization authority
must not collapse configured / qualified / bound / healthy / authorized truth
```

## 4. Constraints

Preserve:

- exact `WORKSPACE | PROJECT` Connection ownership;
- opaque `connectionId` as stable machine identity;
- immutable Connection revisions;
- write-only credential ingress;
- qualification bound to exact revision + environment + Evidence;
- Project binding as a different owner seam;
- no generic Settings/metadata domain by symmetry;
- operation/Permission growth only with a proven consumer.

## 5. Credible Alternatives

### A — opaque ID / provider as human identity

**REJECT.**

Smallest diff, but not a sustainable solution. Same-provider instances remain ambiguous and opaque IDs optimize machine addressing rather than human recognition.

### B — derive identity from provider configuration or external account data

**REJECT.**

Examples would be host, tenant, database, email or account name. This is not universal across Connector definitions; values can change with revisions; some values may be sensitive; and the frontend would have to invent provider-specific recognition semantics.

This is a Local Maximum inside the prior schema and preserves the root cause.

### C — ConnectorDefinition-owned label derivation rule

**REJECT AS PRIMARY IDENTITY / POSSIBLE FUTURE SECONDARY PRESENTATION.**

A platform-pack rule could declare which non-secret configuration fields form a subtitle/summary. That can improve future UX, but using it as primary identity:

- burdens every ConnectorDefinition with presentation semantics;
- couples identity to revisioned configuration;
- still fails when a connector has no suitable field;
- creates formatting/fallback mechanics before a second real consumer proves the need.

Prepare this seam later if richer provider-specific summaries are evidenced; do not use it to repair logical identity.

### D — logical Connection owns explicit human presentation identity

**ACCEPTED GLOBAL MAXIMUM.**

The existing logical Connection owner receives one provider-independent human presentation property. The selected spelling is `name`, consistent with the already accepted bounded Workspace/Project presentation-identity concept.

Properties:

```text
explicit at creation
server-owned
returned on Connection projections
stable across ConnectionRevision changes
independent from connectionId
not authorization / routing / containment / uniqueness
```

This fixes the root cause at the existing semantic owner rather than adding a presentation owner or UI heuristic.

### E — mutable Connection name + rename authority now

**DEFER SAFELY.**

Workato/Zapier show rename is useful in mature products, so rename is a credible future evolution rather than an imaginary possibility. However the current Conexus human flow proves recognition at create/browse/select time, not an explicit rename job.

Adding rename now would require a real mutation contract, current-state/concurrency semantics, Permission mapping and Screen Contract without a current consumer.

A creation-time presentation identity does not create a structural dead end: a narrow future rename operation can be admitted later without dismantling Connection ownership or duplicating semantics.

Revisit when a real rename consumer appears in 4C/4E or implementation Evidence proves creation-only naming operationally harmful.

### F — new ConnectionProfile / presentation-owner domain

**REJECT / OVERENGINEERING.**

This duplicates Connection identity/ownership to solve a property that naturally belongs to the logical Connection. It adds lifecycle, synchronization and authorization complexity with no independent consumer.

## 6. Global Maximum

```text
CURRENT STRUCTURE CONFIRMED
→ correct owner = logical Connection
→ missing property = provider-independent human presentation identity
→ selected realization = Connection.name
→ no new domain required
```

The Global Maximum is **not** “the smallest patch because it is small.” It preserves the existing Connection owner because adversarial comparison exposed no ownership defect, while adding the missing essential property at that owner.

Operator-accepted realization:

```text
Connection.name
→ required non-blank creation-time human presentation identity
→ projected by canonical Connection reads
→ stable across configuration revisions
→ immutable in current F1 authority
```

## 7. Essential vs Accidental Complexity

Essential now:

- humans can distinguish multiple logical Connections safely;
- identity is owned by the Connection server boundary;
- machine ID and human presentation identity remain distinct.

Accidental now:

- provider-specific label heuristics;
- generic metadata CRUD;
- rename/current-state machinery without a consumer;
- separate presentation/profile owner;
- universal uniqueness/slug rules.

## 8. YAGNI / Future Cost

The accepted structure removes the known defect without forcing foreseeable rearchitecture.

```text
creation-time identity now
+ narrow future rename seam if/when consumed
```

is lower total complexity than either:

```text
provider-derived identity now → later migration to canonical identity
```

or:

```text
full mutable metadata subsystem now without consumers
```

## 9. Proof Strategy

Selected-realization proof must establish:

1. `Connection.name` is admitted by current Product human-presentation identity authority;
2. `CON-05` requires explicit non-blank `name`;
3. canonical `Connection` reads/projected responses carry `name`;
4. `CON-06` does not accept `name` and `ConnectionRevision` does not own it;
5. no secret readback, routing/auth semantics, generic metadata CRUD, new Permission/owner or operation-count drift appears;
6. whole 4B wire/codegen/adversarial proof remains green.

TDD chain:

```text
Verify #546 = EXPECTED RED
→ 58 tests / 56 pass / 2 fail exactly on selected F04 realization before 4A/4B recompilation
```

## 10. Reopen Triggers

Reopen this decision if:

- a real rename/relabel job appears;
- users need provider-specific secondary recognition that one name cannot supply;
- a material uniqueness requirement appears;
- Connection ownership itself changes;
- implementation/4E Evidence shows creation-only identity causes a structural dead end;
- another owner is proven to be the true semantic source of human Connection identity.

## 11. Operator decision

```text
OPERATOR ACCEPTED
→ explicit logical Connection human presentation identity admitted
→ selected spelling/realization: Connection.name
→ creation-time + canonical read projection only
→ rename remains deferred
```

This decision authorizes the bounded contract recompile only. It does not authorize Product implementation, W-02B structural lock, 4D, or merge.
