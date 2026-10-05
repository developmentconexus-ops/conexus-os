declare const sql: (parts: TemplateStringsArray, ...values: unknown[]) => unknown
declare const id: string
declare const filter: unknown

export const clean = [
  sql`UPDATE iam.account SET active = false WHERE account_id = ${id}`,
  sql`DELETE FROM project.project WHERE project_id = ${id} AND workspace_id = ${id}`,
  sql`INSERT INTO iam.account (account_id) VALUES (${id}) ON CONFLICT (account_id) DO UPDATE SET active = true WHERE iam.account.account_id = ${id}`,
  sql`INSERT INTO iam.account (account_id) VALUES (${id}) ON CONFLICT DO NOTHING`,
  sql`WITH gone AS (DELETE FROM project.project WHERE project_id = ${id} RETURNING 1) SELECT 1 FROM gone`,
  sql`SELECT 1 /* delete from x */ -- update y`,
]

export const noWhere = sql`UPDATE iam.account SET active = false`
export const deleteAll = sql`DELETE FROM project.project`
export const upperCase = sql`Delete From project.project`
export const spaced = sql`delete
  from project.project`
export const constantTrue = sql`DELETE FROM project.project WHERE true`
export const constantEquality = sql`UPDATE iam.account SET active = false WHERE 1 = 1`
export const constantDisjunct = sql`UPDATE iam.account SET active = false WHERE account_id = ${id} OR true`
export const wholeFilterInterpolated = sql`DELETE FROM project.project WHERE ${filter}`
export const whereInterpolated = sql`DELETE FROM project.project ${filter}`
export const whereOnlyInSubquery = sql`DELETE FROM project.project USING (SELECT 1 FROM iam.account WHERE account_id = ${id}) AS found`
export const inCte = sql`WITH gone AS (DELETE FROM project.project RETURNING 1) SELECT 1 FROM gone`
export const afterCte = sql`WITH one AS (SELECT 1) UPDATE iam.account SET active = false`
export const merge = sql`MERGE INTO iam.account USING iam.account AS other ON true WHEN MATCHED THEN DELETE`
export const upsertWithoutWhere = sql`INSERT INTO iam.account (account_id) VALUES (${id}) ON CONFLICT (account_id) DO UPDATE SET active = true`
export const afterSemicolon = sql`SELECT 1; DELETE FROM project.project`
export const commentedWhere = sql`DELETE FROM project.project /* where project_id = 1 */`
