# 4D OPP-B06 — Conformance, Dependency and Supply-Chain Study

> **Status:** `PASS 1 OPERATOR APPROVED / LAYERED EVIDENCE CHAIN LEADING`
> **Inputs:** C-005, C-009, C-012, C-016, RP-G0.3, `SCF-01..11`, `REL-01`, `VER-01..06`, OPP-A02/A03 and OPP-B05
> **Research date:** `2026-08-28`
> **External execution:** `DOCUMENTATION STUDY ONLY`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

Which smallest standards and mechanisms prove exact dependency identity,
artifact/build provenance, inventory, bounded conformance and firing negative
controls without creating a generic governance platform or collapsing distinct
truths into one green score?

## 2. Non-collapsible truths

```text
locked dependency graph
!= downloaded-byte integrity
!= publisher/build provenance
!= vulnerability-free
!= license-admissible
!= reproducible artifact
!= Conexus owner/authority conformance
!= runtime safety
```

Every positive result names exactly which property it proves, the subject digest,
tool/source identity and freshness. Missing or stale Evidence is `UNKNOWN` or a
named admission stop; it is never success by omission.

## 3. Leading evidence chain

```text
declared dependency proposal + named consumer/property
→ exact package-manager/runtime/build-environment identity
→ canonical lock resolution
→ clean locked install with network and script policy
→ registry/source integrity and available provenance verification
→ license + advisory + denied-family admission
→ exact target-environment build/test/conformance
→ generated SBOM bound to artifact digest
→ build provenance/attestation bound to source, inputs, builder and artifact
→ Release closes over exact accepted identities and proof
```

No step replaces another. A scanner, signature, SBOM or attestation remains
Evidence and never becomes Product authority.

## 4. Dependency resolution and install

### npm incumbent

The repository already requires `npm ci` and carries lockfile version 3. Current
npm documentation confirms that `npm ci` requires a lockfile, checks
`package.json`/lock agreement, installs the locked graph and does not rewrite
the lock.

Leading bounded controls:

- pin Node, npm CLI and target OS/architecture through the exact admitted build
  environment; `engines >=` alone is not an execution pin;
- retain one canonical lockfile and review every lock mutation as dependency
  authority change;
- `npm ci` for admitted reproduction; no install-time floating resolution;
- `allow-git=none` unless one exact root Git dependency is independently
  justified and pinned by immutable commit/digest;
- disable lifecycle scripts during inspection and non-build consumers;
- before any script-enabled build install, derive and compare the exact set of
  packages declaring install scripts against an admitted allowlist, then run in
  the isolated build environment;
- use a minimum release-age policy when resolving new versions, with explicit
  named exceptions, as risk reduction rather than proof of safety;
- record registry/source configuration so an alternate registry cannot satisfy
  the same package name silently.

Package-lock integrity protects resolved bytes where recorded. It does not prove
that the publisher or build process was trustworthy.

**Disposition:** `CURRENT REPOSITORY INCUMBENT / PROJECT PAVED-ROAD CANDIDATE; EXACT CLI AND POLICY PINS REQUIRE 4D-C`.

### pnpm, Yarn and alternate package managers

Useful controls such as stronger install-script approval or different store/
workspace behavior merit a bounded challenger probe only if npm cannot enforce
an admitted property without fragile custom machinery. Package-manager migration
is not justified by feature count.

**Disposition:** `KEEP AS FALSIFIER-TRIGGERED ALTERNATIVES`.

## 5. Registry signatures and package provenance

Current npm supports `npm audit signatures` to verify registry signatures and
available provenance attestations. npm provenance links a published package to
supported hosted CI source/build instructions; official documentation explicitly
states that this does not prove absence of malicious code.

Admission law:

- invalid signature/attestation or unexpected identity = `STOP`;
- verified provenance strengthens source/build identity only;
- absence of provenance is reported explicitly and routed through the exact
  package's source/release/maintainer Evidence; it cannot be silently called
  verified;
- npm publication provenance applies only to packages published through that
  ecosystem and cannot serve as universal Conexus Release provenance.

**Disposition:** `KEEP AS EXACT NPM-ECOSYSTEM ADMISSION EVIDENCE / CANDIDATE WHEN NPM IS ADMITTED; NEVER UNIVERSALIZE`.

## 6. SBOM

### CycloneDX

CycloneDX 1.7 is the leading current build/Release inventory candidate. The
official Node ecosystem supplies `@cyclonedx/cyclonedx-npm`; the meta-package is
not itself the CI tool. A generated JSON BOM can describe components,
dependencies, hashes, licenses and relationships and can be attached as an
attestation predicate.

Deterministic Conexus use must suppress or normalize non-deciding random serials,
timestamps and tool-local ordering when computing the inventory digest, while
retaining a standards-valid emitted document where required.

An SBOM states observed composition. It does not prove authenticity,
vulnerability absence, reachability, license acceptance or build reproducibility.

**Disposition:** `LEADING SBOM FORMAT/TOOL FAMILY / EXACT VERSION NOT SELECTED`.

### SPDX

SPDX 3.0.1 is broader across software composition, build, provenance, licenses,
security and lifecycle. It is a credible interoperability alternative where a
consumer requires SPDX or license/compliance exchange beyond the current
CycloneDX use.

Generating two canonical BOMs without a consumer would create drift and proof
duplication.

**Disposition:** `INTEROPERABILITY CHALLENGER / DO NOT DUAL-OWN INVENTORY`.

## 7. Build provenance and artifact authenticity

