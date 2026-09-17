import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CSSProperties, FormEvent, KeyboardEvent } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { useMutation as useClaudeMutation, useQuery as useClaudeQuery, useQueryClient as useClaudeQueryClient } from '@tanstack/react-query'
import { claudeConnectionsQueryKey, listClaudeConnections, selectClaudeConnection } from '../../claude-account/api'
import { BuilderRequestError, cancelBuilderRun, getBuilderRunTrace, getBuilderSession, getProjectSourceFile, launchBuilderPreview, listProjectSourceTree, sendBuilderMessage, type PreviewLaunch, type SourceTree } from '../api'
import { observeBuilderRun, type BuilderLiveView } from '../observation'
import { BuilderMarkdown } from './builder-markdown'

const runStatus = (state: string | undefined, kind: string | null | undefined): string => {
  if (state === 'QUEUED' || state === 'RUNNING') return 'Trabalhando…'
  if (kind === 'RESPONSE_ONLY') return 'Resposta somente'
  if (kind === 'SOURCE_CHANGED_BUILD_FAILED') return 'Build falhou; o Preview anterior continua disponível'
  if (kind === 'SOURCE_CHANGED' || state === 'SUCCEEDED') return 'Build concluído'
  if (state === 'INTERRUPTED') return 'Execução interrompida'
  if (state === 'FAILED') return 'Execução falhou'
  return 'Pronto para construir'
}

const activityLabel = (label: BuilderLiveView['activities'][number]['label']): string => ({
  READ_FILES: 'Lendo arquivos', EDIT_FILES: 'Editando', RUN_COMMAND: 'Executando comando', WORKSPACE: 'Trabalhando no Workspace',
}[label])

const activityState = (state: BuilderLiveView['activities'][number]['state']): string => ({
  started: 'em andamento', succeeded: 'concluído', failed: 'falhou', interrupted: 'interrompido',
}[state])

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

