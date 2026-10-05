# Product contract

What Conexus means: who it is for, its concepts, its journeys and the truths it must keep. Owners
next door: [the roadmap](../roadmap.md) says what is delivered and what is next,
[security](../reference/security-and-authority.md#who-may-act) who may do what,
[DESIGN.md](../../DESIGN.md) how it looks, [the wire contract](wire-contract.md) its routes. Sections
1 to 6 describe the product today; section 7 is the approved destination, which is approval, never
proof that a rule is enforced. Product rules are enforced by the verify flows and review.

## 1. Purpose and people

Conexus lets a person in a company go from "I need an app that does X" to that app running, without
waiting on the IT team. They describe it in Portuguese, the Builder builds it, and the app runs on
the platform connected to the company's systems. Success for one session is a working app in the
Preview, built from a conversation, usable at once.

It serves two groups with equal weight, in the same Project and conversation: staff who are not
technical, who never have to read code, and the company's developers, who read the code and each
run's change in the same place. One installation serves one company. The interface is Portuguese.

Principles. The person gets an app, not a process: branches, pull requests and pipeline steps stay
out of sight. A failed run says what failed and leaves the source repairable. Anything a
non-technical person sees has a plain meaning, and a developer can open the code behind it. No
customer, testimonial or metric is invented.

## 2. Concepts

- **Account.** One person, signed in through Keycloak with a verified email. The first Account comes
  from a preconfigured bootstrap identity; every other arrives by invitation. An application
  invitation to one verified email creates an app-only Account that reaches that one application and
  never a Workspace or the Hub; it expires after 14 days.
- **Workspace.** The isolation root, owning Projects and a roster. Roles are `owner` and `member`;
  only an owner administers the roster, and the last owner stays. Belonging to one Workspace grants
  nothing in another. An installation administrator acts on the installation and gains nothing
  inside a Workspace by it.
- **Invitation.** Names a Workspace, a verified email and a role; claimed when that person signs in
  with that address. Nothing is emailed. Removing a roster entry withdraws every right it gave.
- **Project.** One unit of software in a Workspace, created with its source in one step.
- **Working source.** The Project's current source in Conexus Git. Each request starts from it, even
  when it failed to compile; a change advances it, and a change built on an older revision never
  overwrites later work.
- **Builder run.** One admitted attempt to answer one request, in one conversation. A Project has at
  most one active run. It settles `SUCCEEDED`, `FAILED` or `INTERRUPTED`, and a success is
  `RESPONSE_ONLY`, `SOURCE_CHANGED` or `SOURCE_CHANGED_BUILD_FAILED`; a failed build still advances
  the source. Stop cancels the real run, and cancelling twice is cancelling once.
- **Preview.** A candidate that passed its checks, served to the people who build the Project. Each
  launch has its own route. It is a development surface: a failed candidate may leave none, and
  keeping the last good one is implementation, not a promise.
- **Model.** Each person connects their own model accounts; an installation administrator may share
  one with everyone. The model is chosen per conversation, and nothing is sent until one is chosen.
- **Names.** Workspace, Project and Connection names and an Account's display name are required,
  non-blank, for people only: never identity, routing or authority. A Keycloak user re-created with
  the same email is a new person; disable, never delete.

## 3. Journeys

- **First access.** The bootstrap identity signs in, provisions its own Account and nothing else, and
  creates the first Workspace. There is no public signup and no reusable admin credential.
- **Invite.** An owner invites a verified email with a role; the invitation shows in the roster
  beside members; the person signs in with that address and becomes a member.
- **Build.** A person opens a Project, writes a request in a conversation, watches real activity,
  and uses the Preview; the next request continues the same conversation and source. They may read
  the source at an exact revision, see what a run changed, and read a run's safe trace.
- **Use an app.** An app-only person opens the app's address, signs in, and uses it. Revoking their
  grant or membership stops them at their next request. An archived Project's app is refused.

## 4. The Build surface

The app is the main area and the conversation sits beside it; both survive resizing, collapsing and
a narrow screen. Enter sends, Shift+Enter breaks a line, input methods are safe. While a question
waits, Enter answers it, Stop is its own control, and the screen says "Esperando a sua resposta" with
no countdown. A model change never touches an active run. Progress shows only facts the Hub has
measured. The Preview stays usable while new work runs, and an older launch never replaces a newer
one. A failed admitted source stays current with a safe diagnostic, and there is no automatic repair
loop. Code and Changes are read-only, and Changes compares a run's base with its result. Reload
reconciles conversation, run, source and Preview from the server. Scenario selectors, simulated runs,
seeded replies and fake trace bars never ship.

## 5. What the product must tell the truth about

```text
loading != empty != failed != partial          unknown != zero
model narration != Hub progress                stale != current
working != blocked != waiting for you != done  a grant issued != a Preview that loaded != a working app
read from a system != written to look like it  a timed-out request != a known failure
```

The Hub owns run state; a model's narration never marks work complete. A missing fact shows as
missing, never as an invented zero, percentage or timer; unreported usage is "unavailable". A
stale write says someone changed the thing first and keeps both.

## 6. Surfaces and what Conexus is not

The surfaces are entry, setup, sign-out and no-access pages; Workspaces and their Projects and
people; a Project's conversations, settings, application access and Integrações; the person's
account and models; and installation administration. The web router is the exact list. There are no
others, and no navigation is added for an unapproved one because a shell looks empty.

Conexus is not an ERP replacement, a database console, a generic integration, workflow, automation
or low-code platform, a marketplace, an IDE first, or a chat that hides the real source, run and
Preview.

## 7. Approved destination

Approved by the operator as C-021 (2026-09-20) and C-028; none of it is proof of delivery.

- **Purpose.** The platform a company builds, administers and evolves its own products on,
  connected to its own context and systems: a usable internal base, not a general SaaS.
- **Project and application.** A Project is one publishable product holding its development and
  operation: source, frontend and backend, conversations, its own agents, knowledge, data,
  integrations and automations. Its users reach the published app by URL, signed in, without
  administering the Project. The first profile is a managed Conexus application, not a backend per
  Project.
- **Conversations.** A Project offers several persistent conversations, private to the person who
  started it (C-036). A conversation is general and talks to one principal agent. Privacy covers
  messages, requests, diagnostics, memory and delegation. Continuing a conversation transfers neither
  credentials nor permissions. Conexus keeps no second store for messages.
- **Source, Preview, publication.** One current source; admission and artifact health are separate
  questions. Publishing is explicit and authorized; editing, an agent finishing or work completing
  never publishes. A Release names immutable verified material and its source revision, and only
  Publish changes what employees receive. Separate Preview and Published data do not make editing
  production data safe, and rolling back an artifact undoes no data, migration or effect.
- **Data.** Each Project owns an isolated data space; its handlers and migrations stay in its source.
  No browser database credential and no reach into Hub data. A product's own data and an external
  system's data stay apart.
- **Integrations.** Each external system has one integrator; a Connection is one configured account
  of it, created by an installation administrator and bound to a Project under a local name by a
  Workspace owner. Requests go in the vendor's own format through one Conexus executor; consumers
  never see the credential. Connections read only for now. Every value shown as coming from a system
  traces to a read through a bound Connection. When none is bound, the Builder says what to bind and
  builds nothing that stands in for the data; a failed read shows as a failure, never as empty or
  invented data (C-030).
- **Brain, automations, work.** Knowledge is governed at Workspace and Project level; memory learned
  in passing is not policy. An automation is a Project resource with a trigger, an action and its
  authorized capabilities, gaining no production authority by existing. Delegated work yields a
  reviewed candidate applied only through the Project's own admission, never auto-applied or
  published.
- **Open on purpose.** Publish ingress, conversation privacy transitions, delegated work admission,
  the scheduler and the Brain mechanism.
- **Removed, not deferred.** Project Inception, the Project Baseline, AnalyticQuery, Product Agents,
  the old connection bindings, the capability gateway and the old managed runtime.
