# 0015. Child: where each of the 118 functions goes

Part of [spec 0015](index.md). The disposition of every live SQL function, what stays in PostgreSQL,
and how the functions leave. Satisfies AC-11 of the umbrella.

## Summary

All 118 live functions in the Hub schemas leave, part by part, each one for a named TypeScript home.
PostgreSQL keeps what holds even when a TypeScript bug writes: tables, CHECK, UNIQUE, partial unique
indexes, foreign keys, the `workspace_role` type, transactions, row locks and the read policies. The
only functions left at the end are the `iam.*` policy helpers of the admission child, which hold no
business rule.

## 1. Categories

The tags come from the function census (multi label, heuristic): 48 authorization, 65 command, 44
invariant, 9 idempotency, 8 presenter, 6 reaper, 33 reader. Port each latest body's behavior, not its
category.

| Category | Home in TypeScript |
| --- | --- |
| Authorization gate (7 pure, plus 41 bodies that start with `PERFORM iam.admit_*`) | the `admit*` functions (commands) and the read policies (reads) |
| Presenter | one `tx.rows(schema, sql)` with the joins kept in SQL, then a pure presenter in the owner |
| Plain reader | `tx.rows` or `tx.maybe` in the owner store |
| Command with an atomic invariant | the owner command: admission, `FOR UPDATE` on the rows the invariant reads, the invariant as a pure function over them, the write, all on `proof.tx` |
| Plain command | `proof.tx.run(sql)` in the owner |
| Idempotency receipt | `platform/receipt.ts` over `platform.operation_receipt` |
| Reaper | a `Job` (spec 0013 executor) that calls `admitSystem`; `iam.reap_expired` becomes `EXPIRY_RULES`, a table of relation, deadline column and action |
| Trigger (1) | deleted: the run transition writes `phase`, a CHECK refuses the illegal row |

The run lease functions are ported one for one; their redesign is the "Builder out of process" wave.
The five `purge_project` functions become one `purge(proof, projectId)` per owner, reached through the
deletion ports the composition root already passes (`hub.ts`).

## 2. Rules for the move

- **Append, never edit history.** One migration per part, named for its owner. It drops each exact
  signature without `CASCADE`, removes its `EXECUTE` grants, adds the policies and bridges of its
  tables, and adds the CHECKs that replace a rule a function enforced alone.
- **Callers first.** A function still called from another function's body cannot be dropped. Both
  `pg_depend` and string bodies count, so the part replays the migrations and searches the parsed
  bodies for the name. If an unported body still calls it, the caller's part goes first. No new
  compatibility function is written.
- **The caller graph is a script, not a list.** Part 0 adds `scripts/function-callers.mjs`: it
  replays the migrations into a scratch catalog, parses every live function body, and lists every edge
  "function calls function" and "TypeScript SQL text calls function", with the owner of each side. Its
  output is committed (`docs/reference/function-callers.md`) and regenerated in each part, and the drop
  check of a migration fails while any edge still points at a function it drops. The edges across
  owners at `479dfd69` include:
  `project.create_project_with_repository` calls `builder.register_project_repository`
  (`0032_conexus_git.sql`); `project.purge_project` calls the `purge_project` of `iam`, `connector`,
  `reg` and `builder` (`0030_project_deletion.sql`); `reg.get_served_application`,
  `reg.read_served_application_file` and `reg.get_application_thumbnail` call
  `builder.served_preview_revision`; `builder.admit_verified_application_source` is called by `reg`
  and `reg.matches_application_artifact` by `builder`; `project.list_project_summaries_with_activity`
  reads `builder.builder_run` and `builder.project_working_state`; connector functions read
  `project.project`; the `iam.admit_*` and `iam.visible_*` functions are called from every owner.
- **A ported owner calls an unported one through its SQL function, then through a port.** When part
  3 ports PRJ-03 and the purge, its TypeScript still calls `builder.register_project_repository` and the
  four owner purges as SQL on `proof.tx`, so nothing changes for those owners yet. The owner's own part
  then replaces its function with a TypeScript function that `hub.ts` passes to project as a port (the
  pattern of the deletion ports today), edits that one call site, and drops the function. The same
  holds for `reg` calling `builder.served_preview_revision`. The project purge stays one transaction:
  the orchestrator opens `system('project-purge', fn)` and passes the same `WriteTx` to every port.
- **Cross owner SQL in a presenter.** `project.list_project_summaries_with_activity` becomes one query
  in `project/store.ts` that joins `builder.builder_run` and `builder.project_working_state` read only;
  the builder policies apply inside it. The import law governs modules, not table names in SQL; the
  caller graph lists this read so the builder part sees it.
