# 4F(R2) — P5 Sankhya source-producer admission gap

> **Status:** `AUTHORIZED READ-ONLY SOURCE PROOF EXECUTED / P4 + P5 CLOSED PASS`
> **Consumer:** P4 production Brain-binding composition
> **Scope:** exact read-only source admission for company `1` (Matriz) and company `2` (Filial); no ERP write, generic SQL surface or business-row Evidence
> **Date:** `2026-09-06`

## Decided authority

The Budget Product grain is one exact source-qualified Sankhya Budget/order
header. Product meaning is already closed, but physical source identity is not:
`TGFCAB`, `CODTIPOPER IN (14,714)`, `PENDENTE = 'S'`, `TGFVAR` and the remaining
fields are historical Mitra Evidence or initial mapping hypotheses, not accepted
production authority. `DTALTER` is explicitly not Budget-age authority, and
`DTNEG` cannot be selected by field-name intuition.

Gateway/API is the accepted integration boundary. Direct Oracle, caller SQL and
a generic query proxy remain rejected. The only implemented live-shaped
Sankhya capability, `sankhya.company.read.v1`, proves authentication and exact
company access; it cannot prove Budget grain, keys, mapping or completeness.

## Current official-source result

Current Sankhya documentation establishes:

- OAuth client-credentials authentication at `/authenticate` with `X-Token` and
  Bearer use afterward;
- the Gateway service envelope and existence of `DbExplorerSP.executeQuery`;
- `CRUDServiceProvider.loadRecords` offset pagination with `hasMoreResult`;
- `CRUDServiceProvider.loadView`, whose pagination is integrator-owned;
- paginated REST resources including sales orders and company/type/customer
  reads;
- change logs and `modifiedSince` as change-window facilities.

Primary references:

- <https://developer.sankhya.com.br/reference/post_authenticate>
- <https://developer.sankhya.com.br/reference/requisi%C3%A7%C3%B5es-via-gateway>
- <https://developer.sankhya.com.br/reference/get_loadrecords>
- <https://developer.sankhya.com.br/reference/get_loadview>
- <https://developer.sankhya.com.br/reference/getpedidos>
- <https://developer.sankhya.com.br/reference/get_logalteracoestabelas>

Those public pages do not establish the `DbExplorerSP.executeQuery` request or
response schema, stable ordering, snapshot identity, cross-page consistency or
dataset invalidation contract required by the registered observer. A final
page, transaction ID, timestamp or `modifiedSince` value is not by itself a
complete coherent observation.

## Source proof executed on 2026-09-06

The operator identified the provisioned credential as the real PRODUCTION
system and explicitly authorized safe read-only proof for company `1` (Matriz)
and company `2` (Filial). The credential remained in the owner-only `0600` file
outside the repository. No secret, document row, customer, seller, monetary
value, company name or aggregate count entered chat, Git, logs or Evidence.

The bounded production probes established:

- OAuth authentication and exact `GET /v1/empresas/{companyCode}` access passed
  for both admitted companies;
- `DbExplorerSP.executeQuery` accepted one fixed SQL statement and returned the
  exact bounded envelope `pendingPrinting`, `status`, `serviceName`,
  `transactionId` and `responseBody.{burstLimit,fieldsMetadata,rows,timeQuery,
  timeResultSet}`;
- `TGFCAB.NUNOTA` is the physical primary key; `TGFCAB` contains `CODEMP`,
  `CODTIPOPER` and `DHTIPOPER`; `TGFTOP` is versioned by
  `(CODTIPOPER,DHALTER)`; `TGFVAR` has a composite item/derivative key including
  `NUNOTA` and `NUNOTAORIG`;
- both admitted companies have a nonempty `TGFCAB` population under the
  candidate `CODTIPOPER IN (14,714)` scope; code `14` is currently populated,
  while code `714` is configured but currently empty in those two companies;
- every observed candidate header joined its exact `DHTIPOPER` version to
  `TGFTOP`, and the configured owner-issued operation name indicated Budget;
  no joined candidate version contradicted that classification;
- the current `TGFTOP.ORCAMENTO` flag is not `S` for either candidate code.
  This is not a falsifier: the Product owner already records that flag as
  unreliable and expressly rejects it as Budget authority;
- one fixed aggregate statement over the exact company and candidate population
  returned one row with `TOTAL_ROWS`, `NULL_KEY_ROWS` and
  `DUPLICATE_KEY_GROUPS`; both company observations were nonempty, with zero
  null-key rows and zero duplicate complete-key groups;
- the provider transaction identity was present and bounded. It identifies the
  observation but is not represented as an SCN or immutable snapshot token.

The aggregate needs no pagination. The observed source is Oracle-backed, and
Oracle's current Database Concepts documentation states that a single query is
committed and consistent for one point in time. This supports the already
admitted `SINGLE_STATEMENT` coherence class for this exact aggregate; it does
not generalize to multiple statements, pages or future reads:

