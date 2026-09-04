import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { getProject, ProjectRequestError, projectQueryKey } from '../features/project/api'
import { ProjectInception } from '../features/project/components/project-inception'
import { rootRoute } from './__root'

export const projectInceptionRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/projects/$projectId/inception',
  component: ProjectInceptionRoute,
})

function ProjectInceptionRoute() {
  const { projectId } = projectInceptionRoute.useParams()
  const navigate = useNavigate()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  const project = useQuery({ queryKey: projectQueryKey(projectId), queryFn: () => getProject(projectId) })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) {
    return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  }
  if (access.isPending || project.isPending) return <main className="status"><h1>Carregando a Inception</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar seu acesso</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  if (project.isError) {
    const undisclosed = project.error instanceof ProjectRequestError && [403, 404].includes(project.error.status ?? 0)
    return <Shell context={access.data}><main className="status"><h1>{undisclosed ? 'Project indisponível' : 'Não foi possível consultar o Project'}</h1></main></Shell>
  }
  const workspace = access.data.workspaces.find((candidate) => candidate.workspaceId === project.data.workspaceId)
  const scope = workspace ? { workspace, project: project.data } : undefined
  return (
    <Shell context={access.data} scope={scope}>
      <main className="setup">
        <p className="eyebrow">{project.data.name} / Inception</p>
        <h1>Project Inception</h1>
        <p>Descreva o resultado humano desejado. A fonte, o modelo e a autoridade continuam sob controle do servidor.</p>
        <ProjectInception
          key={projectId}
          projectId={projectId}
          onAuthenticationRequired={() => void navigate({ to: '/', search: { workspaceId: undefined } })}
          onSucceeded={(candidate) => void navigate({
            to: '/projects/$projectId/baseline-candidates/$candidateBaselineDigest',
            params: { projectId, candidateBaselineDigest: candidate.candidateBaselineDigest },
          })}
        />
        <Link to="/projects/$projectId" params={{ projectId }}>Voltar ao Project</Link>
      </main>
    </Shell>
  )
}
