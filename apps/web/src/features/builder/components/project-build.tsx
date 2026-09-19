import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMutation as useConnectionMutation, useQuery as useConnectionQuery, useQueryClient as useConnectionQueryClient } from '@tanstack/react-query'
import { modelConnectionsQueryKey, listModelConnections, selectModelConnection } from '../../model-connection/api'
import { BuilderRequestError, cancelBuilderRun, getBuilderRunTrace, getBuilderSession, getProjectSourceFile, launchBuilderPreview, listProjectSourceTree, sendBuilderMessage, type BuilderMessagePart, type BuilderSession, type BuilderSessionMessage, type PreviewLaunch, type SourceTree } from '../api'
import { observeBuilderRun, type BuilderLiveView, type BuilderObservation } from '../observation'
import { BuilderMarkdown } from './builder-markdown'

const runStatus = (state: string | undefined, kind: string | null | undefined, phase?: string | null, failureCode?: string | null): string => {
  if (phase) return phase
  if (state === 'QUEUED') return 'Na fila para iniciar'
  if (state === 'RUNNING') return 'Executando no Builder'
  if (kind === 'RESPONSE_ONLY') return 'Resposta somente'
  if (kind === 'SOURCE_CHANGED_BUILD_FAILED') return 'Build falhou; o Preview anterior continua disponível'
  if (kind === 'SOURCE_CHANGED' || state === 'SUCCEEDED') return 'Build concluído'
  if (state === 'INTERRUPTED') return 'Execução interrompida'
  if (failureCode === 'BUILDER_MODEL_RATE_LIMITED') return 'Modelo temporariamente limitado; tente novamente mais tarde'
  if (state === 'FAILED') return 'Execução falhou'
  return 'Pronto para construir'
}

const activityLabel = (label: BuilderLiveView['activities'][number]['label']): string => ({
  READ_FILES: 'Lendo arquivos', EDIT_FILES: 'Editando', RUN_COMMAND: 'Executando comando', WORKSPACE: 'Trabalhando no Workspace',
}[label])

const activityState = (state: BuilderLiveView['activities'][number]['state']): string => ({
  started: 'em andamento', succeeded: 'concluído', failed: 'falhou', interrupted: 'interrompido',
}[state])

const messageText = (message: BuilderSessionMessage): string =>
  message.parts.filter((part): part is Extract<BuilderMessagePart, { kind: 'TEXT' }> => part.kind === 'TEXT').map((part) => part.text).join('')

const observationNotices: Partial<Record<BuilderObservation['status'], string>> = {
  RECONNECTING: 'Conexão de acompanhamento perdida. Reconectando à execução…',
  UNOBSERVABLE: 'Não é possível acompanhar esta execução ao vivo. O estado atual vem da sessão do Project.',
}

type Inspection = 'CODE' | 'DIFF' | 'DETAILS'
type SourceDiffEntry = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' }>
type SourceSnapshot = Readonly<{ sourceRevision: string; files: ReadonlyMap<string, string> }>
type LiveRequest = Readonly<{ runId: string; text: string; messageBoundary: number }>
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
const EMPTY_MODEL_CHOICES: readonly BuilderSession['modelChoices'][number][] = []

