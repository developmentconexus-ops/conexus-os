import pg from 'pg'
import type { Pool, PoolConfig } from 'pg'

export type PostgresPool = Pool
export type PostgresConnection = PoolConfig

export const createPostgresPool = (connection: PostgresConnection): PostgresPool => new pg.Pool({
  ...connection,
  max: 6,
  connectionTimeoutMillis: 5000,
})
