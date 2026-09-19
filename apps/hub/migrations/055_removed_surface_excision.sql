BEGIN;

-- The application no longer has Project Inception, Baseline and refinement, the Brain, project
-- brain and connection bindings, or the Sankhya connections and their gateway. The catalog still
-- carried them. What is dropped here is exactly the set of objects unreachable from what the Hub
-- calls: the roots are every schema-qualified name in apps/hub/src and in the migration runner,
-- closed over function bodies, view and constraint and index and default and trigger definitions,
-- foreign keys and owned sequences. Everything outside that closure is below; everything inside it
-- stays, which is why schema reg keeps artifact and artifact_revision while losing its eight brain
-- functions, and why project.project keeps source_mode, still written by create_project_with_source.
--
-- The pilot count of 2026-09-19 read zero rows in every table dropped below, and the
-- operator authorised the drops that day. That count was one day's reading and this
-- migration runs on another, so it re-proves emptiness against the rows actually present.
DO $$
DECLARE
  offending text;
BEGIN
  SELECT string_agg(format('%s has %s rows', occupied.table_name, occupied.row_count), ', ' ORDER BY occupied.table_name)
  INTO offending
  FROM (
    SELECT 'brn.binding_validation' AS table_name, count(*) AS row_count FROM brn.binding_validation HAVING count(*) > 0
    UNION ALL
    SELECT 'brn.health' AS table_name, count(*) AS row_count FROM brn.health HAVING count(*) > 0
    UNION ALL
    SELECT 'con.connection_qualification' AS table_name, count(*) AS row_count FROM con.connection_qualification HAVING count(*) > 0
    UNION ALL
    SELECT 'con.operation_receipt' AS table_name, count(*) AS row_count FROM con.operation_receipt HAVING count(*) > 0
    UNION ALL
    SELECT 'project.baseline_approval' AS table_name, count(*) AS row_count FROM project.baseline_approval HAVING count(*) > 0
    UNION ALL
    SELECT 'project.baseline_state' AS table_name, count(*) AS row_count FROM project.baseline_state HAVING count(*) > 0
    UNION ALL
    SELECT 'project.binding_source_intent' AS table_name, count(*) AS row_count FROM project.binding_source_intent HAVING count(*) > 0
    UNION ALL
    SELECT 'project.brain_binding' AS table_name, count(*) AS row_count FROM project.brain_binding HAVING count(*) > 0
    UNION ALL
    SELECT 'project.connection_binding' AS table_name, count(*) AS row_count FROM project.connection_binding HAVING count(*) > 0
    UNION ALL
    SELECT 'project.inception_idempotency' AS table_name, count(*) AS row_count FROM project.inception_idempotency HAVING count(*) > 0
    UNION ALL
    SELECT 'project.baseline_candidate' AS table_name, count(*) AS row_count FROM project.baseline_candidate HAVING count(*) > 0
    UNION ALL
    SELECT 'con.connection' AS table_name, count(*) AS row_count FROM con.connection HAVING count(*) > 0
    UNION ALL
    SELECT 'con.connection_revision' AS table_name, count(*) AS row_count FROM con.connection_revision HAVING count(*) > 0
  ) AS occupied;
  IF offending IS NOT NULL THEN
    RAISE EXCEPTION 'MIGRATION_055_TABLE_NOT_EMPTY_REFUSED: %', offending;
  END IF;
END $$;

SET LOCAL ROLE project_owner;

DROP FUNCTION project.abandon_inception(uuid, uuid, text, uuid);
DROP FUNCTION project.abort_binding_source_intent(uuid, uuid, uuid, bigint, text);
DROP FUNCTION project.approve_baseline_revision(uuid, uuid, text, uuid, uuid[]);
DROP FUNCTION project.begin_brain_binding_intent(uuid, uuid, uuid, text, jsonb, jsonb, text, uuid);
DROP FUNCTION project.begin_brain_binding_removal_intent(uuid, uuid, jsonb, uuid);
DROP FUNCTION project.begin_connection_binding_intent(uuid, uuid, uuid, uuid, text, jsonb, boolean, uuid);
DROP FUNCTION project.complete_binding_source_abort(uuid, uuid, uuid, bigint, text);
DROP FUNCTION project.complete_binding_source_intent(uuid, uuid, uuid, bigint);
DROP FUNCTION project.freeze_binding_source_intent(uuid, uuid, uuid, bigint, text, text, text, text, text, text);
DROP FUNCTION project.get_approved_baseline(uuid, uuid[]);
DROP FUNCTION project.get_baseline_candidate(uuid, text, uuid[]);
DROP FUNCTION project.get_binding_source_basis(uuid, uuid, uuid, bigint);
DROP FUNCTION project.get_binding_source_intent(uuid, uuid, uuid);
DROP FUNCTION project.get_project_brain_read_basis(uuid, uuid[]);
DROP FUNCTION project.settle_brain_binding(uuid, uuid, uuid, uuid, text, jsonb, text, text, jsonb, text, uuid);
DROP FUNCTION project.settle_brain_binding_removal(uuid, uuid, jsonb, text, text, jsonb, text);
DROP FUNCTION project.validate_binding_source_intent(uuid, uuid, uuid, bigint);