function BuilderModelConnection({ initialOpen = false }: { initialOpen?: boolean }) {
  const [open, setOpen] = useState(false)
  const connectionRef = useRef<HTMLDivElement>(null)
  const connectionQuery = useConnectionQuery({ queryKey: modelConnectionsQueryKey, queryFn: listModelConnections })
  const connectionQueryClient = useConnectionQueryClient()
  const select = useConnectionMutation({
    mutationFn: selectModelConnection,
    onSuccess: async () => { await connectionQueryClient.invalidateQueries({ queryKey: modelConnectionsQueryKey }); setOpen(false) },
  })
  const active = connectionQuery.data?.connections.find((connection) => connection.state === 'ACTIVE')
  useEffect(() => { if (initialOpen) setOpen(true) }, [initialOpen])
  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (connectionRef.current && !connectionRef.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return <div ref={connectionRef} className="builder-connection">
    <button className="builder-connection-trigger" type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-haspopup="dialog" aria-controls="builder-model-connection">
      <span className="builder-connection-dot" aria-hidden="true" />
      <span><strong>{active ? active.label : 'Conectar modelo'}</strong><small>{active ? 'disponível para o próximo pedido' : 'necessário para construir'}</small></span>
    </button>
    {open && <div id="builder-model-connection" className="builder-connection-popover" role="dialog" aria-modal="false" aria-labelledby="builder-model-connection-title">
      <div className="dialog-heading"><div><p className="eyebrow">Credencial do Builder</p><h3 id="builder-model-connection-title">Conexão de modelo</h3></div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar conexão">Fechar</button></div>
      <p className="panel-intro">A conta selecionada é resolvida no servidor e vale somente para novos BuilderRuns.</p>
      {connectionQuery.isPending && <p>Carregando conexões…</p>}
      {connectionQuery.isError && <p role="alert">Não foi possível consultar as conexões de modelo.</p>}
      {connectionQuery.data?.connections.length === 0 && <p>Nenhuma conexão de modelo disponível. <a href="/settings">Abrir configurações</a></p>}
      {connectionQuery.data?.connections.map((connection) => <div className="builder-connection-option" key={connection.connectionId}>
        <span><strong>{connection.label}</strong><small>{connection.state === 'ACTIVE' ? 'Ativa' : 'Revogada'} · {connection.role === 'OWNER' ? 'Sua conexão' : 'Compartilhada'}</small></span>
        <button type="button" disabled={connection.state !== 'ACTIVE' || select.isPending} onClick={() => select.mutate(connection.connectionId)}>{connection.connectionId === active?.connectionId ? 'Selecionada' : 'Usar'}</button>
      </div>)}
      <a href="/settings">Gerenciar conexões</a>
    </div>}
  </div>
}

function BuilderModelSelector({ choices, value, onChange, disabled }: Readonly<{
  choices: readonly BuilderSession['modelChoices'][number][]
  value: string
  onChange: (choiceId: string) => void
  disabled?: boolean
}>) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = choices.find((choice) => choice.choiceId === value) ?? choices[0]
  useEffect(() => {
    if (!open) return undefined
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    const closeOnEscape = (event: globalThis.KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', closeOnOutsidePointer)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePointer)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])
  return <div ref={rootRef} className="builder-model-selector">
    <button className="builder-model-trigger" type="button" disabled={disabled} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      <span className="builder-model-trigger-copy"><small>Modelo para o próximo pedido</small><strong>{selected?.label ?? 'Nenhum modelo admitido'}</strong></span>
      <span aria-hidden="true">{open ? '⌃' : '⌄'}</span>
    </button>
    {open && <div className="builder-model-popover" role="listbox" aria-label="Modelos admitidos pelo servidor">
      {choices.map((choice) => <button key={choice.choiceId} className="builder-model-option" type="button" role="option" aria-selected={choice.choiceId === selected?.choiceId} onClick={() => { onChange(choice.choiceId); setOpen(false) }}>
        <span><strong>{choice.label}</strong><small>{choice.providerId} · {choice.modelId}</small></span>
        {choice.choiceId === selected?.choiceId && <span aria-hidden="true">✓</span>}
      </button>)}
    </div>}
  </div>
}

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
  const [modelChoiceId, setModelChoiceId] = useState('')
  const [previewRatio, setPreviewRatio] = useState(2)
  const [mobilePane, setMobilePane] = useState<'PREVIEW' | 'CHAT'>('PREVIEW')
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const [observation, setObservation] = useState<BuilderObservation | null>(null)
  const [liveRequest, setLiveRequest] = useState<LiveRequest | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [requiresModelConnection, setRequiresModelConnection] = useState(false)
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null)
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
  const modelConnections = useConnectionQuery({ queryKey: modelConnectionsQueryKey, queryFn: listModelConnections })
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string; messageBoundary: number; modelChoiceId?: string }>) =>
      sendBuilderMessage(projectId, value.content, value.mode, value.key, value.modelChoiceId),
    onSuccess: async (result, variables) => {
      setContent((current) => current === variables.content ? '' : current)
      setMessage('Mensagem enviada ao Builder.')
      setRequiresModelConnection(false)
      setLiveRequest({ runId: result.builderRun.builderRunId, text: variables.content, messageBoundary: variables.messageBoundary })
      setObservation(null)
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else if (error instanceof BuilderRequestError && error.status === 422 && error.problemType === 'urn:conexus:problem:model-connection-required') {
        setMessage('Conecte um modelo do provedor selecionado antes de enviar um Build.')
        setRequiresModelConnection(true)
      } else {
        setMessage('Não foi possível enviar a mensagem ao Builder.')
        setRequiresModelConnection(false)
      }
    },
  })
  const runId = session.data?.latestBuilderRun?.builderRunId
  const run = session.data?.latestBuilderRun
  const runActive = run?.state === 'QUEUED' || run?.state === 'RUNNING'
  const modelChoices = session.data?.modelChoices ?? EMPTY_MODEL_CHOICES
  const selectedModelChoice = modelChoices.find((choice) => choice.choiceId === modelChoiceId) ?? null
  // A connection is only usable for the model that is actually selected: an Anthropic account
  // cannot pay for an OpenAI run, and the database refuses the mismatch anyway.
  const hasModelConnection = modelConnections.data?.connections.some((connection) =>
    connection.state === 'ACTIVE'
    && (!selectedModelChoice || connection.providerId === selectedModelChoice.providerId)) ?? false
  const connectionUnavailable = !modelConnections.isPending && !hasModelConnection
  const cancel = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('BUILDER_RUN_NOT_READY')
      return cancelBuilderRun(projectId, runId)
    },
    onSuccess: async () => { setMessage('Solicitação de interrupção enviada.'); await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] }) },
    onError: () => setMessage('Não foi possível interromper a execução atual.'),
  })
  useEffect(() => {
    const firstChoice = modelChoices.at(0)
    if (firstChoice && !selectedModelChoice) setModelChoiceId(firstChoice.choiceId)
    if (!firstChoice && modelChoiceId) setModelChoiceId('')
  }, [modelChoiceId, modelChoices, selectedModelChoice])
  useEffect(() => {
    if (!runId || !runActive) return undefined
    const controller = new AbortController()
    void observeBuilderRun(projectId, runId, controller.signal, setObservation)
    return () => controller.abort()
  }, [projectId, runActive, runId])
  const previousRunState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const wasActive = previousRunState.current === 'QUEUED' || previousRunState.current === 'RUNNING'
    previousRunState.current = run?.state
    if (!runId || !wasActive || runActive) return
    void session.refetch().finally(() => {
      setObservation(null)
      setLiveRequest(null)
    })
  }, [run, runActive, runId, session])
  const timelineMessages = session.data?.messages ?? []
  const hasLiveUser = Boolean(liveRequest && timelineMessages.slice(liveRequest.messageBoundary).some((item) => item.role === 'user' && messageText(item) === liveRequest.text))
  const persistedActivityIds = new Set(timelineMessages.flatMap((item) => item.parts.filter((part) => part.kind === 'ACTIVITY').map((part) => part.id)))
  const liveRequestPart = runActive && liveRequest && !hasLiveUser ? liveRequest : null
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
  const diffBasis = session.data?.latestCodeChangingRun
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
    queryKey: ['builder-run-trace', projectId, runId],
    queryFn: () => {
      if (!runId) throw new Error('BUILDER_TRACE_NOT_READY')
      return getBuilderRunTrace(projectId, runId)
    },
    enabled: inspection === 'DETAILS' && Boolean(runId),
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
  const previewLaunch = currentPreviewState.kind === 'ISSUED'
    ? currentPreviewState.lease.launch
    : currentPreviewState.lastGood?.launch
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = content.trim()
    if (!value || send.isPending || !selectedModelChoice || connectionUnavailable) {
      if (!selectedModelChoice && !session.isPending) setMessage('Nenhum modelo admitido foi retornado pelo servidor.')
      else if (connectionUnavailable) setMessage('Conecte um modelo do provedor selecionado antes de enviar um Build.')
      return
    }
    send.mutate({ content: value, mode, key: crypto.randomUUID(), messageBoundary: session.data?.messages.length ?? 0, ...(modelChoiceId ? { modelChoiceId } : {}) })
  }
  const onComposerKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      event.currentTarget.form?.requestSubmit()
    }
  }
  useEffect(() => { if (previewLaunch) queueMicrotask(() => entryForm.current?.requestSubmit()) }, [previewLaunch])

  if (session.isError) {
    const denied = session.error instanceof BuilderRequestError && session.error.status === 403
    return <section className="builder-unavailable" role="alert">
      <h2>{denied ? 'Build indisponível neste Project' : 'Não foi possível carregar o Build'}</h2>
      <p>{denied ? 'Sua conta pode consultar este Project, mas não possui autoridade de Build para ele.' : 'O servidor não conseguiu consultar a sessão real do Builder.'}</p>
    </section>
  }

  const liveView = observation?.view ?? null
  const observationNotice = observation ? observationNotices[observation.status] ?? null : null
  const visiblePhase = liveView?.phase ?? run?.phase ?? null
  const activeStatus = runStatus(run?.state, run?.resultKind, visiblePhase, run?.failureCode)
  const hasChoices = modelChoices.length > 0
  const latestActivity = liveView?.activities.at(-1)

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
          {run?.modelId && <small>Modelo admitido: {run.modelId}</small>}
        </div>
        {!previewReady && !previewLaunch && <div className="preview-empty"><div className="preview-empty-mark" aria-hidden="true">⌁</div><strong>Seu aplicativo aparecerá aqui</strong><span>Envie uma solicitação pelo chat para criar o primeiro Preview real.</span></div>}
        {previewReady && !previewLaunch && <p className="preview-last-good"><strong>Último Preview bom disponível.</strong><span>Ainda não há uma sessão de Preview aberta.</span></p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p className="preview-warning" role="alert"><strong>A nova fonte não compilou.</strong><span>O Preview anterior continua disponível para você.</span>{run.failureCode && <code>{run.failureCode}</code>}</p>}
        {previewLaunch && <><div className="preview-frame-stack"><div className="preview-frame-bar"><span aria-hidden="true" /><span>Aplicativo autorizado</span><button type="button" onClick={() => { if (previewKey) launchPreviewForKey(previewKey) }}>Reabrir</button></div><iframe title="Preview do aplicativo" name={frameName} src="about:blank" /></div><form ref={entryForm} hidden method="post" action={previewLaunch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={previewLaunch.entryGrant} /></form>{currentPreviewState.kind === 'ISSUED' && <p className="preview-issued">Preview emitido e carregado com acesso autorizado.</p>}</>}
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
            <div><dt>Última execução</dt><dd><code>{run?.builderRunId ?? 'Nenhuma'}</code> · {runStatus(run?.state, run?.resultKind, null, run?.failureCode)}</dd></div>
          </dl>
          <h3>Histórico recente</h3>
          {(session.data?.runHistory?.length ?? 0) === 0 && <p>Nenhuma execução persistida.</p>}
          {session.data?.runHistory && session.data.runHistory.length > 0 && <ol className="builder-run-history">{session.data.runHistory.map((historyRun) => <li key={historyRun.builderRunId}><code>{historyRun.builderRunId}</code><span>{runStatus(historyRun.state, historyRun.resultKind, null, historyRun.failureCode)}</span>{historyRun.modelId && <small>{historyRun.modelId}</small>}</li>)}</ol>}
          <h3>Trace nativo</h3>
          {trace.isPending && <p>Consultando trace…</p>}
          {trace.isError && <p role="alert">Trace indisponível.</p>}
          {trace.data && !trace.data.available && <p>Trace não disponível para esta execução.</p>}
          {trace.data?.available && <><p><code>{trace.data.traceId}</code></p><ul className="builder-trace-list">{trace.data.spans.map((span) => <li key={`${span.spanType}-${span.name}-${span.startedAt}`}><strong>{span.spanType}</strong><span>{span.name}</span><small>{span.durationMs === null ? 'duração indisponível' : `${span.durationMs} ms`}{span.error ? ' · erro' : ''}</small></li>)}</ul></>}
        </section>}
      </section>
      {!chatCollapsed && <aside data-mobile-pane={mobilePane} className="conexus-panel" aria-labelledby="conexus-panel-title">
        <div className="builder-panel-heading"><div><p className="eyebrow">Conexus Builder</p><h2 id="conexus-panel-title">Converse com o Conexus</h2><p className="builder-surface-caption">Peça alterações e acompanhe o que está acontecendo.</p></div><BuilderModelConnection initialOpen={requiresModelConnection} /></div>
        <section ref={conversationRef} onScroll={onConversationScroll} className="builder-conversation" aria-label="Mensagens do Builder" aria-live="polite">
          {timelineMessages.flatMap((item) => {
            const textOccurrences = new Map<string, number>()
            return item.parts.map((part) => {
              if (part.kind === 'ACTIVITY') return <div key={part.id} className="builder-timeline-item builder-activity" data-state={part.state}><span className="builder-activity-icon" aria-hidden="true">{part.state === 'failed' ? '!' : part.state === 'succeeded' ? '✓' : '·'}</span><span><strong>{activityLabel(part.label)}</strong>{part.path && <small>{part.path}</small>}<span>{activityState(part.state)}</span></span></div>
              const occurrence = textOccurrences.get(part.text) ?? 0
              textOccurrences.set(part.text, occurrence + 1)
              return <div key={`${item.id}-text-${part.text}-${occurrence}`} className={`builder-timeline-item builder-message builder-message-${item.role}`}><strong>{item.role === 'user' ? 'Você' : 'Conexus'}</strong><BuilderMarkdown text={part.text} /></div>
            })
          })}
          {liveRequestPart && <div key={liveRequestPart.runId} className="builder-timeline-item builder-message builder-message-user"><strong>Você</strong><BuilderMarkdown text={liveRequestPart.text} /></div>}
          {runActive && liveView?.message && <div key={liveView.message.id} className="builder-timeline-item builder-message builder-message-assistant"><BuilderMarkdown text={liveView.message.text || ' '}/></div>}
          {liveView?.activities.filter((activity) => !persistedActivityIds.has(activity.id)).map((activity) => <div key={activity.id} className="builder-timeline-item builder-activity" data-state={activity.state}><span className="builder-activity-icon" aria-hidden="true">{activity.state === 'failed' ? '!' : activity.state === 'succeeded' ? '✓' : '·'}</span><span><strong>{activityLabel(activity.label)}</strong>{activity.detail && <small>{activity.detail}</small>}<span>{activityState(activity.state)}</span></span></div>)}
          {runActive && <div className="builder-live-status" role="status"><span className="builder-live-pulse" aria-hidden="true" /><strong>{latestActivity ? activityLabel(latestActivity.label) : activeStatus}</strong><span>{latestActivity ? 'Atividade recebida do Builder.' : 'Aguardando atividade do servidor…'}</span></div>}
          {runActive && observationNotice && <p className="builder-observation-notice" data-status={observation?.status} role={observation?.status === 'RECONNECTING' ? 'status' : 'alert'}>{observationNotice}</p>}
          {!timelineMessages.length && !liveRequestPart && !liveView?.message && !liveView?.activities.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
        </section>
        <form onSubmit={submit}>
          <label className="builder-composer-label" htmlFor={inputId}>O que o Project precisa fazer?</label>
          <div className="builder-composer-box"><textarea id={inputId} rows={4} required placeholder="Descreva uma alteração ou pergunte sobre o Project…" value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={onComposerKeyDown} /><div className="builder-composer-footer"><span>Enter envia · Shift+Enter quebra linha</span><button className="primary builder-send-button" type="submit" disabled={send.isPending || runActive || !hasChoices || connectionUnavailable}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button></div></div>
          <BuilderModelSelector choices={modelChoices} value={modelChoiceId} onChange={setModelChoiceId} disabled={!hasChoices || runActive} />
          {!hasChoices && !session.isPending && <p className="builder-no-model" role="alert">Nenhum modelo admitido foi retornado pelo servidor. Não é possível enviar uma solicitação.</p>}
          {connectionUnavailable && <p className="builder-no-model" role="alert">Nenhuma conexão de modelo ativa para o provedor selecionado. <a href="/settings">Abrir configurações</a></p>}
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button className={mode === 'BUILD' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button className={mode === 'PLAN' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          {runActive && <button className="builder-stop-button" type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending || run?.cancellationRequested}>{cancel.isPending || run?.cancellationRequested ? 'Parando execução…' : 'Parar execução'}</button>}
          {message && <p className="builder-form-message" role="status" aria-live="polite">{message}{requiresModelConnection && <> <a href="/settings">Abrir configurações</a></>}</p>}
          {runActive && <p className="builder-form-hint">A troca de modelo vale somente para o próximo pedido.</p>}
        </form>
      </aside>}
    </div>
    <button className="builder-collapse-chat" type="button" onClick={() => setChatCollapsed((current) => !current)}>{chatCollapsed ? 'Mostrar conversa' : 'Ocultar conversa'}</button>
  </div>
}
