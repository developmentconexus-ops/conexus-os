import type { PostgresPool } from '../platform/postgres.js'
import { validateBrainHealth, validateBrainSource } from '../../../../packages/brain-contract/src/index.mjs'
import type { BrainSource } from '../../../../packages/brain-contract/src/index.mjs'

type QueryClient = Readonly<{
  query(statement: string, values?: readonly unknown[]): Promise<{ rows: Record<string, unknown>[] }>
  release(): void
}>

type ContentClass = 'SEMANTIC' | 'KNOWLEDGE' | 'EVIDENCE_SPEC'
type SectionKind = 'DEFINITION' | 'BUSINESS_MEANING' | 'CALCULATION' | 'GRAIN' | 'RELATIONSHIPS' | 'BUSINESS_RULES' | 'CAVEATS' | 'VERIFICATION'
type HealthState = 'UNVERIFIED' | 'VALID' | 'SUSPECT' | 'INVALID' | 'CHECK_ERROR'

export type KnowledgeBrowse = Readonly<{ domains: readonly Readonly<{
  domainRef: string
  label: string
  concepts: readonly Readonly<{
    conceptRef: string
    label: string
    summary: string
    contentClasses: readonly ContentClass[]
    sections: readonly Readonly<{ kind: SectionKind; text: string }>[]
    provenanceRefs: readonly string[]
  }>[]
}>[] }>

type RegistryRevision = Readonly<{
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  availability: 'AVAILABLE'
  payload: unknown
}>

export type BrainRegistryPort = Readonly<{
  getWorkspaceBrain(client: QueryClient, workspaceId: string, admittedWorkspaceIds: readonly string[]): Promise<Readonly<{
    workspaceId: string
    publishedBrainRevisionId: string | null
  }> | null>
  listBrainRevisions(client: QueryClient, workspaceId: string, admittedWorkspaceIds: readonly string[]): Promise<readonly RegistryRevision[]>
  getBrainRevision(client: QueryClient, workspaceId: string, brainRevisionId: string, admittedWorkspaceIds: readonly string[]): Promise<RegistryRevision | null>
}>

export type BrainRevision = Readonly<{
  brainRevisionId: string
  brainDigest: string
  sourceRevision: string
  availability: 'AVAILABLE'
  reviewText: string
  knowledgeBrowse: KnowledgeBrowse
}>

export type BrainHealth = Readonly<{
  brainRevisionId: string
  brainDigest: string
  healthSnapshotDigest: string
  items: readonly Readonly<{ semanticRef: string; state: HealthState; critical: boolean }>[]
}>

export type BrainReadResult<T> = Readonly<
  | { status: 'FOUND'; value: T }
  | { status: 'NOT_FOUND' }
  | { status: 'DENIED' }
  | { status: 'UNAVAILABLE' }
>

