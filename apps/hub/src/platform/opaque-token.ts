import { createHash, randomBytes } from 'node:crypto'
import type { BinaryLike } from 'node:crypto'
import { RawToken } from './db.js'
import { Failure } from './failure.js'

const OPAQUE = /^[A-Za-z0-9_-]{43}$/

type OpaqueToken = string & { readonly __brand: 'OpaqueToken' }

const isOpaqueToken = (value: unknown): value is OpaqueToken => typeof value === 'string' && OPAQUE.test(value)

const opaqueToken = (): OpaqueToken => {
  const minted = randomBytes(32).toString('base64url')
  if (!isOpaqueToken(minted)) throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'OPAQUE_TOKEN_SHAPE' } })
  return minted
}

/** A credential a browser presented, in the one shape the Hub mints, as the RawToken only db.ts digests. */
export const presentedToken = (value: unknown): RawToken | null => isOpaqueToken(value) ? RawToken.parse(value) : null

/** A new credential: its raw form goes to the browser, its digest to the database. */
export const mintToken = (): RawToken => RawToken.parse(opaqueToken())

/** SHA-256 of content: a served file is checked against it. A credential is digested only by db.ts. */
export const digest = (value: BinaryLike): Buffer => createHash('sha256').update(value).digest()
