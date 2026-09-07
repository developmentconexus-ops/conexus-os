import { randomUUID } from 'node:crypto'
import type { PoolClient } from 'pg'
import { canonicalBytes, sha256 } from '../../../../packages/canonical-json/src/index.mjs'
import type { PostgresPool } from '../platform/postgres.js'
import type { ProjectBindingIntentFrozenInput, ProjectBindingRecoveryGitCapability } from './git-execution.js'

type IntentState = 'PREPARING' | 'APPLYING' | 'ABORTING' | 'COMPLETED' | 'ABORTED'
type BindingSourceIntentCommon = Readonly<{
  intent_id: string
  project_id: string
  account_id: string
  workspace_id: string
  source_revision: string
  declaration: unknown
  prepared_result: unknown
  remove_binding: boolean
  state: IntentState
  version: number
  declaration_digest: string | null
  base_tree: string | null
  previous_declaration_blob: string | null
  apply_source_revision: string | null
  cancel_base_source_revision: string | null
  cancel_applied_source_revision: string | null
  terminal_source_revision: string | null
  terminal_result: unknown
  refusal_code: string | null
}>
type ConnectionBindingSourceIntent = BindingSourceIntentCommon & Readonly<{
  operation_kind: 'CONNECTION'
  connection_id: string
  connection_revision_id: string
  environment: 'SANDBOX' | 'PRODUCTION'
  brain_revision_id: null
  brain_digest: null
}>
type BrainBindingSourceIntent = BindingSourceIntentCommon & Readonly<{
  operation_kind: 'BRAIN'
  connection_id: null
  connection_revision_id: null
  environment: null
  brain_revision_id: string
  brain_digest: string
}>
export type BindingSourceIntent = ConnectionBindingSourceIntent | BrainBindingSourceIntent

const oid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{40}$/.test(value)
const uuid = (value: unknown): value is string => typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
const databaseCode = (error: unknown): string | undefined => error && typeof error === 'object' &&
  'code' in error && typeof error.code === 'string' ? error.code : undefined
const conflict = (): Error & { code: string } => Object.assign(new Error('PROJECT_BINDING_INTENT_CONFLICT'), { code: 'P0001' })
const unavailable = (): Error => new Error('PROJECT_BINDING_RECOVERY_UNAVAILABLE')
const object = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const digest = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value)
const validDeclaration = (value: unknown): boolean => {
  if (!object(value) || Object.keys(value).join(',') !== 'bindings' || !Array.isArray(value.bindings)) return false
  let previous = ''
  for (const entry of value.bindings) {
    if (!object(entry) || Object.keys(entry).sort().join(',') !==
      'connectionId,connectionRevisionId,environment,qualificationId' || !uuid(entry.connectionId) ||
      !uuid(entry.connectionRevisionId) || !uuid(entry.qualificationId) ||
      !['SANDBOX', 'PRODUCTION'].includes(String(entry.environment)) || entry.connectionId <= previous) return false
    previous = entry.connectionId
  }
  return true
}

const validBrainCandidate = (value: unknown, row: Readonly<{
  project_id: string; workspace_id: string; brain_revision_id: string; brain_digest: string; source_revision: string
}>): boolean => {
  if (!object(value) || Object.keys(value).sort().join(',') !== [
    'applicableItemIds', 'brainDigest', 'brainRevisionId', 'inputDigest', 'manifestDigest',
    'projectId', 'proofs', 'schemaVersion', 'sourceRevision', 'validationState', 'workspaceId',
  ].join(',') || value.schemaVersion !== 'conexus-brain-binding-validation/v1' || value.validationState !== 'VALID' ||
    value.projectId !== row.project_id || value.workspaceId !== row.workspace_id ||
    value.brainRevisionId !== row.brain_revision_id || value.brainDigest !== row.brain_digest ||
    value.sourceRevision !== row.source_revision || !digest(value.inputDigest) || !digest(value.manifestDigest) ||
    !Array.isArray(value.applicableItemIds) || !Array.isArray(value.proofs) ||
    value.applicableItemIds.length > 2_048 || value.proofs.length > 4_096 ||
    value.applicableItemIds.some((item) => typeof item !== 'string')) return false
  for (const proof of value.proofs) {
    if (!object(proof) || Object.keys(proof).sort().join(',') !== [
      'assertionId', 'coherence', 'counts', 'empty', 'itemId', 'observationId', 'outcome',
      'predicateVersion', 'proofDigest', 'registration', 'registrationDigest', 'subject', 'subjectDigest',
    ].join(',') || proof.predicateVersion !== '1' || proof.outcome !== 'PASS' ||
      !digest(proof.proofDigest) || !digest(proof.registrationDigest) || !digest(proof.subjectDigest) ||
      typeof proof.empty !== 'boolean' || !object(proof.registration) || !object(proof.subject) ||
      !object(proof.counts) || proof.registration.projectId !== row.project_id ||
      proof.registration.workspaceId !== row.workspace_id || proof.subject.projectId !== row.project_id ||
      proof.subject.workspaceId !== row.workspace_id || proof.subject.sourceRevision !== row.source_revision ||
      proof.subject.inputDigest !== value.inputDigest || proof.registration.connectionId !== proof.subject.connectionId ||
      proof.registration.environment !== proof.subject.environment) return false
  }
  return true
}

