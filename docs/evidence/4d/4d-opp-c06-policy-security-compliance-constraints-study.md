# 4D OPP-C06 — Policy, Security and Compliance Constraints Study

> **Status:** `PASS 1 OPERATOR APPROVED / SCF-11 REALIZE + DENY-ONLY CONSTRAINT ENVELOPE PROMOTED / GENERIC POLICY-COMPLIANCE OWNER REJECTED`
> **Inputs:** C-005/C-009/C-012/C-015/C-016/C-017; Security/I&A/Builder/Project/Gateway/Release owners; A03/B05/B06; first operational Builder and generated Budget Analyzer
> **Research date:** `2026-08-29`
> **Live scanner/policy/runtime execution:** `NOT PERFORMED / EXACT ADMISSION PROOF REQUIRED`
> **Implementation authority:** `BLOCKED`

## 1. Decision question

What constraint machinery must the first operational Builder and generated
Project have now, and what policy/security/compliance capabilities remain
mechanism choices or future regulated-consumer work?

## 2. Root cause and current consumer

The current consumer already exists:

```text
accepted owner invariants
→ Context Compiler / Project profile
→ exact WorkUnit + ActorRun + generated Project constraints
→ owner-local mechanical enforcement
→ firing Evidence
→ Builder acceptance / Release recheck through existing owners
```

`SCF-11` previously preserved this as a future seam. That disposition is stale:
the first operational Budget Analyzer must traverse the real Builder, and the
Builder cannot safely create/evolve the Project without exact constraints.

The missing capability is not a generic Policy engine. It is deterministic
compilation of existing owner-backed constraints into the exact execution and
conformance subject, with deny-only semantics and proof that every deciding
guard fires.

## 3. Authority and non-collapsible layers

```text
owner requirement / protected property
!= constraint projection
!= evaluator result
!= scanner finding
!= Evidence/admission receipt
!= Change acceptance / Release / authorization
!= legal or regulatory compliance
```

Constraints can only narrow. Product authorization remains server-derived from
I&A and the exact operation owner. Gateway continues to derive destinations,
bindings and credentials. Builder, Project, Release and each security owner keep
their existing truth. A constraint result cannot permit an operation that those
owners deny or manufacture a missing grant.

## 4. Mechanism-neutral constraint envelope

Every material constraint projection must close over an equivalent exact set:

```text
constraint ID + semantic owner ref
source identity + source digest
exact Workspace/Project/profile/subject applicability
language/dialect + compiler/evaluator identity
capability/ABI/version contract
input schema ref + digest
exact entrypoint and enforcement stage(s)
effect class = DENY_ONLY
canonical violation-output contract
test corpus + firing-negative-control digest
```

The constraint compiler emits the smallest applicable set for one exact
WorkUnit/ActorRun/Project conformance subject. It does not invent content or
inherit authority from a generic hierarchy. Missing, stale, wrong-scope,
conflicting, undefined or failed deciding evaluation is refusal/`NOT_PROVEN`,
never pass.

Canonical violation output must be safely explainable and deterministic:

```text
constraintId
owner/source ref + artifact digest
subject/input coordinate
safe message + Evidence detail
evaluation identity/status
```

No secret, raw sensitive input or hidden authority is required in the output.

## 5. Enforcement map

Prompt/skill text can shape cognition but is never the sole enforcement for a
reachable protected state.

| Stage | Current enforcement owner/mechanism class |
| --- | --- |
| Profile/generation | schema, deterministic tree/manifest and ownership guards |
| Builder dispatch | server-compiled tools/context/budget/scope; no inherited secrets or authority |
| Source/static verification | exact owner-local AST/schema/filesystem checks and bounded security scanners |
| Runtime request/effect | current I&A/owner/Gateway checks; constraint snapshot never substitutes |
| Real boundary proof | browser, PostgreSQL, provider, E2B and recovery tests for their named claims |
| Acceptance/Release | Builder/Release consumes current Evidence identities; no evaluator self-acceptance |

