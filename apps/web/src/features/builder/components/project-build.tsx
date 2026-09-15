import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, getBuilderSession, getProjectSourceFile, launchBuilderPreview, listProjectSourceTree, sendBuilderMessage, type SourceTree } from '../api'
import { observeBuilderRun, type ObservationPart } from '../observation'
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

const activityLabel = (label: Extract<ObservationPart, { kind: 'activity' }>['label']): string => ({
  READ_FILES: 'Lendo arquivos', EDIT_FILES: 'Editando', RUN_COMMAND: 'Executando comando', WORKSPACE: 'Trabalhando no Workspace',
}[label])

const activityState = (state: Extract<ObservationPart, { kind: 'activity' }>['state']): string => ({
  started: 'em andamento', succeeded: 'concluído', failed: 'falhou', interrupted: 'interrompido',
}[state])

type Inspection = 'CODE' | 'DIFF' | 'DETAILS'
type SourceDiffEntry = Readonly<{ path: string; status: 'ADDED' | 'REMOVED' | 'MODIFIED' }>
type SourceSnapshot = Readonly<{ sourceRevision: string; files: ReadonlyMap<string, string> }>
type LiveRequest = Readonly<{ runId: string; text: string; messageBoundary: number }>

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
  const [liveParts, setLiveParts] = useState<readonly ObservationPart[]>([])
  const [liveRequest, setLiveRequest] = useState<LiveRequest | null>(null)
  const [inspection, setInspection] = useState<Inspection | null>(null)
  const [selectedSourcePath, setSelectedSourcePath] = useState<string | null>(null)
  const [launch, setLaunch] = useState<Readonly<{ previewUrl: string; entryUrl: string; entryGrant: string }>>()
  const frameName = `builder-preview-${inputId.replaceAll(':', '')}`
  const entryForm = useRef<HTMLFormElement>(null)
  const conversationRef = useRef<HTMLElement>(null)
  const followTail = useRef(true)
  const session = useQuery({
    queryKey: ['builder-session', projectId], queryFn: () => getBuilderSession(projectId),
    refetchInterval: (query) => query.state.data?.latestBuilderRun?.state === 'RUNNING' ? 1_000 : 2_000,
  })
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string; messageBoundary: number }>) =>
      sendBuilderMessage(projectId, value.content, value.mode, value.key),
    onSuccess: async (result, variables) => {
      setContent((current) => current === variables.content ? '' : current)
      setMessage('Mensagem enviada ao Builder.')
      setLiveRequest({ runId: result.builderRun.builderRunId, text: variables.content, messageBoundary: variables.messageBoundary })
      setLiveParts([])
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else setMessage('Não foi possível enviar a mensagem ao Builder.')
    },
  })
  const runId = session.data?.latestBuilderRun?.builderRunId
  const run = session.data?.latestBuilderRun
  const runActive = run?.state === 'QUEUED' || run?.state === 'RUNNING'
  useEffect(() => {
    if (!runId || !runActive) return undefined
    const controller = new AbortController()
    void observeBuilderRun(projectId, runId, controller.signal, setLiveParts).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runActive, runId])
  const previousRunState = useRef<string | undefined>(undefined)
  useEffect(() => {
    const wasActive = previousRunState.current === 'QUEUED' || previousRunState.current === 'RUNNING'
    previousRunState.current = run?.state
    if (!runId || !wasActive || runActive) return
    void session.refetch().finally(() => {
      setLiveParts([])
      setLiveRequest(null)
    })
  }, [run, runActive, runId, session])
  const timelineMessages = session.data?.messages ?? []
  const hasLiveUser = Boolean(liveRequest && timelineMessages.slice(liveRequest.messageBoundary).some((item) => item.role === 'user' && item.text === liveRequest.text))
  const liveTimeline = runActive ? [
    ...(liveRequest && !hasLiveUser ? [{ kind: 'request' as const, id: liveRequest.runId, text: liveRequest.text }] : []),
    ...liveParts,
  ] : []
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
  const sourceTree = useQuery<SourceTree>({
    queryKey: ['builder-source-tree', projectId, workingSourceRevision],
    queryFn: () => listProjectSourceTree(projectId, workingSourceRevision as string),
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
  const sourceFile = useQuery({
    queryKey: ['builder-source-file', projectId, workingSourceRevision, selectedSourcePath],
    queryFn: () => getProjectSourceFile(projectId, workingSourceRevision as string, selectedSourcePath as string),
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
  const previewReady = Boolean(previewSummary?.lastGoodSourceRevision && previewSummary.lastGoodArtifactRevisionId && previewSummary.lastGoodArtifactDigest)
  const previewKey = previewReady ? `${previewSummary?.lastGoodSourceRevision}:${previewSummary?.lastGoodArtifactRevisionId}:${previewSummary?.lastGoodArtifactDigest}` : null
  const previewRequestKey = useRef<string | null>(null)
  const openPreview = useMutation({
    mutationFn: () => launchBuilderPreview(projectId),
    onSuccess: (result) => setLaunch(result),
    onError: () => { previewRequestKey.current = null; setMessage('Não foi possível abrir o Preview atual.') },
  })
  useEffect(() => {
    if (!previewKey || previewRequestKey.current === previewKey || openPreview.isPending) return
    previewRequestKey.current = previewKey
    openPreview.mutate()
  }, [openPreview, previewKey])
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = content.trim()
    if (!value || send.isPending) return
    send.mutate({ content: value, mode, key: crypto.randomUUID(), messageBoundary: session.data?.messages.length ?? 0 })
  }
  useEffect(() => { if (launch) queueMicrotask(() => entryForm.current?.requestSubmit()) }, [launch])

  return <div className="project-build">
    <div className="build-workspace">
      <section className="build-preview-surface" aria-labelledby="build-preview-title">
        <div className="work-heading"><div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2></div></div>
        <nav className="build-lenses" aria-label="Inspeção técnica">
          <button type="button" aria-pressed={inspection === null} onClick={() => setInspection(null)}>Preview</button>
          <button type="button" aria-pressed={inspection === 'CODE'} onClick={() => setInspection('CODE')}>Código</button>
          <button type="button" aria-pressed={inspection === 'DIFF'} onClick={() => setInspection('DIFF')}>Diff</button>
          <button type="button" aria-pressed={inspection === 'DETAILS'} onClick={() => setInspection('DETAILS')}>Detalhes</button>
        </nav>
        {session.isError && <p role="alert">Não foi possível consultar o estado do Preview.</p>}
        {previewReady
          ? <p><strong>Último Preview bom disponível.</strong></p>
          : <p className="preview-empty">O Preview aparecerá depois do primeiro Build bem-sucedido.</p>}
        {run && <p role="status" aria-live="polite">{runStatus(run.state, run.resultKind)}</p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p role="alert">A nova fonte foi preservada para a próxima correção.</p>}
        {launch && <><div className="preview-frame-stack"><iframe title="Preview do aplicativo" name={frameName} src="about:blank" /></div><form ref={entryForm} hidden method="post" action={launch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={launch.entryGrant} /></form><p>Preview pronto.</p></>}
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
        </section>}
      </section>
      <aside className="conexus-panel" aria-labelledby="conexus-panel-title">
        <p className="eyebrow">Conexus</p><h2 id="conexus-panel-title">Converse com o Conexus</h2>
        <section ref={conversationRef} onScroll={onConversationScroll} className="builder-conversation" aria-label="Mensagens do Builder">
          {timelineMessages.map((item) => <div key={item.id} className={`builder-timeline-item builder-message builder-message-${item.role}`}><strong>{item.role === 'user' ? 'Você' : 'Conexus'}</strong><BuilderMarkdown text={item.text} /></div>)}
          {liveTimeline.map((part) => part.kind === 'request'
            ? <div key={part.id} className="builder-timeline-item builder-message builder-message-user"><strong>Você</strong><BuilderMarkdown text={part.text} /></div>
            : part.kind === 'text'
              ? <div key={part.id} className="builder-timeline-item builder-message builder-message-assistant"><BuilderMarkdown text={part.text || ' '}/></div>
              : part.kind === 'activity'
                ? <div key={part.id} className="builder-timeline-item builder-activity" data-state={part.state}><span className="builder-activity-icon" aria-hidden="true">{part.state === 'failed' ? '!' : part.state === 'succeeded' ? '✓' : '·'}</span><span><strong>{activityLabel(part.label)}</strong>{part.detail && <small>{part.detail}</small>}<span>{activityState(part.state)}</span></span></div>
                : null)}
          {runActive && <p className="builder-run-status" role="status" aria-live="polite">Trabalhando…</p>}
          {!timelineMessages.length && !liveTimeline.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
        </section>
        <form onSubmit={submit}>
          <label htmlFor={inputId}>O que o Project precisa fazer?</label>
          <textarea id={inputId} rows={5} required value={content} onChange={(event) => setContent(event.target.value)} />
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button className={mode === 'BUILD' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button className={mode === 'PLAN' ? 'builder-mode-selected' : undefined} type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          <button className="primary" type="submit" disabled={send.isPending || run?.state === 'QUEUED' || run?.state === 'RUNNING'}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button>
          <p role="status" aria-live="polite">{message}</p>
        </form>
      </aside>
    </div>
  </div>
}
