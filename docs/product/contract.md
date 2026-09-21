# Conexus OS product contract

This file owns what Conexus means: its concepts, its journeys and the rules its
behaviour must keep. [The roadmap](../roadmap.md) owns status and the next action.
[The operation ledger](operation-ledger.md) owns the operation census, and
[the permission contract](permission-contract.md) owns who may do what.

This file carries two kinds of statement and marks which is which. Sections 1 to 11
describe behaviour the code has today; where they and the code disagree, the code is
right and this file is wrong. [Section 12](#12-approved-destination) is the approved
destination, which is where the product is going and what it may not become.

Section 12 is approval, not proof. Reading a rule there is never evidence that the rule
is enforced. It is also not a denial: a few of its rules restate a guarantee sections 3.5
and 3.6 already carry, and those stay guarantees. Where the two overlap, section 12 marks
which part is already kept, so that widening a rule is never mistaken for having built
it.

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

> **This section describes what exists today and is on its way out.**
> [C-022](../decisions/index.md) moves model authentication, credentials, provider
> connection and selection to the Factory, which has its own. The custody and sharing
> rules above go with the subsystem when the adoption work replaces it. They say nothing
> about the Workspace's enterprise connections, which stay Conexus's.

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

## 12. Approved destination

The operator approved this direction on 2026-09-20. It is registered as C-021 in
[the decision register](../decisions/index.md). None of it is built. It is written
here so that the next increment is chosen against a destination instead of against a
memory, and so that nobody builds machinery the destination does not ask for.

Each rule below is owned here as product meaning. Where a rule needs a mechanism, the
mechanism stays open on purpose, and [the roadmap](../roadmap.md) owns which question
is being answered next.

### 12.1 What Conexus is for

Conexus is the platform a company builds, administers and evolves its own products on,
connected to its own context and systems. The target stays a usable internal base. It
is not a general SaaS or a multi-stack platform product.

### 12.2 Project and application

A Project is one publishable product. It holds that product's development and its
operation together: source, frontend and backend, conversations, the product's own
agents, knowledge, data, integrations and automations, each as it is delivered.

Administration happens inside Conexus. The people who use the published application
reach it by URL without administering the Project. A reachable URL does not mean an
application without authentication. This chooses no domain, hosting, topology or
access mechanism.

### 12.3 Conversations

A Project offers several persistent conversations. The Project's policy is `SHARED` or
`PER_USER`. No default is approved yet, there is no extra per-conversation sharing, and
no transition may quietly expose conversations that were private when they were written.

A conversation is general. It can explain, investigate, develop, test and use the
capabilities it is authorized for. It is not a Builder chat with another name. The
person talks to one principal agent and does not pick a specialist first; delegation
and subagents belong to the native mechanisms wherever those are adequate.

Agents that ship inside the published application are product resources. They are not
the agent that helps build it.

A persistent conversation does not imply a live SDK session or a permanent sandbox. The
physical mapping between a conversation, a Thread, a Session, a `resourceId`, a scope
and an owner is deliberately unfixed.

Offering more conversations is not a reason to own them. Their messages stay in the
framework's store, and Conexus does not grow a second conversation lifecycle beside it.

Privacy covers messages, persisted requests, diagnostics, recovered memory and
delegation, not only what a list shows. Sharing a conversation transfers neither
credentials nor its author's permissions to whoever continues it.

### 12.4 Source, Preview and publication

A Project has one current source. Conversations and delegated work are not competing
authorities over it. In ordinary interactive use an admitted change advances the source
automatically, without imposing visible branches or pull requests, and a change built on
an older revision never silently overwrites later work.

Source admission and artifact health are different questions. An admitted source may be
kept when the build or the boot fails, so the next interaction can repair it, and the
last healthy Preview stays. The Preview advances automatically only when the checks that
apply have allowed it.

Those two paragraphs are mostly kept today, by [3.5](#35-working-source) and
[3.6](#36-builder-run), and the destination widens them rather than introducing them.
What is already true: source advances automatically, a stale base is refused, a failed
build keeps the source and the last-good Preview. What is not yet true: the same
guarantee under several conversations and under delegated work, and a boot check that
gates the Preview, which is merged with a correction still open.

Publishing is a separate, explicit, authorized capability. Editing, an agent finishing,
or a Work item completing never publishes production. A Release names an immutable
source and artifact, and publishing records who did it and when. Hosting is unchosen.

Separating Preview from Published does not make it safe to edit production data while
developing, and rolling an artifact back does not undo data, migrations or effects that
already left the system. Those limits are recorded here rather than answered by an
environment and rollback platform designed in advance.

### 12.5 Data

Each Project owns a logical data space of its own, isolated from Conexus's internal
data. Which physical database, schema or namespace carries it is decided in the
increment that delivers it.

A conversation and an application act through authorized capabilities. Evolving a
Project's structure grants no arbitrary access to the system database or to production.
A product's own data and data that belongs to an external system stay distinct.

### 12.6 Integrations

Enterprise connections belong to the Workspace. A Project receives authorized
capabilities that conversations, the application and automations reuse. The consumers
never receive the secret and never reimplement the same integration on their own.

This does not retroactively change the personal model connections that already exist,
and it authorizes nobody to share an account or work around a provider's rules.

### 12.7 Brain

Brain is governed enterprise knowledge at the Workspace and Project levels. Conversation
memory, something learned in passing and a one-off exception do not become standing
policy on their own.

Existing memory, retrieval and knowledge mechanisms are reused where they fit. No
retrieval-augmented pipeline, knowledge graph, embedding store or memory engine is built
here, and the Factory's Knowledge capability is not called qualified without evidence.

### 12.8 Automations

An automation is a persistent Project resource with a trigger, an action and the
capabilities it is authorized for. Known steps run as deterministic code or workflows,
and an agent is used where judgement is actually needed.

Existing execution, scheduling and observability mechanisms come first. That does not
assume Mastra already answers every trigger and schedule. A generated automation gains
no production authority by existing.

### 12.9 Work

A Session is interaction. Work is bounded, delegable work, which may come from a Session
or from authorized feedback inside the application.

Work produces a reviewed, validated candidate. Applying it to the Project is explicit
and goes through the Project's own reconciliation and authorization. There is no
auto-apply and no implicit publish of delegated work.

### 12.10 How it is built

Each increment ends in a usable, verified result before anything leans on it. Only the
next increment is planned in detail.

Conexus does not build a second implementation of a mechanism the framework already
provides adequately. Owning an enterprise rule does not oblige Conexus to own the engine
that runs it. Binding an authorization to a native id is allowed; mirroring the
framework's messages, states and lifecycles is not, and neither is a universal wrapper
whose purpose is to hide it.

### 12.11 What is still open

These are unanswered on purpose. None has an answer hidden in this file, and none gets a
placeholder task.

```text
the Factory and Controller composition
which APIs and versions are adequate
how conversations map onto Threads and Sessions
the physical sandbox lifecycle
what becomes of BuilderRun
the admission and reconciliation protocol
migration of existing history
the privacy default and its transition
the physical data schema
application authentication
hosting
the scheduler
the Brain mechanism
```

### 12.12 Removed, not deferred

Project Inception, the Project Baseline, AnalyticQuery, Product Agents, connection
bindings, the capability gateway and the Managed Application Runtime were removed from
the product on 2026-09-19. They are not paused and no seam waits for them. Brain,
Releases, publication, integrations and automations appear above as destination because
the operator approved them as direction, not because the removed implementations are
returning; each arrives as a new feature on this base, with its own plan.
