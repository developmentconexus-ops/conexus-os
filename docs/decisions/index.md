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
| C-021 | Conexus is the platform where a company builds, administers and evolves products connected to its own context and systems. A Project is one publishable product and holds its development and operation. A Project offers several persistent conversations under a Project policy of `SHARED` or `PER_USER`, each general rather than a Builder chat, each answered by one principal agent. Source admission, artifact health and publication are three separate gates. Enterprise connections live in the Workspace and reach a Project as authorized capabilities. Brain is governed knowledge, Automations are persistent Project resources, and Work is bounded delegable work distinct from a Session. Everything named here is destination and limit, not delivered behaviour. | [Product contract](../product/contract.md), and the owner each rule names | The operator changes the product direction, or qualification evidence shows a rule cannot hold on the native mechanisms |
| C-022 | Factory-centered development is selected. The Mastra Factory is a Project's development environment, and model authentication, model credentials, provider connection and model selection belong to it along with Sessions, coding, Work, planning and review. Conexus keeps the Account, the Workspace and the Project, the authorization from an Account to a Project, enterprise capabilities and connections, admission of the current source revision, Preview and Publish. No adapter is built between Conexus's model connections and the Factory's credential store: the Conexus subsystem that exists only for models is subtracted as the native path replaces it, and the two never run in parallel. | [Qualification report](../evidence/sessions-work-qualification/report.md), [Product contract](../product/contract.md) | The Factory's native credential path proves unfit for a named enterprise requirement, a provider the company depends on is unreachable through it, or the custody decision that puts a Project's source on a forge is reversed |
| C-023 | The Builder's E2B sandbox has open internet egress, and the agent is no longer told to avoid the network. Decided by the operator on 2026-09-21 to keep the Builder simple while its real needs are learned, with the intent to narrow egress to named hosts later. Until then the sandbox can reach any host, so an agent could fetch unreviewed code or send the Project's source outward. The application smoke still refuses every request the app makes outside itself, so a run's verdict never depends on a third-party host. | [Builder runtime](../../apps/hub/src/builder/runtime.ts) | A run is seen to fetch or send something it should not, the Builder's needed hosts are known well enough to list, or a Project holds data that must not leave the sandbox |
| C-024 | One Conexus installation serves one company and is not multi-tenant. An installation administrator connects it to that company's GitHub organization through the Factory's own connect flow, with the company's own private GitHub App installed on all repositories, and every Project becomes a private repository there. The connected account must be an organization, because GitHub does not let an App create repositories in a personal account; a personal account is refused. No organization name is written in code. A Project is bound to its repository's GitHub id, not to the installation, so a disconnect and reconnect rebinds it and never orphans it; an unreachable repository refuses new requests and keeps the last good Preview, and Conexus never creates a replacement on its own. The repository's default branch is the Project's current source: a change that reaches it outside Conexus is current source, the next request starts from it, and the Preview stays at the last good build until a build of the new source succeeds. The installation is one Factory organization, and Workspaces are not bound to GitHub accounts. Another company runs its own installation and creates its own App by hand, so no App key ever reaches a second company's code. Decided by the operator on 2026-09-21. Amended on 2026-09-22: the connection is an installation-wide action, so it needs the installation administrator role, not Workspace ownership. | [Factory adoption task](../tasks/factory-adoption.md) | Conexus is asked to serve more than one company from one installation, a Workspace needs its own GitHub account, or GitHub lets an App create repositories in a personal account |
| C-025 | Model accounts stay with the Factory, whole. The Factory owns credential storage, selection, visibility and sharing, with its two native levels: just me, and everyone in the installation. Sharing with everyone is an installation-wide action, so the Hub performs that mutation only after it checks the installation administrator role. Conexus keeps no grant list and no credential resolver beside the Factory's. Sharing with named people is deferred, and it requires amending C-022 first. Decided by the operator on 2026-09-22. | [Single-owner map](../reference/single-owner-map.md), [Factory adoption task](../tasks/factory-adoption.md) | A company needs to share a model account with named people rather than with everyone, needs several accounts for one provider, or the Factory's sharing levels change |
| C-026 | Installation-wide actions, such as connecting or replacing the company GitHub organization and sharing a model account with everyone in the installation, belong to an installation administrator, not to a Workspace owner. The role lives only in Conexus IAM: the Factory never holds a copy of the administrator list, and the Hub checks the role before it performs a Factory administration change. The operator sets the first administrator from the shell; after that an administrator grants and revokes, the last active administrator cannot be removed, and every grant and revocation records who acted and when. Being an administrator grants nothing inside any Workspace or Project. This amends C-024, whose connect flow a Workspace owner drove. Decided by the operator on 2026-09-22. | [Permission contract](../product/permission-contract.md#11-installation-administration) | An installation needs more than one administrative tier, an administrator must also reach Project content, or the Factory has to decide administration on its own |
| C-OS-001 | The public ecosystem domain is `conexus.fun`, with the route convention `/<product>`. This repository owns Conexus OS only. Ingress mechanics are deferred. | Operator mission, [Product contract](../product/contract.md) | Ecosystem naming changes, or deployment realization needs ingress selected |

## Decided on 2026-09-22

The operator decided these on 2026-09-22, after an independent review of the study on sign-in,
tenancy and model accounts. The [single-owner map](../reference/single-owner-map.md) applies them
concept by concept.

| Decision | Consequence |
| --- | --- |
| Every concept that Conexus and the Mastra Factory both touch has exactly one owner. | The other side holds only an explicit link to the owner's record, never a parallel copy. The single-owner map names the owner of each shared concept. |
| Keycloak is the only sign-in door. | The Factory runs with `auth: null` behind the Hub. Conexus links identity by issuer plus subject. Keycloak says who a person is, and Conexus IAM says what they may do, so no Keycloak role or group authorizes anything. The sign-in pages get a Conexus theme later, with Keycloakify. This keeps C-015. |
| One installation is one Factory organization. | Workspaces, membership, roles and invitations are Conexus IAM only. The Factory holds no roster. |
| Conexus IAM gains an installation administrator role, distinct from Workspace owner. | The role authorizes installation-wide actions, such as connecting the company's GitHub organization and sharing a model account with everyone. It does not grant access to every Project. This amends C-024, which said a Workspace owner connects GitHub. |
| Model accounts follow C-025. | The Factory owns them with its two native sharing levels. Conexus builds no grant list and no parallel resolver. |
| The Hub is the single writer of tool policy. | The browser may only approve or decline a pending call. The agent runs with `yolo` inside the sandbox, with the GitHub tools denied. One honest line tells the person that the agent has internet access in its sandbox, as C-023 accepts. |
| Conversation visibility is a Conexus Project policy. | Its default and its transitions are still to decide. Conexus enforces the policy on every read. Any Factory visibility field is derived from it and never edited on its own. |

These are known technical follow-ups, not decisions:

- Factory credentials must be encrypted, through the Factory's `secretEncryption`, before anyone
  connects a model account.
- The per-person credential path must be qualified end to end with `auth: null`, because that
  setting also skips the Factory's per-person credential resolver.
- Whether a Keycloak disable or logout must end an existing Hub session is an open question.

## Amended on 2026-09-20

C-021 is an operator product amendment. It does not retire C-020, which still owns
authorization, source custody, execution settlement and artifact identity. It replaces
two of that decision's premises and leaves the rest standing.

One rule that sounds like a replaced premise is not one. **There is still no second
conversation store.** Several conversations per Project is a product requirement about
how many conversations a Project offers, not a licence to build a Conexus-owned message
lifecycle beside the framework's. Whatever composition the qualification recommends, the
conversation's messages stay in the framework's store.

| Premise of C-020 | What replaces it |
| --- | --- |
| One Mastra Thread per Project. | A Project offers several persistent conversations. How each one maps onto a Thread, a Session, a `resourceId`, a scope or an owner is deliberately unanswered and belongs to the [Sessions and Work qualification](../tasks/sessions-work-qualification.md). |
| The conversation is subordinate to a run: a run owns the turn and the conversation projects it. | A conversation is general, and can explain, investigate, develop, test and use authorized capabilities. Whether `BuilderRun` stays, narrows or disappears is open, and nothing may be removed from it before the qualification answers that. |

| Decision | Consequence |
| --- | --- |
| Factory is the preference to qualify for the SDLC, not an adopted mechanism. | Nothing installs or activates it on this evidence. Conexus does not reimplement triage, planning, coordination, review or re-review that the native mechanism already offers adequately. **Superseded by C-022 on 2026-09-20:** the qualification ran, and the Factory is adopted. The second sentence still holds. |
| Sessions and Work do not oblige two separate compositions. | The qualification compares reusing the Factory composition for both against a native Controller for interaction integrated with Factory for Work. Neither is chosen in advance. |
| Before proposing a Conexus-owned mechanism, the need must be concrete. | A named requirement, the examined API and version, the proven limitation, and a smaller configuration, composition or integration considered first. A gap does not authorize a fork or a parallel engine; it goes back to the planner. |
| Each increment ends in a usable, verified result. | Only the next increment is planned in detail. No layer is restructured wholesale ahead of a result that stands on its own. |

## Decided on 2026-09-20, after the integrated Factory run

| Decision | Consequence |
| --- | --- |
| Factory-centered is selected, not merely confirmed. | The next adoption work builds on the Factory rather than comparing it again. The custody consequence it carries, a Project's source on a forge with a GitHub App per deployment, is accepted with it. |
| Model authentication is the Factory's, whole. | `[probe]` the Factory's own OAuth login for a ChatGPT subscription answered a real turn, so the native path is not a plan. Conexus builds no adapter onto it, and does not keep its own model credential custody because it already exists. |
| The removal is subtractive, not additive. | The Conexus model subsystem is removed in the same work that wires the native path, never left running beside it. Nothing is removed in the qualification pull request, which would turn a qualification into a runtime migration. |
| Enterprise connections are a different subject. | Sankhya and the Workspace's enterprise integrations stay Conexus's, and reach a Project as authorized capabilities. C-022 is about model connections only, and says nothing about them. |

## Decided on 2026-09-19

| Decision | Consequence |
| --- | --- |
| Do not define what we will not use. | The Project Baseline concept left the product contract rather than being redefined. Project Inception, the Brain, connection bindings, Sankhya, the capability gateway, the Managed Application Runtime and the R3 program were removed with it. They return only as future features on this base, each with its own plan. |
| The `project.manage` Permission is retired. | Its Published-App access, archive and duplicate consumers were contract for surfaces never built. Its candidate-review, explanation and binding consumers left with Inception, the Baseline, the Brain and the bindings. Nothing wired remained, so the Permission is gone rather than waiting for a consumer to be invented. |
| A plain member may share their own model connection into a Workspace. | This is settled behaviour, not an open question. Sharing a connection is not an owner-only act. **Withdrawn by C-022 on 2026-09-20:** the model connection and its Workspace share were removed with the subsystem, and `connection.share` left `iam.action` in migration 0009. |
| Model selection stays Mastra-native. | Conexus adds credential custody and sign-in. It does not add a model abstraction of its own. **Amended by C-022 on 2026-09-20:** the custody and sign-in half is withdrawn, and model credentials move to the Factory with the rest of model authentication. |
| No independent verifier agent per pull request. | The merge gate is CI `verify` green on the exact head SHA plus the coordinator reading the diff. A unit that changes behaviour ships the test that would fail without it. |
| Tests serve the product. | Never reshape a product or schema design because a test or fixture would break. Build the correct shape, fix every test that exercised real behaviour, and delete every test whose subject is gone. |
| Multi-account lands at the minimum that is correct. | Delivered. An invited person must already exist in the identity provider with that exact address, marked verified. |
| When a run's author loses access mid-run, `claim_*` refuses and `settle_*` still records work already done. | Work already performed is never silently discarded. |
