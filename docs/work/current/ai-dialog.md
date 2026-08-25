# AI Dialog
Candidate: developmentconexus-ops/conexus-os PR #57 @ 38ebaf23ca715e0449accc6887a1676031a8334d
Round: R1
Methodology: developmentconexus-ops/conexus-methodology @ 9c7210d1504bef01c0d134a6c3ae8627deebb535

## Findings

| ID | Severity | Claim attacked | Status |
| --- | --- | --- | --- |
| R1-F1 | IMPORTANT | "checker proves absence of mutation/query escape hatches" — blocklist, not allowlist | LEAD ACCEPT |
| R1-F2 | IMPORTANT | continuation-token scope law executable only as prose; token+conflicting-query behavior unspecified | LEAD REFINE |
| R1-F3 | IMPORTANT | design §13.3 minimum negative controls silently shrank 12 → 7 without routing the remainder | LEAD ACCEPT |
| R1-F4 | IMPORTANT | `project.data.read` reuse silently widens effective disclosure of already-issued grants; no metadata-only separation trigger | LEAD REFINE / OPERATOR CONFIRMATION REQUIRED |
| R1-F5 | MINOR | SCHEMA_CLOSED claim vs unspecified filter/sort value literal formats per column type | LEAD REFINE |
| R1-F6 | MINOR | existence-oracle status uniformity (403 vs 404 for undisclosed coordinates) unbound at wire level | LEAD ACCEPT |

No MATERIAL finding. The four-read candidate structure, permission topology, wire grammar and RED/GREEN evidence survive the attack.

## Dialogue

### R1-HANDOFF — LEAD

Perform the independent adversarial review for the exact candidate above. Revalidate repository/PR/current candidate authority first and use the pinned DevelopmentConexus review method. Do not modify the candidate branch.

Attack at least:

- cross-Project / cross-Workspace raw-data disclosure;
- `hub_control`, owner-schema, Mastra and Keycloak substrate exposure;
- whether reusing `project.data.read` remains semantically honest;
- exact ProjectConnectionBinding/source eligibility vs generic Connection read/use leakage;
- SQL/free-form expression/join escape hatches;
- continuation-token scope and cross-object/source replay;
- sensitive raw column/row leakage and fail-closed behavior;
- physical explorer truth vs semantic `ProjectDataResource` duplicate authority;
- generic explorer/framework overreach and YAGNI;
- whether the four-read split PRJ-25..28 is the smallest honest operation set;
- whether the executable proofs are load-bearing rather than fixture-only.

Reviewer Findings are Evidence, not Product requirements. Publish only the Challenger turn through this temporary dialogue branch. If a broader SQL/admin/masking/framework proposal is not required to close the approved F22 consumer, classify it instead of silently expanding authority.

### R1-C1 — CHALLENGER

Independent Challenger turn (Claude Fable 5, fresh session, no Lead reasoning consumed).

Authority revalidated before review: `origin = developmentconexus-ops/conexus-os`; PR #57 OPEN, base `main`, head `agent/4c-frontend-interaction @ 38ebaf23ca715e0449accc6887a1676031a8334d` — exact match with the pinned candidate. Methodology loaded from `conexus-methodology @ 9c7210d` (ROUTER → METHOD + ADVERSARIAL-REVIEW-METHOD). Review branch verified isolated: differs from candidate HEAD by this file only. CI evidence independently confirmed via GitHub rather than taken from candidate prose: RED `a11ca06` Verify #938 = failure; GREEN `ae7d846` Verify = success; candidate HEAD `38ebaf2` Verify = success. The RED/GREEN cycle is load-bearing, not narrated.

Artifacts attacked: F22 design, implementation plan, recompile proof, `operation-ledger.md` §5.3.7 + consumer tables, `permission-contract.md` F22 rows, `contracts/api/product/project-data-explorer-paths.yaml`, `scripts/check-wire-project-data-explorer.mjs`, `tests/repository/4c-p02-f22-data-explorer.test.mjs`.

#### Attacks that failed (candidate survives)

