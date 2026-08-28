# T-01 — Trusted setup / first access structural hypotheses

> **Status:** `P6 COMPLETE / P7 OPERATOR APPROVED / P8 LOCKED / OPERATOR APPROVED`
> **Authority:** `4C-PRE11-F03` + current `128↔128` wire
> **P8 HTML:** operator-approved; approved final P8 artifact blob = `3955589bfd983923b74a4cd72f6ef13f2b9867e7`
> **P9/P10:** `EXACT TRACE CLOSED / CONSOLIDATED`

## 1. Human jobs

### First owned-instance setup

```text
When the Conexus instance has no Account for the configured bootstrap subject,
I need to establish my Account and first authorized Workspace safely,
so that I can enter the normal platform without a default password or permanent bypass.
```

### Later trusted Account provisioning

```text
When another known internal human must use Conexus,
I need to provision their exact external subject with human presentation,
so that Workspace/app administration can select an existing Conexus Account without querying Keycloak from the browser.
```

These are separate contexts over IAM-03. They must not become one ambiguous wizard.

## 2. P6 reference dispositions

### Keycloak temporary bootstrap admin

- **Source observation:** Keycloak supports temporary admin users/service accounts for initial bootstrap or explicit recovery.
- **Inference:** temporary, configuration-bound, sealed setup is a mature safe pattern.
- **Conexus disposition:** `PRESENT-IN-AUTHORITY`; Keycloak authenticates only and does not own Conexus Account/Workspace authorization.

### GitLab/root-style initial credential

- **Source observation:** some self-managed products expose an initial server-held root credential.
- **Inference:** operationally simple but creates reusable credential/recovery concerns.
- **Conexus disposition:** `REJECTED`; no default/shared password or direct-grant browser login.

Reference study stops here; additional products do not change the decision space.

## 3. Hypotheses

### H1 — continuous Account→Workspace wizard

```text
one visual form/progression
→ IAM-03
→ WS-01 without visible authority transition
```

Rejected. It hides that `TRUSTED_BOOTSTRAP_CONTEXT` is invalid after Account creation and could make the browser appear to carry pre-Account authority into Workspace creation.

### H2 — Account-first explicit re-entry + guided Workspace creation — SELECTED

```text
OIDC authentication
→ Configure your Account
→ IAM-03 bootstrap self-provision
→ Account established / bootstrap sealed
→ explicit normal sign-in/re-entry
→ IAM-01 AccountSummary + NO_WORKSPACE
→ Create your first Workspace
→ WS-01 initialAccessEstablished=true
→ IAM-01/WS-02
→ GF-01 Projects
```

The page may show textual `Account → Workspace → Ready` orientation, but each authority boundary remains explicit.

### H3 — setup checklist/dashboard

Rejected as primary IA. It adds unnecessary setup-state navigation and suggests tasks may be completed out of order. Progress orientation may be reused inside H2 without becoming a checklist owner.

## 4. Selected surface structure

### T-01A — first setup

```text
NO CONTROL PLANE RAIL
Conexus + first-setup context

STEP 1 — ACCOUNT
displayName *
email?
Create my Account

SUCCESS
Account established
Bootstrap access sealed
Sign in to continue

STEP 2 — FIRST WORKSPACE (normal session only)
current AccountSummary
Workspace name *
Create Workspace

SUCCESS
Workspace identity + initial access confirmed
Continue to Projects
```

No issuer, subject, provider, password, secret, tenant, plan or role input is displayed.

### T-01B — later trusted Account provisioning

Separate internal route/surface, not first-run progression:

```text
exact externalSubject *
displayName *
email?
Provision Account
```

It is visible only under the ordinary trusted `platform_operator` route. It never searches Keycloak, proves provider identity existence, creates membership/app access or becomes public signup. Success hands off to existing W-03/P-05 candidate selection; those owners perform membership/grant work separately.

T-01B is not promoted to the normal Workspace rail. It is a privileged direct/internal destination with explicit boundary text.

## 5. Fields and sources

| Field/truth | Source | Client state |
| --- | --- | --- |
| bootstrap eligibility | server-validated `TRUSTED_BOOTSTRAP_CONTEXT` | SERVER |
| bootstrap external subject | server-derived; never browser input | SERVER |
| displayName/email draft | human input | FORM_DRAFT |
| Account success | IAM-03 AccountSummary | SERVER |
| normal current Account | IAM-01 AccountSummary | SERVER |
| Workspace name draft | human input | FORM_DRAFT |
| Workspace/initial access success | WS-01 | SERVER |
| current Workspace context | IAM-01 + WS-02 | SERVER / URL_NAVIGATION |

## 6. Material states and recovery

```text
AUTHENTICATION_REQUIRED
IDENTITY_NOT_ELIGIBLE
BOOTSTRAP_IN_PROGRESS
ACCOUNT_INPUT_INVALID
ACCOUNT_CONFLICT_OR_AMBIGUOUS_INTAKE
DEPENDENCY_FAILURE
ACCOUNT_ESTABLISHED_REENTRY_REQUIRED
BOOTSTRAP_SEALED
SESSION_ESTABLISHED
NO_WORKSPACE
WORKSPACE_INPUT_INVALID
WORKSPACE_CONFLICT_OR_AMBIGUOUS_INTAKE
WORKSPACE_ESTABLISHED
```

Laws:

- same semantic intake/idempotency key for retry;
- ambiguous timeout never claims success or creates a second Account/Workspace locally;
- `401` returns to authentication;
- ineligible subject receives no existence detail;
- dependency failure never renders as empty Workspace;
- old bootstrap context cannot call WS-01;
- successful WS-01 must prove initial access before `Continue`.

## 7. Accessibility/responsive

- one main landmark and one primary action per stage;
- persistent labels and associated errors;
- `aria-live` status for pending/result/recovery;
- focus moves to first invalid field or success heading;
- textual progress, never color-only;
- narrow layout is one column with no rail/drawer;
- re-entry control is keyboard operable and does not imply global Keycloak logout/login semantics.

## 8. P8 proof requirements

P8 must operate:

1. eligible bootstrap success;
2. wrong/ineligible subject;
3. validation, conflict, dependency and ambiguous intake recovery;
4. bootstrap sealing and rejected context reuse;
5. explicit normal re-entry;
6. zero-Workspace truth versus failure;
7. WS-01 success with initial access;
8. later ordinary trusted Account provisioning;
9. wide/narrow and keyboard flows.

## 9. P7 verdict

```text
H2 = OPERATOR APPROVED
blocking Product/wire finding = 0
P8 = LOCKED / OPERATOR APPROVED
P9 = EXACT TRACE CLOSED
P10 = CONSOLIDATED
```
