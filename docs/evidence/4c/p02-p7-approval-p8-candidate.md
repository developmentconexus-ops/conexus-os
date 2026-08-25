# P-02 — P7 operator approval and functional P8 candidate

> **Status:** `P7 OPERATOR APPROVED / P8 REVISED CANDIDATE / OPERATOR WALKTHROUGH REQUIRED / NOT LOCKED`
> **Block:** `P-02 — Data / Capabilities / Integrations / Brain`
> **Product implementation authority:** none.

The operator explicitly approved P7 hypothesis **A — Four focused Project routes**. The approved candidate remains preserved in `p02-structural-hypotheses.md`; this record captures the approval and evolving P8 Evidence without rewriting that historical candidate artifact.

Selected structure:

```text
Data         → human resource browse/detail + contextual Analyze
Capabilities → semantic inspection only; no generic Run/Execute
Integrations → Project use first; Project-private Connections secondary
Brain        → Project adoption first; Workspace Brain publication separate
```

Functional P8 Evidence:

```text
docs/evidence/4c/p02-project-resources-functional-wireframe.html

Verify #905 = EXPECTED RED
→ 128 repository tests / 122 pass / 6 fail
→ all six failures = one missing functional HTML artifact
→ all prior repository tests remained green

Verify #906 = RED / GUARD SERIALIZATION DEFECT ONLY
→ P8 behaviors passed except two raw-text arrow assertions
→ HTML semantics unchanged

Verify #907 = SUCCESS
→ repository tests = 128 / 128
→ bootstrap_bytes = 20403 / 20480
→ 4A ↔ OAS = 117 ↔ 117
→ whole 4B executable proof = PASS
```

## Operator walkthrough revision

The first operator walkthrough did **not** lock P8. It approved a bounded revision:

```text
Data
→ show INTERNAL | INTEGRATION | DERIVED resources
→ distinguish TABLE | VIEW | DATASET
→ inspect Overview | Fields | Relationships | Rules
→ preserve semantic structure != physical database topology

Capabilities
→ human name + purpose
→ What it does
→ Inputs / Outputs
→ technical identity secondary
→ still no generic Run/Execute

Integrations
→ Connections used by this Project
→ Use connection / Switch connection
→ explicit Current connection → Switch to → Confirm switch
→ Connections owned by this Project remains secondary
```

The missing server-owned inspection truth is recorded in `p02-p8-feedback-revision.md` as bounded corrections `4C-F20` and `4C-F21`; both preserve the existing operation families and add zero Product operations.

TDD revision chronology:

```text
Verify #913 = EXPECTED RED
→ repository tests = 133
→ pass = 128
→ fail = 5
→ exact five failures = F20, F21, revised Data, revised Capabilities, revised Integrations
→ all prior tests remained green

Verify #915 = PARTIAL GREEN
→ F20 + F21 authority/wire assertions pass
→ 130 / 133 pass
→ only the three still-unrealized revised P8 UX assertions fail

Verify #916 = P8 GREEN EXCEPT OBSOLETE WORDING GUARD
→ 132 / 133 pass
→ all F20/F21 + revised Data/Capabilities/Integrations assertions pass
→ sole failure = historical P8 title-string guard coupled to pre-revision wording
```

P8 remains a disposable, fixture-only, self-contained low-fidelity interaction artifact. It is **not locked** and grants no Product implementation authority.

Current gate:

```text
P-02 = OPEN
P7 = OPERATOR APPROVED
P8 = REVISED CANDIDATE / OPERATOR WALKTHROUGH REQUIRED / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```

Next action after full verification: operator uses the revised functional P8 and either approves it or requests another bounded revision. No P9/P10/P-03 progression occurs before explicit revised-P8 approval.
