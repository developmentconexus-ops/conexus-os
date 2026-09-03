import { existsSync, lstatSync, readFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import Ajv2020 from 'ajv/dist/2020.js'
import { parseTree } from 'jsonc-parser'
import { sha256, verifyBootstrap } from './check-r1-a0-bootstrap.mjs'

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const planPath = resolve(repositoryRoot, 'profiles/r1/v1/a0-code-architecture-migration.json')
const schemaPath = resolve(repositoryRoot, 'packages/profile-compiler/schemas/a0-code-architecture-migration.schema.json')
const parts = ['A0-P1', 'A0-P2', 'A0-P3', 'A0-P4', 'A0-P5']

const fail = (code, detail = '') => {
  throw new Error(`${code}${detail ? `:${detail}` : ''}`)
}

const strictJson = (path) => {
  const bytes = readFileSync(path)
  if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) fail('A0_JSON_BOM_REFUSED', path)
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  const errors = []
  const root = parseTree(text, errors, { allowTrailingComma: false, disallowComments: true })
  if (!root || errors.length > 0) fail('A0_JSON_SYNTAX_REFUSED', path)
  const walk = (node) => {
    if (node.type === 'object') {
      const names = new Set()
      for (const property of node.children ?? []) {
        const name = property.children?.[0]?.value
        if (names.has(name)) fail('A0_JSON_DUPLICATE_KEY', `${path}:${name}`)
        names.add(name)
      }
    }
    for (const child of node.children ?? []) walk(child)
  }
  walk(root)
  return JSON.parse(text)
}

const pathKey = (path) => {
  if (path !== path.normalize('NFC') || path.startsWith('/') || path.includes(':') || path.includes('\\') || path.includes('\0') || path.split('/').includes('..')) fail('A0_UNSAFE_PATH', path)
  return path.toLocaleLowerCase('en-US')
}

const walkFiles = (root, relativeRoot, output) => {
  const absolute = resolve(root, ...relativeRoot.split('/'))
  if (!existsSync(absolute)) return
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink()) fail('A0_SYMLINK_REFUSED', relativeRoot)
  if (stat.isFile()) {
    output.push(relativeRoot)
    return
  }
  if (!stat.isDirectory()) fail('A0_ENTRY_REFUSED', relativeRoot)
  for (const name of readdirSync(absolute).sort()) walkFiles(root, `${relativeRoot}/${name}`, output)
}

const fileState = (path) => {
  const absolute = resolve(repositoryRoot, ...path.split('/'))
  if (!existsSync(absolute)) return 'ABSENT'
  const stat = lstatSync(absolute)
  if (stat.isSymbolicLink() || !stat.isFile()) fail('A0_IN_FLIGHT_ENTRY_REFUSED', path)
  return 'FILE'
}

const requireDigest = (path, expected) => {
  if (fileState(path) !== 'FILE') fail('A0_IN_FLIGHT_BASELINE_PATH_MISSING', path)
  const actual = sha256(readFileSync(resolve(repositoryRoot, ...path.split('/'))))
  if (actual !== expected) fail('A0_IN_FLIGHT_FUTURE_PATH_DRIFT', path)
}