SLSA v1.2 provides the leading vocabulary and predicate shape. Build provenance
identifies an artifact by digest and describes its build type, external/internal
parameters, resolved dependencies, builder and run details. Higher Build levels
add authenticated/unforgeable provenance and hosted/isolated builders.

Conexus must not claim a SLSA level until the exact selected builder and verifier
satisfy every requirement for that versioned level.

Sigstore/Cosign is a leading transport/verification candidate for container or
blob signatures and in-toto attestations. Bundle-based offline verification and
identity/issuer constraints are useful. Selecting keyless public transparency,
private trust roots or KMS keys depends on the B07 artifact/serving topology.

**Disposition:** `SLSA = LEADING PROVENANCE SEMANTICS / EXACT 4D-C ADMISSION REQUIRED`; `KEEP SIGSTORE/COSIGN AS B07-BOUND LEADING CANDIDATE`.

## 8. Vulnerability, license and maintenance Evidence

```text
advisory scan result
→ scanner + version
→ advisory database/source identity + observed time
→ exact lock/SBOM subject digest
→ finding severity, applicability/reachability and disposition
```

Rules:

- no blind `audit fix`, automatic major upgrade or lock rewrite;
- a clean scan means no matched known advisory in that exact Evidence snapshot;
- newly disclosed vulnerabilities can stale a previously admitted dependency;
- denied families/versions such as the existing Mastra denial fail before
  ordinary scoring;
- license expressions and notices are inventoried; unknown, custom or ambiguous
  licenses require exact adjudication;
- popularity, download count, age and OpenSSF-style scores are investigation
  signals, never admission authority;
- update bots may propose exact candidate lock changes, but cannot auto-admit,
  auto-merge or waive requalification.

## 9. Conformance mechanics

Conexus-specific invariants remain narrow executable checks close to their
owners:

- JSON Schema/OpenAPI validation for declared shapes;
- deterministic generator/manifest/tree digest checks;
- generated-wire bijection and no-parallel-DTO checks;
- owner/module/import/mutation-boundary checks using the smallest AST/schema/
  filesystem mechanism that can fire reliably;
- real browser/database/provider tests only for their named claims;
- mutation/negative controls proving each material guard can turn red.

OPA/Rego, Semgrep, generic policy catalogs and enterprise governance dashboards
remain reference mechanisms. Adopt one only if several current proven rules need
its semantics and the simpler owner-local checker becomes materially worse.

**Disposition:** `BOUNDED OWNER-LOCAL CHECKS LEADING / GENERIC POLICY PLATFORM REJECT CURRENT F1`.

## 10. Evidence receipt candidate

One generated admission receipt may reference, without merging, the Evidence:

```text
DependencyAdmissionReceipt
→ consumer/property and owner refs
→ runtime/package-manager/build-environment identities
→ manifest + lock digests
→ resolved package/source/integrity identities
→ install-script and registry policy result
→ signature/provenance verification result
→ SBOM identity + canonical inventory digest
→ advisory database/scan identity and findings disposition
→ license inventory/adjudication refs
→ conformance and firing negative-control refs
→ resulting artifact digest + build provenance ref when built
→ admitted/denied/unknown outcome
```

The receipt is generated Evidence. It is not a dependency Product owner, policy
engine or editable approval database. Release may close over its exact identity.

## 11. Required falsifiers

1. `B06-P1`: `package.json`/lock mismatch or floating runtime resolution fails admission.
2. `B06-P2`: altered resolved bytes/integrity or alternate registry identity fails.
3. `B06-P3`: unexpected lifecycle script or Git dependency fails before execution.
4. `B06-P4`: invalid signature/provenance identity fails; missing provenance remains explicit.
5. `B06-P5`: SBOM subject/inventory drift from the locked built artifact turns red.
6. `B06-P6`: SBOM, signature or clean advisory scan cannot alone produce full admission.
7. `B06-P7`: denied package/version fails even when scanners report no advisory.
8. `B06-P8`: stale advisory database or newly disclosed applicable issue stales the admission.
9. `B06-P9`: unknown/forbidden license cannot be normalized into accepted by tooling convenience.
10. `B06-P10`: generated/platform/app ownership or owner-boundary mutation makes conformance red.
11. `B06-P11`: every material positive guard has a deterministic firing negative control.
12. `B06-P12`: update automation can propose but cannot admit, merge or release a dependency.
13. `B06-P13`: artifact provenance verifies exact source/builder/inputs/subject or remains unverified.
14. `B06-P14`: no SLSA level is claimed from provenance existence alone.

## 12. Pass-1 outcome

```text
OPP-B06 PASS 1 = OPERATOR APPROVED
layered non-collapsible Evidence chain = LEADING ARCHITECTURE
npm ci + canonical lock = INCUMBENT RESOLUTION/INSTALL MECHANICS
exact Node/npm/build environment = REQUIRED / NOT YET SELECTED
npm signatures/provenance = NPM-ECOSYSTEM ADMISSION EVIDENCE / CANDIDATE ONLY
CycloneDX = LEADING SBOM CANDIDATE
SPDX = INTEROPERABILITY CHALLENGER
SLSA v1.2 semantics = LEADING BUILD-PROVENANCE STANDARD
Sigstore/Cosign = B07-BOUND LEADING SIGNATURE/ATTESTATION CANDIDATE
owner-local executable conformance = LEADING
generic policy/governance platform = REJECT CURRENT F1
automated dependency proposal = ALLOWED; AUTO-ADMISSION/MERGE = REJECT
exact tools/versions/policies/SLSA level = 0
Product implementation authority = 0
```
