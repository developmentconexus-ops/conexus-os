import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { IntegrationsScreen } from '../features/connector/components/integrations-screen'
import { projectQuery } from '../features/project/api'
import { ProjectUnavailable } from '../features/project/components/project-unavailable'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'
import { FailureState } from '../app/failure-state'

export const projectIntegrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/integrations',
  component: ProjectIntegrationsRoute,
})

function ProjectIntegrationsRoute() {
  const { projectId } = projectIntegrationsRoute.useParams()
  const project = useQuery(projectQuery(projectId))
  return <AccessGate>{(context) => {
    const projectDetail = project.data?.kind === 'found' ? project.data.project : undefined
    const workspace = projectDetail && context.workspaces.find((candidate) => candidate.workspaceId === projectDetail.workspaceId)
    return <Shell context={context} scope={projectDetail && workspace ? { workspace, project: projectDetail } : undefined}>
      <div className="cx-page cx-page--narrow">
        {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
        {project.isError && <FailureState title="Não foi possível carregar o Projeto" error={project.error} onRetry={() => void project.refetch()} />}
        {project.isSuccess && project.data.kind === 'not-found' && <ProjectUnavailable failure={project.data.failure} />}
        {project.isSuccess && project.data.kind === 'found' && project.data.project.state === 'deleting' && <div className="cx-state" role="status">
          <h2>Exclusão de {project.data.project.name} em andamento</h2>
          <p>As integrações ficam indisponíveis enquanto o Projeto é excluído.</p>
        </div>}
        {project.isSuccess && project.data.kind === 'found' && project.data.project.state === 'live' && <>
          <div className="cx-page-head">
            <div>
              <h1>Integrações</h1>
              <p>As conexões do Workspace com o Sankhya e o que {project.data.project.name} pode usar delas.</p>
            </div>
          </div>
          <IntegrationsScreen workspaceId={project.data.project.workspaceId} projectId={projectId} />
        </>}
      </div>
    </Shell>
  }}</AccessGate>
}
