# Conexus OS product contract

This file owns what Conexus means: its concepts, its journeys and the rules its
behaviour must keep. [The roadmap](../roadmap.md) owns status and the next action.
[The operation ledger](operation-ledger.md) owns the operation census, and
[the permission contract](permission-contract.md) owns who may do what.

Every statement here describes behaviour the code has today. When the code and this
file disagree, the code is right and this file is wrong.

---

## 1. What Conexus is

Conexus is the platform the people at this company sign in to. They open a Workspace,
open a Project, and talk to the Builder. The Builder writes the source of a small
business application, compiles it, and serves it back as a Preview they can use.

The Builder runs on the Mastra Agent Controller. It is the first base and it has to
work. Everything else arrives one planned step at a time.

---

## 2. Who uses it

One person is one Account, a global human identity held by Keycloak and recognised by
Conexus. An Account may belong to several Workspaces. Belonging to one never grants
anything in another.

Inside a Workspace an Account holds one of two roles.

| Role | May do |
| --- | --- |
| `owner` | everything a member may do, plus administer the roster |
| `member` | everything except administer the roster |

There are no other roles, no per-Project grants and no separate application audience.
Authority over a Project is membership of the Workspace that owns it.

---

## 3. Core concepts

### 3.1 Account

One human identity. Conexus reads `email_verified` from the validated ID token and
accepts only the boolean `true`. An unverified address is refused.

The first Account self-provisions from a preconfigured bootstrap identity. Every later
Account arrives by invitation.

### 3.2 Workspace

The isolation root. Any authenticated Account may create one, and the creator becomes
its owner. A Workspace owns Projects and a roster.

### 3.3 Membership and invitation

An invitation names a Workspace, a verified email address and a role. The pair of
Workspace and address is its natural key. The invited person is admitted when they
sign in with that verified address.

Removing a roster entry withdraws every right derived from it. The last owner cannot
be demoted or removed.

### 3.4 Project

A unit of software inside a Workspace. A Project is created with its source in one
transaction: it never exists without a repository. A Project may also be created from
an existing repository, and the Builder reads that source the way it reads source it
wrote itself.

### 3.5 Working source

The current state of a Project's authored source, owned by Conexus and held in Project
Git.

Each Builder request starts from the current working source, including source that
failed to compile. A request that changes source advances the working revision. The
last-good Preview only advances when a revision compiles.

There is no approved statement of intent the Builder reads before coding. Intent lives
in the conversation and in the source.

### 3.6 Builder run

One admitted attempt to answer one request. A Project has at most one active run. A run
carries an idempotency key, an authorized model connection, a fresh scoped Mastra
Session on the Project's persistent Thread, and a fresh E2B workspace materialized from
the current working source.

A run settles in one state and, when it succeeded, with one result.

```text
state  = QUEUED | RUNNING | SUCCEEDED | FAILED | INTERRUPTED
result = RESPONSE_ONLY | SOURCE_CHANGED | SOURCE_CHANGED_BUILD_FAILED
```

`RESPONSE_ONLY` means the agent answered without changing source. A response-only turn
keeps its answer without a commit or a compilation. `SOURCE_CHANGED_BUILD_FAILED` still
advances the working source, so the next request continues from it, and it never
replaces the last-good Preview with an artifact that does not compile.

### 3.7 Preview

The last artifact that compiled, served back to the person who asked for it. Each
launch binds its own immutable route. A newer candidate does not mutate an older route,
so a Preview stays usable while the next run works.

A grant issued or an iframe that loaded is not proof that the application works.

### 3.8 Model connection

An Account's authorization to call a model provider. A connection carries a provider
id, a credential kind, a label and a state.

```text
credential kind = OAUTH_TOKEN_SET | API_KEY
state           = ACTIVE | REVOKED
```

Both kinds are first class. An account sign-in produces `OAUTH_TOKEN_SET`; a pasted key
produces `API_KEY` for any provider the model router's registry knows. A credential
goes to custody and is never returned to the browser.

An Account may share a connection into a Workspace it belongs to, and then every member
may use it. A plain member may share their own connection. The owner of the connection,
or a Workspace owner, may withdraw the share. Model selection stays Mastra-native:
Conexus adds credential custody and sign-in, not a model abstraction of its own.

---

## 4. Journey A. First access and the first Workspace

```text
the preconfigured bootstrap identity signs in through Keycloak
→ it self-provisions its own Account and nothing else
→ the bootstrap context is spent
→ an ordinary Account-backed session is established
→ the person creates a Workspace and becomes its owner
→ the Workspace shows its Projects and its roster
```

