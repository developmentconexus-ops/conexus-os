# Single-owner map

Conexus and the Mastra Factory both touch several concepts. Each concept has exactly one owner. The
other side holds only an explicit link to the owner's record, never a parallel copy. The operator set
this rule on 2026-09-22, and the [decision register](../decisions/index.md) records it with the
decisions this map applies.

This map names the owner of each shared concept, the link the other side holds, and what is retired
to reach that state. A row describes the destination. The "Retired to reach it" column names what
still exists on trunk and goes.

## Ownership

| Concept | Single owner | How the other side links | Retired to reach it |
| --- | --- | --- | --- |
| Identity and sign-in | Keycloak, the only sign-in door. The Factory runs with `auth: null` behind the Hub. | Conexus links an `iam.account` by issuer plus subject, never by subject alone. Keycloak roles, groups and claims grant no Conexus authority. | Nothing new. The Factory's own sign-in providers (Studio, WorkOS, email and password, GitHub) stay unconfigured. |
| Account | Conexus IAM (`iam.account`). | The Factory receives the Account id as its user id. | Nothing. |
| Installation organization | Conexus configuration. One installation is one Factory organization. | The Factory uses the configured organization id. No company directory exists beside it. | The Project as the Mastra `organizationId` in `apps/hub/src/builder/runtime.ts`. |
| Workspace, membership, roles and invitations | Conexus IAM. | The Factory holds no roster and no invitation. It receives the Account and an operation the Hub already authorized. | Nothing. The Factory's provider-derived membership stays unused. |
| Installation administration | Conexus IAM, as the installation administrator role. It is distinct from Workspace owner and does not grant access to every Project. | The Factory receives authorized operations, never a copy of the administrator list. | GitHub connection by a Workspace owner, as C-024 stated before its 2026-09-22 amendment. |
| Model credential storage, selection, visibility and sharing | The Factory, under C-022 and C-025, with its two native levels: just me, and everyone in the installation. | The Hub serves the Factory's own provider-key and sign-in handlers with the Hub session's Account as the Factory user, and registers the Factory's own per-person resolver, which `auth: null` skips. It performs the "everyone" mutation only after it checks the installation administrator role. Defaults are Factory model packs: the installation's pack "Modelos padrão" and each person's active pack. Conexus keeps no grant list and no resolver of its own. | Nothing on trunk. The Conexus model subsystem left in migration 0009. |
| Tool policy | The Hub, the single writer. | The Factory executes the rules the Hub derives. The browser may only approve or decline a pending call. | Any browser path that changes effective policy, such as an approval answer that creates an `always_allow_category` grant for the session. |
| Conversation visibility | Conexus Project policy. The default and the transitions are still to decide. Conexus enforces it on every read. | Any Factory visibility field is a value Conexus derives from the policy. Nobody edits it on its own. | Any visibility fixed in code when a conversation is created. |
| Project identity and name | Conexus (the Project record). | The Factory's project record carries a generated name, `conexus-project:<id>`, as a link. Its editable name, description and lifecycle are not shown as a second product name. | Nothing yet. |
| Conversation storage | The Factory's storage. | Conexus reads a Project's conversations through the Factory and stores no messages of its own. | The legacy path until unit 3 of the [Factory adoption task](../tasks/factory-adoption.md): the `@mastra/code-sdk` mount on the Hub's own Mastra and the LibSQL session store. |

## Where a row is not yet true

- Model credentials. Custom providers, such as a local proxy, are organization rows in the Factory,
  so one is installation-wide. The Factory has no per-person custom provider.
- Identity. Conexus owns its own Hub session and validates it without Keycloak. Whether a Keycloak
  disable or logout must end an existing Hub session is an open question.
- Conversation storage. Until unit 3, a Project's conversations are on exactly one of the two paths,
  never on both.
