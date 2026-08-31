import { createHash } from 'node:crypto'
import { parseTree } from 'jsonc-parser'
import canonicalize from 'canonicalize'
import Ajv2020 from 'ajv/dist/2020.js'
import addFormats from 'ajv-formats'

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER)
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER)
const compareCodeUnits = (a, b) => a < b ? -1 : a > b ? 1 : 0

export class AdmissionError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'AdmissionError'
    this.code = code
  }
}

const fail = (code, message) => { throw new AdmissionError(code, message) }

const assertPairedSurrogates = (value, path) => {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (!(next >= 0xDC00 && next <= 0xDFFF)) fail('LONE_SURROGATE', `unpaired high surrogate at ${path}`)
      index += 1
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      fail('LONE_SURROGATE', `unpaired low surrogate at ${path}`)
    }
  }
}

const visit = (node, text, path = '$') => {
  if (node.type === 'object') {
    const seen = new Set()
    for (const property of node.children ?? []) {
      const keyNode = property.children?.[0]
      const valueNode = property.children?.[1]
      const key = keyNode?.value
      if (typeof key !== 'string' || !valueNode) fail('INVALID_TREE', `invalid property at ${path}`)
      assertPairedSurrogates(key, `${path}.<key>`)
      if (seen.has(key)) fail('DUPLICATE_KEY', `duplicate key ${JSON.stringify(key)} at ${path}`)
      seen.add(key)
      visit(valueNode, text, `${path}.${key}`)
    }
  } else if (node.type === 'array') {
    for (const [index, child] of (node.children ?? []).entries()) visit(child, text, `${path}[${index}]`)
  } else if (node.type === 'string') {
    assertPairedSurrogates(node.value, path)
  } else if (node.type === 'number') {
    const raw = text.slice(node.offset, node.offset + node.length)
    if (/[.eE]/.test(raw)) fail('FLOAT_FORBIDDEN', `floating number at ${path}`)
    let integer
    try { integer = BigInt(raw) } catch { fail('INVALID_NUMBER', `invalid number at ${path}`) }
    if (integer < MIN_SAFE || integer > MAX_SAFE) fail('UNSAFE_INTEGER', `unsafe integer at ${path}`)
  }
}

export const createValidator = schema => {
  const ajv = new Ajv2020({
    allErrors: true,
    strict: true,
    coerceTypes: false,
    useDefaults: false,
    removeAdditional: false,
  })
  addFormats(ajv)
  return ajv.compile(schema)
}

export const canonicalBytes = value => {
  const canonical = canonicalize(value)
  if (typeof canonical !== 'string') fail('CANONICALIZATION_FAILED', 'canonicalizer returned no string')
  return Buffer.from(canonical, 'utf8')
}

export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

export const admitJsonBytes = (bytes, validate) => {
  const input = Buffer.from(bytes)
  if (input.length >= 3 && input[0] === 0xEF && input[1] === 0xBB && input[2] === 0xBF) {
    fail('BOM_FORBIDDEN', 'UTF-8 BOM is forbidden')
  }
  let text
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(input)
  } catch {
    fail('INVALID_UTF8', 'input is not valid UTF-8')
  }
  const errors = []
  const tree = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true })
  if (!tree || errors.length) fail('INVALID_JSON', `strict JSON parse failed (${errors.map(error => error.error).join(',')})`)
  visit(tree, text)
  let value
  try { value = JSON.parse(text) } catch { fail('INVALID_JSON', 'JSON.parse rejected input') }
  const before = JSON.stringify(value)
  if (!validate(value)) {
    const diagnostics = (validate.errors ?? []).map(error => `${error.instancePath || '$'}:${error.keyword}`).sort(compareCodeUnits)
    fail('SCHEMA_VIOLATION', diagnostics.join(','))
  }
  if (JSON.stringify(value) !== before) fail('VALIDATOR_MUTATION', 'schema validator mutated admitted input')
  const canonical = canonicalBytes(value)
  return { value, canonical, digest: sha256(canonical) }
}
