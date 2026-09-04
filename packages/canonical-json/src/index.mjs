import { createHash } from 'node:crypto'
import canonicalize from 'canonicalize'

export const canonicalBytes = (value) => {
  const canonical = canonicalize(value)
  if (typeof canonical !== 'string') throw new TypeError('canonicalizer returned no string')
  return Buffer.from(canonical, 'utf8')
}

export const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex')
