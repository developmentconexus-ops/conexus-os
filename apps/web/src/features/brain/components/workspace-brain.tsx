import { useQuery } from '@tanstack/react-query'
import { useId, useMemo, useState } from 'react'
import { R2RequestError } from '../../r2-response'
import {
  brainHealthQueryKey,
  brainRevisionQueryKey,
  brainRevisionsQueryKey,
  getBrainHealth,
  getBrainRevision,
  getWorkspaceBrain,
  listBrainRevisions,
  workspaceBrainQueryKey,
} from '../api'

type BrainSection = 'KNOWLEDGE' | 'REVISIONS' | 'HEALTH'

const healthLabels = {
  UNVERIFIED: 'Não verificado',
  VALID: 'Válido',
  SUSPECT: 'Suspeito',
  INVALID: 'Inválido',
  CHECK_ERROR: 'Erro de verificação',
} as const

function ReadFailure({ error, retry }: { error: Error; retry: () => void }) {
  const status = error instanceof R2RequestError ? error.status : null
  if (status === 403 || status === 404) {
    return <div className="empty"><h2>Brain não divulgado</h2><p>O servidor não revelou esse conteúdo para a autoridade atual.</p></div>
  }
  return (
    <div className="empty">
      <h2>Não foi possível consultar o Brain</h2>
      <p>A falha não representa conteúdo vazio e nenhuma informação local substituiu a verdade do servidor.</p>
      <button type="button" onClick={retry}>Tentar novamente</button>
    </div>
  )
}

