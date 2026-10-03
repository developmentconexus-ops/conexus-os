import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { IntegrationsScreen } from '../features/connector/components/integrations-screen'
import { getProject, projectQueryKey } from '../features/project/api'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'
import { failureText, isFailure } from '../app/http'
import { FailureState } from '../app/failure-state'

export const projectIntegrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/integrations',
  component: ProjectIntegrationsRoute,
})

function ProjectIntegrationsRoute() {
  const { projectId } = projectIntegrationsRoute.useParams()
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  return <AccessGate>{(context) => {
    const workspace = project.data && context.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
    return <Shell context={context} scope={project.data && workspace ? { workspace, project: project.data } : undefined}>
      <div className="cx-page cx-page--narrow">
        {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
        {project.isError && <ProjectUnavailable error={project.error} onRetry={() => void project.refetch()} />}
        {project.isSuccess && <>
          <div className="cx-page-head">
            <div>
              <h1>Integrações</h1>
              <p>As conexões do Workspace com o Sankhya e o que {project.data.name} pode usar delas.</p>
            </div>
          </div>
          <IntegrationsScreen workspaceId={project.data.workspaceId} projectId={projectId} />
        </>}
      </div>
    </Shell>
  }}</AccessGate>
}

function ProjectUnavailable({ error, onRetry }: Readonly<{ error: unknown; onRetry: () => void }>) {
  const hidden = isFailure(error, 'PROJECT_NOT_FOUND')
  if (!hidden) return <FailureState title="Não foi possível carregar o Projeto" error={error} onRetry={onRetry} />
  return <div className="cx-state" role="alert">
    <h2>Projeto indisponível</h2>
    <p>{failureText(error)}</p>
    <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button>
  </div>
}
