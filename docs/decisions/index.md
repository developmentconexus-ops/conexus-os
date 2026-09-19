# Conexus OS decision register

The decisions in force, and what would make each one reopen. Superseded decisions
and the review rounds behind them stay in Git history. This register does not
create product meaning; the owners it names do.

Reopen a decision only on material evidence. A changed requirement, a new real
consumer, a newly reachable failure mode, an external change, or implementation
evidence that invalidates an assumption.

## In force

| ID | Decision | Owner | Reopen trigger |
| --- | --- | --- | --- |
| C-015 | Human authentication delegates to Keycloak through a narrow OIDC boundary. Conexus stays sovereign over identity mapping, Workspace and Project grants, and its own opaque server-owned session. A verified `(issuer, subject)` pair is an attribute of an existing `iam.account`, never a record class of its own. Keycloak roles, groups and claims grant no Conexus authority. | [Security](../reference/security-and-authority.md), [Data](../reference/data-and-persistence.md) | Keycloak proves unfit on security, topology or recovery; a stable `(issuer, subject)` identity cannot be preserved; or a real SSO, SCIM, passkey or multi-IdP requirement changes the authentication contract |
| C-020 | The Builder's ordinary coding path is a Project, a Mastra Thread with its messages, Conexus-owned Project working state, a minimal `BuilderRun`, and an automatic last-good Preview. Mastra owns the harness mechanics. Conexus owns authorization, source, execution settlement and artifact identity. There is no ordinary Change, WorkUnit or ActorRun, and no second conversation store. | [C-020 reference](../reference/builder-c020-mastra-native.md), [Builder repair program](../tasks/builder-repair-program.md) | Implementation evidence falsifies the boundary or one of its stated invariants |
| C-OS-001 | The public ecosystem domain is `conexus.fun`, with the route convention `/<product>`. This repository owns Conexus OS only. Ingress mechanics are deferred. | Operator mission, [Product contract](../product/contract.md) | Ecosystem naming changes, or deployment realization needs ingress selected |

## Decided on 2026-09-19

| Decision | Consequence |
| --- | --- |
| Do not define what we will not use. | The Project Baseline concept left the product contract rather than being redefined. Project Inception, the Brain, connection bindings, Sankhya, the capability gateway, the Managed Application Runtime and the R3 program were removed with it. They return only as future features on this base, each with its own plan. |
| The `project.manage` Permission is retired. | Its Published-App access, archive and duplicate consumers were contract for surfaces never built. Its candidate-review, explanation and binding consumers left with Inception, the Baseline, the Brain and the bindings. Nothing wired remained, so the Permission is gone rather than waiting for a consumer to be invented. |
| A plain member may share their own model connection into a Workspace. | This is settled behaviour, not an open question. Sharing a connection is not an owner-only act. |
| Model selection stays Mastra-native. | Conexus adds credential custody and sign-in. It does not add a model abstraction of its own. |
| No independent verifier agent per pull request. | The merge gate is CI `verify` green on the exact head SHA plus the coordinator reading the diff. A unit that changes behaviour ships the test that would fail without it. |
| Tests serve the product. | Never reshape a product or schema design because a test or fixture would break. Build the correct shape, fix every test that exercised real behaviour, and delete every test whose subject is gone. |
| Multi-account lands at the minimum that is correct. | Delivered. An invited person must already exist in the identity provider with that exact address, marked verified. |
| When a run's author loses access mid-run, `claim_*` refuses and `settle_*` still records work already done. | Work already performed is never silently discarded. |
