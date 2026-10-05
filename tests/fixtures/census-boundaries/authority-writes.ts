declare const sql: (parts: TemplateStringsArray, ...values: unknown[]) => unknown
declare const id: string

export const reads = sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${id}`
export const inserts = sql`INSERT INTO iam.workspace_membership (account_id) VALUES (${id})`
export const updates = sql`UPDATE iam.workspace_membership SET role = 'owner' WHERE account_id = ${id}`
export const deletes = sql`delete
  from "iam"."workspace_membership" where account_id = ${id}`
export const inCte = sql`WITH moved AS (INSERT INTO iam.workspace_membership (account_id) VALUES (${id}) RETURNING 1) SELECT 1 FROM moved`
export const otherTable = sql`UPDATE iam.account SET active = false WHERE account_id = ${id}`
declare const name: string

export const tombstoneInsert = sql`INSERT INTO project.project_deletion (project_id) VALUES (${id})`
export const tombstoneUpdate = sql`UPDATE project.project_deletion SET purged_at = now() WHERE project_id = ${id}`
export const tombstoneDelete = sql`DELETE FROM project.project_deletion WHERE project_id = ${id}`
export const tombstoneRead = sql`SELECT project_id FROM project.project_deletion WHERE project_id = ${id}`
export const projectDelete = sql`DELETE FROM project.project WHERE project_id = ${id}`
export const projectUpdate = sql`UPDATE project.project SET name = ${name} WHERE project_id = ${id}`
export const projectInsert = sql`INSERT INTO project.project (project_id) VALUES (${id})`
export const receiptDelete = sql`DELETE FROM platform.operation_receipt WHERE resource_id = ${id}`
export const receiptInsert = sql`INSERT INTO platform.operation_receipt (resource_id) VALUES (${id})`
export const receiptUpdate = sql`UPDATE platform.operation_receipt SET state = 'done' WHERE resource_id = ${id}`
export const receiptMerge = sql`MERGE INTO platform.operation_receipt USING iam.account AS other ON true WHEN MATCHED THEN DELETE`
export const onlyUpdate = sql`UPDATE ONLY iam.workspace_membership SET role = 'owner' WHERE account_id = ${id}`
export const onlyDelete = sql`DELETE FROM ONLY project.project WHERE project_id = ${id}`
export const commentedDelete = sql`DELETE FROM /* x */ project.project WHERE project_id = ${id}`
export const commentedVerb = sql`DELETE /* x */ FROM project.project -- y
  WHERE project_id = ${id}`