- **`iam` last.** Parts 1 to 5 call `iam.admit_*` and `iam.visible_*` from their own bodies until
  they are ported, so the `iam` functions leave in part 6. `iam.establish_workspace_creator_access`
  is replaced in part 0 (WS-01) and dropped there, since only `workspace.create_workspace` calls it.
  `workspace.list_visible_workspace_summaries` stays until part 6, since `identity-access/store.ts`
  still calls it.
- **The trigger.** Before part 1 drops `builder.clear_builder_run_phase`, a test drives every run
  transition against the trigger and records the resulting `phase`; the same test then runs against
  the TypeScript transitions with the CHECK
  `(state = 'RUNNING' AND cancellation_requested_at IS NULL) OR phase IS NULL` and must give the same
  rows.
- **Shape lines.** "Whatever expires is removed by `iam.reap_expired`" (`shapes.md`) and spec 0014's
  "each session lifetime has one owner in SQL" are restated in part 6 to name `EXPIRY_RULES` and
  `platform/lifetimes.ts`. The expiry test fails on an `expires_at` column `EXPIRY_RULES` does not
  answer for.
- **The count.** `hub-catalog-snapshot.json` is regenerated in the same commit, and its function
  count is census rule 5. Mastra's `factory` schema is not part of the count.

## 3. Every function

The schema prefix is the part: `workspace` in part 0, `project` 3 (merged second), `builder` 1,
`connector` 2, `reg` 4, `model` 5, `iam` 6, with the exceptions in section 2.

