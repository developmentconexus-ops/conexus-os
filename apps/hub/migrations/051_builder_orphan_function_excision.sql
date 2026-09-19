BEGIN;

SET LOCAL ROLE builder_owner;

DROP FUNCTION builder.admit_application_source(uuid, uuid, uuid, text);
DROP FUNCTION builder.bind_sandbox(uuid, uuid, text);
DROP FUNCTION builder.claim_change(uuid, uuid, uuid, text, text, text);
DROP FUNCTION builder.claim_correction(uuid, uuid, uuid, uuid, text, text, text);
DROP FUNCTION builder.claim_verification(uuid, uuid, uuid, text, text, text);
DROP FUNCTION builder.close_finding(uuid, uuid, uuid, uuid, uuid, uuid[]);
DROP FUNCTION builder.create_change(uuid, uuid, text, text, uuid, uuid, uuid, uuid, uuid, text, text);
DROP FUNCTION builder.fail_run(uuid, uuid);
DROP FUNCTION builder.fail_verification(uuid, uuid, text);
DROP FUNCTION builder.fail_verification_claim(uuid);
DROP FUNCTION builder.get_evidence(uuid, uuid, uuid, uuid);
DROP FUNCTION builder.get_finding(uuid, uuid, uuid, uuid);
DROP FUNCTION builder.list_changes(uuid, uuid);
DROP FUNCTION builder.list_evidence(uuid, uuid, uuid);
DROP FUNCTION builder.list_findings(uuid, uuid, uuid);
DROP FUNCTION builder.read_snapshot(uuid, uuid, uuid, boolean);
DROP FUNCTION builder.recover_and_list_queued();
DROP FUNCTION builder.settle_preparation(uuid, uuid, uuid, text, uuid, text, text);
DROP FUNCTION builder.settle_response(uuid, uuid, text, text);
DROP FUNCTION builder.settle_result(uuid, uuid, text, text, text, text, text);
DROP FUNCTION builder.settle_verification(uuid, uuid, text, text, uuid, uuid, text, text, text, uuid, uuid[], uuid[], text, jsonb);

SET LOCAL ROLE iam_owner;

DROP FUNCTION iam.admit_project_review(uuid, uuid);

RESET ROLE;
COMMIT;
