# 4D(R1) — R1C-14 native-readmission v13 review adjudication

> **Disposition:** `V13 SUPERSEDED / FOUR LOCAL EXECUTION GAPS CORRECTED IN V14`
> **Boundary:** R1C-14 Evidence/review mechanics only; no Product or architecture reopen

The independent v13 lanes were retained byte-exact under the v13 Evidence
directory. Gemini reported no material finding. Opus reported two material local
execution gaps and two lower-severity hardening gaps. The Lead reproduced and
accepted all four against current repository authority:

| Finding | Classification | Lead disposition | Correction |
| --- | --- | --- | --- |
| F-1 — historical HTTPS fixture missing from retention | `LOCAL EXECUTION GAP` | `CORRECTED` | recovered blob `f21ed8f...` as `https-fixture-2026-08-31.mjs`, hash-enforced by the current result consumer |
| F-2 — review currency bound only to brief path | `LOCAL EXECUTION GAP` | `CORRECTED` | wrapper now records exact brief/result paths and SHA-256 identities; consumer also requires the current Evidence review directory |
| F-3 — Opus read-only flags checked only for presence | `LOCAL EXECUTION GAP` | `CORRECTED` | consumer verifies `--permission-mode plan`, the complete disallowed-write-tool vector, and Gemini `--mode plan --sandbox` |
| F-4 — denied Project path could be silently unwrapped | `LOCAL EXECUTION GAP` | `CORRECTED` | canonical Project-path denial now throws `PROJECT_ID_PATH_DENIED` and its firing tests remain explicit |

No finding changed Product meaning, a Permission, schema, service boundary or
the admitted OCI/Git identity. Because F-2 changed the independent-review proof
property itself and the protocol bytes changed, v13 cannot be closed by
adjudication alone. It is superseded by a fresh 17-control v14 candidate and a
fresh dual review must bind the new brief/result digests.

Retained lane identities:

- Opus session `aa393ac7-8560-4427-9922-b33535af68c3`, wrapper SHA-256 `c7a82af7a3fe2b70c4236a3dc498cc0528d7589e45a2042c709889523158a08d`;
- Gemini conversation `0c30e47a-72ee-414a-9e6f-7feff15680bc`, wrapper SHA-256 `cb0e10f286df9f1fc4e06083989651515078685bbf9f4faa9e982be9b2922869`.

These outputs are correction Evidence, not gate authority.
