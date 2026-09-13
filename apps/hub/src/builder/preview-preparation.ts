import { randomUUID } from 'node:crypto'
import type { ApplicationArtifactMetadata, ApplicationBuildRequest } from './application-build.js'
import type { BuilderPreviewSubject } from './preview.js'

export type PreviewPreparationRequest = Readonly<{
  accountId: string
  projectId: string
  changeId: string
  subjectDigest: string
}>

export type PreviewPreparationSubject = PreviewPreparationRequest & Readonly<{
  sourceRevision: string
}>

export type PreviewPreparation = Readonly<{
  attemptId: string
  subject: PreviewPreparationSubject
  expiresAt: number
}> & (
  | Readonly<{ state: 'PREPARING' }>
  | Readonly<{ state: 'PREPARED'; artifact: ApplicationArtifactMetadata }>
  | Readonly<{ state: 'FAILED'; code: 'PREPARATION_FAILED' }>
  | Readonly<{ state: 'EXPIRED' }>
)

export type PreviewPreparationCoordinatorDependencies = Readonly<{
  readPreviewSubject(input: Readonly<{ accountId: string; projectId: string; changeId: string }>): Promise<BuilderPreviewSubject | null>
  prepareApplication(input: ApplicationBuildRequest): Promise<ApplicationArtifactMetadata>
  readRetainedApplication?(input: ApplicationBuildRequest & Readonly<{ sourceRevision: string }>): Promise<ApplicationArtifactMetadata | null>
  now?: () => number
  timeoutMs?: number
  maxActive?: number
}>

export type PreviewPreparationCoordinator = Readonly<{
  start(request: PreviewPreparationRequest): Promise<PreviewPreparation>
  read(request: PreviewPreparationRequest): Promise<PreviewPreparation | null>
  close(): Promise<void>
}>

const DEFAULT_TIMEOUT_MS = 180_000
const DEFAULT_MAX_ACTIVE = 8
const MAX_RETAINED_TERMINAL_ATTEMPTS = 256
const SOURCE_REVISION = /^[0-9a-f]{40}$/

type AttemptLifecycle =
  | Readonly<{ state: 'PREPARING' }>
  | Readonly<{ state: 'PREPARED'; artifact: ApplicationArtifactMetadata }>
  | Readonly<{ state: 'FAILED' }>
  | Readonly<{ state: 'EXPIRED' }>

type Attempt = {
  attemptId: string
  key: string
  request: PreviewPreparationRequest
  subject: PreviewPreparationSubject
  expiresAt: number
  controller: AbortController
  lifecycle: AttemptLifecycle
  timer: ReturnType<typeof setTimeout> | null
}

const immutableSubject = (request: PreviewPreparationRequest, sourceRevision: string): PreviewPreparationSubject => Object.freeze({
  ...request,
  sourceRevision,
})

const immutableArtifact = (artifact: ApplicationArtifactMetadata): ApplicationArtifactMetadata => Object.freeze({
  ...artifact,
  files: Object.freeze(artifact.files.map((file) => Object.freeze({ ...file }))),
})

const preparationKey = (subject: PreviewPreparationSubject): string => [
  subject.accountId,
  subject.projectId,
  subject.changeId,
  subject.subjectDigest,
  subject.sourceRevision,
].join('\u0000')

