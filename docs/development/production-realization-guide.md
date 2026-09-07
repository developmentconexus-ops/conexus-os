# Evidence-Grounded Realization Engineering

> **Status:** CURRENT REALIZATION COMPANION / DERIVED
> **Parent authority:** DevelopmentConexus Engineering Method v1.3.0
> **Current gate:** [Realization Planning](../phases/realization-planning.md)
> **Boundary:** this guide governs how material realization choices are researched and proven. It does not create Product meaning, semantic owners, stage authority, implementation authorization, or technology-decision authority; accepted material technology decisions are discoverable through the [decision register](../decisions/index.md).

## 1. Purpose

Conexus should invent only the Product semantics and mechanisms for which a real evidenced gap remains. Engineering problems already solved by standards, native platform behavior, mature components, or validated implementations should be adopted or adapted when they preserve current Conexus authority with less total complexity.

For every material realization decision:

```text
current Conexus authority / protected property
→ normative standard where one exists
→ official exact-version technology documentation
→ official source / release notes / security advisories when material
→ validated implementation / production reference when useful
→ ADOPT | ADAPT | BUILD | DEFER | STOP
→ proof strategy before implementation
→ real-dependency Evidence for real-dependency claims
```

`REFERENCE_ONLY` is an Evidence classification, not a sixth implementation outcome: a technology or implementation may be studied for its failure handling or design without entering the Product.

## 2. Epistemic discipline

Every material conclusion keeps its basis explicit:

- **Known** — established by current repository authority, a normative/official source, exact source/version Evidence, or executed proof.
- **Inferred** — reasoned from cited Evidence with assumptions visible.
- **Unknown** — Evidence is insufficient; no convenient default is allowed.
- **Deferred** — a real later consumer/stage owns the decision; the safety basis and reopen trigger are explicit.

Never convert:

```text
latest → compatible
popular → fit
example → production contract
provider/framework behavior → Product authority
mock success → real dependency proof
unknown/partial → zero/success
reference implementation → required dependency
```

## 3. Research protocol

### 3.1 Property before technology

Research begins from the protected property/failure class, not from a preferred library.

Bad:

```text
Which auth framework should Conexus use?
```

Good:

```text
How do we authenticate a human without owning password/MFA protocol machinery,
while preserving Conexus-owned Account/session/membership/grant authority?
```

### 3.2 Claim-relative source hierarchy

Use the strongest source needed by the claim:

1. current Conexus Product/architecture/decision authority;
2. normative specifications and standards;
3. official documentation for the exact selected technology version;
4. official repositories, source, release notes and security advisories;
5. mature implementations with comparable failure properties;
6. production engineering references such as Google SRE where they illuminate a real failure class;
7. community material only as discovery/corroboration.

Context7 is an acquisition accelerator for current official documentation and examples, never Product authority. Version-sensitive or security-sensitive claims still resolve against the exact selected release/source and bounded proof.

### 3.3 Adopt / adapt / build / defer / stop

| Outcome | Rule |
| --- | --- |
| `ADOPT` | a standard/native/mature component satisfies the invariant without moving Product authority or adding disproportionate operational cost |
| `ADAPT` | a proven mechanism satisfies the property behind one bounded Conexus-owned adapter/boundary |
| `BUILD` | a real evidenced gap remains and the smallest custom surface can be bounded and falsified |
| `DEFER` | no current consumer/failure class requires the capability and the seam can be added later without structural rework |
| `STOP` | a prerequisite or behavior required for correctness is not proven |

Before `BUILD`, record the exact gap that defeats `ADOPT`/`ADAPT`. Before adding a dependency, evaluate exact version fit, maintenance/security state, operational burden, transitive supply-chain cost, license, reversibility and replacement boundary.

### 3.4 Reference-only study

A mature system may be used as `REFERENCE_ONLY` when it teaches a relevant property but would add more machinery than the current consumer needs.

Examples of valid use:

```text
study durable-execution systems for recovery semantics
-X-> install a workflow platform without a real workflow consumer

study hyperscale SRE failure handling
-X-> copy hyperscale deployment topology without its scale/failure class
```

The result of reference study must reduce uncertainty or improve the chosen proof; reference collection for its own sake is research theater.

### 3.5 Stop condition