| Live function | Census tags | Target TypeScript home or deletion |
| --- | --- | --- |
| `builder.admit_source_revision` | AUTHZ | `builder/source.ts + admission` |
| `builder.admit_verified_application_source` | AUTHZ | `builder/run/admit.ts + admission` |
| `builder.advance_builder_run_source` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.bind_builder_run_message` | COMMAND | `builder/store.ts` |
| `builder.bind_builder_run_sandbox` | COMMAND | `builder/store.ts` |
| `builder.claim_builder_run` | AUTHZ+COMMAND+INVARIANT | `builder/store.ts` |
| `builder.clear_builder_run_phase` | INVARIANT | deleted: the run transition writes `phase`, a CHECK refuses the illegal row (part 1, after the parity test) |
| `builder.create_builder_run` | AUTHZ+COMMAND+IDEMPOTENCY+INVARIANT | `builder/store.ts` |
| `builder.fail_builder_run` | COMMAND | `builder/store.ts` |
| `builder.interrupt_builder_run` | COMMAND | `builder/store.ts` |
| `builder.list_builder_runs` | AUTHZ+PRESENTER | `builder/store.ts + presentation.ts` |
| `builder.lock_project_for_run` | AUTHZ | `identity-access/admission.ts` |
| `builder.purge_project` | COMMAND+REAPER | `builder/store.ts purge port` |
| `builder.read_builder_run` | AUTHZ+READER | `builder/store.ts` |
| `builder.read_conversation_sandbox` | READER | `builder/store.ts` |
| `builder.read_latest_code_changing_builder_run` | AUTHZ+PRESENTER | `builder/store.ts + presentation.ts` |
| `builder.read_open_run_conversations` | READER | `builder/store.ts` |
| `builder.read_preview_subject` | AUTHZ+PRESENTER | `builder/store.ts + presentation.ts` |
| `builder.read_project_sandboxes` | READER | `builder/store.ts` |
| `builder.record_builder_run_candidate` | COMMAND | `builder/store.ts` |
| `builder.record_builder_run_model_account` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.record_conversation_sandbox` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.record_conversation_session` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.register_project_repository` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.renew_run_lease` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.request_builder_run_cancellation` | AUTHZ+COMMAND+INVARIANT | `builder/store.ts` |
| `builder.run_summary` | PRESENTER | `builder/presentation.ts` |
| `builder.served_preview_revision` | READER | `builder/store.ts` |
| `builder.set_builder_run_phase` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.settle_builder_run_build` | COMMAND+INVARIANT | `builder/store.ts` |
| `builder.settle_builder_run` | COMMAND+INVARIANT | `builder/store.ts` |
| `connector.admit_installation_administrator` | AUTHZ | `identity-access/admission.ts` |
| `connector.admit_project_owner` | AUTHZ+READER | `identity-access/admission.ts` |
| `connector.bind_connection` | COMMAND+INVARIANT | `connectors/store.ts` |
| `connector.create_connection` | COMMAND+INVARIANT | `connectors/store.ts` |
| `connector.disable_connection` | COMMAND | `connectors/store.ts` |
| `connector.list_bound_connections` | READER | `connectors/store.ts` |
| `connector.list_connections` | READER | `connectors/store.ts` |
| `connector.list_project_bindings` | READER | `connectors/store.ts` |
| `connector.purge_project` | COMMAND+REAPER | `connectors/store.ts purge port` |
| `connector.read_connection_credential` | READER | `connectors/store.ts` |
| `connector.unbind_connection` | COMMAND | `connectors/store.ts` |
| `iam.account_access_scope` | AUTHZ+READER | `identity-access/admission.ts` |
| `iam.admit_application_owner` | AUTHZ+READER | `identity-access/admission.ts` |
| `iam.admit_project` | AUTHZ+READER | `identity-access/admission.ts` |
| `iam.admit_workspace` | AUTHZ | `identity-access/admission.ts` |
| `iam.application_by_slug` | READER | `identity-access/host-sessions.ts` |
| `iam.application_slug_base` | READER | `identity-access/host-sessions.ts` |
| `iam.application_slug` | READER | `identity-access/host-sessions.ts` |
| `iam.bootstrap_installation_administrator` | AUTHZ+COMMAND+INVARIANT | `identity-access/operator-bootstrap.ts; CLI only` |
| `iam.cancel_application_invitation` | AUTHZ+COMMAND | `identity-access/application-access.ts` |
| `iam.cancel_workspace_invitation` | AUTHZ+COMMAND | `identity-access/membership.ts` |
| `iam.claim_application_invitations` | COMMAND+INVARIANT | `identity-access/application-access.ts` |
| `iam.claim_invitations` | AUTHZ+COMMAND+INVARIANT | `identity-access/membership.ts` |
| `iam.email_has_open_invitation` | OTHER | `identity-access/membership.ts lookup` |
| `iam.end_host_session` | COMMAND | `identity-access/host-sessions.ts` |
| `iam.end_hub_session` | COMMAND+INVARIANT | `identity-access/host-sessions.ts` |
| `iam.establish_workspace_creator_access` | AUTHZ+COMMAND | `identity-access/membership.ts` |
| `iam.grant_application_access` | AUTHZ+COMMAND+INVARIANT | `identity-access/application-access.ts` |
| `iam.grant_first_installation_administrator` | AUTHZ+COMMAND+INVARIANT | `identity-access/installation-administration.ts` |
| `iam.grant_installation_administrator_by_email` | AUTHZ+COMMAND+INVARIANT | `identity-access/installation-administration.ts` |
| `iam.grant_installation_administrator` | AUTHZ+COMMAND+INVARIANT | `identity-access/installation-administration.ts` |
| `iam.has_application_access` | AUTHZ | `identity-access/admission.ts` |
| `iam.hub_session_live` | OTHER | `identity-access/host-sessions.ts` |
| `iam.invite_workspace_member` | AUTHZ+COMMAND+INVARIANT | `identity-access/membership.ts` |
| `iam.is_installation_administrator` | AUTHZ | `identity-access/admission.ts` |
| `iam.list_application_access` | AUTHZ+READER | `identity-access/application-access.ts` |
| `iam.list_installation_administrators` | AUTHZ+READER | `identity-access/installation-administration.ts` |
| `iam.list_workspace_roster` | AUTHZ+READER | `identity-access/membership.ts` |
| `iam.mint_application_handoff` | COMMAND | `identity-access/host-sessions.ts` |
| `iam.open_hub_session` | COMMAND+INVARIANT | `identity-access/host-sessions.ts` |
| `iam.open_preview` | COMMAND | `identity-access/host-sessions.ts` |
| `iam.provision_application_account` | COMMAND+INVARIANT | `identity-access/application-access.ts` |
| `iam.purge_project` | COMMAND+REAPER | `identity-access/project-purge.ts purge port` |
| `iam.reap_expired` | COMMAND+IDEMPOTENCY+REAPER+INVARIANT | `identity-access/reaper.ts, existing Job` |
| `iam.record_provider_check` | COMMAND | `identity-access/host-sessions.ts` |
| `iam.redeem_handoff` | COMMAND | `identity-access/host-sessions.ts` |
| `iam.remove_workspace_member` | AUTHZ+COMMAND+INVARIANT | `identity-access/membership.ts` |
| `iam.resolve_application_session` | COMMAND+INVARIANT | `identity-access/store.ts` |
| `iam.resolve_hub_session` | COMMAND+INVARIANT | `identity-access/host-sessions.ts` |
| `iam.resolve_preview_session` | COMMAND+INVARIANT | `identity-access/host-sessions.ts` |
| `iam.revoke_application_grant` | AUTHZ+COMMAND+INVARIANT | `identity-access/application-access.ts` |
| `iam.revoke_installation_administrator` | AUTHZ+COMMAND+INVARIANT | `identity-access/installation-administration.ts` |
| `iam.role_allows` | OTHER | `identity-access/admission.ts` |
| `iam.session_lifetimes` | READER | `platform/lifetimes.ts; delete SQL duplicate` |
| `iam.set_workspace_member_role` | AUTHZ+COMMAND+INVARIANT | `identity-access/membership.ts` |
| `iam.visible_projects` | AUTHZ+READER | the read policies (`iam.acting_*` helpers) and `identity-access/admission.ts` |
| `iam.visible_workspaces` | AUTHZ+READER | the read policies (`iam.acting_*` helpers) and `identity-access/admission.ts` |
| `model.read_installation_default` | READER | `builder/model-account-store.ts` |
| `model.read_model_account_by_id` | READER | `builder/model-account-store.ts` |
| `model.read_model_account` | READER | `builder/model-account-store.ts` |
| `model.read_shared_model_account` | READER | `builder/model-account-store.ts` |
| `model.rewrite_model_account_secret` | COMMAND | `builder/model-account-store.ts` |
| `model.upsert_model_account` | COMMAND+INVARIANT | `builder/model-account-store.ts` |
| `project.begin_project_deletion` | AUTHZ+COMMAND+INVARIANT | `project/deletion.ts` |
| `project.complete_create_project_receipt` | AUTHZ+COMMAND+IDEMPOTENCY+INVARIANT | `platform/receipt.ts` over `platform.operation_receipt` |
| `project.complete_project_deletion` | COMMAND | `project/deletion.ts` |
| `project.create_project_with_repository` | COMMAND+IDEMPOTENCY+INVARIANT | `project/store.ts` |
| `project.get_project` | AUTHZ+READER | `project/store.ts` |
| `project.list_project_summaries_with_activity` | AUTHZ+PRESENTER | `project/store.ts + summary projection` |
| `project.list_project_summaries` | AUTHZ+READER | `project/store.ts` |
| `project.lock_create_project_receipt` | AUTHZ+IDEMPOTENCY+READER | `platform/receipt.ts` over `platform.operation_receipt` |
| `project.purge_project` | COMMAND+IDEMPOTENCY+REAPER+INVARIANT | `project/deletion.ts purge port` |
| `project.reserve_or_replay_create_project` | AUTHZ+COMMAND+IDEMPOTENCY+INVARIANT | `platform/receipt.ts` over `platform.operation_receipt` |
| `reg.get_application_by_source` | AUTHZ+PRESENTER | `registry/application-artifact-store.ts` |
| `reg.get_application_thumbnail` | READER | `registry/thumbnail.ts, shared parsed reader` |
| `reg.get_served_application` | PRESENTER | `registry/served-application.ts` |
| `reg.matches_application_artifact` | OTHER | `registry/application-artifact-store.ts predicate` |
| `reg.purge_project` | COMMAND+REAPER | `registry/application-artifact-store.ts purge port` |
| `reg.read_application_file_by_source` | AUTHZ+READER | `registry/application-artifact-store.ts` |
| `reg.read_served_application_file` | PRESENTER | `registry/served-application.ts` |
| `reg.retain_application_execution` | COMMAND+INVARIANT | `registry/application-artifact-store.ts` |
| `reg.retain_application_thumbnail` | COMMAND+INVARIANT | `registry/application-artifact-store.ts` |
| `workspace.complete_create_workspace_receipt` | COMMAND+IDEMPOTENCY+INVARIANT | `platform/receipt.ts` over `platform.operation_receipt` |
| `workspace.create_workspace` | COMMAND | `workspace/store.ts` |
| `workspace.get_workspace_summary` | AUTHZ+READER | deleted with WS-02 (part 0) |
| `workspace.list_visible_workspace_summaries` | AUTHZ+READER | `workspace/store.ts` |
| `workspace.reserve_or_replay_create_workspace` | COMMAND+IDEMPOTENCY+INVARIANT | `platform/receipt.ts` over `platform.operation_receipt` |
