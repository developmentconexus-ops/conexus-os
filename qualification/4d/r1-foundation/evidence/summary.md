# R1 Foundation Pack A summary

Status: **STOP / `R1F-A01` / `R1F-07` REOPEN REQUIRED**

`R1F-P01` passed. Exact Node `24.20.0` + npm `12.0.2`, all `26`
direct pins, the lock, registry/integrity rules and two clean installs were
reproduced. Both installed trees had `11088` records and SHA-256
`12df6431627f0b9979fcbd356d9f5464337f136d252e844290577746dc7aa54d`.
Floating, alternate-registry, manifest/lock mismatch and integrity controls all
failed as required.

`R1F-P02` stopped admission. The selected tree has no package lifecycle scripts,
the strict allow/deny/unreviewed negative fixture fired correctly, and
`npm audit signatures` reported zero invalid or missing signatures. However,
`npm audit` found `ajv-cli 5.0.0 → fast-json-patch <3.1.1 →
GHSA-8gh8-hqwg-xf34`, severity HIGH/CVSS 7.3. The fixed transitive release is
`3.1.1`; ajv-cli's update PR remains unmerged and `5.0.0` remains its latest
release.

The root repository still invokes that CLI through historical `npx --yes`
verification. It is not admitted by this probe and must migrate to the same
bounded adapter before R1 admission under separate root-change authority.

The approved stop law fired. No later pack ran. Product implementation authority
remains zero. The smallest reopen is `R1F-07`: remove or replace only the
vulnerable Ajv CLI gate mechanism while preserving Ajv `8.20.0` strict,
non-mutating Draft 2020-12 validation.
