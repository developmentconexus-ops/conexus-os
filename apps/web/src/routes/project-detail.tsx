import { useQuery } from '@tanstack/react-query'
import { createRoute } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getProject, projectQueryKey } from '../features/project/api'
import { ProjectDetail } from '../features/project/components/project-detail'
import { rootRoute } from './__root'

export const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId',
  component: ProjectDetailRoute,
})

function ProjectDetailRoute() {
  const { projectId } = projectDetailRoute.useParams()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) {
    return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  }
  if (access.isPending) return <main className="status"><h1>Carregando seu acesso</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar seu acesso</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  const workspace = project.data
    ? access.data.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
    : undefined
  const scope = project.data && workspace ? { workspace, project: project.data } : undefined
  return <Shell context={access.data} scope={scope}><main><ProjectDetail projectId={projectId} /></main></Shell>
}
