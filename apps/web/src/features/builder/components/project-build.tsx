import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, cancelBuilderRun, getBuilderRunTrace, getBuilderSession, getProjectSourceFile, launchBuilderPreview, listProjectSourceTree, sendBuilderMessage, type BuilderRun, type PreviewLaunch, type SourceTree } from '../api'
import { useBuilderLiveTurn, useBuilderModels, useBuilderThreadMessages, useConversationActions, useProjectConversations, useSessionModel, type LiveTurn } from '../mastra-session'
import { type BuilderFailureCategory, failureReason } from '../failure-reasons'
import { BuilderConversation, type PersistedRequest } from './builder-conversation'
import { BuilderConversationList } from './builder-conversation-list'
import { BuilderModelSelect } from './builder-model-select'
import { BuilderRunStatus, phaseLabels } from './builder-run-status'
import { ConexusMark } from '../../../../../../packages/brand/src/index'

const failureStatusByCategory: Record<BuilderFailureCategory, string> = {
  ENVIRONMENT_PREPARATION_FAILED: 'Falha ao preparar o ambiente de código',
  MODEL_CREDENTIAL_REFUSED: 'Credencial do modelo recusada',
  MODEL_RATE_LIMITED: 'Modelo temporariamente limitado; tente novamente mais tarde',
  MODEL_REQUEST_REFUSED: 'O provedor do modelo recusou o pedido',
  SOURCE_RESULT_REJECTED: 'A nova fonte proposta foi recusada',
  SOURCE_BASE_MOVED: 'A fonte do Project mudou durante a execução; nada foi sobrescrito',
  PREVIEW_NOT_BUILT: 'Fonte aceita; a prévia não foi gerada',
  APPLICATION_BUILD_FAILED: 'O aplicativo não compilou',
  RUN_CANCELLED: 'Execução interrompida',
  RUN_INTERRUPTED: 'Execução interrompida por reinício do Conexus',
  INTERNAL_ERROR: 'Execução falhou por um erro interno',
}

// These two share one public category but have always been separate outcomes on screen, and an
// operator acts on each differently.
const failureStatusByCode: Record<string, string> = {
  BUILDER_MODEL_AUTH_FAILED: 'Sem conta de modelo que atenda este modelo, ou o provedor a recusou',
  BUILDER_MODEL_RATE_LIMITED: 'Modelo temporariamente limitado; tente novamente mais tarde',
}

