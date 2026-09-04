# 4D OPP-B04 — Sankhya Gateway/API and Reconciliation Study

> **Status:** `PASS 1 CORRECTED / OPERATOR APPROVED`
> **Inputs:** Budget Analyzer owner; accepted Connections distinction; RP-G0.2; `INT-01..06`; `VER-05`; `3O-P1..P7`; Mitra live Evidence
> **Research date:** `2026-08-28`
> **Live provider execution:** `NOT AUTHORIZED / NOT PERFORMED`
> **Implementation authority:** `BLOCKED`

## 1. Falsifier and correction boundary

The first B04 pass incorrectly made `node-oracledb` the leading Sankhya
adapter and inferred Oracle SCN/Flashback as the leading reconciliation
coordinate. The operator rejected that boundary: Sankhya is the ERP and its
Gateway/API is the integration surface; its backing database does not provide
the business services that create orders or invoice them.

This is a material falsifier, not a preference. Accepted 4C authority already
requires:

```text
Sankhya API connector != Oracle Database connector
```

The former pass is retained in Git history and summarized here as negative
Evidence. Its dependency and coordinate conclusions have no standing.

## 2. Decision questions

1. What provider-faithful Sankhya connector preserves credential, environment,
   tenant/company, capability and External Effect authority?
2. How should official business APIs, entity APIs and the observed DB Explorer
   capability coexist without turning the Gateway into arbitrary caller proxy
   or unrestricted production SQL?
3. Which Sankhya-exposed coordinate and traversal can establish equal coverage
   for independent source-oracle and governed candidate reconciliation?

## 3. Current Evidence

Current official Sankhya documentation establishes:

- OAuth 2.0 Client Credentials uses `client_id`, `client_secret` and `X-Token`,
  with separate production and sandbox credentials/environments;
- Gateway routes authenticated calls to Sankhya modules and services;
- business APIs can create a sales order, include movements and invoice a
  confirmed order into a fiscal document while applying Sankhya/TOP rules;
- query APIs include paginated and `modifiedSince`-filtered resources, with
  provider-specific prerequisites such as the Sankhya change log;
- legacy service calls expose provider transaction identifiers for particular
  effects, but no current documentation proves that such an identifier is a
  reusable cross-query analytical snapshot coordinate.

Primary sources:

