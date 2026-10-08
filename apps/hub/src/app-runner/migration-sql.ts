import type { Result } from '@conexus/contract'
import { loadModule, parseSync, SqlError } from 'libpg-query'
import { z } from 'zod'

export type MigrationSource = Readonly<{ name: string; sha256: string; sql: string }>
export type MigrationFailure = Readonly<{ code: 'APPLICATION_MIGRATION_FAILED'; migration: string | null; cause: unknown }>

const rawTree = z.object({
  version: z.number().int().min(170000).max(179999),
  stmts: z.array(z.object({
    stmt: z.record(z.string(), z.unknown()).refine((node) => Object.keys(node).length === 1),
  })),
})

class MigrationSqlError extends Error {
  constructor(readonly reason: 'TRANSACTION_CONTROL' | 'NUL_BYTE') {
    super(reason)
  }
}

export async function validateMigrationBatch(migrations: readonly MigrationSource[]): Promise<Result<void, MigrationFailure>> {
  await loadModule()
  for (const migration of migrations) {
    try {
      // The native parser accepts a C string and would truncate the file at this byte.
      if (migration.sql.includes('\0')) throw new MigrationSqlError('NUL_BYTE')
      if (migration.sql.trim() === '') continue
      const tree = rawTree.parse(parseSync(migration.sql))
      if (tree.stmts.some(({ stmt }) => Object.hasOwn(stmt, 'TransactionStmt'))) throw new MigrationSqlError('TRANSACTION_CONTROL')
    } catch (cause) {
      if (!(cause instanceof SqlError || cause instanceof MigrationSqlError)) throw cause
      return Object.freeze({ ok: false, error: Object.freeze({ code: 'APPLICATION_MIGRATION_FAILED' as const, migration: migration.name, cause }) })
    }
  }
  return Object.freeze({ ok: true, result: undefined })
}
