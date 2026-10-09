import { sql } from '../../../apps/hub/src/platform/db.js'

export const into = () => sql`SELECT * INTO iam.account FROM project.project`
export const insert = () => sql`INSERT INTO iam.account SELECT * FROM project.project`
export const update = () => sql`UPDATE iam.account SET active = false WHERE account_id = ${'synthetic'}`
export const remove = () => sql`DELETE FROM iam.account WHERE account_id = ${'synthetic'}`
export const merge = () => sql`MERGE INTO iam.account AS target USING project.project AS source ON target.account_id = source.project_id WHEN MATCHED THEN DELETE`
export const cteWrite = () => sql`WITH changed AS (DELETE FROM iam.account WHERE account_id = ${'synthetic'} RETURNING *) SELECT * FROM changed`
export const truncate = () => sql`TRUNCATE TABLE iam.account`
export const lock = () => sql`LOCK TABLE iam.account IN ACCESS EXCLUSIVE MODE`
export const createAs = () => sql`CREATE TABLE iam.account AS SELECT * FROM project.project`
export const copy = () => sql`COPY iam.account TO STDOUT`
export const ownInto = () => sql`SELECT * INTO project.project FROM project.project`
export const authorizedProjectLock = () => sql`SELECT stored.project_id FROM project.project AS stored
  WHERE stored.project_id = ${'synthetic'} AND NOT EXISTS (SELECT 1 FROM project.project_deletion AS deletion WHERE deletion.project_id = stored.project_id)
  FOR SHARE OF stored`
export const authorizedRunLock = () => sql`SELECT builder_run_id FROM builder.builder_run WHERE builder_run_id = ${'synthetic'} FOR UPDATE`
export const registryPointer = () => sql`SELECT * FROM builder.project_working_state WHERE project_id = ${'synthetic'}`
export const registryRetention = () => sql`SELECT * FROM builder.builder_run WHERE project_id = ${'synthetic'}`

export const nonrecursive = () => sql`WITH project AS (SELECT * FROM project) SELECT * FROM project`
export const forward = () => sql`WITH first AS (SELECT * FROM later), later AS (SELECT * FROM project.project) SELECT * FROM first`
export const earlier = () => sql`WITH first AS (SELECT * FROM project.project), later AS (SELECT * FROM first) SELECT * FROM later`
export const recursive = () => sql`WITH RECURSIVE project AS (SELECT 1 UNION ALL SELECT 1 FROM project) SELECT * FROM project`
export const recursiveForward = () => sql`WITH RECURSIVE first AS (SELECT * FROM later), later AS (SELECT * FROM project.project) SELECT * FROM first`
export const outer = () => sql`WITH project AS (SELECT * FROM project.project) SELECT * FROM project WHERE EXISTS (WITH project AS (SELECT * FROM project) SELECT 1 FROM project)`
export const nestedHidden = () => sql`SELECT 1 WHERE EXISTS (WITH project AS (SELECT * FROM project) SELECT 1 FROM project)`
export const siblingScope = () => sql`SELECT 1 WHERE EXISTS (WITH hidden AS (SELECT * FROM project.project) SELECT 1 FROM hidden) AND EXISTS (SELECT 1 FROM hidden)`
export const statementScope = () => sql`WITH project AS (SELECT * FROM project.project) SELECT * FROM project; SELECT * FROM project`