Every material constraint names all reachable enforcement paths. A static rule
cannot claim runtime coverage, and a runtime check cannot replace deterministic
source/profile drift protection.

## 6. Constraint-language candidates

### JSON Schema + owner-local executable checks

This is the smallest current baseline. JSON Schema owns declared structure;
small owner-local AST/schema/filesystem/runtime checks own exact semantic denies.
It matches current repository practice and introduces no new authority/runtime.

**Disposition:** `LEADING CURRENT BASELINE / EXACT CHECK MECHANISMS UNSELECTED`.

### OPA / Rego

OPA is the credible broad challenger: rich structured-data rules, set-valued
violations, tests, coverage, explanations, bundles, revisions/signatures and
native/Wasm deployment. Its general-purpose outputs, undefined/error behavior,
dynamic data and optional effectful/host built-ins create a material admission
surface. OPA must be wrapped by the deny-only host contract; language convention
is insufficient.

**Disposition:** `KEEP AS IMPLEMENTATION ALTERNATIVE`; trigger when several
current heterogeneous rules make owner-local checks materially worse.

### CEL

CEL is the strongest narrow expression challenger: mutation-free, terminating,
deterministic-by-design evaluation with optional checked AST. It is not a policy
bundle, provenance, testing or explanation system, and current TypeScript fit is
weaker than its Go/Java/C++ implementations.

**Disposition:** `DEFER WITH DATA-DEPENDENT EXPRESSION CONSUMER TRIGGER`.

### Conftest and CUE

Conftest is an OPA/Rego CI adapter for structured files, not the Conexus runtime
seam. CUE's unification is powerful for configuration constraints but risks
becoming a second schema/config/generation authority beside canonical JSON
Schema and the Project profile compiler.

**Disposition:** `REFERENCE / CONDITIONAL CHALLENGERS`.

### Cedar and OpenFGA

Cedar and OpenFGA are authorization mechanisms. Cedar's principal/action/
resource permit+forbid ontology and OpenFGA's mutable relationship tuples/model
store would duplicate Conexus I&A/Permission authority rather than realize a
deny-only Builder constraint seam.

**Disposition:** `REJECT CURRENT C06`.

## 7. Security analysis and Evidence

### Semgrep and CodeQL

Semgrep is the strongest bounded local/CI candidate for fast generated-code
structural controls such as forbidden imports, direct enterprise egress and
unsafe API patterns. CodeQL is the deeper challenger for cross-file/global
JavaScript/TypeScript dataflow and taint classes. Neither proves absence of
vulnerabilities, and their exact feature/licensing/topology differs.

```text
Semgrep = BOUNDED STRUCTURAL SECURITY CANDIDATE
CodeQL  = CROSS-FILE DATAFLOW CHALLENGER
exact SAST selection = OPEN
```

A security scan receipt is derived Evidence under existing `VER-03/04`, not a
new owner/record. It binds exact source/artifact subject, tool/engine/version,
ruleset/config digests, language/path coverage and exclusions, feed/database
identity/freshness where applicable, completion/error state, findings and exact
dispositions.

Timeout, crash, unsupported language, stale feed/rules or skipped protected path
is `INCOMPLETE/NOT_PROVEN`, not zero findings. Each claimed deterministic rule
has a positive boundary fixture and a firing negative fixture.

### SCA, SBOM, signatures and provenance

OSV-Scanner, Trivy, Syft/Grype, CycloneDX/SPDX, SLSA, Sigstore/Cosign and OpenSSF
Scorecard remain entirely routed through B06/B07 and `VER-06`. C06 consumes their
exact admission Evidence; it does not create a second scanner score or receipt.

## 8. Finding disposition and exceptions

Findings route through existing Builder Finding/Evidence and owner acceptance.
The Builder cannot waive its own material finding.

Any suppression that becomes necessary must bind:

```text
exact rule + finding + subject/profile digest
+ owning authority
+ reason and compensating proof
+ expiry/revisit trigger
```

