# 0015. Child: part 4, the registry owner

**Status**: Approved

**Approval**: approved by the planning session under the operator's delegation for the night of 2026-10-06 (C-039), commit 9ea15ef6

Part of [spec 0015](index.md), revision 5.3 (design 4, the split wall). This child uses the rules of the admission child ([0015-admission.md](0015-admission.md)), sections 1, 2 and 4 to 11, and the table register of the data child ([0015-data.md](0015-data.md)). It realigns the approved revision for umbrella 5.3 to the S1 standard as main (#512, #513) and part 1 build it, and applies the HQ decisions of `explain/hq-decisions.md`. Study notes named by path (`explain/`, `part1/review-build/`) are not in this repository. Every `file:line` is a line of `origin/main` at `8b5af79a`, refreshed on 2026-10-06 against the nine guides ([code](../../development/codebase-principles.md), [architecture](../../reference/architecture.md), [database](../../reference/database.md), [security](../../reference/security-and-authority.md), [API](../../product/wire-contract.md), [testing](../../development/testing.md), [delivery](../../development/delivery.md)). A document those guides replaced is read with `git show 58444763:<path>`.

Part 1 is merged (a squash, `7441c3e1`, #514). This part uses its `admitRun` (`apps/hub/src/identity-access/admission.ts:306-325`), `RunScope.projectId` (`apps/hub/src/identity-access/admission.ts:59`) and settlement code (`apps/hub/src/builder/run-lifecycle.ts:235-254`), and it may build in parallel with part 5. Part 1's `0067_builder_owner.sql` keeps `builder.admit_verified_application_source` and `builder.served_preview_revision` (`apps/hub/migrations/0067_builder_owner.sql:3-32` drops the trigger and 29 functions, not these two; both are rows of `contracts/technical/hub-catalog-snapshot.json:526-527`). This part's migration drops them. Its number is the next free one at the build head: 0068 at `8b5af79a`, with no open pull request holding it. The migration carries `needs:aprovo` ([delivery](../../development/delivery.md#ask-for-aprovo-on-three-kinds-of-change)). Two merges, never one step.

Part 4 adds no proof class, transaction entry or `Scope` variant. It uses `checkApplication`, built in part 0b, for served reads (`apps/hub/src/identity-access/admission.ts:279-284`), `admitRun`, built by part 1, for retention (`apps/hub/src/identity-access/admission.ts:306-325`), and `admitSystem` for the purge (`apps/hub/src/identity-access/admission.ts:332-337`).

## Summary

Part 4 ports nine registry functions and subtracts the data shapes that only those functions needed. Today retention and source reads run on the raw `runtimePool` as `hub_runtime`, with no gate (`apps/hub/src/builder/module.ts:132-139`). After this part no registry statement runs outside `transaction`, `read` or `system`.

A Project member reads its application revisions through two reader policies. A person with application access, a grant holder or a member, reads the served manifest and files on the command role after `checkApplication`, which takes no row lock, filtered by the checked Project. The Project thumbnail route stays a member `read()` that joins the served pointer to the thumbnail of that revision. The Builder retains an artifact in the same `system('builder-executor')` transaction that settles the run, after one `admitRun`, so no matcher is needed. The project purge calls a registry port on its existing system transaction.

The data model shrinks. `reg.artifact` goes: each revision carries its `project_id`. The thumbnail is keyed by its revision and goes with it by cascade. The one value `availability` column goes. Registry owns no product HTTP operation. Its reads feed the Builder Preview route, Preview, the application host, the application runner and the Project thumbnail route (`apps/hub/src/builder/routes.ts:81`, `apps/hub/src/hub.ts:93-142`, `apps/hub/src/project/routes.ts:51-58`). It satisfies umbrella **AC-5**, **AC-9** and **AC-11** (build plan item 7 of [the umbrella](index.md)).

## 1. What it ports

| Function and latest migration | Today | After |
| --- | --- | --- |
| `reg.get_application_by_source` (0001) | A visible Project member gets one available revision by a 40 character source revision. A missing artifact or revision returns no row (`apps/hub/migrations/0001_baseline.sql:1515`). | Goes. The Preview launch calls `readLaunch(proof)` with its `project.build` proof, which returns the five coordinates of the served revision from the one pointer statement (section 5) and refuses the 0042 template pin; the `launchBuilderPreview` compare goes with it. |
| `reg.read_application_file_by_source` (0001) | The same Project visibility check precedes an exact revision and file path lookup. A missing file returns no row (`apps/hub/migrations/0001_baseline.sql:1566`). | `readPreviewRevisionFile(checked, { sourceRevision, artifactRevisionId, path })`, handed to hosting, selects and decodes the exact file in one statement under the Preview request's `Checked<ProjectScope<'project.read'>>`, or returns `null`. Preview stays pinned to its launch revision. It enforces the current template pin. Decided at the stage 6 review (2026-10-06): the account based `readPreviewFile` is deleted (`0015-part-iam.md`, decision 32). |
| `reg.matches_application_artifact` (0001) | The Builder settlement checks project, source, revision id, digest and `AVAILABLE` through this function (`apps/hub/migrations/0001_baseline.sql:1547`). Part 1's TypeScript settlement still calls it as SQL (`apps/hub/src/builder/run-lifecycle.ts:241-243`), granted to `hub_command` by `apps/hub/migrations/0067_builder_owner.sql:62`. | No port. Retention and settlement are one transaction (section 5), so the settlement writes the ids the insert returned. The function, its grant, its census row and its call site row go. |
| `reg.retain_application_execution` (0054) | It admits the running verified Builder source by an unlocked `EXISTS`, checks the payload, hashes PostgreSQL `jsonb` text, locks the artifact, and returns the existing revision on an identical retry (`apps/hub/migrations/0054_compiler_template_failures_gen.sql:27-30`, `:142-170`; `apps/hub/migrations/0036_builder_run_settles_by_change.sql:79-93`). | `retain(proof: Admitted<RunScope>, sealed)`, called inside the settlement transaction after `admitRun` and the verified source check. `INSERT ... ON CONFLICT (project_id, source_revision) DO NOTHING RETURNING`, then a re-read and a digest comparison. `seal` builds, checks and hashes the payload before the runner. |
| `reg.retain_application_thumbnail` (0048) | It admits the running source, checks a PNG of 1 to 512000 bytes and an available matching revision, then replaces the Project's one thumbnail (`apps/hub/migrations/0048_application_thumbnail.sql:40-89`). | Part of `retain`: the thumbnail insert uses the revision id the same call just read, so no id passes between two calls. One row per revision, `ON CONFLICT DO NOTHING`. `seal` checks the PNG once, with the exact rule of `apps/hub/src/builder/application-artifact-runtime.ts:167-178`. |
| `reg.get_served_application` (0023) | Application access, the last good Preview pointer, and matching source, digest, revision id and availability select the manifest (`apps/hub/migrations/0023_application_session.sql:355`; latest body `apps/hub/migrations/0065_split_wall.sql:146`). | `readServedManifest(accountId, projectId)` opens `transaction(accountId)`, calls `checkApplication(gate, projectId)`, and reads the pointer and the matching revision in one statement filtered by `proof.scope.projectId`. It returns the manifest or `null`. |
| `reg.read_served_application_file` (0024) | It reads a file of the current served revision. An optional revision id pins the request. An absent file still yields a row with a null file (`apps/hub/migrations/0024_application_access_review.sql:256`; latest body `apps/hub/migrations/0065_split_wall.sql:176`). | `readServedFile(checked, path)` reads the pointer, the revision and the decoded file in one statement under the request's `Checked<ApplicationScope>`, and returns the `ServedFile` union on `ok` (reasons `NOT_SERVED`, and `NOT_FOUND` with the revision it read), which replaces the `null` of the old `readFile` adapter (`apps/hub/src/registry/served-application.ts:77-84`). The host compares that revision with its manifest's for the server tree. Section 2 gives the outcome table. |
| `reg.get_application_thumbnail` (0048) | Application access and an exact match with the served revision return the thumbnail, else no row (`apps/hub/migrations/0048_application_thumbnail.sql:101-126`; latest body `apps/hub/migrations/0065_split_wall.sql:195`). | `readProjectThumbnail(accountId, projectId)`, under `read(accountId)`, through the one pointer statement. It joins the Project's last good Preview revision in `builder.project_working_state` to the thumbnail of that revision, and reads only tables a member may read (section 4 and decided item 2). |
| `reg.purge_project` (0030) | It deletes revisions and then the Project artifact (`apps/hub/migrations/0065_split_wall.sql:118-128`). It leaves the thumbnail row behind. | `purge(proof: Admitted<SystemScope<'project-purge'>>, projectId)`, passed as `purgeRegistry` in `ProjectDeletionPorts`. It deletes the Project's revisions; their thumbnails go by cascade. |

The three served functions carry the `p_account_id` check that part 0b added (`apps/hub/migrations/0065_split_wall.sql:146-218`). They are dropped here with the other six.

`reg.artifact` can also hold `brain` with a workspace id (`apps/hub/migrations/0001_baseline.sql:2113-2124`). No code reads or writes that kind; only the baseline constraint names it. This part drops `reg.artifact` (section 4, "Data model").

## 2. Operations

Registry has no `REG` product operation and no registry route. The route ledger has the Project thumbnail route and the Builder Preview route, and the registry is their reader (`tests/implementation/access/route-ledger.mjs:41`, `tests/implementation/access/route-ledger.mjs:46`, `apps/hub/src/project/routes.ts:51`, `apps/hub/src/builder/routes.ts:81`). Part 3 owns the declaration of `getProjectThumbnail`. Part 1 owns the Builder declarations. Part 4 adds no operation, YAML deletion or operation ledger row.

| Affected operation | Method and path | Access | Success | Failures beyond the common set | `malformed` |
| --- | --- | --- | --- | --- | --- |
| `getProjectThumbnail`, declared by part 3 | `GET /api/control/projects/:projectId/thumbnail` | session | 200 binary `image/png` | `PROJECT_THUMBNAIL_NOT_FOUND` (404), `PROJECT_THUMBNAIL_UNAVAILABLE` (503) | `projectId: PROJECT_NOT_FOUND` |

The headers `Cache-Control: private, no-cache` and `ETag: "<artifactRevisionId>"` are set by the contract `cache: 'revalidate-private'` through `apps/hub/src/http/access.ts:360-365` (`packages/contract/src/project.ts:111-116`). Part 4 keeps them. The route stays a `read(accountId)`, as the route walk requires of a `/api/control` read (admission child, section 10). It answers `PROJECT_THUMBNAIL_NOT_FOUND` when the query returns no row, and `PROJECT_THUMBNAIL_UNAVAILABLE` only when the read fails (`apps/hub/src/project/routes.ts:53-57`). Delete `config.builder ? … : undefined` (`apps/hub/src/hub.ts:106`) and the `THUMBNAIL_READER_UNAVAILABLE` throw (`apps/hub/src/hub.ts:97`). `ProjectThumbnailReader` is never `undefined` (`apps/hub/src/project/routes.ts:15`, `:52`).

Served reads. A refused served read answers 404 `APPLICATION_NOT_FOUND` through the failure path: the served reader does not catch the `Failure` that `checkApplication` throws (`apps/hub/src/identity-access/admission.ts:282`). The host already throws `APPLICATION_NOT_FOUND` this way for a missing target (`apps/hub/src/hosting/application-host-routes.ts:124`). Today a refusal and an empty pointer both read as `NOT_SERVED` (`apps/hub/src/registry/served-application.ts:73`).

The host's invocation catch turns every runner error into `APPLICATION_RUNNER_UNAVAILABLE` (503) (`apps/hub/src/hosting/application-host-routes.ts:144-145`). Part 4 moves that mapping inside the invoker, around the runner call only (section 5, The invoker), so a registry read fault keeps its own code and the host's catch goes. A pinned server file read that `checkApplication` refuses throws `APPLICATION_NOT_FOUND`, which reaches the host unchanged (404). A pinned read whose served revision moved answers `APPLICATION_NOT_READY` (503).

| Served read outcome | Condition | Answer |
| --- | --- | --- |
| Refused | `checkApplication` refuses | `Failure('APPLICATION_NOT_FOUND')`, 404, from every served read |
| No pointer yet | `last_preview_artifact_revision_id` is null | `null` from `readServedManifest`, `{ ok: false, reason: 'NOT_SERVED' }` from both file reads; the host's 503 page (`apps/hub/src/hosting/application-host-routes.ts:169`) |
| Lost a race with a purge | the purge committed before the one statement; no working state row | as no pointer: `NOT_SERVED`, the host's 503 page. One statement is one snapshot, so a purge never yields a false broken pointer (blast radius, spike 02) |
| Broken pointer | In the one statement, the pointer is non null and the joined revision is null (no revision of the Project matches its revision id, source and digest) | `Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'SERVED_POINTER_BROKEN' } })`, 500, from every served read and the launch. `getProjectThumbnail` maps every read failure to 503 `PROJECT_THUMBNAIL_UNAVAILABLE` and logs the code (`apps/hub/src/project/routes.ts:53-57`) |
| Moved revision | a server file read returns a revision that is not the manifest's | the host answers 503 `APPLICATION_NOT_READY` |
| Missing file | The served revision has no such path | `{ ok: false, reason: 'NOT_FOUND', artifactRevisionId }`; the host's 404 for a page, `APPLICATION_SERVER_FILE_MISSING` for a server file the manifest listed |
| Present file | The served revision has the path | `{ ok: true, artifactRevisionId, file }` from both file reads |

The application host still answers 404 for a corrupt file (`apps/hub/src/hosting/application-host-routes.ts:170`). Preview file delivery still checks the session after the registry read and answers 403 when the file or binding changed (`apps/hub/src/hosting/preview-routes.ts:167-168`).

## 3. Admissions and locks

| Command or read | Entry | Admission | Locks in order |
| --- | --- | --- | --- |
| Preview file read | `read(accountId)` | No admission. The reader policies show a member only the rows of a visible Project. The exact source, revision, path and current template pin conditions stay (`apps/hub/migrations/0001_baseline.sql:1575-1585`). | None. |
| Preview launch (`launchBuilderPreview`) | `transaction(accountId)` in `preview-state.readLaunchSubject` | `admitProject(gate, projectId, 'project.build')` (`apps/hub/src/builder/preview-state.ts:77-80`), then `readLaunch(proof)`: the one pointer statement filtered by `proof.scope.projectId`. | Those of `admitProject`; the read takes none. |
| Served manifest and file reads | `transaction(accountId)` | `checkApplication(gate, projectId)`, which takes no row lock (`apps/hub/src/identity-access/admission.ts:279-284`). Every statement after it filters by `proof.scope.projectId`. The pointer and the revision are read in one statement, a `LEFT JOIN` of `builder.project_working_state` to `reg.artifact_revision` on the three `last_preview_*` columns `WHERE project_id = proof.scope.projectId` (decided item 4). One statement is one snapshot, so a purge cannot commit between the pointer and the revision; the entry is `READ COMMITTED`, where two statements would tear (blast radius, spike 02). A grant holder needs no Workspace membership (`apps/hub/src/identity-access/admission.ts:242-252`). | None. |
| Project thumbnail read (`getProjectThumbnail`) | `read(accountId)` | No admission. The reader policies on the thumbnail, `reg.artifact_revision`, `project.project` and `builder.project_working_state` show a member only a visible Project. The query adds the served match. | None. |
| Retain and settle a built source | The settlement's `system('builder-executor')` transaction (`apps/hub/src/builder/run-lifecycle.ts:14-17`, `withRun`) | `admitRun`, then the verified source check the settlement already makes: `state = 'RUNNING'` and `result_source_revision` equal to the payload's source (`apps/hub/src/builder/run-lifecycle.ts:236-238`), the rule of `builder.admit_verified_application_source` (`apps/hub/migrations/0036_builder_run_settles_by_change.sql:79-93`). The Project is `proof.scope.projectId` and the account is `proof.scope.accountId`, both read from the run row by `admitRun`. | Those of `admitRun` (Project `FOR SHARE`, run `FOR UPDATE`), then working state `FOR UPDATE` (`apps/hub/src/builder/run-lifecycle.ts:156-158`). The revision and thumbnail inserts take no explicit lock. |
| Purge | The Project owner's `system('project-purge')` transaction | Its `admitSystem` proof and tombstone guard (`apps/hub/src/project/deletion.ts:62-77`). The registry port takes `Admitted<SystemScope<'project-purge'>>`, so a proof of another job fails `tsc`. The Project id is the argument the orchestrator passes. | The orchestrator already holds the Project `FOR UPDATE` (`apps/hub/src/project/deletion.ts:65`). Registry deletes revisions, before `purgeBuilder`. |

**No artifact or revision locks.** Retention converges by keys, not locks. `INSERT ... ON CONFLICT DO NOTHING` on the revision's `(project_id, source_revision)` key waits for a concurrent insert of the same key, then the re-read sees it. A revision row is never updated. Retention runs under `READ COMMITTED`; a `REPEATABLE READ` transaction would fail the second insert with 40001 (blast radius, spike 01). Two settlements of one Project meet first at the working state lock, so the conflict wait is a backstop. The purge and retention serialize on the Project row: the purge holds it `FOR UPDATE`, `admitRun` holds it `FOR SHARE`. So `hub_command` needs no `UPDATE` on any registry table.

**Cycle check.** Settlement and deletion take the Project row first. The lease heartbeat and takeover take run rows only and never seek the Project lock (`apps/hub/src/builder/run-lease.ts:40-50`), so they add no cycle. `admitRun` takes the Project `FOR SHARE`; the deletion and the purge take it `FOR UPDATE` before anything else (admission child, section 2). An admitted settlement and a deletion serialize on that row, and the one that waited sees the other's commit. A served read takes no lock. Settlement then locks the run, then working state, then inserts registry rows, parent before child. A tombstone attempted while the run is `RUNNING` gets `PROJECT_BUSY` (`apps/hub/src/project/deletion.ts:54`). An owner that lost its lease is refused by `lockedRun`, because `owner_id` differs (`apps/hub/src/identity-access/admission.ts:292-299`, `lockedRun`). A settlement that waited on a committed purge is refused by the fresh `liveProject` read. So the thumbnail race of today, an unlocked `EXISTS` followed by an insert after a purge (`apps/hub/migrations/0036_builder_run_settles_by_change.sql:84`, found by the part 1 review), cannot happen. The lease heartbeat waits on the run row during the settlement transaction, and the takeover skips a locked run (`apps/hub/src/builder/run-lease.ts:40-50`).

## 4. Reader policies and register rows

**Data model.** The migration reshapes the two registry tables before it adds policies. The existing runner wraps the migration body and its ledger write in one transaction and rolls back on failure (`scripts/run-hub-migrations.mjs:217-240`), so a failed step leaves rows, schema and ledger unchanged. The steps run in this order.

The operator rule applies: in development migrations carry no data cleanup. CI starts empty, and the local databases are reset at the end of S1.

1. Drop `artifact_published_revision_fkey` first, because it references the revision key `(artifact_id, artifact_revision_id)` (`apps/hub/migrations/0001_baseline.sql:2306-2307`).
2. Reshape the revision, then drop `reg.artifact`, then reshape the thumbnail, as below.

- `reg.artifact_revision` gains `project_id uuid NOT NULL` (no backfill; a local database with rows is reset), with `artifact_revision_project_id_fkey` to `project.project (project_id)` `ON DELETE RESTRICT`. It gets `UNIQUE (project_id, source_revision)` in place of the `artifact_id` keys. No `UNIQUE (project_id, digest)`: no reader looks a revision up by digest, and with the source in the key it could fire only on a SHA-256 collision (blast radius, fact 4) (`apps/hub/migrations/0001_baseline.sql:2244-2251`). It drops `artifact_id`, `artifact_revision_artifact_id_fkey` (`:2309-2310`) and `availability` with its CHECK (`:2134-2136`). The CHECK permits only `AVAILABLE`, so the column records nothing.
- `reg.artifact` is dropped with `artifact_workspace_id_fkey` and its keys (`apps/hub/migrations/0001_baseline.sql:2113-2124`, `:2238-2257`, `:2303-2313`).
- `reg.application_thumbnail`: after the revision is reshaped, the migration drops `project_id` and its primary key, and keys the table by `artifact_revision_id` with `application_thumbnail_revision_fkey` to `reg.artifact_revision (artifact_revision_id)` `ON DELETE CASCADE` (`apps/hub/migrations/0048_application_thumbnail.sql:7-19`). The Builder already uses cascade for pure children (`apps/hub/migrations/0038_builder_run_model_accounts.sql:8`, `apps/hub/migrations/0039_builder_conversation_session.sql:16`).

**Reader policies.** Both tables are read by a person, so each has `ENABLE` and `FORCE ROW LEVEL SECURITY`, the command policy of the admission child, section 4.3, and one policy `FOR SELECT TO hub_reader` named `reader`. `A` is `(SELECT rls.acting_account())`. Every branch requires `A IS NOT NULL`. There is no system branch and no administrator branch.

| Table | Reader `SELECT` predicate |
| --- | --- |
| `reg.artifact_revision` | `A IS NOT NULL AND project_id IN (SELECT project_id FROM project.project)`. The subquery runs under the Project's reader policy, as `builder.conversation_session` does (`apps/hub/migrations/0067_builder_owner.sql:45-46`). |
| `reg.application_thumbnail` | `A IS NOT NULL AND artifact_revision_id IN (SELECT artifact_revision_id FROM reg.artifact_revision)`. The thumbnail reaches its Project through its own key, joined to the policed revision (rule 2). |

The thumbnail policy shows a member the thumbnail of every revision of its Project. The served match stays in the query, which returns only the revision the Project serves. A grant holder has no reader branch (rule 5). It reads the one served revision after `checkApplication` on the command role, where a query that forgets its `WHERE` would see every Project. The scoped read rule and the per operation cross tenant test cover that (section 7).

**Grants and register rows.** Each row is a register row in `contracts/technical/hub-catalog-census.json`, asserted by the catalog lint. They replace the three pending rows (`contracts/technical/hub-catalog-census.json:164-188`). The migration commits the regenerated catalog snapshot (`npm run db:catalog:snapshot`, [database](../../reference/database.md#2-migrations)). `hub_runtime` holds nothing on the registry tables today (`contracts/technical/hub-catalog-snapshot.json:46-48`), so there is nothing to revoke.

| Table | `hub_reader` | `hub_command` |
| --- | --- | --- |
| `reg.artifact_revision` | `SELECT` | `SELECT, INSERT, DELETE` |
| `reg.application_thumbnail` | `SELECT` | `SELECT, INSERT` |

No command updates a registry row, so no `UPDATE` is granted and no command can move a row to another Project. The migration prototype ran against the real catalog at `8b5af79a` in this order (blast radius, spike 06); `registry_owner` still holds `REFERENCES` on `project.project` at that head, so the key is created before the section 8 revoke. The thumbnail needs no `DELETE`: its rows go by cascade. No registry table is granted to `hub_factory`.

**Composite keys.** `reg.artifact_revision` has one path to its tenant, `artifact_revision_project_id_fkey`. `reg.application_thumbnail` has one path, through its revision. Neither needs a composite key. The register records both keys.

**Bridges.** All nine `reg` bodies read or write the registry tables. The migration moves each caller and drops the nine before it reshapes the tables, so it adds no `legacy_owner` bridge.

## 5. The owner specific port

**Module shape.** Chosen by a two design bakeoff (architect, Opus and Sonnet candidates, HQ synthesis
in the study notes as `arena/synthesis.md`) and fixed by the spec review (`review-spec/verdict.md`).
One rule sets every signature: a registry function takes a proof only when it runs inside another
owner's transaction (retention in the run settlement, the purge in the Project purge, the Preview
launch inside its `project.build` admission). The served manifest and file reads take a `Checked<ApplicationScope>` proof, and the Preview reads a `Checked<ProjectScope<'project.read'>>`, since they run inside identity access's transaction, by that rule; the server tree is read there too (`0015-part-iam.md`, decision 32). Every other read takes the account and the Project and
opens its own entry, with `checkApplication` inside, the way the connector broker does
(`apps/hub/src/connectors/store.ts:211-220`, `asConsumer`). Identity access makes the `Checked` proof inside `withApplicationRequest` and hands it to the served read.

```ts
// registry/module.ts: the public constructor, a frozen object of these operations
export function createRegistryModule(deps: Readonly<{ database: Database }>): RegistryModule
export type RegistryModule = Readonly<{
  seal(outcome: Readonly<{ compiledApplication: CompiledApplication; thumbnail: CompiledApplicationThumbnail | null }>, run: Readonly<{ projectId: ProjectId; builderRunId: BuilderRunId; sourceRevision: SourceRevision }>): SealedApplication
  retain(proof: Admitted<RunScope>, sealed: SealedApplication): Promise<Readonly<{ artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest }>>
  purge(proof: Admitted<SystemScope<'project-purge'>>, projectId: ProjectId): Promise<void>
  readLaunch(proof: Admitted<ProjectScope<'project.build'>>): Promise<ServedLaunch | null>
  readPreviewManifest(proof: Checked<ProjectScope<'project.read'>>, artifactRevisionId: ArtifactRevisionId): Promise<PreviewManifest | null>
  readPreviewRevisionFile(proof: Checked<ProjectScope<'project.read'>>, at: Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; path: ApplicationFilePath }>): Promise<ApplicationFile | null>
  readServedManifest(proof: Checked<ApplicationScope>): Promise<ServedManifest | null>
  readServedFile(proof: Checked<ApplicationScope>, path: ApplicationFilePath): Promise<ServedFile>
  readProjectThumbnail(accountId: AccountId, projectId: ProjectId): Promise<ServedThumbnail | null>
}>

// the result types, declared in registry/ and reached by consumers only through RegistryModule
type ApplicationFile = Readonly<{ path: ApplicationFilePath; mediaType: MediaType; sha256: Sha256; bytes: Uint8Array }>
type ServedManifest = Readonly<{ artifactRevisionId: ArtifactRevisionId; files: ReadonlyArray<Readonly<{ path: ApplicationFilePath; mediaType: MediaType }>> }>
type ServedLaunch = Readonly<{ sourceRevision: SourceRevision; artifactRevisionId: ArtifactRevisionId; digest: ArtifactDigest; entryPath: ApplicationFilePath; files: ServedManifest['files'] }>
type ServedThumbnail = Readonly<{ artifactRevisionId: ArtifactRevisionId; bytes: Uint8Array }>
type ServedFile = Readonly<{ ok: true; artifactRevisionId: ArtifactRevisionId; file: ApplicationFile }>
  | Readonly<{ ok: false; reason: 'NOT_FOUND'; artifactRevisionId: ArtifactRevisionId }>
  | Readonly<{ ok: false; reason: 'NOT_SERVED' }>
// SealedApplication: a nominal type whose constructor stays in registry/ (the idiom of Checked in
// identity-access/admission.ts). It exposes `projectId`, `sourceRevision` and `digest`; the payload stays inside.
```

**The seal.** `seal` is pure and runs before the runner. It carries every check of today's TypeScript
and SQL validation, in one place: each path matches today's grammar
(`apps/hub/src/registry/application-artifact-store.ts:11`) and becomes an `ApplicationFilePath`; each
media type is one of today's list; each file's SHA-256 matches its bytes; `index.html` is present; no
path repeats; at most 256 files; the total is at most 12582912 bytes; the files are sorted by path;
and the 13 SQL payload checks of `reg.retain_application_execution`
(`apps/hub/migrations/0054_compiler_template_failures_gen.sql:27-170`) that the function took with it.
A failed check throws `APPLICATION_ARTIFACT_INPUT_REFUSED` before the runner. The thumbnail rule of
`apps/hub/src/builder/application-artifact-runtime.ts:167-178` moves here unchanged and is its only
copy: an invalid thumbnail (not a PNG, 0 or over 512000 bytes) is dropped and never fails the build,
as today. The payload has six keys: `format`, `profile`, `templateRef`, `recipeSha256`, `entryPath`
and `files`; the digest is SHA-256 of its canonical JSON (section 6). The Project and the source are
columns, not payload keys, so the SQL key count of eight and the two SQL identity comparisons
(`apps/hub/migrations/0054_compiler_template_failures_gen.sql:33-48`) go, and the identity is checked
twice against its authority instead. First, `seal` compares the compiled result's own `projectId`,
`executionId` and `sourceRevision` with the run it is given (today's comparison at
`apps/hub/src/builder/application-build.ts:121-123`) and refuses a mismatch with
`APPLICATION_ARTIFACT_INPUT_REFUSED`. Second, `retain` compares the sealed `projectId` and
`sourceRevision` with `proof.scope.projectId` and the run's `result_source_revision` read in the
settlement transaction (the verified source check of section 3) and refuses a mismatch with
`BUILDER_RUN_TRANSITION_REFUSED`; it writes the columns from the proof and the run.

**One pointer statement.** One private statement in `registry/` joins the Project's served pointer to
its revision and resolves three states: no pointer, served, or broken. Every served read (manifest,
file, pinned file, thumbnail, launch) uses it, so the pointer match is written once; a broken pointer
throws (section 2). `readLaunch` returns the five coordinates of the served revision from that one
statement, so `preview-state.readLaunchSubject` admits `project.build`, calls `readLaunch` with that
proof, and keeps no pointer lookup of its own; `readSourceManifest` and the `launchBuilderPreview` compare go
(`apps/hub/src/builder/preview-state.ts:77-80`, `apps/hub/src/builder/routes.ts:79-83`). A refusal its
caller branches on is a union on `ok` ([code](../../development/codebase-principles.md#6-errors));
`ServedFile` replaces the `null` that meant three things.

**The invoker.** The runner error mapping moves inside `invokeApplication`, around
`dependencies.invoke` only (`apps/hub/src/hosting/application-invoker.ts:146-165`). A registry read
failure propagates with its own code, so the host's catch and its rethrow of `APPLICATION_NOT_FOUND`
go (`apps/hub/src/hosting/application-host-routes.ts:144-145`). A server file read that finds no
pointer, or a revision other than the manifest's, answers `APPLICATION_NOT_READY` (503, an existing row
of `contracts/technical/failures.json`): the served revision moved during the request, and the next
request reads the new one. `NOT_FOUND` of the manifest's revision keeps `INTERNAL_UNEXPECTED` with
`APPLICATION_SERVER_FILE_MISSING`, because the manifest listed the file.

Decided at the stage 6 review (2026-10-06): one whole server tree per request, read in the request's
entry (`0015-part-iam.md`, decision 32). The review found the seen failure the first pass lacked: two
readers for one file, and a Preview reader with no Project check (review 6, R5 F3). The failure codes
stay; the read moves ahead of the admission line.

A module is a frozen object of its operations ([code](../../development/codebase-principles.md#1-source-files-and-modules)). A module reaches another only through that object ([architecture](../../reference/architecture.md#layers); `scripts/check-import-law.mjs:246-259` lets only the composition root import `registry/module.ts`). So `createRegistryModule` is the one door: the composition root hands the Builder `seal`, `retain` and `readLaunch`, Project `purge` and `readProjectThumbnail`, and hosting the Preview and served reads (replacing the pass throughs of `apps/hub/src/hub.ts:111-132`). No file outside `registry/` imports a `registry/` file, and the import law gets no new entry: each consumer declares the structural port type it needs, as `ProjectDeletionPorts` does (`apps/hub/src/project/deletion.ts:14-22`). The one module wired by `database` replaces the two stores `createApplicationArtifactStore` and `createServedApplicationReader` (`apps/hub/src/registry/module.ts:1-2`). Delete `RegistryQueryClient` (`apps/hub/src/registry/store.ts:1-3`), `application-artifact-store.ts`, `served-application.ts`, `UnboundBuilderApplicationArtifacts` and the optional methods of `BuilderApplicationArtifacts` (`apps/hub/src/builder/application-build.ts:50-78`). Delete the binding to `runtimePool` (`apps/hub/src/builder/module.ts:132-139`), the `service.getApplicationBySource` and `readApplicationFileBySource` pass throughs (`apps/hub/src/builder/service.ts:37-38`, `:206-207`), their re-export in the module's returned object (`apps/hub/src/builder/module.ts:338-339`) and the `HOSTING_REGISTRY_READER_UNAVAILABLE` throws (`apps/hub/src/hub.ts:112`, `:125`, `:129`). The Builder Preview route uses the `ServedLaunch` that `readLaunchSubject` returns and makes no source manifest read (`apps/hub/src/builder/routes.ts:79-83`).

**Types.** Inputs are `AccountId`, `ProjectId`, `SourceRevision`, `ArtifactRevisionId`, `ArtifactDigest` (part 1, step 2) and a branded `ApplicationFilePath`. `ApplicationFilePath` is a new brand in `packages/contract/src/ids.ts`, built from today's path grammar (`apps/hub/src/registry/application-artifact-store.ts:11`). One sha256 schema replaces the copies (`apps/hub/src/registry/application-artifact-store.ts:9`, `apps/hub/src/registry/served-application.ts:49`, `:57`). Callers parse at their edge. No `safeParse` that turns a bad id into `null` stays inside a reader (`apps/hub/src/registry/served-application.ts:61-62`). `ServedFile` is a union on `ok`, the success and `NOT_FOUND` carrying `artifactRevisionId: ArtifactRevisionId`. The artifact digest keeps part 1's `ArtifactDigest`; a file's SHA-256 is a `Sha256` brand and its media type a `MediaType` brand in the contract.

**Retention and settlement, one transaction.** Part 4 edits part 1's settlement after part 1 merges. Part 1 stays as built until then. The order in `settleAdmittedSource` (`apps/hub/src/builder/run/admit.ts:61-119`) becomes:

1. `registry.seal({ compiledApplication, thumbnail: outcome.thumbnail ?? null }, { projectId, builderRunId, sourceRevision })` runs before the runner, with the run's coordinates from its admission, as retention does today (`apps/hub/src/builder/run/admit.ts:86-91`). An invalid payload still fails before the Preview database migrates. The payload carries no Project and no source; `seal` checks the compiled identity and `retain` writes the columns. So `prepareBuilderRunApplicationArtifact` and its two refusal codes go, its comparison moving into `seal` (`apps/hub/src/builder/application-build.ts:112-125`).
2. `prepareApplicationServer` runs as today (`apps/hub/src/builder/run/admit.ts:91-92`).
3. `settleBuilderRunBuild` with `kind: 'BUILT'` carries the `SealedApplication`, not `artifactRevisionId` and `artifactDigest` (`apps/hub/src/builder/run-lifecycle.ts:120-123`). The two `.parse` calls that brand them in the caller go with them (`apps/hub/src/builder/run/admit.ts:108-109`). In one `system('builder-executor')` transaction with one `admitRun` it runs: the verified source check, the working state lock, `retain` (revision, then the thumbnail when the sealed build has one), the working state update with the returned ids, and the run end. The matcher call and its `Matches` row go (`apps/hub/src/builder/run-lifecycle.ts:146`, `:240-243`).

The separate thumbnail call and its `.catch(() => undefined)` go (`apps/hub/src/builder/run/admit.ts:93-106`), and with them the second copy of the PNG size limit (`apps/hub/src/builder/run/admit.ts:55`). The PNG is checked once, in `seal`, with the rule of `apps/hub/src/builder/application-artifact-runtime.ts:167-178` moved there unchanged and tested at its edges (1 and 512000 bytes kept, 0 and 512001 dropped). After that check the insert can fail only by a database fault, which fails the settlement anyway, and the existing catch settles the build as failed (`apps/hub/src/builder/run/admit.ts:111-118`). The takeover path is unchanged: it never retains (`apps/hub/src/builder/run/admit.ts:127-138`).

**Crash before commit.** If the runner finished and the process dies before the settlement transaction commits, nothing of that attempt is in the registry: the transaction rolled back. Takeover then follows `apps/hub/src/builder/run/admit.ts:127-138`: the run ends `FAILED` with `SOURCE_CHANGED_BUILD_FAILED` and `BUILDER_PREVIEW_NOT_BUILT`, and the previous Preview pointer stays. The runner's applied migrations are outside the transaction and stay applied. After a committed settlement the run is terminal, so a lost acknowledgement cannot make takeover undo it: `admitRun` refuses a terminal run (`apps/hub/src/identity-access/admission.ts:292-299`, `lockedRun`).

**Late cancellation.** A stop requested after source admission leaves the run `RUNNING`: it records the request and clears the phase only (`apps/hub/src/builder/run-lifecycle.ts:93-98`). That stop is too late to prevent settlement (`apps/hub/src/builder/run/admit.ts:57-59`), so the run retains and settles.

**Purge.** `purgeRegistry: registry.purge` in `ProjectDeletionPorts`, the same shape as `purgeConnectorBindings` and `purgeBuilder`, called before `purgeBuilder` (`apps/hub/src/project/deletion.ts:14-22`, `:69-71`). It replaces the SQL call of `reg.purge_project` (`apps/hub/src/project/deletion.ts:70`). It runs `DELETE FROM reg.artifact_revision WHERE project_id = $project`, and the thumbnails go by cascade. A missing row is a successful retry.

**Scoped reads and writes.** Each registry statement filters by the admitted Project: `proof.scope.projectId` for a command and a served read, the argument `projectId` beside the reader policy for a member read. A thumbnail write checks that its revision belongs to `proof.scope.projectId` in the same statement: `INSERT ... SELECT ... FROM reg.artifact_revision WHERE artifact_revision_id = $id AND project_id = $project ON CONFLICT DO NOTHING`.

**SQL extraction.** The manifest query selects `jsonb_agg` of each path and media type. A file read uses `jsonb_path_query_first` with the bound path and `decode` in the same statement (`apps/hub/migrations/0023_application_session.sql:379`, `apps/hub/migrations/0024_application_access_review.sql:260-264`). The query transfers one file's bytes per request, even for a 12582912 byte revision. The source and served readers share that shape.

**Refusals.** Rows are parsed by `tx.rows` (`apps/hub/src/platform/db.ts:172`). A malformed row is a `ZodError`, which `toFailure` answers as `INTERNAL_UNEXPECTED`. A row schema uses the contract's branded types, never `z.string()` for an id or a digest ([code](../../development/codebase-principles.md#5-boundaries)). Delete `APPLICATION_ARTIFACT_RESPONSE_REFUSED` and `APPLICATION_ARTIFACT_RESPONSE_SCOPE_REFUSED` and the post read rechecks (`apps/hub/src/registry/application-artifact-store.ts:253-301`). The four deleted codes (these two, `BUILDER_APPLICATION_REQUEST_REFUSED` and `BUILDER_APPLICATION_RESULT_SCOPE_REFUSED`) leave the failure table; the migration touches no stored run (operator rule: no data cleanup, local databases are reset at the end of S1). `APPLICATION_ARTIFACT_INPUT_REFUSED` stays. `seal` throws it for a bad path, a bad media type, a wrong SHA, a missing `index.html` or a total above 12582912 bytes (`apps/hub/src/registry/application-artifact-store.ts:195-226`). The 13 SQL payload checks go with the SQL function. An artifact identity conflict answers `INTERNAL_UNEXPECTED` with `details.invariant: 'ARTIFACT_IDENTITY_CONFLICT'`. A run whose source is not verified answers `BUILDER_RUN_TRANSITION_REFUSED` (500) with `details.transition: 'build settlement'`, the refusal part 1's settlement already gives (`apps/hub/src/builder/run-lifecycle.ts:238`, `contracts/technical/failures.json:164`). No new invariant name is added. `PROJECT_BUILD_DENIED` (403) applies only to account admitted work before the candidate (part 1). A run whose account loses Project access after the candidate still retains its artifact and advances Preview.

**Coordinated drop.** Part 3's Project orchestrator calls `reg.purge_project` as SQL until this part replaces the call with the port. Part 1's settlement calls `reg.matches_application_artifact` until this part replaces the settlement's BUILT branch. This part's migration drops `builder.admit_verified_application_source` and `builder.served_preview_revision` with their grants and bridges, once their caller graph reaches zero. Drop the nine exact registry signatures after their callers move. Check for SQL and TypeScript callers at the exact migration head. No stub or second matcher stays.

## 6. Value sourcing

| Value | Source |
| --- | --- |
| Acting account for a person, Preview or application host | The parsed Hub or host session caller, then the `read` or `transaction` argument (`apps/hub/src/project/routes.ts:53`, `apps/hub/src/hosting/application-host-routes.ts:129`, `apps/hub/src/hosting/preview-routes.ts:149-155`). |
| Project of a served read | `proof.scope.projectId` of `checkApplication`. An id from the request is only the admission argument. |
| Run account, Project and run id | The `admitRun` proof: `proof.scope.accountId`, `proof.scope.projectId`, `proof.scope.builderRunId`, read from the run row (`apps/hub/src/identity-access/admission.ts:306-325`, `admitRun`). |
| Revision `project_id` and `source_revision` | Columns written by `retain` from `proof.scope.projectId` and the run's verified `result_source_revision`, read in the settlement transaction. The payload and its digest carry neither. |
| Revision id | Minted in TypeScript with `ArtifactRevisionId.parse(randomUUID())`, as `project/store.ts` mints its revision (`apps/hub/src/project/store.ts:67`, `:78`). On retry, read the stored id. |
| Artifact digest | SHA-256 of the payload's canonical JSON (`packages/canonical-json`, RFC 8785, the encoder `platform/receipt.ts` already uses), computed by `seal` before the runner. Today it is PostgreSQL `jsonb::text` in the insert (`apps/hub/migrations/0054_compiler_template_failures_gen.sql:142`). Every digest reader compares one stored value with another stored value, and none recomputes one, so the change moves no comparison (blast radius, fact 3). Never `JSON.stringify`, whose key order is not canonical. |
| Payload format, profile, template pin, recipe and entry path | The literals `application-payload-v1`, `REACT_VITE_V2`, `537fnzf4c16x9d7oz21k:3331a697-459d-44d8-bcdd-abade6ba1e81`, `ce2a48f54c08ccdd7641fac8208560963cf43ecdc16bd459a3f333786d1ed4b5` and `index.html` (`apps/hub/src/registry/application-artifact-store.ts:60-69`, `apps/hub/src/platform/application-template-pins.ts:8-12`). Older retained pins stay readable through served reads. Both source readers refuse the 0042 pin, as `metadataRowSchema` does today (`apps/hub/src/registry/application-artifact-store.ts:77-87`). |
| Served revision, source and digest | The three last good Preview columns of `builder.project_working_state` for the checked Project, read directly. They are matched against the revision's id, source and digest, because the working state has no foreign key to the revision (`contracts/technical/hub-catalog-snapshot.json:304-309`). A non null pointer with no match is `SERVED_POINTER_BROKEN` (section 2). |
| Thumbnail length, SHA and capture time | Byte length and SHA of the PNG, and the database clock at the insert (`apps/hub/migrations/0048_application_thumbnail.sql:50`, `:76-81`). |

## 7. Tests (each with literal expected values)

Fixtures used below. Project `P` is `33333333-3333-4333-8333-333333333333`, Project `B` is `44444444-4444-4444-8444-444444444444`. The file `F` is `index.html`, media type `text/html; charset=utf-8`, bytes `<html></html>` (13 bytes), sha256 `b633a587c652d02386c4f16f8c6f6aab7352d97f16367c3c40576214372dd628`. The PNG `T2` is the 8 bytes `89 50 4e 47 0d 0a 1a 0a`, sha256 `4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6`. The PNG `T1` is the 5 bytes `89 50 4e 47 00`. The payload `E` is `seal` of `[F]` with no thumbnail, retained for `P` at source `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`. Its canonical JSON digest `D_E` is computed once at the build head with the repository's `packages/canonical-json` and written into the test as a literal; the builder records the value in the pull request. (The old PostgreSQL digest `d4cfbbd0903a6492ccfa499166534092a6872e0f97f5095acb795a48801840f0` is no longer the identity.)

1. Seed Project `P` with revisions `11111111-1111-4111-8111-111111111111` and `22222222-2222-4222-8222-222222222222`. Call them `r1` and `r2`. Give `r1` source `aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa` and digest `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`. Give `r2` source `bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb` and digest `dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd`. Point its last good Preview to `r2`. A member reads both source revisions through `read()` with the current pin. A revision retained on the 0042 pin still serves to an app grantee, while both source readers refuse it. An app only grantee, after `checkApplication`, gets the literal source, id and digest of `r2` on the command role, and reads only `r2` through the served reads. A direct `read()` as that grantee returns zero rows from both registry tables. An outsider and a call with no account read zero rows. With the source reader's `WHERE` removed, the outsider still reads zero rows and a member of another workspace reads none of `P`.
2. Both revisions hold the one file `F`. With `r2` served, `readServedManifest` returns `{ artifactRevisionId: '22222222-2222-4222-8222-222222222222', files: [{ path: 'index.html', mediaType: 'text/html; charset=utf-8' }] }`. `readServedFile` of `index.html` returns `{ ok: true, artifactRevisionId: '22222222-2222-4222-8222-222222222222', file }` with the 13 bytes of `F` and sha256 `b633a587c652d02386c4f16f8c6f6aab7352d97f16367c3c40576214372dd628`. A missing path `missing.js` returns `{ ok: false, reason: 'NOT_FOUND', artifactRevisionId: '22222222-2222-4222-8222-222222222222' }`. No pointer returns `{ ok: false, reason: 'NOT_SERVED' }` and `null` from the manifest. Purge in flight: hold a served read's transaction open, commit the Project purge, then run the one statement; it answers `NOT_SERVED`, never `SERVED_POINTER_BROKEN` (from `spike/02`). Set the pointer to `r2`'s id with digest `cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc`: every served read and the launch answer 500 `INTERNAL_UNEXPECTED` with `details.invariant: 'SERVED_POINTER_BROKEN'`, and `getProjectThumbnail` answers 503 `PROJECT_THUMBNAIL_UNAVAILABLE` with that code in its log line. With only `T1` on `r1`, `readProjectThumbnail` returns `null`; with `T1` on `r1` and `T2` on `r2`, it returns `T2` with sha256 `4c4b6a3be1314ab86138bef4314dde022e600960d8689a2c8f8631802d20dab6`. With no application host configured, `getProjectThumbnail` reads that PNG and the response carries `ETag: "22222222-2222-4222-8222-222222222222"` and `Cache-Control: private, no-cache`.
3. Revoke the app grant, remove the membership, start the Project's deletion and deactivate the account in separate fixtures. `checkApplication` refuses each, and the next served read answers 404 `APPLICATION_NOT_FOUND`. The member's thumbnail read follows the Project's visibility and returns no row for a hidden Project. A grantee with no membership still opens a granted application. A member of a tombstoned project is refused too, an administrator also, while its source read follows the reader policy. Clear the served pointer while access remains and expect `NOT_SERVED` (503). Host API test: revoke the grant after the manifest read and before the runner's pinned server file read. Expect HTTP 404 with code `APPLICATION_NOT_FOUND`, and the runner's invocation receives no file. A runner that fails for another reason still answers 503 `APPLICATION_RUNNER_UNAVAILABLE`. A registry read fault during the file reads (inject `DATABASE_BUSY`) answers its own code and status, not runner unavailable. Move the served pointer to a new revision between the manifest and the pinned file read: 503 `APPLICATION_NOT_READY`, and the runner receives no file.
4. Retention convergence, on one live proof. Inside one admitted transaction, call `retain` twice with the sealed `E`. Both calls return the same revision id and the digest `D_E`, and one revision row exists. Two sessions retain `E` at once under `READ COMMITTED`: the second waits, then reads the first's row; when the first rolls back, the second inserts (from `spike/01`). Two separate admitted runs of `P` that retain `E` get that same revision id and digest. A third run retains different bytes at source `eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee`: `INTERNAL_UNEXPECTED` (500) with `details.invariant: 'ARTIFACT_IDENTITY_CONFLICT'` in the log, and no changed row. A repeated settlement of a run that already ended answers `BUILDER_RUN_NOT_ADMITTED`, and the stored revision, thumbnail, pointer and `SUCCEEDED` run are unchanged. Rollback: fail the transaction after the revision insert, then in a second fixture after the thumbnail insert. Each leaves no revision or thumbnail row of that attempt and the pointer unchanged. Crash: kill the process after the runner and before commit; takeover ends the run `FAILED` with `SOURCE_CHANGED_BUILD_FAILED` and `BUILDER_PREVIEW_NOT_BUILT`, the previous pointer stays, and no revision or thumbnail of that attempt exists. A payload with a bad path, a bad media type, a wrong SHA or a total of 12582913 bytes returns `APPLICATION_ARTIFACT_INPUT_REFUSED` before the runner is called. A 512000 byte PNG is retained; a 512001 byte PNG, an empty file and a non PNG are dropped by `seal`, and the build still settles with no thumbnail. `seal` refuses a duplicate path and a 257th file with `APPLICATION_ARTIFACT_INPUT_REFUSED`, and two builds with the same files in a different order get the same digest. A thumbnail insert for a revision of another Project writes no row. A settlement with a thumbnail writes the revision, the thumbnail and the pointer in one commit.
5. Three fixtures for a stop. A cancellation requested after source admission leaves the run `RUNNING`, and settlement commits with its revision, thumbnail and pointer. A run that already ended `INTERRUPTED` answers `BUILDER_RUN_NOT_ADMITTED`, with no new registry row. An owned `RUNNING` run whose `result_source_revision` is null or differs from the payload's source answers `BUILDER_RUN_TRANSITION_REFUSED` (500) with `details.transition: 'build settlement'`, with no new registry row. Race a cancellation request against settlement in both lock orders: the run ends `SUCCEEDED` with its pointer either way, and no `40P01`. An owner that lost its lease settles BUILT and gets `BUILDER_RUN_NOT_ADMITTED`, with no revision or thumbnail row. Remove the member after the candidate in a separate fixture. Settlement commits and advances Preview despite the lost access. Attempt a tombstone while the run is `RUNNING`; it returns `PROJECT_BUSY` and settlement commits. Race the project purge against settlement in both orders. Expect `PROJECT_BUSY` while a run is live, or `BUILDER_RUN_NOT_ADMITTED` after the purge, no registry row left, and no `40P01`. After a committed tombstone the next served read gets `APPLICATION_NOT_FOUND`. During a served read `pg_locks` shows no row lock of the backend.
6. Call the registry purge port twice on the same system transaction shape. Expect zero revisions and thumbnails for `P`, and no change to another Project. A failure after the first purge delete rolls back every registry delete. The Project tombstone remains for its retry.
7. Per operation cross tenant test. As a member or grantee of Project `P`, call the served reads with Project `B`'s id: each answers 404 `APPLICATION_NOT_FOUND`. Call `GET /api/control/projects/44444444-4444-4444-8444-444444444444/thumbnail`: it answers 404 `PROJECT_THUMBNAIL_NOT_FOUND`. A digest of `B`'s registry rows is unchanged. A settlement for a run of `A` never reads or writes `B`'s rows.
8. Privileges. As `hub_command`, every `UPDATE` on `reg.artifact_revision` and `reg.application_thumbnail`, and `DELETE` on the thumbnail, answer 42501. As `hub_reader`, `FOR SHARE`, `INSERT`, `UPDATE` and `DELETE` answer 42501. As `hub_runtime` with no role set, both tables answer 42501. The generated cross tenant read test covers both tables with its positive control, and the administrator variant reads neither. Catalog lint fixtures cover the register rows, the two keys, and a census without `reg.matches_application_artifact`. Check the caller graph at the drop head, `db:catalog:check`, the focused PostgreSQL store tests and the real host and Preview paths. The route walk still parses `getProjectThumbnail`, and an outsider still gets its declared 404. For a revision with 12582912 bytes across several files, a file request transfers only the requested file's bytes. A maximum size settlement holds the run row for less than the 5 s `lock_timeout` of the heartbeat pass (`apps/hub/migrations/0065_split_wall.sql:42-43`; measured 0.6 to 1 s at 12 MiB through `psql`, `spike/03`); the lease cannot take a locked run.
9. Real Builder turn on the local Conexus ([testing](../../development/testing.md#9-builder-proof), run by the verification step, not CI). A request in Portuguese builds an app with a real model and a real sandbox. Expect one revision and one thumbnail retained in the settlement transaction, the Preview opened from the retained revision, the thumbnail on the Projects home with `ETag: "<artifactRevisionId>"`, and the application host serving the app to a grantee. Negative: after the grant is revoked the session ends, so a reload of a document lands on the no access page (403, reason `NOT_GRANTED`) and an API or file request answers 401 `APPLICATION_SIGN_IN_REQUIRED`. The 404 `APPLICATION_NOT_FOUND` of a revoke that lands between the two host reads is item 3's proof (`tests/implementation/application-host-registry.postgres.test.mjs`).

No test logs in as a capability role. `tests/implementation/builder-application-registry.postgres.test.mjs` logs in as `hub_builder_executor` today (`tests/implementation/builder-application-registry.postgres.test.mjs:54-55`, `:107-108`, `:180-181`); rewrite it on `database.system` and `database.read`. Store and migration tests are `*.postgres.test.mjs` and the route tests (thumbnail, host) sit in `tests/implementation`, per the [testing guide](../../development/testing.md#2-test-sizes). A PostgreSQL test with no database fails, or skips with an `opt-in:` reason.

## 8. Deletes

Drop the nine exact `reg` function signatures without `CASCADE` after their callers move. Remove their `EXECUTE` grants, including the `hub_command` grant on `reg.matches_application_artifact` from `apps/hub/migrations/0067_builder_owner.sql:62` and the `hub_reader` grants on the three served functions (`apps/hub/migrations/0065_split_wall.sql:287-288`). Remove the census function rows (`contracts/technical/hub-catalog-census.json:425-436`) and the call site rows (`tests/repository/hub-call-sites.mjs:15`, `:68`, `:71-79`). Drop `builder.admit_verified_application_source` and `builder.served_preview_revision` with their grants and remaining bridges. Their callers at `8b5af79a` are the bodies this migration drops first (`apps/hub/migrations/0054_compiler_template_failures_gen.sql:27`, `apps/hub/migrations/0048_application_thumbnail.sql:55`, `:114`, `apps/hub/migrations/0065_split_wall.sql:158`, `:183`, `:208`) and two tests: `tests/implementation/builder-application-registry.postgres.test.mjs:57-61`, rewritten with the rest of that file, and `tests/implementation/builder-run-recovery.postgres.test.mjs:157`, which asserts `admitted: true` from the function and drops that assertion. Other test and script callers of the nine functions or of `reg.artifact` to rewrite: `project-deletion.postgres.test.mjs` (`:25-26`, `:57-58`, `:109-115`), `application-access.postgres.test.mjs` (`:1017-1038`), `workspace.postgres.test.mjs:109`, `project.postgres.test.mjs:217`, `operation-cross-tenant.postgres.test.mjs` (`:17`, `:86-90`), `builder-application-registry.test.mjs`, `builder-run-dispatch.test.mjs` (`:74-278`), `builder-run-harness.mjs` (`:335-336`), `builder-session-routes.test.mjs:520`, `cross-tenant-reads.postgres.test.mjs` (a seed and a `KEY_COLUMN` entry for both tables), and `scripts/census-builder-run.mjs` (`:119-124`). The `application-host`, `preview-application-api`, `telemetry-logs`, `walk-listeners` and `project-http` tests mock the reader ports by name and follow the section 5 renames. `spike/07-census-reg-readers.mjs` of the study prints any other toucher as `UNEXPECTED`. The check at the build head is `npm run db:callers:check` ([database](../../reference/database.md#2-migrations)), then a search of `tests/` for each dropped name.

Drop `reg.artifact` and the columns of section 4. Remove the pointer lookup of `preview-state.readLaunchSubject` (`apps/hub/src/builder/preview-state.ts:77-80`), the host's invocation catch (`apps/hub/src/hosting/application-host-routes.ts:144-145`), `registry/store.ts`, `registry/application-artifact-store.ts`, `registry/served-application.ts`, the Builder registry port types and bindings, and the two Builder refusal codes of section 5. Remove `APPLICATION_ARTIFACT_RESPONSE_REFUSED` and `APPLICATION_ARTIFACT_RESPONSE_SCOPE_REFUSED` from `contracts/technical/failures.json` and the generated files. No registry YAML or web client exists to delete. The registry owner function count goes from nine to zero. The Builder function count goes from two to zero.

Revoke `registry_owner` `EXECUTE` on `iam.visible_projects` and `iam.has_application_access` (`contracts/technical/hub-catalog-snapshot.json:547`, `:572`). Revoke `REFERENCES` on `project.project` and on `workspace.workspace` (the key `reg.artifact` held) from `registry_owner`, as 0066 did for `connector_owner` (`apps/hub/migrations/0066_connector_owner.sql`, its `REVOKE ... REFERENCES ON project.project FROM connector_owner`). Keep the `registry_owner` object owner until part 6 moves the objects to `conexus_owner`.

**The executor role.** Part 4 ports the last functions granted to `hub_builder_executor`. At `8b5af79a` it holds `EXECUTE` on seven `reg` functions, the nine this part drops except the matcher and the purge (`contracts/technical/hub-catalog-snapshot.json:580-588`), and `USAGE` on schemas `builder` and `reg` (`contracts/technical/hub-catalog-snapshot.json:6`, `:14`). It is named in the row `contracts/technical/hub-database-roles.json:33-38` (with its password file variable), the call site rows `tests/repository/hub-call-sites.mjs:71-74`, the three test logins above, and `tests/implementation/split-wall.postgres.test.mjs:123-125`, which uses it as the example of a role that must not be a member of `hub_reader`; that test takes another role. The example sentence of `docs/reference/hub-database-roles.md` went with the guides that file. Remove each, then `DROP ROLE` per the data child (dropping a role, [0015-data.md](0015-data.md), "Dropping a role"). `scripts/generate-hub-baseline.mjs:21` and the baseline role list of `tests/implementation/hub-baseline.postgres.test.mjs:28` name the baseline's historical roles and stay. Recheck every cited line and every grant at the part 4 build head.

## 9. Revision 5.2

What revision 5.2 cut from revision 3, which was written for amendments A and A+: the nine `INSERT`, `UPDATE` and `DELETE` policy rows, the system and served branches of the `SELECT` rows (the member branches stay as reader policies), the paragraph on `iam_rls` grants and policies over seven source tables and on the served tuple helper, the two `iam_rls` dependencies on parts 1 and 3, the bridge table of eight bodies, and the section on the case where the amendment is refused. It rewrote the served reads onto admission, retention onto `admitRun`, the grants into register rows, and the thumbnail key. It kept every refusal code, the payload and identity rules, the purge order and every test that did not depend on the removed mechanisms.

## 10. Departures this part closes

The rows of [architecture section 11](../../reference/architecture.md#11-risks-and-technical-debt) at `8b5af79a` that part 4 removes, by the code guide's rule that a wave that settles a shape moves every instance of the old shape and deletes it ([code](../../development/codebase-principles.md)). The section says the pull request that fixes a departure deletes its line. No row is wholly the registry's, so the pull request deletes the registry share of each row below and rewrites its Wave column.

| Row (`architecture.md`) | What part 4 removes | Wave column after the PR |
| --- | --- | --- |
| Stores not yet ported run as `hub_runtime`, with `legacy` roles, `legacy_owner` and `legacy_runtime` policies, and SQL functions that hold business rules (line 401) | The registry and the Builder retention on the raw `runtimePool` (`apps/hub/src/builder/module.ts:132-139`), the nine `reg` functions and the two Builder functions 0067 kept, the legacy role `hub_builder_executor` | S1, parts 5 and 6 |
| Response bodies cast with `as` and ids typed `string` in module ports (line 394) | The registry ports and their Builder, Project and hosting copies take branded ids and a branded `ApplicationFilePath`, with no cast (section 5) | S1, parts 5 and 6 |
| Rows read without a schema and response bodies read with `json()` (line 393) | Nothing is counted: the registry is not in `contracts/technical/census-boundaries.json`, because it queries through `RegistryQueryClient` (`apps/hub/src/registry/store.ts:1-3`) and not `pg`. Its rows move onto `tx.rows` with the contract's types (section 5, Refusals), so its share is zero | S1, part 6 |

The same pull request rewrites the Wave column of the other S1 rows to the exact part, and adds two rows. Each part zeroes its own share of the shared rows, and part 6 closes them.

| Row | Wave column after the PR |
| --- | --- |
| `receipt.ts` imports `identity-access` (line 383) | S1, part 6 |
| `iam-client.ts` calls the Hub with `fetch` (line 387) | S1, part 6 |
| The first access is refused: `admitBootstrap` is not built (line 388) | S1, part 6 (as it reads today) |
| Ten operations in YAML, `Idempotency-Key` parsed by hand (line 399) | S1, part 6 |
| Rows without a schema and `json()` (line 393) | S1, part 6 |
| Casts and ids typed `string` in ports (line 394) | S1, parts 5 and 6 |
| Stores not yet ported (line 401) | S1, parts 5 and 6 |
| New: a sandbox that cannot open ends the Builder turn as `INTERNAL_UNEXPECTED`, with no failure row of its own | Before the screen check |
| New: the no-access page names the wrong reason when Keycloak reports an unverified email (Q3) | S1, part 6 |

Delete a row as soon as its last share goes. The line numbers are those of `architecture.md` at `8b5af79a`.

## Non-goals

- No registry operation, route or YAML, and no change to `getProjectThumbnail` beyond its reader (section 2).
- No `archived` condition and no removal of the `archived` column (decided item 10, wave after part 6).
- No published pointer, no `brain` artifact kind, no second thumbnail per Project (decided items 1 and 8).
- No new proof class, transaction entry or `Scope` variant (this part adds none).
- No change to the Preview 403 on a changed binding (`apps/hub/src/hosting/preview-routes.ts:167-168`), the 12582912 byte payload limit or the template pins.
- No store of part 5 or part 6: the model accounts, the IAM stores and `iam-client.ts` stay for their parts.

## Preserved decisions

The HQ decisions below stand, with their numbers. Also kept as built: `APPLICATION_ARTIFACT_INPUT_REFUSED` from TypeScript, the lock order Project, run, working state (section 3), the headers `Cache-Control: private, no-cache` and `ETag` of the thumbnail, and the refusal codes `PROJECT_THUMBNAIL_NOT_FOUND` and `PROJECT_THUMBNAIL_UNAVAILABLE`.

## What breaks the premise

- A registry write that must run on the account's authority after the candidate: the design assumes retention is executor work under `admitRun`.
- A command that needs `UPDATE` on a registry table: the design assumes revisions are immutable and the thumbnail follows its revision by cascade.
- Any reader of `reg.artifact` or of the `brain` kind that the census missed, or a revision that must exist before its Project row.
- A maximum size settlement (12582912 bytes) that outlasts the run lease inside one transaction (test 8).

## Stop rule

The builder stops and returns to planning when: a line cited here no longer holds at the build head and the decision it supports becomes impossible; a caller of a dropped function or table turns up outside sections 1 and 8 (what the census script prints as `UNEXPECTED`); the work needs a proof class, entry or `Scope` variant ([delivery](../../development/delivery.md#stop-then-escalate)); a second fix on one premise fails review.

## Decided by HQ

1. **`reg.artifact` is dropped.** It was 1:1 with the Project (`artifact_project_id_kind_key`, `apps/hub/migrations/0001_baseline.sql:2241-2242`) and carried a `brain` kind that no code uses. The revision carries `project_id` with one foreign key to the Project. This replaces the earlier decision that withdrew its composite key and recorded `artifact_project_id_fkey`.
2. **`getProjectThumbnail` drops the application row condition.** It is a `/api/control` route, so the route walk requires it to open only `read()` (admission child, section 10), and the thumbnail has a member reader policy. Today's function also requires an `iam.application` row (`iam.has_application_access`, `apps/hub/migrations/0023_application_session.sql:31`), and `hub_reader` holds no grant on that table until part 6. A member of a Project with no application row yet now reads its thumbnail. An account with only an application grant no longer reads it through this route.
3. **`RunScope` carries `projectId`.** Part 1 built it (`apps/hub/src/identity-access/admission.ts:53-61`, `Scope`). Every run scoped statement filters by `proof.scope.projectId`.
4. **The served pointer is read directly.** This part reads the three `last_preview_*` columns on the checked Project. `hub_command` holds `SELECT` on `builder.project_working_state` (`apps/hub/migrations/0065_split_wall.sql:276`).
5. **The purge port takes its job in its type.** A `tsc` negative fixture hands the port an `Admitted<SystemScope<'builder-executor'>>`, and it fails.
6. **Served manifest and file reads use `checkApplication`; `getProjectThumbnail` stays a member `read()` (section 3).** A served request takes no row lock.
7. **One transaction for retention and settlement** (HQ, 2026-10-05 night). The matcher has no port and is dropped. Part 4 edits part 1's settlement after part 1 merges.
8. **Thumbnail keyed by revision**, with cascade from the revision (HQ, 2026-10-05 night). This fixes "thumbnails never purged" and the lost image slot.
9. **A refused served read answers 404 `APPLICATION_NOT_FOUND`**; `NOT_SERVED` (503) means only "no pointer yet" (HQ, 2026-10-05 night).
10. **`archived`.** The operator decided to delete it everywhere, in the wave "Ciclo de vida do Projeto" after part 6. Part 4 adds no `archived` condition and drops the ones it ports. `checkApplication` keeps its own condition (`apps/hub/src/identity-access/admission.ts:249`) until that wave.

## Changes in this revision

- Spec stage of 2026-10-06 (architect bakeoff, blast radius with a PostgreSQL spike, study of the reference code):
  - Module shape from the bakeoff: one signature rule (a proof only inside another owner's transaction), `seal` plus one `retain`, the payload private to `registry/`, one pointer statement for every served read, refusals as unions on `ok`, `PinnedFile` with `STALE_PIN`, the hosting catch around the runner call only. `readSourceManifest` and the `launchBuilderPreview` compare go.
  - The served read is one statement, which removes a false `SERVED_POINTER_BROKEN` under a concurrent purge that two statements under `READ COMMITTED` produced (spike 02).
  - The digest is canonical JSON in TypeScript; `UNIQUE (project_id, digest)` goes; retention names its conflict key.
  - Test 8 asserts the run row hold against the 5 s `lock_timeout`, not the lease; tests 2 and 4 add the purge race and the concurrent retention.
  - Section 8 names seven more test and script callers.
  - References section added.

- Spec review of 2026-10-06 (Opus, Sonnet, gpt-6-sol; `review-spec/verdict.md` in the study notes): the thumbnail enters `seal` with the build and the PNG rule has one copy; the runner error mapping moves inside the invoker; `readLaunch` takes a `project.build` proof and returns the five coordinates from the one statement; `readPreviewFile` keeps the source and goes to hosting; `seal` is a module operation, so no new deep import; the payload carries no Project or source; the seal names every check; `registry_owner` loses `REFERENCES` on `workspace.workspace`; the thumbnail route's 503 mapping is stated.
- Earlier revisions (the refresh against the nine guides, the realignment after #512 and review 3) are in Git history and in the study notes; where they differ, this text wins.

## References

Each mechanism against the reference code, from the study (`study.md`, clones at documenso cd0cc5f, supabase cb52c0f4, mastra-fork ce7e9c30c1; `file:line` there):

| Mechanism | Reference | Verdict |
| --- | --- | --- |
| Revision carries its owner id, no 1:1 parent | Documenso `Envelope.teamId`; Supabase `storage.objects.bucket_id` | follows. Mastra keeps a thin parent, but it holds mutable state Conexus keeps on the Project and working state |
| Binary keyed by its revision, cascade | not found. Documenso cascades the other way and cleans up by hand, the leak this design closes | own, with that reason |
| Served pointer, broken pointer is a fault | Mastra falls back to the latest version with a warning | differs on purpose: the pointer is the authority, and a silent fallback hides a broken invariant |
| `ON CONFLICT DO NOTHING` over row locks | Mastra blobs, favorites and spans | follows; the re-read and compare is today's 0054 |
| Retention in the settling transaction | Documenso seal: pointer swap, status and audit in one transaction | follows |
| Purge port called by the parent's delete | Mastra explicit child delete; Documenso `orphanEnvelopes` then the team cascade | follows |
| Module by subject, branded paths | Mastra `parseSqlIdentifier` | follows; Documenso and Better Auth use no brands |

## Owner reconciliation

What changes in other documents if this part is accepted. The pull request carries the guide change, or one sentence saying why no guide rule changed ([delivery](../../development/delivery.md#proof-and-verification)). Here the guide change is architecture section 11 (section 10 above); the other guides keep their rules.

Umbrella and part 1 text to amend in this PR. Every path is under `docs/specs/0015-checked-boundaries/`.

- `0015-admission.md:294`: remove "and thumbnail" from the list of reads `checkApplication` serves. It reads "the application host's manifest and file reads, and the connector broker...".
- `0015-admission.md:538-539` (section 5, the composite key table; the data child's section 5 thumbnail row):
  - The `reg.artifact` row becomes "`reg.artifact` is dropped by part 4; `reg.artifact_revision` carries `project_id` with one key to `project.project`".
  - The `reg.application_thumbnail` row becomes "keyed by `artifact_revision_id`, key to `reg.artifact_revision` `ON DELETE CASCADE`; no `project_id`".
- `0015-admission.md:963`: "`reg.artifact` gets no composite key" becomes "`reg.artifact` is dropped by part 4, so it gets none".
- `index.md:556-566` (build plan item 7): replace "adds the `reg.application_thumbnail` key (`reg.artifact` gets none ...)" with "drops `reg.artifact` and keys the thumbnail by its revision". Replace "`reg.retain_application_execution` ported, under `admitRun`" with "retention inside the settlement transaction under one `admitRun`; the matcher dropped". "It keeps the three `SELECT` rows' member branch as reader policies" becomes "It keeps two reader policies, on `reg.artifact_revision` and `reg.application_thumbnail`".
- `index.md:683`: "The `reg.artifact` composite key is withdrawn. The register records `artifact_project_id_fkey`." becomes "`reg.artifact` is dropped by part 4. The register records `artifact_revision_project_id_fkey`."
- `0015-part-builder.md:70` (the `settle_builder_run_build` row): replace "A system transaction with the part 4 matcher port, in the same lock order" with "A system transaction under `admitRun`. Part 4 later adds retention and the thumbnail to its BUILT branch and drops the matcher".
- `0015-part-builder.md:249`: already says "takes the run `FOR UPDATE` through `lockedRun`". Part 1's builder made the change. This PR only checks it.
- `0015-part-builder.md:256-257`: "its retain function takes run before artifact, but never seeks working state (... `../part4/0015-part-registry.md:43`)" becomes "until part 4, its retain function takes run before artifact; part 4 retains inside the settlement transaction, which takes Project, run, then working state, with no artifact lock (`0015-part-registry.md`, section 3)".
- `0015-part-builder.md:433`: "Part 4 ports the matcher." becomes "Part 4 drops the matcher: retention and settlement are one transaction."
- `docs/reference/architecture.md` section 11: the rows of section 10 above.
- `contracts/technical/failures.json` and the generated files: the four deleted codes (section 8).