export const validateMigrationPlan = ({ requireBaseline = true, currentPart } = {}) => {
  const plan = strictJson(planPath)
  const schema = strictJson(schemaPath)
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  const validate = ajv.compile(schema)
  if (!validate(plan)) fail('A0_SCHEMA_REFUSED', ajv.errorsText(validate.errors, { separator: '|' }))

  const disposition = new Map()
  const declare = (path, category) => {
    const key = pathKey(path)
    if (disposition.has(key)) fail('A0_PATH_MULTIPLE_DISPOSITIONS', `${path}:${disposition.get(key)}:${category}`)
    disposition.set(key, category)
  }
  for (const entry of plan.oldToNew) {
    if (entry.oldPath === entry.newPath) fail('A0_MOVE_SAME_PATH', entry.oldPath)
    if (entry.oldClass !== entry.newClass) fail('A0_CLASS_TRANSITION', `${entry.oldPath}:${entry.newPath}`)
    declare(entry.oldPath, 'oldToNew.old')
    declare(entry.newPath, 'oldToNew.new')
  }
  for (const [category, entries] of [
    ['changedPaths', plan.changedPaths],
    ['unchangedProtected', plan.unchangedProtected],
    ['adoptedExistingPaths', plan.adoptedExistingPaths],
    ['addedPaths', plan.addedPaths],
    ['removedPaths', plan.removedPaths],
    ['bootstrapPaths', plan.bootstrapPaths],
  ]) for (const entry of entries) declare(entry.path, category)
  for (const artifact of plan.controlArtifacts) declare(artifact.path, 'controlArtifacts')

  const transitions = new Map()
  for (const [category, entries] of [['changed', plan.changedPaths], ['adopted', plan.adoptedExistingPaths], ['added', plan.addedPaths], ['removed', plan.removedPaths]]) {
    for (const entry of entries) {
      if (!entry.transitionRef) continue
      const group = transitions.get(entry.transitionRef) ?? { input: 0, output: 0 }
      if (entry.transitionRole === 'INPUT' || entry.transitionRole === 'INPUT_OUTPUT') group.input += 1
      if (entry.transitionRole === 'OUTPUT' || entry.transitionRole === 'INPUT_OUTPUT') group.output += 1
      if (category === 'added' && entry.transitionRole !== 'OUTPUT') fail('A0_TRANSITION_ROLE_REFUSED', entry.path)
      if (category === 'removed' && entry.transitionRole !== 'INPUT') fail('A0_TRANSITION_ROLE_REFUSED', entry.path)
      transitions.set(entry.transitionRef, group)
    }
  }
  for (const [reference, group] of transitions) if (group.input === 0 || group.output === 0) fail('A0_TRANSITION_INCOMPLETE', reference)

  const windowedEntries = [...plan.oldToNew, ...plan.changedPaths, ...plan.adoptedExistingPaths, ...plan.addedPaths, ...plan.removedPaths]
  for (const entry of windowedEntries) {
    const indexes = entry.mutationWindows.map((part) => parts.indexOf(part))
    if (indexes.some((value, index) => index > 0 && value <= indexes[index - 1])) fail('A0_MUTATION_WINDOWS_ORDER_REFUSED', entry.oldPath ?? entry.path)
  }

  const scoped = []
  for (const root of plan.custodyScope.recursiveRoots) walkFiles(repositoryRoot, root, scoped)
  for (const path of plan.custodyScope.exactFiles) if (existsSync(resolve(repositoryRoot, ...path.split('/')))) scoped.push(path)
  for (const path of scoped) if (!disposition.has(pathKey(path)) && !plan.priorToolingPaths.some((entry) => pathKey(entry.path) === pathKey(path))) fail('A0_UNCLASSIFIED_PATH', path)

  const productDelta = plan.expectedProductDelta
  if (Object.values(productDelta).some((value) => Array.isArray(value) ? value.length !== 0 : value !== 0)) fail('A0_PRODUCT_DELTA_REFUSED')
  if (!requireBaseline) {
    const currentIndex = parts.indexOf(currentPart)
    if (currentIndex < 0) fail('A0_CURRENT_PART_REQUIRED')
    const isFuture = (entry) => parts.indexOf(entry.mutationWindows[0]) > currentIndex
    const isCurrentWindow = (entry) => entry.mutationWindows.includes(currentPart)
    const requireLastRecordedState = (path, entry) => {
      const lastWindowIndex = Math.max(...entry.mutationWindows.map((window) => parts.indexOf(window)).filter((index) => index < currentIndex))
      const lastPart = parts[lastWindowIndex]
      const record = strictJson(resolve(repositoryRoot, `runtime/r1/.conexus/${lastPart.toLowerCase()}-pass.json`))
      if (record.kind !== 'conexus.r1-a0-part-pass/v1' || record.part !== lastPart || record.verdict !== 'PASS') fail('A0_PRIOR_PART_PASS_REFUSED', lastPart)
      const expected = record.affectedPaths?.find((affected) => affected.path === path)
      if (!expected) fail('A0_PRIOR_PATH_STATE_MISSING', path)
      const absolute = resolve(repositoryRoot, ...path.split('/'))
      const actual = existsSync(absolute) ? sha256(readFileSync(absolute)) : null
      if (actual !== expected.digest) fail('A0_INTER_WINDOW_PATH_DRIFT', path)
    }
    for (const artifact of plan.controlArtifacts) {
      const publicationIndex = parts.indexOf(artifact.publicationPhase)
      if (publicationIndex > currentIndex && fileState(artifact.path) !== 'ABSENT') fail('A0_FUTURE_CONTROL_ARTIFACT_REFUSED', artifact.path)
      if (publicationIndex >= 0 && publicationIndex < currentIndex && fileState(artifact.path) !== 'FILE') fail('A0_PRIOR_CONTROL_ARTIFACT_MISSING', artifact.path)
      if (publicationIndex === currentIndex && artifact.kind === 'conexus.r1-a0-part-pass/v1' && fileState(artifact.path) !== 'ABSENT') fail('A0_CURRENT_PART_PASS_PREPLANTED', artifact.path)
    }
    for (const entry of plan.oldToNew) {
      if (isFuture(entry)) {
        requireDigest(entry.oldPath, entry.oldDigest)
        if (fileState(entry.newPath) !== 'ABSENT') fail('A0_IN_FLIGHT_FUTURE_PATH_DRIFT', entry.newPath)
        continue
      }
      if (!isCurrentWindow(entry)) {
        requireLastRecordedState(entry.oldPath, entry)
        requireLastRecordedState(entry.newPath, entry)
        continue
      }
      const states = [fileState(entry.oldPath), fileState(entry.newPath)]
      if (states.filter((state) => state === 'FILE').length !== 1) fail('A0_IN_FLIGHT_MOVE_REFUSED', `${entry.oldPath}:${entry.newPath}`)
    }
    for (const entry of plan.changedPaths) {
      if (isFuture(entry)) requireDigest(entry.path, entry.priorDigest)
      else if (!isCurrentWindow(entry)) requireLastRecordedState(entry.path, entry)
      else if (fileState(entry.path) !== 'FILE') fail('A0_IN_FLIGHT_REQUIRED_PATH_MISSING', entry.path)
    }
    for (const entry of plan.adoptedExistingPaths) {
      if (isFuture(entry)) requireDigest(entry.path, entry.preDigest)
      else if (!isCurrentWindow(entry)) requireLastRecordedState(entry.path, entry)
      else if (fileState(entry.path) !== 'FILE') fail('A0_IN_FLIGHT_REQUIRED_PATH_MISSING', entry.path)
    }
    for (const entry of plan.addedPaths) {
      if (isFuture(entry) && fileState(entry.path) !== 'ABSENT') fail('A0_IN_FLIGHT_FUTURE_PATH_DRIFT', entry.path)
      else if (!isFuture(entry) && !isCurrentWindow(entry)) requireLastRecordedState(entry.path, entry)
      else fileState(entry.path)
    }
    for (const entry of plan.removedPaths) {
      if (isFuture(entry)) requireDigest(entry.path, entry.priorDigest)
      else if (!isCurrentWindow(entry)) requireLastRecordedState(entry.path, entry)
      else fileState(entry.path)
    }
    const packageJson = strictJson(resolve(repositoryRoot, 'package.json'))
    const lock = strictJson(resolve(repositoryRoot, 'package-lock.json'))
    for (const target of plan.dependencyTargets) {
      const declared = packageJson.devDependencies?.[target.name]
      const locked = lock.packages?.[`node_modules/${target.name}`]
      const absent = declared === undefined && locked === undefined
      const exact = declared === target.version && locked?.version === target.version && locked?.integrity === target.integrity
      if (!absent && !exact) fail('A0_IN_FLIGHT_DEPENDENCY_REFUSED', target.name)
      if (currentIndex > 0 && !exact) fail('A0_IN_FLIGHT_DEPENDENCY_MISSING', target.name)
    }
  }
  const controlKeys = new Set(plan.controlArtifacts.map(({ path }) => pathKey(path)))
  const subjectPaths = new Set(scoped.map(pathKey).filter((path) => !controlKeys.has(path)))
  const bootstrap = verifyBootstrap({ requireBaseline, verifyPriorTooling: requireBaseline, requireValidation: !requireBaseline })
  return {
    verdict: 'PASS',
    planDigest: bootstrap.planDigest,
    ...(bootstrap.validationDigest ? { validationDigest: bootstrap.validationDigest } : {}),
    scopedPaths: subjectPaths.size,
    transitions: transitions.size,
  }
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isEntrypoint) {
  const inFlight = process.argv.includes('--in-flight')
  const partIndex = process.argv.indexOf('--part')
  process.stdout.write(`${JSON.stringify(validateMigrationPlan({
    requireBaseline: !inFlight,
    currentPart: inFlight && partIndex >= 0 ? process.argv[partIndex + 1] : undefined,
  }))}\n`)
}
