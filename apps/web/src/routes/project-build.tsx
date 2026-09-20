import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { lazy, Suspense } from 'react'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getProject, ProjectRequestError, projectQueryKey } from '../features/project/api'
import { rootRoute } from './__root'

// The chat components and their stylesheet are most of the application's weight and only this page
// and Settings use them, so they load when one of those opens rather than on every page.
const ProjectBuild = lazy(() => import('../features/builder/components/project-build').then((module) => ({ default: module.ProjectBuild })))

export const projectBuildRoute = createRoute({ getParentRoute: () => rootRoute, path: '/projects/$projectId/build', component: ProjectBuildRoute })

function ProjectBuildRoute() {
  const { projectId } = projectBuildRoute.useParams()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  if (access.isPending || project.isPending) return <main className="status"><h1>Carregando o Build</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar seu acesso</h1></main>
  if (project.isError) {
    const hidden = project.error instanceof ProjectRequestError && [403, 404].includes(project.error.status ?? 0)
    return <Shell context={access.data}><main className="status"><h1>{hidden ? 'Project indisponível' : 'Não foi possível consultar o Project'}</h1></main></Shell>
  }
  const workspace = access.data.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
  return <Shell context={access.data} scope={workspace ? { workspace, project: project.data } : undefined}><main className="control-plane-page builder-route"><p className="eyebrow">{project.data.name} / Build</p><h1>Construir com o Conexus</h1><p>Veja a aplicação no centro, converse com o Conexus ao lado e acompanhe cada alteração quando precisar.</p><Suspense fallback={<p role="status">Carregando o Build…</p>}><ProjectBuild projectId={projectId} /></Suspense><Link to="/projects/$projectId" params={{ projectId }}>Voltar ao Project</Link></main></Shell>
}
