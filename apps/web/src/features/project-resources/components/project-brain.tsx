import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useId, useRef, useState } from 'react'
import {
  brainRevisionsQueryKey,
  getProjectBrainContext,
  listBrainRevisions,
  projectBrainContextQueryKey,
} from '../../brain/api'
import { R2RequestError } from '../../r2-response'
import {
  clearProjectBrainBinding,
  getProjectBrainBinding,
  projectBrainBindingQueryKey,
  setProjectBrainBinding,
} from '../api'

function requestFailure(error: unknown, action: 'adopt' | 'clear') {
  if (!(error instanceof R2RequestError)) {
    return 'A resposta do servidor não foi confirmada. Verifique o estado atual antes de tentar novamente.'
  }
  if (error.status === 403) return 'A autoridade atual não permite administrar este vínculo de Brain.'
  if (error.status === 404) return 'O servidor não divulgou o Project, o vínculo ou a revisão solicitada.'
  if (error.status === 409 || error.status === 412) {
    return 'O vínculo mudou desde a leitura. Atualize o estado antes de tentar novamente.'
  }
  if (error.status === 422) return 'A revisão não foi aceita para este Project.'
  if (error.status === 503) return 'A validação do Brain está indisponível; nenhuma alteração foi confirmada.'
  return action === 'clear'
    ? 'A remoção não foi confirmada. Consulte novamente o vínculo antes de repetir.'
    : 'A adoção não foi confirmada. Consulte novamente o vínculo antes de repetir.'
}

