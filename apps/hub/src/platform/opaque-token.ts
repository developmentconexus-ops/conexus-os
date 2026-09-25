import { createHash, randomBytes } from 'node:crypto'
import type { BinaryLike } from 'node:crypto'

const OPAQUE = /^[A-Za-z0-9_-]{43}$/

/**
 * A server-minted secret the browser carries (a session, a CSRF token, a handoff, a sign-in binding): 32
 * random bytes, base64url. Only its digest is ever stored.
 */
export const opaqueToken = (): string => randomBytes(32).toString('base64url')

/** A value in the one shape opaqueToken mints, or null. */
export const parseOpaqueToken = (value: unknown): string | null => typeof value === 'string' && OPAQUE.test(value) ? value : null

/** SHA-256: what the database stores for an opaque token, and the content digest of a file. */
export const digest = (value: BinaryLike): Buffer => createHash('sha256').update(value).digest()
