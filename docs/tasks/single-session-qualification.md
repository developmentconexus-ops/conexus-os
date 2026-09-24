# Single session qualification

**Status:** OPEN  
**Type:** identity and trust-boundary qualification (Q-b: it moves a trust boundary and changes a
database boundary; Q-c: the Keycloak probe and the pilot proof outlive the pull request)  
**Execution owner:** implementer session named by the operator  
**Review:** one independent review of the frozen candidate before merge, per
`docs/development/delivery.md`  
**Aprovo:** required. The change touches authentication, the realm configuration and a migration
over real sessions.

## 1. Authority route

```text
C-015 (Keycloak authenticates, Conexus authorizes, Conexus owns an opaque server-owned session)
+ the 2026-09-22 decision that Keycloak is the only sign-in door
+ the Stage 2 Q3 task and its evidence (docs/evidence/stage2-q3/README.md)
+ docs/reference/security-and-authority.md
+ the operator decisions of section 3
        ↓
this qualification
        ↓
evidence + verdict
        ↓
owner reconciliation
```

Repository authority beats this task when they conflict. Evidence that falsifies C-015 returns to
planning. Do not patch around it.

## 2. Protected question

Can the Hub, every application and Preview run on one server-owned session model and one
single-use handoff, with Keycloak's own refresh deciding whether the person may stay, without losing
a property any of them has today?

Prove or falsify this statement:

> With refresh-token rotation off in the realm, one session model and one handoff primitive in
> PostgreSQL serve the Hub, application hosts and Preview hosts. A person disabled or signed out in
> Keycloak loses the Hub, every application and every Preview within five minutes. A Preview
> survives a Hub restart. A handoff presented on the wrong host is refused and still redeems on its
> own host inside its lifetime. Every Stage 2 Q3.6 negative case still fails.

## 3. Operator decisions

These bind the executor and are not reopened.

1. **Rotation.** Refresh-token rotation goes off (`revokeRefreshToken: false`) only after the probe
   of step S0 passes on the pilot's Keycloak. If the probe fails, rotation stays, its reason goes
   into `docs/reference/security-and-authority.md`, and only steps S2 to S5 run.
