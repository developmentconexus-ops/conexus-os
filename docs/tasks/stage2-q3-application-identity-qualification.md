# Stage 2 Q3 — Application identity qualification

**Status:** PREPARED on 2026-09-23. Not started.  
**Type:** material identity and trust-boundary qualification  
**Execution owner:** executor named by the operator  
**Review:** one independent review of the candidate before merge, because this slice creates a new
browser session and a new authority grant

## 1. Authority route

```text
C-015 human authentication (Keycloak authenticates, Conexus authorizes)
+ the 2026-09-22 decision that Keycloak is the only sign-in door
+ C-028 managed-application direction
+ docs/product/contract.md sections 3.1 and 12.2
+ docs/reference/stage2-managed-application-platform.md (section 5, Q3 row)
+ the operator decisions of section 3
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation
```

Repository authority beats this task when they conflict. Evidence that falsifies C-015 or C-028
returns to planning; do not patch around it.

## 2. Protected question

Can an employee use an application without receiving Control Plane authority?

Prove or falsify this statement:

> A person whom a Workspace Owner granted one application, and who belongs to no Workspace, signs in
> through Keycloak, uses that application with their own identity reaching its server logic, and
> cannot create a Workspace, read a Project, open the Builder, reach another application or change
> who they are by any identifier they control. Removing the grant stops them at their next request.

## 3. Operator decisions, 2026-09-23

These were taken by the operator for Q3 and are not reopened by the executor.

1. **Who grants.** An Owner of the Workspace that holds the Project grants and revokes access to its
   application. No other role does.
2. **Grant target.** One person, by verified email, like a Workspace invitation. No groups in Q3.
   Keycloak groups stay provider mechanics under C-015.
3. **Address.** Each application has its own host (`<app>.conexus.fun` in production;
   `<app>.conexus.localhost` on the pilot). The browser's host isolation keeps one application's
   session away from another's and from the Hub's.
4. **Revocation.** Removing the Conexus grant takes effect at the person's next request. Disabling the
   person in Keycloak ends their application session within five minutes. An application session
   lasts at most eight hours before the person signs in again.

## 4. Preserve

- C-015: Keycloak roles, groups and claims grant nothing in Conexus.
- The Hub session, its cookie and its host. No application host ever receives it.
- Workspace invitations, membership and the IAM-01 to IAM-03 flows.
- The Q1 runtime boundary: runner, worker, relay, Project roles, Applications cluster.
- The Q2 handler contract. Q3 only adds the caller to the handler context.
- Preview for developers, unchanged.
- One Conexus installation serves one company.

## 5. Fixed hypothesis

Test this realization first:

```text
Owner grants app access to an email      → an application invitation, like a Workspace invitation
person opens https://<app>.conexus.localhost
→ the app host has no session             → redirect to the Hub login with the app as the return
→ Keycloak authenticates (same realm, same confidential client)
→ the Hub callback resolves or provisions an app-only Account from the open application invitation
→ the Hub mints a one-use, short-lived handoff bound to that Account and that application
→ the app host redeems it and sets its own host-only, Secure, HttpOnly, SameSite=Lax session cookie
→ every app request resolves the session server side → Account + application grant + Project
→ the runner receives the caller in a platform-created context: { db, caller }
```

- **Account.** An app-only Account is an ordinary `iam.account` with no Workspace membership. The
  OIDC callback provisions one only from an open application invitation to that verified email,
  the same rule that already governs Workspace invitations. The bootstrap exception is unchanged.
- **Grant.** A Conexus-owned record: application, Account, granted by, granted at, revoked at. It is
  never read from Keycloak and never from the request.
- **Session.** A new opaque, server-owned application session, separate from `iam.session`. It names
  one Account and one application, has an eight-hour absolute limit, and keeps the Keycloak refresh
  token server side so the Hub can re-check the person at most every five minutes. A refused
  refresh ends the session.
- **Identity reaching handlers.** Handlers receive `caller: { accountId, email, displayName }` beside
  `db`. The runner builds it from the resolved session, never from the invocation input. The
  handler contract and the `conexus-server` skill gain that one field.
- **Application served.** Before Q5 there is no Release, so the application host serves the
  Project's last good Preview artifact and its Preview data. Q5 replaces that with the published
  pointer. This is a qualification boundary, not the product's Published behavior.

Credible alternatives, only if the hypothesis is falsified: a Keycloak client per application, or
Keycloak token exchange. The spike in `scratchpad/q3-identity-spike.md` records why neither is
first.

## 6. People and application used

- **Owner:** `conexus_admin` (`development.conexus@gmail.com`), Owner of the `sdasdsa` Workspace.
- **Employee:** the Keycloak r1f user `funcionario-teste@gmail.com`, verified email, member of no
  Workspace. Never add it to a Workspace.