- <https://docs.oracle.com/en/database/oracle/oracle-database/23/cncpt/database-concepts.pdf>

The surviving P4 mapping is therefore narrowly admitted for the exact source
scope and key-conformance predicate:

```text
entity          = TGFCAB
company scope   = CODEMP resolved by the trusted Connection basis
population      = CODTIPOPER IN (14,714)
qualified key   = source scope + NUNOTA
coherence       = one complete aggregate statement
assertion       = null key rows == 0 AND duplicate complete-key groups == 0
```

The production-module candidate freezes that mapping as
`conexus-sankhya-budget-header-key-mapping/v1`, digest
`d16bf51f17fbec1017c38f5ab59d3ea0fa396419999091b155771585d6b6b200`.
It shares the bounded credential/authentication transport already used by
Connection qualification, admits the exact observed auth/company/Gateway
response shapes and accepts no query text, URL, table, company or proof result
from its caller. Local HTTP proof is green `3/3` and the existing P4 evaluator
regression is green `15/15` with its single environment skip.

The exact compiled production observer then executed read-only against both
authorized real companies and returned a complete `SINGLE_STATEMENT`
observation with a nonempty population and zero null/duplicate key violations
for each. This live execution fired one useful falsifier before acceptance: the
real `fieldsMetadata.order` is one-based, while the first controlled parser
candidate expected zero-based order. The parser and fixture were corrected and
the compiled module passed both real observations. No business value or count
was retained.

This admission proves neither that every future customer uses those codes nor
the pending/conversion, canonical business-date, currency, seller/customer or
Budget calculation mappings. Those remain later Brain/Product source-proof
obligations and do not recursively expand the P4 key-conformance gate.

## Implemented production composition

Commits `a485936` and `2ea52d7`, corrected at `b8ec320`, implement all three
formerly open facts:
immutable registered read, exact invalidation basis, and all-or-nothing
production composition. The full path shares one encrypted credential backend
and one Project source snapshot, uses distinct settlement, attester and subject
roles, and never admits caller SQL, URL, credentials, company or proof output.

The provider-free configured proof exercised PRJ-11 through HTTP with real
PostgreSQL 17 and admitted OCI Git in `239.8 s`, using only a local controlled
Sankhya stand-in. It settled matching DB/Git state after one authentication and
one fixed aggregate. The wrong-company control became indeterminate before
authentication/query. This does not claim a second live provider execution;
the live claim remains only the separately authorized read-only observation
already recorded above.

Because `NUNOTA` is the physical primary key, null/duplicate failure is
structurally impossible for a healthy admitted table definition; the live
aggregate principally proves reachable mapping, company-scoped population and
complete single-statement observation. Stand-ins retain the negative predicate
controls. This must not be cited later as broader Budget data-quality Evidence.

The original P4 composed proof seeded the trusted `PASSED` qualification
prerequisite directly. P5 subsequently replaced that fixture shortcut with the
normal production-module `CON-08` path: both admitted companies persist
`PROVIDER_CONFIRMED / PASSED` against a controlled local HTTP stand-in before
PRJ-11 consumes the company-1 qualification. P7 still owns any additional real
provider execution and whole-R2 qualification proof.

The executed source proof and composed proof close the former physical and
reachability blockers only for this exact P4 predicate. The corrected candidate
survived dual independent review, Lead adjudication and clean root verification;
P4 is closed. P5 remains open for the normal Connection-qualification wiring.

## Executed admitted proof envelope

The separately authorized read-only proof against the operator-selected Sankhya
environment and only company `1` (Matriz) and company `2` (Filial) used this
envelope:

1. authenticate and confirm exact company access through the already bounded
   company-read capability;
2. capture bounded response schemas with secrets and business rows excluded from
   Evidence;
3. probe one fixed aggregate/read definition sufficient to validate only the
   candidate header key, nulls, duplicates and mapping census;
4. test mutation/coherence limits without writes, or record that the provider
   cannot supply a positive coherent observation;
5. freeze only surviving mapping/read/response/invalidation facts before any
   production composition.

No credential value belongs in chat, Git, logs or Evidence. Provisioning must use
an owner-only file outside the repository (`0600`) containing only the connector's
closed credential shape:

```json
{"clientId":"...","clientSecret":"...","xToken":"..."}
```

The operator named `PRODUCTION` and explicitly authorized this exact read-only
external proof. That proof-specific grant does not authorize another provider
call, write, deployment or broader production effect.

## Routing

Current routing:

```text
P4 = CLOSED PASS at corrected candidate b8ec320
P5 = CLOSED PASS / normal Connection-qualification adapter wired and proved locally
source producer + production composition = IMPLEMENTED / REVIEWED / PROVED
live claim = exact authorized read-only source-admission probes only
```
