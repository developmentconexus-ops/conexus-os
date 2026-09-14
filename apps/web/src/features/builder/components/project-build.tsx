import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, getBuilderSession, getBuildPreview, launchBuilderPreview, sendBuilderMessage } from '../api'
import { observeBuilderRun, type ObservationPart } from '../observation'

const runStatus = (state: string | undefined, kind: string | null | undefined): string => {
  if (state === 'QUEUED' || state === 'RUNNING') return 'Trabalhando…'
  if (kind === 'RESPONSE_ONLY') return 'Resposta somente'
  if (kind === 'SOURCE_CHANGED_BUILD_FAILED') return 'Build falhou; o Preview anterior continua disponível'
  if (kind === 'SOURCE_CHANGED' || state === 'SUCCEEDED') return 'Build concluído'
  if (state === 'INTERRUPTED') return 'Execução interrompida'
  if (state === 'FAILED') return 'Execução falhou'
  return 'Pronto para construir'
}

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const queryClient = useQueryClient()
  const [content, setContent] = useState('')
  const [mode, setMode] = useState<'BUILD' | 'PLAN'>('BUILD')
  const [message, setMessage] = useState('')
  const [activity, setActivity] = useState<readonly ObservationPart[]>([])
  const [launch, setLaunch] = useState<Readonly<{ previewUrl: string; entryUrl: string; entryGrant: string }>>()
  const frameName = `builder-preview-${inputId.replaceAll(':', '')}`
  const entryForm = useRef<HTMLFormElement>(null)
  const session = useQuery({
    queryKey: ['builder-session', projectId], queryFn: () => getBuilderSession(projectId),
    refetchInterval: (query) => query.state.data?.activeBuilderRun?.state === 'RUNNING' ? 1_000 : 2_000,
  })
  const preview = useQuery({
    queryKey: ['builder-preview', projectId], queryFn: () => getBuildPreview(projectId),
    refetchInterval: () => session.data?.activeBuilderRun ? 1_000 : false,
  })
  const send = useMutation({
    mutationFn: (value: Readonly<{ content: string; mode: 'BUILD' | 'PLAN'; key: string }>) =>
      sendBuilderMessage(projectId, value.content, value.mode, value.key),
    onSuccess: async () => {
      setContent('')
      setMessage('Mensagem enviada ao Builder.')
      await queryClient.invalidateQueries({ queryKey: ['builder-session', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 409) setMessage('O Project está ocupado ou recebeu outra alteração. Aguarde e tente novamente.')
      else if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else setMessage('Não foi possível enviar a mensagem ao Builder.')
    },
  })
  const runId = session.data?.activeBuilderRun?.builderRunId
  useEffect(() => {
    if (!runId) return undefined
    const controller = new AbortController()
    void observeBuilderRun(projectId, runId, controller.signal, setActivity).catch(() => undefined)
    return () => controller.abort()
  }, [projectId, runId])
  const openPreview = useMutation({
    mutationFn: () => {
      if (!run?.resultSourceRevision || !previewSummary?.lastGoodArtifactRevisionId || !previewSummary.lastGoodArtifactDigest) throw new Error('PREVIEW_NOT_READY')
      return launchBuilderPreview(projectId, { builderRunId: run.builderRunId, sourceRevision: run.resultSourceRevision, artifactRevisionId: previewSummary.lastGoodArtifactRevisionId, artifactDigest: previewSummary.lastGoodArtifactDigest })
    },
    onSuccess: (result) => setLaunch(result),
    onError: () => setMessage('Não foi possível abrir o Preview atual.'),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = content.trim()
    if (!value || send.isPending) return
    send.mutate({ content: value, mode, key: crypto.randomUUID() })
  }
  const run = session.data?.activeBuilderRun
  const previewSummary = session.data?.preview
  const previewReady = Boolean(previewSummary?.lastGoodArtifactRevisionId)
  useEffect(() => { if (launch) queueMicrotask(() => entryForm.current?.requestSubmit()) }, [launch])

  return <div className="project-build">
    <div className="build-workspace">
      <section className="build-preview-surface" aria-labelledby="build-preview-title">
        <div className="work-heading"><div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2></div></div>
        {preview.isError && <p role="alert">Não foi possível consultar o estado do Preview.</p>}
        {previewReady
          ? <div><p><strong>Último Preview bom disponível.</strong></p><p>Fonte: <code>{previewSummary?.workingSourceRevision}</code></p><p>Artefato: <code>{previewSummary?.lastGoodArtifactRevisionId}</code></p><button type="button" disabled={openPreview.isPending} onClick={() => openPreview.mutate()}>{openPreview.isPending ? 'Abrindo…' : 'Abrir Preview'}</button></div>
          : <p className="preview-empty">O Preview aparecerá depois do primeiro Build bem-sucedido.</p>}
        {run && <p role="status" aria-live="polite">{runStatus(run.state, run.resultKind)}</p>}
        {run?.resultKind === 'SOURCE_CHANGED_BUILD_FAILED' && <p role="alert">A nova fonte foi preservada para a próxima correção.</p>}
        {launch && <><iframe title="Preview do aplicativo" name={frameName} src="about:blank" /><form ref={entryForm} hidden method="post" action={launch.entryUrl} target={frameName}><input type="hidden" name="entryGrant" value={launch.entryGrant} /></form><p>Preview aberto da fonte <code>{run?.resultSourceRevision}</code>.</p></>}
      </section>
      <aside className="conexus-panel" aria-labelledby="conexus-panel-title">
        <p className="eyebrow">Conexus</p><h2 id="conexus-panel-title">Converse com o Conexus</h2>
        <section className="builder-conversation" aria-label="Mensagens do Builder">
          {session.data?.messages.map((item) => <p key={item.id} className={`builder-message builder-message-${item.role}`}><strong>{item.role === 'user' ? 'Você' : 'Conexus'}</strong><br />{item.text}</p>)}
          {activity.map((part) => part.kind === 'text' ? <p key={part.id} className="builder-message">{part.text}</p> : part.kind === 'phase' ? <p key={part.id} className="builder-phase">{part.phase}</p> : <p key={part.id} className="builder-activity">{part.label} — {part.state}</p>)}
          {!session.data?.messages.length && <p className="builder-conversation-empty">Descreva o aplicativo que você quer criar.</p>}
        </section>
        <form onSubmit={submit}>
          <label htmlFor={inputId}>O que o Project precisa fazer?</label>
          <textarea id={inputId} rows={5} required value={content} onChange={(event) => setContent(event.target.value)} />
          <fieldset className="builder-mode-toggle">
            <legend>Modo do Builder</legend>
            <button type="button" aria-pressed={mode === 'BUILD'} onClick={() => setMode('BUILD')}>Build</button>
            <button type="button" aria-pressed={mode === 'PLAN'} onClick={() => setMode('PLAN')}>Plan</button>
          </fieldset>
          <button className="primary" type="submit" disabled={send.isPending || run?.state === 'QUEUED' || run?.state === 'RUNNING'}>{send.isPending ? 'Enviando…' : 'Enviar mensagem'}</button>
          <p role="status" aria-live="polite">{message}</p>
        </form>
      </aside>
    </div>
  </div>
}