Stop researching when the property/constraints are clear, primary sources establish relevant behavior, credible alternatives have been compared, the selected fit/failure modes are understood, a proportional falsifier exists, and no material contradiction remains.

## 4. Proof law

Proof strength matches the claim:

```text
pure/local behavior          → unit/property/negative test
DB invariant/concurrency     → real PostgreSQL constraint/transaction/concurrency proof
browser/session behavior     → real browser/server integration where claimed
external integration         → controlled real dependency Evidence
recovery                     → restart/loss/concurrency Evidence at the owning stage
production claim             → production-stage Evidence; never a DEV imitation
```

A control counts only when it can be demonstrated to fire. A mock proves the local mock boundary only.

## 5. Current first-build authentication realization — Keycloak

The authoritative material decision is C-015 in the decision register. This section is its realization guidance, not a parallel decision authority.

### 5.1 Protected property

The first build needs real human login without Conexus implementing password storage, credential-reset, MFA protocol machinery, or an authentication server. At the same time, accepted architecture requires Identity & Access to remain sovereign over:

```text
Conexus Account identity
Conexus application session
Workspace membership
Project grants
Published Application access
current Product authorization
```

### 5.2 Evidence and alternatives

Current Keycloak documentation confirms standards-based OpenID Connect support and recommends using the application's existing OIDC ecosystem rather than tightly coupled Keycloak adapters where standard support exists. Its Authorization Code flow is the normal browser-based flow; current OAuth security guidance rejects implicit and resource-owner-password flows for this use.

Alternatives considered at realization level:

1. **custom credential/password authentication** — rejected: creates unnecessary high-risk security ownership;
2. **embedded auth library owning credentials directly in Conexus** — smaller operational footprint but still makes Conexus own credential/MFA/reset machinery with no Product benefit;
3. **external/hosted identity service** — viable class, but adds external commercial/service dependency not required by the internal/company-first F1;
4. **Keycloak as self-hosted OIDC Identity Provider** — selected: mature standards-based authentication while Conexus retains domain authorization.

C-015 therefore records `ADOPT` Keycloak for authentication protocol/identity proof and `ADAPT` through a narrow Conexus OIDC boundary. Keycloak Authorization Services are not adopted as Conexus Product authorization.

### 5.3 Exact authority boundary

```text
browser
→ Conexus login endpoint
→ OIDC Authorization Code + PKCE S256 redirect to Keycloak
→ Keycloak authenticates human
→ server-side Conexus callback exchanges/validates code
→ verified (issuer, subject) resolves one Conexus iam.account
→ Conexus creates its own opaque server-owned iam.session cookie
→ every protected request resolves current Conexus I&A/domain authority
```

Keycloak owns authentication mechanics and its own provider-side user/credential state. Conexus owns Product identity mapping and all Product authorization. The `(issuer, subject)` mapping is stored as attributes of the existing `iam.account`; it never creates another Conexus record class.

The first-build integration MUST preserve:

- a confidential server-side OIDC client; a Node OIDC implementation that cannot support this required deployment shape is not admissible;
- Authorization Code flow with PKCE `S256`;
- exact allowlisted HTTPS redirect URIs outside local development;
- `state`, `nonce`, issuer/audience/signature/time validation through a current standards-compliant OIDC implementation;
- server-side token exchange; no access/refresh/ID token in browser local/session storage as Conexus application authority;
- opaque, secure, HttpOnly, appropriate SameSite Conexus application session cookie;
- local Conexus session revocation/expiry independent from possession of a Keycloak token;
- explicit logout behavior for the Conexus session and standards-compliant Keycloak/RP logout only to the extent the first-build session contract requires it.

### 5.4 What Keycloak does not own

The following MUST NOT be imported as current Product authority merely because Keycloak can represent them:

```text
Keycloak realm roles
Keycloak client roles
Keycloak groups
Keycloak Authorization Services resources/policies/permissions
Keycloak organization membership
```

They may administer authentication infrastructure or support a later explicitly admitted identity use case, but they do not replace `workspace_membership`, Project grants, `published_app_access`, Release eligibility, Connection use authority, or any other Conexus owner fact.

No authorization decision may become:

```text
token says role X
→ therefore Workspace/Project/app action is allowed
```

without an explicit later Product decision changing the authority model.

