import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useEffect, useId, useRef, useState } from 'react'
import { BuilderRequestError, closeChangeFinding, createChange, getBuildPreview, getChange, getChangeDiff, getChangePlan, getChangeProgress, getProjectSourceFile, listChangeEvidence, listChangeFindings, listChanges, listProjectSourceTree } from '../api'

const terminal = new Set(['VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'])
const hasCandidate = new Set(['RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED'])

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const queryClient = useQueryClient()
  const attempt = useRef<Readonly<{ intent: string; key: string }> | undefined>(undefined)
  const [intent, setIntent] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [sourceSelection, setSourceSelection] = useState<Readonly<{ changeId: string; sourceRevision: string; path?: string }>>()
  const [message, setMessage] = useState('')
  const changes = useQuery({
    queryKey: ['builder-changes', projectId], queryFn: () => listChanges(projectId), refetchInterval: 2_000,
  })
  const currentId = selectedId ?? changes.data?.[0]?.changeId
  const requireCurrentId = () => {
    if (!currentId) throw new Error('No current Change')
    return currentId
  }
  const currentPreview = useQuery({
    queryKey: ['builder-preview', projectId, 'current'], queryFn: () => getBuildPreview(projectId),
  })
  const change = useQuery({
    queryKey: ['builder-change', projectId, currentId], queryFn: () => getChange(projectId, requireCurrentId()),
    enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.state ?? '') ? false : 1_500,
  })
  const candidatePreview = useQuery({
    queryKey: ['builder-preview', projectId, currentId, change.data?.state], queryFn: () => getBuildPreview(projectId, requireCurrentId()),
    enabled: Boolean(currentId) && hasCandidate.has(change.data?.state ?? ''),
    refetchInterval: () => terminal.has(change.data?.state ?? '') ? false : 2_000,
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
  const mutation = useMutation({
    mutationFn: (value: Readonly<{ intent: string; key: string }>) => createChange(projectId, value.intent, value.key),
    onSuccess: async (created) => {
      attempt.current = undefined
      setSelectedId(created.changeId)
      setIntent('')
      setMessage('Change criado. O Conexus iniciou o trabalho governado.')
      await queryClient.invalidateQueries({ queryKey: ['builder-changes', projectId] })
    },
    onError: (error) => {
      if (error instanceof BuilderRequestError && error.status === 403) setMessage('Sua autoridade atual não permite construir neste Project.')
      else if (error instanceof BuilderRequestError && error.status === 404) setMessage('Este Project ainda não possui um Baseline aprovado para construir.')
      else if (error instanceof BuilderRequestError && error.status === 409) setMessage('O resultado desta tentativa ainda não foi confirmado. Reenvie sem alterar o pedido.')
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
    if (attempt.current?.intent !== value) attempt.current = { intent: value, key: crypto.randomUUID() }
    setMessage('Criando o Change…')
    mutation.mutate(attempt.current)
  }

  return (
    <div className="project-build">
      <form onSubmit={submit}>
        <label htmlFor={inputId}>O que deve mudar neste Project?</label>
        <textarea id={inputId} rows={5} required value={intent} onChange={(event) => setIntent(event.target.value)} />
        <p>O Conexus trabalhará sobre o Baseline aceito e mostrará o resultado antes de qualquer aceitação.</p>
        <button className="primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? 'Criando Change…' : 'Pedir mudança'}</button>
        <p role="status" aria-live="polite">{message}</p>
      </form>

      <section aria-labelledby="build-preview-title">
        <h2 id="build-preview-title">Preview</h2>
        {currentPreview.isError && <p role="alert">{currentPreview.error instanceof BuilderRequestError && currentPreview.error.status === 404
          ? 'Não foi possível obter um Preview para este Project.'
          : 'Não foi possível consultar o Preview do Baseline aprovado.'}</p>}
        {currentPreview.data && <div>
          <p><strong>{currentPreview.data.subjectKind === 'CURRENT_PROJECT' ? 'Baseline aprovado' : 'Candidato de Change'}</strong> — sujeito <code>{currentPreview.data.subjectDigest}</code></p>
          <p>{currentPreview.data.ready ? 'Preview pronto para servir.' : 'Preview ainda não está pronto: não há artefato de aplicação admitido.'}</p>
          <small>Verificado: {currentPreview.data.verified ? 'sim' : 'não'} · live: {currentPreview.data.live ? 'sim' : 'não'}</small>
        </div>}
      </section>

      {changes.isError && <p role="alert">Não foi possível consultar os Changes deste Project.</p>}
      {changes.data && changes.data.length > 0 && (
        <section aria-labelledby="build-activity-title">
          <h2 id="build-activity-title">Atividade de Build</h2>
          <div className="build-layout">
            <nav aria-label="Changes">
              {changes.data.map((item) => <button key={item.changeId} type="button" aria-current={item.changeId === currentId} onClick={() => setSelectedId(item.changeId)}>
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
                <p>{candidatePreview.data.ready ? 'Preview pronto para servir.' : 'Preview ainda não está pronto: não há artefato de aplicação admitido.'}</p>
              </section>}
              {plan.data && <div><strong>Plano mínimo</strong><ul>{plan.data.items.map((item) => <li key={item.itemId}>{item.summary} — {item.state}</li>)}</ul></div>}
              {progress.data && <p><strong>Progresso:</strong> {progress.data.overallState}</p>}
              {change.data?.state === 'FAILED' && <p role="alert">O trabalho foi interrompido sem produzir um resultado aceito.</p>}
              {change.data?.state === 'VERIFYING' && <p>O Conexus está verificando o candidato em uma execução independente.</p>}
              {change.data?.state === 'RUNNING' && <p>O Conexus está produzindo ou corrigindo o candidato em uma execução controlada.</p>}
              {change.data?.state === 'VERIFIED' && <p><strong>Resultado verificado.</strong> O Hub confirmou a Evidence contra o candidato e o Baseline exatos.</p>}
              {change.data?.state === 'VERIFICATION_FAILED' && <p role="alert"><strong>Verificação reprovada.</strong> O candidato não foi aceito; confira os pontos encontrados.</p>}
              {change.data?.state === 'UNVERIFIED' && (currentResolutionEvidence.length > 0
                ? <p><strong>Correção verificada.</strong> Confirme abaixo quais pontos esta Evidence resolveu.</p>
                : <p role="alert">Há um candidato, mas a verificação não estabeleceu aceitação.</p>)}
              {findings.data && findings.data.length > 0 && <section aria-labelledby="change-findings-title"><h4 id="change-findings-title">Pontos encontrados</h4><ul>{findings.data.map((finding) => <li key={finding.findingId}>{finding.summary} — {finding.state}{finding.state === 'OPEN' && change.data?.state === 'UNVERIFIED' && currentResolutionEvidence.length > 0 && <button type="button" disabled={closeFinding.isPending} onClick={() => closeFinding.mutate(finding)}>Confirmar resolução verificada</button>}</li>)}</ul></section>}
              {evidence.data && evidence.data.length > 0 && <section aria-labelledby="change-evidence-title"><h4 id="change-evidence-title">Verificação</h4><ul>{evidence.data.map((item) => <li key={item.evidenceId}>{item.claim} — candidato <code>{item.subjectDigest}</code></li>)}</ul></section>}
              {diff.data && <section aria-labelledby="change-diff-title"><h4 id="change-diff-title">Diff do resultado</h4><p><code>{diff.data.baseSourceRevision}</code> → <code>{diff.data.candidateSourceRevision}</code></p><pre>{diff.data.patch}</pre></section>}
              {diff.data && <section aria-labelledby="change-code-title">
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
              </section>}
            </article>}
          </div>
        </section>
      )}
    </div>
  )
}
