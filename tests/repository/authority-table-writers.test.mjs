import assert from 'node:assert/strict'
import { globSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const root = resolve(import.meta.dirname, '../..')

// Part 6 adds iam.installation_administrator and iam.application_grant to this table.
const WRITERS = Object.freeze({
  'iam.workspace_membership': ['apps/hub/src/identity-access/admission.ts'],
})

const writeOf = (table) => new RegExp(`\\b(?:INSERT\\s+INTO|UPDATE|DELETE\\s+FROM|MERGE\\s+INTO)\\s+${table.replace('.', '\\.')}\\b`, 'i')

const offenders = (sources) => Object.entries(WRITERS).flatMap(([table, allowed]) =>
  Object.entries(sources).filter(([file, text]) => writeOf(table).test(text) && !allowed.includes(file)).map(([file]) => `${file} writes ${table}`))

test('a statement that writes an authority table outside its owning module is reported', () => {
  const guilty = {
    'apps/hub/src/project/store.ts': "sql`UPDATE iam.workspace_membership SET role = 'owner'`",
    'apps/hub/src/workspace/store.ts': 'sql`DELETE FROM iam.workspace_membership WHERE true`',
    'apps/hub/src/builder/store.ts': 'sql`WITH x AS (INSERT INTO iam.workspace_membership (account_id) VALUES (1) RETURNING 1) SELECT 1`',
    'apps/hub/src/identity-access/admission.ts': 'sql`INSERT INTO iam.workspace_membership (account_id) VALUES (1)`',
    'apps/hub/src/project/reader.ts': 'sql`SELECT role FROM iam.workspace_membership`',
  }
  assert.deepEqual(offenders(guilty), [
    'apps/hub/src/project/store.ts writes iam.workspace_membership',
    'apps/hub/src/workspace/store.ts writes iam.workspace_membership',
    'apps/hub/src/builder/store.ts writes iam.workspace_membership',
  ])
})

test('only the modules that own an authority table write it', () => {
  const sources = Object.fromEntries(globSync('apps/hub/src/**/*.ts', { cwd: root }).map((file) => [file, readFileSync(resolve(root, file), 'utf8')]))
  assert.deepEqual(offenders(sources), [])
  const admission = sources['apps/hub/src/identity-access/admission.ts']
  assert.equal(admission?.match(/INSERT\s+INTO\s+iam\.workspace_membership/gi)?.length, 1)
})