const validBrainRemoval = (value: unknown, row: Readonly<{
  project_id: string; brain_revision_id: string; brain_digest: string
}>): value is Readonly<{ projectBindingDigest: string }> => object(value) &&
  Object.keys(value).sort().join(',') ===
    'brainDigest,brainRevisionId,projectBindingDigest,projectId,schemaVersion' &&
  value.schemaVersion === 'conexus-brain-binding-removal/v1' && value.projectId === row.project_id &&
  value.brainRevisionId === row.brain_revision_id && value.brainDigest === row.brain_digest &&
  digest(value.projectBindingDigest)

const parseIntent = (value: unknown): BindingSourceIntent => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw unavailable()
  const row = value as Record<string, unknown>
  if (!uuid(row.intent_id) || !uuid(row.project_id) || !uuid(row.account_id) || !uuid(row.workspace_id) || !oid(row.source_revision) ||
    typeof row.version !== 'number' || !Number.isSafeInteger(row.version) || row.version < 0 || typeof row.remove_binding !== 'boolean' ||
    typeof row.state !== 'string' || !['PREPARING', 'APPLYING', 'ABORTING', 'COMPLETED', 'ABORTED'].includes(row.state) ||
    !['CONNECTION', 'BRAIN'].includes(String(row.operation_kind))) throw unavailable()
  if (row.operation_kind === 'CONNECTION') {
    if (!uuid(row.connection_id) || !uuid(row.connection_revision_id) ||
      !['SANDBOX', 'PRODUCTION'].includes(String(row.environment)) || row.brain_revision_id !== null ||
      row.brain_digest !== null || !validDeclaration(row.declaration)) throw unavailable()
    const validProjection = (candidate: unknown) => object(candidate) &&
      Object.keys(candidate).sort().join(',') === 'connectionId,connectionName,connectionRevisionId,environment' &&
      candidate.connectionId === row.connection_id && candidate.connectionRevisionId === row.connection_revision_id &&
      candidate.environment === row.environment && typeof candidate.connectionName === 'string' && /\S/.test(candidate.connectionName)
    if (row.remove_binding ? row.prepared_result !== null : !validProjection(row.prepared_result)) throw unavailable()
    if (row.state === 'COMPLETED' && (row.remove_binding ? row.terminal_result !== null : !validProjection(row.terminal_result))) throw unavailable()
  } else {
    if (row.connection_id !== null || row.connection_revision_id !== null || row.environment !== null ||
      !uuid(row.brain_revision_id) || !digest(row.brain_digest)) throw unavailable()
    const removal = row.remove_binding === true
    const brainRow = {
      project_id: row.project_id as string,
      brain_revision_id: row.brain_revision_id as string,
      brain_digest: row.brain_digest as string,
    }
    if (removal ? !validBrainRemoval(row.declaration, brainRow) :
      !validBrainCandidate(row.declaration, {
        project_id: row.project_id, workspace_id: row.workspace_id,
        brain_revision_id: row.brain_revision_id, brain_digest: row.brain_digest,
        source_revision: row.source_revision,
      })) throw unavailable()
    const validProjection = (candidate: unknown) => object(candidate) &&
      Object.keys(candidate).sort().join(',') ===
        'brainDigest,brainRevisionId,projectBindingDigest,updateAvailable,validationState' &&
      candidate.brainRevisionId === row.brain_revision_id && candidate.brainDigest === row.brain_digest &&
      digest(candidate.projectBindingDigest) && candidate.validationState === 'VALID' && candidate.updateAvailable === false
    if (removal
      ? row.prepared_result !== null || (row.state === 'COMPLETED' && row.terminal_result !== null)
      : !validProjection(row.prepared_result) || (row.state === 'COMPLETED' && !validProjection(row.terminal_result))) throw unavailable()
  }
  if (row.state === 'COMPLETED' && row.terminal_source_revision !== row.apply_source_revision) throw unavailable()
  const abandonedPreparation = row.state === 'ABORTED' && row.apply_source_revision === null
  if (abandonedPreparation && (row.terminal_source_revision !== row.source_revision ||
    row.base_tree !== null || row.previous_declaration_blob !== null || row.declaration_digest !== null ||
    row.cancel_base_source_revision !== null || row.cancel_applied_source_revision !== null)) throw unavailable()
  if (row.state === 'ABORTED' && !abandonedPreparation && (row.terminal_source_revision !== row.cancel_base_source_revision &&
    row.terminal_source_revision !== row.cancel_applied_source_revision)) throw unavailable()
  if (row.state !== 'PREPARING' && !abandonedPreparation && (!oid(row.base_tree) || !oid(row.apply_source_revision) ||
    !oid(row.cancel_base_source_revision) || !oid(row.cancel_applied_source_revision) ||
    (row.previous_declaration_blob !== null && !oid(row.previous_declaration_blob)) ||
    typeof row.declaration_digest !== 'string' ||
    (row.operation_kind === 'BRAIN' && row.remove_binding
      ? !validBrainRemoval(row.declaration, {
        project_id: row.project_id as string,
        brain_revision_id: row.brain_revision_id as string,
        brain_digest: row.brain_digest as string,
      }) || row.declaration.projectBindingDigest !== row.declaration_digest
      : sha256(canonicalBytes(row.declaration)) !== row.declaration_digest))) throw unavailable()
  return Object.freeze(row) as unknown as BindingSourceIntent
}

