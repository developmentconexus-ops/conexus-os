# P-01/P-03 — build-safe Agent reference delta structural hypothesis

> **Status:** `P7 OPERATOR APPROVED / P8 BOUNDED DELTAS LOCKED / P9-P10 CONSOLIDATED`
> **Baselines:** P-01 app-first Build + Agent Studio and P-03 Agent workbench remain locked outside named regions
> **P8 HTML:** bounded edits to the two canonical HTMLs operator-approved and locked on 2026-08-27; P-01 blob `8ff34e12ab35ee69f8ffaff1bdd0a8274ac62cec`, P-03 blob `b462c3bb536e0562d28ffb85ef9f6d44fb52df3a`

## Selected Global Maximum

Keep separate owner reads and change only reference-selection/presentation regions:

```text
PRJ-29    → model-policy choice
PRJ-16/17 → capability list/detail
BRN-14    → Project Brain authoring references/detail-disclosure truth
BLD-18/19/20 → exact draft/revision truth
```

No universal catalog, shared DTO, frontend registry or free-form governed ref input.

## P-01 Agent Studio delta

### Model policy

- small `select` from PRJ-29;
- option uses label; purpose/default/limits immediately below;
- value is exact `policyRef`;
- one server-issued default preselected for NEW;
- sampling inputs remain optional and constrained by owner limits;
- provider/model/endpoint/credential never appears.

### Capabilities

- multi-select/checkbox list from PRJ-16 with name, purpose and regime;
- exact `capabilityId` secondary;
- progressive PRJ-17 input/output detail;
- each selected binding still requires authored purpose;
- list visibility grants no invocation.

### Project Brain context

- Domain→Concept hierarchy from BRN-14;
- selected value is `authoringRef`, never `conceptRef`;
- label/summary/content classes visible;
- `detailDisclosed=false` renders “Details withheld by current authority,” never empty/invalid/deleted;
- sections/provenance shown only when disclosed.

### Optional unowned references

For `policyRefs`, `approvalPolicyRefs`, `budgetPolicyRefs`, `verificationRefs`:

```text
NEW      → None configured; cannot be added in F1
EXISTING → exact protected refs shown read-only and preserved
```

Use output/list/chips, not disabled text inputs that imply editability.

### NEW flow

```text
owner reads READY
→ server default model policy selected
→ optional refs empty
→ human supplies Agent meaning + capability purposes + Brain choices
→ BLD-03 + BLD-19
→ exact complete draft
```

If PRJ-29 has no valid default or any required owner read is denied/unavailable, BLD-19 NEW does not start.

### EXISTING flow

```text
agentId coordinate
→ PRJ-21 exact complete definition
→ BLD-19 EXISTING exact base revision
→ BLD-18 draft
→ owner details hydrate when disclosed
→ protected refs survive every reload/revision/diff
```

Absence from a current catalog is not invalidity. Only explicit owner `422` marks an invalid authoring reference.

## P-03 Definition delta

Definition remains read-only. It may enrich:

- model policy label/purpose/default/limits when PRJ-29 disclosed;
- capability human contract when PRJ-16/17 disclosed;
- Brain label/summary/authoringRef and withholding truth when BRN-14 disclosed;
- optional refs as exact protected IDs with no invented semantic labels.

Permission compositions remain explicit:

```text
SOURCE_ONLY → exact definition; owner detail may be withheld
BUILD_ONLY  → P-03 definition may be absent; P-01 discovery still works
FULL        → owner-backed detail available
```

P-03 gains no editor, catalog, mutation or invocation authority.

## Material states

Per owner:

```text
LOADING
KNOWN_EMPTY
DENIED
NON_DISCLOSABLE
DEPENDENCY_FAILURE
READY
```

Per exact existing ref:

```text
DISCLOSED
DETAIL_WITHHELD
EXACT_UNRESOLVED
SERVER_INVALID
```

Failures never clear protected refs or fall back to fixture/free-text values. `422` keeps the draft unresolved; stale `expectedDraftRevision` keeps the existing reload flow.

## Accessibility/responsive

- each family is a fieldset/region with explicit heading/legend;
- full-row selectable items, not unlabeled tiny checkboxes;
- policy summary adjacent to selector;
- IDs wrap on narrow widths;
- owner state announced textually/`aria-live`;
- Brain disclosures keyboard operable;
- existing one-column Agent Studio and P-03 definition-grid transformations remain.

## Proof and lock evidence

P-01 must prove NEW has zero hardcoded refs, owner-backed selections, BUILD_ONLY discovery, exact authoringRef, protected EXISTING round-trip, complete diff, 422/currentness recovery and no authority widening.

P-03 must prove read-only Definition, independently disclosed owner details, explicit withheld/unresolved states, coordinate-only Edit handoff and no second editor/catalog.

The operator walked the same two canonical candidates through the owner-backed READY and withheld/unresolved reference states, NEW/EXISTING handoff, protected-reference preservation, complete diff and conflict/invalid-reference recovery. The prior P-01 baseline/re-lock blob and prior P-03 baseline blob remain historical identities in their owning Screen Contracts; this lock records only the bounded PRE11-F05 delta identities above.

```text
selected hypothesis = owner-backed bounded delta / OPERATOR APPROVED
blocking finding = 0
P8 deltas = LOCKED / OPERATOR APPROVED
P9/P10 = CONSOLIDATED
P11 / 4D / Product implementation = NOT AUTHORIZED
```