function BuilderClaudeConnection() {
  const [open, setOpen] = useState(false)
  const claudeQuery = useClaudeQuery({ queryKey: claudeConnectionsQueryKey, queryFn: listClaudeConnections, enabled: open })
  const claudeQueryClient = useClaudeQueryClient()
  const select = useClaudeMutation({
    mutationFn: selectClaudeConnection,
    onSuccess: async () => { await claudeQueryClient.invalidateQueries({ queryKey: claudeConnectionsQueryKey }); setOpen(false) },
  })
  const active = claudeQuery.data?.find((connection) => connection.state === 'ACTIVE')
  return <div className="builder-connection">
    <button type="button" onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-controls="builder-claude-connection">
      Claude: {active ? active.label : 'conexão necessária'}
    </button>
    {open && <dialog id="builder-claude-connection" open aria-labelledby="builder-claude-connection-title">
      <div className="dialog-heading"><div><p className="eyebrow">Credencial do Builder</p><h3 id="builder-claude-connection-title">Conexão Claude</h3></div><button type="button" onClick={() => setOpen(false)} aria-label="Fechar conexão">Fechar</button></div>
      <p className="panel-intro">A conta selecionada é resolvida no servidor e vale somente para novos BuilderRuns.</p>
      {claudeQuery.isPending && <p>Carregando conexões…</p>}
      {claudeQuery.isError && <p role="alert">Não foi possível consultar as conexões Claude.</p>}
      {claudeQuery.data?.length === 0 && <p>Nenhuma conexão Claude disponível. <a href="/settings">Abrir configurações</a></p>}
      {claudeQuery.data?.map((connection) => <div className="builder-connection-option" key={connection.connectionId}>
        <span><strong>{connection.label}</strong><small>{connection.state === 'ACTIVE' ? 'Ativa' : 'Revogada'} · {connection.role === 'OWNER' ? 'Sua conexão' : 'Compartilhada'}</small></span>
        <button type="button" disabled={connection.state !== 'ACTIVE' || select.isPending} onClick={() => select.mutate(connection.connectionId)}>{connection.connectionId === active?.connectionId ? 'Selecionada' : 'Usar'}</button>
      </div>)}
      <a href="/settings">Gerenciar conexões</a>
    </dialog>}
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
  const [liveView, setLiveView] = useState<BuilderLiveView | null>(null)
  const [liveRequest, setLiveRequest] = useState<LiveRequest | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [requiresClaudeConnection, setRequiresClaudeConnection] = useState(false)
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
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string; messageBoundary: number; modelChoiceId?: string }>) =>
      sendBuilderMessage(projectId, value.content, value.mode, value.key, value.modelChoiceId),
    onSuccess: async (result, variables) => {
      setContent((current) => current === variables.content ? '' : current)
      setMessage('Mensagem enviada ao Builder.')
      setRequiresClaudeConnection(false)
      setLiveRequest({ runId: result.builderRun.builderRunId, text: variables.content, messageBoundary: variables.messageBoundary })
      setLiveView(null)
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else if (error instanceof BuilderRequestError && error.status === 422 && error.problemType === 'urn:conexus:problem:claude-connection-required') {
        setMessage('Conecte uma conta Claude antes de enviar um Build.')
        setRequiresClaudeConnection(true)
      } else {
        setMessage('Não foi possível enviar a mensagem ao Builder.')
        setRequiresClaudeConnection(false)
      }
    },
  })
  const runId = session.data?.latestBuilderRun?.builderRunId
  const run = session.data?.latestBuilderRun
  const runActive = run?.state === 'QUEUED' || run?.state === 'RUNNING'
  const cancel = useMutation({
    mutationFn: () => {
      if (!runId) throw new Error('BUILDER_RUN_NOT_READY')
      return cancelBuilderRun(projectId, runId)
    },
    onSuccess: async () => { setMessage('Solicitação de interrupção enviada.'); await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] }) },
    onError: () => setMessage('Não foi possível interromper a execução atual.'),
  })
  useEffect(() => {
    const firstChoice = session.data?.modelChoices?.at(0)
    if (firstChoice && !modelChoiceId) setModelChoiceId(firstChoice.choiceId)
  }, [modelChoiceId, session.data?.modelChoices])
  useEffect(() => {
    if (!runId || !runActive) return undefined
    const controller = new AbortController()
    void observeBuilderRun(projectId, runId, controller.signal, setLiveView).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runActive, runId])
  const previousRunState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const wasActive = previousRunState.current === 'QUEUED' || previousRunState.current === 'RUNNING'
    previousRunState.current = run?.state
    if (!runId || !wasActive || runActive) return
    void session.refetch().finally(() => {
      setLiveView(null)
      setLiveRequest(null)
    })
  }, [run, runActive, runId, session])
  const timelineMessages = session.data?.messages ?? []
  const hasLiveUser = Boolean(liveRequest && timelineMessages.slice(liveRequest.messageBoundary).some((item) => item.role === 'user' && item.text === liveRequest.text))
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
    if (!value || send.isPending) return
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

  return <div className="project-build">
    <nav className="builder-mobile-switcher" aria-label="Painel do Builder">
      <button type="button" aria-pressed={mobilePane === 'PREVIEW'} onClick={() => setMobilePane('PREVIEW')}>Preview</button>
      <button type="button" aria-pressed={mobilePane === 'CHAT'} onClick={() => setMobilePane('CHAT')}>Conversa</button>
    </nav>
    <div className="build-workspace" style={{ '--builder-preview-ratio': `${previewRatio}fr` } as CSSProperties}>
      <section ref={previewSurfaceRef} data-mobile-pane={mobilePane} className="build-preview-surface" aria-labelledby="build-preview-title">
        <div className="work-heading"><div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2></div><div className="builder-pane-actions"><label>Divisão <input aria-label="Tamanho do Preview" type="range" min="1" max="3" step=".1" value={previewRatio} onChange={(event) => setPreviewRatio(Number(event.target.value))} /></label><button type="button" onClick={() => void previewSurfaceRef.current?.requestFullscreen?.()}>Tela cheia</button></div></div>
        <nav className="build-lenses" aria-label="Inspeção técnica">
          <button type="button" aria-pressed={inspection === null} onClick={() => setInspection(null)}>Preview</button>
          <button type="button" aria-pressed={inspection === 'CODE'} onClick={() => setInspection('CODE')}>Código</button>
          <button type="button" aria-pressed={inspection === 'DIFF'} onClick={() => setInspection('DIFF')}>Diff</button>
          <button type="button" aria-pressed={inspection === 'DETAILS'} onClick={() => setInspection('DETAILS')}>Detalhes</button>
        </nav>
        {previewReady
          ? <p><strong>Último Preview bom disponível.</strong></p>
          : <p className="preview-empty">O Preview aparecerá depois do primeiro Build bem-sucedido.</p>}
        {run && <p role="status" aria-live="polite">{runStatus(run.state, run.resultKind)}{run.modelId ? ` · ${run.modelId}` : ''}</p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p role="alert">A nova fonte foi preservada para a próxima correção.{run.failureCode ? ` Diagnóstico: ${run.failureCode}.` : ''}</p>}
        {previewLaunch && <><div className="preview-frame-stack"><iframe title="Preview do aplicativo" name={frameName} src="about:blank" /></div><form ref={entryForm} hidden method="post" action={previewLaunch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={previewLaunch.entryGrant} /></form>{currentPreviewState.kind === 'ISSUED' && <><p>Preview emitido.</p><button type="button" onClick={() => { if (previewKey) launchPreviewForKey(previewKey) }}>Reabrir Preview</button></>}</>}
        {previewFailed && <><p role="alert">Não foi possível abrir o Preview atual.</p><button type="button" onClick={retryPreview}>Tentar novamente</button></>}
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
            <div><dt>Última execução</dt><dd><code>{run?.builderRunId ?? 'Nenhuma'}</code> · {runStatus(run?.state, run?.resultKind)}</dd></div>
          </dl>
          <h3>Histórico recente</h3>
          {(session.data?.runHistory?.length ?? 0) === 0 && <p>Nenhuma execução persistida.</p>}
          {session.data?.runHistory && session.data.runHistory.length > 0 && <ol className="builder-run-history">{session.data.runHistory.map((historyRun) => <li key={historyRun.builderRunId}><code>{historyRun.builderRunId}</code><span>{runStatus(historyRun.state, historyRun.resultKind)}</span>{historyRun.modelId && <small>{historyRun.modelId}</small>}</li>)}</ol>}
          <h3>Trace nativo</h3>
          {trace.isPending && <p>Consultando trace…</p>}
          {trace.isError && <p role="alert">Trace indisponível.</p>}
          {trace.data && !trace.data.available && <p>Trace não disponível para esta execução.</p>}
          {trace.data?.available && <><p><code>{trace.data.traceId}</code></p><ul className="builder-trace-list">{trace.data.spans.map((span) => <li key={`${span.spanType}-${span.name}-${span.startedAt}`}><strong>{span.spanType}</strong><span>{span.name}</span><small>{span.durationMs === null ? 'duração indisponível' : `${span.durationMs} ms`}{span.error ? ' · erro' : ''}</small></li>)}</ul></>}
        </section>}
      </section>
      {!chatCollapsed && <aside data-mobile-pane={mobilePane} className="conexus-panel" aria-labelledby="conexus-panel-title">
        <div className="builder-panel-heading"><div><p className="eyebrow">Conexus</p><h2 id="conexus-panel-title">Converse com o Conexus</h2></div><BuilderClaudeConnection /></div>
        <section ref={conversationRef} onScroll={onConversationScroll} className="builder-conversation" aria-label="Mensagens do Builder">
          {timelineMessages.map((item) => <div key={item.id} className={`builder-timeline-item builder-message builder-message-${item.role}`}><strong>{item.role === 'user' ? 'Você' : 'Conexus'}</strong><BuilderMarkdown text={item.text} /></div>)}
          {liveRequestPart && <div key={liveRequestPart.runId} className="builder-timeline-item builder-message builder-message-user"><strong>Você</strong><BuilderMarkdown text={liveRequestPart.text} /></div>}
          {runActive && liveView?.message && <div key={liveView.message.id} className="builder-timeline-item builder-message builder-message-assistant"><BuilderMarkdown text={liveView.message.text || ' '}/></div>}
          {runActive && liveView?.activities.map((activity) => <div key={activity.id} className="builder-timeline-item builder-activity" data-state={activity.state}><span className="builder-activity-icon" aria-hidden="true">{activity.state === 'failed' ? '!' : activity.state === 'succeeded' ? '✓' : '·'}</span><span><strong>{activityLabel(activity.label)}</strong>{activity.detail && <small>{activity.detail}</small>}<span>{activityState(activity.state)}</span></span></div>)}
          {runActive && <p className="builder-run-status" role="status" aria-live="polite">Trabalhando…</p>}
          {!timelineMessages.length && !liveRequestPart && !liveView?.message && !liveView?.activities.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
        </section>
        <form onSubmit={submit}>
          <label htmlFor={inputId}>O que o Project precisa fazer?</label>
          <textarea id={inputId} rows={5} required value={content} onChange={(event) => setContent(event.target.value)} onKeyDown={onComposerKeyDown} />
          <label htmlFor={`${inputId}-model`}>Modelo para a próxima solicitação</label>
          <select id={`${inputId}-model`} value={modelChoiceId} onChange={(event) => setModelChoiceId(event.target.value)} disabled={!session.data?.modelChoices?.length}>
            {session.data?.modelChoices?.map((choice) => <option key={choice.choiceId} value={choice.choiceId}>{choice.label} · {choice.providerId}</option>)}
          </select>
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button className={mode === 'BUILD' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button className={mode === 'PLAN' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          <button className="primary" type="submit" disabled={send.isPending || run?.state === 'QUEUED' || run?.state === 'RUNNING'}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button>
          {runActive && <button type="button" onClick={() => cancel.mutate()} disabled={cancel.isPending}>{cancel.isPending ? 'Parando…' : 'Parar execução'}</button>}
          <p role="status" aria-live="polite">{message}{requiresClaudeConnection && <> <a href="/settings">Abrir configurações</a></>}</p>
          {runActive && <p>O Builder está trabalhando. A troca de modelo vale para a próxima solicitação.</p>}
        </form>
      </aside>}
    </div>
    <button className="builder-collapse-chat" type="button" onClick={() => setChatCollapsed((current) => !current)}>{chatCollapsed ? 'Mostrar conversa' : 'Ocultar conversa'}</button>
  </div>
}
