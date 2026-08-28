# P12 — Family 4 Agent, decision and effect candidate

> **Status:** `LOCKED / OPERATOR APPROVED / BROWSER GREEN / P9-P10 CONSOLIDATED`
> **Family:** `I/J/K — W-04 → P-03 → P-01 / PA-01 → P-04`
> **Parent matrix:** [`P12 integrated scenario edge matrix`](p12-integrated-scenario-edge-matrix.md)
> **Product / 4A / 4B impact:** none
> **Operator lock:** 2026-08-28

## Preserved approved inputs

```text
W-04 = 65073eb5f532f2675f04ec307eb0d9b91fd1b69d
P-01 = e5782b3f9e828a5c247b405821589d52039cc179
P-03 = b462c3bb536e0562d28ffb85ef9f6d44fb52df3a
P-04 = 77820d283e47ba6c9f5efd19f45471c88675e0b0
PA-01 = 612ec41d91104e01b3942f7d90f35c37ad89c9f0
```

## Operator-approved Family 4 identities

```text
W-04 = 71e03432a0abd34ae35301094010fd670bb78b98
P-01 = 25e5077106892c4ff6aba6774987e73a12ccff51
P-03 = 17d31534fac0e57a74f70202567b23d8a63cd3c0
P-04 = e036684e3e66d028361db2d708cf05811a367f4b
PA-01 = ffba5935d8fccd0fc5d7ad4d275fe38b09294674
```

## Owner-issued continuity

```text
W-04 Open Agent
→ ws-metal-nobre / prj-sales-ops / agent-sales-follow-up
→ P-03 PRJ-20/21 re-resolution or fail closed
→ P-03 NEW|EXISTING coordinate-only handoff
→ P-01 exact Agent Studio ingress or fail closed

P-03 or PA-01 PAR-09/PAR-10
→ approval-781 / run-1042 / sha256:7c9b-fixture
→ explicit Investigate effects action
→ projectId + originatingRun={AgentRun,run-1042}
→ P-04 GW-01 owner-filtered response before pagination
→ effect-77 only
```

P-04 accepts no caller-selected `effectAttemptId`. Approval coordinates remain
source Evidence; the P-04 destination consumes only exact Project and
`originatingRun`. An unknown run returns an honest filtered empty page and never
falls back to an unfiltered list.

## Preserved laws

- navigation creates no Change, draft, app grant, decision or Effect;
- unknown/denied/dependency identity never falls back to the integrated fixture;
- P-01 Family 1 Baseline ingress remains independently exact;
- NEW Agent identity is issued only by the simulated BLD-19 owner result;
- Conversation AgentRuns remain independent from approval `run-1042`;
- stale/expired/revoked/403/409/412/session failures preserve reviewed truth and emit nothing;
- `OUTCOME_UNKNOWN` grants no retry/replay/reconcile authority;
- no Product operation, Permission, wire, runtime, SDK, framework or design-system change.

## Browser Evidence

```text
W-04 Sales Follow-up → exact W04_AGENT_OPEN coordinates
P-03 exact ingress → agent-sales-follow-up / agent-rev-018 / rel-042
P-03 unknown Agent → CONTEXT_UNKNOWN / no fallback
P-01 EXISTING exact ingress → AGENT_READY
P-01 unknown Agent → AGENT_UNKNOWN / no fallback
P-01 NEW before BLD-19 → agent identity “issued by BLD-19”
PA-01 PAR-09/PAR-10 → approval-781 / run-1042 / sha256:7c9b-fixture
explicit Investigate effects → owner-issued originatingRun
P-04 run-1042 → FILTERED_READY / effect-77 only
P-04 run-unknown → FILTERED_EMPTY / zero rows / no fallback
P-04 incomplete filter + effectAttemptId → INVALID_FILTER_422 / zero rows
```

## Gate

```text
Family 4 = LOCKED / OPERATOR APPROVED
P12 Families 1-4 = RE-LOCKED
behavioral P11 reassembly = NEXT
```

The historical P11 lock remains preserved but is not current assembly proof. Product/4A/4B,
4D, merge and Product implementation remain unauthorized.
