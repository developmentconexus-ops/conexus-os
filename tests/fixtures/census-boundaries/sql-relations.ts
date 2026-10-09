import { sql as statement } from '../../../apps/hub/src/platform/db.js'
import * as data from '../../../apps/hub/src/platform/db.js'

export const owned = () => statement`SELECT * FROM project.project`
export const quoted = () => statement`SELECT * FROM "iam"."account"`
const local = statement
const { sql: destructured } = data
export const localAlias = () => local`SELECT * FROM iam.account`
export const destructuredAlias = () => destructured`SELECT * FROM iam.account`
// biome-ignore lint/performance/noDynamicNamespaceImportAccess: bracket access is a boundary census control
// biome-ignore lint/complexity/useLiteralKeys: bracket access is a boundary census control
export const bracketAlias = () => data['sql']`SELECT * FROM iam.account`
export const aliased = () => data.sql`SELECT * FROM iam.account`
export const nested = () => statement`SELECT * FROM project.project WHERE EXISTS (SELECT 1 FROM iam.account)`
export const foreignWrite = () => statement`UPDATE iam.account SET active = false WHERE account_id = ${'synthetic'}`
export const unknown = () => statement`SELECT * FROM project.unregistered`
export const unknownSchema = () => statement`SELECT * FROM unknown.project`
export const unqualified = () => statement`SELECT * FROM project`
export const cte = () => statement`WITH owned AS (SELECT * FROM project.project) SELECT * FROM owned`
export const nestedCte = () => statement`WITH owned AS (SELECT * FROM project.project) SELECT * FROM owned WHERE EXISTS (WITH foreign_row AS (SELECT * FROM iam.account) SELECT 1 FROM foreign_row)`
export const cteScope = () => statement`WITH owned AS (SELECT * FROM project.project) SELECT * FROM owned; SELECT * FROM owned`
export const comment = () => statement`SELECT * FROM project.project /* JOIN iam.account */ -- FROM iam.account
  WHERE name <> 'FROM iam.account'`
export const quotedCase = () => statement`SELECT * FROM "IAM"."account"`
export const extract = () => statement`SELECT extract(epoch FROM created_at) FROM project.project`
export const dynamic = (table: string) => statement`SELECT * FROM ${table}`
export const dynamicQuoted = (table: string) => statement`SELECT * FROM "project"."${table}"`
export const dynamicJoin = (table: string) => statement`SELECT * FROM project.project JOIN ${table} ON true`
export const dynamicComma = (table: string) => statement`SELECT * FROM project.project, ${table}`
export const dynamicFragment = () => statement`SELECT * FROM ${statement`project.project`}`
export const dynamicFunction = (table: string) => statement`SELECT * FROM ${table}()`
export const lockAlias = () => statement`SELECT * FROM project.project AS stored FOR SHARE OF stored`
export const predicate = () => statement`EXISTS (SELECT 1 FROM project.project WHERE project_id = ${'synthetic'})`
export const composed = () => statement`SELECT * FROM iam.account WHERE ${predicate()}`
export const parameter = (id: string) => statement`SELECT * FROM project.project WHERE project_id = ${id}`
