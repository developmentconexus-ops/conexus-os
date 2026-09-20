import { createHash } from 'node:crypto'
import { z } from 'zod'
import type { RegistryQueryClient } from './store.js'

const TEMPLATE_REF = '537fnzf4c16x9d7oz21k:5591435e-3021-436b-926b-366ddc7e7189'
const RECIPE_SHA256 = '74a04791ab9691c48e3f4fbff7aa84e8e3ef1b600d38a585e243fff21e5adebf'
const MAX_FILES = 256
const MAX_TOTAL_BYTES = 12 * 1024 * 1024
const SHA256 = /^[a-f0-9]{64}$/
const SOURCE_REVISION = /^[a-f0-9]{40}$/
const SAFE_APPLICATION_PATH = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/

const mediaTypes: Readonly<Record<string, string>> = {
  '.avif': 'image/avif',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

const uuidSchema = z.uuid()
const sourceRevisionSchema = z.string().regex(SOURCE_REVISION)
const sha256Schema = z.string().regex(SHA256)
const compiledFileSchema = z.object({
  path: z.string(),
  mediaType: z.string(),
  bytes: z.instanceof(Uint8Array),
  sha256: sha256Schema,
}).strict()
const compiledApplicationSchema = z.object({
  projectId: uuidSchema,
  executionId: uuidSchema,
  sourceRevision: sourceRevisionSchema,
  templateRef: z.literal(TEMPLATE_REF),
  recipeSha256: z.literal(RECIPE_SHA256),
  files: z.array(compiledFileSchema).min(1).max(MAX_FILES),
}).strict()

const payloadFileSchema = z.object({
  path: z.string(),
  mediaType: z.string(),
  byteLength: z.number().int().nonnegative().max(MAX_TOTAL_BYTES),
  sha256: sha256Schema,
  base64: z.string(),
}).strict()
const payloadSchema = z.object({
  format: z.literal('application-payload-v1'),
  profile: z.literal('REACT_VITE_V1'),
  projectId: uuidSchema,
  sourceRevision: sourceRevisionSchema,
  templateRef: z.literal(TEMPLATE_REF),
  recipeSha256: z.literal(RECIPE_SHA256),
  entryPath: z.literal('index.html'),
  files: z.array(payloadFileSchema).min(1).max(MAX_FILES),
}).strict()

const metadataFileSchema = z.object({
  path: z.string().max(1024),
  mediaType: z.string(),
  byteLength: z.number().int().nonnegative().max(MAX_TOTAL_BYTES),
  sha256: sha256Schema,
}).strict()
const metadataRowSchema = z.object({
  artifact_revision_id: uuidSchema,
  artifact_digest: sha256Schema,
  project_id: uuidSchema,
  source_revision: sourceRevisionSchema,
  profile: z.literal('REACT_VITE_V1'),
  template_ref: z.literal(TEMPLATE_REF),
  recipe_sha256: z.literal(RECIPE_SHA256),
  entry_path: z.literal('index.html'),
  files: z.array(metadataFileSchema).min(1).max(MAX_FILES),
}).strict()
const readRowSchema = z.object({
  artifact_revision_id: uuidSchema,
  project_id: uuidSchema,
  source_revision: sourceRevisionSchema,
  path: z.string().max(1024),
  media_type: z.string(),
  bytes: z.instanceof(Uint8Array),
  sha256: sha256Schema,
}).strict()

type ApplicationPayload = z.infer<typeof payloadSchema>
type ApplicationMetadata = Readonly<{
  artifactRevisionId: string
  artifactDigest: string
  projectId: string
  sourceRevision: string
  profile: 'REACT_VITE_V1'
  templateRef: string
  recipeSha256: string
  entryPath: 'index.html'
  files: readonly Readonly<{
    path: string
    mediaType: string
    byteLength: number
    sha256: string
  }>[]
}>

export type ApplicationArtifactMetadata = ApplicationMetadata
export type ApplicationArtifactStore = Readonly<{
  retainApplication(client: RegistryQueryClient, input: Readonly<{
    accountId: string
    compiled: unknown
  }>): Promise<ApplicationMetadata>
  getApplicationBySource(client: RegistryQueryClient, input: Readonly<{
    accountId: string
    projectId: string
    sourceRevision: string
  }>): Promise<ApplicationMetadata | null>
  readApplicationFileBySource(client: RegistryQueryClient, input: Readonly<{
    accountId: string
    projectId: string
    sourceRevision: string
    artifactRevisionId: string
    path: string
  }>): Promise<Readonly<{
    path: string
    mediaType: string
    bytes: Uint8Array
    sha256: string
  }> | null>
}>

const refuseInput = (): never => {
  throw new Error('APPLICATION_ARTIFACT_INPUT_REFUSED')
}

const refuseResponse = (): never => {
  throw new Error('APPLICATION_ARTIFACT_RESPONSE_REFUSED')
}

const parseOrRefuse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  return refuseInput()
}

