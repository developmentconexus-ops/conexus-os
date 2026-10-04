const parenthesized = (type) => (/ [|&] /.test(type) ? `(${type})` : type)

export function toTypeScript(schema) {
  if (!schema) return 'unknown'
  if (schema.oneOf) return schema.oneOf.map(toTypeScript).join(' | ')
  if (schema.anyOf) return schema.anyOf.map(toTypeScript).join(' | ')
  if (schema.allOf) return schema.allOf.map(toTypeScript).join(' & ')
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum.map((value) => JSON.stringify(value)).join(' | ')
  if (Object.hasOwn(schema, 'const')) return JSON.stringify(schema.const)
  if (Array.isArray(schema.type)) return schema.type.map((type) => toTypeScript({ ...schema, type })).join(' | ')
  if (schema.type === 'array') return `${parenthesized(toTypeScript(schema.items))}[]`
  if (schema.type === 'string') return 'string'
  if (schema.type === 'integer' || schema.type === 'number') return 'number'
  if (schema.type === 'boolean') return 'boolean'
  if (schema.type === 'null') return 'null'
  if (schema.type === 'object' || schema.properties) {
    const required = new Set(schema.required ?? [])
    const members = Object.entries(schema.properties ?? {}).map(([name, property]) => `${JSON.stringify(name)}${required.has(name) ? '' : '?'}: ${toTypeScript(property)}`)
    if (schema.additionalProperties && typeof schema.additionalProperties === 'object') members.push(`[key: string]: ${toTypeScript(schema.additionalProperties)}`)
    else if (schema.additionalProperties === true) members.push('[key: string]: unknown')
    return `{ ${members.join('; ')} }`
  }
  return 'unknown'
}