export type BrainStore = Readonly<{
  getWorkspaceBrain(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<BrainReadResult<Readonly<{
    workspaceId: string
    publishedBrainRevisionId: string | null
  }>>>
  listBrainRevisions(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<BrainReadResult<readonly Omit<BrainRevision, 'knowledgeBrowse'>[]>>
  listBrainRevisionsForProject(input: Readonly<{
    accountId: string
    workspaceId: string
    projectId: string
  }>): Promise<BrainReadResult<readonly Omit<BrainRevision, 'knowledgeBrowse'>[]>>
  getBrainRevision(input: Readonly<{ accountId: string; workspaceId: string; brainRevisionId: string }>): Promise<BrainReadResult<BrainRevision>>
  getBrainHealth(input: Readonly<{ accountId: string; workspaceId: string }>): Promise<BrainReadResult<BrainHealth>>
}>

const parseBrowse = (source: BrainSource): KnowledgeBrowse => ({
  domains: source.knowledgeBrowse.domains.map((domain) => ({
    domainRef: domain.domainRef,
    label: domain.label,
    concepts: domain.concepts.map((concept) => ({
      conceptRef: concept.conceptRef,
      label: concept.label,
      summary: concept.summary,
      contentClasses: [...concept.contentClasses],
      sections: concept.sections.map((section) => ({ kind: section.kind, text: section.text })),
      provenanceRefs: [...concept.provenanceRefs],
    })),
  })),
})

const parseRevision = (value: RegistryRevision): BrainRevision | null => {
  try {
    const source = validateBrainSource(value.payload)
    return {
      brainRevisionId: value.brainRevisionId,
      brainDigest: value.brainDigest,
      sourceRevision: value.sourceRevision,
      availability: value.availability,
      reviewText: source.reviewText,
      knowledgeBrowse: parseBrowse(source),
    }
  } catch {
    return null
  }
}

export const createBrainStore = ({ pool, registry }: Readonly<{
  pool: PostgresPool
  registry: BrainRegistryPort
}>): BrainStore => {
  const authorizedRead = async <T>(
    accountId: string,
    workspaceId: string,
    action: (client: QueryClient, admitted: readonly string[]) => Promise<BrainReadResult<T>>,
  ): Promise<BrainReadResult<T>> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN READ ONLY')
      const admission = await client.query('SELECT * FROM iam.admit_brain_read($1, $2)', [accountId, workspaceId])
      if (admission.rows.length === 0) {
        await client.query('COMMIT')
        return { status: 'NOT_FOUND' }
      }
      const admittedRow = admission.rows[0]
      if (admission.rows.length !== 1 || String(admittedRow?.workspace_id) !== workspaceId ||
        typeof admittedRow?.can_read_brain !== 'boolean') throw new Error('BRAIN_ADMISSION_INVALID')
      if (!admittedRow.can_read_brain) {
        await client.query('COMMIT')
        return { status: 'DENIED' }
      }
      const admitted = [workspaceId]
      const result = await action(client as QueryClient, admitted)
      await client.query('COMMIT')
      return result
    } catch (error) {
      try { await client.query('ROLLBACK') } catch { /* preserve primary failure */ }
      throw error
    } finally {
      client.release()
    }
  }

  const authorizedRevisionSelection = async <T>(
    accountId: string,
    workspaceId: string,
    projectId: string,
    action: (client: QueryClient, admitted: readonly string[]) => Promise<BrainReadResult<T>>,
  ): Promise<BrainReadResult<T>> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN READ ONLY')
      const admission = await client.query(
        'SELECT * FROM iam.admit_brain_revision_selection($1, $2, $3)',
        [accountId, projectId, workspaceId],
      )
      if (admission.rows.length === 0) {
        await client.query('COMMIT')
        return { status: 'NOT_FOUND' }
      }
      const admittedRow = admission.rows[0]
      if (admission.rows.length !== 1 || String(admittedRow?.project_id) !== projectId ||
        String(admittedRow?.workspace_id) !== workspaceId || typeof admittedRow?.scope_exists !== 'boolean' ||
        typeof admittedRow?.permitted !== 'boolean') throw new Error('BRAIN_SELECTION_ADMISSION_INVALID')
      if (!admittedRow.scope_exists) {
        await client.query('COMMIT')
        return { status: 'NOT_FOUND' }
      }
      if (!admittedRow.permitted) {
        await client.query('COMMIT')
        return { status: 'DENIED' }
      }
      const result = await action(client as QueryClient, [workspaceId])
      await client.query('COMMIT')
      return result
    } catch (error) {
      try { await client.query('ROLLBACK') } catch { /* preserve primary failure */ }
      throw error
    } finally {
      client.release()
    }
  }

  const listRevisions = async (client: QueryClient, admitted: readonly string[], workspaceId: string) => {
    const current = await registry.getWorkspaceBrain(client, workspaceId, admitted)
    if (!current) return { status: 'NOT_FOUND' } as const
    const values = []
    for (const candidate of await registry.listBrainRevisions(client, workspaceId, admitted)) {
      const parsed = parseRevision(candidate)
      if (!parsed) return { status: 'UNAVAILABLE' } as const
      const { knowledgeBrowse: _knowledgeBrowse, ...summary } = parsed
      values.push(summary)
    }
    return { status: 'FOUND', value: values } as const
  }

  return Object.freeze({
    getWorkspaceBrain: ({ accountId, workspaceId }) => authorizedRead(accountId, workspaceId, async (client, admitted) => {
      const value = await registry.getWorkspaceBrain(client, workspaceId, admitted)
      return value ? { status: 'FOUND', value } : { status: 'NOT_FOUND' }
    }),

    listBrainRevisions: ({ accountId, workspaceId }) => authorizedRead(
      accountId,
      workspaceId,
      (client, admitted) => listRevisions(client, admitted, workspaceId),
    ),

    listBrainRevisionsForProject: ({ accountId, workspaceId, projectId }) => authorizedRevisionSelection(
      accountId,
      workspaceId,
      projectId,
      (client, admitted) => listRevisions(client, admitted, workspaceId),
    ),

    getBrainRevision: ({ accountId, workspaceId, brainRevisionId }) => authorizedRead(accountId, workspaceId, async (client, admitted) => {
      const candidate = await registry.getBrainRevision(client, workspaceId, brainRevisionId, admitted)
      if (!candidate) return { status: 'NOT_FOUND' }
      const value = parseRevision(candidate)
      return value ? { status: 'FOUND', value } : { status: 'UNAVAILABLE' }
    }),

    getBrainHealth: ({ accountId, workspaceId }) => authorizedRead(accountId, workspaceId, async (client, admitted) => {
      const current = await registry.getWorkspaceBrain(client, workspaceId, admitted)
      if (!current?.publishedBrainRevisionId) return { status: 'NOT_FOUND' }
      const revision = await registry.getBrainRevision(client, workspaceId, current.publishedBrainRevisionId, admitted)
      if (!revision) return { status: 'UNAVAILABLE' }
      let source: BrainSource
      try { source = validateBrainSource(revision.payload) } catch { return { status: 'UNAVAILABLE' } }
      const result = await client.query('SELECT * FROM brn.get_brain_health($1, $2)', [revision.brainRevisionId, revision.brainDigest])
      const row = result.rows[0]
      if (!row) return { status: 'UNAVAILABLE' }
      if (String(row.brain_revision_id) !== revision.brainRevisionId || String(row.brain_digest) !== revision.brainDigest) {
        return { status: 'UNAVAILABLE' }
      }
      const health = (() => {
        try { return validateBrainHealth({ schemaVersion: 'conexus-brain-health/v1', items: row.items }, source) } catch { return null }
      })()
      if (!health) return { status: 'UNAVAILABLE' }
      return { status: 'FOUND', value: {
        brainRevisionId: String(row.brain_revision_id),
        brainDigest: String(row.brain_digest),
        healthSnapshotDigest: String(row.health_snapshot_digest),
        items: health.items,
      } }
    }),
  })
}