const parseResponseOrRefuse = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const parsed = schema.safeParse(value)
  if (parsed.success) return parsed.data
  return refuseResponse()
}

const queryResultSchema = z.object({
  rows: z.array(z.record(z.string(), z.unknown())),
})

const queryRows = async (client: RegistryQueryClient, statement: string, values: readonly unknown[] | undefined) =>
  parseResponseOrRefuse(queryResultSchema, await client.query(statement, values)).rows

const mediaTypeForPath = (path: string): string | undefined => {
  const extensionIndex = path.lastIndexOf('.')
  return mediaTypes[path.slice(extensionIndex).toLowerCase()]
}

const validateFiles = (files: readonly Readonly<{
  path: string
  mediaType: string
  bytes: Uint8Array
  sha256: string
}>[]): ApplicationPayload['files'] => {
  const paths = new Set<string>()
  let totalBytes = 0
  const validated: Array<ApplicationPayload['files'][number]> = []
  for (const file of files) {
    if (file.path.length === 0 || file.path.length > 1024 || !SAFE_APPLICATION_PATH.test(file.path) ||
      paths.has(file.path) || file.path === 'index.html' && file.mediaType !== 'text/html; charset=utf-8') refuseInput()
    const mediaType = mediaTypeForPath(file.path) ?? refuseInput()
    if (mediaType !== file.mediaType) refuseInput()
    const byteLength = file.bytes.byteLength
    if (byteLength > MAX_TOTAL_BYTES || totalBytes + byteLength > MAX_TOTAL_BYTES) refuseInput()
    const bytes = Uint8Array.from(file.bytes)
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (file.sha256 !== digest) refuseInput()
    paths.add(file.path)
    totalBytes += byteLength
    validated.push({
      path: file.path,
      mediaType,
      byteLength,
      sha256: digest,
      base64: Buffer.from(bytes).toString('base64'),
    })
  }
  if (!paths.has('index.html')) refuseInput()
  return validated.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0)
}

const parseCompiled = (value: unknown): Readonly<{
  projectId: string
  sourceRevision: string
  payload: ApplicationPayload
}> & Readonly<{ executionId: string }> => {
  const parsed = parseOrRefuse(compiledApplicationSchema, value)
  const files = validateFiles(parsed.files)
  const payload = {
    format: 'application-payload-v1',
    profile: 'REACT_VITE_V1',
    projectId: parsed.projectId,
    sourceRevision: parsed.sourceRevision,
    templateRef: parsed.templateRef,
    recipeSha256: parsed.recipeSha256,
    entryPath: 'index.html',
    files,
  } satisfies ApplicationPayload
  return Object.freeze({
    projectId: parsed.projectId,
    executionId: parsed.executionId,
    sourceRevision: parsed.sourceRevision,
    payload: Object.freeze(payload),
  })
}

