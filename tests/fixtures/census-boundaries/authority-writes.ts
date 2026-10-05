declare const sql: (parts: TemplateStringsArray, ...values: unknown[]) => unknown
declare const id: string

export const reads = sql`SELECT role FROM iam.workspace_membership WHERE account_id = ${id}`
export const inserts = sql`INSERT INTO iam.workspace_membership (account_id) VALUES (${id})`
export const updates = sql`UPDATE iam.workspace_membership SET role = 'owner' WHERE account_id = ${id}`
export const deletes = sql`delete
  from "iam"."workspace_membership" where account_id = ${id}`
export const inCte = sql`WITH moved AS (INSERT INTO iam.workspace_membership (account_id) VALUES (${id}) RETURNING 1) SELECT 1 FROM moved`
export const otherTable = sql`UPDATE iam.account SET active = false WHERE account_id = ${id}`