export function WorkspaceBrainSurface({ workspaceId }: { workspaceId: string }) {
  const searchId = useId()
  const [section, setSection] = useState<BrainSection>('KNOWLEDGE')
  const [query, setQuery] = useState('')
  const publication = useQuery({
    queryKey: workspaceBrainQueryKey(workspaceId),
    queryFn: () => getWorkspaceBrain(workspaceId),
  })
  const revisions = useQuery({
    queryKey: brainRevisionsQueryKey(workspaceId),
    queryFn: () => listBrainRevisions(workspaceId),
  })
  const health = useQuery({
    queryKey: brainHealthQueryKey(workspaceId),
    queryFn: () => getBrainHealth(workspaceId),
    enabled: section === 'HEALTH',
  })
  const publishedRevisionId = publication.data?.data.publishedBrainRevisionId
  const revision = useQuery({
    queryKey: brainRevisionQueryKey(workspaceId, publishedRevisionId ?? ''),
    queryFn: () => getBrainRevision(workspaceId, publishedRevisionId ?? ''),
    enabled: publishedRevisionId !== null && publishedRevisionId !== undefined,
  })
  const visibleDomains = useMemo(() => {
    const domains = revision.data?.data.knowledgeBrowse.domains ?? []
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return domains
    return domains.flatMap((domain) => {
      const domainMatches = domain.label.toLocaleLowerCase().includes(needle)
      const concepts = domainMatches
        ? domain.concepts
        : domain.concepts.filter((concept) => (
          `${concept.label} ${concept.summary}`.toLocaleLowerCase().includes(needle)
        ))
      return concepts.length === 0 ? [] : [{ ...domain, concepts }]
    })
  }, [query, revision.data])

  if (publication.isPending || revisions.isPending) return <p role="status">Carregando o Workspace Brain…</p>
  if (publication.isError) return <ReadFailure error={publication.error} retry={() => void publication.refetch()} />
  if (revisions.isError) return <ReadFailure error={revisions.error} retry={() => void revisions.refetch()} />

  return (
    <section className="brain-surface" aria-labelledby="workspace-brain-title">
      <div className="page-heading">
        <div><p className="eyebrow">Workspace / Brain</p><h1 id="workspace-brain-title">Brain</h1></div>
        {publishedRevisionId && <p className="subject-summary">Publicação atual <code>{publishedRevisionId}</code></p>}
      </div>
      <div className="section-tabs" role="tablist" aria-label="Áreas do Workspace Brain">
        {([
          ['KNOWLEDGE', 'Knowledge'],
          ['REVISIONS', 'Revisões'],
          ['HEALTH', 'Saúde'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            id={`brain-tab-${value.toLocaleLowerCase()}`}
            aria-controls={`brain-panel-${value.toLocaleLowerCase()}`}
            aria-selected={section === value}
            onClick={() => setSection(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {section === 'KNOWLEDGE' && (
        <div id="brain-panel-knowledge" role="tabpanel" aria-labelledby="brain-tab-knowledge" className="brain-section">
          {!publishedRevisionId ? (
            <div className="empty"><h2>Nenhum Brain publicado</h2><p>O servidor confirmou que este Workspace ainda não possui uma publicação atual.</p></div>
          ) : revision.isPending ? (
            <p role="status">Carregando o conhecimento publicado…</p>
          ) : revision.isError ? (
            <ReadFailure error={revision.error} retry={() => void revision.refetch()} />
          ) : (
            <>
              <label htmlFor={searchId}>Buscar no conhecimento divulgado</label>
              <input id={searchId} type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
              {revision.data.data.knowledgeBrowse.domains.length === 0 ? (
                <div className="empty"><h2>Conhecimento publicado vazio</h2><p>Esta revisão possui uma projeção conhecida e vazia.</p></div>
              ) : visibleDomains.length === 0 ? (
                <p role="status">Nenhum domínio ou conceito divulgado corresponde à busca local.</p>
              ) : (
                <div className="brain-domains">
                  {visibleDomains.map((domain) => (
                    <section key={domain.domainRef} className="brain-domain" aria-labelledby={`domain-${domain.domainRef}`}>
                      <h2 id={`domain-${domain.domainRef}`}>{domain.label}</h2>
                      <div className="brain-concepts">
                        {domain.concepts.map((concept) => (
                          <details key={concept.conceptRef} className="brain-concept">
                            <summary><strong>{concept.label}</strong><span>{concept.summary}</span></summary>
                            <ul className="content-class-list" aria-label="Classes de conteúdo">
                              {concept.contentClasses.map((contentClass) => <li key={contentClass}>{contentClass}</li>)}
                            </ul>
                            {concept.sections.map((item) => (
                              <section key={`${item.kind}-${item.text}`}>
                                <h3>{item.kind.replaceAll('_', ' ')}</h3>
                                <p>{item.text}</p>
                              </section>
                            ))}
                            <details>
                              <summary>Proveniência</summary>
                              {concept.provenanceRefs.length === 0 ? <p>Nenhuma referência divulgada.</p> : (
                                <ul>{concept.provenanceRefs.map((reference) => <li key={reference}><code>{reference}</code></li>)}</ul>
                              )}
                            </details>
                          </details>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {section === 'REVISIONS' && (
        <div id="brain-panel-revisions" role="tabpanel" aria-labelledby="brain-tab-revisions" className="brain-section">
          <h2>Revisões imutáveis</h2>
          {revisions.data.data.length === 0 ? (
            <div className="empty"><h3>Nenhuma revisão divulgada</h3><p>O servidor confirmou um histórico vazio.</p></div>
          ) : (
            <ol className="revision-list">
              {revisions.data.data.map((item) => (
                <li key={item.brainRevisionId}>
                  <div><strong>{item.brainRevisionId}</strong>{item.brainRevisionId === publishedRevisionId && <span className="status-pill">Publicação atual</span>}</div>
                  <p>{item.reviewText}</p>
                  <details><summary>Identidade técnica</summary><code>{item.sourceRevision}</code><code>{item.brainDigest}</code></details>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}

      {section === 'HEALTH' && (
        <div id="brain-panel-health" role="tabpanel" aria-labelledby="brain-tab-health" className="brain-section">
          <h2>Saúde operacional</h2>
          <p>A saúde é uma sobreposição atual e não altera o conteúdo da revisão imutável.</p>
          {health.isPending ? <p role="status">Carregando a saúde do Brain…</p> : health.isError ? (
            <ReadFailure error={health.error} retry={() => void health.refetch()} />
          ) : health.data.data.items.length === 0 ? (
            <div className="empty"><h3>Nenhuma verificação divulgada</h3><p>O servidor confirmou uma lista de saúde vazia.</p></div>
          ) : (
            <ul className="health-list">
              {health.data.data.items.map((item) => (
                <li key={item.semanticRef}>
                  <code>{item.semanticRef}</code>
                  <strong>{healthLabels[item.state]}</strong>
                  <span>{item.critical ? 'Dependência crítica' : 'Dependência não crítica'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}