### 5.5 Recovery and identity continuity

Self-hosted Keycloak is stateful provider infrastructure. First-production recovery therefore includes the provider persistence/configuration needed to preserve the configured issuer and the stable subject identities referenced by `iam.account`.

```text
restored/rebuilt Keycloak
+ unknown or changed issuer-subject identity
-X-> silently remap existing Conexus Account
```

Unknown continuity keeps normal human login/use fail-closed until I&A explicitly reconciles the identity. Keycloak recovery never recertifies Workspace/Project/Published-App grants; those remain current Conexus authority. Exact persistence placement/backup mechanics belong the first-production realization, while the recovery closure is current through C-015 and the release/data/security references.

### 5.6 Exact-version admission before R1 implementation

Keycloak admission runs under the Realization Plan `RP-G0.3` dependency/supply-chain discipline. Do not hard-code a volatile `latest` from planning. Immediately before implementation:

1. select an exact supported Keycloak release from official release/documentation sources;
2. review its migration notes and current security advisories;
3. select a maintained standards-compliant Node OIDC client/library using official exact-version docs rather than a Keycloak-specific adapter unless a proven gap requires one;
4. pin/reproduce the selected dependencies and deployment artifact;
5. prove the OIDC flow and session boundary against a real non-production Keycloak instance.

The current planning review observed Keycloak `26.5.2` documentation/release material, but that observation is Evidence only, not the execution pin. Selection reopen triggers remain owned by C-015 in the decision register.

### 5.7 Required authentication negative controls

R1 cannot be called realized until applicable controls fire:

- forged/invalid issuer, audience, signature, nonce or state cannot create a Conexus session;
- an unregistered/changed redirect target cannot widen the callback surface;
- browser possession of an old Keycloak token cannot bypass Conexus session/current authorization;
- Keycloak role/group changes alone cannot grant Workspace/Project/Published App authority;
- Conexus session logout/revocation denies subsequent protected use;
- one authenticated Account with no relevant Conexus grant remains denied;
- Control Plane authority and Published App authority remain independent after authentication.

## 6. First-build research lenses

Load only when the corresponding R1–R7 decision becomes concrete:

- authentication/session → OIDC/OAuth BCP + exact Keycloak/OIDC-client docs + OWASP ASVS;
- PostgreSQL persistence/concurrency → PostgreSQL 17 official docs and exact driver/ORM docs if selected;
- Sankhya integration → official Gateway/API capability docs + controlled real-provider Evidence; provider-internal storage is not connector authority;
- governed sync → PostgreSQL + exact queue/scheduler substrate + mature pipeline/recovery references;
- React/frontend → exact React/TypeScript/Vite/TanStack docs + WCAG/browser security;
- Release/serving → exact selected deployment/runtime/artifact docs + supply-chain guidance;
- reconciliation → source consistency/snapshot semantics + mature data-quality/reconciliation references, with real Sankhya oracle proof.

A technology may remain `REFERENCE_ONLY`. No research result silently adds a Product owner, capability or dependency.

## 7. Durable references

Primary starting points; exact versions are revalidated when used:

- DevelopmentConexus Engineering Method v1.3.0 — `docs/development/engineering-method.md`
- Keycloak securing applications / OIDC — https://www.keycloak.org/securing-apps/oidc-layers
- Keycloak application-security planning — https://www.keycloak.org/securing-apps/overview
- Keycloak server administration — https://www.keycloak.org/docs/latest/server_admin/
- OAuth 2.0 Security Best Current Practice — RFC 9700
- OpenID Connect Core — OpenID Foundation
- OWASP ASVS — https://owasp.org/www-project-application-security-verification-standard/
- PostgreSQL 17 documentation — https://www.postgresql.org/docs/17/
- React — https://react.dev/
- TypeScript — https://www.typescriptlang.org/docs/
- TanStack Query — https://tanstack.com/query/latest/
- WCAG 2.2 — https://www.w3.org/TR/WCAG22/
- Google SRE books — https://sre.google/books/

## 8. Final invariant

> Realization reuses proven engineering when it preserves Conexus meaning, adapts only across a bounded gap, builds custom machinery only for an evidenced unresolved property, and proves real claims against the real dependency. Authentication may be delegated to Keycloak; Conexus Product authorization may not be delegated by convenience.