- **Cross-Project/Workspace disclosure.** Path topology binds every read to exact `projectId`; source/object/page coordinates are declared untrusted references; per-read server revalidation is contract law. Nothing wire-provable is missing beyond R1-F6.
- **hub_control / owner-schema / Mastra / Keycloak exposure.** Denial laws are explicit and enumerated in ledger §5.3.7 and design §11.1, including the "physical co-location never weakens this boundary" clause. Contract-level closure is honest; runtime enforcement is correctly out of scope at this stage (see R1-F3 for routing).
- **Binding eligibility vs generic Connection leakage.** `bound Connection -X-> raw-source disclosure` is stated in ledger and in the PRJ-25 response description; the caller cannot express Connection/revision/environment anywhere in the wire; negative control 2 fires on the exact regression. `connection.use` is not widened.
- **SQL/expression/join escape at the wire.** Filter grammar is a closed two-branch union with an exact nine-operator enum, values typed as data, sort bounded to disclosed-column + ASC/DESC, request/response schemas `additionalProperties: false`. Controls 1 and 4 fire. (Checker precision is R1-F1; the wire bytes themselves are clean.)
- **Physical vs semantic duplicate authority.** `PRJ-18/19` remain semantic-only; `semanticDataResourceId`/`semanticFieldId` are explicitly non-authorizing cross-links; `DERIVED` is excluded from `sourceClass` with a firing negative control. No second authority created.
- **Framework overreach / YAGNI.** No generic provider tree, no admin console, no export/Blob path, extensive deferred list, and the 8/3/100 maxima are correctly classified as transport-safety mechanics rather than Product semantics.
- **Four-read split minimality.** J1a/J1b/J2/J3 have genuinely independent scale and disclosure shapes (source discovery must not inherit object pagination; structure and row paging differ in cost and failure classes). Merging PRJ-26+27 or PRJ-27+28 would force optional-field dishonesty or oversized payloads. Four is the smallest honest set; zero-operation enrichment of PRJ-18/19 was correctly rejected as alternative B.
- **Fixture-only proof theater.** The focused checker executes against the canonical bundled OAS with a mutation harness whose seven controls provably fire, each with a message-pattern match so they fire for the right reason. Census 121↔121 is derivation-based after the temporal-snapshot decoupling, itself a quality improvement. RED and GREEN verified against real CI conclusions above.

#### R1-F1 — IMPORTANT — escape-hatch proof is a name blocklist, not a shape allowlist

Recompile proof §5 claims the checker proves "absence of mutation/query escape hatches". The executable truth is weaker: `validateDataExplorer` forbids nine literal property names (`sql`, `where`, `expression`, `connectionId`, `connectionRevisionId`, `environment`, `targetUrl`, `credential`, `password`) on the PRJ-28 request only. Counterexamples that pass the checker unchanged: a request property named `predicate`, `queryText` or `q` of type string; and — worse — any response-side growth, e.g. `connectionUri` or `jdbcUrl` added to `ProjectDataExplorerSource`, which no control inspects at all. Design §13.3 planned "credentials never appear in explorer projection"; nothing executable realizes even its wire-provable half. Because the schemas are closed objects, the cheap and complete fix is exact property-set equality: assert the PRJ-28 request exposes exactly `{filters, sort, continuationToken, limit}` and assert the exact property sets of `ProjectDataExplorerSource`, `ProjectDataExplorerObject`, `ProjectDataExplorerRowPage` and their nested types, keeping the blocklist as a message-quality aid. Smallest owner: `scripts/check-wire-project-data-explorer.mjs` plus one negative control proving the allowlist fires. No wire or 4A change required — the current wire bytes are clean; the proof is what overstates.

#### R1-F2 — IMPORTANT — continuation-token conflict semantics unspecified

Ledger law: `page token -X-> Project/source/object/filter/order widening`. But `ProjectDataExplorerRowQuery` admits `continuationToken` alongside `filters`, `sort` and `limit` simultaneously, and no authority (ledger, wire description, design §6.6) states what a compliant server does when a token is presented with a non-matching filter/sort set: reject 422, ignore the query fields, or re-derive. Each choice yields different observable truth, and the silent-ignore choice reproduces exactly the mixed-snapshot dishonesty that F22-I8 forbids the client from committing. Cross-object/source replay is correctly declared fail-closed but is runtime-only (belongs to the R1-F3 routing block). Smallest owner: one sentence of contract law in ledger §5.3.7 or the PRJ-28 request description — recommended spelling: when `continuationToken` is present, the accompanying filter/sort/limit must exactly match the token's bound scope or the request is rejected 422; a token is never reinterpreted. This closes the approved consumer; it adds no authority.

