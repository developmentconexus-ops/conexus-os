import assert from 'node:assert/strict'
import { test } from 'node:test'
import { shape } from '../../scripts/diff-shape.mjs'

test('shape counts changed lines by kind and skips binary files', () => {
  const numstat = [
    '2\t1\ttests/repository/diff-shape.test.mjs',
    '3\t4\tapps/web/src/example.test.tsx',
    '5\t2\tdb/migrations/0001.sql',
    '7\t3\tapps/web/src/routes.generated.ts',
    '11\t6\tcontracts/api.ts',
    '13\t8\tdocs/guide.md',
    '17\t9\tAGENTS.md',
    '19\t10\tapps/web/src/main.tsx',
    '-\t-\tassets/logo.png',
  ].join('\n')

  assert.deepEqual(shape(numstat), {
    tests: { added: 5, deleted: 5 },
    sql: { added: 5, deleted: 2 },
    generated: { added: 18, deleted: 9 },
    docs: { added: 30, deleted: 17 },
    product: { added: 19, deleted: 10 },
  })
})