const parseMetadata = (value: unknown, expected: Readonly<{ projectId: string; sourceRevision: string }>): ApplicationMetadata => {
  const parsed = parseResponseOrRefuse(metadataRowSchema, value)
  if (parsed.project_id !== expected.projectId || parsed.source_revision !== expected.sourceRevision) {
    throw new Error('APPLICATION_ARTIFACT_RESPONSE_SCOPE_REFUSED')
  }
  const paths = new Set<string>()
  let totalBytes = 0
  let previousPath: string | undefined
  for (const file of parsed.files) {
    if (previousPath !== undefined && previousPath >= file.path) throw new Error('APPLICATION_ARTIFACT_RESPONSE_REFUSED')
    if (!SAFE_APPLICATION_PATH.test(file.path) || paths.has(file.path) || mediaTypeForPath(file.path) !== file.mediaType) {
      throw new Error('APPLICATION_ARTIFACT_RESPONSE_REFUSED')
    }
    paths.add(file.path)
    totalBytes += file.byteLength
    previousPath = file.path
  }
  if (!paths.has('index.html') || totalBytes > MAX_TOTAL_BYTES) throw new Error('APPLICATION_ARTIFACT_RESPONSE_REFUSED')
  const files = Object.freeze(parsed.files.map((file) => Object.freeze({ ...file })))
  return Object.freeze({
    artifactRevisionId: parsed.artifact_revision_id,
    artifactDigest: parsed.artifact_digest,
    projectId: parsed.project_id,
    sourceRevision: parsed.source_revision,
    profile: parsed.profile,
    templateRef: parsed.template_ref,
    recipeSha256: parsed.recipe_sha256,
    entryPath: parsed.entry_path,
    files,
  })
}

const parseReadFile = (value: unknown, expected: Readonly<{
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  path: string
}>): Readonly<{ path: string; mediaType: string; bytes: Uint8Array; sha256: string }> => {
  const parsed = parseResponseOrRefuse(readRowSchema, value)
  if (parsed.project_id !== expected.projectId || parsed.source_revision !== expected.sourceRevision ||
    parsed.artifact_revision_id !== expected.artifactRevisionId || parsed.path !== expected.path || mediaTypeForPath(parsed.path) !== parsed.media_type) {
    throw new Error('APPLICATION_ARTIFACT_RESPONSE_SCOPE_REFUSED')
  }
  const bytes = Uint8Array.from(parsed.bytes)
  if (bytes.byteLength > MAX_TOTAL_BYTES) refuseResponse()
  const digest = createHash('sha256').update(bytes).digest('hex')
  if (digest !== parsed.sha256) refuseResponse()
  return Object.freeze({ path: parsed.path, mediaType: parsed.media_type, bytes, sha256: digest })
}

export const createApplicationArtifactStore = (): ApplicationArtifactStore => Object.freeze({
  async retainApplication(client, input) {
    const parsedInput = parseOrRefuse(z.object({ accountId: uuidSchema, compiled: z.unknown() }).strict(), input)
    const compiled = parseCompiled(parsedInput.compiled)
    const payloadText = JSON.stringify(compiled.payload)
    const rows = await queryRows(client,
      'SELECT * FROM reg.retain_application_execution($1, $2, $3, $4, $5::jsonb)',
      [parsedInput.accountId, compiled.projectId, compiled.executionId, compiled.sourceRevision, payloadText],
    )
    const row = rows[0]
    if (!row) throw new Error('APPLICATION_ARTIFACT_RESPONSE_REFUSED')
    return parseMetadata(row, { projectId: compiled.projectId, sourceRevision: compiled.sourceRevision })
  },

  async getApplicationBySource(client, input) {
    const coordinates = parseOrRefuse(z.object({
      accountId: uuidSchema, projectId: uuidSchema, sourceRevision: sourceRevisionSchema,
    }).strict(), input)
    const rows = await queryRows(client,
      'SELECT * FROM reg.get_application_by_source($1, $2, $3)',
      [coordinates.accountId, coordinates.projectId, coordinates.sourceRevision],
    )
    const row = rows[0]
    return row ? parseMetadata(row, coordinates) : null
  },

  async readApplicationFileBySource(client, input) {
    const parsed = parseOrRefuse(z.object({
      accountId: uuidSchema,
      projectId: uuidSchema,
      sourceRevision: sourceRevisionSchema,
      artifactRevisionId: uuidSchema,
      path: z.string().max(1024).regex(SAFE_APPLICATION_PATH),
    }).strict(), input)
    const rows = await queryRows(client,
      'SELECT * FROM reg.read_application_file_by_source($1, $2, $3, $4, $5)',
      [parsed.accountId, parsed.projectId, parsed.sourceRevision, parsed.artifactRevisionId, parsed.path],
    )
    const row = rows[0]
    return row ? parseReadFile(row, parsed) : null
  },
})
