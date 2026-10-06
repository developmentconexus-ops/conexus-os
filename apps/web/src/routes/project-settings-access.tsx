import { Button } from '@mastra/playground-ui/components/Button'
import { Skeleton } from '@mastra/playground-ui/components/Skeleton'
import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { ProjectId } from '@conexus/contract'
import { AccessGate } from '../app/access-gate'
import { routeParam } from '../app/route-params'
import { Shell } from '../app/shell'
import { ApplicationAccess } from '../features/identity-access/components/application-access'
import { projectQuery } from '../features/project/api'
import '../features/project/project-settings.css'
import { rootRoute } from './__root'
import { failureText, isFailure } from '../app/http'
import { FailureState } from '../app/failure-state'

export const projectSettingsAccessRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/settings/access',
  component: ProjectSettingsAccessRoute,
})

function ProjectSettingsAccessRoute() {
  const projectId = routeParam(ProjectId, projectSettingsAccessRoute.useParams().projectId)
  const project = useQuery(projectQuery(projectId))
  return <AccessGate>{(context) => {
    const workspace = project.data && context.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
    return <Shell context={context} scope={project.data && workspace ? { workspace, project: project.data } : undefined}>
      <div className="cx-page cx-page--narrow">
        {project.isPending && <div className="cx-page-head" aria-busy="true"><Skeleton className="cx-skeleton-line" /><span className="sr-only" role="status">Carregando o Projeto</span></div>}
        {project.isError && <ProjectUnavailable error={project.error} onRetry={() => void project.refetch()} />}
        {project.isSuccess && <>
          <div className="cx-page-head">
            <div>
              <h1>Acesso ao aplicativo</h1>
              <p>Quem, além do Workspace, pode usar o aplicativo de {project.data.name}.</p>
            </div>
          </div>
          <ApplicationAccess projectId={projectId} />
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
