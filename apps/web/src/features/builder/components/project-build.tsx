import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import { BuilderRequestError, createChange, getChange, getChangeDiff, getChangePlan, getChangeProgress, listChangeEvidence, listChangeFindings, listChanges } from '../api'

const terminal = new Set(['VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED', 'FAILED', 'INTERRUPTED'])
const hasCandidate = new Set(['RESULT_READY', 'VERIFYING', 'VERIFIED', 'VERIFICATION_FAILED', 'UNVERIFIED'])

export function ProjectBuild({ projectId }: { projectId: string }) {
  const inputId = useId()
  const queryClient = useQueryClient()
  const attempt = useRef<Readonly<{ intent: string; key: string }> | undefined>(undefined)
  const [intent, setIntent] = useState('')
  const [selectedId, setSelectedId] = useState<string>()
  const [message, setMessage] = useState('')
  const changes = useQuery({
    queryKey: ['builder-changes', projectId], queryFn: () => listChanges(projectId), refetchInterval: 2_000,
  })
  const currentId = selectedId ?? changes.data?.[0]?.changeId
  const requireCurrentId = () => {
    if (!currentId) throw new Error('No current Change')
    return currentId
  }
  const change = useQuery({
    queryKey: ['builder-change', projectId, currentId], queryFn: () => getChange(projectId, requireCurrentId()),
    enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.state ?? '') ? false : 1_500,
  })
  const plan = useQuery({ queryKey: ['builder-plan', projectId, currentId], queryFn: () => getChangePlan(projectId, requireCurrentId()), enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.progress ?? '') ? false : 2_000 })
  const progress = useQuery({ queryKey: ['builder-progress', projectId, currentId], queryFn: () => getChangeProgress(projectId, requireCurrentId()), enabled: Boolean(currentId), refetchInterval: (query) => terminal.has(query.state.data?.overallState ?? '') ? false : 1_500 })
  const diff = useQuery({ queryKey: ['builder-diff', projectId, currentId], queryFn: () => getChangeDiff(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? '') })
  const findings = useQuery({ queryKey: ['builder-findings', projectId, currentId, change.data?.state], queryFn: () => listChangeFindings(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? '') })
  const evidence = useQuery({ queryKey: ['builder-evidence', projectId, currentId, change.data?.state], queryFn: () => listChangeEvidence(projectId, requireCurrentId()), enabled: hasCandidate.has(change.data?.state ?? '') })
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
              {plan.data && <div><strong>Plano mínimo</strong><ul>{plan.data.items.map((item) => <li key={item.itemId}>{item.summary} — {item.state}</li>)}</ul></div>}
              {progress.data && <p><strong>Progresso:</strong> {progress.data.overallState}</p>}
              {change.data?.state === 'FAILED' && <p role="alert">O trabalho foi interrompido sem produzir um resultado aceito.</p>}
              {change.data?.state === 'VERIFYING' && <p>O Conexus está verificando o candidato em uma execução independente.</p>}
              {change.data?.state === 'VERIFIED' && <p><strong>Resultado verificado.</strong> O Hub confirmou a Evidence contra o candidato e o Baseline exatos.</p>}
              {change.data?.state === 'UNVERIFIED' && <p role="alert">Há um candidato, mas a verificação não estabeleceu aceitação.</p>}
              {findings.data && findings.data.length > 0 && <section aria-labelledby="change-findings-title"><h4 id="change-findings-title">Pontos encontrados</h4><ul>{findings.data.map((finding) => <li key={finding.findingId}>{finding.summary} — {finding.state}</li>)}</ul></section>}
              {evidence.data && evidence.data.length > 0 && <section aria-labelledby="change-evidence-title"><h4 id="change-evidence-title">Verificação</h4><ul>{evidence.data.map((item) => <li key={item.evidenceId}>{item.claim} — candidato <code>{item.subjectDigest}</code></li>)}</ul></section>}
              {diff.data && <section aria-labelledby="change-diff-title"><h4 id="change-diff-title">Diff do resultado</h4><p><code>{diff.data.baseSourceRevision}</code> → <code>{diff.data.candidateSourceRevision}</code></p><pre>{diff.data.patch}</pre></section>}
            </article>}
          </div>
        </section>
      )}
    </div>
  )
}