const runStatus = (run: BuilderRun | null | undefined, phase: BuilderRun['phase']): string => {
  if (phase) return phaseLabels[phase]
  if (run?.state === 'QUEUED') return 'Na fila para iniciar'
  if (run?.state === 'RUNNING') return 'Executando no Builder'
  if (run?.resultKind === 'RESPONSE_ONLY') return 'Resposta somente'
  if (run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED') return 'Build falhou; o Preview anterior continua disponível'
  if (run?.resultKind === 'SOURCE_CHANGED' || run?.state === 'SUCCEEDED') return 'Build concluído'
  const named = run?.failureCode ? failureStatusByCode[run.failureCode] : undefined
  if (named) return named
  if (run?.failureCategory) return failureStatusByCategory[run.failureCategory]
  if (run?.state === 'INTERRUPTED') return 'Execução interrompida'
  if (run?.state === 'FAILED') return 'Execução falhou'
  return 'Pronto para construir'
}

// runHistory arrives newest first; the conversation reads oldest first, and latestBuilderRun is the
// fresher copy of whichever run it repeats.
const persistedRequestsOf = (history: readonly BuilderRun[], latest: BuilderRun | null | undefined): readonly PersistedRequest[] => {
  const byId = new Map<string, BuilderRun>()
  for (const entry of [...history].reverse()) byId.set(entry.builderRunId, entry)
  if (latest) byId.set(latest.builderRunId, latest)
  return [...byId.values()].flatMap((entry) => !entry.requestText ? [] : [{
    runId: entry.builderRunId,
    text: entry.requestText,
    createdAt: entry.createdAt,
    reason: entry.state === 'FAILED' || entry.state === 'INTERRUPTED' ? failureReason(entry.failureCategory) : null,
  }])
}

type Inspection = 'CODE' | 'DIFF' | 'DETAILS'
type SourceDiffEntry = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' }>
type SourceSnapshot = Readonly<{ sourceRevision: string; files: ReadonlyMap<string, string> }>
type LiveRequest = Readonly<{ runId: string; text: string }>
type PreviewKey = Readonly<{
  projectId: string
  sourceRevision: string
  artifactRevisionId: string
  artifactDigest: string
}>
type PreviewLease = Readonly<{
  key: PreviewKey
  keyId: string
  launch: PreviewLaunch
}>
type PreviewState = Readonly<{
  kind: 'IDLE'
  projectId: string
  lastGood: PreviewLease | null
} | {
  kind: 'LAUNCHING'
  projectId: string
  key: PreviewKey
  keyId: string
  requestToken: number
  lastGood: PreviewLease | null
} | {
  kind: 'ISSUED'
  projectId: string
  key: PreviewKey
  keyId: string
  requestToken: number
  lease: PreviewLease
} | {
  kind: 'FAILED'
  projectId: string
  key: PreviewKey
  keyId: string
  requestToken: number
  lastGood: PreviewLease | null
}>
type PreviewRequest = Readonly<{ projectId: string; keyId: string; requestToken: number }>

// A run streams into the conversation it belongs to. Another conversation's run shows nothing here.
const noTurn: LiveTurn = { runId: null, status: 'ENDED', messages: [], tools: {}, error: null }

const getPreviewKeyId = (key: PreviewKey): string => [
  key.projectId,
  key.sourceRevision,
  key.artifactRevisionId,
  key.artifactDigest,
].join('\u001f')

const readSourceSnapshot = async (projectId: string, sourceRevision: string): Promise<SourceSnapshot> => {
  const tree = await listProjectSourceTree(projectId, sourceRevision)
  const files = tree.entries.filter((entry) => entry.kind === 'FILE')
  const contents = await Promise.all(files.map(async (entry) => [entry.path, (await getProjectSourceFile(projectId, sourceRevision, entry.path)).content] as const))
  return { sourceRevision, files: new Map(contents) }
}

const diffSourceSnapshots = (current: SourceSnapshot, previous: SourceSnapshot): readonly SourceDiffEntry[] => {
  const paths = new Set([...current.files.keys(), ...previous.files.keys()])
  const entries: SourceDiffEntry[] = []
  for (const path of [...paths].sort()) {
    const currentContent = current.files.get(path)
    const previousContent = previous.files.get(path)
    if (currentContent === undefined) entries.push({ path, status: 'REMOVED' })
    else if (previousContent === undefined) entries.push({ path, status: 'ADDED' })
    else if (currentContent !== previousContent) entries.push({ path, status: 'MODIFIED' })
  }
  return entries
}

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'BUILD' | 'PLAN'>('BUILD')
  const [message, setMessage] = useState('')
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null)
  const [previewRatio, setPreviewRatio] = useState(2)
  const [mobilePane, setMobilePane] = useState<'PREVIEW' | 'CHAT'>('PREVIEW')
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [liveRequest, setLiveRequest] = useState<LiveRequest | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null)
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null)
  const [previewState, setPreviewState] = useState<PreviewState>({ kind: 'IDLE', projectId, lastGood: null })
  const frameName = `builder-preview-${inputId.replaceAll(':', '')}`
  const entryForm = useRef<HTMLFormElement>(null)
  const previewSurfaceRef = useRef<HTMLElement>(null)
  const conversationRef = useRef<HTMLElement>(null)
  const followTail = useRef(true)
  const session = useQuery({
    queryKey: ['builder-session', projectId], queryFn: () => getBuilderSession(projectId),
    refetchInterval: (query) => query.state.data?.latestBuilderRun?.state === 'RUNNING' ? 1_000 : 2_000,
  })
  const conversations = useProjectConversations(projectId)
  const conversationActions = useConversationActions(projectId)
  // Opening a Project binds a conversation, so the newest entry is the one to land on until the
  // operator picks another; a selection that disappears falls back to it rather than to nothing.
  const conversationList = conversations.data ?? []
  const conversation = conversationList.find((entry) => entry.id === selectedConversationId) ?? conversationList.at(0) ?? null
  const conversationId = conversation?.id ?? null
  const models = useBuilderModels()
  const sessionModel = useSessionModel(projectId, conversationId)
  // A model without a key on the controller would fail the run, so it is never offered, and a
  // selection that lost its key counts as no selection rather than as a model the operator can use.
  const offeredModels = (models.data ?? []).filter((model) => model.hasApiKey)
  const selectedModelId = sessionModel.selected.data ?? ''
  const modelReady = offeredModels.some((model) => model.id === selectedModelId)
  // A network error or abort leaves the outcome unknown (the request may have landed server-side),
  // so its key is kept and reused for an identical retry; the server dedupes by content digest and
  // raises IDEMPOTENCY_CONFLICT if the retry's content differs. A clean 4xx means the request never
  // took effect, so its key is safe to discard.
  const retainedIdempotencyKey = useRef<{ key: string; content: string } | null>(null)
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string; conversationId: string }>) =>
      sendBuilderMessage(projectId, value.conversationId, value.content, value.mode, value.key),
    onSuccess: async (result, variables) => {
      retainedIdempotencyKey.current = null
      setContent((current) => current === variables.content ? '' : current)
      setMessage('Mensagem enviada ao Builder.')
      setLiveRequest({ runId: result.builderRun.builderRunId, text: variables.content })
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error, variables) => {
      retainedIdempotencyKey.current = error instanceof BuilderRequestError && error.status === null
        ? { key: variables.key, content: variables.content }
        : null
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else setMessage('Não foi possível enviar a mensagem ao Builder.')
    },
  })
  const runId = session.data?.latestBuilderRun?.builderRunId
  const run = session.data?.latestBuilderRun
  const runActive = run?.state === 'QUEUED' || run?.state === 'RUNNING'
  const runHistoryList = session.data?.runHistory ?? []
  const runsById = new Map<string, BuilderRun>()
  for (const entry of runHistoryList) runsById.set(entry.builderRunId, entry)
  if (run) runsById.set(run.builderRunId, run)
  const selectedRun = (selectedRunId && runsById.get(selectedRunId)) || run
  const effectiveRunId = selectedRun?.builderRunId ?? runId ?? null
  // A run belongs to one conversation. The chat pane shows only its own; the Preview, the source and
  // the lenses stay on the Project, which is what they are about.
  const conversationRun = run && conversationId && run.conversationId === conversationId ? run : null
  const conversationRunActive = conversationRun?.state === 'QUEUED' || conversationRun?.state === 'RUNNING'
  const cancel = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('BUILDER_RUN_NOT_READY')
      return cancelBuilderRun(projectId, runId)
    },
    onSuccess: async () => { setMessage('Solicitação de interrupção enviada.'); await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] }) },
    onError: () => setMessage('Não foi possível interromper a execução atual.'),
  })
  const history = useBuilderThreadMessages(projectId, conversationId ?? undefined)
  const turn = useBuilderLiveTurn(projectId, run ?? undefined, runActive && run?.phase === 'AGENT')
  const previousRunState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const wasActive = previousRunState.current === 'QUEUED' || previousRunState.current === 'RUNNING'
    previousRunState.current = run?.state
    if (!runId || !wasActive || runActive) return
    void Promise.all([session.refetch(), history.refetch(), conversations.refetch()]).finally(() => setLiveRequest(null))
  }, [conversations, history, run, runActive, runId, session])
  const onConversationScroll = () => {
    const element = conversationRef.current
    if (!element) return
    followTail.current = element.scrollHeight - element.scrollTop - element.clientHeight < 56
  }
  useEffect(() => {
    const element = conversationRef.current
    if (element && followTail.current) element.scrollTop = element.scrollHeight
  })
  const previewSummary = session.data?.preview
  const workingSourceRevision = previewSummary?.workingSourceRevision ?? null
  const lastGoodSourceRevision = previewSummary?.lastGoodSourceRevision ?? null
  const sourceRevisionForQuery = workingSourceRevision
  const sourceTree = useQuery<SourceTree>({
    queryKey: ['builder-source-tree', projectId, workingSourceRevision],
    queryFn: () => {
      if (!sourceRevisionForQuery) throw new Error('SOURCE_TREE_NOT_READY')
      return listProjectSourceTree(projectId, sourceRevisionForQuery)
    },
    enabled: inspection === 'CODE' && Boolean(workingSourceRevision),
  })
  const sourceFiles = sourceTree.data?.entries.filter((entry) => entry.kind === 'FILE') ?? []
  useEffect(() => {
    if (!sourceFiles.length) {
      setSelectedSourcePath(null)
      return
    }
    const firstSourceFile = sourceFiles.at(0)
    if (firstSourceFile && (!selectedSourcePath || !sourceFiles.some((entry) => entry.path === selectedSourcePath))) setSelectedSourcePath(firstSourceFile.path)
  }, [selectedSourcePath, sourceFiles])
  const sourcePathForQuery = selectedSourcePath
  const sourceFile = useQuery({
    queryKey: ['builder-source-file', projectId, workingSourceRevision, selectedSourcePath],
    queryFn: () => {
      if (!sourceRevisionForQuery || !sourcePathForQuery) throw new Error('SOURCE_FILE_NOT_READY')
      return getProjectSourceFile(projectId, sourceRevisionForQuery, sourcePathForQuery)
    },
    enabled: inspection === 'CODE' && Boolean(workingSourceRevision && selectedSourcePath),
  })
  const diffBasis = selectedRun?.resultSourceRevision
    ? { baseSourceRevision: selectedRun.baseSourceRevision, resultSourceRevision: selectedRun.resultSourceRevision }
    : null
  const sourceDiff = useQuery({
    queryKey: ['builder-source-diff', projectId, diffBasis?.baseSourceRevision, diffBasis?.resultSourceRevision],
    queryFn: async () => {
      if (!diffBasis) throw new Error('SOURCE_DIFF_NOT_READY')
      const [current, previous] = await Promise.all([
        readSourceSnapshot(projectId, diffBasis.resultSourceRevision), readSourceSnapshot(projectId, diffBasis.baseSourceRevision),
      ])
      return diffSourceSnapshots(current, previous)
    },
    enabled: inspection === 'DIFF' && Boolean(diffBasis),
  })
  const trace = useQuery({
    queryKey: ['builder-run-trace', projectId, effectiveRunId],
    queryFn: () => {
      if (!effectiveRunId) throw new Error('BUILDER_TRACE_NOT_READY')
      return getBuilderRunTrace(projectId, effectiveRunId)
    },
    enabled: inspection === 'DETAILS' && Boolean(effectiveRunId),
  })
  const previewSourceRevision = previewSummary?.lastGoodSourceRevision
  const previewArtifactRevisionId = previewSummary?.lastGoodArtifactRevisionId
  const previewArtifactDigest = previewSummary?.lastGoodArtifactDigest
  const previewKey: PreviewKey | null = previewSourceRevision && previewArtifactRevisionId && previewArtifactDigest ? {
    projectId,
    sourceRevision: previewSourceRevision,
    artifactRevisionId: previewArtifactRevisionId,
    artifactDigest: previewArtifactDigest,
  } : null
  const previewReady = previewKey !== null
  const previewKeyId = previewKey ? getPreviewKeyId(previewKey) : null
  const attemptedPreviewKeys = useRef(new Set<string>())
  const previewRequestToken = useRef(0)
  const currentPreviewRequest = useRef<PreviewRequest | null>(null)
  const currentPreviewKeyId = useRef<string | null>(previewKeyId)
  currentPreviewKeyId.current = previewKeyId
  const mounted = useRef(false)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])
  const launchPreviewForKey = useCallback((key: PreviewKey) => {
    const keyId = getPreviewKeyId(key)
    const existingRequest = currentPreviewRequest.current
    if (existingRequest?.projectId === projectId && existingRequest.keyId === keyId) return
    const requestToken = ++previewRequestToken.current
    attemptedPreviewKeys.current.add(keyId)
    currentPreviewRequest.current = { projectId, keyId, requestToken }
    setPreviewState((current) => ({
      kind: 'LAUNCHING',
      projectId,
      key,
      keyId,
      requestToken,
      lastGood: current.projectId === projectId
        ? current.kind === 'ISSUED' ? current.lease : current.lastGood
        : null,
    }))
    void launchBuilderPreview(projectId).then((result) => {
      const activeRequest = currentPreviewRequest.current
      if (!mounted.current || currentPreviewKeyId.current !== keyId ||
        activeRequest?.projectId !== projectId || activeRequest.keyId !== keyId ||
        activeRequest.requestToken !== requestToken) return
      currentPreviewRequest.current = null
      if (result.artifactRevisionId !== key.artifactRevisionId || result.artifactDigest !== key.artifactDigest) {
        setPreviewState((current) => ({
          kind: 'FAILED', projectId, key, keyId, requestToken,
          lastGood: current.projectId === projectId
            ? current.kind === 'ISSUED' ? current.lease : current.lastGood
            : null,
        }))
        return
      }
      setPreviewState({ kind: 'ISSUED', projectId, key, keyId, requestToken, lease: { key, keyId, launch: result } })
    }).catch(() => {
      const activeRequest = currentPreviewRequest.current
      if (!mounted.current || currentPreviewKeyId.current !== keyId ||
        activeRequest?.projectId !== projectId || activeRequest.keyId !== keyId ||
        activeRequest.requestToken !== requestToken) return
      currentPreviewRequest.current = null
      setPreviewState((current) => ({
        kind: 'FAILED', projectId, key, keyId, requestToken,
        lastGood: current.projectId === projectId
          ? current.kind === 'ISSUED' ? current.lease : current.lastGood
          : null,
      }))
    })
  }, [projectId])
  useEffect(() => {
    if (!previewKey || !previewKeyId) {
      currentPreviewRequest.current = null
      setPreviewState((current) => ({ kind: 'IDLE', projectId, lastGood: current.projectId === projectId
        ? current.kind === 'ISSUED' ? current.lease : current.lastGood
        : null }))
      return
    }
    if (!attemptedPreviewKeys.current.has(previewKeyId)) launchPreviewForKey(previewKey)
  }, [launchPreviewForKey, previewKey, previewKeyId, projectId])
  const retryPreview = () => { if (previewKey) launchPreviewForKey(previewKey) }
  const currentPreviewState = previewState.projectId === projectId
    ? previewState
    : { kind: 'IDLE' as const, projectId, lastGood: null }
  const previewFailed = currentPreviewState.kind === 'FAILED' && currentPreviewState.keyId === previewKeyId
  const previewLease = currentPreviewState.kind === 'ISSUED' ? currentPreviewState.lease : currentPreviewState.lastGood
  const previewLaunch = previewLease?.launch
  const previewLeaseKeyId = previewLease?.keyId ?? null
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = content.trim()
    if (!value || send.isPending || !conversationId || !modelReady) {
      if (!modelReady && !models.isPending) setMessage('Escolha o modelo do Builder antes de enviar.')
      return
    }
    const key = retainedIdempotencyKey.current?.content === value ? retainedIdempotencyKey.current.key : crypto.randomUUID()
    send.mutate({ content: value, mode, key, conversationId })
  }
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }
  // The frame starts at about:blank, whose own load fires before any grant exists, so a load only
  // counts once the entry for this exact lease has been submitted.
  const submittedLeaseKeyId = useRef<string | null>(null)
  const [navigatedLeaseKeyId, setNavigatedLeaseKeyId] = useState<string | null>(null)
  useEffect(() => {
    if (!previewLaunch || !previewLeaseKeyId) return
    submittedLeaseKeyId.current = previewLeaseKeyId
    setNavigatedLeaseKeyId(null)
    queueMicrotask(() => entryForm.current?.requestSubmit())
  }, [previewLaunch, previewLeaseKeyId])
  const frameNavigated = navigatedLeaseKeyId !== null && navigatedLeaseKeyId === previewLeaseKeyId
  const onFrameLoad = () => {
    if (submittedLeaseKeyId.current && submittedLeaseKeyId.current === previewLeaseKeyId) {
      setNavigatedLeaseKeyId(previewLeaseKeyId)
    }
  }

  if (session.isError) {
    const denied = session.error instanceof BuilderRequestError && session.error.status === 403
    return <section className="builder-unavailable" role="alert">
      <h2>{denied ? 'Build indisponível neste Project' : 'Não foi possível carregar o Build'}</h2>
      <p>{denied ? 'Sua conta pode consultar este Project, mas não possui autoridade de Build para ele.' : 'O servidor não conseguiu consultar a sessão real do Builder.'}</p>
    </section>
  }

  const activeStatus = runStatus(run, run?.phase ?? null)
  const conversationTurn = conversationRun ? turn : noTurn
  const persistedRequests = persistedRequestsOf(runHistoryList.filter((entry) => entry.conversationId === conversationId), conversationRun)
  const canCompose = Boolean(conversationId) && modelReady

  return <div className="project-build">
    <nav className="builder-mobile-switcher" aria-label="Painel do Builder">
      <button type="button" aria-pressed={mobilePane === 'PREVIEW'} onClick={() => setMobilePane('PREVIEW')}>Preview</button>
      <button type="button" aria-pressed={mobilePane === 'CHAT'} onClick={() => setMobilePane('CHAT')}>Conversa</button>
    </nav>
    <div className="build-workspace" style={{ '--builder-preview-ratio': `${previewRatio}fr` } as CSSProperties}>
      <section ref={previewSurfaceRef} data-mobile-pane={mobilePane} className="build-preview-surface" aria-labelledby="build-preview-title">
        <div className="work-heading"><div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2><p className="builder-surface-caption">A versão autorizada mais recente do seu Project.</p></div><div className="builder-pane-actions"><label>Divisão <input aria-label="Tamanho do Preview" type="range" min="1" max="3" step=".1" value={previewRatio} onChange={(event) => setPreviewRatio(Number(event.target.value))} /></label><button type="button" onClick={() => void previewSurfaceRef.current?.requestFullscreen?.()}>Tela cheia</button></div></div>
        <nav className="build-lenses" aria-label="Inspeção técnica">
          <button type="button" aria-pressed={inspection === null} onClick={() => setInspection(null)}>Preview</button>
          <button type="button" aria-pressed={inspection === 'CODE'} onClick={() => setInspection('CODE')}>Código</button>
          <button type="button" aria-pressed={inspection === 'DIFF'} onClick={() => setInspection('DIFF')}>Diff</button>
          <button type="button" aria-pressed={inspection === 'DETAILS'} onClick={() => setInspection('DETAILS')}>Detalhes</button>
        </nav>
        <div className="builder-preview-status" role="status" aria-live="polite">
          <span className={`builder-status-dot ${runActive ? 'is-active' : previewReady ? 'is-ready' : 'is-idle'}`} aria-hidden="true" />
          <span>{run ? activeStatus : previewReady ? 'Preview pronto' : 'Aguardando o primeiro Build'}</span>
        </div>
        {!previewReady && !previewLaunch && <div className="preview-empty"><div className="preview-empty-mark" aria-hidden="true">⌁</div><strong>Seu aplicativo aparecerá aqui</strong><span>Envie uma solicitação pelo chat para criar o primeiro Preview real.</span></div>}
        {previewReady && !previewLaunch && <p className="preview-last-good"><strong>Último Preview bom disponível.</strong><span>Ainda não há uma sessão de Preview aberta.</span></p>}
        {previewReady && workingSourceRevision && workingSourceRevision !== lastGoodSourceRevision && <p className="preview-last-good">A fonte atual do Project está à frente deste Preview. Ele mostra a última versão que compilou e muda quando uma execução compilar a fonte atual.</p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p className="preview-warning" role="alert"><strong>A nova fonte não compilou.</strong><span>O Preview anterior continua disponível para você.</span>{run.failureCode && <code>{run.failureCode}</code>}</p>}
        {previewLaunch && <><div className="preview-frame-stack"><div className="preview-frame-bar"><span aria-hidden="true" /><span>Aplicativo autorizado</span><button type="button" onClick={() => { if (previewKey) launchPreviewForKey(previewKey) }}>Reabrir</button></div><iframe title="Preview do aplicativo" name={frameName} src="about:blank" onLoad={onFrameLoad} /></div><form ref={entryForm} hidden method="post" action={previewLaunch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={previewLaunch.entryGrant} /></form>{/* Only what the browser can observe. A cross-origin load fires for a refusal as readily as for
             a working app, so navigation is the furthest this can honestly claim. */}
          <p className="preview-issued" role="status" aria-live="polite">{frameNavigated
            ? 'Aplicativo aberto abaixo. Se a área ficar vazia, ele não desenhou nada.'
            : 'Acesso autorizado. Abrindo o aplicativo…'}</p></>}
        {previewFailed && <div className="preview-warning" role="alert"><strong>Não foi possível abrir o Preview atual.</strong><span>O último Preview bom permanece preservado.</span><button type="button" onClick={retryPreview}>Tentar novamente</button></div>}
        {inspection === 'CODE' && <section className="build-inspection" aria-labelledby="build-code-title">
          <h3 id="build-code-title">Código da fonte em trabalho</h3>
          {!workingSourceRevision && <p>O Project ainda não tem uma fonte disponível para inspeção.</p>}
          {workingSourceRevision && sourceTree.isPending && <p>Carregando a árvore da fonte…</p>}
          {workingSourceRevision && sourceTree.isError && <p role="alert">Não foi possível ler a árvore da fonte.</p>}
          {sourceFiles.length > 0 && <div className="source-browser">
            <nav aria-label="Arquivos da fonte">
              {sourceFiles.map((entry) => <button key={entry.path} type="button" aria-pressed={entry.path === selectedSourcePath} onClick={() => setSelectedSourcePath(entry.path)}>{entry.path}</button>)}
            </nav>
            <div>
              <p className="panel-intro">Fonte <code>{workingSourceRevision}</code> · arquivo <code>{selectedSourcePath}</code></p>
              {sourceFile.isPending && <p>Carregando arquivo…</p>}
              {sourceFile.isError && <p role="alert">Não foi possível ler este arquivo.</p>}
              {sourceFile.data && <pre>{sourceFile.data.content}</pre>}
            </div>
          </div>}
        </section>}
        {inspection === 'DIFF' && <section className="build-inspection" aria-labelledby="build-diff-title">
          <h3 id="build-diff-title">Diff da fonte</h3>
          {!diffBasis && <p>O Diff aparecerá quando houver uma alteração de código.</p>}
          {sourceDiff.isPending && <p>Comparando as fontes…</p>}
          {sourceDiff.isError && <p role="alert">Não foi possível comparar as fontes.</p>}
          {sourceDiff.data?.length === 0 && <p>Não há arquivos diferentes entre a fonte base e o resultado da última alteração de código.</p>}
          {sourceDiff.data && sourceDiff.data.length > 0 && <ul className="source-diff-list">{sourceDiff.data.map((entry) => <li key={entry.path}><strong>{entry.status}</strong> <code>{entry.path}</code></li>)}</ul>}
        </section>}
        {inspection === 'DETAILS' && <section className="build-inspection" aria-labelledby="build-details-title">
          <h3 id="build-details-title">Detalhes do Build</h3>
          <dl className="builder-details">
            <div><dt>Project</dt><dd><code>{projectId}</code></dd></div>
            <div><dt>Modo atual</dt><dd>{session.data?.mode ?? 'BUILD'}</dd></div>
            <div><dt>Fonte em trabalho</dt><dd><code>{workingSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Último Preview bom</dt><dd><code>{lastGoodSourceRevision ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Artefato do Preview</dt><dd><code>{previewSummary?.lastGoodArtifactRevisionId ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Digest do artefato</dt><dd><code>{previewSummary?.lastGoodArtifactDigest ?? 'Ainda não disponível'}</code></dd></div>
            <div><dt>Execução selecionada</dt><dd><code>{selectedRun?.builderRunId ?? 'Nenhuma'}</code> · {runStatus(selectedRun, null)}</dd></div>
          </dl>
          <h3>Histórico recente</h3>
          {runHistoryList.length === 0 && <p>Nenhuma execução persistida.</p>}
          {runHistoryList.length > 0 && <ol className="builder-run-history">{runHistoryList.map((historyRun) => <li key={historyRun.builderRunId}><button type="button" aria-pressed={historyRun.builderRunId === effectiveRunId} onClick={() => setSelectedRunId(historyRun.builderRunId)}><code>{historyRun.builderRunId}</code><span>{runStatus(historyRun, null)}</span></button></li>)}</ol>}
          <h3>Trace nativo</h3>
          {trace.isPending && <p>Consultando trace…</p>}
          {trace.isError && <p role="alert">Trace indisponível.</p>}
          {trace.data && !trace.data.available && <p>Trace não disponível para esta execução.</p>}
          {trace.data?.available && <><p><code>{trace.data.traceId}</code></p><ul className="builder-trace-list">{trace.data.spans.map((span) => <li key={`${span.spanType}-${span.name}-${span.startedAt}`}><strong>{span.spanType}</strong><span>{span.name}</span><small>{span.durationMs === null ? 'duração indisponível' : `${span.durationMs} ms`}{span.error ? ' · erro' : ''}</small></li>)}</ul></>}
        </section>}
      </section>
      {!chatCollapsed && <aside data-mobile-pane={mobilePane} className="conexus-panel" aria-labelledby="conexus-panel-title">
        <div className="builder-panel-heading"><ConexusMark size={22} working={run?.state === 'RUNNING'} /><div><p className="eyebrow">Conexus Builder</p><h2 id="conexus-panel-title">Converse com o Conexus</h2><p className="builder-surface-caption">Peça alterações e acompanhe o que está acontecendo.</p></div></div>
        <BuilderConversationList
          conversations={conversationList}
          selectedId={conversationId}
          onSelect={setSelectedConversationId}
          // The Hub starts a new conversation from the person's defaults, else the installation's,
          // and a model chosen in one conversation stays with that conversation.
          onCreate={() => conversationActions.create.mutate(undefined, { onSuccess: (created) => { setSelectedConversationId(created.id) } })}
          pending={conversationActions.create.isPending}
        />
        <section ref={conversationRef} onScroll={onConversationScroll} className="builder-conversation" aria-label="Mensagens do Builder" aria-live="polite">
          <BuilderConversation history={history.data ?? []} turn={conversationTurn} pendingRequest={conversationRunActive && liveRequest && liveRequest.runId === conversationRun?.builderRunId ? liveRequest.text : null} persistedRequests={persistedRequests} failureCategory={conversationRun?.failureCategory ?? null} />
        </section>
        {run && runActive && <BuilderRunStatus run={run} inThisConversation={conversationRunActive} stopping={cancel.isPending || Boolean(run.cancellationRequested)} onStop={() => cancel.mutate()} />}
        <form onSubmit={submit}>
          <label className="builder-composer-label" htmlFor={inputId}>O que o Project precisa fazer?</label>
          <div className="builder-composer-box"><textarea id={inputId} rows={4} required disabled={!canCompose} placeholder="Descreva uma alteração ou pergunte sobre o Project…" value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={onComposerKeyDown} /><div className="builder-composer-footer"><span>Enter envia · Shift+Enter quebra linha</span><button className="primary builder-send-button" type="submit" disabled={send.isPending || runActive || !canCompose}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button></div></div>
          <BuilderModelSelect models={offeredModels} value={modelReady ? selectedModelId : ''} onChange={(modelId) => sessionModel.choose.mutate(modelId)} disabled={runActive || sessionModel.choose.isPending} />
          {!modelReady && offeredModels.length > 0 && <p className="builder-no-model" role="alert">Escolha o modelo do Builder para poder enviar mensagens.</p>}
          {offeredModels.length === 0 && !models.isPending && <p className="builder-no-model" role="alert">Nenhum modelo autenticado disponível no controlador do Builder.</p>}
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button className={mode === 'BUILD' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button className={mode === 'PLAN' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          {message && <p className="builder-form-message" role="status" aria-live="polite">{message}</p>}
        </form>
      </aside>}
    </div>
    <button className="builder-collapse-chat" type="button" onClick={() => setChatCollapsed((current) => !current)}>{chatCollapsed ? 'Mostrar conversa' : 'Ocultar conversa'}</button>
  </div>
}
