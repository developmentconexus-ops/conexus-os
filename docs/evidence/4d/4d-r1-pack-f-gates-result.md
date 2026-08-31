# 4D — R1 Foundation Pack F deciding-platform/gates result

Status: **CLOSED / PACK F PASS / `R1F-P11/P12` GREEN / P01..P12 ALL GREEN**

Date: `2026-08-30`

Pack F executed inside the exact admitted Linux/Playwright qualification image
under the operator-approved probe grant.
[Executable Evidence](../../../qualification/4d/r1-foundation/evidence/pack-f-summary.md).

## Result

| Proof | Verdict | Deciding observation |
| --- | --- | --- |
| `R1F-P11` | `PASS` | two clean Linux installs reproduced exact admitted tree; native host delta explicit/non-authoritative |
| `R1F-P12` | `PASS` | seven distinct gates each fired RED and then GREEN |

Examples:

```text
TypeScript fixture: string = 42
→ tsc exit 2

Redocly fixture missing servers/security/summary
→ lint exit 1

Playwright expects “red” but browser renders “green”
→ browser test exit 1
```

Clean equivalents returned exit `0`. The tests do not collapse the gates into
one score; each mechanism proves only its own claim.

## Platform delta

The lock contains `37` optional packages. Linux x64 installs `4`; `33` remain
absent. Windows and macOS native bindings are explicit lock entries but never
deciding build truth. A developer-host optional package cannot change the
admitted Linux tree or acceptance result.

All runtime state was destroyed. Product implementation, push, PR and merge
remain unauthorized.
