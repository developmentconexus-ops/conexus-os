import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, useNavigate } from '@tanstack/react-router'
import type { FormEvent } from 'react'
import { useId, useRef, useState } from 'react'
import {
  askAboutBaselineCandidate,
  approveBaseline,
  approvedBaselineQueryKey,
  baselineCandidateQueryKey,
  getApprovedBaseline,
  getBaselineCandidate,
  ProjectRequestError,
  refineProjectCandidate,
} from '../api'

type RefinementAttempt = Readonly<{
  intent: string
  reviewFeedback: string
  idempotencyKey: string
}>

export function BaselineCandidate({
  projectId,
  candidateBaselineDigest,
}: {
  projectId: string
  candidateBaselineDigest: string
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const approvalInFlight = useRef(false)
  const explanationInFlight = useRef(false)
  const refinementInFlight = useRef(false)
  const refinementAttempt = useRef<RefinementAttempt | undefined>(undefined)
  const refinementIntentInput = useRef<HTMLTextAreaElement>(null)
  const refinementFeedbackInput = useRef<HTMLTextAreaElement>(null)
  const refinementIntentId = useId()
  const refinementFeedbackId = useId()
  const [question, setQuestion] = useState('')
  const [refinementIntent, setRefinementIntent] = useState('')
  const [reviewFeedback, setReviewFeedback] = useState('')
  const [refinementMessage, setRefinementMessage] = useState('')
  const candidate = useQuery({
    queryKey: baselineCandidateQueryKey(projectId, candidateBaselineDigest),
    queryFn: () => getBaselineCandidate(projectId, candidateBaselineDigest),
  })
  const approved = useQuery({
    queryKey: approvedBaselineQueryKey(projectId),
    queryFn: () => getApprovedBaseline(projectId),
    retry: false,
  })
  const approval = useMutation({
    mutationFn: () => approveBaseline(projectId, candidateBaselineDigest),
    onSuccess: (baseline) => queryClient.setQueryData(approvedBaselineQueryKey(projectId), baseline),
    onSettled: () => {
      approvalInFlight.current = false
    },
  })
  const explanation = useMutation({
    mutationFn: (submittedQuestion: string) => askAboutBaselineCandidate(
      projectId,
      candidateBaselineDigest,
      submittedQuestion,
    ),
    onSettled: () => {
      explanationInFlight.current = false
    },
  })
  const refinement = useMutation({
    mutationFn: (attempt: RefinementAttempt) => refineProjectCandidate(
      projectId,
      candidateBaselineDigest,
      attempt.intent,
      attempt.reviewFeedback,
      attempt.idempotencyKey,
    ),
    onSuccess: (nextCandidate) => {
      refinementAttempt.current = undefined
      void navigate({
        to: '/projects/$projectId/baseline-candidates/$candidateBaselineDigest',
        params: { projectId, candidateBaselineDigest: nextCandidate.candidateBaselineDigest },
      })
    },
    onError: (error) => {
      if (error instanceof ProjectRequestError && error.status === 403) {
        setRefinementMessage('A autoridade atual não permite refinar este Candidate.')
      } else if (error instanceof ProjectRequestError && error.status === 404) {
        setRefinementMessage('O servidor não revelou este Candidate para refinamento.')
      } else if (error instanceof ProjectRequestError && error.status === 409) {
        setRefinementMessage('O resultado ainda não pôde ser confirmado. Reenvie os mesmos dados para consultar a tentativa.')
      } else if (error instanceof ProjectRequestError && error.status === 412) {
        setRefinementMessage('Este Candidate não é mais o atual. Os campos foram preservados para sua revisão.')
      } else if (error instanceof ProjectRequestError && error.status === 422) {
        setRefinementMessage('O refinamento foi recusado. Revise a intenção e o feedback; o Candidate atual permanece inalterado.')
      } else if (error instanceof ProjectRequestError && error.status === 503) {
        setRefinementMessage('O refinamento está indisponível. Nenhum novo Candidate foi confirmado; reenvie os mesmos dados.')
      } else {
        setRefinementMessage('O refinamento não foi confirmado. Os dois campos continuam disponíveis para nova tentativa.')
      }
    },
    onSettled: () => {
      refinementInFlight.current = false
    },
  })

  const submitRefinement = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (refinementInFlight.current) return
    const intent = refinementIntent.trim()
    const feedback = reviewFeedback.trim()
    if (!intent) {
      setRefinementMessage('Informe o objetivo de negócio que deve orientar o próximo Candidate.')
      refinementIntentInput.current?.focus()
      return
    }
    if (!feedback) {
      setRefinementMessage('Informe o que deve mudar neste Candidate exato.')
      refinementFeedbackInput.current?.focus()
      return
    }
    if (refinementAttempt.current?.intent !== intent || refinementAttempt.current.reviewFeedback !== feedback) {
      refinementAttempt.current = { intent, reviewFeedback: feedback, idempotencyKey: crypto.randomUUID() }
    }
    setRefinementMessage('Refinando o Candidate…')
    refinementInFlight.current = true
    refinement.mutate(refinementAttempt.current)
  }
  if (candidate.isPending) return <p role="status">Carregando o Candidate Baseline…</p>
  if (candidate.isError) {
    if (candidate.error instanceof ProjectRequestError && [403, 404].includes(candidate.error.status ?? 0)) {
      return (
        <section className="empty" aria-labelledby="candidate-undisclosed">
          <h1 id="candidate-undisclosed">Candidate indisponível</h1>
          <p>O servidor não revelou este Candidate para a autoridade atual.</p>
        </section>
      )
    }
    return (
      <section className="empty" aria-labelledby="candidate-failure">
        <h1 id="candidate-failure">Não foi possível consultar o Candidate</h1>
        <p>Nenhum conteúdo em cache substitui a verdade do servidor.</p>
        <button type="button" onClick={() => void candidate.refetch()}>Tentar novamente</button>
      </section>
    )
  }
  return (
    <article className="baseline-candidate" aria-labelledby="candidate-heading">
      <p className="eyebrow">Revisão exata</p>
      <h1 id="candidate-heading">Candidate Baseline</h1>
      <dl className="candidate-facts">
        <div><dt>Digest do Candidate</dt><dd><code>{candidate.data.candidateBaselineDigest}</code></dd></div>
        <div><dt>Revisão da fonte</dt><dd><code>{candidate.data.sourceRevision}</code></dd></div>
        <div><dt>Runtime</dt><dd>{candidate.data.applicationRuntimeProfile}</dd></div>
      </dl>
      <section className="candidate-source" aria-labelledby="candidate-source-heading">
        <h2 id="candidate-source-heading">Conteúdo imutável</h2>
        <textarea aria-label="Conteúdo imutável do Candidate" readOnly rows={12} value={candidate.data.sourceText} />
      </section>
      <section aria-labelledby="candidate-refinement-heading">
        <p className="eyebrow">Refinamento explícito</p>
        <h2 id="candidate-refinement-heading">Produzir um novo Candidate a partir deste</h2>
        <p>A intenção define o objetivo atual. O feedback descreve somente o que deve mudar neste Candidate exato.</p>
        <form onSubmit={submitRefinement}>
          <label htmlFor={refinementIntentId}>Qual objetivo de negócio deve orientar o próximo Candidate?</label>
          <textarea
            id={refinementIntentId}
            ref={refinementIntentInput}
            required
            rows={4}
            value={refinementIntent}
            onChange={(event) => setRefinementIntent(event.target.value)}
          />
          <label htmlFor={refinementFeedbackId}>O que deve mudar neste Candidate exato?</label>
          <textarea
            id={refinementFeedbackId}
            ref={refinementFeedbackInput}
            required
            rows={4}
            value={reviewFeedback}
            onChange={(event) => setReviewFeedback(event.target.value)}
          />
          <button type="submit" disabled={refinement.isPending}>
            {refinement.isPending ? 'Refinando…' : 'Produzir novo Candidate'}
          </button>
        </form>
        <p role="status" aria-live="polite">{refinementMessage}</p>
      </section>
      <section className="approved-baseline" aria-labelledby="approved-heading">
        <h2 id="approved-heading">Baseline aprovada atual</h2>
        {approved.isPending && <p role="status">Consultando a Baseline aprovada…</p>}
        {approved.isError && approved.error instanceof ProjectRequestError && approved.error.status === 404 && (
          <p>Nenhuma Baseline aprovada existe para este Project.</p>
        )}
        {approved.isError && (!(approved.error instanceof ProjectRequestError) || approved.error.status !== 404) && (
          <p role="alert">Não foi possível consultar a Baseline aprovada.</p>
        )}
        {approved.data && (
          <p><strong>Digest aprovado:</strong> <code>{approved.data.baselineDigest}</code></p>
        )}
      </section>
      <section className="candidate-assistant" aria-labelledby="candidate-assistant-heading">
        <p className="eyebrow">Explicação contextual</p>
        <h2 id="candidate-assistant-heading">Pergunte ao Conexus sobre este Candidate</h2>
        <p>A pergunta usa o Candidate inteiro. Nenhuma seleção visual ou conversa local altera a Baseline.</p>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            const submittedQuestion = question.trim()
            if (!submittedQuestion || explanationInFlight.current) return
            explanationInFlight.current = true
            explanation.mutate(submittedQuestion)
          }}
        >
          <label htmlFor="candidate-question">Pergunta sobre este Candidate exato</label>
          <textarea
            id="candidate-question"
            required
            rows={4}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
          />
          <button type="submit" disabled={explanation.isPending}>
            {explanation.isPending ? 'Perguntando…' : 'Perguntar ao Conexus'}
          </button>
        </form>
        {explanation.isError && explanation.error instanceof ProjectRequestError &&
          [403, 404].includes(explanation.error.status ?? 0) && (
          <p role="alert">O servidor não revelou uma explicação para este Candidate.</p>
        )}
        {explanation.isError && explanation.error instanceof ProjectRequestError && explanation.error.status === 422 && (
          <p role="alert">A explicação foi recusada. Revise a pergunta; nenhuma verdade foi alterada.</p>
        )}
        {explanation.isError && (!(explanation.error instanceof ProjectRequestError) ||
          ![403, 404, 422].includes(explanation.error.status ?? 0)) && (
          <p role="alert">A explicação não foi concluída. Sua pergunta continua disponível para nova tentativa.</p>
        )}
        {explanation.data && (
          <article className="candidate-answer" aria-labelledby="candidate-answer-heading">
            <h3 id="candidate-answer-heading">Resposta sobre o Candidate exato</h3>
            <p>{explanation.data.answer}</p>
            <p><strong>Proveniência:</strong></p>
            <ul>{explanation.data.provenanceRefs.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul>
          </article>
        )}
      </section>
      <button
        type="button"
        disabled={approval.isPending}
        onClick={() => {
          if (approvalInFlight.current) return
          approvalInFlight.current = true
          approval.mutate()
        }}
      >
        {approval.isPending ? 'Aprovando…' : 'Aprovar este Candidate'}
      </button>
      {approval.isError && approval.error instanceof ProjectRequestError && approval.error.status === 412 && (
        <p role="alert">Este Candidate não é mais o atual. Recarregue a verdade do servidor.</p>
      )}
      {approval.isError && (!(approval.error instanceof ProjectRequestError) || approval.error.status !== 412) && (
        <p role="alert">A aprovação não foi concluída; nenhuma verdade local foi promovida.</p>
      )}
      {approval.isSuccess && <p role="status">Baseline aprovada pelo servidor.</p>}
      <Link to="/projects/$projectId" params={{ projectId }}>Voltar ao Project</Link>
    </article>
  )
}