export const createPreviewPreparationCoordinator = (
  dependencies: PreviewPreparationCoordinatorDependencies,
): PreviewPreparationCoordinator => {
  const now = dependencies.now ?? Date.now
  const timeoutMs = dependencies.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxActive = dependencies.maxActive ?? DEFAULT_MAX_ACTIVE
  if (typeof now !== 'function' || !Number.isFinite(timeoutMs) || timeoutMs <= 0 ||
    !Number.isSafeInteger(maxActive) || maxActive <= 0) {
    throw new Error('PREVIEW_PREPARATION_CONFIG_REFUSED')
  }

  const attempts = new Map<string, Attempt>()
  const activeSettlements = new Set<Promise<void>>()
  let closed = false
  let closing: Promise<void> | null = null

  const snapshot = (attempt: Attempt): PreviewPreparation => {
    const base = {
      attemptId: attempt.attemptId,
      subject: attempt.subject,
      expiresAt: attempt.expiresAt,
    }
    if (attempt.lifecycle.state === 'PREPARING') {
      const result: PreviewPreparation = { ...base, state: 'PREPARING' }
      return Object.freeze(result)
    }
    if (attempt.lifecycle.state === 'PREPARED') {
      const result: PreviewPreparation = { ...base, state: 'PREPARED', artifact: attempt.lifecycle.artifact }
      return Object.freeze(result)
    }
    if (attempt.lifecycle.state === 'FAILED') {
      const result: PreviewPreparation = { ...base, state: 'FAILED', code: 'PREPARATION_FAILED' }
      return Object.freeze(result)
    }
    const result: PreviewPreparation = { ...base, state: 'EXPIRED' }
    return Object.freeze(result)
  }

  const clearTimer = (attempt: Attempt): void => {
    if (attempt.timer !== null) {
      clearTimeout(attempt.timer)
      attempt.timer = null
    }
  }

  const expire = (attempt: Attempt): void => {
    if (attempt.lifecycle.state === 'EXPIRED') return
    clearTimer(attempt)
    attempt.lifecycle = { state: 'EXPIRED' }
    attempt.controller.abort()
  }

  const retainBoundedTerminalAttempts = (): void => {
    const terminal = [...attempts.values()]
      .filter((attempt) => attempt.lifecycle.state !== 'PREPARING')
      .sort((left, right) => left.expiresAt - right.expiresAt)
    const excess = terminal.length - MAX_RETAINED_TERMINAL_ATTEMPTS
    for (const attempt of excess > 0 ? terminal.slice(0, excess) : []) {
      if (attempts.get(attempt.key) === attempt) {
        clearTimer(attempt)
        attempts.delete(attempt.key)
      }
    }
  }

  const sweep = (): void => {
    const currentTime = now()
    for (const attempt of attempts.values()) {
      if (attempt.lifecycle.state !== 'EXPIRED' && currentTime >= attempt.expiresAt) expire(attempt)
    }
    retainBoundedTerminalAttempts()
  }

  const resolveSubject = async (request: PreviewPreparationRequest): Promise<PreviewPreparationSubject> => {
    const subject = await dependencies.readPreviewSubject({
      accountId: request.accountId,
      projectId: request.projectId,
      changeId: request.changeId,
    })
    if (subject === null || subject.subjectKind !== 'CHANGE_CANDIDATE' || !(subject.previewEligible ?? subject.verified) ||
      subject.subjectDigest !== request.subjectDigest || !SOURCE_REVISION.test(subject.sourceRevision)) {
      throw new Error('PREVIEW_PREPARATION_SUBJECT_REFUSED')
    }
    return immutableSubject(request, subject.sourceRevision)
  }

  const isCurrentAndLive = (attempt: Attempt): boolean => {
    if (attempts.get(attempt.key) !== attempt || attempt.lifecycle.state !== 'PREPARING') return false
    if (now() >= attempt.expiresAt) {
      expire(attempt)
      return false
    }
    return true
  }

  const fail = (attempt: Attempt): void => {
    if (!isCurrentAndLive(attempt)) return
    attempt.lifecycle = { state: 'FAILED' }
    retainBoundedTerminalAttempts()
  }

  const settle = async (attempt: Attempt): Promise<void> => {
    let artifact: ApplicationArtifactMetadata
    try {
      artifact = await dependencies.prepareApplication({
        accountId: attempt.request.accountId,
        projectId: attempt.request.projectId,
        changeId: attempt.request.changeId,
        signal: attempt.controller.signal,
      })
    } catch {
      fail(attempt)
      return
    }
    if (!isCurrentAndLive(attempt)) return
    if (artifact.projectId !== attempt.subject.projectId || artifact.sourceRevision !== attempt.subject.sourceRevision) {
      fail(attempt)
      return
    }
    let currentSubject: PreviewPreparationSubject
    try {
      currentSubject = await resolveSubject(attempt.request)
    } catch {
      fail(attempt)
      return
    }
    if (!isCurrentAndLive(attempt) || currentSubject.sourceRevision !== attempt.subject.sourceRevision) {
      fail(attempt)
      return
    }
    attempt.lifecycle = { state: 'PREPARED', artifact: immutableArtifact(artifact) }
    retainBoundedTerminalAttempts()
  }

  const scheduleExpiry = (attempt: Attempt): void => {
    const timer = setTimeout(() => expire(attempt), timeoutMs)
    timer.unref?.()
    attempt.timer = timer
  }

  const start = async (input: PreviewPreparationRequest): Promise<PreviewPreparation> => {
    const request = Object.freeze({ ...input })
    if (closed) throw new Error('PREVIEW_PREPARATION_CLOSED')
    sweep()
    const subject = await resolveSubject(request)
    if (closed) throw new Error('PREVIEW_PREPARATION_CLOSED')
    sweep()
    const key = preparationKey(subject)
    const existing = attempts.get(key)
    if (existing?.lifecycle.state === 'PREPARING' || existing?.lifecycle.state === 'PREPARED') return snapshot(existing)

    if (existing) expire(existing)
    if (activeSettlements.size >= maxActive) throw new Error('PREVIEW_PREPARATION_BUSY')
    const attempt: Attempt = {
      attemptId: randomUUID(),
      key,
      request,
      subject,
      expiresAt: now() + timeoutMs,
      controller: new AbortController(),
      lifecycle: { state: 'PREPARING' },
      timer: null,
    }
    attempts.set(key, attempt)
    scheduleExpiry(attempt)
    const settlement = settle(attempt).catch(() => {
      if (attempts.get(attempt.key) === attempt && attempt.lifecycle.state === 'PREPARING') {
        attempt.lifecycle = { state: 'FAILED' }
        clearTimer(attempt)
        retainBoundedTerminalAttempts()
      }
    })
    activeSettlements.add(settlement)
    void settlement.finally(() => { activeSettlements.delete(settlement) })
    return snapshot(attempt)
  }

  const read = async (input: PreviewPreparationRequest): Promise<PreviewPreparation | null> => {
    const request = Object.freeze({ ...input })
    if (closed) throw new Error('PREVIEW_PREPARATION_CLOSED')
    sweep()
    const subject = await resolveSubject(request)
    if (closed) throw new Error('PREVIEW_PREPARATION_CLOSED')
    sweep()
    const key = preparationKey(subject)
    const existing = attempts.get(key)
    if (existing && existing.lifecycle.state !== 'EXPIRED') return snapshot(existing)
    if (!dependencies.readRetainedApplication) return existing ? snapshot(existing) : null
    const retained = await dependencies.readRetainedApplication({
      accountId: request.accountId,
      projectId: request.projectId,
      changeId: request.changeId,
      sourceRevision: subject.sourceRevision,
    })
    if (!retained) return existing ? snapshot(existing) : null
    const current = await resolveSubject(request)
    if (closed) throw new Error('PREVIEW_PREPARATION_CLOSED')
    if (current.sourceRevision !== subject.sourceRevision || retained.projectId !== subject.projectId || retained.sourceRevision !== subject.sourceRevision) {
      throw new Error('PREVIEW_PREPARATION_SUBJECT_REFUSED')
    }
    const concurrent = attempts.get(key)
    if (concurrent && concurrent.lifecycle.state !== 'EXPIRED') return snapshot(concurrent)
    const restored: Attempt = {
      attemptId: randomUUID(), key, request, subject,
      expiresAt: now() + timeoutMs, controller: new AbortController(),
      lifecycle: { state: 'PREPARED', artifact: immutableArtifact(retained) }, timer: null,
    }
    attempts.set(key, restored)
    scheduleExpiry(restored)
    retainBoundedTerminalAttempts()
    return snapshot(restored)
  }

  const close = async (): Promise<void> => {
    if (closing !== null) {
      await closing
      return
    }
    if (closed) return
    closed = true
    closing = (async () => {
      for (const attempt of attempts.values()) {
        if (attempt.lifecycle.state === 'PREPARING') expire(attempt)
        else clearTimer(attempt)
      }
      await Promise.allSettled([...activeSettlements])
      attempts.clear()
    })()
    await closing
  }

  return Object.freeze({ start, read, close })
}