- **Application:** the Q2 purchasing notebook, Project `2b9d2bbb-6336-4957-bb55-78e5fdd228cd`.
- **Control:** the existing test operator, a Workspace member with no application grant.

## 7. Steps

### Q3.0 — Census and exact API check

Before the first product edit, list what exists: the OIDC callback and provisioning path
(`apps/hub/src/identity-access/`), the Preview entry grant and host cookie
(`preview-access.ts`, `apps/hub/src/mar/preview-routes.ts`), and the runner invocation input. Read
the installed Keycloak version's refresh-token behavior for a disabled user and an ended SSO
session, and record the file or document it comes from.

### Q3.1 — Grant and invitation

Owners grant, list and revoke application access in the Project's settings. The grant is a contract
change: its operations and `docs/product/operation-ledger.md` change in the same commit, and
`npm run wire:bijection` passes.

### Q3.2 — Application sign-in and session

Implement the flow of section 5 on `<app>.conexus.localhost`, with the handoff, the host-only cookie,
exact-`Origin` checks on every state-changing request, and the five-minute Keycloak re-check.

### Q3.3 — Caller in handlers

Pass the caller to handlers through the runner. Update the handler contract and the skill.

### Q3.4 — Builder proof

With `scripts/builder-eval/run.mjs` on the Q2 Project, one request in product language:

> Cada nota passa a registrar automaticamente quem escreveu, pela pessoa que está usando o app.

The Builder must use the caller, not a form field. Budget: two Builder runs, one of them a repair.

### Q3.5 — Employee proof on the pilot

As the employee, in a fresh browser: open the application host, sign in through Keycloak, write a
note, and see their own name on it.

### Q3.6 — Negative proof

Each of these must fail, and the evidence records the request and the refusal:

- the employee opens the Hub, creates a Workspace, lists or reads any Project, opens the Builder, or
  opens a Preview;
- the employee opens another application's host;
- the employee changes any application, Project, Account or installation identifier in the URL,
  headers, body or cookie, and the resolved caller or grant changes;
- an application request carries a caller in its input, and the handler sees it instead of the
  platform's;
- the Hub session cookie is sent to, or readable from, an application host;
- a handoff is redeemed twice, after it expires, or on another application's host;
- a session value chosen before sign-in is still valid after sign-in;
- a state-changing request from another origin succeeds;
- the control Workspace member, who has no grant, uses the application;
- after the Owner revokes the grant, the employee's next request succeeds;
- after the employee is disabled in Keycloak, the session survives more than five minutes;
- a session survives more than eight hours.

## 8. Falsifiers

Any one rejects the hypothesis:

1. any negative case of Q3.6 succeeds;
2. the employee's Account gains a Workspace membership or any Control Plane capability;
3. authority is read from a Keycloak role, group or claim;
4. the caller a handler sees can be set by the application's own request;
5. the Builder cannot use the caller within its budget, with the repeated failure named.

## 9. Non-goals

- no Release, Publish, published pointer or stable production URL (Q5);
- no Connector (Q4);
- no groups, roles or per-row data policy inside an application;
- no Keycloak client per application and no token exchange unless the hypothesis falls;
- no custom domains;
- no change to Workspace invitations or the Hub session.

## 10. STOP law

STOP and return to the planner on:

- a need to reopen C-015 or the 2026-09-22 sign-in decision;
- a need for a second Keycloak client, a token exchange or a Keycloak admin credential in the Hub;
- a need to change the Q1 runtime boundary beyond passing the caller;
- a product question section 3 does not answer;
- a pilot fault: the Hub, Keycloak or the runner not serving. Check the runner socket before
  blaming the Builder.

## 11. Verdict

Return ACCEPT, ACCEPT_WITH_BOUNDARY, REJECT or INSUFFICIENT_EVIDENCE in
`docs/evidence/stage2-q3/README.md`, with the positive proof, every negative case of Q3.6 and the
independent review's findings and how each was resolved.

## 12. Owner reconciliation

After the verdict, reconcile only what Q3 proved:

- `docs/product/contract.md` section 3.1: the application invitation exists;
- `docs/reference/security-and-authority.md`: the application sign-in handoff as the second admitted
  cross-origin browser path, and the application session;
- `docs/reference/stage2-managed-application-platform.md`: the Q3 row and the handler contract's
  caller;
- `docs/roadmap.md`: the Q3 status and the exact next action.

## 13. Reopen triggers

- a real need for groups, roles or row policy inside applications;
- a second identity provider, SSO federation or SCIM;
- Published applications (Q5) needing a session model different from this one.
