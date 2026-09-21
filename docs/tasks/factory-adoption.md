# Factory adoption: a Project developed through the Mastra Factory

> **Status:** next. Nothing of it is built.
> **Authority:** [the roadmap](../roadmap.md) owns whether this runs. [C-022](../decisions/index.md)
> already chose the Factory and a forge for Project source. This task executes that choice.
> **Evidence it rests on:** [the Sessions and Work qualification](../evidence/sessions-work-qualification/report.md),
> sections 8 to 15, and a read of `@mastra/factory` 0.16.0-alpha.9 on 2026-09-21 (cited below).

A person opens a Project and asks for a change. The Mastra Factory runs the conversation, the
agent edits the Project's source in its private GitHub repository, checks that the application
compiles before it stops, and the Preview shows the revision the Project accepted. The person never
sees a branch or a pull request.

## Why this is next

The first increment gave a Project several conversations by mounting `@mastra/code-sdk` directly.
It did not adopt the Factory, and Project source stayed under Conexus's own Git custody: an OCI Git
container, source bundles, and a bundle-based admission. That is the gap between C-022 and the
runtime. Every further investment in the host-owned Git path strengthens a state the decision
already replaced.

## What the Factory gives, as read from its source

- **Sandbox.** `MastraFactoryConfig.sandbox` is a callback returning any `MastraSandbox`
  (`factory.js:262-265`). Clone, checkout, commit and push run as shell commands inside it
  (`integrations/github/sandbox.js:222-260`, `:430-456`). The Conexus E2B template, which already
  carries the compiler, can be that sandbox.
- **Storage.** `FactoryStorage` is required, Postgres (`PgFactoryStorage` from `@mastra/pg`) or
  LibSQL (`factory.js:167`). The Hub's single `new Mastra(...)` must be built from `prepare()`'s
  returned args (`factory.js:738-751`). Work-items storage is always registered (`factory.js:210`),
  the Work engine runs only when boards are configured.
- **Models.** Same `@mastra/code-sdk` credential store and thread-scoped selection as today
  (`factory.js:64`).
- **Routes.** `apiRoutes` is an array the host mounts selectively, so the Hub keeps its session,
  CSRF and `project.build` guards and exposes only what the product uses.
- **What it does not do.** It never creates repositories (`integrations/github/integration.js:428`
  is a read). Its push is a plain non-force `git push` and a moved base fails as a generic
  `push-failed` (`integrations/github/sandbox.js:360-364`). Neither is enough for the product.

## The composition

- **Repository per Project.** Conexus creates a private repository in `developmentconexus-ops` when a
  Project is created, and records the binding. GitHub App 5015512 needs repository Administration
  write on the organization for that, which is a one-time human step in GitHub's settings.
- **Session branch.** Each conversation works on its own branch, based on the Project's admitted
  revision at the start of each run.
- **Admission stays Conexus's.** After the agent commits, the branch is pushed, the application is
  compiled and smoke-tested in the same sandbox, and Conexus advances the default branch with a
  compare-and-swap ref update (`force: false`) from the run's base revision to the result. If the
  default branch moved since the run began, the result is not admitted and the run settles with a
  named stale-base outcome. The person sees that, and nothing later is overwritten.
- **Preview.** Unchanged in meaning: built from the admitted revision, and a build or boot failure
  keeps the last good Preview.
- **The agent checks its own work.** The application starter carries the manifest and a check
  command bound to the compiler already in the template, and the agent's instructions require it
  before finishing. Conexus still verifies the artifact before promoting a Preview.

## What leaves Conexus in this cut

`apps/hub/src/platform/oci-git.ts`, `apps/hub/src/project/git-execution.ts`, the bundle and
admission halves of `apps/hub/src/builder/source.ts`, the Git import catalog and its admission, the
Git OCI image and its warm-up, and the Project storage directories. The replacement lands and the old
path's callers move in the same wave. The two never run side by side as sources of truth.

## Out of scope

Work items, boards and the dispatcher in the product. Publish. The frontend redesign. The Factory's
own UI. A provider other than GitHub.

## Units, each ending in a live check on the pilot

1. **Compose through the Factory.** The Hub builds its Mastra from `MastraFactory.prepare()` with
   `PgFactoryStorage` on the pilot Postgres, and the pilot's existing conversations move into it.
   Check: every existing conversation opens with its messages, and a run still works on today's
   source path.
2. **Bind each Project to a repository.** Creation makes the repository; the three pilot Projects get
   theirs with their full history pushed. Check: each repository's default head equals the
   Project's admitted revision.
3. **Develop through GitHub.** Runs clone, work, check and push through the Factory sandbox, and
   admission is the compare-and-swap. Check: the acceptance list below.
4. **Remove the host Git path.** Check: the files above are gone, the Hub boots without the Git
   image, and the acceptance list still passes.

## How it ends

On the pilot, through the product, recorded in this task's evidence:

- A request in a Project edits source in its repository and the Preview shows a text only that run
  could have written.
- The agent ran the application check inside the sandbox before finishing, visible in its tool calls.
- A request that breaks the build keeps the last good Preview and names the failure.
- Two conversations: one advances the source; the other, started on the older revision, does not
  overwrite it and says so.
- No branch or pull request is shown to the person.
- The conversations that existed before the cut still open with their messages.
- The host Git path is deleted.
