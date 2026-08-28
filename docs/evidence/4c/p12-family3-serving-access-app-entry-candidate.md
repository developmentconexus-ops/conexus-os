# P12 — Family 3 serving, access and app-entry candidate

> **Status:** `LOCKED / OPERATOR APPROVED / BROWSER GREEN / P9-P10 CONSOLIDATED`
> **Family:** `H/L/M — P-04 → P-05 → PA-01`
> **Parent matrix:** [`P12 integrated scenario edge matrix`](p12-integrated-scenario-edge-matrix.md)
> **Product / 4A / 4B impact:** none
> **Operator lock:** 2026-08-28

## Approved baselines

```text
P-04 = 9aaa2c8e6d85b7b5d535bfba5969c475190ba7e7
P-05 = c8d18c942e7f84a746a6ca959c51f18c27f3b6cd
PA-01 = 87551c6bc24f335a088c976cbfd560d102f63cf7
```

## Operator-approved Family 3 identities

```text
P-04 = 77820d283e47ba6c9f5efd19f45471c88675e0b0
P-05 = d00b2126667a0a51317c653c57c237444a129dfb
PA-01 = 612ec41d91104e01b3942f7d90f35c37ad89c9f0
```

## Realized custody

```text
P-01 Change context → P-04 HONEST_BOUNDARY / Release selection NONE

P-04 prj-sales-ops / rel-042 / env-production / generation 18 / SERVED_VERIFIED
→ owner-issued serving envelope
→ no app URL / no Open app Product control

P-05 re-resolves serving context
→ candidate acct-leandro grants nothing
→ explicit IAM-15 member grant
→ review-harness-only envelope for acct-leandro / prj-sales-ops / rel-042 / agent-sales-follow-up

PA-01 IAM-13 re-resolves the exact four coordinates
→ independent Published-App shell READY
```

Promotion leaves serving `PENDING`, disabling egress until owner verification. Managed jobs remain internal. Duplicate remains fixed `NO_DATA` and returns no destination coordinate.

## Browser Evidence

```text
P-04 Change ingress = HONEST_BOUNDARY
P-04 serving egress = READY → OWNER_ISSUED
P-05 ingress = READY / app egress absent before grant
explicit IAM-15 acct-leandro grant → OWNER_ISSUED
PA-01 exact ingress = IAM-13 READY / app visible
PA-01 rel-stale = CONTEXT_STALE / app hidden
P-05 duplicate = HONEST_BOUNDARY / no destination IDs
```

## Negative laws

- no Control Plane launch operation or inferred app URL;
- serving visibility != app access;
- candidate visibility != grant;
- app role != effect-approval authority;
- PA-01 recovery does not inherit Control Plane state;
- archive != unpublish/stop automation/delete;
- duplicate `NO_DATA` emits no destination;
- no Product/Permission/wire/runtime change.

## Operator LOCK

On 2026-08-28 the operator exercised the bounded P-04 → P-05 → PA-01
walkthrough and explicitly approved Family 3. The three exact identities above are
therefore the current re-locked P8 Evidence. The approved historical baselines remain
preserved as history; they are not the current Family 3 inputs.

Family 4 is the exact next bounded identity-custody family. P11 reassembly remains
unauthorized until the remaining affected family is operator-locked. Product/4A/4B,
4D, merge and Product implementation remain unauthorized.
