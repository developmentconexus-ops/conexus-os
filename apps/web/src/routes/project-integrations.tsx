import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getProject, ProjectRequestError, projectQueryKey } from '../features/project/api'
import { ProjectIntegrations } from '../features/project-resources/components/project-integrations'
import { getWorkspace, WorkspaceRequestError, workspaceQueryKey } from '../features/workspace/api'
import { rootRoute } from './__root'

export const projectIntegrationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/integrations',
  component: ProjectIntegrationsRoute,
})

function ProjectIntegrationsRoute() {
  const { projectId } = projectIntegrationsRoute.useParams()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  const workspaceId = project.data?.workspaceId
  const workspace = useQuery({
    queryKey: workspaceQueryKey(workspaceId ?? ''),
    queryFn: () => getWorkspace(workspaceId ?? ''),
    enabled: workspaceId !== undefined,
  })

  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) {
    return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  }
  if (access.isPending || project.isPending || (workspaceId && workspace.isPending)) {
    return <main className="status"><h1>Carregando as Integrations do Project</h1></main>
  }
  if (access.isError) {
    return <main className="status"><h1>Não foi possível consultar seu acesso</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  }
  if (project.isError) {
    const undisclosed = project.error instanceof ProjectRequestError && [403, 404].includes(project.error.status ?? 0)
    return <Shell context={access.data}><main className="status"><h1>{undisclosed ? 'Project indisponível' : 'Não foi possível consultar o Project'}</h1><p>{undisclosed ? 'O servidor não revelou este Project para a autoridade atual.' : 'Isso não confirma ausência nem altera seu acesso.'}</p></main></Shell>
  }
  if (workspace.isError || !workspace.data) {
    const undisclosed = workspace.error instanceof WorkspaceRequestError && [403, 404].includes(workspace.error.status ?? 0)
    return <Shell context={access.data}><main className="status"><h1>{undisclosed ? 'Workspace indisponível' : 'Não foi possível consultar o Workspace'}</h1><p>Isso não confirma ausência nem amplia o acesso ao Project.</p></main></Shell>
  }
  return (
    <Shell context={access.data} scope={{ workspace: workspace.data, project: project.data }}>
      <main><ProjectIntegrations projectId={projectId} workspaceId={workspace.data.workspaceId} /></main>
    </Shell>
  )
}
