# 0015. Child: part 6, the identity and access owner

**Status**: Approved, revision 2.4 (after the spec review, its confirmation, and the confirmation of revision 2.3, all of 2026-10-06)

**Approval**: approved by the operator at the spec gate on 2026-10-06 ("A aprovo"), commit 916b576e

**Lane**: `lane:qualification` (Q-b). The migration carries `needs:aprovo` ([delivery](../../development/delivery.md#ask-for-aprovo-on-three-kinds-of-change)).

Part of [spec 0015](index.md), revision 5.3 (design 4, the split wall). This child uses the rules of the admission child ([0015-admission.md](0015-admission.md)) and the data child ([0015-data.md](0015-data.md)), and changes them where the section "Owner reconciliation" says, by the operator's decisions of 2026-10-06. It was designed from zero (the study notes `redesign.md`, `study.md`, `blast-radius.md`, `request-auth.md`, `request-auth-proof.md`, the architect sketches under `architect/` and the review under `interrogate-spec/`, none in this repository), not from an earlier draft. The module that serves Previews and applications is named `hosting` here, after #542 renames `apps/hub/src/mar/`; a `hosting/` line is the same line under `mar/` today. Every `file:line` is a line of `origin/main` at `544bcf42` unless it says otherwise; lines that name #539 or #541 are at `743457ef` (main `5063a7d3` plus #541). A document the nine guides replaced is read with `git show 58444763:<path>`.

**Depends on**: #539 (operations named by verb and noun) and #538 (the contract imported as a package, failure codes typed). This part declares its operations in that shape and takes the next free migration number at the build head (0070 when neither of those adds one).

## Summary

Identity and access is the last owner on the old path. Its 45 `SECURITY DEFINER` functions hold the rules, its routes are declared in YAML or not at all, its store runs as `hub_runtime` through `unportedPool`, and the first person who signs in on an empty installation is sent to a `/setup` form that a later sign in must complete. After this part a person signs in once and lands where they belong. The configured operator lands in the Hub as installation administrator. An invited person lands in the Workspace or the application that invited their verified email. Anyone else sees a page that names why they cannot enter.

Every rule moves to TypeScript on the floor of #512: proofs from `admission.ts`, the transaction entries of `db.ts`, the receipt of `receipt.ts`, the route definer of `http/access.ts`. The new entry `authenticate` resolves a cookie or a sign in before any account is known. A sign in decides and opens its session in one transaction. An application request is one transaction that finds the session, checks access and reads the served file. A session ends by being deleted. A one use credential is consumed by one `DELETE ... RETURNING`. The bootstrap context, `/setup`, the bootstrap cookie, `iam.preview`, `iam.operation_idempotency`, the bridges, the seven owner roles and the last capability role go. It satisfies umbrella **AC-1** to **AC-11** for `iam` (build plan item 9 of [the umbrella](index.md)) and closes eight rows of [architecture](../../reference/architecture.md) section 11.

## 1. What it ports

| Today | After |
| --- | --- |
| 45 business functions in schema `iam` (the full list is section 10) | Dropped, each with its exact signature and no `CASCADE`. Their rules live in the files of section 5. `iam.lock_administrators()` and the three `rls.*` helpers stay (floor). |
| `identity-access/store.ts`, `routes.ts`, `host-sessions.ts`, `membership.ts`, `application-access.ts`, `installation-administration.ts`, `installation-routes.ts`, `reaper.ts` | Deleted. Replaced by `authentication.ts`, `sign-in.ts`, `sessions.ts`, `roster.ts`, a new `application-access.ts`, `administrators.ts` and `expiry.ts` (section 5). |
| Ten operations in `contracts/api/product/identity-workspace-paths.yaml` and thirteen routes in `UNDECLARED_OPERATIONS` (`apps/hub/src/http/access.ts`) | Fourteen operations in `packages/contract/src/identity-access.ts`, registered by `route.operation`. `UNDECLARED_OPERATIONS` is empty and goes. |
| `/setup`, the provisioning operation `POST /api/control/accounts`, `iam.bootstrap_context`, the bootstrap cookie, access kind `bootstrap`, `BootstrapScope` in the receipt | Deleted. The first account and its tenure are created in the sign in callback (section 6, First access). |
| `iam.preview`, a copy of the registry's manifest, digest and source | Deleted. A Preview session holds `artifact_revision_id`, and `hosting` reads the manifest from the registry (guide A section 5, a link and never a copy). |
| Ended session rows kept 72 hours with `ended_at` and `ended_reason`; `oidc_transaction.consumed_at` | No ended rows. A session, a handoff and a sign in state are deleted when they end; the reason is a `SESSION_ENDED` log line (guide S section 9). |
| `iam.operation_idempotency` and the hand read `Idempotency-Key` (`identity-access/routes.ts`) | `platform.operation_receipt` through `idempotent()` for every keyed create. |
| `iam.session_lifetimes()` and the lifetimes in SQL | `platform/lifetimes.ts` only. |
| `scripts/bootstrap-installation-administrator.mjs` and its npm script | Deleted (study gate decision 5). |
| `apps/web/src/generated/iam-client.ts` and `routes/setup.tsx` | Deleted. The web calls every IAM operation through `call` and `query` of `apps/web/src/app/http.ts` (section 7). |

## 2. Operations

Each operation is declared once in `packages/contract/src/identity-access.ts` with its name as `id` and a `summary` (the shape of #539) and joins `OPERATIONS`. Routes register with `route.operation(op, handler)`. Access kind `session` unless noted; every write also passes the floor's origin check (`REQUEST_AUTHENTICITY_DENIED`). Ids are contract brands (`WorkspaceId`, `ProjectId`, `AccountId`, and the new `InvitationId`, `GrantId`, each with its 404 code in the operation's `malformed` table, as #541 made it). Emails parse through the contract's `EmailAddress`, which trims and lowercases.

| Operation | Method and path | Input | Success | Failures beyond the common set |
| --- | --- | --- | --- | --- |
| `getSession` | `GET /api/session` | none | 200 `Session` | `AUTHENTICATION_REQUIRED` 401, `IDENTITY_PROVIDER_UNAVAILABLE` 503 |
| `endSession` (access kind `sign-out`) | `DELETE /api/session` | none | 204, the cookie cleared | `AUTHENTICATION_REQUIRED` 401 |
| `getWorkspaceRoster` | `GET /api/control/workspaces/:workspaceId/roster` | none | 200 `WorkspaceRoster` | `WORKSPACE_NOT_FOUND` 404 |
| `inviteWorkspaceMember`, keyed | `POST /api/control/workspaces/:workspaceId/invitations` | `{ email, role }` | 200 `WorkspaceInvitationEntry` | `WORKSPACE_NOT_FOUND` 404, `MEMBERS_MANAGE_REQUIRED` 403, `EMAIL_INVALID` 400 |
| `removeWorkspaceMember` | `DELETE /api/control/workspaces/:workspaceId/members/:accountId` | none | 204 | `WORKSPACE_NOT_FOUND` 404, `MEMBERS_MANAGE_REQUIRED` 403, `ROSTER_ENTRY_NOT_FOUND` 404, `LAST_OWNER` 409 |
| `cancelWorkspaceInvitation` | `DELETE /api/control/workspaces/:workspaceId/invitations/:invitationId` | none | 204 | `WORKSPACE_NOT_FOUND` 404, `MEMBERS_MANAGE_REQUIRED` 403, `ROSTER_ENTRY_NOT_FOUND` 404 |
| `setWorkspaceMemberRole` | `PUT /api/control/workspaces/:workspaceId/members/:accountId` | `{ role }` | 200 `WorkspaceMemberEntry` | `WORKSPACE_NOT_FOUND` 404, `MEMBERS_MANAGE_REQUIRED` 403, `ROSTER_ENTRY_NOT_FOUND` 404, `LAST_OWNER` 409 |
| `getApplicationAccess` | `GET /api/control/projects/:projectId/application-access` | none | 200 `ApplicationAccess` | `PROJECT_NOT_FOUND` 404, `APPLICATION_ACCESS_MANAGE_REQUIRED` 403 |
| `grantApplicationAccess`, keyed | `POST /api/control/projects/:projectId/application-access` | `{ email }` | 200 `ApplicationInvitationEntry` | `PROJECT_NOT_FOUND` 404, `APPLICATION_ACCESS_MANAGE_REQUIRED` 403, `EMAIL_INVALID` 400 |
| `revokeApplicationGrant` | `DELETE /api/control/projects/:projectId/application-access/grants/:grantId` | none | 204 | `PROJECT_NOT_FOUND` 404, `APPLICATION_ACCESS_MANAGE_REQUIRED` 403, `APPLICATION_ACCESS_ENTRY_NOT_FOUND` 404 |
| `cancelApplicationInvitation` | `DELETE /api/control/projects/:projectId/application-access/invitations/:invitationId` | none | 204 | the same three |
| `listInstallationAdministrators` | `GET /api/control/installation/administrators` | none | 200 `{ administrators: AdministratorEntry[] }` | `INSTALLATION_ADMINISTRATOR_REQUIRED` 403 |
| `addInstallationAdministrator`, keyed | `POST /api/control/installation/administrators` | `{ email }` | 201 `AdministratorEntry` | `INSTALLATION_ADMINISTRATOR_REQUIRED` 403, `EMAIL_INVALID` 400, `ACCOUNT_NOT_FOUND` 404, `ACCOUNT_EMAIL_AMBIGUOUS` 409 |
| `removeInstallationAdministrator` | `DELETE /api/control/installation/administrators/:accountId` | none | 204 | `INSTALLATION_ADMINISTRATOR_REQUIRED` 403, `INSTALLATION_ADMINISTRATOR_NOT_FOUND` 404, `LAST_INSTALLATION_ADMINISTRATOR` 409 |

**Shapes.** The Zod schemas port today's YAML components (`identity-workspace-paths.yaml:283-448`) with these differences only:

| Schema | Fields |
| --- | --- |
| `Session` | `{ account: AccountSummary, administrator: boolean, workspaces: { workspaceId, name }[] }`; today's `projects: []` goes and `GET /api/control/installation` folds into `administrator` |
| `AccountSummary` | `{ accountId, displayName }` |
| `WorkspaceRoster` | as today: `{ viewerRole, entries: (WorkspaceMemberEntry \| WorkspaceInvitationEntry)[] }`, told apart by `kind` |
| `WorkspaceMemberEntry`, `WorkspaceInvitationEntry` | as today, with branded ids; `state` is `PENDING` or `EXPIRED`, computed at read |
| `ApplicationAccess` | as today: `{ address?: string (an origin URL), entries: (ApplicationGrantEntry \| ApplicationInvitationEntry)[] }` |
| `ApplicationGrantEntry`, `ApplicationInvitationEntry` | as today, with branded ids |
| `AdministratorEntry` | `{ accountId, displayName, email?, grantedVia: 'OPERATOR_BOOTSTRAP' \| 'ADMINISTRATOR', grantedAt, grantedBy?: AccountSummary }`, a discriminated union on `grantedVia` (`grantedBy` only with `ADMINISTRATOR`) |

The two invitation creates answer 200, as today: the pair (Workspace or Project, email) is the natural key, and the answer is the current invitation for it. The keyed creates follow guide H section 3 and the floor: no key is 400 `IDEMPOTENCY_KEY_REQUIRED`, the same key and body twice answer the same body with one row, the same key with another body is 409 `IDEMPOTENCY_CONFLICT` (HQ decision 2 of the study gate). Removing a member and cancelling an invitation are two operations, as are revoking a grant and cancelling an application invitation (operator decision 2A). The roster read is named for what it returns, members and invitations together, so its path says `roster`.

**Protocol routes.** They are not operations (guide H section 1) and keep their access kinds:

| Route | Access kind | Answers |
| --- | --- | --- |
| `GET /protocol/oidc/login[?application=<slug>&binding=<digest>]` | `sign-in` | 302 to Keycloak with the `oidcState` cookie; a bad slug or binding, or a Project in deletion, answers the application host's no access page |
| `GET /protocol/oidc/callback` | `sign-in` | 303 to `/` with the Hub cookie, 303 to the application's `/__conexus/sign-in/complete?handoff=` with `Referrer-Policy: no-referrer`, or 303 to a no access page with its reason (section 6) |
| Application host `/__conexus/sign-in/complete`, `/__conexus/sign-out` | as today | unchanged answers, on the new ports |
| Application host `/__conexus/no-access?reason=` | as today | edited: three bodies (section 7) |
| Preview host entry | `hub-entry` | unchanged |

**Failure and log rows.** New in `contracts/technical/failures.json`: `SIGN_IN_EXPIRED`, `SIGN_IN_FAILED`, `IDENTITY_EMAIL_NOT_VERIFIED`, `INSTALLATION_ADMINISTRATOR_NOT_FOUND`; `INSTALLATION_ADMINISTRATOR_EMAIL_INVALID` is renamed `EMAIL_INVALID` (one email field for three operations). New log codes: `IDENTITY_CLAIM_MALFORMED`, `OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE`, `SIGN_IN_COMPLETED`, `SIGN_IN_REFUSED`, `SESSION_ENDED`, `IAM_REAPED`, `INSTALLATION_ADMINISTRATOR_GRANTED`, `INSTALLATION_ADMINISTRATOR_REVOKED`. Deleted with their last user: `BOOTSTRAP_REQUIRED`, `BOOTSTRAP_SEALED`, and every other IAM row the failure census finds without a user at the merge head (`OIDC_IDENTITY_MISSING`, `ACCOUNT_CONFLICT` and `INVITATION_NOT_ACCEPTABLE` are the candidates; the builder lists the result in the pull request).

## 3. Admissions and locks

| Operation or flow | Entry | Admission | Write filter and locks |
| --- | --- | --- | --- |
| Sign in begin | `authenticate` | `lookupSlug`, which takes the Project row `FOR SHARE` and refuses a Project with a deletion row, then `startOidc` in the same entry | the inserted state row |
| Sign in callback | `authenticate` (section 6) | the `oidc-state` consume; then the identity steps; `admitBootstrap` for the first account; `admitAccount(gate)` for a Hub return; `admitApplication(gate, projectId)` for an application return, since it writes the handoff | `admitApplication` takes the account, the Project, the membership or the grant `FOR SHARE` (`admission.ts:255-272`), so the Project purge waits or is seen |
| Handoff redeem, application or Preview | `authenticate` | the Project row `FOR SHARE` first, then the handoff consume (application: digest, slug and binding; Preview: digest and artifact revision) | the inserted session row |
| Hub request | `authenticate` | the `hub-session` lookup, which locks its row | the slide, or the delete of an ended session |
| Application request | `authenticate` | the `application-session` lookup (no lock), then `checkApplication(gate, projectId)` (no lock) | none on a served request; the delete of the session on a refusal |
| Preview request | `authenticate` | the `preview-session` lookup (no lock), its parent Hub session's standing, then `checkProject(gate, projectId)` (no lock) | none; the delete of an ended parent; the delete of the PREVIEW session on a refused check |
| `getSession` | access kind `session` | the resolved Hub session | none |
| `endSession` | `authenticate` | the cookie's digest | `DELETE ... WHERE token_digest = $1 AND kind = 'HUB' RETURNING provider_refresh_token`; children cascade |
| `getWorkspaceRoster` | `read(accountId)` | `admitWorkspace(tx, w, 'workspace.read')` | reader policies |
| `inviteWorkspaceMember`, `cancelWorkspaceInvitation`, `setWorkspaceMemberRole` | `transaction` | `admitWorkspace(gate, w, 'members.manage')`, always, for oneself too | `workspace_id = proof.scope.workspaceId`; the role change keeps `lastOwnerStays(proof.scope.owners, change)` |
| `removeWorkspaceMember` | `transaction` | `admitWorkspace(gate, w, 'members.leave')` when the account is the actor's own, else `'members.manage'`; the owner set arrives locked in `proof.scope.owners` (`admission.ts:149-171`) | `workspace_id = proof.scope.workspaceId`; `lastOwnerStays` |
| `getApplicationAccess` | `read(accountId)` | `admitProject(tx, p, 'application.manage')` | reader policies |
| `grantApplicationAccess`, `revokeApplicationGrant`, `cancelApplicationInvitation` | `transaction` | `admitProject(gate, p, 'application.manage')` | `project_id = proof.scope.projectId`; the grant takes the exclusive presence lock on the application key |
| `listInstallationAdministrators` | `read(accountId)` | `isInstallationAdministrator(tx)` | reader policy |
| `addInstallationAdministrator`, `removeInstallationAdministrator` | `transaction` | `admitInstallationAdministrator(gate, 'administrators.manage')`, which takes `iam.lock_administrators()` (`admission.ts:232`) | tenure rows; `lastAdministratorStays(tenures)` over the locked set |
| Reaper | `system('iam-reaper')` | `admitSystem(gate, 'iam-reaper')` | each `EXPIRY_RULES` row in batches with `FOR UPDATE SKIP LOCKED` |
| Project purge | the Project owner's `system('project-purge')` | its `Admitted<SystemScope<'project-purge'>>` | the purged Project, in dependency order (section 6) |
| Presence while an application is prepared | section 6, Presence (the operator's decision 6, revisited) | none | the shared presence lock on the application key, at session level |

`application.manage` joins `WorkspaceAction`, `ProjectAction`, `ReadAction` and `ROLE_ALLOWS.owner`, with `ACTION_REFUSALS['application.manage'] = { outsider: 'PROJECT_NOT_FOUND', forbidden: 'APPLICATION_ACCESS_MANAGE_REQUIRED' }` (operator decision 7A). The path names a Project that may have no application yet, so an outsider learns only that the Project is not found. `members.leave` is in `ROLE_ALLOWS.member` (`admission.ts:30`), so it admits only the removal of oneself; every other roster write needs `members.manage` (guide S section 2, "a member does not manage the roster").

**The read admission runs as `hub_reader` (found by #538).** The read overload of `admitWorkspace` selects `account_id, active` from `iam.account` (`admission.ts:175`), a column `hub_reader` cannot read (it holds `SELECT (account_id, display_name, email)`, `0065_split_wall.sql:269`), so `getWorkspaceRoster` would answer 42501 the first time it runs under the real role. The read overload drops that lookup and reads only the membership, as the read overload of `admitProject` already does (`admission.ts:210-214`): the membership `reader` policy goes through `rls.acting_workspaces()`, which keeps only an active account's memberships (`0065_split_wall.sql:55-61,243-244`), so an inactive account reading is an outsider and gets the outsider code, and a command still answers `ACCOUNT_INACTIVE` through `lockActiveAccount`. One shape for both read admissions, and no new grant. Test 4 runs the roster read as `hub_reader`, for an active member, an outsider and a deactivated member (404 `WORKSPACE_NOT_FOUND`).

**Outsiders and unknown ids answer 404: not in this part.** #538's test found that an outsider and an unknown id still get 403 on `createProject` and the Builder operations, against `wire-contract.md:112` and `0015-admission.md:194`, because two `ACTION_REFUSALS` rows copied today's 403 and several call sites outside `identity-access` throw or rewrite the refusal by hand. The operator decided (2026-10-06) that this lands as its own pull request after this part: issue #543, with the call sites, the test over `OPERATIONS`, and decision 11 (an installation administrator may know every Workspace, as a `reader_admin` policy on `workspace.workspace` under rule 4 of `0015-admission.md:463-476`). This part keeps every `ACTION_REFUSALS` row it does not add, keeps `Session.workspaces` and the administrator's view of a deletion in progress (AC-8, `0015-admission.md:855`) as they are, and adds no Workspace policy.

**Isolation.** `authenticate` opens a plain `BEGIN`, READ COMMITTED, like `transaction` (`db.ts:298`). Two facts depend on it, both measured: a revoke that commits between the session lookup and `checkApplication` is refused on that request only under READ COMMITTED (proof 4 of `request-auth-proof.md`), and a one use `DELETE ... RETURNING` raced by a second session returns an empty result under READ COMMITTED and 40001 under REPEATABLE READ (blast radius, proof 5.1).

**An entry that ends a credential returns, then the caller refuses.** `transact` rolls back on any throw (`db.ts:285-289`). So a flow that deletes a session or commits a claim and then refuses returns its outcome as a value from inside `authenticate`, the entry commits, and the caller throws or redirects after it. The `SESSION_ENDED` and `SIGN_IN_REFUSED` lines are written after the commit. A `Failure` thrown by an admission inside the callback (`admitApplication` refusing with `APPLICATION_NOT_FOUND`) is caught inside the entry and turned into the `REFUSED` outcome, so the claim before it commits.

**Concurrent pairs.** Each has a test in section 9.

| Pair | What decides it | Outcome |
| --- | --- | --- |
| Claim against cancel of one invitation, Workspace or application | both are a `DELETE` of the same row; the second waits on the first's row lock and returns no row | exactly one wins: a membership or grant exists if and only if the claim won; a cancel that finds no row answers 404, never success (blast radius, proof 5.2) |
| Two first callbacks of the configured subject | `iam.lock_administrators()` inside `admitBootstrap` | one creates the account and the tenure; the other's `admitBootstrap` returns `null`, it looks the identity up again and enters as that account |
| Two first callbacks of one invited person | the claim's `DELETE`; the loser's claim is empty | the loser looks `(issuer, subject)` up once more and enters as the account the winner created |
| Application callback against the Project purge | the tombstone commits in its own transaction before the purge (`project/deletion.ts:45-61`); `admitApplication` refuses a Project with a deletion row and holds the Project `FOR SHARE`; the purge takes it `FOR UPDATE` | a callback after the tombstone answers `NOT_GRANTED`; one that admitted first commits its handoff, and the purge, which waits for it, deletes that handoff |
| Sign in begin against the Project purge | `lookupSlug` takes the Project `FOR SHARE` and refuses a deletion row; `lookupSlug` and `startOidc` share one entry; the purge takes the Project `FOR UPDATE` first | they serialize on the Project row: a begin after the tombstone answers the no access page; a state a begin committed first is deleted by the purge |
| Handoff redeem against the purge | both take the Project row first, the redeem `FOR SHARE` and the purge `FOR UPDATE` (`project/deletion.ts:66`), so the lock order is the same and no cycle forms. Without that first lock the redeem's session insert would wait on the Project while the purge waits on the handoff, a deadlock (review confirmation, N1) | a redeem after the purge finds no Project and answers sign in required; a redeem that locked first commits, and the purge then deletes its session |
| Role change or removal against the last owner | the owner set is locked in the admission | two owners demoting or removing each other: one 204 or 200, and the other 403 `MEMBERS_MANAGE_REQUIRED`, since it is no longer an owner when its admission runs (HQ 19); the only owner stepping down: 409 `LAST_OWNER` |
| Two administrators revoking each other | `iam.lock_administrators()` | one 204, and the other 403 `INSTALLATION_ADMINISTRATOR_REQUIRED`, since its tenure is revoked when its admission runs (HQ 19); the last administrator revoking itself: 409 `LAST_INSTALLATION_ADMINISTRATOR` |
| Two reaper passes | `FOR UPDATE SKIP LOCKED` in each batch | no row deleted twice, no 40P01 |
| Two requests finding one recheck due | the record is `UPDATE ... WHERE provider_checked_at = $seen`; Keycloak does not rotate refresh tokens (`host-sessions.ts:153-156`) | each is served on its own answer; the first to record stores its token; a record that updates 0 rows reads the session once more to tell "already recorded" from "ended" |
| A runner, Keycloak or Git call and any IAM transaction | no transaction is held across a network call | the only lock held across `prepare` is the presence lock (section 6) |

## 4. Data model, policies and register rows

All objects of schema `iam` belong to `conexus_owner` after this part. Every table but `iam.schema_migration` has `ENABLE` and `FORCE ROW LEVEL SECURITY` and one `command` policy `TO hub_command` (guide D section 7). `hub_runtime` keeps only `SELECT` on `iam.schema_migration` (`assertSchemaCurrent`).

| Table | Columns | Why it exists | Reader policy (`TO hub_reader`, `A` is `(SELECT rls.acting_account())`, every branch requires `A IS NOT NULL`) |
| --- | --- | --- | --- |
| `account` | `account_id` PK; `issuer`, `external_subject` (unique pair); `display_name` (`\S`); `email` null; `origin` (`CONTROL_PLANE`, `APPLICATION_INVITATION`); `active`; `created_at` | One person. The provider pair is the identity (guide S section 3). `email` is the verified email of the latest sign in that had one, for presentation and for finding a person to make administrator, never identity. `origin` holds the Hub entry rule until spec 0006 maps it to `kind`. | self; co members; grantees of Projects whose Workspace the reader owns; for an open tenure, every account |
| `workspace_membership` | `(account_id, workspace_id)` PK; `role`; `created_at` | Authority (guide S section 2). | as built in part 0b (`rls.acting_workspaces()`) |
| `workspace_invitation` | `invitation_id` PK; `workspace_id`; `email` (lowercase and trimmed CHECK); `role`; `invited_by`; `created_at`; `expires_at` (`> created_at`); unique `(workspace_id, email)` | Calls an email into a Workspace (contract section 4). Kept 30 days past expiry so the roster says "expired". | Workspace in `rls.acting_workspaces()` |
| `installation_administrator` | `tenure_id` PK; `account_id`; `granted_via` (`OPERATOR_BOOTSTRAP`, `ADMINISTRATOR`); `granted_by`; `granted_at`; `revoked_at`; `revoked_by`; one open tenure per account; CHECK `granted_by` null exactly for `OPERATOR_BOOTSTRAP` | The administrator fact, with its history (F7 kept). | `rls.acting_installation_administrator()`, plus the `iam_rls` policy below |
| `application` | `project_id` PK and key to `project.project`; `slug` unique with today's CHECK; `created_by`; `created_at` | The application's address, resolved before any session. | owner of the Project's Workspace (inline `role = 'owner'`, as `connector.connection.reader`) |
| `application_grant` | `grant_id` PK; `project_id` key to `application`; `account_id`; `granted_by`; `granted_at`; `revoked_at`; `revoked_by`; one open grant per (Project, account) | Access to an application, keyed by the account and never by an email (study gate decision 4). | as `application` |
| `application_invitation` | `invitation_id` PK; `project_id` key to `application`; `email`; `invited_by`; `created_at`; `expires_at`; unique `(project_id, email)` | Access given by email before the person has an account. | as `application` |
| `oidc_transaction` | `state_digest` PK; `pkce_verifier`; `nonce`; `expires_at`; `application_project_id` null, key to `application`; `sign_in_binding_digest` null; CHECK both or neither | One sign in in flight (PKCE S256). Consumed by `DELETE ... RETURNING` (F1). | none, command only |
| `host_session` | `token_digest` PK; unique `(token_digest, account_id)`; `kind` (`HUB`, `APPLICATION`, `PREVIEW`); `account_id`; `started_at`; `absolute_expires_at`; `idle_expires_at` (HUB); `project_id` (APPLICATION, PREVIEW; key to `project.project`); `artifact_revision_id` (PREVIEW, an id without a key); `parent_digest` (PREVIEW); `provider_refresh_token` sealed and `provider_checked_at` (HUB, APPLICATION); one CHECK per kind; `(parent_digest, account_id)` key to `host_session (token_digest, account_id)` `ON DELETE CASCADE`, with its index | One row per cookie, three kinds (guide S section 4). Ending is `DELETE` (F2). The pair key keeps a Preview from naming another account's Hub session (admission child section 5). | none, command only |
| `handoff` | `handoff_digest` PK; `kind`; `account_id`; `minted_at`; `expires_at`; `project_id` (key to `project.project`); APPLICATION: `binding_digest`, sealed `provider_refresh_token`; PREVIEW: `artifact_revision_id`, `parent_digest`, `session_expires_at`; one CHECK per kind; `(parent_digest, account_id)` key to `host_session (token_digest, account_id)` `ON DELETE CASCADE`, with its index | A one use proof for one host, bound to its sign in (guide S section 4). | none, command only |
| `schema_migration` | unchanged | The migration runner's, unscoped by design. | none |

Deleted: `bootstrap_context`, `operation_idempotency`, `preview`; types `iam.session_lifetime` and `iam.action`; `oidc_transaction.consumed_at`; `host_session.ended_at`, `ended_reason`, `preview_id`; `handoff.preview_id`; the partial index `handoff_one_per_preview`. Kept: type `iam.workspace_role`.

**The `iam_rls` role keeps reading.** `rls.acting_workspaces()` and `rls.acting_installation_administrator()` are `SECURITY DEFINER` functions owned by `iam_rls`, and every other owner's reader policy runs through them (blast radius, proof 1). `iam_rls` keeps its policies on `account` and `workspace_membership` and gets one more, `FOR SELECT TO iam_rls USING (true)` on `installation_administrator`. Without it every administrator loses the administrator branches of `project.project`, `project.project_deletion` and `connector.connection` with no error (blast radius, risk 1; 4 of 72 reads changed, 72 of 72 identical with the policy). A repository check asserts that `iam_rls` has a policy on every table an `rls.*` helper reads.

**Grants** (the register rows in `contracts/technical/hub-catalog-census.json`, asserted by the catalog lint):

| Table | `hub_command` | `hub_reader` |
| --- | --- | --- |
| `account` | `SELECT, INSERT, UPDATE (email)` | `SELECT (account_id, display_name, email)`, as today |
| `workspace_membership` | `SELECT, INSERT, UPDATE (role), DELETE` | `SELECT` |
| `workspace_invitation` | `SELECT, INSERT, UPDATE (role, invited_by, expires_at, created_at), DELETE` | `SELECT` |
| `installation_administrator` | `SELECT, INSERT, UPDATE (revoked_at, revoked_by)` | `SELECT` |
| `application` | `SELECT, INSERT, DELETE` | `SELECT` |
| `application_grant` | `SELECT, INSERT, UPDATE (revoked_at, revoked_by), DELETE` | `SELECT` |
| `application_invitation` | `SELECT, INSERT, UPDATE (invited_by, expires_at, created_at), DELETE` (it has no `role`; blast radius, risk 5) | `SELECT` |
| `oidc_transaction` | `SELECT, INSERT, UPDATE (expires_at), DELETE` | none |
| `host_session` | `SELECT, INSERT, UPDATE (idle_expires_at, provider_refresh_token, provider_checked_at), DELETE` | none |
| `handoff` | `SELECT, INSERT, UPDATE (expires_at), DELETE` | none |

`hub_reader` reads seven tables. An installation administrator now reads every account (5 rows where it read 3 in the spike), the visible change the `account` reader policy makes for the administrator screens.

**Who writes IAM tables.** Only files under `apps/hub/src/identity-access/` write a table of schema `iam`. `scripts/census-boundaries.mjs` gains the rule and fails on an `INSERT`, `UPDATE` or `DELETE` naming `iam.` in a `sql` template outside that folder. The purge port's type (`Admitted<SystemScope<'project-purge'>>`) replaces the `conexus.job` guard the admission child kept inside the SQL purge (section 6, "The purge guard").

**The receipt.** `platform.operation_receipt.account_id` becomes `NOT NULL` and its CHECK `(account_id IS NULL) = (authority LIKE 'bootstrap:%')` is dropped, since no bootstrap authority remains (blast radius, proof 5.3).

**The migration, in the order PostgreSQL accepts** (blast radius, proof 3; `spike/07-migration-0070.sql` committed and passed 16 of 16 post checks). The runner wraps the body in one transaction (`scripts/run-hub-migrations.mjs`). No data is moved: the local databases are reset after S1 and CI starts empty, so the deletes below remove only rows the new shape cannot carry or would bring back to life.

1. Delete what the new shape cannot carry or would revive: every `PREVIEW` row of `handoff` and `host_session`; every ended session (`DELETE FROM iam.host_session WHERE ended_at IS NOT NULL`, children first), since today an ended session keeps its row 72 hours with a null token, and dropping `ended_at` would make it live; every consumed sign in state (`DELETE FROM iam.oidc_transaction WHERE consumed_at IS NOT NULL`), since dropping `consumed_at` would make it consumable again; every handoff whose parent session was just deleted; and every receipt with a null `account_id`.
2. Drop the 45 functions, each with its exact signature, no `CASCADE`.
3. Drop the constraints, keys and partial indexes that name `ended_at`, `ended_reason`, `preview_id` and `consumed_at`, then the columns. `DROP COLUMN` also drops `host_session_hub_check`, `_application_check`, `_preview_check`, `host_session_open_application`, `host_session_open_children`, `handoff_application_check` and `handoff_preview_check` without a word, so step 4 adds back each rule the new shape keeps.
4. Add the new columns, the kind CHECKs, the `project_id` keys, the unique `(token_digest, account_id)`, the two pair keys with their cascades and indexes.
5. Drop `iam.preview`, `iam.bootstrap_context`, `iam.operation_idempotency`, types `iam.session_lifetime` and `iam.action`.
6. Set `operation_receipt.account_id NOT NULL` and drop its bootstrap CHECK.
7. Drop the bridge policies (`iam.account.legacy_runtime`, four `legacy_owner`).
8. `REASSIGN OWNED BY` the seven owner roles to `conexus_owner`, then `DROP OWNED BY` them and `hub_iam_runtime`, then `DROP ROLE` all eight.
9. Revoke `hub_runtime`'s direct privileges on IAM tables and functions, keep its `SELECT` on `iam.schema_migration`; grant the register rows above.
10. `ENABLE` and `FORCE ROW LEVEL SECURITY`, then the command, reader and `iam_rls` policies.

Step 1 is newer than the spike's 16 of 16: `spike/12-migration.sql` with the seed `spike/12-seed-ended.sql` (ended sessions, consumed states, PREVIEW rows, null receipts) commits where the old step failed with 23514, and passes 16 of 16 checks plus 13 more (`spike/12-output.txt`). Before the merge the builder runs `spike/07` (rebased to the build head) as the real migration runner login against one cluster that holds two migrated databases, since roles belong to the cluster and `REASSIGN OWNED` acts on one database (review A, finding 15). The pull request names the outcome. The pull request also commits the regenerated catalog snapshot, the role register and the function callers document (their scripts, never by hand).

## 5. The owner specific port

**Module shape.** Chosen by the architect bakeoff (Opus base, with grafts from the Sonnet candidate) and the operator's decisions 3A, 4A and 5B. One subject per file (guide C section 1).

| File | Subject |
| --- | --- |
| `admission.ts` (floor, edited) | gains `application.manage`, the body of `admitBootstrap` and `receiptOf`; `admitApplication` and `checkApplication` accept an authentication gate with a bound account; gains `checkProject(gate, projectId)` for the Preview request, the same shape as `checkApplication` over the Project's Workspace membership (decision 13) |
| `authentication.ts` | the only other file that opens a gate: the `DigestKey` union, `DIGEST_EFFECT`, `lookupByDigest`, the identity steps, and the claim's two `DELETE ... RETURNING` statements; no flow |
| `oidc.ts` (kept, edited) | the Keycloak adapter; claims parsed at the boundary into `SignInClaims` with a `ClaimedEmail`; scope `openid email profile` |
| `sign-in.ts` | the two protocol routes and the callback's one decision, `SignInOutcome`; `NO_ACCESS` and `locationOf` |
| `sessions.ts` | the three session kinds and the two handoffs: open, resolve, slide, recheck, end, redeem; `standingOf`, `mayEnterHub`; `getSession` and `endSession`; `withApplicationRequest` |
| `roster.ts` | the five roster operations, `lastOwnerStays`, `invitationState`, and `joinClaimed(proof, claim)`, which inserts the memberships a claim returned |
| `application-access.ts` | the four application access operations, `slugFor`, `grantClaimed(proof, claim)`, the presence lock and the Project purge port |
| `administrators.ts` | the three administrator operations, `lastAdministratorStays`, and `grantFirstTenure(proof)`, which the callback calls with the bootstrap proof |
| `expiry.ts` | `EXPIRY_RULES` and the reaper job |
| `module.ts` | `createIdentityAccessModule`, the ports other owners call |
| `current-session.ts` (edited) | `CurrentSession`, `HubSession`, `HubSessionDigest`, `hubSessionDigest` as names over `db.ts` brands (F9 kept); the bootstrap names go |

**The gate and the lookups.**

```ts
// platform/db.ts
authenticate<T>(fn: (gate: AuthenticationGate) => Promise<T>): Promise<T>   // plain BEGIN, SET LOCAL ROLE hub_command, actor { kind: 'authentication', accountId: null }
export const bindAccount: (gate: AuthenticationGate, accountId: AccountId) => void   // importable only by authentication.ts (the openGate restriction); refuses a second account with GATE_ACTOR_REFUSED

// identity-access/authentication.ts
export type DigestKey =
  | Readonly<{ kind: 'oidc-state'; digest: Digest }>
  | Readonly<{ kind: 'hub-session'; digest: Digest }>
  | Readonly<{ kind: 'application-session'; digest: Digest; slug: ApplicationSlug }>
  | Readonly<{ kind: 'preview-session'; digest: Digest; artifactRevisionId: ArtifactRevisionId }>
  | Readonly<{ kind: 'application-handoff'; digest: Digest; slug: ApplicationSlug; bindingDigest: Digest }>
  | Readonly<{ kind: 'preview-handoff'; digest: Digest; artifactRevisionId: ArtifactRevisionId }>

export const DIGEST_EFFECT = {
  'oidc-state': 'consume',          // DELETE ... WHERE state_digest = $1 AND expires_at > now() RETURNING
  'hub-session': 'lock',            // the slide writes the row
  'application-session': 'read',    // no lock on a served request (F6)
  'preview-session': 'read',
  'application-handoff': 'consume',
  'preview-handoff': 'consume',
} as const satisfies Record<DigestKey['kind'], 'consume' | 'lock' | 'read'>

export function lookupByDigest<K extends DigestKey>(gate: AuthenticationGate, key: K): Promise<DigestRow<K['kind']> | null>
```

A lookup that finds an account binds it with `bindAccount`, so `admitAccount`, `admitApplication` and `checkApplication` read it from the gate's actor. The `application-session` and `application-handoff` lookups join `iam.application` by slug, so one entry needs no separate slug lookup (proof 3 of `request-auth-proof.md`: the primary keys and the slug key, about 0.04 ms on 30000 sessions). The Preview handoff and session key by `artifactRevisionId`, which the host `preview-<artifactRevisionId>.<domain>` carries; the table has no host column after F8.

**One clock.** Deadlines are bound as `now() + make_interval(secs => $n)` and compared with `now()` in the statement. A session row is read with its computed standing: `liveness` (`LIVE`, `IDLE_EXPIRED`, `ABSOLUTE_EXPIRED`) and `recheck_due`. `standingOf(row)` is a pure mapping of those columns to `{ kind: 'ended', reason }` or `{ kind: 'live', recheckDue }`; no TypeScript clock decides a session.

The identity steps, each one exact statement keyed by one value: `lookupIdentity(gate, identity)`, `provisionIdentity(gate, claims, basis)` (`INSERT ... ON CONFLICT (issuer, external_subject) DO NOTHING RETURNING`; on no row it looks the identity up and binds that account, so a parallel callback that created it first wins without a 23505), `refreshEmail(gate, verifiedEmail)` (the bound account's `email`), `claimInvitations(gate, email)` (the two guarded deletes), `lookupSlug(gate, slug)`, `startOidc(gate, state)` and `endCredential(gate, reason)`. `hasOpenInvitation`, `mintContext` and `consumeOidcState` of the floor are not written (F3, F4, F1).

**Types that leave illegal states out.**

```ts
export type ClaimedEmail = Readonly<{ kind: 'verified'; email: VerifiedEmail }> | Readonly<{ kind: 'unverified' }> | Readonly<{ kind: 'absent' }>
export type ConfiguredIdentity = ProviderIdentity & { readonly [configured]: true }   // made only by configuredIdentity(config, identity)
export function admitBootstrap(gate: AuthenticationGate, identity: ConfiguredIdentity): Promise<Admitted<BootstrapScope> | null>   // null: an account exists now
export type ProvisionBasis = Readonly<{ kind: 'bootstrap'; proof: Admitted<BootstrapScope> }> | Readonly<{ kind: 'claim'; claim: Claim }>   // a Claim is never empty
export type SignInOutcome =
  | Readonly<{ kind: 'HUB'; session: OpenedSession }>
  | Readonly<{ kind: 'APPLICATION'; handoff: MintedHandoff; origin: ApplicationOrigin }>
  | Readonly<{ kind: 'REFUSED'; venue: 'HUB'; reason: HubNoAccessReason }>
  | Readonly<{ kind: 'REFUSED'; venue: 'APPLICATION'; reason: ApplicationNoAccessReason; origin: ApplicationOrigin }>
```

`HubNoAccessReason` is `SIGN_IN_EXPIRED | SIGN_IN_FAILED | IDENTITY_EMAIL_NOT_VERIFIED | IDENTITY_NOT_ELIGIBLE | ACCOUNT_INACTIVE`, declared in the contract with `satisfies readonly FailureCode[]`. `ApplicationNoAccessReason` is `EMAIL_NOT_VERIFIED | NOT_GRANTED | SIGN_IN_FAILED`, the query values the host already uses, and `APPLICATION_NO_ACCESS_TEXT` maps each to its failure row (`APPLICATION_EMAIL_NOT_VERIFIED`, `APPLICATION_NO_ACCESS`, `APPLICATION_SIGN_IN_FAILED`) with `satisfies Record<ApplicationNoAccessReason, FailureCode>`, so the build fails until each row exists. An inactive account at an application shows `NOT_GRANTED`. `NO_ACCESS` is the one table of what each surface discloses, and `locationOf(outcome)` is pure, so the callback tests assert URLs without a server.

**Expiry as data.** `EXPIRY_RULES` replaces `iam.reap_expired()`. One pass of the job deletes at most one batch per rule:

| Table | Deadline |
| --- | --- |
| `handoff` | `expires_at <= now()` |
| `host_session` | `absolute_expires_at <= now() OR idle_expires_at <= now()` (children cascade) |
| `oidc_transaction` | `expires_at <= now()` |
| `workspace_invitation` | `expires_at <= now() - interval '30 days'` |
| `application_invitation` | `expires_at <= now() - interval '30 days'` |

**The receipt without the import** (F5, operator decision 4A). `receipt.ts` imports nothing from `identity-access`. It declares `Receipted`, a branded type (a `unique symbol` in `receipt.ts`) over `{ tx: WriteTx; authority: ReceiptAuthority }`, where `ReceiptAuthority` is a `platform` union (`account`, `workspace` with account, `installation` with account). Its maker `receipted(tx, authority)` is importable only by `admission.ts`, by the same restricted import mechanism as `openGate`. `receiptOf(proof)` in `admission.ts` derives the authority from the proof's scope and is exhaustive over the keyed scopes, so the data child's rule "derived from the proof's scope, never passed" holds. The four existing receipt calls change one argument each: `idempotent(receiptOf(proof), ...)` in `workspace/store.ts`, and `reserve` twice and `complete` once in `project/store.ts:84,92,100`. The stored authority text of the existing scopes is unchanged; `installation:account:<id>` is new. The import checker's exemption for `receipt.ts` goes.

**The application request** (operator decision 5B).

```ts
// identity-access/sessions.ts
export type ApplicationRequest = Readonly<{ caller: Caller; checked: Checked<ApplicationScope> }>
export type ApplicationOutcome<T> =
  | Readonly<{ kind: 'SERVED'; value: T }>
  | Readonly<{ kind: 'SIGN_IN_REQUIRED' }>          // no session, an ended one, or a refusal that ended it
  | Readonly<{ kind: 'PROVIDER_UNAVAILABLE' }>
export function withApplicationRequest<T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: ApplicationRequest) => Promise<T>): Promise<ApplicationOutcome<T>>

// hosting/application-host-routes.ts: the ports, generic over the proof, so mar names no identity-access type
export type ApplicationHostSessions<C> = Readonly<{
  withApplicationRequest<T>(presented: Readonly<{ slug: ApplicationSlug; token: RawToken }>, serve: (request: Readonly<{ caller: Caller; checked: C }>) => Promise<T>): Promise<ApplicationOutcome<T>>
  redeem(input: Readonly<{ handoff: RawToken; slug: ApplicationSlug; binding: RawToken }>): Promise<Readonly<{ sessionToken: RawToken; maxAgeSeconds: number }> | null>
  signOut(token: RawToken): Promise<void>
}>
export type ApplicationHostReader<C> = Readonly<{ readServedManifest(checked: C): ...; readServedFile(checked: C, path: ApplicationFilePath): ... }>
// hub.ts instantiates both with C = Checked<ApplicationScope>

// the serve handler: both reads of a client route (the file, then the SPA fallback to index.html) run in the one callback
const outcome = await sessions.withApplicationRequest({ slug, token }, async ({ checked }) => {
  const file = await reader.readServedFile(checked, path)
  return file.ok || classified.kind !== 'client-route' ? file : reader.readServedFile(checked, ENTRY_PATH)
})
```

**The ports of `module.ts`.** `hub.resolve` for `http/access.ts`, `applicationHost` (`withApplicationRequest`, `redeem`, `signOut`) and `previewHost` for `hosting`, `openPreview`, `withApplicationPresence`, `purgeProject`, `jobs`, and `registerRoutes`. `module.ts` forwards nothing; it hands out the objects the subject files built.

## 6. Flows

**Sign in, begin.** One `authenticate`: for an application sign in, `lookupSlug(slug)` finds the Project, takes it `FOR SHARE` and refuses one with a deletion row; a slug that is not even well formed cannot name an application origin, so the Hub answers its own `/no-access?reason=SIGN_IN_FAILED`; `oidc.begin()` mints the state, the nonce and the PKCE verifier (no network); `startOidc` inserts the row by `digest(state)`. The raw state rides the `oidcState` cookie and the redirect. A bad slug or binding answers the application host's no access page.

**Sign in, callback** (operator decision 3A: the decision and the session in one transaction).

1. The cookie must equal the query state, else `SIGN_IN_EXPIRED`. An `error` query from Keycloak (`access_denied` and the like) is `SIGN_IN_FAILED` with the error code in the log. `authenticate` with `lookupByDigest({ kind: 'oidc-state' })` consumes the row. No row is `SIGN_IN_EXPIRED`. Commit.
2. `oidc.complete()` exchanges the code with PKCE and the nonce, outside any transaction, and returns `SignInClaims`. Keycloak unreachable, a code already used or a nonce mismatch is `SIGN_IN_FAILED`, with the cause in the log. A malformed claim is `SIGN_IN_FAILED` with an `IDENTITY_CLAIM_MALFORMED` line naming the claim, never its value. `email_verified` counts only as the boolean `true`; any other type is logged as `OIDC_EMAIL_VERIFIED_UNEXPECTED_TYPE` with its type. The display name is the `name` claim, else `preferred_username`, which Keycloak always sends with the `profile` scope; neither is `IDENTITY_CLAIM_MALFORMED`.
3. One `authenticate` decides and opens, and returns `SignInOutcome` as a value:
   - `lookupIdentity`. Found and inactive: `ACCOUNT_INACTIVE`. Found and active: with a verified email, `refreshEmail` and claim the invitations of this sign in's email; then enter.
   - Not found, and the identity is the configured one: `admitBootstrap` takes `iam.lock_administrators()` and returns a proof only when no account exists. With the proof, `provisionIdentity` inserts the account (`CONTROL_PLANE`) and `grantFirstTenure(proof)` the tenure (`OPERATOR_BOOTSTRAP`); then enter. With `null`, look the identity up once more: found, enter as that account; still not found (another account exists, so the installation is founded), continue as below.
   - Not found, not founding: with a verified email, `claimInvitations`. A non empty `Claim` is the basis for `provisionIdentity` (`CONTROL_PLANE` when a Workspace invitation was claimed, else `APPLICATION_INVITATION`); `joinClaimed` and `grantClaimed` insert the memberships and grants on the proof. An empty claim looks `(issuer, subject)` up once more, for a parallel callback of the same person, before refusing with `IDENTITY_NOT_ELIGIBLE`, or `IDENTITY_EMAIL_NOT_VERIFIED` when the email was not verified. An empty claim writes nothing.
   - Hub return: `mayEnterHub` decides (`origin = 'CONTROL_PLANE'` or a membership); then the HUB session is inserted on `proof.tx` with the sealed refresh token; 303 to `/` with the cookie. Else `IDENTITY_NOT_ELIGIBLE`.
   - Application return: `admitApplication(gate, projectId)`; on access the APPLICATION handoff is inserted (60 s, the binding digest, the sealed refresh token); 303 to `<application origin>/__conexus/sign-in/complete?handoff=` with `Referrer-Policy: no-referrer`. Its `APPLICATION_NOT_FOUND` is caught in the entry and becomes the reason `NOT_GRANTED`; an unknown identity with an unverified email is `EMAIL_NOT_VERIFIED`.
   - **A claim commits even when the return refuses.** A person who signs in at the Hub with only an application invitation gets the account and the grant, and the Hub answers `IDENTITY_NOT_ELIGIBLE`; the invitation was accepted by the verified email it named. A found account that claims a Workspace invitation and is then refused by the application keeps the membership.
   - Every refusal is a 303 to the Hub `/no-access?reason=` or the application's `/__conexus/no-access?reason=`, with a `SIGN_IN_REFUSED` log line written after the commit. This replaces today's blank 400, 403 and 503 answers of the callback.

**The claim.** One rule for both kinds: `DELETE FROM iam.workspace_invitation WHERE email = $verified AND expires_at > now() RETURNING workspace_id, role, invited_by`, then `INSERT ... ON CONFLICT DO NOTHING` into the memberships; the same for application invitations into open grants, with `granted_by = invited_by`. The guarded delete is the claim and the consumption in one statement, so a claim and a cancel cannot both win (proven, blast radius 5.2). The email is the verified claim of this sign in, parsed by the contract's `EmailAddress`, never a stored one.

**First access.** The configured person signs in once on an empty installation and lands in the Hub as installation administrator, with no form. The next step is `createWorkspace`, unchanged.

**Hub request.** `authenticate`: `lookupByDigest({ kind: 'hub-session' })` locks the row and reads its standing. An ended one (idle, absolute) is deleted and the outcome says so; an account that lost Hub entry (an app only account whose last membership went) ends with `HUB_ENTRY_WITHDRAWN`; a live one slides `idle_expires_at` with one `UPDATE`. The entry commits, then the caller answers 401 and writes `SESSION_ENDED` with the reason. A due recheck runs in three steps: the entry returns the sealed token and the seen `provider_checked_at`; Keycloak is asked outside any transaction; a second `authenticate` records with `WHERE provider_checked_at = $seen` or ends the session. Keycloak unreachable keeps the session and answers 503 `IDENTITY_PROVIDER_UNAVAILABLE`. A token sealed under a retired key ends the session with reason `CUSTODY_CHANGED`. A Hub request keeps two entries, the session's `authenticate` and then the operation's own `read` or `transaction`: the session step writes the slide on `hub_command`, while a Hub read runs on `hub_reader` in REPEATABLE READ (`db.ts:226`), and one transaction runs one role (`db.ts:225`). Better Auth and Documenso also resolve the session in its own statement before the handler's query.

**Application request** (operator decision 5B; `request-auth-proof.md`). A request with no cookie, or a malformed one, answers at the edge and opens no entry: a document request is sent to sign in, an API or file request answers 401 `APPLICATION_SIGN_IN_REQUIRED`. A host whose slug names no application therefore no longer answers 404 to a cookieless request; the sign in begin answers its no access page. Otherwise one `authenticate`: the `application-session` lookup by digest and slug (no row lock), its standing, `checkApplication(gate, projectId)` on the same gate, then the served reads the caller passed. Six round trips and one pool checkout, against seven and three today, measured from the server log.

- A refused check deletes the session in the same entry and returns `SIGN_IN_REQUIRED`; the served path never writes. A document request is then sent to sign in. Keycloak's own session makes that silent, and the callback claims a new invitation if the access was given again, or lands on `/__conexus/no-access?reason=NOT_GRANTED`. This is how access comes back after a revoke, since `grantApplicationAccess` always creates an invitation (study gate decision 4).
- A due recheck commits and returns, Keycloak is asked outside, a second entry records, and the request runs again (14 round trips, once per session per five minutes).
- The operation endpoint `POST /__conexus/api/:operation` covers the session, the check and the manifest read in the entry, and invokes the application after it commits.

**Handoff redeem.** One `authenticate`: the Project row `FOR SHARE` (by slug), then `lookupByDigest({ kind: 'application-handoff', digest, slug, bindingDigest })`, a `DELETE ... RETURNING` with the deadline in the predicate, then the APPLICATION session insert (8 hours from the mint). One use, one browser, 60 s.

**Preview.** The Builder's launch calls `openPreview(proof, hubSessionDigest, artifactRevisionId)` with its `Admitted<ProjectScope<'project.read'>>`, so the launch cannot disagree with the admission. It inserts a PREVIEW handoff (30 s, the parent Hub session, `session_expires_at` 15 minutes on). Redeem takes the Project row `FOR SHARE`, deletes the handoff where its revision matches the host and the parent is alive, then inserts the PREVIEW session. Each Preview request resolves the session and its parent's standing, runs the parent's due recheck by the same three steps as the Hub request (guide S section 4), and ends the parent, and the Preview by cascade, on a refusal. It returns `{ accountId, projectId, artifactRevisionId, expiresAt, caller }`. A Preview request does not slide the parent. In the same entry it runs `checkProject(gate, projectId)` (operator decision 13), the Preview's twin of `checkApplication`: no lock, a `Checked` proof, the Project's Workspace membership of the session's account and no deletion row. A refusal deletes the PREVIEW session only, since the person may keep the Hub, and the Preview host answers as for an ended Preview session. So removing a member ends their Previews on the next request, as guide S section 2 requires ("Removing a roster entry must withdraw every right it gave"); it adds one statement to an entry that already reads the session and its parent. `hosting` reads the manifest from the registry by artifact revision.

**Session end.** Sign out: `authenticate`, `DELETE ... WHERE token_digest = $1 AND kind = 'HUB' RETURNING provider_refresh_token`; Preview sessions and handoffs go by cascade; then the Keycloak logout outside the transaction (guide S section 4 order). Idle, absolute, refused recheck and lost custody end the same way, each with a `SESSION_ENDED` line and its reason. The reaper writes one `IAM_REAPED` line per rule with its count.

**Roster and application access.** As section 3. `inviteWorkspaceMember` upserts by `(workspace_id, email)`: a new key for the same pair refreshes role, inviter and expiry and answers the existing id. `grantApplicationAccess` takes the exclusive presence lock on the application key, inserts the address if absent (slug base and suffix loop in TypeScript, `INSERT ... ON CONFLICT (slug) DO NOTHING`), and upserts the invitation by `(project_id, email)`. It never matches an email to an account; the person's next sign in claims it, as a no op when a grant already exists. `revokeApplicationGrant` stamps `revoked_at` and `revoked_by`; the next request of that person is refused by `checkApplication` and ends their session there.

**Presence (the operator's decision 6, revisited at the spec gate).** Today's `withApplicationPresence` reads whether the Project has an application under `pg_advisory_xact_lock_shared`, and when it has none it keeps that transaction open across `applicationRunner.prepare`, so a grant that would create the application cannot proceed meanwhile (`application-access.ts:141-163`, `hub.ts:155-166`). That cannot keep its form: `prepare` may take up to 120 s (`app-runner/module.ts:21`, `PREPARE_TIMEOUT_MS`), and `hub_runtime` ends any transaction idle for 60 s (`0065_split_wall.sql:44`), so a prepare between 60 s and 120 s loses the lock in the middle and fails at commit.

Decided: the same lock held at session level, with no transaction open, the pattern GoTrue uses for its long index work (`auth/internal/indexworker/indexworker.go:83-105`) and the Hub uses for its instance lock. The lock covers the whole prepare, not only the reset window that ends at `resetBefore` (`app-runner/module.ts:22`), because it is simpler and holding it after the reset erases nothing. In order:

1. Read presence in a short `system('application-presence')` entry, which also returns the lock key from the one SQL expression the grant uses, `hashtextextended('conexus:application:' || project_id, 0)` (`application-access.ts:98,113`), selected as `::text` and parsed by its row schema into a `bigint` with `BigInt`, so no digit is lost; no key is computed in TypeScript, so the two locks cannot silently disagree. When the Project has an application, run `prepare` with `REFUSE` and take no lock: the common case opens no extra connection, and an application is never taken away from a Project that keeps existing.
2. When it has none, open a dedicated connection through `session(name, fn)` with the name `conexus-hub:application-presence`, take `pg_advisory_lock_shared(key)`, and read presence again in a second `system('application-presence')` entry, since a grant may have committed between the two reads. The dedicated connection logs in as the Hub's runtime login, so the 5 s `lock_timeout` also bounds this wait (it waits only for a grant transaction in flight); a 55P03 there maps to 503 `DATABASE_BUSY` through the same table as the transaction entries (`db.ts:131`), and the Preview launch answers it. Present now: release and run `prepare` with `REFUSE`. Still absent: run `prepare` with `RESET` holding the lock, and release it in `finally`; closing the connection releases it too.

It works because a session lock does not hold a transaction, so the 60 s idle limit does not apply, and the grant's transaction level exclusive lock still conflicts with it. `prepare` makes no Hub entry (it calls the runner over its socket, `app-runner/module.ts:54-56`), so nothing nests.

The one window it leaves: if the presence connection drops during `prepare`, `session` rejects the caller, but the runner's `prepare` keeps running (it takes no abort signal, `app-runner/module.ts:53-55`) and may still reset until `resetBefore`, at most 60 s after the call. A grant in that window can create the application just before the reset. Accepted: it needs a lost database connection and a first grant of that Project inside the same minute, and an application created that instant has no person's data yet (its invitations are not redeemed). Closing it fully would mean the runner asking the Hub before it resets, a cross process protocol this part does not add. It is listed under What breaks the premise.

Floor edits this needs: `session(fn)` becomes `session(name, fn)`, naming its connection (today it hard codes `conexus-hub:instance-lock`, `db.ts:304`, which `hub-lifecycle.postgres.test.mjs:77` uses to find the instance lock's backend; the instance lock passes that name); its lock handle gains `advisoryLockShared(key)` and `advisoryUnlockShared(key)` beside `tryAdvisoryLock` (`0015-data.md:128`); `JobName` gains `'application-presence'`; `application-access.ts` joins the `session` and `system` callers. What the person sees, as today: a grant made while an application's first prepare holds the lock waits up to the 5 s `lock_timeout` of `hub_runtime` (`0065_split_wall.sql:42`) and then answers 503 `DATABASE_BUSY`; the owner tries again.

**Project purge.** `project/deletion.ts` calls `identityAccess.purgeProject(proof, projectId)` with its `Admitted<SystemScope<'project-purge'>>` instead of `SELECT iam.purge_project(...)`. The port deletes, in dependency order, the handoffs and sessions of the Project, its OIDC transactions, its application invitations and grants, then its address. A late row that a racing begin committed makes the purge fail on its key and roll back; the tombstone stays and the purge job's next pass completes it.

## 7. The web

| Screen or file | Change |
| --- | --- |
| `app/access-gate.tsx`, `features/entry/entry-destination.ts`, `routes/index.tsx` | `query(getSession)` in place of the access context; a 401 shows `SignedOut`, whose button goes to `/protocol/oidc/login` |
| `routes/entry-pages.tsx`, `features/entry/entry-screens.tsx` (`NoAccess`) | the `/no-access` route parses `?reason=` with the contract's `HubNoAccessReason` at the boundary; an unknown or missing value shows `SIGN_IN_FAILED`. Title and text per reason come from `failures.json` through one `Record<HubNoAccessReason, ...>`, so a new reason does not compile without its text. The four texts of study gate decision 3 and the `SIGN_IN_FAILED` text of decision 8. Every reason shows "Entrar com outra conta"; `SIGN_IN_EXPIRED` and `SIGN_IN_FAILED` show "Entrar de novo" |
| `routes/workspace-members.tsx`, `features/identity-access/components/workspace-members.tsx`, `membership-api.ts` | `query(getWorkspaceRoster)`, `call(inviteWorkspaceMember)` with one key per attempt, `call(removeWorkspaceMember)`, `call(cancelWorkspaceInvitation)`, `call(setWorkspaceMemberRole)`; the six `as` casts go |
| `routes/project-settings-access.tsx`, `components/application-access.tsx`, `application-access-api.ts` | `query(getApplicationAccess)`, `call(grantApplicationAccess)` with a key, `call(revokeApplicationGrant)`, `call(cancelApplicationInvitation)` |
| `routes/settings-installation-admins.tsx`, `features/settings/components/admins-screen.tsx`, `installation-page.tsx`, `installation-api.ts`, `use-installation.ts` | `getSession().administrator`, `query(listInstallationAdministrators)`, `call(addInstallationAdministrator)` with a key, `call(removeInstallationAdministrator)`; local schemas and the 204 cast go |
| Sign out | `call(endSession)` |
| `routes/setup.tsx`, `generated/iam-client.ts`, `provisionCurrentAccount` | deleted |
| `hosting/application-host-routes.ts` no access page | three bodies from `APPLICATION_NO_ACCESS_TEXT` (section 5) in place of two |

The screens are proved by the project's `verify` skill in light and dark (guide T section 8): the Hub no access page for each of the five reasons and an unknown one, the application no access page for its three, the members, application access and administrators screens with one change each.

## 8. Value sourcing

| Value | Source |
| --- | --- |
| Lifetimes | `platform/lifetimes.ts`: `HUB_IDLE_SECONDS` 1800, `HUB_ABSOLUTE_SECONDS` 28800, `APPLICATION_ABSOLUTE_SECONDS` 28800, `PROVIDER_RECHECK_SECONDS` 300, `PREVIEW_SECONDS` 900, `APPLICATION_HANDOFF_SECONDS` 60, `PREVIEW_HANDOFF_SECONDS` 30, beside the existing `OIDC_TRANSACTION_SECONDS`, `APPLICATION_SIGN_IN_COOKIE_SECONDS` and `INVITATION_DAYS` (values of `0060_one_owner_per_lifetime_no_csrf_token.sql:16`). Bound into the statements as intervals (section 5, One clock). `BOOTSTRAP_WINDOW_SECONDS` goes. |
| The configured identity | `CONEXUS_BOOTSTRAP_SUBJECT` (`platform/config.ts:218`) with the configured OIDC issuer, made into a `ConfiguredIdentity` once at boot. |
| Display name | the `name` claim, else `preferred_username`. The realm client must release the `profile` scope, an operator step in Keycloak (this part does not touch `infra/keycloak/**`). |
| Account email | the verified email of the latest sign in that carried one; null until then. |
| Application address | the slug base from the Project name, then `-2`, `-3` and so on, in TypeScript; the CHECK of `iam.application.slug` stays. The address is the origin URL `https://<slug>.<applications domain>`. |
| Screen texts | the `failures.json` rows: the four of study gate decision 3 and `SIGN_IN_FAILED`, title "Não foi possível entrar", text "O serviço de login não concluiu a entrada. Entre de novo." (operator decision 8). `APPLICATION_SIGN_IN_FAILED` takes the same text: its old text ("the link expired or was already used") named a redeem failure, which now sends the person to sign in instead. |

## 9. Tests (each with literal expected values)

Fixtures. Issuer `https://keycloak.test/realms/conexus`. Configured subject `00000000-0000-4000-8000-000000000001`. Workspace `W` `55555555-5555-4555-8555-555555555555`. Project `P` `33333333-3333-4333-8333-333333333333` named "Estoque Parado", Project `Q` `44444444-4444-4444-8444-444444444444`. Verified email `ana@x.com`.

**How tests meet time.** No test sleeps (guide T section 2). A test moves time by an admin `UPDATE` that moves a row's timestamps back together (its start and its deadlines, so the CHECKs `expires_at > created_at` and `absolute_expires_at > started_at` hold) or its `provider_checked_at` back, then makes the request. "Expired" below means exactly that.

**Where tests sit.** Every test that touches PostgreSQL, HTTP or not, is a `*.postgres.test.mjs` on `CONEXUS_TEST_DB_CONTAINER` (guide T section 2). Pure functions (`standingOf`, `lastOwnerStays`, `lastAdministratorStays`, `locationOf`, `slugFor`, `NO_ACCESS`) have plain unit tests with literal tables.

1. **First access.** Callback with the configured pair on an empty database: 303 `Location: /`, `Set-Cookie` starts `__Host-conexus_session=` with `Path=/; HttpOnly; Secure; SameSite=Lax` and no `Domain`; `GET /api/session` is 200 with `administrator: true`; one account, one tenure with `granted_via = 'OPERATOR_BOOTSTRAP'` and `granted_by` null. A second sign in: account count 1, tenure count 1. With an account present, the configured issuer and a new subject: `/no-access?reason=IDENTITY_NOT_ELIGIBLE` and no row. Two parallel first callbacks: both 303 `/`, one account, one tenure. A token with no `name` claim and `preferred_username: "leandro-admin"`: display name `leandro-admin`. Then `createWorkspace` with a key: 201 naming the creator.
2. **Sign in.** Replay of a completed state: `SIGN_IN_EXPIRED`, 0 rows for it. A state whose `expires_at` is in the past: `SIGN_IN_EXPIRED`. Query state `a`, cookie `b`: `SIGN_IN_EXPIRED` and the row for `a` untouched. `?error=access_denied`: `SIGN_IN_FAILED`. Keycloak's token endpoint unreachable: `SIGN_IN_FAILED`, the state consumed. `email_verified: "true"` with an open invitation: `IDENTITY_EMAIL_NOT_VERIFIED` and a log line with `claimType: "string"` and no email. `email_verified: false`: `IDENTITY_EMAIL_NOT_VERIFIED`, no row. Verified, no invitation: `IDENTITY_NOT_ELIGIBLE`, no row. Verified `ana@x.com` with an open invitation to `W` as member: 303 `/`, account with `email = 'ana@x.com'` and the `name` claim as display name, membership `(account, W, member)`, the invitation gone. Expired invitation: `IDENTITY_NOT_ELIGIBLE`, and the roster shows it `EXPIRED`. Account `(iss, sub1, ana@x.com)`, callback `(iss, sub2, ana@x.com)` verified with no invitation: `IDENTITY_NOT_ELIGIBLE`, no second account. An `APPLICATION_INVITATION` account with no membership at the Hub: `IDENTITY_NOT_ELIGIBLE`, 0 sessions. An unknown identity with only an application invitation signs in at the Hub: `IDENTITY_NOT_ELIGIBLE`, and one account with `origin = 'APPLICATION_INVITATION'`, one open grant and no invitation remain. `active = false`: `ACCOUNT_INACTIVE`. No `sub`: `SIGN_IN_FAILED` and `IDENTITY_CLAIM_MALFORMED` with `claim: 'sub'`. Two parallel callbacks of one invited identity: both 303 `/`, one account, one membership. A known account whose verified email changed to `ana@y.com`: its `email` reads `ana@y.com` after the sign in.
3. **Hub sessions.** Idle expired: 401, row gone, `SESSION_ENDED` with `reason: 'IDLE_EXPIRED'`. Absolute expired: 401, `reason: 'ABSOLUTE_EXPIRED'`. Recheck due, Keycloak `invalid_grant` "User disabled": 401, row gone, `reason: 'PROVIDER_USER_DISABLED'`. Keycloak unreachable: 503 `IDENTITY_PROVIDER_UNAVAILABLE`, row kept, the next request with Keycloak back 200. Two requests with one recheck due: both 200, `provider_checked_at` moved once. `DELETE /api/session` with the Hub origin: 204, cookie cleared, row gone, one logout call after the delete; a second `DELETE` 401; a Preview request of that session: sign in required, its row gone. Envelope cannot open the token: 401, `reason: 'CUSTODY_CHANGED'`. `Origin: https://evil.example`: 403 `REQUEST_AUTHENTICITY_DENIED`. An app only account whose last membership goes: its next Hub request 401 with `reason: 'HUB_ENTRY_WITHDRAWN'`.
4. **Roster.** Every roster read runs under `read`, so as `hub_reader`. As member: 200 with `viewerRole: 'member'` and members and invitations. As outsider: 404 `WORKSPACE_NOT_FOUND`. Invite as member: 403 `MEMBERS_MANAGE_REQUIRED`. A member `PUT`s their own role to `owner`: 403 `MEMBERS_MANAGE_REQUIRED`, the role stays `member`. Keys: no key 400 `IDEMPOTENCY_KEY_REQUIRED`; same key and body twice, two identical 200 bodies and one row; same key, other body, 409 `IDEMPOTENCY_CONFLICT`. New key, `" Ana@X.com "` as owner: 200 with the first invitation's id, `email: "ana@x.com"`, role `owner`, a new `expiresAt`. The only owner removed or demoted: 409 `LAST_OWNER`; two owners each stepping down in parallel: one success, one 409; two owners demoting each other in parallel: one success, one 403 `MEMBERS_MANAGE_REQUIRED`. A member leaves: 204, then 404 on the roster. `DELETE /workspaces/W1/members/<member of W2 only>`: 404 `ROSTER_ENTRY_NOT_FOUND`. Cancel against claim in parallel, both orders: exactly one of (cancel 204, no membership) or (membership, cancel 404 `ROSTER_ENTRY_NOT_FOUND`). A removed member opens the application of a Project of `W` with no grant: no access. A member deactivated after joining reads the roster: 404 `WORKSPACE_NOT_FOUND`, not 42501.
5. **Application access.** `getApplicationAccess` as member: 403 `APPLICATION_ACCESS_MANAGE_REQUIRED`; as outsider: 404 `PROJECT_NOT_FOUND`. First grant on `P`: 200, and `getApplicationAccess` answers `address: "https://estoque-parado.<applications domain>"`; a second Project of the same name: `estoque-parado-2`. Key rules as item 4. Unknown identity, verified email, open application invitation: 303 to `<origin>/__conexus/sign-in/complete?handoff=<43 chars>` with `Referrer-Policy: no-referrer`, account with `origin = 'APPLICATION_INVITATION'`, an open grant; redeem sets the application cookie. Unverified email: `.../no-access?reason=EMAIL_NOT_VERIFIED`, no account. A known person without access: `NOT_GRANTED`. Second redeem, redeem from another browser's binding, redeem after its `expires_at`: sign in required each. Cancel against claim of an application invitation, both orders: exactly one wins. A Workspace member opens `P`'s application without a grant: served. A session of `P` on `Q`'s host: sign in required. Presence: with the first prepare of `P` held in `prepare` (a stub runner that waits), `grantApplicationAccess` on `P` answers 503 `DATABASE_BUSY` after about 5 s and creates no address; after the prepare returns, the same grant answers 200. The presence connection shows `application_name = 'conexus-hub:application-presence'`, and the instance lock's backend keeps its own name.
6. **The application request** (from `request-auth-proof.md`). The server log of one served request shows a plain `BEGIN` (no isolation clause), one `set_config`, the session lookup, the check, the read, `COMMIT`, on one connection. A request with no cookie sends no statement. A revoke committed before the check: refused. A revoke that commits between the lookup and the check: refused. A revoke that commits between the check and the read: that request served, the next refused. During a served request `pgrowlocks` on `iam.application_grant` is empty and a revoke commits without waiting. **Revoke, then grant again, through the operations**: the next document request deletes the session and redirects to sign in; after the callback the person holds a new grant, the invitation is gone and the new cookie is served. Expired session, another slug, unknown digest, purged application: sign in required. Project in deletion, inactive account, no grant or membership: the session deleted and sign in required, and the callback lands on `NOT_GRANTED`. During the Keycloak recheck and during an operation invoke, `pg_stat_activity` shows the backend not in a transaction and the pool holds no connection. A client route reads the file and the SPA fallback in one entry.
7. **Preview.** The entry grant posted to `preview-<artifactRevisionId>.<domain>` sets the session; posted to another Preview host, refused; posted twice, the second refused. Session expired: sign in required. After Hub sign out: sign in required. Parent recheck due and Keycloak says user disabled: sign in required, both rows gone. A PREVIEW row whose `parent_digest` names another account's Hub session: the insert fails on the pair key (23503). A member of `W` with an open Preview of `P` is removed from `W`: the next Preview request deletes the PREVIEW session and answers the ended Preview page, the parent HUB session stays, and a Preview of `P` by a member still in `W` keeps working. A Project with a deletion row: the next Preview request is refused the same way.
8. **Administrators.** `GET /api/session` for a non administrator: 200 with `administrator: false`. `listInstallationAdministrators` as non administrator: 403 `INSTALLATION_ADMINISTRATOR_REQUIRED`; as administrator, the first entry has `grantedVia: 'OPERATOR_BOOTSTRAP'` and no `grantedBy`. Add by unknown email: 404 `ACCOUNT_NOT_FOUND`; two active accounts with that email: 409 `ACCOUNT_EMAIL_AMBIGUOUS`; one: 201 with `grantedBy` the actor; key rules as item 4. Remove the only one: 409 `LAST_INSTALLATION_ADMINISTRATOR`; two each stepping down in parallel: one 204, one 409; two revoking each other in parallel: one 204, one 403 `INSTALLATION_ADMINISTRATOR_REQUIRED`. A removed administrator adds another: 403. Remove an account that holds no tenure: 404 `INSTALLATION_ADMINISTRATOR_NOT_FOUND`.
9. **Expiry and purge.** A reaper pass deletes one batch per rule. 1200 expired handoffs, two reaper passes in parallel with limit 500: 1000 deleted, none twice, no 40P01; a third pass deletes 200. An invitation whose `expires_at` is 29 days back is listed `EXPIRED`; 31 days back it is gone after a pass. After `deleteProject` completes, 0 rows of `application`, `application_grant`, `application_invitation`, `oidc_transaction`, `host_session` and `handoff` for `P`, with one row in each before. A `tsc` negative fixture hands the purge port an `Admitted<AccountScope>` and fails. An application callback, an application redeem, a Preview redeem and a sign in begin, each racing the purge in both orders: a refusal (`NOT_GRANTED`, sign in required, or the no access page) or a committed row the purge then deletes; never a 500, never a 40P01, and never a row of `P` after the purge.
10. **Structure.** `UNDECLARED_OPERATIONS` does not exist and boot fails for a `/api/control` route without an operation. As `hub_runtime`, `SELECT 1 FROM iam.host_session` answers 42501. As `hub_command`, `UPDATE iam.account SET display_name = 'x'` answers 42501. A `sql` template writing `iam.` outside `identity-access/` fails the boundary census. Every security event leaves one log line with its code and trace id, and none carries a token or a claim value. The `iam_rls` check passes, and `spike/08-before-after.sh 1` keeps the 72 reads of the other owners identical. A migration test seeds a PREVIEW session, a PREVIEW handoff, an ended HUB session with a null token, a consumed state and a receipt with a null account, then runs the migration: it commits, and none of those rows remains. `tsc` negative fixtures: a `Checked` passed to `idempotent`, a `Receipted` object literal passed to `idempotent`, a read proof to `receiptOf`, `admitBootstrap` with a plain `ProviderIdentity`, `provisionIdentity` with no basis.
11. **Live, by the verification step** (guide T sections 8 and 9, not CI). On the local stack with a fresh database: the configured person signs in and lands in the Hub as administrator, creates a Workspace, invites an email; that person signs in and lands in the Workspace; a person with an unverified email sees the new screen; a granted person opens an application, and after the grant is revoked the next reload shows no access; after access is given again, the next reload opens the application. The screens of section 7 in light and dark. The prepare time of a real Preview, against the presence design.

The tests named in section 10 that test today's store and routes are deleted and replaced by these. `tests/live/hub-entry.mjs` and `tests/live/identity-sign-out-asks-password.test.mjs` stay, on the new paths.

## 10. Deletes

**SQL functions (45, `DROP FUNCTION` with exact signature, no `CASCADE`):** `account_access_scope`, `admit_application_owner`, `admit_project`, `admit_workspace`, `application_by_slug`, `application_slug`, `application_slug_base`, `bootstrap_installation_administrator`, `cancel_application_invitation`, `cancel_workspace_invitation`, `claim_application_invitations`, `claim_invitations`, `email_has_open_invitation`, `end_host_session`, `end_hub_session`, `grant_application_access`, `grant_first_installation_administrator`, `grant_installation_administrator`, `grant_installation_administrator_by_email`, `has_application_access`, `hub_session_live`, `invite_workspace_member`, `is_installation_administrator`, `list_application_access`, `list_installation_administrators`, `list_workspace_roster`, `mint_application_handoff`, `open_hub_session`, `open_preview`, `provision_application_account`, `purge_project`, `reap_expired`, `record_provider_check`, `redeem_handoff`, `remove_workspace_member`, `resolve_application_session`, `resolve_hub_session`, `resolve_preview_session`, `revoke_application_grant`, `revoke_installation_administrator`, `role_allows`, `session_lifetimes`, `set_workspace_member_role`, `visible_projects`, `visible_workspaces`, all in schema `iam`.

**Relations, columns, types, roles, policies:** section 4.

**Hub:** `identity-access/store.ts`, `routes.ts`, `host-sessions.ts`, `membership.ts`, the old `application-access.ts`, `installation-administration.ts`, `installation-routes.ts`, `reaper.ts`; in `current-session.ts` the bootstrap names, the local id casts and the SQLSTATE mappers; `db.ts` `unportedPool`, the `pools` map and the `raisedRow` use; `failure.ts` `raisedRow` and its `P0001` branch; `opaque-token.ts` `digest` for IAM tokens (`db.ts` `digest` is the one way); `lifetimes.ts` `BOOTSTRAP_WINDOW_SECONDS`; `generated/iam-routes.ts`; `http/app.ts` Ajv; `http/access.ts` access kind `bootstrap`, credential `BOOTSTRAP_COOKIE`, its effect and `UNDECLARED_OPERATIONS`; `http/cookies.ts` the `bootstrap` cookie kind; `receipt.ts` the `BootstrapScope` branch; `hub.ts` `unportedPool` and the `pool` input of IAM.

**Contract and web:** `packages/contract/src/operation.ts` `bootstrap` and `clear-bootstrap-cookie`; `contracts/api/product/identity-workspace-paths.yaml` and the root `openapi.yaml` it feeds; `scripts/generate-iam-contracts.mjs`, `scripts/schema-to-typescript.mjs`, the YAML branch of `scripts/emit-openapi.mjs`; `ajv` and `ajv-formats` in `package.json`; section 7's web deletes.

**Scripts, registers, docs:** `scripts/bootstrap-installation-administrator.mjs` and its npm script; the `hub_iam_runtime` rows of `tests/repository/hub-call-sites.mjs`, `scripts/generate-hub-baseline.mjs` and `contracts/technical/hub-database-roles.json`, with the seven owner rows; the `receipt.ts` exemption of `scripts/check-import-law.mjs`; the business function rows of `docs/reference/function-callers.md` (regenerated). The `/setup` text and the `CONEXUS_BOOTSTRAP_SUBJECT` sign in steps of `.agents/skills/verify/scripts/control.mjs` and `.agents/skills/verify/features/sign-in.md` and `README.md` are rewritten for the one sign in first access; `packages/canonical-json/AGENTS.md` drops `iam.operation_idempotency`. `infra/keycloak/README.md` and `create-first-user.sh` still say the first sign in lands on `/setup`; they are the operator's and are named in the pull request for him.

**Tests replaced** (section 9): `identity-access-http.test.mjs`, `identity-access.postgres.test.mjs`, `membership-authority.postgres.test.mjs`, `workspace-membership-http.test.mjs`, `application-access.postgres.test.mjs`, `application-access-http.test.mjs`, `installation-administrator.postgres.test.mjs`, `installation-settings-routes.test.mjs`, `iam-reaper.postgres.test.mjs`, `iam-reaper-job.test.mjs`, `session-lifetimes.postgres.test.mjs`. The six tests that set `CONEXUS_BOOTSTRAP_SUBJECT` (`application-host.test.mjs`, `builder-composition.postgres.test.mjs`, `builder-planning-free-boot.test.mjs`, `connector-broker.test.mjs`, `hub-role-register.test.mjs`, `workspace-http.test.mjs`) are read and moved to the one sign in first access, signing in through the callback with the configured subject, where today they call the provisioning operation.

**Census.** `node census.mjs` of the study prints the targets of `redesign.md` section 5 at the merge head; the counters that must reach zero include every business function, pool statement, YAML operation, bridge, owner role, cast and string id it counts for IAM.

## 11. Departures this part closes

Rows of [architecture](../../reference/architecture.md) section 11 owned by "S1, part 6" are deleted in this pull request: the receipt import (`:383`), the web `fetch` outside `http.ts` (`:388`), the first access refused (`:389`), rows read without a schema (`:394`), casts and string ids in ports (`:395`), YAML operations and the hand read key (`:401`), and the wrong no access reason (`:408`). Row `:403` is rewritten, not deleted: the unported stores, bridges, legacy roles and rule functions go, and the instance lock session, which this part keeps (non goals), stays named with its wave. The Hub base rows stay.


## Build plan

One pull request, one builder, seven commits in this order. Each commit ends in the check it names. The whole suite is green at the last one, and a commit between them may leave old callers red only where the plan says so (scoped breakage, not a compatibility state).

1. **Contract.** `packages/contract/src/identity-access.ts` with the 14 operations, their shapes, `malformed` tables and summaries; the failure and log rows of section 2; `openapi.json` emitted. Check: `contract:check`, `tsc` of the contract, `operation-malformed-documented`.
2. **Floor edits.** `db.ts` gains `authenticate` and `session(name, fn)` with the shared lock handle, and `JobName` gains `'application-presence'`. `admission.ts` gains `application.manage`, the body of `admitBootstrap`, `receiptOf`, `checkProject`, and the read overload of `admitWorkspace` that reads only the membership. `census-boundaries.mjs` gains the rule that only `identity-access/` writes `iam`. Check: `verify:quick`, the admission and `db.ts` tests, and the `tsc` negative fixtures of test 10.
3. **Migration** (section 4, the ten steps; the next free number, `needs:aprovo`), with the regenerated catalog snapshot, role register and callers document. Old IAM callers are red from here until commit 4. Check: the migration test of test 10, `spike/12-replay.sh` on the build head, `db:catalog:check`, `db:roles:check`, and the `iam_rls` check.
4. **Identity and access.** `authentication.ts`, `sign-in.ts`, `sessions.ts`, `roster.ts`, `application-access.ts` with presence, `administrators.ts` and `expiry.ts`, registered by `route.operation`. The files of section 1 are deleted, and `UNDECLARED_OPERATIONS` goes. Check: tests 1 to 9 on PostgreSQL, and `verify:quick`.
5. **Hosting and purge.** The application host and Preview host on the new ports (`withApplicationRequest`, `redeem`, `signOut`, the Preview's `checkProject`), and `project/deletion.ts` on `purgeProject`. Check: the application host tests, test 6, the Preview and purge races of tests 7 and 9.
6. **Web.** `iam-client.ts` and `routes/setup.tsx` are deleted. The web calls through `http.ts`, and the no access pages and the screens of section 7 are edited. Check: the browser group and `check-web-style`.
7. **Guides and owners.** Every edit of Owner reconciliation, the departure rows of section 11, and the deletes of section 10 not yet done. Check: the `git grep` of the Done when line in the HQ scope finds nothing outside `docs/specs`, the census of section 10 prints its zeros, `npm run conexus:verify` passes with every group, and `spike/07` runs as the runner login on a cluster with two migrated databases, with its outcome in the pull request.

## Non-goals

- Ending one's other sessions, or an administrator ending another person's; rate limits; key rotation (Hub base).
- The instance lock itself (`0015-data.md:128`): it only passes its connection name to `session(name, fn)` (section 6, Presence).
- `infra/keycloak/**` and the realm (the operator's).
- Spec 0006 (the people screen, `kind`, disable) and the study of choosing people or "everyone" for an application (scope item 23, Entrega 3). This part keeps the grant keyed by the account and adds nothing that makes either harder.
- The `archived` column (the wave "Ciclo de vida do Projeto" after part 6).
- Sending `BEGIN` and the role in one message (a later `db.ts` lever, to be measured; it would make every entry one round trip shorter).

## Preserved decisions

Kept from the floor: the split wall, the proofs and their single makers, `admitApplication` for a check followed by a write, the receipt and `idempotent`, the route definer, F7 (tenure history), F9 (the `HubSession*` names), F10 (one `authentication.ts`). Kept from today: the idle slide on every Hub request, the five minute recheck, the cookie names and attributes, the application host pages, the presence lock's rule (a grant cannot create the application while its first prepare runs; it waits up to 5 s, then answers 503 `DATABASE_BUSY`, as today).

## What breaks the premise

- A reader outside `identity-access` that needs a dropped function, table or column and is not in the catalog census of the blast radius (`UNEXPECTED` in the census output).
- A served request that needs to write on its served path.
- A flow that must hold a transaction across Keycloak or a runner.
- Keycloak configured to rotate refresh tokens: concurrent rechecks would then invalidate each other (`host-sessions.ts:153-156`).
- The owner role drop failing as the runner login, or in a cluster with two migrated databases (section 4).
- A prepare whose presence connection drops before `resetBefore` while a first grant of the same Project commits (section 6, Presence): if it is ever seen, the runner must ask before it resets.

## Stop rule

The builder stops and returns to planning when a line cited here no longer holds at the build head and the decision it supports becomes impossible; when a caller of a dropped object turns up outside sections 1 and 10; when the work needs a proof class, entry or `Scope` variant this spec does not name ([delivery](../../development/delivery.md#stop-then-escalate)); or when a second fix on one premise fails review.

## Decided by the operator

At the study gate (2026-10-06): floor changes F1 to F6 and F8 approved, F7, F9 and F10 kept; first access with no form, the name from Keycloak; the four no access texts; granting application access always creates an invitation; the bootstrap command deleted.

At the spec stage (2026-10-06): 1A, an operation is identified by its verb and noun name (#539); 2A, one operation per kind of thing removed; 3A, the callback decides and opens the session in one transaction; 4A, `receiptOf(proof)` derives the receipt authority; 5B, one transaction per application request, after the running proof of `request-auth-proof.md`; 6A, the presence lock's rule as today, held at session level on a dedicated connection (revisited at the spec gate, section 6, Presence); 7A, the application access refusals reuse `APPLICATION_ACCESS_MANAGE_REQUIRED` and `APPLICATION_ACCESS_ENTRY_NOT_FOUND`; 8, the `SIGN_IN_FAILED` text; 11, an installation administrator may know every Workspace, built by #543 after this part; 12, the outsider 404 work is its own pull request, #543; 13, each Preview request checks the Project's membership (section 6, Preview); 9 and 10, the naming and contract package work as their own pull requests before this part. The moved first access text in guides S and H is rewritten here (HQ scope, #145).

## Decided by HQ (implementation inside the approved design)

1. `admitApplication` stays and accepts an authentication gate with a bound account: the application callback writes a handoff after its check, which is exactly the floor's case for the locking admission (`0015-admission.md:294`). Revision 1 deleted it; the review showed the purge race it prevents.
2. `checkApplication` and `accountGate` accept an authentication gate whose lookup bound an account, as `admitAccount` does (`admission.ts:141`). The proof's `tx` stays a `ReadTx`. The connector broker keeps `transaction(accountId)`.
3. `authenticate` opens a plain `BEGIN` (section 3, Isolation).
4. A request with no cookie answers before the entry (proof 1 of `request-auth-proof.md`).
5. A refusal on the application host deletes the session and sends a document request to sign in. Revision 1 kept the session; the review showed that a person whose access is given again would stay locked out until the session's 8 hours end, since access comes back only through a sign in that claims the new invitation.
6. The roster read is `getWorkspaceRoster` at `/roster`, returning today's `WorkspaceRoster` shape.
7. The account's `email` follows the latest verified sign in, so finding a person to make administrator uses a current address.
8. The reaper logs one `IAM_REAPED` line per rule with its count.
9. A Preview request does not slide its parent Hub session and does run its parent's due recheck.
10. One clock: deadlines are bound and compared in the statement.
11. Only `identity-access/` writes IAM tables; no per file map.
12. `Receipted` is branded and made only in `admission.ts`.

Recorded at the build (2026-10-06), each accepted by HQ:

13. The application redeem runs `admitApplication` after it consumes the handoff, so a revoke that commits between the callback and the redeem refuses the redeem.
14. `authentication.ts` gains two steps the flows need: `slideHubSession` (the Hub request's one `UPDATE` of `idle_expires_at`) and `recordProviderCheck` (the second entry of a recheck, `WHERE provider_checked_at = $seen`).
15. The Project purge port moves into the identity commit: `project/deletion.ts` calls `purgeIdentityAccess(proof, projectId)` in the purge transaction from the commit that drops `iam.purge_project`.
16. The presence lock's prefix `'conexus:application:'` is bound as a parameter of the one SQL expression, so the grant and the prepare derive the key from the same text.
17. A claim inserts no grant for an application invitation older than a revoke of that person on that Project; a grant given again after a revoke refreshes the invitation's `created_at`, so it is newer and claims.
18. `listInstallationAdministrators` filters no `active` column: `hub_reader` reads only the person columns of `iam.account`.
19. Two owners demoting each other, or two administrators revoking each other, in parallel: one succeeds and the other answers 403, since it no longer holds the authority; the 409 last holder races are two holders each stepping down (tests 4 and 8).
20. The application and Preview requests also hand hosting `accountId` and `projectId`, which the runner invoke needs and which hosting cannot read from the opaque proof.
21. `applicationSlugOfHost` returns an `ApplicationSlug`.
22. The Preview redeem refuses a Project with a deletion row, as the application begin does, so a redeem never waits on a purge that holds the Project.
23. 0070 drops the eight roles tolerantly: `DROP ROLE IF EXISTS` with `dependent_objects_still_exist` (2BP01) ignored, since another database of the cluster may still depend on them; the last database to migrate drops them (as 0010 does, [data child](0015-data.md), "Dropping a role").
24. 0070 grants `hub_command` `UPDATE (expires_at)` on `iam.handoff` and `iam.oidc_transaction`: the reaper's `FOR UPDATE SKIP LOCKED` needs the `UPDATE` privilege, and that one column is the narrowest grant that gives it.
25. `Session.account` is `SessionAccount`, `{ accountId, displayName, email? }`, the signed in person's own email; `AccountSummary` stays `{ accountId, displayName }` for other people.
26. `platform/application-slug.ts` is the one owner of the slug rule: the reserved labels, the `preview-` prefix and the base generation ported from the SQL. `slugFor` uses it, and the `CHECK` on `iam.application` stays as the database's second guard, with a test that the two agree.

## References

Each mechanism against the reference code, from `study.md` and `request-auth.md` (the reference repositories cloned for the study, `file:line` there):

| Mechanism | Reference | Verdict |
| --- | --- | --- |
| Provider pair as identity, email presentation only | GoTrue `identities_provider_id_provider_unique`; Documenso `@@unique([provider, providerAccountId])` | follows |
| Account created in the callback from claims | Better Auth `oauth2/link-account.ts:542-561`; GoTrue `internal/api/external.go:216-261` | follows |
| First administrator only while empty | cal.com `apps/web/app/api/auth/setup/route.ts:29-32` | follows, with the table lock cal.com lacks |
| One use state by `DELETE ... RETURNING` | GoTrue `oauth_client_state.go:34`; Better Auth `consumeVerificationValue` (`internal-adapter.ts:1376-1390`) | follows |
| Invitation claim as a guarded transition | Better Auth `crud-invites.ts:742-746`; Basejump and Documenso read then write and race | follows the guarded one |
| Session ended by delete, reason in a log | Documenso `session.ts:129-161`; GoTrue `logout.go:46-65` | follows |
| No lock on a read of a session | Documenso `session.ts:71`; Better Auth `api/routes/session.ts:290`; GoTrue locks only on refresh (`sessions.go:269-289`) | follows |
| Session and permission in one transaction | PostgREST `MainTx.hs` (`BEGIN`, one `set_config`, the query, `COMMIT`) and Supabase RLS | follows; Conexus adds the session lookup and keeps the check in one owner |
| Revocation on the next request, no signed claim | GoTrue and cal.com JWTs give it up for speed | differs on purpose: contract section 5.5 |
| Expiry batches with `SKIP LOCKED` | GoTrue `cleanup.go:47-60` | follows |
| Administrator tenure history | not found in the five references | kept from the floor (F7) |
| Presence lock across prepare | GoTrue `indexworker.go:83-105`, a session advisory lock for long work | kept as a rule; held at session level (decision 6) |

## Owner reconciliation

What changes in other documents if this part is accepted. The pull request carries each change. Every path is under `docs/specs/0015-checked-boundaries/` unless it says otherwise.

- `0015-data.md:89-105`, "The authentication gate": the paragraph becomes: "`authenticate` resolves a presented token before any account is known. Its gate carries no method. `identity-access/authentication.ts` holds the closed union `DigestKey` and `lookupByDigest(gate, key)`, whose effect on the row each member names in `DIGEST_EFFECT`: consume (one `DELETE ... RETURNING` with the deadline in the predicate), lock (`FOR UPDATE`, for a step that writes the row), or read (no lock). It also holds the identity steps `lookupIdentity`, `provisionIdentity`, `refreshEmail`, `claimInvitations`, `lookupSlug`, `startOidc` and `endCredential`, each one exact statement keyed by one value. A step that finds or creates an account binds it with `bindAccount`, importable only by that file, so `admitAccount(gate)`, `admitApplication(gate, projectId)` and `checkApplication(gate, projectId)` read it from the gate's actor. Part 6 holds the full list (`0015-part-iam.md`, section 5)."
- `0015-data.md:127` (the entry table): `authenticate(fn)` keeps READ COMMITTED; the purpose cell adds "and an application request's check and served read (part 6, decision 5B)".
- `0015-admission.md:192`: an inactive account is `ACCOUNT_INACTIVE` on a command; on a read the membership policy hides its memberships, so it gets the action's outsider code (section 3, the read admission).
- `0015-admission.md:376`: `session` also takes the blocking shared lock for presence, beside `pg_try_advisory_lock` for the instance lock.
- `0015-data.md:128` (the `session(fn)` row): it becomes `session(name, fn)`, and its lock handle gains the blocking shared lock and its release, for the presence lock (decision 6).
- `0015-data.md:139-142`: the `system` callers add `identity-access/application-access.ts` for `'application-presence'` (decision 6) and `identity-access/expiry.ts`; the `authenticate` callers are `sign-in.ts` and `sessions.ts`.
- `0015-data.md:186,196,204,219-221,242-249,375`: the receipt column comment becomes `account_id uuid NOT NULL REFERENCES iam.account`; the bootstrap CHECK line goes; `idempotent`, `reserve` and `complete` take a `Receipted` from `receiptOf(proof)` (part 6, section 5); the authority list replaces "`bootstrap:<issuer>:<subject>` for the bootstrap scope" with "`installation:account:<id>` for an administrator scope"; the paragraph "IAM-03 (operator bootstrap)" is deleted; the register row's authority cell drops "or bootstrap issuer and subject".
- `0015-admission.md:62,75`: the `bootstrap` scope stays for `admitBootstrap`'s proof, with `issuer` and `subject` from a `ConfiguredIdentity`; it is no longer a receipt scope.
- `0015-admission.md:144-145`: `admitApplication(gate: CommandGate | AuthenticationGate, projectId)` and `checkApplication(gate: CommandGate | AuthenticationGate, projectId)`, each with the comment "an authentication gate must have bound an account (part 6)".
- `0015-admission.md:147`: `admitBootstrap(gate: AuthenticationGate, identity: ConfiguredIdentity): Promise<Admitted<BootstrapScope> | null>`.
- `0015-admission.md:294`: after "the application host's manifest and file reads", add "in the request's one `authenticate` entry (part 6)". The sentence "A caller that writes in the same transaction calls `admitApplication`" stays; the application sign in callback is that caller.
- `0015-admission.md:540-542` (composite keys): the `iam.preview` row is deleted; the `iam.host_session` row becomes "`(parent_digest, account_id)` to `iam.host_session (token_digest, account_id)` `ON DELETE CASCADE`; `project_id` to `project.project`"; the `iam.handoff` row becomes "the same pair key as `iam.host_session`, and `project_id` to `project.project`; no `preview_id`".
- `0015-admission.md:615`: "`transaction(grantHolder, fn)` with `checkApplication(gate, projectId)`" becomes "for the application host, one `authenticate(fn)` with the session lookup and `checkApplication(gate, projectId)`; for the connector broker, `transaction(grantHolder, fn)` with `checkApplication`".
- `0015-admission.md:616-617`: the session row lists the steps of the data child as amended above and drops `hasOpenInvitation`, `mintContext` and `consumeOidcState`; the operator bootstrap row becomes "the sign in callback with `admitBootstrap(gate, identity)`, which takes the administrators' table lock and returns a proof only when no account exists".
- `index.md:575-600`, build plan item 9: replace "IAM-03 on the bootstrap authority", "`hasOpenInvitation`, `mintContext`, `consumeOidcState`", "the `iam.preview` key" and "application access on the `admitApplication` part 0b built" with "the first account in the sign in callback", "`claimInvitations` and the `DIGEST_EFFECT` table", "the Preview session's link to its artifact revision" and "application access under `admitProject(..., 'application.manage')`, `admitApplication` for the sign in and `checkApplication` for served reads"; the item points to `0015-part-iam.md` for the rest.
- `0015-part-registry.md` section 5: the served manifest and file reads take a `Checked<ApplicationScope>` proof, since they now run inside identity access's transaction, by the module's own rule ("a function takes a proof only when it runs inside another owner's transaction"); `readPinnedServedFile` keeps the account and Project form, since the runner calls it outside any entry. The sentence "MAR and `hub.ts` cannot make a `Checked` proof, so a served read that takes one would push the admission into every caller" becomes "identity access makes the `Checked` proof inside `withApplicationRequest` and hands it to the served read".
- `docs/reference/security-and-authority.md` section 2 (the principal classes #539 moved there): `TRUSTED_BOOTSTRAP_CONTEXT` is deleted; the classes become three, and `HUMAN_ACCOUNT_SESSION` says the first Account of the configured subject is created in its sign in callback.
- `docs/product/wire-contract.md` section 1 (moved by #539): "Setting the first installation administrator is an operator shell step, `npm run iam:bootstrap-installation-administrator`" becomes "The first installation administrator is the configured subject's first sign in; every later one is `addInstallationAdministrator`."
- `docs/reference/security-and-authority.md` section 4: "Lifetimes live in `iam.session_lifetimes()` and `platform/lifetimes.ts`" becomes "Lifetimes live in `platform/lifetimes.ts`".
- `docs/reference/architecture.md` section 11: the rows of section 11.

## Changes in this revision

Revision 2 answers the spec review of 2026-10-06 (`interrogate-spec/opus.md` and `sonnet.md`, both "request changes"):

- Security: `setWorkspaceMemberRole` always needs `members.manage` (both reviewers); a member could make themselves owner. `Receipted` is branded with a restricted maker (Opus).
- The migration deletes ended sessions and consumed states, which revision 1 would have failed on or revived (both).
- A refusal on the application host ends the session and sends the person to sign in, so access given again works (Opus); entries return outcomes as values and commit before the caller refuses (Sonnet).
- `admitApplication` stays for the sign in callback, which closes the purge race to a 500 (Sonnet, Opus); begin runs `lookupSlug` and `startOidc` in one entry and refuses a Project in deletion.
- The writer rule is per module, the first tenure and the claim's inserts have owners (both).
- The callback names every outcome: Keycloak error, exchange failure, `admitBootstrap` null with no account, a missing `name` claim, and a claim that commits before a refusal (both).
- The Preview runs its parent's due recheck and keeps the account pair keys (Opus).
- Section 7, the web, is new; the shapes table is new; the tests say how they meet time and where they sit; the isolation test reads the server log; the hosting ports are generic over the proof; the handoff keys by slug (both).
- The presence lock as decided cannot hold across a prepare longer than 60 s; the decision returns to the operator with a recommendation (HQ, from the review's finding and `PREPARE_TIMEOUT_MS`).
- The owner role drop is run as the runner login in a two database cluster before the merge (Opus).

Revision 2.1 answers the confirmation review (`interrogate-spec/sonnet-confirm-r2.md`): every redeem and the begin take the Project row `FOR SHARE` first, which removes a deadlock with the purge (N1) and the begin's 23503 (N7); the migration spike is rerun with ended rows (N2); the presence recommendation names its floor edits, its order and the 5 s answer (N3); the application's `SIGN_IN_FAILED` text (N4); and the nits N5, N6, N8, N9 and N10.

Revision 2.2 records the operator's decision 6 (2026-10-06): the presence lock is held at session level on a dedicated connection across the whole prepare.

Revision 2.3 (2026-10-06) took the outsider column correction and the unknown id test from #538 and recorded the operator's decision 11. Revision 2.4 also takes the operator's decision 13 (the Preview checks Project access on each request, guide S section 2). It answers the confirmation of 2.3 and its own confirmation (`interrogate-spec/sonnet-confirm-r24.md`: the roster read as `hub_reader` in test 4, two admission child lines, the key's type, the second entry, the lock timeout) (`interrogate-spec/opus-confirm-r23.md`): by the operator's decision 12 the outsider work and decision 11 move to #543; the read overload of `admitWorkspace` reads only the membership, like `admitProject`'s; the presence lock takes its key from one SQL expression, names its connection, reads presence before it locks, gets a test, and states its lost connection window.