Untracked inline ignore, broad path exclusion, inherited cross-Project waiver or
expired suppression is invalid. No generic durable Exception database is current;
a real lifecycle that cannot fit existing Finding/Evidence/Change authority is a
named reopen trigger.

## 9. Standards and compliance claims

OWASP ASVS is a useful versioned web-application security requirements vocabulary.
Conexus may map only exact applicable requirement IDs to exact Evidence; the
whole catalogue is not imported by declaration. OWASP SAMM and NIST SSDF are
organization/process improvement references, not per-Project executable gates.
SLSA remains the B06 supply-chain vocabulary.

```text
requirements mapping != certification
scanner clean          != secure
process maturity       != Product conformance
signature/SBOM         != correctness
pack/check count       != regulatory compliance
```

There is no current HIPAA, PCI DSS, SOC 2 or other named regulated Project
consumer. A future exact obligation may introduce an applicable pack/projection,
but only through its real owner, scope, evidence and exception lifecycle.

## 10. Ledger adjudication

No new Policy/Security/Compliance family is justified. The independently
proposed candidate seams map as follows:

| Candidate seam | Existing owner route |
| --- | --- |
| generated constraint profile / propagation | refined `SCF-11` + `SCF-09` + `CON-05` |
| evaluator failure/firing | `VER-03/04/10` |
| scanner Evidence envelope | `VER-03/04`; B06/`VER-06` for dependencies |
| source/profile drift and protected seams | `SCF-03/09/11` + `CON-04/05` |
| Builder finding disposition | Builder Finding/Evidence/Change authority |
| current authorization/egress | `AUT-01..06` + `INT-01..04` |
| Release/current proof | `REL-01..03` |

The sole ledger change is correcting `SCF-11` from `PRESERVE_SEAM` to `REALIZE`
and making its current consumer, deny-only envelope and proof explicit.

## 11. Required falsifiers

1. `C06-P1`: identical sources/digests/applicability compile identical canonical constraint sets and receipts.
2. `C06-P2`: stale, missing, wrong-Project/profile/subject or conflicting deciding constraint refuses dispatch/conformance.
3. `C06-P3`: constraint attempting to emit allow, add tools/data/network/secrets/Permission, approve or rewrite owner state is rejected.
4. `C06-P4`: clock, random, network, filesystem, environment or undeclared host built-in is rejected for deterministic constraint evaluation.
5. `C06-P5`: malformed input, schema mismatch, undefined result, unknown entrypoint, evaluator error or ABI/capability mismatch cannot pass.
6. `C06-P6`: every material deterministic rule has one firing RED fixture; zero tests or non-firing control blocks its claim.
7. `C06-P7`: edit/shadow/delete generated constraint/rule/config or widen exclusions from app-owned code creates drift/refusal.
8. `C06-P8`: authorization revoked after compilation still denies at the current owner boundary; constraint snapshot grants nothing.
9. `C06-P9`: direct Sankhya/enterprise fetch, alternate destination/credential or protected auth/CSP/wire seam weakening turns exact guards red.
10. `C06-P10`: clean scanner result alone cannot accept Change, compose Release or assert security/compliance.
11. `C06-P11`: scanner timeout/error/stale feed/unsupported language/skipped path produces `INCOMPLETE/NOT_PROVEN`.
12. `C06-P12`: each claimed scanner rule fires on a deliberately vulnerable representative fixture; static clean cannot close a real runtime-boundary claim.
13. `C06-P13`: suppression with changed subject/rule, missing owner/reason/proof, broad scope or expiry fails; Builder self-waiver is denied.
14. `C06-P14`: ASVS requirement without matching Evidence or with unjustified `N/A` remains incomplete.
15. `C06-P15`: ASVS/SAMM/SSDF mapping, scanner output, Scorecard, signature, SBOM or SLSA provenance cannot become certification or Product acceptance.
16. `C06-P16`: OPA native/Wasm or any evaluator candidate must match the owner-local reference oracle on result, errors and canonical violations before adoption.
17. `C06-P17`: Cedar/OpenFGA policy/model/tuple cannot grant or replace a Conexus Permission/authorization decision.

