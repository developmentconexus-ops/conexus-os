import { createHash, randomBytes } from 'node:crypto'
import type { BinaryLike } from 'node:crypto'
import { Failure } from './failure.js'

const OPAQUE = /^[A-Za-z0-9_-]{43}$/

export type OpaqueToken = string & { readonly __brand: 'OpaqueToken' }

const isOpaqueToken = (value: unknown): value is OpaqueToken => typeof value === 'string' && OPAQUE.test(value)

export const opaqueToken = (): OpaqueToken => {
  const minted = randomBytes(32).toString('base64url')
  if (!isOpaqueToken(minted)) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'OPAQUE_TOKEN_SHAPE' } })
  return minted
}

/** A value in the one shape opaqueToken mints, or null. */
export const parseOpaqueToken = (value: unknown): OpaqueToken | null => isOpaqueToken(value) ? value : null

/** SHA-256: what the database stores for an opaque token, and the content digest of a file. */
export const digest = (value: BinaryLike): Buffer => createHash('sha256').update(value).digest()