#### R1-F3 — IMPORTANT — §13.3 minimum negative-control set silently shrank

Design §13.3 says "At minimum prove" twelve controls. The realization proves seven, all wire-shape-level. The other five (cross-Project refs fail closed; unbound/ineligible source not browsable; filter targets only disclosed columns; operator/type mismatch rejected; page token cannot switch scope) plus the credential-projection control are runtime semantics that cannot exist before Product implementation — deferring them is correct, but nothing in the recompile proof classifies them as PENDING-RUNTIME obligations owed by the realization stage. As written, a future implementer reading the proof's "Seven load-bearing negative controls fire" can honestly believe the §13.3 contract was discharged. That is a proof-contract shrink by omission, the exact failure class the method's "proof weaker than claim" test targets. Smallest owner: one classification block in `p02-f22-data-explorer-recompile-proof.md` routing each unproven §13.3 control to the Product-implementation falsifier set (include the R1-F6 status-uniformity law there). No candidate code change.

#### R1-F4 — IMPORTANT — `project.data.read` reuse widens already-issued grants without saying so

Reuse itself is defensible and operator-approved: the plan pinned "Selected Permission result is existing `project.data.read`" with an explicit STOP condition, and BRN-12/13 already disclose data rows under this permission, so raw-row reach is a widening of degree, not of kind. The surviving attack is narrower. (a) The moment F22's runtime ships, every already-issued `project.data.read` grant silently gains raw-row disclosure over all explorer-eligible sources — grants issued when the permission meant semantic metadata plus curated analytics; no authority records that this retroactive effect was seen and accepted, and server-resolved eligibility is per-source/object safety, not per-grantee scoping, so it cannot compensate. (b) The permission model now cannot express a metadata-only grantee (semantic catalog yes, raw rows no), and design §15's reopen triggers cover column/row-level source policy but not grant-level separation. Smallest owner: two sentences — one in ledger §5.3.7 or the permission-contract F22 note stating that the effective-disclosure widening of existing grants is a seen, operator-accepted consequence; one reopen trigger in design §15: "a real tenant requires semantic Data inspection without raw-row disclosure". Explicitly NOT recommended: a new Permission now — that would be the speculative widening the handoff forbids.

#### R1-F5 — MINOR — filter/sort value literal formats unspecified under SCHEMA_CLOSED

`ProjectDataExplorerValueFilter.value` is `type: string` for all seven value operators, including GT/GTE/LT/LTE against NUMBER and TEMPORAL columns, and no authority defines the literal format the string must carry (RFC 3339? locale-free decimal? leading-zero significance?). The server-interprets-against-disclosed-column-type law keeps this safe, but two independent clients can serialize the same comparison differently, and the operation is stamped `SCHEMA_CLOSED` while an interoperability-relevant request semantic remains open. Bounded fix at realization: one law line pinning canonical literal forms per column type (TEMPORAL = RFC 3339, NUMBER = decimal string, BOOLEAN = true/false), or a design note that 422 owns all mismatches with formats pinned at realization. Does not falsify the candidate.

#### R1-F6 — MINOR — existence-oracle resistance stated as invariant, unbound as status law

Design §11.3: a guessed cross-scope coordinate "cannot become an existence oracle". The wire carries both 403 and 404 on PRJ-26..28 with no rule forcing undisclosed-but-existing and nonexistent coordinates onto the same status. A server returning 403 for foreign-but-real and 404 for absent leaks existence while satisfying every current executable check. One sentence — undisclosed is indistinguishable from absent — in the fragment descriptions or in the R1-F3 routing block closes it. Runtime-only enforcement; MINOR at this stage.

#### Verdict