export function ProjectBrain({ projectId, workspaceId }: { projectId: string; workspaceId: string }) {
  const revisionId = useId()
  const queryClient = useQueryClient()
  const revisionTrigger = useRef<HTMLButtonElement>(null)
  const revisionPanel = useRef<HTMLElement>(null)
  const restoreRevisionFocus = useRef(false)
  const [administrationOpen, setAdministrationOpen] = useState(false)
  const [revisionChooserOpen, setRevisionChooserOpen] = useState(false)
  const [selectedRevisionId, setSelectedRevisionId] = useState('')
  const [notice, setNotice] = useState('')
  const context = useQuery({
    queryKey: projectBrainContextQueryKey(projectId),
    queryFn: () => getProjectBrainContext(projectId),
  })
  const binding = useQuery({
    queryKey: projectBrainBindingQueryKey(projectId),
    queryFn: () => getProjectBrainBinding(projectId),
    enabled: administrationOpen,
  })
  const revisions = useQuery({
    queryKey: brainRevisionsQueryKey(workspaceId, projectId),
    queryFn: () => listBrainRevisions(workspaceId, projectId),
    enabled: revisionChooserOpen,
  })
  const confirmedBinding = binding.isSuccess ? binding.data : undefined
  const bindingEtag = confirmedBinding?.response.headers.get('etag') ?? null

  useEffect(() => {
    if (revisionChooserOpen) revisionPanel.current?.focus()
  }, [revisionChooserOpen])
  useEffect(() => {
    if (!revisionChooserOpen && restoreRevisionFocus.current) {
      restoreRevisionFocus.current = false
      queueMicrotask(() => revisionTrigger.current?.focus())
    }
  }, [revisionChooserOpen])

  const closeRevisionChooser = () => {
    restoreRevisionFocus.current = true
    setRevisionChooserOpen(false)
    setSelectedRevisionId('')
  }

  const refreshBrain = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: projectBrainContextQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: projectBrainBindingQueryKey(projectId) }),
      queryClient.invalidateQueries({ queryKey: brainRevisionsQueryKey(workspaceId, projectId) }),
    ])
  }

  const adopt = useMutation({
    mutationFn: (brainRevisionId: string) => {
      if (confirmedBinding && !bindingEtag) throw new R2RequestError(null)
      return setProjectBrainBinding(
        projectId,
        { brainRevisionId },
        confirmedBinding && bindingEtag ? { state: 'PRESENT', etag: bindingEtag } : { state: 'ABSENT' },
      )
    },
    onSuccess: async () => {
      setNotice('A adoção explícita foi confirmada pelo servidor.')
      closeRevisionChooser()
      await refreshBrain()
    },
    onError: (error) => setNotice(requestFailure(error, 'adopt')),
  })

  const clear = useMutation({
    mutationFn: (etag: string) => clearProjectBrainBinding(projectId, etag),
    onSuccess: async () => {
      setNotice('A remoção do vínculo foi confirmada pelo servidor. O Workspace Brain não foi alterado.')
      await refreshBrain()
    },
    onError: (error) => setNotice(requestFailure(error, 'clear')),
  })

  const contextUndisclosed = context.isError
    && context.error instanceof R2RequestError
    && [403, 404].includes(context.error.status ?? 0)
  const contextUnavailable = context.isError
    && context.error instanceof R2RequestError
    && context.error.status === 503
  const bindingNondisclosed = binding.isError
    && binding.error instanceof R2RequestError
    && binding.error.status === 404
  const canSubmitAdoption = !adopt.isPending
    && !clear.isPending
    && selectedRevisionId.length > 0
    && ((binding.isSuccess && bindingEtag !== null) || bindingNondisclosed)

  return (
    <div>
      <section aria-labelledby="project-brain-context-heading">
        <p className="eyebrow">Brain / significado aplicável</p>
        <h1 id="project-brain-context-heading">Brain do Project</h1>
        <p>Este contexto é resolvido pelo servidor para o vínculo exato do Project; ele não é todo o Workspace Brain.</p>
        {context.isPending && <p role="status">Carregando o significado adotado…</p>}
        {contextUndisclosed && (
          <div className="empty">
            <h2>Contexto do Brain não divulgado</h2>
            <p>Isso não confirma ausência de conhecimento nem de vínculo para este Project.</p>
          </div>
        )}
        {contextUnavailable && (
          <div className="empty">
            <h2>Contexto do Brain indisponível</h2>
            <p>O estado atual não pôde ser resolvido. Nenhum contexto anterior é tratado como atual.</p>
            <button type="button" onClick={() => void context.refetch()}>Tentar novamente</button>
          </div>
        )}
        {context.isError && !contextUndisclosed && !contextUnavailable && (
          <div className="empty">
            <h2>Não foi possível consultar o contexto do Brain</h2>
            <p>Isso não confirma ausência nem altera o vínculo atual.</p>
            <button type="button" onClick={() => void context.refetch()}>Tentar novamente</button>
          </div>
        )}
        {context.isSuccess && (
          <>
            <dl>
              <div><dt>Validação</dt><dd>{context.data.data.validationState}</dd></div>
              <div><dt>Atualização disponível</dt><dd>{context.data.data.updateAvailable ? 'Sim — não adotada automaticamente' : 'Não'}</dd></div>
            </dl>
            {context.data.data.domains.length === 0 ? (
              <p className="empty">O servidor confirmou que este contexto não contém domínios divulgados.</p>
            ) : (
              <div className="project-grid">
                {context.data.data.domains.map((domain) => (
                  <section className="project-card" key={domain.domainRef} aria-labelledby={`domain-${domain.domainRef}`}>
                    <h2 id={`domain-${domain.domainRef}`}>{domain.label}</h2>
                    {domain.concepts.map((concept) => (
                      <article key={concept.conceptRef}>
                        <h3>{concept.label}</h3>
                        <p>{concept.summary}</p>
                        {concept.detailDisclosed ? concept.sections.map((section) => (
                          <div key={`${concept.conceptRef}-${section.kind}`}>
                            <h4>{section.kind.replaceAll('_', ' ')}</h4>
                            <p>{section.text}</p>
                          </div>
                        )) : <p>Detalhes não divulgados para este conceito.</p>}
                        {concept.provenanceRefs.length > 0 && (
                          <details>
                            <summary>Proveniência</summary>
                            <ul>{concept.provenanceRefs.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul>
                          </details>
                        )}
                      </article>
                    ))}
                  </section>
                ))}
              </div>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="project-brain-binding-heading">
        <p className="eyebrow">Administração secundária</p>
        <h2 id="project-brain-binding-heading">Vínculo imutável do Brain</h2>
        <p>Publicar ou atualizar o Workspace Brain nunca altera este vínculo automaticamente.</p>
        <button
          type="button"
          aria-expanded={administrationOpen}
          aria-controls="project-brain-binding-administration"
          onClick={() => setAdministrationOpen((current) => !current)}
        >
          {administrationOpen ? 'Ocultar administração do vínculo' : 'Administrar vínculo do Brain'}
        </button>
        {administrationOpen && (
          <div id="project-brain-binding-administration">
        {binding.isPending && <p role="status">Consultando o vínculo atual…</p>}
        {bindingNondisclosed && (
          <div className="empty">
            <h3>Nenhum vínculo foi divulgado</h3>
            <p>Esta resposta não comprova que o vínculo esteja ausente. Uma adoção usa a condição de que nenhum vínculo atual exista, validada pelo servidor.</p>
          </div>
        )}
        {binding.isError && !bindingNondisclosed && (
          <div className="empty">
            <h3>O vínculo não pôde ser consultado</h3>
            <p>Isso não confirma ausência. Atualize a consulta antes de administrar o vínculo.</p>
            <button type="button" onClick={() => void binding.refetch()}>Tentar novamente</button>
          </div>
        )}
        {confirmedBinding && (
          <article className="project-card">
            <h3>Revisão adotada</h3>
            <p><code>{confirmedBinding.data.brainRevisionId}</code></p>
            <p>Validação: {confirmedBinding.data.validationState}</p>
            <p>{confirmedBinding.data.updateAvailable ? 'Há uma revisão mais nova disponível; ela ainda não foi adotada.' : 'Nenhuma atualização foi divulgada.'}</p>
            <button
              type="button"
              disabled={adopt.isPending || clear.isPending || bindingEtag === null}
              onClick={() => {
                if (bindingEtag) clear.mutate(bindingEtag)
              }}
            >
              {clear.isPending ? 'Removendo vínculo…' : 'Remover vínculo atual'}
            </button>
          </article>
        )}

          <div>
            <button
              ref={revisionTrigger}
              type="button"
              disabled={binding.isPending}
              onClick={() => setRevisionChooserOpen(true)}
            >
              Escolher revisão imutável
            </button>
          </div>
          </div>
        )}
        <p role="status" aria-live="polite">{notice}</p>
      </section>

      {revisionChooserOpen && (
        <div className="surface-overlay connection-overlay" role="presentation">
          <aside
            className="connection-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="brain-revision-chooser-heading"
            tabIndex={-1}
            ref={revisionPanel}
            onKeyDown={(event) => {
              if (event.key === 'Escape') closeRevisionChooser()
            }}
          >
          <div className="panel-heading">
            <h2 id="brain-revision-chooser-heading">Escolher revisão do Brain</h2>
            <button type="button" onClick={closeRevisionChooser}>Fechar</button>
          </div>
          <p>A lista contém somente revisões divulgadas para a adoção por este Project.</p>
          <div>
            <label htmlFor={revisionId}>Revisão disponível para adoção explícita</label>
            {revisions.isPending && <p role="status">Consultando revisões permitidas para este Project…</p>}
            {revisions.isError && (
              <div className="empty">
                <p>As alternativas de revisão não foram divulgadas para esta autoridade.</p>
                <button type="button" onClick={() => void revisions.refetch()}>Tentar novamente</button>
              </div>
            )}
            {revisions.isSuccess && revisions.data.data.length === 0 && <p>O servidor confirmou que não há revisões elegíveis.</p>}
            {revisions.isSuccess && revisions.data.data.length > 0 && (
              <select id={revisionId} value={selectedRevisionId} onChange={(event) => setSelectedRevisionId(event.target.value)}>
                <option value="">Selecione uma revisão</option>
                {revisions.data.data.map((revision) => (
                  <option key={revision.brainRevisionId} value={revision.brainRevisionId}>
                    {revision.brainRevisionId} — {revision.reviewText}
                  </option>
                ))}
              </select>
            )}
            <button
              className="primary"
              type="button"
              disabled={!canSubmitAdoption}
            onClick={() => adopt.mutate(selectedRevisionId)}
          >
              {adopt.isPending ? 'Adotando revisão…' : confirmedBinding ? 'Trocar revisão adotada' : 'Adotar revisão'}
            </button>
          </div>
          </aside>
        </div>
      )}
    </div>
  )
}