DROP TABLE project.baseline_approval;
DROP TABLE project.baseline_state;
DROP TABLE project.binding_source_intent;
DROP TABLE project.brain_binding;
DROP TABLE project.connection_binding;
DROP TABLE project.inception_idempotency;
DROP TABLE project.baseline_candidate;

DROP FUNCTION project.guard_inception_binding_source();

SET LOCAL ROLE registry_owner;

DROP FUNCTION reg.admit_project_brain_revision(uuid, uuid, text, jsonb);
DROP FUNCTION reg.bootstrap_workspace_brain(uuid, uuid, uuid, text, text, jsonb);
DROP FUNCTION reg.get_brain_revision(uuid, uuid, uuid[]);
DROP FUNCTION reg.get_project_binding_update(uuid, uuid);
DROP FUNCTION reg.get_project_brain_candidate(uuid, uuid);
DROP FUNCTION reg.get_project_brain_snapshot(uuid, uuid, text);
DROP FUNCTION reg.get_workspace_brain(uuid, uuid[]);
DROP FUNCTION reg.list_brain_revisions(uuid, uuid[]);

SET LOCAL ROLE brain_owner;

DROP FUNCTION brn.admit_binding_candidate(jsonb);
DROP FUNCTION brn.admit_binding_validation(uuid, uuid, uuid, text, text, jsonb);
DROP FUNCTION brn.bootstrap_brain_health(text, uuid, text, jsonb);
DROP FUNCTION brn.canonical_binding_json(jsonb);
DROP FUNCTION brn.get_brain_health(uuid, text);
DROP FUNCTION brn.get_project_binding_attestation(uuid, uuid, text, text);
DROP FUNCTION brn.get_project_brain_basis(uuid, uuid);
DROP FUNCTION brn.persist_binding_validation(uuid, uuid, uuid, text, text, jsonb);

DROP TABLE brn.binding_validation;
DROP TABLE brn.health;

SET LOCAL ROLE connections_owner;

DROP FUNCTION con.admit_brain_proof_subject(uuid, uuid, uuid, uuid, uuid, bigint, text);
DROP FUNCTION con.admit_project_binding_revision(uuid, uuid, uuid, uuid, text);
DROP FUNCTION con.create_or_replay_connection(uuid, text, uuid, text, text, uuid, uuid, text, text, text, jsonb, text);
DROP FUNCTION con.get_connection(uuid, uuid);
DROP FUNCTION con.get_connection_qualification(uuid, uuid, uuid);
DROP FUNCTION con.get_project_binding_name(uuid, uuid, uuid);
DROP FUNCTION con.list_connections(uuid, text, uuid, uuid);
DROP FUNCTION con.reserve_connection_credential(uuid, uuid, text, text);
DROP FUNCTION con.reserve_connection_qualification(uuid, uuid, uuid, text, text, text, uuid, uuid);
DROP FUNCTION con.resolve_key_conformance_subject(uuid, uuid, uuid, uuid, uuid, text);
DROP FUNCTION con.revise_connection(uuid, uuid, uuid, uuid, jsonb, text);
DROP FUNCTION con.settle_connection_credential(uuid, uuid, text, text, bigint);
DROP FUNCTION con.settle_connection_qualification(uuid, uuid, uuid, uuid, bigint, text, uuid, text, text, jsonb, text[], timestamp with time zone);

DROP TABLE con.connection_qualification;
DROP TABLE con.operation_receipt;
DROP TABLE con.connection, con.connection_revision;

-- The login roles of the removed surfaces stay: a role is cluster-global and holds
-- privileges per database, so DROP ROLE answers 2BP01 whenever another database on the
-- same cluster still grants to it, which would make this migration depend on what else
-- the cluster hosts. Revoking every privilege they hold here leaves them inert instead.
SET LOCAL ROLE iam_owner;
REVOKE USAGE ON SCHEMA iam FROM hub_r2_brain_read, hub_s4_baseline_command, hub_s4_baseline_read, hub_s6_inception_command;
SET LOCAL ROLE project_owner;
REVOKE USAGE ON SCHEMA project FROM hub_r2_key_conformance_subject, hub_r2_project_binding, hub_s4_baseline_command, hub_s4_baseline_read, hub_s6_inception_command;
SET LOCAL ROLE registry_owner;
REVOKE USAGE ON SCHEMA reg FROM hub_r2_brain_attester, hub_r2_brain_bootstrap, hub_r2_brain_read;

SET LOCAL ROLE brain_owner;
DROP SCHEMA brn;

SET LOCAL ROLE connections_owner;
DROP SCHEMA con;

RESET ROLE;

COMMIT;