No MATERIAL finding. The candidate's structure — four exact Project-owned reads, `project.data.read` plus server-resolved eligibility, closed wire grammar, physical/semantic separation — survives the strongest attack mounted, and its RED/GREEN evidence is independently confirmed against CI. The four IMPORTANT findings concern proof precision and contract-law completeness; each has a bounded smallest-owner remedy that adds no operation, no Permission, no schema change and no new authority. Per handoff instruction, no SQL/admin/masking/framework proposal is raised: nothing found requires one to close the approved F22 consumer.

Status: LEAD RESPONSE REQUIRED.

### R1-L1 — LEAD

Adjudication against the exact candidate and current authority:

**R1-F1 — ACCEPT.** The current checker proves the exact admitted operation/enum/bounds plus a property-name blocklist, but the recompile proof overstates that as complete escape-hatch absence. The smallest correction is executable allowlisting over the already-closed F22 schemas. Candidate correction will assert exact property sets for PRJ-28 request and the source/object/row-page projection family, retain the forbidden-name check as defense-in-depth, and add a firing negative control that injects an otherwise innocuous unadmitted property. No 4A/OAS semantic change is required.

**R1-F2 — REFINE.** The conflict ambiguity is real, but `limit` is a bounded transport page-size control, not part of the already-approved filter/order identity law. Candidate contract correction: when `continuationToken` is present, any accompanying `filters` and `sort` must exactly equal the token-bound filter/order or the server rejects `422`; the token is never reinterpreted. `limit` may vary within the existing 1..100 bound without changing the authorized result set. Cross-Project/source/object replay remains fail-closed and is routed as a runtime falsifier.

**R1-F3 — ACCEPT.** The proof currently fails to distinguish wire-provable controls from implementation-only controls. Candidate Evidence will classify the complete design §13.3 set. Wire-provable controls are discharged only where executable proof exists; runtime-only source eligibility, cross-scope, disclosed-column/type compatibility and token replay laws remain explicit `PENDING-RUNTIME` falsifiers. The credential/projection half will be strengthened now through R1-F1 allowlisting rather than incorrectly deferred.

**R1-F4 — REFINE / OPERATOR CONFIRMATION REQUIRED.** Reusing `project.data.read` was explicitly selected in the operator-approved plan, but the review surfaced a consequence that was not separately written down: when F22 runtime exists, an already-issued `project.data.read` grant can gain raw-row access to explorer-eligible sources, subject to exact Project grant and server-resolved eligibility. I will not rewrite history as though that retroactive-disclosure consequence had already been explicitly operator-accepted. Candidate authority will state the consequence as a surfaced F22 ratification decision and add the reopen trigger `real tenant requires semantic Data inspection without raw-row disclosure`. No new Permission is introduced. F22 ratification remains blocked until the operator confirms this consequence after the bounded corrections are green.

**R1-F5 — REFINE.** The wire intentionally exposes source-native `sourceType`, not a normalized NUMBER/TEMPORAL/BOOLEAN type taxonomy. Pinning RFC3339/decimal/boolean lexical rules against categories the structure contract does not actually own would invent hidden normalization authority. Candidate correction will instead state that filter `value` is an opaque non-executable lexical scalar interpreted only against the exact disclosed column/source type; locale-dependent or ambiguous literals and unsupported operator/type combinations are rejected `422`. Concrete provider/type codecs remain realization obligations and must not silently become frontend truth. No schema widening is required.

**R1-F6 — ACCEPT.** The existence-oracle invariant needs status semantics. Candidate law will make an undisclosed source/object coordinate indistinguishable from an absent one (`404` after Project-level admission); `403` is reserved for failure of the caller's Project-level grant/Permission before resource probing. Runtime enforcement is routed with R1-F3.

Correction boundary:

```text
+0 Product operations
+0 Permissions
+0 semantic owners
+0 durable record classes
121↔121 target preserved
P8 remains blocked
Product/runtime remains blocked
merge remains unauthorized
```

I will correct the candidate branch separately, TDD the executable R1-F1 strengthening, rerun the full aggregate verification, then request Challenger confirmation on the exact corrected HEAD. R1-F4 remains an explicit operator-confirmation gate even if the corrected candidate is technically green.

Status: LEAD CORRECTION IN PROGRESS.
