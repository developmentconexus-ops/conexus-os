import assert from 'node:assert/strict'

/** A matcher for assert.throws and assert.rejects: a Failure of this row whose details are exactly these. */
export const failureOf = (id, details = {}) => (error) => {
  assert.equal(error?.id, id)
  assert.deepEqual({ ...error.details }, details)
  return true
}

export const invalidConfig = (name) => failureOf('CONFIG_INVALID', { name })
export const invariant = (name, more = {}) => failureOf('INTERNAL_UNEXPECTED', { invariant: name, ...more })
