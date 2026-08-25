# P-02 P8 — walkthrough script parse fix

> **Status:** `FIXED / GREEN / P8 NOT LOCKED`
> **Scope:** walkthrough artifact bug only. F22/4A/4B/Permissions are unchanged.

The first F22 P8 artifact was complete on disk but unusable in-browser because its single inline script failed to parse inside `renderSourceTree()`. That prevented all dynamic initialization, including the source tree, object tabs, Data grid, filters, pagination and Row Inspector.

```text
broken artifact blob = 59a7f53fa371297e435ee130bfcdfb86b126a247
root cause           = SyntaxError: Unexpected token ')' in renderSourceTree()
```

A dedicated parse smoke guard now compiles the self-contained inline script before operator walkthrough.

```text
RED
HEAD   = 8400afaa0661d9c117e2cb77c4eff1552ab780e3
Verify = #981 / EXPECTED FAILURE
result = 132 tests / 131 pass / 1 fail
failure= exact inline-script SyntaxError: Unexpected token ')'

GREEN
HEAD   = 8927f38ede2fb3e71fd919f32ccb930bf35f41eb
Verify = #982 / SUCCESS
result = 132 / 132
```

The fix rewrites only `renderSourceTree()` into explicit nested rendering steps. No Product operation, Permission, owner, wire, F22 boundary or interaction design was changed.

```text
fixed artifact blob        = 54043c9e1385b09fa8fb70ec9b38f8d56cc3dcb4
bootstrap_bytes             = 18553 / 20480
4A ↔ OAS                    = 121 ↔ 121
F22 negative controls       = 8 / PASS
generated projection / Kubb = PASS / 121
whole 4B adversarial        = PASS / 121
whole 4B executable         = PASS
```

Current gate:

```text
P-02 = OPEN
F22 = OPERATOR RATIFIED
P8 = REVISED CANDIDATE / OPERATOR WALKTHROUGH / NOT LOCKED
P9/P10 = BLOCKED
P-03+ = NOT OPEN
Product implementation = BLOCKED
merge = NOT AUTHORIZED
```
