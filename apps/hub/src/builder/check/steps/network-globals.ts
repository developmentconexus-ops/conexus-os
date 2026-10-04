import { NETWORK_GLOBALS } from '../../../app-runner/server-manifest.js'

// biome-ignore lint/suspicious/noExplicitAny: the parser's ESTree nodes are walked structurally
type AstNode = { type: string } & Record<string, any>
type Scope = { parent: Scope | null; isFunction: boolean; names: Set<string> }

const isNode = (value: unknown): value is AstNode => typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string'

const bindingNames = (pattern: AstNode | null | undefined, names: Set<string>): void => {
  if (!pattern) return
  if (pattern.type === 'Identifier') names.add(pattern.name)
  else if (pattern.type === 'ObjectPattern') for (const property of pattern.properties) bindingNames(property.type === 'RestElement' ? property.argument : property.value, names)
  else if (pattern.type === 'ArrayPattern') for (const element of pattern.elements) bindingNames(element, names)
  else if (pattern.type === 'AssignmentPattern') bindingNames(pattern.left, names)
  else if (pattern.type === 'RestElement') bindingNames(pattern.argument, names)
}
const GLOBAL_OBJECTS = ['globalThis', 'self', 'global', 'window']
const BLOCK_SCOPES = ['BlockStatement', 'ForStatement', 'ForInStatement', 'ForOfStatement', 'SwitchStatement', 'StaticBlock']

const scopeIn = (parent: Scope | null, isFunction: boolean): Scope => ({ parent, isFunction, names: new Set() })
const functionScope = (scope: Scope): Scope => {
  let current = scope
  while (!current.isFunction && current.parent) current = current.parent
  return current
}
const bound = (name: string, scope: Scope | null): boolean => {
  for (let current = scope; current; current = current.parent) if (current.names.has(name)) return true
  return false
}

/**
 * A handler has no network. The sandbox enforces that; this names the global the Builder reached
 * for while it can still change it. Each reference resolves through its own scope chain, so a local
 * named fetch or a property read obj.fetch is never refused, and a local fetch in one function does
 * not hide a bare global fetch in another.
 */
export const networkGlobal = (program: unknown): string | undefined => {
  const references: { name: string; scope: Scope; shown: string }[] = []
  const visit = (node: unknown, parent: AstNode | null, key: string | null, scope: Scope): void => {
    if (Array.isArray(node)) { for (const child of node) visit(child, parent, key, scope); return }
    if (!isNode(node)) return
    let inner = scope
    switch (node.type) {
      case 'VariableDeclaration': {
        const target = node.kind === 'var' ? functionScope(scope) : scope
        for (const declarator of node.declarations) bindingNames(declarator.id, target.names)
        break
      }
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression':
        inner = scopeIn(scope, true)
        if (node.id) (node.type === 'FunctionDeclaration' ? scope : inner).names.add(node.id.name)
        for (const param of node.params) bindingNames(param, inner.names)
        break
      case 'ClassDeclaration': if (node.id) scope.names.add(node.id.name); break
      case 'ClassExpression': if (node.id) { inner = scopeIn(scope, false); inner.names.add(node.id.name) } break
      case 'CatchClause': inner = scopeIn(scope, false); bindingNames(node.param, inner.names); break
      case 'ImportSpecifier': case 'ImportDefaultSpecifier': case 'ImportNamespaceSpecifier': scope.names.add(node.local.name); break
      case 'Identifier': {
        const notReference = (key === 'property' && parent?.type === 'MemberExpression' && !parent.computed) ||
          (key === 'key' && parent && !parent.computed && ['Property', 'MethodDefinition', 'PropertyDefinition'].includes(parent.type) && !(parent.shorthand && parent.value === node)) ||
          key === 'label' || parent?.type?.endsWith('Specifier')
        if (!notReference && NETWORK_GLOBALS.includes(node.name)) references.push({ name: node.name, scope, shown: node.name })
        break
      }
      case 'MemberExpression': {
        const property = node.computed ? (node.property.type === 'Literal' ? node.property.value : null) : node.property.name
        if (node.object.type === 'Identifier' && GLOBAL_OBJECTS.includes(node.object.name) && NETWORK_GLOBALS.includes(property)) {
          references.push({ name: node.object.name, scope, shown: `${node.object.name}.${property}` })
        }
        break
      }
      default: if (BLOCK_SCOPES.includes(node.type)) inner = scopeIn(scope, false)
    }
    for (const [childKey, child] of Object.entries(node)) if (child && typeof child === 'object') visit(child, node, childKey, inner)
  }
  visit(program, null, null, scopeIn(null, true))
  return references.find((reference) => !bound(reference.name, reference.scope))?.shown
}
