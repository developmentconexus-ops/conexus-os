# R1 Foundation qualification

Evidence-only qualification for the operator-approved R1 Foundation Probe
Grant. This tree has zero root/Product runtime dependency and is not Product
implementation.

Pack A: `PASS / R1F-A01 CORRECTED / P01+P02 GREEN`.
Pack B: `PASS / P03+P04 GREEN / BOUNDED COMPILER MECHANICS GREEN`.
Pack C: `PASS / P05+P06+P07 GREEN / REAL LOCAL KEYCLOAK+POSTGRESQL`.
Pack D: `PASS / P08 GREEN / CHROMIUM+FIREFOX+WEBKIT 12/12`.
Pack E: `PASS / P09+P10 GREEN / R1F-E01 CORRECTED`.
Pack F: `PASS / P11+P12 GREEN / P01..P12 ALL GREEN`.

Pack A proves exact runtime/package admission, a reproducible clean lock/tree,
negative rejection of floating/mismatched/integrity/registry inputs, lifecycle-
script policy firing and available registry signature/provenance facts. It does
not prove the compiler, HTTP, identity, browser, PostgreSQL or gate packs.

Mutable installs and negative-control copies must live in a fresh OS temporary
directory. No workspace `node_modules`, credential or runtime state is retained.

The deciding runtime was Linux x64 Node `24.20.0` with npm `12.0.2`.
The first run exposed `ajv-cli 5.0.0 → fast-json-patch <3.1.1`; its immutable
FAIL Evidence remains preserved. The operator-approved correction removed that
CLI, added the bounded Ajv adapter and reran Pack A GREEN. P03–P12 remain
`NOT_PROVEN`; consult the roadmap for the only open next pack.
