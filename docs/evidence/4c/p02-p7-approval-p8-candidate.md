# P-02 — P7 operator approval and functional P8 candidate

> **Status:** `P7 OPERATOR APPROVED / P8 CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED`
> **Block:** `P-02 — Data / Capabilities / Integrations / Brain`
> **Product implementation authority:** none.

The operator explicitly approved P7 hypothesis **A — Four focused Project routes**. The approved candidate remains preserved in `p02-structural-hypotheses.md`; this record captures the approval and the resulting P8 Evidence without rewriting that historical candidate artifact.

Selected structure:

```text
Data         → human resource browse/detail + contextual Analyze
Capabilities → semantic inspection only; no generic Run/Execute
Integrations → Used by this Project first; Project-private Connections secondary
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

Verify #909 = SUCCESS / EXACT CURRENT HEAD
→ HEAD = 7c1255b40f9dee0478d2ed88197fa7886420e666
→ repository tests = 128 / 128
→ bootstrap_bytes = 20231 / 20480
→ 4A ↔ OAS = 117 ↔ 117
→ whole 4B executable proof = PASS
```

P8 remains a disposable, fixture-only, self-contained low-fidelity interaction artifact. It is **not locked** and grants no Product implementation authority.

Current gate:

```text
P-02 = OPEN / AUTHORITY CLOSED
P7 = OPERATOR APPROVED
P8 = CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED
P-03+ = NOT OPEN
P11 = NOT ASSEMBLED
4D = NOT STARTED
Product implementation = BLOCKED
```

Next action: operator uses the functional P8 and either approves or requests revision. No P9/P10/P-03 progression occurs before explicit P8 lock.
