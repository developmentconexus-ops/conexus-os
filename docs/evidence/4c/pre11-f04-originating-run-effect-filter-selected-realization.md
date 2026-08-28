# 4C-PRE11-F04 — exact originating-run effect investigation selected realization

> **Status:** `OPERATOR APPROVED / SELECTED REALIZATION / 4A+4B BOUNDED RECOMPILE`
> **Operation count:** unchanged (`GW-01/GW-02 = 2`, platform `127`)
> **Permission count:** unchanged (`audit.read`, ordinary Permissions `25`)
> **Implementation:** blocked

## Decision

An exact AgentRun investigation continues directly to Gateway-owned effect attempts through an optional exact `originatingRun` filter on the existing `GW-01 ListEffectAttempts` read.

```text
GET /api/control/projects/{projectId}/effect-attempts
  ?originatingRun[kind]=AgentRun
  &originatingRun[ref]=run-1042
  &pageToken=<opaque>
```

Canonical OpenAPI encoding:

```yaml
name: originatingRun
in: query
required: false
style: deepObject
explode: true
schema: OriginatingRunRef { kind, ref }
```

Both fields are required when the filter is present. Matching is exact conjunction:

```text
EffectAttempt.originatingRun.kind == filter.kind
AND
EffectAttempt.originatingRun.ref  == filter.ref
```

No wildcard, text search, status/provider/date/sort language or caller-selected effect identity is admitted.

## Owner and pagination law

Gateway remains the sole effect-attempt owner. `projectId` and `originatingRun` are untrusted coordinates; every call rechecks current Project disclosure and `audit.read`.

```text
filter server-side before pagination
→ attemptedAt DESC
→ effectAttemptId DESC
→ opaque pageToken bound to exact Project + filter + ordering
```

An invalid/incomplete filter or a continuation token reused with another filter is `422`. `200 []` means only:

> No currently disclosable effect attempt matches this exact originating run.

It does not prove that the run produced no effect outside the Gateway's current disclosed truth.

## Cross-block trace

```text
P-03 exact AgentRun
→ Continue to Activity
→ Project Activity / Effects lens
→ GW-01 exact originatingRun-filtered page
→ GW-02 exact effect detail where selected
```

Deep-link presentation state carries:

```text
Project route
Activity / Effects lens
originatingRun.kind
originatingRun.ref
```

The destination does not require `agentId`, does not join PAR detail in the browser and does not gain AgentRun authority.

## Rejected alternatives

1. **Filter OBS-01 Activity.** Rejected: Activity is chronological projection, not the effect owner.
2. **Browser-filter the loaded GW-01 page.** Rejected: one page is not the owner result set.
3. **Add a new GetEffectsForAgentRun operation.** Rejected: duplicates GW-01 owner/read semantics.
4. **Drop or weaken the continuation.** Rejected by operator: exact investigation is the admitted human job.

## Preserved boundaries

```text
new Product operation   = 0
new Permission          = 0
new owner/principal     = 0
retry/replay/reconcile  = 0
OUTCOME_UNKNOWN         = preserved
GW-02 exact detail      = preserved
frontend filtering      = forbidden
```

## Proof

The targeted repository test opens RED against the prior wire and reaches GREEN only when:

- `GW-01` exposes exactly the optional deep-object `originatingRun` filter;
- `OriginatingRunRef` remains closed and requires `kind + ref`;
- `422` is explicit;
- only `pageToken + originatingRun` are allowed query parameters;
- Product/Permission/P-03/P-04 trace remains owner-correct;
- no mutation headers, operation, Permission or effect-control field appears.

Required whole-wire verification remains `npm ci` + `npm run verify` after all accepted bounded corrections in the current package are applied.
