# 4F(R1) S5 — Browser hardening implementation result

> **Status:** `CLOSED PASS`
> **Observed:** `2026-09-02`
> **Receipt mode:** `RECEIPT LAST`
> **Next boundary:** `STOP / SPLIT PREREQUISITE — R1C-13 BLOCKED`

## Delivered vertical outcome

S5 closes the locked T-01/GF-01/W-01 browser boundary over the already-realized
S1..S4 operations:

- every realized route cold-refreshes through the same-origin Hub SPA host;
- one adaptive, current-scope GF-01 shell preserves human-readable Workspace and
  Project orientation in wide and narrow layouts;
- account menu and narrow navigation have focus entry, click-away/Escape
  behavior and exact trigger restoration;
- invalid local intake focuses its labeled control and every realized command
  resists synchronous double activation;
- reduced motion, visible focus and no-horizontal-overflow behavior are realized;
- server, URL-navigation, form-draft and ephemeral-UI remain the only client
  state classes;
- forged coordinates/cache/storage, `401`, `403`, non-oracular `404`, stale
  approval and dependency failure cannot become disclosure, success or current
  Product truth;
- production bundles are secret-free and the admitted Helmet/CSP/nosniff and
  non-HTML `/api/*` boundary is executable.

No Product operation, Permission, table, role, schema, migration, generated
transport, durable state or Product meaning was added or changed.

## Exact browser qualification

The deciding browser environment is local image
`conexus-r1-s5-playwright:1.62.1-node24.20.0`, image ID
`sha256:610f2f5b9314f8748a08619713d2ab934e1f12f96f35c65d343fe0813d316d2b`,
built from the admitted Pack-D Dockerfile and exact parent
`mcr.microsoft.com/playwright@sha256:c091b21d9fae78c76e85cd4356431e9b018402f172a214fc7d7a5e9a7e29d8ac`.
It verifies Node `24.20.0`, npm `12.0.2`, Playwright `1.62.1`, Chromium revision
`1234`, Firefox revision `1538` and WebKit revision `2336`.

Each browser ran the identical production-build/real-Hub/TLS matrix in its own
`--rm`, `--ipc=host`, repository-read-only container. The aggregate command
completed with exit `0`: Chromium `2/2`, Firefox `2/2`, WebKit `2/2` (`6/6`).
After independent challenge, the exact admitted Firefox invocation was repeated
without extra capabilities and passed `2/2` in `94.2s`. No qualification
container remained afterward.

## Deciding verification

| Proof | Result |
| --- | --- |
| `npm run r1:s5:p0:check` | `5/5 PASS`; Hub and Web typechecks PASS |
| targeted Biome | `14/14` files checked; no fixes; later native/S5 proof subset `3/3` clean |
| `npm run r1:s5:p1:browser` | three isolated admitted engines, `6/6 PASS`, exit `0` |
| explicit post-review Firefox falsifier | `2/2 PASS` |
| `npm run r1:s3:p6:check` | `17 PASS`, one intentionally skipped live proof |
| `npm run r1:s4:p2:check` | `10/10 PASS` |
| `npm run r1:s2:import-law` | `26/26 PASS` |
| `npm ci` | 191 packages installed; 192 audited; 0 vulnerabilities |
| `npm run verify` | PASS; only pre-existing Redocly warnings |
| `npm run r1:r1c14:native:check` | manifest `17/17 PASS`; targeted suite `31/31 PASS` |
| `npm run repository:check` | PASS |
| `npm run conexus:preflight` | PASS |

The native result and exact OCI identity remain unchanged:

- result SHA-256:
  `d5ccba4ecf683417a5a78313c5fa7230fd3eb56fd8ced0eca7e14b844be767c6`;
- OCI index:
  `sha256:5e5c3526292bb87a97a3fa41c8e715800a02da5238fbe07bf99c1c4b614f7851`.

## RED history and false-PASS resistance

The first S5 boundary run failed two of three tests because cold SPA routes and
the adaptive/focus shell did not exist. The first behavioral double-activation
probe observed two PRJ-09 requests and caused the explicit in-flight guard.
During harness realization, native Vite loading, temporary dependency
resolution, WebKit HSTS/TLS, process cleanup and per-engine isolation each
failed before correction. The final structural proof fails if any admitted
engine, pinned image/Dockerfile, read-only mount or isolated process is removed;
behavioral assertions directly cover header, secret canary, focus restoration,
forged cache/storage and command counter failures.

The final native regression initially failed closed at `30/31` because S5 had
changed inherited `PLATFORM-CONTRACT` paths without current transition reasons.
The bounded correction only names exact S5 reasons for the already-derived
changed paths. It does not change custody membership, prior/current digests,
historical Evidence, OCI identity, Product delta or PASS logic; the rerun closed
at `31/31`.

## Independent closure and Lead decision

The sole justified post-correction round used fresh isolated lanes over one
frozen brief:

- Claude Code `2.1.257`, normal `fable` alias resolving to
  `claude-fable-5-1`, `xhigh`, plan/read-only, session
  `e55c88fa-b07f-4e14-881b-36bd0cc2b56d`: `PASS`, seven claims PASS, zero
  material finding;
- AGY `1.1.23`, `gemini-3.1-pro-high`, `high`, plan+sandbox/read-only,
  conversation `ff8a4b55-a5e9-4a84-a589-f27f92c57807`: `PASS`, seven claims
  PASS, no finding.

Lead adjudication is
[`4f-r1-s5-final-independent-review-adjudication.md`](4f-r1-s5-final-independent-review-adjudication.md).
The reviewer-host Firefox sandbox diagnostic, scope-level `aria-current` and
uniform unknown-route Problem shape are `DEFER SAFELY` with explicit revisit
triggers there. They do not falsify a protected S5 claim. No further reviewer
round is justified.

## Preserved boundary and exact next action

All pre-existing/unowned dirty-tree state was preserved. No model/provider
Product call, credential use, production injection/deployment, external
OCI/input custody action, commit, push, PR or merge occurred.

S5 is `CLOSED PASS`. Stop here and write no S6 Product byte. R1C-13 remains
blocked until a separate explicit operator grant opens its exact Mastra
dependency/probe and provider-credential boundaries; all provider execution and
cognition realization remain outside this receipt.
