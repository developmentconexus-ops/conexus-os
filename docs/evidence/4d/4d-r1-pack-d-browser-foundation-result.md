# 4D — R1 Foundation Pack D browser result

Status: **CLOSED / PACK D PASS / `R1F-P08` GREEN / 3 BROWSERS / OTHER PACKS NOT PROVEN**

Date: `2026-08-30`

Pack D executed in an isolated exact Playwright container under the existing
probe grant. [Executable Evidence](../../../qualification/4d/r1-foundation/evidence/pack-d-summary.md).

## Result

| Proof | Verdict | Deciding observation |
| --- | --- | --- |
| browser build | `PASS` | Vite manifest + hashed JS/CSS; server secret and server grant identities absent |
| Chromium | `4/4` | session/csrf, URL/storage, cache, cross-origin paths passed |
| Firefox | `4/4` | same envelope passed after bounded cold-start navigation correction |
| WebKit | `4/4` | same envelope passed |
| `R1F-P08` | `PASS` | browser URL/search/cache can alter requests/local pixels but cannot manufacture server owner authority |

Examples:

```text
/projects/project-b?workspaceId=workspace-a&admin=true
→ server grant absent
→ Access denied

TanStack cache manually set to “Forged Project”
→ local heading can change
→ Save command receives HTTP 403
→ mutation count unchanged
→ refetch restores Access denied
```

This distinction is intentional: a user controls their browser pixels, but not
server authority.

## Claim boundary

The probe does not implement the Product frontend, P13 visual acceptance,
production TLS/session service, persisted client cache or complete accessibility
qualification. It proves only the admitted browser foundation and named negative
paths.

All runtime state was destroyed. Exact image caches remain locally with removal
commands. Product implementation, push, PR and merge remain unauthorized.