2. **The Hub checks Keycloak.** A Keycloak disable or logout ends an existing Hub session within
   five minutes, through the same check the application session uses. This answers the open question
   in `docs/decisions/index.md` ("Whether a Keycloak disable or logout must end an existing Hub
   session"). No second mechanism.
3. **The handoff survives the wrong host.** Today `iam.redeem_application_handoff` deletes the
   handoff before it checks project, binding, expiry and access (Q3 evidence, finding 2). In the new
   model the handoff is consumed only when every check passes. A handoff presented on the wrong host
   still works on the right one inside its lifetime.
4. **Hub sessions open at deploy end.** They hold no refresh token, so they cannot be checked. The
   migration ends them, and each person signs in once again.
5. **Unchanged answers from Q3.** Application sign-out ends only that application session. An
   application session lasts at most eight hours. Removing a grant or a membership takes effect at
   the next request.

## 4. Preserve

Unifying may not remove a property one of the sessions has today. The census of step S0 completes
this table from the code and the executor adds any row it finds.

| Property | Hub | Application | Preview |
| --- | --- | --- | --- |
| Host | Hub host only | `__Host-` cookie on the application's host | the Preview host only |
| Lifetime | idle 30 min, absolute 8 h | absolute 8 h from the handoff | cookie 15 min, entry 30 s, capped by the route |
| CSRF | Origin plus double-submit token | exact Origin, `application/json`, SameSite=Lax | per `mar/preview-routes.ts` |
| Authority | memberships, per request | grant or membership, per request | the developer behind the Hub session |
| Caller | none | from the session, never from input | the Preview's author |
| Keycloak liveness | none today, five minutes after this task | five minutes | follows the person, five minutes after this task |

Also preserve C-015, the Q1 runtime boundary, the Q2 handler contract with its `caller`, the sealed
refresh token (`@mastra/factory/secret-encryption`), and the rule that no application host ever
receives the Hub cookie.

## 5. Fixed hypothesis

Test this first:

```text
realm rotation off
→ one handoff primitive: minted by the Hub for one target host, single use, bound to the browser,
  60 s, consumed in the same statement that passes every check
→ one session model in PostgreSQL for the Hub, application and Preview hosts
→ one liveness check: at most every five minutes a request refreshes the sealed Keycloak token;
  a refused refresh ends the session; concurrent checks all pass and the last write wins
  (compare-and-set on provider_checked_at, no claim, no wait loop)
→ preview-access.ts and its in-memory maps are gone
```

The session's shape is the executor's design, done with `/pstack:architect` against at least these
two candidates:

- **A.** One session table with a host kind (HUB, APPLICATION, PREVIEW), where CHECK constraints make
  each kind's illegal states unrepresentable.
- **B.** A sign-in record per Keycloak login (Account, sealed refresh token, liveness check) and one
  host session per host that points to it, so one check ends every host of that login.

The design names which properties of section 4 each candidate keeps and what it deletes.

## 6. People and applications

- **Owner:** `conexus_admin`, Owner of the `sdasdsa` Workspace.
- **Employee:** `funcionario-teste@gmail.com`. Only the operator signs it in, so the steps that need
  it run in one session with the operator. Never add it to a Workspace.
- **Application:** the Q2 purchasing notebook, Project `2b9d2bbb-6336-4957-bb55-78e5fdd228cd`, and
  `pedidos-de-ferias` as the other application.
- Disabling a Keycloak user, and any realm change on the pilot, happen only with the operator's
  go-ahead in the executor's chat.

## 7. Steps

Each step ends in a check that passes before the next starts.

### S0. Native census and Keycloak probe

Before the first product edit:

1. **Native census.** For each mechanism this task touches (session, handoff, liveness check,
   CSRF, Origin check, opaque token, digest, slug, caller), list the native offer (Mastra, Keycloak,
   PostgreSQL, an installed dependency), the exact source (installed `.d.ts` path and version, or a
   versioned document), and KEEP, REPLACE or SIMPLIFY. Load the `mastra` skill and read the installed
   `@mastra/*` packages. Start from the Q3 Mastra-first review the operator hands the executor, and
   verify each row at the installed versions; do not copy it. Also check the installed `@fastify/cookie` and any session library in `package-lock.json`.
2. **Keycloak probe on the pilot (26.7)** with `revokeRefreshToken: false`:
   - four concurrent refreshes of one token all succeed;
   - after a disable, refresh is refused (`User disabled`);
   - after a Keycloak logout, refresh is refused (`Session not active`);
   - a refresh resets the SSO idle timer (30 min), so an active Hub user is not signed out;
   - `account-console` and `security-admin-console` still sign in.
   **Falsifier:** an old refresh token accepted after the SSO session ended.
3. Record both in the evidence before S1.

### S1. Rotation off, claim protocol gone

The realm returns to `revokeRefreshToken: false` in `infra/keycloak/realm-r1f.json` and on the
pilot by kcadm. A new migration removes `claim_provider_check`, `release_provider_check`, the
`provider_check_claim*` columns and the clock correction of 0025. `record_provider_check` becomes a
compare-and-set; the loser of the race is still served. `HELD`, `HELD_CHECK_READS` and the wait
loop leave `application-session.ts`. Rewrite the rotation tests in
`application-access-postgres.test.mjs` for the new behavior. Boundaries 6 and 7 of the Q3 evidence
no longer exist.

### S2. One handoff

Preview's entry grant and the application handoff become one primitive in PostgreSQL. The redeem
function checks target, binding, expiry and access first and deletes last, in one statement.

### S3. One session model

Hub, application and Preview sessions move to the design of section 5. Migrate every caller and
delete the old tables, functions and `preview-access.ts` in the same wave. The migration ends open
Hub sessions (decision 4).

### S4. The Hub checks Keycloak

The Hub session gains the same five-minute check. The Hub OIDC callback keeps the sealed refresh
token.

### S5. One helper per concept

One slug parser, one opaque-token parser and generator, one digest, one exact-Origin check, all in
`platform/`. A zod `callerSchema` with `Caller = z.infer<...>`, used on both sides of the runner. A
test that seals with the installed `@mastra/factory` and asserts the prefix the SQL CHECKs require.

### S6. Pilot proof

On the pilot, with evidence of each request and answer:

- rerun every Q3.6 negative case with `scripts/q3-negative-proof.mjs`;
- a handoff presented on another application's host answers 403, then redeems on its own host
  inside 60 s; from another browser without the binding it answers 403;
- a Preview opened, the Hub restarted, the Preview still served without signing in again;
- the employee disabled in Keycloak loses the application within five minutes; a Hub user disabled
  loses the Hub and their Preview within five minutes;
- a Keycloak logout ends the Hub session within five minutes;
- four concurrent requests with a due check are all served, and Keycloak is asked at most four times;
- in the same operator session, the grant, re-grant and revoke cases of issue #234.

## 8. Falsifiers

Any one rejects the hypothesis:

1. the probe's falsifier holds, or a disabled or signed-out person keeps any host past five minutes;
2. any Q3.6 negative case succeeds;
3. a property of section 4 is lost with no operator decision;
4. a handoff is consumed by a presentation that fails a check, or redeems twice;
5. a Preview dies on a Hub restart;
6. a second session model, handoff or liveness mechanism remains when the work ends.

## 9. Non-goals

- no back-channel logout (Q3 boundary 1);
- no Published session or Release pointer (Q5);
- no mapping of the caller to Mastra `RequestContext`;
- no change to who may grant, to invitations or to the no-access page copy (#230);
- no work on #232 or #233;
- no Keycloak client per application, no token exchange, no Keycloak admin credential in the Hub.

## 10. STOP law

STOP and return to the planner on:

- the probe fails or cannot run on the pilot's version;
- a need to reopen C-015 or the 2026-09-22 sign-in decision;
- a property of section 4 that the design cannot keep;
- a need for a new dependency (then the technology rule applies first);
- a product question section 3 does not answer;
- a pilot fault: the Hub, Keycloak or the runner not serving.

## 11. Verdict

Return ACCEPT, ACCEPT_WITH_BOUNDARY, REJECT or INSUFFICIENT_EVIDENCE in
`docs/evidence/single-session/README.md`, with the census, the probe, every case of S6 and the
independent review's findings and how each was resolved.

## 12. Owner reconciliation

After the verdict, reconcile only what this task proved:

- `docs/reference/security-and-authority.md`: one session model, one handoff, the liveness check,
  rotation off and its reason;
- `docs/reference/data-and-persistence.md`: the session tables;
- `docs/decisions/index.md`: replace the open question with decision 2, as a proposed row the
  operator accepts;
- the Stage 2 Q3 evidence: a line under boundaries 6 and 7 that this task removed them.

## 13. Reopen triggers

- Q5 needs a Published session this model cannot hold;
- a requirement to end sessions at the instant of a Keycloak logout (back-channel logout);
- a Keycloak upgrade that changes refresh behavior for a disabled user or an ended session.
