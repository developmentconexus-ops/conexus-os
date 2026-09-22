import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { ExternalLink } from 'lucide-react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { getProject, getProjectRepository, ProjectRequestError, projectQueryKey, projectRepositoryQueryKey } from '../features/project/api'
import type { ProjectRepresentation } from '../generated/project-client'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'

export const projectSettingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings',
  component: ProjectSettingsRoute,
})

function ProjectSettingsRoute() {
  const { projectId } = projectSettingsRoute.useParams()
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  return <AccessGate>{(context) => {
    const workspace = project.data && context.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
    return <Shell context={context} scope={project.data && workspace ? { workspace, project: project.data } : undefined}>
      <div className="cx-page cx-page--narrow">
        {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
        {project.isError && <ProjectUnavailable error={project.error} onRetry={() => void project.refetch()} />}
        {project.isSuccess && <About project={project.data} />}
      </div>
    </Shell>
  }}</AccessGate>
}

function ProjectUnavailable({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const hidden = error instanceof ProjectRequestError && (error.status === 403 || error.status === 404)
  return <div className="cx-state" role="alert">
    <h2>{hidden ? 'Projeto indisponível' : 'Não foi possível carregar o Projeto'}</h2>
    <p>{hidden ? 'Este Projeto não existe ou você não faz parte do Workspace dele.' : 'O servidor não respondeu desta vez. Nada foi alterado.'}</p>
    {hidden ? <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button> : <Button type="button" variant="outline" onClick={onRetry}>Tentar de novo</Button>}
  </div>
}

function About({ project }: Readonly<{ project: ProjectRepresentation }>) {
  return <>
    <div className="cx-page-head">
      <div>
        <h1>Sobre o Projeto</h1>
        <p>O que o Conexus sabe sobre {project.name} e onde o código dele mora.</p>
      </div>
    </div>
    <dl className="cx-facts">
      <div>
        <dt>Nome</dt>
        <dd>{project.name}{project.archived && <span className="cx-chip">Arquivado</span>}</dd>
      </div>
      <div>
        <dt>Repositório</dt>
        <dd><RepositoryState projectId={project.projectId} /></dd>
      </div>
      <div>
        <dt>Internet</dt>
        <dd>O agente executa comandos sozinho num ambiente isolado com acesso à internet.</dd>
      </div>
    </dl>
    <details className="cx-technical">
      <summary>Identificação técnica</summary>
      <dl>
        <dt>Projeto</dt><dd><code>{project.projectId}</code></dd>
        <dt>Revisão</dt><dd><code>{project.projectRevision}</code></dd>
      </dl>
    </details>
  </>
}

function RepositoryState({ projectId }: Readonly<{ projectId: string }>) {
  const repository = useQuery({ queryKey: projectRepositoryQueryKey(projectId), queryFn: () => getProjectRepository(projectId) })
  if (repository.isPending) return <span className="cx-repo" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Verificando o repositório</span></span>
  if (repository.isError) {
    return <span className="cx-repo">
      <span>Não foi possível verificar o repositório agora.</span>
      <Button type="button" variant="ghost" size="sm" onClick={() => void repository.refetch()}>Verificar de novo</Button>
    </span>
  }
  if (repository.data.state === 'UNREACHABLE') {
    return <span className="cx-repo">
      <span className="cx-chip" data-tone="failed">Inacessível</span>
      <span className="cx-repo-note">O Conexus não consegue alcançar o repositório no GitHub, então novos pedidos ficam parados. Um administrador da instalação pode reconectar o GitHub em Configurações.</span>
    </span>
  }
  return <span className="cx-repo">
    <a href={repository.data.url} target="_blank" rel="noreferrer" className="cx-repo-link">
      {repository.data.fullName} <ExternalLink size={14} aria-hidden /><span className="sr-only"> (abre o GitHub em outra aba)</span>
    </a>
    <span className="cx-chip" data-tone="live">Acessível</span>
  </span>
}