There is no public signup, no billing and no reusable admin credential.

## 5. Journey B. Invite a person into a Workspace

```text
a Workspace owner invites a verified email address with a role
→ the invitation is pending and visible in the same roster projection as members
→ the invited person signs in through Keycloak with that verified address
→ the invitation is claimed and they become a member
→ an owner may change a role or remove a roster entry
```

Nothing is emailed. The invited person is told out of band. An unverified address is
refused at sign-in, so an invitation to one can never be claimed.

## 6. Journey C. Connect a model

```text
the person signs in to a provider account, or pastes an API key with a label
→ the credential goes to custody; the browser never holds it
→ the connection is listed by provider, kind, label and state, never by credential
→ the person selects the connection future runs use
→ optionally they share it into a Workspace, and every member may then use it
→ a share may be withdrawn, and a connection may be revoked
```

A Project with no authorized connection cannot start a run.

## 7. Journey D. Create a Project and build with the Builder

```text
Workspace
→ create a Project, or import an existing repository
→ source and initial access are established in one transaction
→ the person writes a request in the Project's Build conversation
→ a BuilderRun is admitted with an idempotency key and an authorized connection
→ a fresh Mastra Session on the persistent Project Thread
→ a fresh E2B workspace from the current working source
→ the agent reads and edits files
→ Conexus admits the resulting revision and advances the working source
→ compile
→ on success the artifact becomes the last-good Preview
→ the person uses the Preview and writes the next request
```

The person may read the source tree and any file at an exact revision, cancel a run,
and read that run's safe native trace. Cancelling twice is the same as cancelling once.

---

## 8. What the product must tell the truth about

These distinctions must stay visible. Collapsing them is the failure this section
exists to prevent.

```text
loading         != empty         != failed        != partial
model narration != Hub progress
working         != blocked       != waiting for the user != finished
Preview ready   != the application works
a grant issued  != a Preview that loaded != a working application
```

The Hub owns run state and progress. A model's own narration never marks work
complete. Where a fact is missing it is shown as missing, never as a zero, a
percentage or a timer that was invented to fill the space.

Run detail is a bounded authorized projection of Product and native Mastra facts.
Where usage or cost is not reported it is shown as unavailable rather than as zero.

---

## 9. Authority rules

1. Authority is membership of the Workspace that owns the resource. Nothing crosses
   Workspaces automatically.
2. A Workspace is deny-by-default.
3. Only an `owner` administers the roster. A `member` holds every other right.
4. The last owner of a Workspace cannot be demoted or removed.
5. Removing a roster entry withdraws every right derived from it.
6. Every protected call rechecks current authority on the server, inside the same
   transaction that does the work.
7. Ids supplied by the browser, by a model or by a provider are never authority.
8. A provider, sandbox or trace identity is not a Conexus principal.
9. Credentials stay in custody and are never returned to a browser.
10. The bootstrap context is the only pre-Account principal. It is bound to one
    preconfigured OIDC subject, may provision only its own Account, and is invalid
    afterwards.

---

## 10. What is in the product today

```text
sign-in through Keycloak with a verified email address
Account self-provisioning for the bootstrap identity, invitation for everyone else
Workspaces with owner and member roles
a Workspace roster of members and pending invitations
Projects, created new or imported from an existing repository
read-only inspection of Project source at an exact revision
the Builder: conversation, run, compile and last-good Preview
run cancellation and a safe native run trace
model connections by account sign-in or API key, selectable and shareable
```

That is the whole current surface. The operation ledger holds its exact census.

---

## 11. What Conexus is not

```text
an ERP replacement
an unrestricted database console
a generic integration platform
a generic workflow or BPM engine
a universal automation or scheduler product
a marketplace of plugins, apps or agents
a low-code form builder
an IDE as the primary experience
a chat that hides the real source, run and Preview
```

Shared mechanics may exist inside the implementation. They never become Product
authority by convenience.

---

## 12. Later, not defined here

One line each. None of these has a plan, and none is started. They are listed so that
nobody builds machinery for them now.

- A data and SDK layer so a generated application can own business data.
- Local publication of a built application.
- External integrations, which is where Sankhya arrives.
- Managed automations and scheduled jobs.

Project Inception, the Project Baseline, the Brain, AnalyticQuery, Product Agents,
connection bindings, Releases, Promotions, the capability gateway and the Managed
Application Runtime were removed from the product on 2026-09-19. They are not paused
and they are not deferred work with a seam waiting for them. If one is ever wanted it
arrives as a new feature on this base, with its own plan.
