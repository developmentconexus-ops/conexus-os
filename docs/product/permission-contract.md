# Conexus OS permission contract

This file owns who may do what. [The operation ledger](operation-ledger.md) owns the
operation census, [the product contract](contract.md) owns product meaning, and
[the roadmap](../roadmap.md) owns status.

The authority model lives in `apps/hub/migrations/0001_baseline.sql`. This file
describes that code. If the two disagree, the code is right.

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

---

## 2. The action vocabulary

`iam.action` is the vocabulary. Five of its values gate something.

| Action | Gates | Called from |
| --- | --- | --- |
| `workspace.read` | acting on a Workspace you belong to, where a roster change is a self-service narrowing rather than administration | `iam.remove_workspace_member`, `model_connection.unshare_connection` |
| `members.manage` | administering the roster: invite, cancel an invitation, remove a member, change a role | `iam.invite_workspace_member`, `iam.cancel_workspace_invitation`, `iam.remove_workspace_member`, `iam.set_workspace_member_role` |
| `project.create` | creating a Project in a Workspace | `project.reserve_or_replay_create_project`, `project.lock_create_project_receipt`, `project.complete_create_project_receipt` |
| `project.build` | starting, claiming and cancelling a Builder run, and using a model connection for one | `builder.create_builder_run`, `builder.claim_builder_run`, `builder.request_builder_run_cancellation`, `model_connection.admit_for_project` |
| `connection.share` | sharing a model connection into a Workspace | `model_connection.share_connection` |

`members.manage` is the only action a member does not hold, so it is the only line
that makes the two roles different.

Two values, `project.read` and `project.change`, appear in the enum declaration and
nowhere else. No function passes either one. They are dead entries, recorded here
rather than described as authority, and removing them costs a migration.

### 2.1 Reads are gated by containment, not by an action

Reading a Project does not pass an action. `project.get_project` and
`project.list_project_summaries` join `iam.visible_projects(account)`, so an account
sees exactly the Projects in the Workspaces it belongs to. `IAM-04`, the roster read,
needs only membership: every member may see who else is in the Workspace they belong to.

This is why there is no `project.read`. Containment already answers the question.

### 2.2 Narrowing is self-service

`iam.remove_workspace_member` and `model_connection.unshare_connection` each accept two
routes. An actor removing their own membership, or the owner of a connection withdrawing
their own share, needs `workspace.read`. An actor acting on somebody else needs
`members.manage`.

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
| connection ownership | the account that created a model connection may share, unshare and revoke it |

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
