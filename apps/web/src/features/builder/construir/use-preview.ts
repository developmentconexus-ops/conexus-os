import { useCallback, useEffect, useRef, useState } from 'react'
import { type BuilderSession, launchBuilderPreview, type PreviewLaunch } from '../api'

type PreviewKey = Readonly<{ projectId: string; sourceRevision: string; artifactRevisionId: string; artifactDigest: string }>
type PreviewLease = Readonly<{ key: PreviewKey; keyId: string; launch: PreviewLaunch }>
// Each state carries the last lease that worked, so a newer key that is still launching or that
// failed never takes the frame away from the version already on screen.
type PreviewState =
  | Readonly<{ kind: 'IDLE'; projectId: string; lastGood: PreviewLease | null }>
  | Readonly<{ kind: 'LAUNCHING'; projectId: string; key: PreviewKey; keyId: string; requestToken: number; lastGood: PreviewLease | null }>
  | Readonly<{ kind: 'ISSUED'; projectId: string; key: PreviewKey; keyId: string; requestToken: number; lease: PreviewLease }>
  | Readonly<{ kind: 'FAILED'; projectId: string; key: PreviewKey; keyId: string; requestToken: number; lastGood: PreviewLease | null }>
type PreviewRequest = Readonly<{ projectId: string; keyId: string; requestToken: number }>

const keyIdOf = (key: PreviewKey): string => [key.projectId, key.sourceRevision, key.artifactRevisionId, key.artifactDigest].join('')

const heldLease = (current: PreviewState, projectId: string): PreviewLease | null =>
  current.projectId !== projectId ? null : current.kind === 'ISSUED' ? current.lease : current.lastGood

export type Preview = Readonly<{
  ready: boolean
  failed: boolean
  lease: PreviewLease | null
  retry: () => void
}>

/** Launches the last good Preview once per artifact key and keeps the previous lease on screen. */
export const usePreview = (projectId: string, summary: BuilderSession['preview'] | undefined): Preview => {
  const [state, setState] = useState<PreviewState>({ kind: 'IDLE', projectId, lastGood: null })
  const key: PreviewKey | null = summary?.lastGoodSourceRevision && summary.lastGoodArtifactRevisionId && summary.lastGoodArtifactDigest ? {
    projectId,
    sourceRevision: summary.lastGoodSourceRevision,
    artifactRevisionId: summary.lastGoodArtifactRevisionId,
    artifactDigest: summary.lastGoodArtifactDigest,
  } : null
  const keyId = key ? keyIdOf(key) : null
  const attempted = useRef(new Set<string>())
  const requestToken = useRef(0)
  const inFlight = useRef<PreviewRequest | null>(null)
  const currentKeyId = useRef<string | null>(keyId)
  currentKeyId.current = keyId
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const launch = useCallback((target: PreviewKey) => {
    const targetId = keyIdOf(target)
    if (inFlight.current?.projectId === projectId && inFlight.current.keyId === targetId) return
    const token = ++requestToken.current
    attempted.current.add(targetId)
    inFlight.current = { projectId, keyId: targetId, requestToken: token }
    setState((current) => ({ kind: 'LAUNCHING', projectId, key: target, keyId: targetId, requestToken: token, lastGood: heldLease(current, projectId) }))
    // Only the newest request for the key still current may land; an older completion is dropped.
    const stillCurrent = (): boolean => mounted.current && currentKeyId.current === targetId &&
      inFlight.current?.projectId === projectId && inFlight.current.keyId === targetId && inFlight.current.requestToken === token
    const fail = () => setState((current) => ({ kind: 'FAILED', projectId, key: target, keyId: targetId, requestToken: token, lastGood: heldLease(current, projectId) }))
    void launchBuilderPreview(projectId).then((result) => {
      if (!stillCurrent()) return
      inFlight.current = null
      if (result.artifactRevisionId !== target.artifactRevisionId || result.artifactDigest !== target.artifactDigest) return fail()
      setState({ kind: 'ISSUED', projectId, key: target, keyId: targetId, requestToken: token, lease: { key: target, keyId: targetId, launch: result } })
    }).catch(() => {
      if (!stillCurrent()) return
      inFlight.current = null
      fail()
    })
  }, [projectId])

  // biome-ignore lint/correctness/useExhaustiveDependencies: the key object is rebuilt each render; its id is its identity
  useEffect(() => {
    if (!key || !keyId) {
      inFlight.current = null
      setState((current) => ({ kind: 'IDLE', projectId, lastGood: heldLease(current, projectId) }))
      return
    }
    if (!attempted.current.has(keyId)) launch(key)
  }, [keyId, launch, projectId])

  const current = state.projectId === projectId ? state : { kind: 'IDLE' as const, projectId, lastGood: null }
  return {
    ready: key !== null,
    failed: current.kind === 'FAILED' && current.keyId === keyId,
    lease: current.kind === 'ISSUED' ? current.lease : current.lastGood,
    retry: () => { if (key) launch(key) },
  }
}
