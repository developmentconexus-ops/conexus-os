import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent, SyntheticEvent } from 'react'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, closeChangeFinding, createChange, getBuildPreview, getChange, getChangeDiff, getChangePlan, getChangeProgress, getProjectSourceFile, launchBuildPreview, listChangeEvidence, listChangeFindings, listChanges, listProjectSourceTree, prepareBuildPreview } from '../api'
import { BuilderConversation } from './builder-conversation'

const terminal = new Set(['PREVIEW_READY', 'BUILD_FAILED', 'RESPONDED', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'])
const hasCandidate = new Set(['PREPARING', 'PREVIEW_READY', 'BUILD_FAILED', 'RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED'])

type PreviewIdentity = Readonly<{ projectId: string; changeId: string; subjectDigest: string }>
type PreviewCommand = PreviewIdentity & Readonly<{ generation: number }>
type PreviewLaunchCommand = PreviewCommand & Readonly<{ attemptId: string; artifactRevisionId: string; artifactDigest: string }>
type PreviewLaunch = PreviewLaunchCommand & Readonly<{ entryUrl: string; previewUrl: string; entryGrant: string }>
type PreviewSurfaceState = 'IDLE' | 'OPENING' | 'OPEN'

const previewLaunchKey = (command: Readonly<{ projectId: string; changeId: string; attemptId: string }>) => `${command.projectId}:${command.changeId}:${command.attemptId}`

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const iframeName = `preview-frame-${inputId.replaceAll(':', '')}`
  const previewFrameName = (launch: PreviewLaunch) => `${iframeName}-${launch.generation}`
  const queryClient = useQueryClient()
  const attempt = useRef<Readonly<{ intent: string; key: string; expectedSourceRevision: string }> | undefined>(undefined)
  const [intent, setIntent] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [sourceSelection, setSourceSelection] = useState<Readonly<{ changeId: string; sourceRevision: string; path?: string }>>()
  const [message, setMessage] = useState('')
  const [previewMessage, setPreviewMessage] = useState('')
  const [activeLaunch, setActiveLaunch] = useState<PreviewLaunch>()
  const [pendingLaunch, setPendingLaunch] = useState<PreviewLaunch>()
  const [previewSurfaceState, setPreviewSurfaceState] = useState<PreviewSurfaceState>('IDLE')
  const [previewLens, setPreviewLens] = useState<'CODE' | 'DIFF' | null>(null)
  const generation = useRef(0)
  const latestProject = useRef(projectId)
  const latestSelection = useRef<Readonly<{ projectId: string; changeId: string | undefined }>>({ projectId, changeId: undefined })
  const latestPreview = useRef<PreviewIdentity | undefined>(undefined)
  const entrySubmitted = useRef<string | undefined>(undefined)
  const launchInFlight = useRef<string | undefined>(undefined)
  const entryForm = useRef<HTMLFormElement>(null)
  const changes = useQuery({
    queryKey: ['builder-changes', projectId], queryFn: () => listChanges(projectId), refetchInterval: 2_000,
  })
  const currentId = selectedId ?? changes.data?.[0]?.changeId
  latestProject.current = projectId
  const requireCurrentId = () => {
    if (!currentId) throw new Error('No current Change')
    return currentId
  }
  const currentPreview = useQuery({
    queryKey: ['builder-preview', projectId, 'current'], queryFn: () => getBuildPreview(projectId),
    refetchInterval: (query) => query.state.data?.activeChangeId ? 1_500 : false,
  })
  const change = useQuery({
    queryKey: ['builder-change', projectId, currentId], queryFn: () => getChange(projectId, requireCurrentId()),
    enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.state ?? '') ? false : 1_500,
  })
  const previewChangeId = change.data?.state === 'PREVIEW_READY' || change.data?.state === 'VERIFIED'
    ? currentId : currentPreview.data?.lastPreviewChangeId ?? undefined
  latestSelection.current = { projectId, changeId: previewChangeId }
  const candidatePreview = useQuery({
    queryKey: ['builder-preview', projectId, previewChangeId, change.data?.state], queryFn: () => getBuildPreview(projectId, previewChangeId),
    enabled: Boolean(previewChangeId),
    refetchInterval: (query) => query.state.data?.preparation?.state === 'PREPARING' ? 750 : false,
  })
  const plan = useQuery({ queryKey: ['builder-plan', projectId, currentId], queryFn: () => getChangePlan(projectId, requireCurrentId()), enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.progress ?? '') ? false : 2_000 })
  const progress = useQuery({ queryKey: ['builder-progress', projectId, currentId], queryFn: () => getChangeProgress(projectId, requireCurrentId()), enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.overallState ?? '') ? false : 1_500 })
  const diff = useQuery({ queryKey: ['builder-diff', projectId, currentId, change.data?.state], queryFn: () => getChangeDiff(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? ''), refetchInterval: terminal.has(change.data?.state ?? '') ? false : 2_000 })
  const findings = useQuery({ queryKey: ['builder-findings', projectId, currentId, change.data?.state], queryFn: () => listChangeFindings(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? ''), refetchInterval: terminal.has(change.data?.state ?? '') ? false : 2_000 })
  const evidence = useQuery({ queryKey: ['builder-evidence', projectId, currentId, change.data?.state], queryFn: () => listChangeEvidence(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? ''), refetchInterval: terminal.has(change.data?.state ?? '') ? false : 2_000 })
  const selectedSource = sourceSelection?.changeId === currentId ? sourceSelection : undefined
  const sourceTree = useQuery({
    queryKey: ['builder-source-tree', projectId, selectedSource?.sourceRevision],
    queryFn: () => listProjectSourceTree(projectId, selectedSource?.sourceRevision ?? ''),
    enabled: Boolean(selectedSource?.sourceRevision), staleTime: Number.POSITIVE_INFINITY,
  })
  const sourceFile = useQuery({
    queryKey: ['builder-source-file', projectId, selectedSource?.sourceRevision, selectedSource?.path],
    queryFn: () => getProjectSourceFile(projectId, selectedSource?.sourceRevision ?? '', selectedSource?.path ?? ''),
    enabled: Boolean(selectedSource?.sourceRevision && selectedSource.path), staleTime: Number.POSITIVE_INFINITY,
  })
  useEffect(() => {
    if (currentId && diff.data?.candidateSourceRevision && sourceSelection?.changeId !== currentId) {
      setSourceSelection({ changeId: currentId, sourceRevision: diff.data.candidateSourceRevision })
    }
  }, [currentId, diff.data?.candidateSourceRevision, sourceSelection?.changeId])
  const currentResolutionEvidence = evidence.data?.filter((item) => item.subjectDigest === diff.data?.candidateSourceRevision &&
    item.claim === 'Candidate satisfies the accepted Change intent.') ?? []
  const activeChange = Boolean(currentPreview.data?.activeChangeId &&
    (!change.data || !terminal.has(change.data.state)))
  const previewIdentity = previewChangeId && candidatePreview.data?.subjectKind === 'CHANGE_CANDIDATE'
    ? { projectId, changeId: previewChangeId, subjectDigest: candidatePreview.data.subjectDigest }
    : undefined
  latestPreview.current = previewIdentity
  const isCurrent = useCallback((command: PreviewCommand): boolean => generation.current === command.generation && latestProject.current === command.projectId && latestSelection.current.changeId === command.changeId && latestPreview.current?.subjectDigest === command.subjectDigest, [])
  const invalidateGeneration = useCallback(() => {
    generation.current += 1
    return generation.current
  }, [])
  useEffect(() => {
    latestProject.current = projectId
    invalidateGeneration()
    setSelectedId(undefined)
    setSourceSelection(undefined)
    attempt.current = undefined
    setIntent('')
    setActiveLaunch(undefined)
    setPendingLaunch(undefined)
    setPreviewSurfaceState('IDLE')
    setPreviewMessage('')
    launchInFlight.current = undefined
  }, [projectId, invalidateGeneration])
  const prepare = useMutation({
    mutationFn: (command: PreviewCommand) => prepareBuildPreview(command.projectId, { changeId: command.changeId, subjectDigest: command.subjectDigest }),
    onSuccess: async (result, command) => {
      if (!isCurrent(command)) return
      setPreviewMessage(result.state === 'PREPARING' ? 'Preparando Preview…' : 'Preparação do Preview recebida.')
      await queryClient.invalidateQueries({ queryKey: ['builder-preview', projectId, command.changeId] })
    },
    onError: (_error, command) => {
      if (isCurrent(command)) setPreviewMessage(activeLaunch ? 'Não foi possível preparar este Preview. A versão anterior continua disponível.' : 'Não foi possível preparar este Preview.')
    },
  })
  const launch = useMutation({
    mutationFn: (command: PreviewLaunchCommand) => launchBuildPreview(command.projectId, {
      changeId: command.changeId, subjectDigest: command.subjectDigest, attemptId: command.attemptId,
      artifactRevisionId: command.artifactRevisionId, artifactDigest: command.artifactDigest,
    }),
    onSuccess: (result, command) => {
      if (!isCurrent(command)) return
      const next = { ...command, entryUrl: result.entryUrl, previewUrl: result.previewUrl, entryGrant: result.entryGrant }
      setPendingLaunch(next)
      setPreviewSurfaceState('OPENING')
      setPreviewMessage('Abrindo Preview…')
    },
    onError: (_error, command) => {
      if (launchInFlight.current === previewLaunchKey(command)) launchInFlight.current = undefined
      if (isCurrent(command)) setPreviewMessage(activeLaunch ? 'Não foi possível abrir este Preview. A versão anterior continua disponível.' : 'Não foi possível abrir este Preview.')
    },
  })
  const startPreparation = () => {
    if (!previewIdentity || !(candidatePreview.data?.previewEligible ?? candidatePreview.data?.verified)) return
    const nextGeneration = invalidateGeneration()
    const command = { ...previewIdentity, generation: nextGeneration }
    setPreviewMessage('Preparando Preview…')
    prepare.mutate(command)
  }
  const launchPrepared = () => {
    const preparation = candidatePreview.data?.preparation
    if (!previewIdentity || preparation?.state !== 'PREPARED' || launch.isPending || pendingLaunch) return
    const nextGeneration = invalidateGeneration()
    const command = { ...previewIdentity, generation: nextGeneration, attemptId: preparation.attemptId, artifactRevisionId: preparation.artifactRevisionId, artifactDigest: preparation.artifactDigest }
    const key = previewLaunchKey(command)
    if (launchInFlight.current === key) return
    launchInFlight.current = key
    launch.mutate(command)
  }
  useEffect(() => {
    const preparation = candidatePreview.data?.preparation
    const subjectDigest = candidatePreview.data?.subjectDigest
    if (preparation?.state !== 'PREPARED' || !previewChangeId || !subjectDigest || launch.isPending || pendingLaunch) return
    const command = { projectId, changeId: previewChangeId, subjectDigest, generation: invalidateGeneration(), attemptId: preparation.attemptId, artifactRevisionId: preparation.artifactRevisionId, artifactDigest: preparation.artifactDigest }
    const key = previewLaunchKey(command)
    if (launchInFlight.current === key || (activeLaunch && activeLaunch.changeId === previewChangeId && activeLaunch.subjectDigest === subjectDigest)) return
    launchInFlight.current = key
    launch.mutate(command)
  }, [candidatePreview.data?.preparation, candidatePreview.data?.subjectDigest, previewChangeId, projectId, launch.isPending, pendingLaunch, activeLaunch, launch, invalidateGeneration])
  useEffect(() => {
    if (!pendingLaunch || entrySubmitted.current === `${pendingLaunch.generation}:${pendingLaunch.previewUrl}`) return
    const key = `${pendingLaunch.generation}:${pendingLaunch.previewUrl}`
    entrySubmitted.current = key
    queueMicrotask(() => {
      if (entrySubmitted.current !== key || !isCurrent(pendingLaunch) || !entryForm.current) return
      entryForm.current.requestSubmit()
    })
  }, [pendingLaunch, isCurrent])
  const settleEntry = async (event: SyntheticEvent<HTMLIFrameElement>) => {
    if (!pendingLaunch || !isCurrent(pendingLaunch)) return
    try {
      if (event.currentTarget.contentWindow?.location.href === 'about:blank') return
    } catch {
      // Cross-origin Preview documents cannot expose their location; the HEAD below is the status check.
    }
    try {
      const response = await fetch(pendingLaunch.previewUrl, { method: 'HEAD', credentials: 'include', cache: 'no-store' })
      if (!response.ok || !isCurrent(pendingLaunch)) {
        if (isCurrent(pendingLaunch)) {
          if (launchInFlight.current === previewLaunchKey(pendingLaunch)) launchInFlight.current = undefined
          setPendingLaunch(undefined)
          setPreviewSurfaceState(activeLaunch ? 'OPEN' : 'IDLE')
          setPreviewMessage(activeLaunch ? 'O Preview não confirmou uma entrada autorizada. A versão anterior continua disponível.' : 'O Preview não confirmou uma entrada autorizada.')
        }
        return
      }
    } catch {
      if (isCurrent(pendingLaunch)) {
        if (launchInFlight.current === previewLaunchKey(pendingLaunch)) launchInFlight.current = undefined
        setPendingLaunch(undefined)
        setPreviewSurfaceState(activeLaunch ? 'OPEN' : 'IDLE')
        setPreviewMessage(activeLaunch ? 'Não foi possível confirmar a entrada do Preview. A versão anterior continua disponível.' : 'Não foi possível confirmar a entrada do Preview.')
      }
      return
    }
    if (!isCurrent(pendingLaunch)) return
    setActiveLaunch(pendingLaunch)
    if (launchInFlight.current === previewLaunchKey(pendingLaunch)) launchInFlight.current = undefined
    setPendingLaunch(undefined)
    setPreviewSurfaceState('OPEN')
    setPreviewMessage('Preview carregando no endereço autorizado.')
  }
  const mutation = useMutation({
    mutationFn: (value: Readonly<{ intent: string; key: string; expectedSourceRevision: string }>) => createChange(projectId, value.intent, value.key, value.expectedSourceRevision),
    onSuccess: async (created) => {
      attempt.current = undefined
      setSelectedId(created.changeId)
      setIntent('')
      setMessage('Change criado. O Conexus iniciou o trabalho governado.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['builder-changes', projectId] }),
        queryClient.invalidateQueries({ queryKey: ['builder-preview', projectId, 'current'] }),
      ])
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else if (error instanceof BuilderRequestError && error.status === 404) setMessage('Este Project ainda não possui um Baseline aprovado para construir.')
      else if (error instanceof BuilderRequestError && error.status === 409) {
        attempt.current = undefined
        void queryClient.invalidateQueries({ queryKey: ['builder-preview', projectId] })
        setMessage('O projeto recebeu outra alteração ou ainda está trabalhando. Aguarde a atualização e envie novamente.')
      }
      else setMessage('O Change não foi confirmado. Tente novamente sem alterar o pedido.')
    },
  })
  const closeFinding = useMutation({
    mutationFn: (finding: Readonly<{ findingId: string; findingRevision: string }>) => {
      const resolution = currentResolutionEvidence.map((item) => item.evidenceId)
      if (resolution.length === 0) throw new Error('No current resolution Evidence')
      return closeChangeFinding(projectId, requireCurrentId(), finding.findingId, finding.findingRevision, resolution)
    },
    onSuccess: async () => {
      setMessage('Ponto resolvido com a verificação do candidato atual.')
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['builder-change', projectId, currentId] }),
        queryClient.invalidateQueries({ queryKey: ['builder-findings', projectId, currentId] }),
        queryClient.invalidateQueries({ queryKey: ['builder-changes', projectId] }),
      ])
    },
    onError: () => setMessage('A resolução não foi aceita. Atualize o Change e confirme a evidência atual.'),
  })
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const value = intent.trim()
    if (!value) { setMessage('Diga ao Conexus o que deve mudar.'); return }
    const expectedSourceRevision = currentPreview.data?.workingSourceRevision
    if (!expectedSourceRevision) { setMessage('A origem do projeto ainda está sendo carregada.'); return }
    if (attempt.current?.intent !== value) attempt.current = { intent: value, key: crypto.randomUUID(), expectedSourceRevision }
    setMessage('Criando o Change…')
    mutation.mutate(attempt.current)
  }

  return (
    <div className="project-build">
      <div className="build-workspace">
        <section className="build-preview-surface" aria-labelledby="build-preview-title">
          <div className="work-heading">
            <div><p className="eyebrow">Aplicação</p><h2 id="build-preview-title">Preview</h2></div>
            {activeLaunch && <button type="button" onClick={() => window.open(activeLaunch.previewUrl, '_blank', 'noopener,noreferrer')}>Abrir em nova aba</button>}
          </div>
          <nav className="build-lenses" aria-label="Lentes do Build">
            <button type="button" aria-pressed={previewLens === null} onClick={() => setPreviewLens(null)}>Preview</button>
            <button type="button" aria-pressed={previewLens === 'CODE'} disabled={!diff.data} onClick={() => setPreviewLens('CODE')}>Código</button>
            <button type="button" aria-pressed={previewLens === 'DIFF'} disabled={!diff.data} onClick={() => setPreviewLens('DIFF')}>Diff</button>
          </nav>
          {currentPreview.isError && <p role="alert">{currentPreview.error instanceof BuilderRequestError && currentPreview.error.status === 404
            ? 'Não foi possível obter um Preview para este Project.'
            : 'Não foi possível consultar o Preview do Baseline aprovado.'}</p>}
          {!activeLaunch && currentPreview.data && <div>
            <p><strong>{currentPreview.data.subjectKind === 'CURRENT_PROJECT' ? 'Baseline aprovado' : 'Candidato de Change'}</strong> — sujeito <code>{currentPreview.data.subjectDigest}</code></p>
            <p>{currentPreview.data.ready ? 'Preview pronto para servir.' : 'Preview ainda não está pronto: não há artefato de aplicação admitido.'}</p>
            <small>Verificado: {currentPreview.data.verified ? 'sim' : 'não'} · live: {currentPreview.data.live ? 'sim' : 'não'}</small>
          </div>}
          {(candidatePreview.data?.previewEligible ?? candidatePreview.data?.verified) && !candidatePreview.data?.preparation && <button type="button" disabled={prepare.isPending} onClick={startPreparation}>
            {prepare.isPending ? 'Preparando Preview…' : 'Preparar Preview'}
          </button>}
          {candidatePreview.data?.preparation?.state === 'PREPARING' && <p>Preparando Preview…</p>}
          {candidatePreview.data?.preparation?.state === 'PREPARED' && <button type="button" disabled={launch.isPending} onClick={launchPrepared}>
            {launch.isPending ? 'Abrindo Preview…' : 'Abrir Preview'}
          </button>}
          {candidatePreview.data?.preparation?.state === 'FAILED' && <><p role="alert">A preparação do Preview falhou{activeLaunch ? '. A versão anterior continua disponível.' : '.'}</p><button type="button" disabled={prepare.isPending} onClick={startPreparation}>Preparar Preview novamente</button></>}
          {candidatePreview.data?.preparation?.state === 'EXPIRED' && <><p role="alert">A preparação do Preview expirou.</p><button type="button" disabled={prepare.isPending} onClick={startPreparation}>Preparar Preview novamente</button></>}
          <p role="status" aria-live="polite">{previewMessage}</p>
          {activeLaunch && <p>Aplicação exibida do Change <code>{activeLaunch.changeId}</code>, revisão <code>{activeLaunch.subjectDigest}</code>.{activeLaunch.changeId !== currentId && ' A versão anterior permanece aberta enquanto você trabalha no candidato selecionado.'}</p>}
          {(activeLaunch || pendingLaunch) && <div className="preview-frame-stack" data-state={previewSurfaceState}>
            {activeLaunch && <iframe key={activeLaunch.generation} title="Preview do aplicativo" name={previewFrameName(activeLaunch)} src="about:blank" />}
            {pendingLaunch && <iframe key={pendingLaunch.generation} title="Preview do aplicativo" style={activeLaunch ? { visibility: 'hidden' } : undefined} name={previewFrameName(pendingLaunch)} src="about:blank" onLoad={settleEntry} />}
          </div>}
          {pendingLaunch && <form ref={entryForm} hidden method="post" action={pendingLaunch.entryUrl} target={previewFrameName(pendingLaunch)}>
            <input type="hidden" name="entryGrant" value={pendingLaunch.entryGrant} />
          </form>}
          {!activeLaunch && !pendingLaunch && <p className="preview-empty">O Preview do aplicativo aparecerá aqui quando você preparar um candidato verificado.</p>}
        </section>

        <aside className="conexus-panel" aria-labelledby="conexus-panel-title">
          <p className="eyebrow">Conexus</p>
          <h2 id="conexus-panel-title">Converse com o Conexus</h2>
          <p className="panel-intro">Descreva o aplicativo que você quer criar ou a próxima mudança. O Conexus continua a mesma aplicação.</p>
          {currentId && <BuilderConversation key={`${projectId}:${currentId}`} projectId={projectId} changeId={currentId} intent={change.data?.intent} summary={change.data?.summary} />}
          {!currentId && <p className="builder-conversation-empty">Comece descrevendo o que a aplicação precisa fazer. O resultado aparecerá no Preview quando estiver disponível.</p>}
          <form onSubmit={submit}>
            <label htmlFor={inputId}>O que deve mudar neste Project?</label>
            <textarea id={inputId} rows={5} required value={intent} onChange={(event) => setIntent(event.target.value)} />
            <p>O Conexus continuará os arquivos do aplicativo. A versão anterior permanece disponível enquanto a alteração é preparada.</p>
            <button className="primary" type="submit" disabled={mutation.isPending || activeChange || Boolean(currentId && (!change.data || !terminal.has(change.data.state)))}>{mutation.isPending ? 'Enviando…' : 'Pedir mudança'}</button>
            <p role="status" aria-live="polite">{message}</p>
          </form>
        </aside>
      </div>

      {changes.isError && <p role="alert">Não foi possível consultar os Changes deste Project.</p>}
      {changes.data && changes.data.length > 0 && (
        <section className="build-inspector-stack" aria-labelledby="build-activity-title">
          <h2 id="build-activity-title">Atividade de Build</h2>
          <div className="build-layout">
            <nav aria-label="Changes">
              {changes.data.map((item) => <button key={item.changeId} type="button" aria-current={item.changeId === currentId} onClick={() => {
                invalidateGeneration()
                setPendingLaunch(undefined)
                setPreviewSurfaceState(activeLaunch ? 'OPEN' : 'IDLE')
                entrySubmitted.current = undefined
                setSelectedId(item.changeId)
              }}>
                <span>{item.intent}</span><small>{item.state}</small>
              </button>)}
            </nav>
            {currentId && <article className="build-result">
              <p className="eyebrow">{change.data?.state ?? 'Carregando'}</p>
              <h3>{change.data?.intent ?? 'Change'}</h3>
              {candidatePreview.isError && <p role="alert">Não foi possível consultar o Preview deste candidato.</p>}
              {candidatePreview.data && <section aria-labelledby="candidate-preview-title">
                <h4 id="candidate-preview-title">Preview do candidato</h4>
                <p>{candidatePreview.data.subjectKind === 'CHANGE_CANDIDATE' ? 'Candidato de Change' : 'Baseline aprovado'} · sujeito <code>{candidatePreview.data.subjectDigest}</code> · verificado: {candidatePreview.data.verified ? 'sim' : 'não'} · live: {candidatePreview.data.live ? 'sim' : 'não'}</p>
                <p>{activeLaunch?.changeId === currentId && activeLaunch.subjectDigest === candidatePreview.data.subjectDigest
                  ? 'A aplicação desta revisão está aberta acima.'
                  : candidatePreview.data.preparation?.state === 'PREPARED'
                    ? 'Artefato preparado. Use Abrir Preview para visualizar esta revisão.'
                    : 'A aplicação desta revisão ainda não está aberta.'}</p>
              </section>}
              {plan.data && <div><strong>Plano mínimo</strong><ul>{plan.data.items.map((item) => <li key={item.itemId}>{item.summary} — {item.state}</li>)}</ul></div>}
              {progress.data && <p><strong>Progresso:</strong> {progress.data.overallState}</p>}
              {change.data?.state === 'FAILED' && <p role="alert">O trabalho foi interrompido sem produzir um resultado aceito.</p>}
              {change.data?.state === 'VERIFYING' && <p>O Conexus está verificando o candidato em uma execução independente.</p>}
              {change.data?.state === 'RUNNING' && <p>O Conexus está produzindo ou corrigindo o candidato em uma execução controlada.</p>}
              {change.data?.state === 'PREPARING' && <p>Preparando a aplicação. A versão anterior continua disponível.</p>}
              {change.data?.state === 'PREVIEW_READY' && <p>Aplicação disponível para experimentar. Isso não representa revisão independente.</p>}
              {change.data?.state === 'BUILD_FAILED' && <p role="alert">A compilação falhou. Seus arquivos foram preservados para a próxima correção.</p>}
              {change.data?.summary && <p>{change.data.summary}</p>}
              {change.data?.state === 'VERIFIED' && <p><strong>Resultado verificado.</strong> O Hub confirmou a Evidence contra o candidato e o Baseline exatos.</p>}
              {change.data?.state === 'VERIFICATION_FAILED' && <p role="alert"><strong>Verificação reprovada.</strong> O candidato não foi aceito; confira os pontos encontrados.</p>}
              {change.data?.state === 'UNVERIFIED' && (currentResolutionEvidence.length > 0
                ? <p><strong>Correção verificada.</strong> Confirme abaixo quais pontos esta Evidence resolveu.</p>
                : <p role="alert">Há um candidato, mas a verificação não estabeleceu aceitação.</p>)}
              {findings.data && findings.data.length > 0 && <section aria-labelledby="change-findings-title"><h4 id="change-findings-title">Pontos encontrados</h4><ul>{findings.data.map((finding) => <li key={finding.findingId}>{finding.summary} — {finding.state}{finding.state === 'OPEN' && change.data?.state === 'UNVERIFIED' && currentResolutionEvidence.length > 0 && <button type="button" disabled={closeFinding.isPending} onClick={() => closeFinding.mutate(finding)}>Confirmar resolução verificada</button>}</li>)}</ul></section>}
              {evidence.data && evidence.data.length > 0 && <section aria-labelledby="change-evidence-title"><h4 id="change-evidence-title">Verificação</h4><ul>{evidence.data.map((item) => <li key={item.evidenceId}>{item.claim} — candidato <code>{item.subjectDigest}</code></li>)}</ul></section>}
              {diff.data && <details className="build-disclosure" open={previewLens === 'DIFF'} onToggle={(event) => { const open = event.currentTarget.open; setPreviewLens((current) => open ? 'DIFF' : current === 'DIFF' ? null : current) }}>
                <summary>Diff (somente leitura)</summary>
                <section aria-labelledby="change-diff-title"><h4 id="change-diff-title">Diff do resultado</h4><p><code>{diff.data.baseSourceRevision}</code> → <code>{diff.data.candidateSourceRevision}</code></p><pre>{diff.data.patch}</pre></section>
              </details>}
              {diff.data && <details className="build-disclosure" open={previewLens === 'CODE'} onToggle={(event) => { const open = event.currentTarget.open; setPreviewLens((current) => open ? 'CODE' : current === 'CODE' ? null : current) }}>
                <summary>Código (somente leitura)</summary>
                <h4 id="change-code-title">Código</h4>
                <p>Inspecione arquivos completos presos à revisão exata.</p>
                <fieldset>
                  <legend>Revisão do código</legend>
                  <button type="button" aria-pressed={selectedSource?.sourceRevision === diff.data.baseSourceRevision} onClick={() => setSourceSelection({ changeId: currentId, sourceRevision: diff.data.baseSourceRevision })}>Fonte original</button>
                  <button type="button" aria-pressed={selectedSource?.sourceRevision === diff.data.candidateSourceRevision} onClick={() => setSourceSelection({ changeId: currentId, sourceRevision: diff.data.candidateSourceRevision })}>Resultado atual</button>
                </fieldset>
                {selectedSource && <p>Revisão selecionada: <code>{selectedSource.sourceRevision}</code></p>}
                {sourceTree.isPending && <p>Carregando árvore do código…</p>}
                {sourceTree.isError && <p role="alert">Esta revisão não está disponível para leitura com sua autoridade atual.</p>}
                {sourceTree.data && <div className="source-browser">
                  <nav aria-label="Arquivos da revisão">
                    {sourceTree.data.entries.map((entry) => entry.kind === 'DIRECTORY'
                      ? <span key={`directory:${entry.path}`}>{entry.path}/</span>
                      : <button key={`file:${entry.path}`} type="button" aria-current={selectedSource?.path === entry.path} onClick={() => setSourceSelection({ changeId: currentId, sourceRevision: sourceTree.data.sourceRevision, path: entry.path })}>{entry.path}</button>)}
                  </nav>
                  <div>
                    {selectedSource?.path && sourceFile.isPending && <p>Carregando arquivo…</p>}
                    {sourceFile.isError && <p role="alert">O arquivo não existe ou não pode ser exibido integralmente nesta revisão.</p>}
                    {sourceFile.data && <><p><strong>{sourceFile.data.path}</strong> em <code>{sourceFile.data.sourceRevision}</code></p><pre>{sourceFile.data.content}</pre></>}
                  </div>
                </div>}
              </details>}
            </article>}
          </div>
        </section>
      )}
    </div>
  )
}
