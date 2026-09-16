# 7R-2 Builder runtime waterfall

This is a measurement harness, not Product instrumentation. It measures the
current Builder boundaries through existing constructors and injected process
seams. It never changes Builder ordering, authorization, source custody,
E2B lifetime, or Preview behavior.

Run from the pinned WSL environment with Node 24.20.0 and npm 12.0.2:

```bash
# Supply the already-admitted local environment without printing secret values.
set -a
source .audit/slice7/hub.env
export CONEXUS_TEST_DB_HOST="$CONEXUS_DB_HOST"
export CONEXUS_TEST_DB_PORT="$CONEXUS_DB_PORT"
export CONEXUS_TEST_DB_NAME="$CONEXUS_DB_NAME"
# Before running this block, export CONEXUS_TEST_DB_USER and
# CONEXUS_TEST_DB_PASSWORD from the local disposable-database administrator
# secret; do not commit or print the password. Do not use the restricted
# CONEXUS_DB_USER runtime role here because the harness creates a disposable DB.
set +a

node qualification/7r2/builder-runtime-waterfall/measure.mjs \
  --live \
  --output qualification/7r2/builder-runtime-waterfall/baseline.json
```

The command first requires the retained P2/P3 pre-baseline gate to match the
current HEAD. It then measures three real P1 Git controls, three NEW Project
creation samples, three source-changing BUILDs, one PLAN, one Code lens, one
Diff lens, one Preview-readiness sample, and three direct compiler E2B
calibration samples. `--live` is required because the Product journeys use
the explicitly admitted provider/model and coding E2B runtime. A duration above
10 seconds is measurement data; it is not an availability failure.

The Product journey is intentionally measured through the current composition
rooted at `createConfiguredBuilderModule`. S6 Preview launch/iframe readiness
is `INCONCLUSIVE` in this harness because it does not replace the real
IdentityAccess/MAR preview authorities. The artifact retains that unresolved
bucket instead of claiming a Preview number.

The script never prints or stores credentials, prompts containing secrets,
provider payloads, or raw tool output. It does not instrument or modify Product
semantics, and it does not optimize any measured boundary.

The raw artifact is `baseline.json`. Every scenario contains its coverage
status, sample identity, monotonic spans, input facts, process observations,
and an explicit unresolved-bucket list. `INCONCLUSIVE` means the current
composition could not be measured safely from this harness. It is not a
latency claim.

The harness compiles the current Hub sources into a disposable temporary
directory before importing them. That compile is outside all measured spans.
The fixture repositories and E2B sandboxes are disposable and are removed by
the harness.
