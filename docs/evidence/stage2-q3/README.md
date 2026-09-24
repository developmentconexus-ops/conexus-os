# Stage 2 Q3 evidence

**Task:** [Stage 2 Q3 application identity qualification](../../tasks/stage2-q3-application-identity-qualification.md)

## Verdict

**ACCEPT_WITH_BOUNDARY**. The independent review found seven defects and two small ones; each is
fixed with a test that failed before and passes after, and the cases they touch were rerun on the
pilot ([Independent review](#independent-review)).

Every Q3.6 case was refused on the pilot as specified. The employee used the application under their own identity and gained no Control Plane authority. The boundary is the one section 5 of the task already names. Before Q5 there is no Release, so the application host serves the Project's last good Preview artifact and its Preview data. Q5 replaces that with the published pointer.

No falsifier of task section 8 fired:

1. No Q3.6 case succeeded.
2. The employee's Account has zero Workspace memberships and no Hub session.
3. Authority is `iam.has_application_access`: an unrevoked Conexus grant or a current membership in the Project's Workspace. No Keycloak role, group or claim is read.
4. The handler caller comes from the resolved session. A caller in the input is refused, and identifiers in the URL and headers change nothing.
5. The Builder used the caller on the first run of its budget (Q3.4), and the second run built on it without a repair.

## Pilot and people

The pilot Hub ran from `feat/stage2-q3` at `31935ee6` on ports 3443 (Hub), 3444 (Preview) and 3445 (applications), with the Q3 runner. Keycloak is `conexus-s7-keycloak`, realm `r1f`.

| Role | Account | How it reached the application |
| --- | --- | --- |
| Employee | `funcionario-teste@gmail.com`, "Funcionário Teste", origin `APPLICATION_INVITATION` | A grant on `eval-20260923-224304` (Project `2b9d2bbb`), claimed at first sign-in |
| Member | `test-operator@conexus.invalid`, "Operador de Teste", `member` of `sdasdsa` | Membership in the Project's Workspace, no grant (operator answer 8) |
| Owner | `development.conexus@gmail.com`, Owner of `sdasdsa` | Grants and revokes in the Hub |
| Other application | `pedidos-de-ferias` (Project `033d639b`, `sdasdsa`) | Invitation to `funcionario@gmail.com` only; the employee has none |
| Control application | `controle-q3` (Project `2897c1ad`, Workspace `Testando`) | Invitation to `controle-q3@conexus.invalid` only; the member belongs to `sdasdsa` alone |

After the employee's sign-in the database held one Account for that email with origin `APPLICATION_INVITATION`, zero rows in `iam.workspace_membership`, one grant for `eval-20260923-224304` and none elsewhere. The `pedidos-de-ferias` invitation stayed open and untouched.

## Positive proof

**Q3.4, Builder.** Run 1 passed on the Q2 Project with `google-ai-pro/gemini-3.8-flash-high`. The handler reads the author from `caller`, and a note written in the Preview shows "Operador de Teste" before and after reload. See [`q3.4-run1/`](q3.4-run1/) and [`q3.4-grade/`](q3.4-grade/).

Run 2, the last of the budget, asked in product language for the order list to show who wrote each order's latest note ([case](../../../scripts/builder-eval/cases/q3-trace-followup.json)). It passed on the first run with no repair in 411 s. It changed `app/src/main.tsx`, `conexus/handlers/orders.ts` and `conexus/manifest.json`, from `32df403d` to `1caed906`. `listPurchaseOrders` now returns `latestNoteAuthor: "Operador de Teste"`, which comes from the caller-written note. See [`q3.4-run2/`](q3.4-run2/).

**Q3.5, employee.** [`scripts/q3-sign-in.mjs`](../../../scripts/q3-sign-in.mjs) opened an empty browser at the application host. It confirmed that Keycloak showed a username and a password field before handing over, and fails with `PASSWORD_FORM_NOT_SHOWN` otherwise. The operator typed the employee's credentials. The employee then wrote a note through the application's own form. After reload the note shows "Funcionário Teste", and `listNotes` returns that author ([`q3.5-employee-note.png`](q3.5-employee-note.png), case `employee-writes-note`).

**Operator answer 8.** The member entered the application without a grant (case `member-enters-without-grant`). Two sessions of the Owner, created when the operator signed in with the wrong account, show the same rule for an Owner.

## Q3.6 negative proof

[`scripts/q3-negative-proof.mjs`](../../../scripts/q3-negative-proof.mjs) sends each request as a real person from saved browser state and records the request, the answer and whether the refusal held. The full record is [`q3.6-proof.json`](q3.6-proof.json): 30 cases, all held. Where a refusal could hide a broken fixture, the same run records a live control that succeeds.

| Q3.6 case | Request | Refusal |
| --- | --- | --- |
| Employee opens the Hub | Hub OIDC login with the employee's Keycloak session | Callback 403; no Hub session or CSRF cookie set |
| Employee creates a Workspace | `POST /api/control/workspaces` | 403 `request-authenticity-denied` |
| Employee lists or reads a Project | `GET /api/control/workspaces/840c8630…/projects`, `GET /api/control/projects/2b9d2bbb…` | 401 `authentication-required` |
| Employee opens the Builder | `GET …/builder-session` | 401 |
| Employee opens a Preview | `POST …/builder-session/preview`; the Preview host in the employee's browser | 403; 403 |
| Employee reads the access list | `GET …/application-access` | 401 |
| Employee opens another application | `https://pedidos-de-ferias.conexus.localhost:3445/` | Lands on `/__conexus/no-access` |
| Session of one application on another host | Employee cookie sent to `pedidos-de-ferias` | 401 `APPLICATION_SIGN_IN_REQUIRED` |
| Caller in the input | `addNote` with `caller: { … "Forjado" }` | 400 `INPUT_REFUSED`, `/caller: not declared`; no note stored |
| Author in the input | `addNote` with `author: "Forjado"` | 400 `INPUT_REFUSED`; no note stored |
| Identifiers in URL and headers | `addNote?projectId=…&accountId=…` with `x-conexus-caller`, `x-conexus-account-id`, `x-conexus-project-id`, `x-forwarded-host`, `forwarded` naming others | 200, and the stored author is "Funcionário Teste" |
| Hub cookie on the application host | The member's browser, holding a Hub session, loads the application | Only `__Host-conexus_app` is sent; `document.cookie` is empty |
| Handoff redeemed twice | The employee's own handoff URL, replayed | 403 |
| Handoff on another host | A fresh handoff presented to `pedidos-de-ferias` | 403; presenting it burned it, so its own host then answers 403 too. A second fresh handoff on its own host redeems (303, session cookie set) |
| Handoff after expiry | An unused handoff after 61 s (lifetime 60 s) | 403 |
| Session value chosen before sign-in | `__Host-conexus_app` planted before sign-in | The redirect to sign-in clears it (303 with a clearing `Set-Cookie`); the value answers 401; sign-in set a new value |
| State change from another origin | `POST` with `Origin` of the Hub, of the other application, and none; cross-origin sign-out | 403 `ORIGIN_REFUSED` ×4, beside a same-origin baseline of 404 `OPERATION_NOT_FOUND` |
| Control: member of another Workspace, no grant | The member, in one browser, opens its own Workspace's application and then `controle-q3` | Its own application: lands on `/`, probe 404 `OPERATION_NOT_FOUND`. `controle-q3`: lands on `/__conexus/no-access`, probe 401; no application session created |
| Grant revoked | The Owner revoked in the Hub while the employee polled once a second | Last allowed request started 02:44:38.284Z, `revoked_at` 02:44:38.377Z, the next request (02:44:39.305Z) 401 |
| Disabled in Keycloak | Employee disabled with kcadm at 02:38:02Z, polled every 20 s | Refused 261 s later; session ended `PROVIDER_REFUSED`; re-enabled afterwards |
| Session older than eight hours | A live session aged 8 h 1 min in the database | 404 before, 401 after; every session row has `absolute_expires_at − authenticated_at = 08:00:00` |

### Control case

No pilot Account belonged to another Workspace without also belonging to `sdasdsa`, which holds both applications. The operator created the Project "Controle Q3" in `Testando` and invited an unrelated address, which gave that Project an application. The test operator is a member of `sdasdsa` only and holds no grant there. The same case also runs against real PostgreSQL in `tests/implementation/application-access-postgres.test.mjs:286`.

### How the time-bound cases were proved

The eight-hour case moves one session's `authenticated_at` and `absolute_expires_at` back by 8 h 1 min in `iam.application_session`, then sends the next request. It proves the refusal path of the absolute limit against the live Hub, not the wait itself. The Keycloak case waits in real time. The refresh a disabled user attempts is refused by Keycloak, and the Hub ends the session at the first check due after the disable, which is at most five minutes.

## Traces (#211)

Q3.4 run 2 was the first Builder run on a Hub that includes #211. `factory.mastra_ai_spans` held 0 rows at 02:46:42Z and 949 rows in 5 traces at 02:53:55Z. The count includes the Builder run that creating "Controle Q3" started.

`GET /api/control/projects/2b9d2bbb…/builder-session/runs/5f9a17bc-af7a-4181-8ca8-6e1419698045/trace`, as the member who ran it, answered 200 ([`q3.4-run2/trace.json`](q3.4-run2/trace.json)):

- `available: true`, trace `f9757253b55a0d02910247bad8e4fed4`;
- 813 spans under one root, `agent run: 'code-agent'` (381.5 s). By type: 227 processor runs, 125 model chunks, 104 workspace actions, 62 memory operations, 61 model steps, 61 model inferences, 60 tool calls, 57 skill actions, 35 mappings, 9 agent signals, 6 agent runs and 6 model generations;
- usage totals of 2,647,032 input and 4,711 output tokens, 6 model calls and 60 tool calls;
- one live score, `mastracode-outcome` = 1.

Each span carries id, parent, type, name, start, duration, error, model and usage, but no inputs or outputs. That matches the scope #211 states. Before #211 the same route answered `available: false` for run 1 ([`q3.4-run1/source-facts.txt`](q3.4-run1/source-facts.txt)).

## Findings

1. **No-access copy, pending by operator choice.** When Keycloak reports `emailVerified=false`, provisioning correctly refuses and the employee lands on `/__conexus/no-access`. The page says the person has no access and should ask the Workspace administrator. The real cause is the unverified email. The operator deferred the copy change out of this PR.
2. **A handoff dies on any presentation.** `iam.redeem_application_handoff` deletes the handoff before it checks project, binding, expiry and access. A handoff presented to the wrong host cannot be used afterwards on the right one.
3. **Keycloak's SSO session survives a disable.** After the employee was re-enabled, the saved browser entered the application again without a password and got a new application session. The old session stayed ended. This is Keycloak session behaviour and within operator decision 4, which bounds the application session, not the Keycloak one.
4. **The grant screen shows its confirmation before its data.** The coordinator saw "Convite criado" a few seconds before the address and the list refreshed. That may partly explain grants the operator believed lost during Hub restarts. The grants that were really lost were made while the Hub was restarting.
5. **The outcome scorer and the trace disagree on tool calls.** `mastracode-outcome` reports "18 tool calls total" and "No build/typecheck ran". The trace has 60 `tool_call` spans for the same run. The scorer's count is its own and is not a Q3 question. It is recorded for the tracing and evals step.
6. **Proof-lever faults corrected before the recorded run.** Three faults made cases pass or skip without testing: an expired member SSO session, Playwright hiding the `Cookie` header from `request.headers()`, and `page.route` never seeing a request reached through a redirect. The recorded run has none of them.

## Independent review

The review of `5652d1b4` found the defects below. The operator approved the fixes on 2026-09-24.
Each commit pair on `feat/stage2-q3` lands the failing test first and the fix on top. Migration
`0024_application_access_review.sql` carries every database change; 0022 and 0023 are unchanged.

| # | Finding | Resolution | Proof |
| --- | --- | --- | --- |
| 1 | A revoke did not hold. A repeat grant to a person who already held a grant opened an invitation, revoking the grant kept it, and the next sign-in claimed it again. | A repeat grant answers the open grant and opens nothing; IAM-12 now answers the grant or the invitation (contract, ledger, clients). Revoking a grant deletes every invitation to the grantee's email on that application. | `application-access-postgres`: before, `re-granting ... is a no-op` failed with `actual: 1, expected: 0`; after, the revoked person's next sign-in is `NO_ACCESS` with no grant. |
| 2 | Six local `Caller` types, and the runner judged the caller with its own email grammar and a 200-character name cap. | One `Caller` type and parser in `platform/caller.ts`, applied where the application session and Preview access build the caller. The runner applies the same parser: a uuid, a non-empty name, a non-empty email or null. | `application-runner-sandbox`: before, a name over 200 characters with `compras&fiscal@empresa.com.br` was refused (`actual: undefined`); after, it passes for the Preview caller and, in `application-access-postgres`, for a real application sign-in. |
| 3 | `conexus.localhost` hard-coded in two owners, and an application port accepted without the runtime its listener needs. | `HubConfig.application` is `{ port, domain }` from `CONEXUS_APPLICATION_PORT` and `CONEXUS_APPLICATION_DOMAIN`, required together. `applicationOrigin` and `applicationSlugOfHost` are the one definition for the sign-in return, the IAM-11 address and the host's Origin check; port 443 is left out as browsers do. `readHubConfig` refuses an application host without the Builder (`APPLICATION_BUILDER_RUNTIME_REQUIRED`). | `application-host`: a host on `apps.empresa.test` serves and admits only its own Origin; the config refusals. |
| 4 | The Keycloak refresh token was plaintext at rest, and with rotation two requests on two Hubs spent the same token and signed the person out. | The token is sealed in the handoff and the session with the installation's credential key through the Factory's AES-256-GCM envelope; CHECK constraints refuse any unsealed value; 0024 ended the 15 pilot sessions that held plaintext (`CUSTODY_CHANGED`). The realm rotates (`revokeRefreshToken: true`, `refreshTokenMaxReuse: 0`), in `infra/keycloak/realm-r1f.json` and on the pilot realm by kcadm. One request claims the due check in the database and stores the rotated token in the statement that releases the claim. | `application-access-postgres`: before, four concurrent requests on two Hubs gave `[SIGNED_IN, SIGN_IN_REQUIRED, SIGN_IN_REQUIRED, SIGN_IN_REQUIRED]`; after, all four are signed in, Keycloak is asked once, and the next check spends the rotated token. Live: `rotation-concurrent-recheck`. |
| 5 | Every unauthenticated request, an image or script included, was redirected to sign in and minted a new binding, so parallel requests broke each other's sign-in. | Only a document navigation (`Sec-Fetch-Mode: navigate`, `Sec-Fetch-Dest: document`) starts a sign-in; anything else answers 401 and sets nothing. A navigation keeps a well-formed binding already in progress. | `application-host`; live: `sign-in-only-on-navigation`. |
| 6 | Session resolution took `FOR UPDATE`, and a page or asset read the served revision and detoasted the payload twice. | Resolution takes no lock; every session write is a guarded update. `reg.read_served_application_file` resolves the served revision, checks access and takes only the requested element with `jsonb_path_query_first` in one statement, so a page or asset is one read. | `application-access-postgres`: before, a resolution behind a row lock was `BLOCKED`; after, it answers at once. `application-host`: one reader call per file. Live: `served-files-one-read`. |
| 7 | The application host sent the Preview's iframe `sandbox`, which blocks popups and downloads on a top-level site. | The host sends the application sources with `frame-ancestors 'none'` and no `sandbox`; the Preview policy is unchanged byte for byte. | `application-host` pins both policies; live: `application-host-csp`. |
| 8 | A first sign-in that lost a provisioning race landed on no-access. | `iam.provision_application_account` answers the identity's Account id: the existing one, the new one, or none. | `application-access-postgres`: before `[HANDOFF, NO_ACCESS]`, after `[HANDOFF, HANDOFF]` with one Account. |
| 9 | `ended_reason` could not tell a disable from an ended Keycloak session. | Keycloak 26.7's `error_description` tells them apart. A refused refresh now ends the session as `PROVIDER_USER_DISABLED`, `PROVIDER_SESSION_ENDED` (including the 30-minute SSO idle limit) or `PROVIDER_REFUSED`. | `identity-access-http` against a token endpoint answering Keycloak's descriptions; live: `provider-refusal-names-disable`. |

### Rerun on the pilot

On 2026-09-24 the pilot Hub ran from `feat/stage2-q3` with 0024 applied (backup
`conexus_s7-before-0024-20260924T093508.dump`), `CONEXUS_APPLICATION_DOMAIN=conexus.localhost` added
to the pilot env, and rotation on in realm `r1f`. [`review-proof.json`](review-proof.json) holds 16
cases, all held, run as the test operator, a member of the Project's Workspace:

- the review cases: `sign-in-only-on-navigation`, `application-host-csp`, `served-files-one-read`,
  `rotation-concurrent-recheck` (four requests at once when the check was due: 404, 404, 404 and one
  429 from the Project's admission bound, never 401; the session stayed open, the token rotated and
  stayed sealed, and the next check spent the rotated token), and `provider-refusal-names-disable`
  (the test operator was disabled in Keycloak for that case only and enabled again);
- the Q3.6 cases on changed code that need no employee: `member-enters-without-grant`,
  `hub-cookie-on-application-host`, `same-origin-baseline`, the four cross-origin refusals,
  `handoff-on-other-host`, `handoff-after-expiry`, `control-member-of-another-workspace` and
  `session-older-than-eight-hours`.

Not rerun live: the cases that need the employee signed in (their password is typed only by the
operator), which include the grant, re-grant and revoke of finding 1. Finding 1 is proved against
real PostgreSQL. The employee's grant on `eval-20260923-224304` stays revoked, as the Q3 proof left
it.

### Boundaries recorded, not implemented

1. **Back-channel logout.** Keycloak can call the Hub when a person signs out in Keycloak, ending
   their application sessions at once. It does not cover a disable, which the five-minute check
   covers. It belongs to the server step.
2. **Served code against a migrated schema.** Before Q5 the host serves the last good Preview. If a
   build migrates the Preview data and then fails, the served code is older than the schema. Q5's
   published pointer owns this.
3. **Slug existence is observable.** A request to an application host answers differently for an
   existing slug (a sign-in) and an unknown one (404). This is inherent to one host per application.
4. **No-access copy for an unverified email.** Finding 1 under [Findings](#findings); deferred by
   the operator.
5. **Keycloak's 30-minute SSO idle limit.** A person who makes no application request for about 30
   minutes is signed out at the next check (`PROVIDER_SESSION_ENDED`) and signs in again with their
   password.
6. **A claim older than a minute is taken over.** If a Keycloak refresh took longer than that, a
   second request would spend the same token and Keycloak would refuse it. No refresh comes close.

## Rerun

```bash
export NODE_EXTRA_CA_CERTS=$HOME/.local/share/conexus-local-tls/ca/rootCA.pem
node scripts/q3-sign-in.mjs --role employee --app eval-20260923-224304 --out ~/q3/states/employee-eval.json
node scripts/q3-negative-proof.mjs --phase main --app eval-20260923-224304 --other-app pedidos-de-ferias \
  --project 2b9d2bbb-6336-4957-bb55-78e5fdd228cd --workspace 840c8630-eb50-435e-9adf-a6084930d2ae \
  --preview-url <a Preview URL> --member-state "$(~/conexus-test-session.sh)" \
  --employee-state ~/q3/states/employee-eval.json --out proof.json
```

The `caller`, `control`, `expired`, `disabled`, `revoke`, `review` and `provider-refusal` phases take
the arguments in the script's header. Without `--employee-state`, the `main` phase runs its member
cases only.