- [Sankhya integration guide](https://developer.sankhya.com.br/reference/guia-integracao)
- [OAuth 2.0 authentication](https://developer.sankhya.com.br/reference/post_authenticate)
- [Gateway requests](https://developer.sankhya.com.br/reference/requisi%C3%A7%C3%B5es-via-gateway)
- [Create sales order](https://developer.sankhya.com.br/reference/addpedido)
- [Include movements](https://developer.sankhya.com.br/reference/post_incluimovimentos)
- [Invoice movements](https://developer.sankhya.com.br/reference/post_faturamovimento)
- [Query NF-e headers](https://developer.sankhya.com.br/reference/getnfe)

Mitra live Evidence establishes a useful but separate precedent:

- a named Sankhya connection handle resolves a versioned blueprint and injects
  credentials server-side; credentials never belong in browser or repository;
- calls go through `/gateway/v1/...`, including the observed
  `DbExplorerSP.executeQuery` service;
- DB Explorer enabled real schema/data discovery and read-model synchronization
  and exposed tenant-specific customizations that generic prior knowledge got
  wrong;
- the observed service had a 5,000-row limit and required explicit pagination;
- the same credential exposed six production schemas, demonstrating material
  blast radius and the need for company/schema/environment qualification;
- the Mitra study found `DbExplorerSP.executeQuery` was not in the official
  documentation it inspected. It is therefore a provider capability requiring
  controlled qualification, not a silently assumed public contract.

## 4. Correct integration topology

```text
ProjectConnectionBinding
→ exact Sankhya Connection revision + environment + admitted company scope
→ Capability Gateway resolves connector definition and credential handle
→ Credential Backend supplies client secret / X-Token at the last mile
→ Sankhya Gateway/API
   ├─ official business operation adapter
   ├─ official entity/query adapter
   └─ qualified DB Explorer adapter, when explicitly admitted
→ provider response / Project staging / governed result
```

The connector is not `node-oracledb`. Oracle host, port, service, database user,
password, pool and SCN are not Sankhya connection inputs. An independently
owned Oracle Database connector may exist for a different Product use, but it
cannot be substituted for a Sankhya Connection.

The runtime implementation should depend on standard server-side HTTP/OAuth
mechanics unless exact Sankhya requirements falsify them. No Sankhya-specific
Node SDK or HTTP library is selected in this pass.

## 5. Capability model

### Official business operations

These are the leading path for business effects: create/update an order,
include a movement, invoice/faturar, and retrieve the resulting document.
Each Conexus operation maps to an exact admitted Sankhya operation and schema;
the caller never supplies arbitrary `serviceName`, endpoint or credentials.

Provider transaction IDs, `NUNOTA` and order↔invoice links are operation
provenance/effect identity. They are not automatically analytical snapshots.

**Disposition:** `LEADING FOR BUSINESS EFFECTS / NOT INSTANTIATED BY F1 READ-ONLY SYNC`.

### Official entity/query APIs

Use where they cover the accepted semantic population and expose sufficient
company scope, filters, pagination and change semantics. `modifiedSince` is a
candidate incremental input only where its provider prerequisite is qualified;
it does not alone prove stable full comparison coverage.

**Disposition:** `LEADING FOR SUPPORTED READS / EXACT COVERAGE PROBE REQUIRED`.

### DB Explorer through Sankhya Gateway

DB Explorer is valuable for controlled discovery and tenant-specific read
coverage when official entity APIs are insufficient. It remains a Sankhya
Gateway capability. Its underlying SQL dialect or storage engine is an
implementation detail of that provider path.

Required adaptation:

- server-owned, Release-pinned query artifacts; no caller-supplied SQL;
- read-only operation and explicit allowlisted company/schema/object scope;
- binds for values and validated identifiers/topology;
- bounded rows/pages/time with deterministic ordering and duplicate/drop checks;
- production/homologation separation and dedicated least-authority credential;
- qualification of service availability, response shape and rate/burst limits;
- Product-safe errors plus trusted diagnostics and Evidence.

**Disposition:** `BOUNDED HIGH-VALUE ADAPTER / QUALIFICATION REQUIRED`.

### Generic arbitrary Gateway proxy

A caller-selectable endpoint, method, `serviceName`, destination, credential or
SQL text would transfer External Effect and query authority to the caller.

**Disposition:** `REJECT`.

### Direct Oracle access as the Sankhya adapter

It bypasses Sankhya business services, contradicts the accepted connector
distinction and requires unrelated database credentials/topology.

**Disposition:** `REJECT FOR SANKHYA`; only a separately owned Oracle Database
Connection and separately accepted Product requirement could reopen it.

## 6. Honest reconciliation boundary

No current Evidence proves a Sankhya API cross-call snapshot token. Therefore:

- freshness time, sync completion time and OAuth token time are not comparison
  coordinates;
- a service transaction ID is not promoted beyond the exact effect it names;
- Oracle SCN/Flashback is forbidden as an inferred Sankhya contract unless the
  Sankhya API itself explicitly exposes and supports it for this purpose;
- `modifiedSince` is a change filter, not proof that multiple pages share one
  immutable snapshot;
- offset pagination over changing data cannot claim `MATCH` without closure.

The leading provider-faithful hypothesis is a qualified Sankhya extraction
boundary:

```text
exact Connection revision + environment + company scope
+ exact provider operation/query artifact revisions
+ provider-supported lower/upper change boundary, if proved
+ deterministic ordered traversal and page coverage evidence
+ extraction start/end and mutation/duplicate/drop checks
```

If the official API cannot close the required Budget population, a bounded DB
Explorer query set may provide the independent source extraction. That still
does not prove cross-query snapshot consistency. The real provider probe must
show either one provider-supported stable boundary or a bounded quiescence/
double-read protocol that detects mutation. Otherwise reconciliation is
`INDETERMINATE`, never guessed `MATCH`.

Product `as_of` remains an opaque system-issued source/result coordinate. It is
not a caller-selected timestamp, transaction ID or database coordinate.

## 7. Global Maximum composition

```text
named, versioned Sankhya connector
+ dedicated credential handle outside prompt/browser/repository
+ exact environment and company scope
+ explicit capability catalog
+ business APIs for business effects
+ official query APIs where semantically complete
+ bounded DB Explorer only for admitted discovery/read gaps
+ Release-pinned request/query artifacts
+ provider-derived reconciliation boundary or honest INDETERMINATE
```

This preserves the Mitra strengths—fast discovery, server-side credentials and
real-tenant verification—while rejecting its dangerous production blast radius,
generic proxy authority and unrestricted SQL pattern.

## 8. Required falsifiers

1. `B04-P1`: exact Sankhya connector/revision/environment/company admission and provenance.
2. `B04-P2`: browser, prompt, generated app and repository never receive credential material.
3. `B04-P3`: caller cannot override credential, destination, endpoint, service, company or query artifact.
4. `B04-P4`: official order/invoice mappings exercise Sankhya business rules; database DML cannot substitute.
5. `B04-P5`: DB Explorer, if admitted, is read-only, bounded and allowlisted; DML/DDL and other-company scope fail.
6. `B04-P6`: qualification proves exact API/service availability, auth flow, response contract, limits and environment.
7. `B04-P7`: deterministic paging detects duplicate, drop, mutation and limit exhaustion.
8. `B04-P8`: real provider Evidence proves one common comparison boundary or result is `INDETERMINATE`.
9. `B04-P9`: source oracle never calls candidate/read-model transformation; candidate perturbation turns red.
10. `B04-P10`: falsify operation codes, pending state, derivative topology, business date, currency and names independently.
11. `B04-P11`: restart at fetch/staging/merge/cursor boundaries is deterministic and never fabricates completeness.
12. `B04-P12`: provider transaction/change identifiers are accepted only for their documented and probed semantics.

No live provider call or production effect is authorized by this study.

## 9. Corrected pass-1 outcome

```text
OPP-B04 PASS 1 = CORRECTED / OPERATOR APPROVED
Sankhya Gateway/API connector = LEADING INTEGRATION BOUNDARY
official business APIs = LEADING FOR BUSINESS EFFECTS
official entity/query APIs = LEADING WHERE SEMANTICALLY COMPLETE
DB Explorer through Sankhya Gateway = HIGH-VALUE BOUNDED ADAPTER / QUALIFICATION REQUIRED
generic arbitrary Gateway proxy = REJECT
direct Oracle access as Sankhya adapter = REJECT
Oracle SCN/Flashback as inferred Sankhya coordinate = REJECT
provider-derived extraction boundary = LEADING HYPOTHESIS / REAL PROBE REQUIRED
absence of stable common coverage = INDETERMINATE
live provider proof = REQUIRED FOR NAMED CLAIMS / NOT EXECUTED
exact dependency/transport/coordinate selection = 0
Product implementation authority = 0
```