export const createProjectBindingRecovery = ({ pool, git }: Readonly<{
  pool: PostgresPool
  git: ProjectBindingRecoveryGitCapability
}>) => {
  const transaction = async <T>(work: (client: PoolClient) => Promise<T>): Promise<T> => {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    } finally {
      client.release()
    }
  }
  const queryIntent = async (sql: string, parameters: readonly unknown[], nullable = false): Promise<BindingSourceIntent | null> =>
    transaction(async (client) => {
      const result = await client.query<{ intent: unknown }>(sql, [...parameters])
      if (result.rows.length !== 1) throw unavailable()
      const value = result.rows[0]?.intent
      return nullable && value === null ? null : parseIntent(value)
    })
  const read = (accountId: string, projectId: string, intentId: string | null = null) => queryIntent(
    'SELECT project.get_binding_source_intent($1, $2, $3) AS intent', [accountId, projectId, intentId], true,
  )
  const required = (value: BindingSourceIntent | null, projectId: string, intentId?: string): BindingSourceIntent => {
    if (!value || value.project_id !== projectId || (intentId !== undefined && value.intent_id !== intentId)) throw unavailable()
    return value
  }
  const abandonPreparation = async (accountId: string, intent: BindingSourceIntent, code: 'P0001' | 'XX000') => {
    try {
      return required(await queryIntent(
        'SELECT project.abort_binding_source_intent($1,$2,$3,$4,$5) AS intent',
        [accountId, intent.project_id, intent.intent_id, intent.version, code],
      ), intent.project_id, intent.intent_id)
    } catch (error) {
      const current = required(await read(accountId, intent.project_id, intent.intent_id), intent.project_id, intent.intent_id)
      if (current.state === 'ABORTED' || current.state === 'COMPLETED') return current
      // A competing freeze, or an unknown outcome still at PREPARING, must be
      // retried from durable state. Never use an old stager to abort APPLYING.
      throw error
    }
  }
  const recover = async (accountId: string, candidate: BindingSourceIntent): Promise<BindingSourceIntent> => {
    let intent = candidate
    const identity = [accountId, intent.project_id, intent.intent_id]
    const declarationPath = intent.operation_kind === 'BRAIN'
      ? '.conexus/project/brain-binding.json' as const
      : '.conexus/project/connection-bindings.json' as const
    const deletion = intent.operation_kind === 'BRAIN' && intent.remove_binding
    if (intent.state === 'COMPLETED' || intent.state === 'ABORTED') return intent
    if (intent.state === 'PREPARING') {
      const bytes = deletion ? Buffer.alloc(0) : canonicalBytes(intent.declaration)
      const basis = await transaction(async (client) => {
        const result = await client.query<{ basis: unknown }>(
          'SELECT project.get_binding_source_basis($1,$2,$3,$4) AS basis', [...identity, intent.version],
        )
        const value = result.rows[0]?.basis
        if (result.rows.length !== 1 || !object(value) || Object.keys(value).sort().join(',') !==
          'brainBindingDigest,connectionDeclaration' || !validDeclaration(value.connectionDeclaration) ||
          (value.brainBindingDigest !== null && (typeof value.brainBindingDigest !== 'string' ||
            !/^[0-9a-f]{64}$/.test(value.brainBindingDigest)))) throw unavailable()
        return {
          connectionDigest: sha256(canonicalBytes(value.connectionDeclaration)),
          connectionAbsent: (value.connectionDeclaration as { bindings: unknown[] }).bindings.length === 0,
          brainDigest: value.brainBindingDigest as string | null,
        }
      })
      let staged: Awaited<ReturnType<ProjectBindingRecoveryGitCapability['stageProjectBindingIntent']>>
      try {
        staged = await git.stageProjectBindingIntent({
          projectId: intent.project_id, intentId: intent.intent_id,
          expectedSourceRevision: intent.source_revision,
          path: declarationPath, mutation: deletion ? 'DELETE' : 'UPSERT', declarationBytes: bytes,
          expectedDeclarations: [
            { path: '.conexus/project/connection-bindings.json', digest: basis.connectionDigest, allowAbsent: basis.connectionAbsent },
            { path: '.conexus/project/brain-binding.json', digest: basis.brainDigest,
              allowAbsent: deletion ? false : basis.brainDigest === null },
          ],
        })
      } catch {
        return abandonPreparation(accountId, intent, 'XX000')
      }
      if (staged.status === 'CONFLICT') return abandonPreparation(accountId, intent, 'P0001')
      if (staged.status === 'REFUSED' && staged.code === 'SOURCE_DB_DIVERGENCE')
        return abandonPreparation(accountId, intent, 'P0001')
      if (staged.status !== 'STAGED' || staged.oldSourceRevision !== intent.source_revision) {
        return abandonPreparation(accountId, intent, 'XX000')
      }
      intent = required(await queryIntent(
        'SELECT project.freeze_binding_source_intent($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) AS intent',
        [...identity, intent.version,
          deletion ? (intent.declaration as { projectBindingDigest: string }).projectBindingDigest : sha256(bytes),
          staged.baseTree, staged.previousDeclarationBlob,
          staged.applySourceRevision, staged.cancelBaseSourceRevision, staged.cancelAppliedSourceRevision],
      ), intent.project_id, intent.intent_id)
    }
    const frozen: ProjectBindingIntentFrozenInput = {
      status: 'STAGED',
      projectId: intent.project_id, intentId: intent.intent_id,
      expectedSourceRevision: intent.source_revision,
      path: declarationPath, mutation: deletion ? 'DELETE' : 'UPSERT',
      declarationBytes: deletion ? Buffer.alloc(0) : canonicalBytes(intent.declaration),
      oldSourceRevision: intent.source_revision,
      baseTree: intent.base_tree as string,
      previousDeclarationBlob: intent.previous_declaration_blob,
      applySourceRevision: intent.apply_source_revision as string,
      cancelBaseSourceRevision: intent.cancel_base_source_revision as string,
      cancelAppliedSourceRevision: intent.cancel_applied_source_revision as string,
    }
    if (intent.state === 'APPLYING') {
      let checkingAdmission = true
      try {
        required(await queryIntent(
          'SELECT project.validate_binding_source_intent($1,$2,$3,$4) AS intent', [...identity, intent.version],
        ), intent.project_id, intent.intent_id)
        checkingAdmission = false
        const applied = await git.applyProjectBindingIntent(frozen)
        if (applied.status === 'CONFLICT') throw conflict()
        if (applied.status !== 'APPLIED' || applied.oldSourceRevision !== frozen.oldSourceRevision ||
          applied.newSourceRevision !== frozen.applySourceRevision) throw unavailable()
        checkingAdmission = true
        return required(await queryIntent(
          'SELECT project.complete_binding_source_intent($1,$2,$3,$4) AS intent', [...identity, intent.version],
        ), intent.project_id, intent.intent_id)
      } catch (error) {
        if (!checkingAdmission) throw error
        // Unknown DB outcome is not evidence of semantic refusal. Read the same
        // durable intent before cancellation; never abort a completed attempt.
        const current = required(await read(accountId, intent.project_id, intent.intent_id), intent.project_id, intent.intent_id)
        if (current.state === 'COMPLETED' || current.state === 'ABORTED') return current
        if (current.state === 'ABORTING') intent = current
        else {
          const code = databaseCode(error)
          if (current.state !== 'APPLYING' || current.version !== intent.version ||
            !code || !['42501', 'P0002', 'P0412', 'P0001', '22023'].includes(code)) throw error
          intent = required(await queryIntent(
            'SELECT project.abort_binding_source_intent($1,$2,$3,$4,$5) AS intent', [...identity, intent.version, code],
          ), intent.project_id, intent.intent_id)
        }
      }
    }
    if (intent.state !== 'ABORTING') throw conflict()
    const cancelled = await git.cancelProjectBindingIntent(frozen)
    if (cancelled.status === 'CONFLICT') throw conflict()
    if ((cancelled.status !== 'CANCELLED_BASE' && cancelled.status !== 'CANCELLED_APPLIED') ||
      cancelled.newSourceRevision !== (cancelled.status === 'CANCELLED_BASE'
        ? frozen.cancelBaseSourceRevision : frozen.cancelAppliedSourceRevision)) throw unavailable()
    return required(await queryIntent(
      'SELECT project.complete_binding_source_abort($1,$2,$3,$4,$5) AS intent',
      [...identity, intent.version, cancelled.newSourceRevision],
    ), intent.project_id, intent.intent_id)
  }
  return Object.freeze({
    reconcile: async (accountId: string, projectId: string): Promise<void> => {
      const pending = await read(accountId, projectId)
      if (pending) await recover(accountId, required(pending, projectId))
    },
    execute: async (input: Readonly<{
      accountId: string; projectId: string; connectionId: string; revisionId: string
      environment: string; expectedCurrent: unknown; remove: boolean
    }>): Promise<BindingSourceIntent> => {
      const { accountId, projectId, connectionId, revisionId, environment, expectedCurrent, remove } = input
      const pending = await read(accountId, projectId)
      if (pending) await recover(accountId, required(pending, projectId))
      const intentId = randomUUID()
      const admitted = required(await queryIntent(
        'SELECT project.begin_connection_binding_intent($1,$2,$3,$4,$5,$6,$7,$8) AS intent',
        [accountId, projectId, connectionId, revisionId, environment, expectedCurrent, remove, intentId],
      ), projectId, intentId)
      return recover(accountId, admitted)
    },
    executeBrain: async (input: Readonly<{
      accountId: string
      projectId: string
      brainRevisionId: string
      brainDigest: string
      expectedCurrent: unknown
      candidate: unknown
      projectBindingDigest: string
      bindingValidationId: string
    }>): Promise<BindingSourceIntent> => {
      const { accountId, projectId, brainRevisionId, brainDigest,
        expectedCurrent, candidate, projectBindingDigest, bindingValidationId } = input
      const pending = await read(accountId, projectId)
      if (pending) await recover(accountId, required(pending, projectId))
      const intentId = bindingValidationId
      const admitted = required(await queryIntent(
        'SELECT project.begin_brain_binding_intent($1,$2,$3,$4,$5,$6,$7,$8) AS intent',
        [accountId, projectId, brainRevisionId, brainDigest, expectedCurrent,
          candidate, projectBindingDigest, intentId],
      ), projectId, intentId)
      return recover(accountId, admitted)
    },
    executeBrainRemoval: async (input: Readonly<{
      accountId: string
      projectId: string
      expectedCurrent: unknown
    }>): Promise<BindingSourceIntent> => {
      const { accountId, projectId, expectedCurrent } = input
      const pending = await read(accountId, projectId)
      if (pending) await recover(accountId, required(pending, projectId))
      const intentId = randomUUID()
      const admitted = required(await queryIntent(
        'SELECT project.begin_brain_binding_removal_intent($1,$2,$3,$4) AS intent',
        [accountId, projectId, expectedCurrent, intentId],
      ), projectId, intentId)
      return recover(accountId, admitted)
    },
  })
}
