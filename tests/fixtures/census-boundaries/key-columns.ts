declare const sql: (parts: TemplateStringsArray, ...values: unknown[]) => unknown
declare const id: string
declare const ids: string[]
declare const name: string

export const clean = [
  sql`DELETE FROM project.project WHERE project_id = ${id}`,
  sql`UPDATE project.project AS p SET name = ${name} WHERE p.workspace_id = ${id} AND p.archived = false`,
  sql`DELETE FROM project.project WHERE project_id = ANY(${ids})`,
  sql`DELETE FROM project.project WHERE project_id IN (SELECT project_id FROM iam.application)`,
  sql`UPDATE iam.account SET active = false WHERE account_id = ${id}`,
  sql`DELETE FROM iam.application_grant WHERE revoked_at IS NULL`,
  sql`UPDATE "project"."project" SET name = ${name} WHERE "project_id" = ${id}`,
  sql`WITH gone AS (DELETE FROM project.project WHERE workspace_id = ${id} RETURNING 1) SELECT 1 FROM gone`,
]

export const byFlagOnly = sql`DELETE FROM project.project WHERE archived = true`
export const byNameOnly = sql`UPDATE project.project SET name = ${name} WHERE name = ${name}`
export const byLiteral = sql`DELETE FROM project.project WHERE project_id = 'x'`
export const byOtherTable = sql`DELETE FROM project.project WHERE EXISTS (SELECT 1 FROM iam.account WHERE account_id = ${id})`
export const byRange = sql`DELETE FROM project.project WHERE project_id > ${id}`
export const inCte = sql`WITH gone AS (DELETE FROM project.project WHERE archived = true RETURNING 1) SELECT 1 FROM gone`
export const accountByRole = sql`UPDATE iam.account SET active = false WHERE active = true`
