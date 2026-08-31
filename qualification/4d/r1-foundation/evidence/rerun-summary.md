# R1 Foundation Pack A corrected rerun

Status: **PASS / `R1F-A01` CORRECTED / P01+P02 GREEN**

The operator-approved minimal correction removed `ajv-cli 5.0.0` and its
vulnerable `fast-json-patch` path. A bounded adapter over already selected Ajv
`8.20.0` + `ajv-formats 3.0.1` proved valid exit `0`, invalid exit `1`, stable
diagnostics and no coercion/default/removal mutation.

The corrected tree has `25` direct pins, `224` locked packages and `191`
packages installed on deciding Linux x64. Two clean installs produced the same
`10788`-record tree SHA-256
`5f276d1cfa0f6c1b199230c9bf5553ca98fa9a8ebe5ca7d6477dcc7decf9ec57`.

All dependency and lifecycle-script negative controls fired. Registry signatures
reported zero invalid/missing entries; npm audit reported zero vulnerabilities;
the installed tree reported zero missing licenses. Source tags, Keycloak Linux
amd64 OCI image, Atlas Community executable and five Playwright browser/support
archives are exact-pinned in the machine manifest.

Historical first-run FAIL Evidence remains preserved. Pack A now passes; P03–P12
remain `NOT_PROVEN` and Product implementation authority remains zero.
