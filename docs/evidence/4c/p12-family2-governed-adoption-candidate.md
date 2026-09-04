# P12 — Family 2 governed adoption candidate

> **Status:** `LOCKED / OPERATOR APPROVED / BROWSER GREEN / P9-P10 CONSOLIDATED`
> **Family:** `E/F/O — W-02A/W-02B → P-02`
> **Parent matrix:** [`P12 integrated scenario edge matrix`](p12-integrated-scenario-edge-matrix.md)
> **Product / 4A / 4B impact:** none
> **Operator lock:** 2026-08-28

## 1. Preserved approved baselines

```text
W-02A approved = 9ca84ddbf40f6bcd969bfa638203bff8b9abf46e
W-02B approved = 421f5b8e08d6e5c96f5a56d8c24123902cbe3fab
P-02 approved = 1ea0f096a6e72000d5d5f09ebf64f03d6a346417
```

## 2. Operator-approved Family 2 identities

```text
W-02A = f0a6902737a36217b081ff61768caa39c98c4734
W-02B = f8a4be72cd5af86ea06b4dd82d8710e58edb203f
P-02  = fd23303ac71bbf256887bf361fb0f8c7cf9aae00
```

## 3. Brain publication → explicit binding

```text
W-02A Project ingress = ws-metal-nobre / prj-sales-ops
→ BRN-08 approval remains separate
→ BRN-09 publishes brain-r42
→ owner-issued W-02A→P-02 envelope
→ P-02 resolves brain-r42 as AVAILABLE candidate
→ Project remains bound to brain-r17
→ explicit Adopt selected revision
→ Project binding becomes brain-r42
```

Denied, dependency, stale or unknown publication produces no egress and no Project binding mutation.

## 4. Connection qualification → explicit adoption

```text
W-02B exact owner truth = conn-sankhya-prod / rev-18 / q-501 / PASSED
→ owner-issued W-02B→P-02 envelope
→ P-02 resolves qualification
→ Project remains using rev-17
→ explicit Use tested revision rev-18
→ Project use becomes rev-18
```

Configuration or credential change produces `NEEDS_RETEST` and invalidates the egress. Unknown, stale, denied, dependency, command failure or failed qualification emits nothing.

## 5. Browser Evidence

```text
W-02A exact Project ingress = PROJECT_READY
BRN-09 result = brain-r42 envelope / no auto-binding
P-02 Brain ingress = READY_BRAIN
before explicit action = current binding brain-r17
after explicit action = current binding brain-r42

W-02B exact qualification = READY_TO_EMIT
egress = conn-sankhya-prod / rev-18 / q-501
P-02 Integration ingress = READY_CONNECTION
before explicit action = Project use rev-17
after explicit action = Project use rev-18

unknown Brain = STALE_BRAIN / route hidden
wrong Connection revision = STALE_CONNECTION / route hidden
```

## 6. Negative laws

- publication != Project binding;
- qualification != Project adoption;
- URL coordinate != authority;
- destination owner resolves or fails closed;
- no default fixture fallback on invalid integrated ingress;
- no P11 store, browser persistence or network call;
- no new operation, Permission, owner or wire field;
- no Product framework/runtime/SDK/4D selection.

## 7. Gate

```text
Family 2 = LOCKED / OPERATOR APPROVED
Family 3 = NEXT / AUTHORIZED BY APPROVED EDGE MATRIX
Family 4+ and P11 reassembly = NOT AUTHORIZED
```
