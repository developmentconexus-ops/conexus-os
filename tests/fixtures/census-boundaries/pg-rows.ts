import type { Pool, PoolClient, QueryResultRow } from 'pg'

declare const pool: Pool
declare const client: PoolClient

export const direct = async () => (await pool.query<{ id: string }>('SELECT 1 AS id')).rows

export const renamed = () => {
  const run = pool.query.bind(pool)
  return run('SELECT 1')
}

export const wrapper = async <T extends QueryResultRow>(text: string) => (await client.query<T>(text)).rows

export const destructured = () => {
  const { query } = pool
  return query.call(pool, 'SELECT 1')
}

export const discarded = async () => {
  await client.query('COMMIT')
}

type Tx = { rows: (text: string) => Promise<readonly unknown[]> }
declare const tx: Tx
export const throughSchema = () => tx.rows('SELECT 1')