## 12. Selection path and reopen triggers

At the exact 4D-C/D row:

```text
constraint baseline:
  JSON Schema + owner-local exact checks
  vs OPA only when a measured multi-rule trigger fires
  vs CEL only for a real bounded expression consumer

security analysis:
  bounded Semgrep
  vs CodeQL where cross-file/dataflow coverage is required
```

Compare correctness/firing, error handling, deterministic canonical output,
offline operation, subject/rule provenance, false-positive/negative behavior,
runtime/CI footprint, license/topology and Builder maintenance. Feature breadth
cannot select a mechanism.

Reopen Product/owner decisions only if a real regulated obligation requires a
new semantic lifecycle; a legally required exception/attestation cannot fit
existing owners; cross-Project live revocation/propagation cannot be represented
by pinned profile compilation; or a live runtime constraint cannot fit current
I&A/security/Gateway enforcement.

## 13. Current primary sources

- [OPA policy language](https://www.openpolicyagent.org/docs/policy-language),
  [bundles](https://www.openpolicyagent.org/docs/management-bundles),
  [Wasm](https://www.openpolicyagent.org/docs/wasm) and
  [testing](https://www.openpolicyagent.org/docs/policy-testing);
- [Cedar authorization semantics](https://docs.cedarpolicy.com/auth/authorization.html)
  and [validation](https://docs.cedarpolicy.com/policies/validation.html);
- [OpenFGA concepts](https://openfga.dev/docs/concepts) and
  [immutable models](https://openfga.dev/docs/getting-started/immutable-models);
- [CUE](https://cuelang.org/docs/), [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/json-schema-validation)
  and [CEL specification](https://github.com/cel-expr/cel-spec);
- [Semgrep custom/CI documentation](https://semgrep.dev/docs/),
  [CodeQL query suites](https://docs.github.com/en/code-security/concepts/code-scanning/codeql/codeql-query-suites)
  and [JavaScript/TypeScript dataflow](https://codeql.github.com/docs/codeql-language-guides/analyzing-data-flow-in-javascript-and-typescript/);
- [OSV-Scanner v2](https://google.github.io/osv-scanner/usage/),
  [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/),
  [OWASP SAMM](https://owaspsamm.org/model/) and
  [NIST SSDF 1.1](https://csrc.nist.gov/pubs/sp/800/218/final).

## 14. Pass-1 outcome

```text
OPP-C06 PASS 1 = OPERATOR APPROVED
SCF-11 deny-only digest-pinned constraint seam = REALIZE
first operational Builder + generated Budget Analyzer = CURRENT CONSUMERS
new Policy/Security/Compliance Product owner/record = 0
JSON Schema + owner-local checks = LEADING CURRENT BASELINE
OPA/Rego = BROAD IMPLEMENTATION ALTERNATIVE / TRIGGER REQUIRED
CEL = NARROW CHALLENGER / TRIGGER REQUIRED
Conftest/CUE = REFERENCE / CONDITIONAL CHALLENGERS
Cedar/OpenFGA = REJECT CURRENT C06
Semgrep = BOUNDED STRUCTURAL SECURITY CANDIDATE
CodeQL = CROSS-FILE DATAFLOW CHALLENGER
security scanner result = VERSIONED EVIDENCE / NEVER SECURITY OR COMPLIANCE TRUTH
OWASP ASVS = BOUNDED REQUIREMENTS-VOCABULARY CANDIDATE
SAMM/SSDF = ORGANIZATIONAL REFERENCES
B06/B07 supply-chain admission = REUSE / NO DUPLICATION
new ledger IDs = 0 / SCF-11 REFINED
exact engine/scanner/standard mapping/version = 0
Product implementation authority = 0
```
