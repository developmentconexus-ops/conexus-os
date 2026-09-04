import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeSync,
} from 'node:fs'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIRECTORY = dirname(fileURLToPath(import.meta.url))
const DEFAULT_REPOSITORY_ROOT = resolve(SCRIPT_DIRECTORY, '../../..')

/** The Product boundary is deliberately closed and contains no exclusions. */
export const PROTECTED_PRODUCT_ROOTS = Object.freeze([
  'apps',
  'contracts',
  'packages',
  'profiles',
  'runtime',
])

export const PRODUCT_CENSUS_KIND = 'conexus.r1c14.product-census/v1'

const compareCodeUnits = (left, right) => left < right ? -1 : left > right ? 1 : 0

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex')

/*
 * The census only contains strings, arrays and plain objects. Sorting object
 * keys before JSON.stringify gives a dependency-free canonical representation
 * suitable for the image-qualified Node runtime. It also keeps the output
 * independent of filesystem enumeration order and JSON whitespace.
 */
const canonicalValue = value => {
  if (Array.isArray(value)) return value.map(canonicalValue)
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value).sort(compareCodeUnits).map(key => [key, canonicalValue(value[key])]),
    )
  }
  return value
}

export const canonicalJson = value => JSON.stringify(canonicalValue(value))

const failure = (code, detail = '') => {
  throw new Error(`${code}${detail ? `:${detail}` : ''}`)
}

const relativeProductPath = (repositoryRoot, absolutePath) => {
  const value = relative(repositoryRoot, absolutePath).replaceAll('\\', '/')
  if (!value || value === '.' || value.startsWith('../') || value.includes('/../') || value.startsWith('/')) {
    failure('R1C14_PRODUCT_CENSUS_UNSAFE_PATH')
  }
  return value.normalize('NFC')
}

const visit = (repositoryRoot, absolutePath, records) => {
  const stat = lstatSync(absolutePath)
  const path = relativeProductPath(repositoryRoot, absolutePath)

  if (stat.isSymbolicLink()) failure('R1C14_PRODUCT_CENSUS_SYMLINK_REFUSED')
  if (stat.isDirectory()) {
    for (const child of readdirSync(absolutePath).sort(compareCodeUnits)) {
      visit(repositoryRoot, resolve(absolutePath, child), records)
    }
    return
  }
  if (!stat.isFile()) failure('R1C14_PRODUCT_CENSUS_NON_FILE_REFUSED')

  records.push({ path, digest: sha256(readFileSync(absolutePath)) })
}

const assertUniqueAndSorted = records => {
  const paths = records.map(record => record.path)
  const sorted = paths.slice().sort(compareCodeUnits)
  if (JSON.stringify(paths) !== JSON.stringify(sorted)) failure('R1C14_PRODUCT_CENSUS_ORDER_REFUSED')
  if (new Set(paths).size !== paths.length) failure('R1C14_PRODUCT_CENSUS_DUPLICATE_PATH')
}

/**
 * Census every regular file below the four protected Product roots.
 *
 * No ignore list is applied: ignored, hidden, temporary and otherwise
 * untracked files under these roots are all included. Symlinks and special
 * files fail closed instead of being silently omitted.
 */
export const buildProductCensus = (repositoryRoot = DEFAULT_REPOSITORY_ROOT) => {
  const root = resolve(repositoryRoot)
  const records = []
  for (const productRoot of PROTECTED_PRODUCT_ROOTS) {
    const absoluteRoot = resolve(root, productRoot)
    if (!existsSync(absoluteRoot) || !lstatSync(absoluteRoot).isDirectory()) {
      failure('R1C14_PRODUCT_CENSUS_ROOT_MISSING')
    }
    visit(root, absoluteRoot, records)
  }

  records.sort((left, right) => compareCodeUnits(left.path, right.path))
  assertUniqueAndSorted(records)
  const censusDigest = sha256(Buffer.from(canonicalJson(records), 'utf8'))
  return {
    kind: PRODUCT_CENSUS_KIND,
    roots: [...PROTECTED_PRODUCT_ROOTS],
    records,
    digest: censusDigest,
  }
}

// Short aliases make the module convenient to consume from an isolated test
// without introducing a second Product-census implementation.
export const censusProductTree = buildProductCensus
export const productCensus = buildProductCensus

const atomicWrite = (targetPath, bytes) => {
  const absoluteTarget = resolve(targetPath)
  mkdirSync(dirname(absoluteTarget), { recursive: true })
  const temporary = `${absoluteTarget}.tmp-${process.pid}-${randomUUID()}`
  let handle
  try {
    handle = openSync(temporary, 'wx', 0o600)
    writeSync(handle, bytes)
    fsyncSync(handle)
    closeSync(handle)
    handle = undefined
    renameSync(temporary, absoluteTarget)
  } catch (error) {
    if (handle !== undefined) closeSync(handle)
    rmSync(temporary, { force: true })
    throw error
  }
}

export const writeProductCensus = (targetPath, repositoryRoot = DEFAULT_REPOSITORY_ROOT) => {
  const census = buildProductCensus(repositoryRoot)
  atomicWrite(targetPath, Buffer.from(`${canonicalJson(census)}\n`, 'utf8'))
  return census
}

const valueAfter = (args, name) => {
  const index = args.indexOf(name)
  if (index < 0 || index + 1 >= args.length || args[index + 1].startsWith('--')) return undefined
  return args[index + 1]
}

const isEntrypoint = process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))

if (isEntrypoint) {
  const args = process.argv.slice(2)
  const repositoryRoot = valueAfter(args, '--root') ?? process.env.R1C14_REPOSITORY_ROOT ?? DEFAULT_REPOSITORY_ROOT
  const outputPath = valueAfter(args, '--output') ?? process.env.R1C14_PRODUCT_CENSUS_OUTPUT
  const census = outputPath
    ? writeProductCensus(outputPath, repositoryRoot)
    : buildProductCensus(repositoryRoot)
  process.stdout.write(`${canonicalJson(census)}\n`)
}
