# L4 — External integrations task plan

## Goal and design

Applications invoke external reads and writes through Conexus-managed
connections. Sankhya is one provider, not the platform's universal integration
model. Email, WhatsApp, Telegram and Slack illustrate additional consumers;
the operator has not selected every provider/account/API for this release.

Builder authors exact operations; SDKs expose their admitted contracts;
Connections own provider configuration and qualification; Gateway owns trusted
execution, credentials and effect/reconciliation truth. No arbitrary URL/SQL/
provider-operation executor is added to the app or model runtime.

**Design:** [approved delivery design](../roadmap.md#approved-local-platform-delivery-design).
Status and execution/live permissions belong only to the roadmap. L4.1 closes
the provider and caller details before implementation or external execution.

## Required context and existing source

- [Connections/Gateway](../reference/integrations-and-gateway.md),
  [Project operation grammar](../product/operation-ledger.md#4-project-defined-capability-admission-grammar),
  [permissions](../product/permission-contract.md),
  [security](../reference/security-and-authority.md).
- [Connection wire](../../contracts/api/product/connection-paths.yaml),
  [Gateway inspection wire](../../contracts/api/product/gateway-paths.yaml),
  [effect recovery](../reference/release-deployment-and-operations.md).
- Existing source: `apps/hub/src/connections/{module,routes,store,transport,sankhya-om}.ts`,
  `apps/hub/src/gateway/`, `apps/hub/src/platform/credential-backend.ts`,
  `apps/web/src/features/connections/`.
- Existing proof: `tests/implementation/r2-p3-connections.test.mjs`,
  `tests/implementation/r2-p5-production-composition.test.mjs` and
  `tests/implementation/r2-p5-sankhya-key-conformance.test.mjs` prove scoped
  prior reads/bindings; they do not prove external-effect execution.

## Targeted reading and decision trace

Follow the [shared reading/research protocol](../roadmap.md#task-reading-and-research-protocol).

| Part | Already decided / precise reading | Remaining question and expected output |
| --- | --- | --- |
| L4.1 connection | [Connections/Gateway](../reference/integrations-and-gateway.md), §§18.1–18.3 and 19.1 | Scope, declarative provider-aware connectors and server-side secrets are fixed. Resolve actual provider/topology and exact operation/auth contract |
| L4.1–2 effects | Same owner, §§19.4.1–19.4.3; [operation grammar](../product/operation-ledger.md), §§4.1–4.3 | Define this effect's stable intent identity and accepted/unknown/rejected reconciliation behavior; runtime retry is not effect permission |
| L4.1 comparative integration | [Mitra influence](../research/mitra/influence-on-conexus.md), opening §4; technical appendix §12.4 for dispatch examples | Reuse credential separation and provider-aware declarations. Do not copy free-form proxying, assumed SDK availability or a provider-specific credential flow |
| L4.3 reuse | [Connections/Gateway](../reference/integrations-and-gateway.md), §18.2 | Identify whether another real provider consumer needs a distinct adapter or reveals a shared-contract defect; no provider-count milestone |

Before external research, inspect `sankhya-om.ts`, `transport.ts`, registered
connector definitions and qualification proof. Research the chosen provider's
official API/auth/idempotency documentation for the exact missing operation;
record version/date and supported reconciliation evidence. Do not research all
messaging vendors or perform live sends merely to complete this reading step.

## Implementation work breakdown

### L4.1 — Close one real effect and the reusable execution seam

- [ ] Resolve what the operator means by “Sankhya Gateway”: existing Conexus
  Gateway, provider API, or a separately deployed gateway. Inspect documented
  topology first; do not invent a service or call an unknown endpoint.
- [ ] Select the first real effect operation, caller and exact provider/test
  environment. Invoice entry is a requested capability example, not permission
  to create a real invoice or guess its business fields.
- [ ] Record the declared input/output, current access, Connection revision,
  immutable operation identity, timeout and semantic idempotency scope. Define
  how confirmed rejection differs from possible acceptance with a lost response.
- [ ] Close the non-PAR app caller's effect admission and human interaction
  using existing owners. Product Agents being deferred does not authorize
  borrowing their ApprovalRequest lifecycle or skipping required confirmation.
- [ ] Freeze SDK/adapter/Gateway interfaces, exact files and test commands.
  Read current official provider documentation for material API/auth questions;
  use an exact test subject and grant for any live qualification.

### L4.2 — Implement and prove app-driven external execution

- [ ] Realize server-derived binding/credential resolution and the admitted
  provider adapter. Project/browser/model inputs cannot substitute destination,
  tenant, scope or secret material.
- [ ] Persist stable semantic effect identity and reconciliation facts before
  allowing retries/new attempts that might duplicate the intent. A restart or
  new transport ID cannot bypass unresolved external acceptance.
- [ ] Wire SDK calls and app results to explicit succeeded/rejected/unknown
  behavior; display no false success when only transport completion is known.
- [ ] Verify revoked binding, invalid inputs, cross-Project use, duplicate
  attempts, timeout-after-acceptance and secret absence before exact live proof.

### L4.3 — Validate reuse against a real additional consumer

- [ ] Identify the next actual messaging/email consumer, if one is required for
  the admitted release. Select provider/account/operation only when that user
  need exists; provider count alone does not create a completion requirement.
  Examples do not authorize sending messages.
- [ ] Reuse connection/execution contracts while retaining that provider's
  actual auth, input and reconciliation meaning. Do not mirror the entire API
  or flatten different provider outcomes into an untruthful universal response.
- [ ] For an admitted additional adapter, demonstrate its app operation and
  provider-specific failure behavior. Otherwise record the later consumer and
  revisit trigger; record supported operations and limits honestly either way.

## Dependencies and exit

Consumes L2 operation/SDK contracts and L3 exact Release/caller authority.
Produces external-operation/effect contracts for L5. Read-only Brain Discovery
can reuse the read side in L6 without depending on effectful automation.

Exit is real admitted app-driven execution for the selected release operations,
plus negative effect/credential proof. Reuse is evaluated against the actual
capability contract; a second live provider is required only for a named
release consumer or a concrete claim that needs it. Provider choices and live
authority must be closed in L4.1/L4.3; no fake provider receipt
can close a real integration claim. Unselected adapters remain explicitly
unselected, not silently included in completion or excluded from architecture.
