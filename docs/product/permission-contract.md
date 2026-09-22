# Conexus OS permission contract

This file owns who may do what. [The operation ledger](operation-ledger.md) owns the
operation census, [the product contract](contract.md) owns product meaning, and
[the roadmap](../roadmap.md) owns status.

The authority model lives in `apps/hub/migrations/`. `0009_remove_model_connections.sql` last
rewrote the Workspace model, and `0017_installation_administrator.sql` added installation
administration beside it. Sections 1 to 4 describe that code. If the two disagree, the code is
right.

[Section 5](#5-target-requirements-not-yet-enforced) is different. It holds the
authorization requirements the approved destination creates, which nothing enforces
yet. It names no action, no grant and no endpoint, because inventing one before its
first real call site is exactly what section 4 forbids.

---

## 1. The model

Authority is membership of the Workspace that owns the resource, plus the role held in
that membership. There is nothing else. There is no per-Project grant table, no
independently revocable capability fact and no role editor.

```text
iam.workspace_role = owner | member
```

`iam.role_allows` is the whole rule:

```sql
SELECT CASE p_role
  WHEN 'owner' THEN true
  WHEN 'member' THEN p_action <> 'members.manage'
END;
```

An owner may do everything. A member may do everything except administer the roster.

Two functions apply it. `iam.admit_workspace` checks that the account is active, holds
a membership in that Workspace, and that the role allows the action. `iam.admit_project`
resolves the Project's owning Workspace and defers to it. Both raise `NOT_ADMITTED`
with SQLSTATE `42501` and both take a `FOR SHARE` lock, so authority is rechecked
inside the same transaction that does the work.

A Project has no authority of its own. It inherits the Workspace that owns it.

### 1.1 Installation administration

An installation administrator may act on the whole installation. The actions it exists for
are connecting or replacing the company GitHub organization and sharing a model account with
everyone in the installation ([C-026](../decisions/index.md)). It is a fact about an Account,
held in `iam.installation_administrator`. It is not a Workspace role and not an `iam.action`.

Being an administrator grants nothing inside a Workspace or a Project. `iam.admit_workspace`,
`iam.admit_project`, `iam.visible_workspaces` and `iam.visible_projects` never read the table,
so an administrator with no membership sees and may do nothing in any Workspace.

The role lives only in Conexus IAM. The Factory never holds a copy of the administrator list.
The Hub calls `isInstallationAdministrator` on the identity-access module before it performs a
Factory administration change on the actor's behalf.

| Function | Who may call it | Effect |
| --- | --- | --- |
| `iam.is_installation_administrator(account)` | `hub_iam_runtime` | true while the Account is active and holds an open tenure |
| `iam.grant_installation_administrator(actor, account)` | `hub_iam_runtime` | the actor must be an administrator and the Account must be active; granting a current administrator changes nothing |
| `iam.revoke_installation_administrator(actor, account)` | `hub_iam_runtime` | the actor must be an administrator; revoking somebody who is not one changes nothing |
| `iam.bootstrap_installation_administrator(account)` | no Hub role | the operator shell sets the first administrator |

Each row of the table is one tenure. It records how it was granted (`OPERATOR_BOOTSTRAP` or
`ADMINISTRATOR`), who granted it and when, and, once closed, who revoked it and when. Closed
tenures are kept, so the table is also the record of every grant and revocation. Check
constraints refuse a grant by an administrator that does not name one, and a revocation that
does not name who revoked. Hub roles have no grant on the table itself.

The last active administrator cannot be revoked, even by themselves. The refusal is
`LAST_INSTALLATION_ADMINISTRATOR`, SQLSTATE `42501`. An actor who is not an administrator is
refused with `NOT_ADMITTED`. Every change to the set takes one table lock first, so two
administrators revoking each other at the same moment leave exactly one.

The bootstrap is `npm run iam:bootstrap-installation-administrator -- --email <address>` (or
`--account-id <uuid>`). It connects with the operator's provisioning credential
(`CONEXUS_PROVISION_USER` and `CONEXUS_PROVISION_PASSWORD_FILE`), because no Hub role may
execute the function. It answers `GRANTED`, or `ALREADY_ADMINISTRATOR` when run again for the
same Account. It refuses with `INSTALLATION_ADMINISTRATOR_EXISTS` while any other active
administrator exists, so it cannot be used to add administrators. It does work again once
every administrator's Account is inactive, which is how an installation recovers.

---

## 2. The action vocabulary

`iam.action` is the vocabulary. It holds exactly the four values below.

| Action | Gates | Called from |
| --- | --- | --- |
| `workspace.read` | acting on a Workspace you belong to, where a roster change is a self-service narrowing rather than administration | `iam.remove_workspace_member` |
| `members.manage` | administering the roster: invite, cancel an invitation, remove a member, change a role | `iam.invite_workspace_member`, `iam.cancel_workspace_invitation`, `iam.remove_workspace_member`, `iam.set_workspace_member_role` |
| `project.create` | creating a Project in a Workspace | `project.reserve_or_replay_create_project`, `project.lock_create_project_receipt`, `project.complete_create_project_receipt` |
| `project.build` | starting, claiming and cancelling a Builder run | `builder.create_builder_run`, `builder.claim_builder_run`, `builder.request_builder_run_cancellation` |

`members.manage` is the only action a member does not hold, so it is the only line
that makes the two roles different.

`project.read` and `project.change` were dead entries in the enum declaration: no
function ever passed either one. `apps/hub/migrations/0002_prune_dead_iam_actions.sql`
removed them. `connection.share` gated only sharing a model connection into a Workspace, and
`apps/hub/migrations/0009_remove_model_connections.sql` removed it with the model connection
subsystem. The table above lists only the four values that gate something.

### 2.1 Reads are gated by containment, not by an action

Reading a Project does not pass an action. `project.get_project` and
`project.list_project_summaries` join `iam.visible_projects(account)`, so an account
sees exactly the Projects in the Workspaces it belongs to. `IAM-04`, the roster read,
needs only membership: every member may see who else is in the Workspace they belong to.

This is why there is no `project.read`. Containment already answers the question.

### 2.2 Narrowing is self-service

`iam.remove_workspace_member` accepts two routes. An actor removing their own membership
needs `workspace.read`. An actor removing somebody else needs `members.manage`.

The last owner of a Workspace cannot be demoted or removed. `iam.set_workspace_member_role`
and `iam.remove_workspace_member` both check that another owner remains.

---

## 3. Conditions that are not actions

| Condition | Meaning |
| --- | --- |
| authenticated | a valid Conexus Account and session; a Keycloak token alone is not enough |
| verified email | `email_verified` is the boolean `true` in the validated ID token; anything else is refused |
| bootstrap context | the transient pre-Account context for the one preconfigured OIDC subject; it may provision only its own Account and is invalid afterwards |
| Workspace membership | the containment root for every read |
| installation administrator | an open tenure in `iam.installation_administrator` for an active Account; it gates installation-wide actions only ([section 1.1](#11-installation-administration)) |

None of these is a Permission and none may be inferred from a Keycloak role, group or
organization, or from a provider, model, Mastra or E2B identity.

---

## 4. Rules that keep the vocabulary small

An action exists only when a real call site needs the distinction. A screen, a button,
a persona, a Keycloak claim or a provider name never becomes one.

An action is necessary and not sufficient. Every operation still rechecks the exact
subject, current membership and current owner state. Holding `project.build` does not
mean a particular run may be cancelled; it means the account may ask.

These were rejected and stay rejected until a real call site needs one:

```text
account.read       account.manage
grant.read         grant.manage
role.manage
project.manage
```

`project.manage` was retired on 2026-09-19. Its consumers were either surfaces that
were never built or subsystems that left the product that day. A future Project
lifecycle surface introduces its own action at its first real call site.

---

## 5. Target requirements not yet enforced

[C-021](../decisions/index.md) approved a direction that will need authority this model
does not express. Each line below is a requirement on a future call site. None of them
is an action today, and none may be added to `iam.action` before the operation that
needs it exists. [Section 12 of the product contract](contract.md#12-approved-destination)
owns what each one means.

| Requirement | What it must decide | Why the current model does not answer it |
| --- | --- | --- |
| Conversation privacy | who may read a conversation of a Project whose policy is `PER_USER` | containment answers Project reads, and every member sees every Project read today; a conversation private to its author is a narrower question than membership |
| Privacy of everything a conversation carries | the same answer applied to persisted requests, diagnostics, recovered memory and delegated work | hiding a conversation from a list is not the same as withholding what it wrote elsewhere |
| Continuing somebody else's conversation | that continuing it grants neither the author's credentials nor the author's permissions | the actor is the one asking; nothing today can be tempted to read authority from a conversation's author |
| Project capabilities | what a conversation, an application or an automation may call on the Project's behalf, and what it may never reach | `project.build` gates starting a run; it says nothing about a capability a generated application invokes at runtime |
| Publication | that publishing is explicit, authorized and separate from editing and from a run settling | nothing publishes today, so no action gates it |
| Work applied to a Project | that a reviewed candidate reaches the source only through the Project's own reconciliation and authorization | source advances inside a run the actor already holds `project.build` for; delegated work arrives from elsewhere |

Two rules from section 4 govern all of them. An action exists only when a real call
site needs the distinction, and an action is necessary without being sufficient: the
operation still rechecks the exact subject, the current membership and the current
owner state.
