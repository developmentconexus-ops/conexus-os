import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { ProjectCreateForm } from '../features/project/components/project-create-form'
import { rootRoute } from './__root'

export const workspaceProjectNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/projects/new',
  component: WorkspaceProjectNewRoute,
})

function WorkspaceProjectNewRoute() {
  const { workspaceId } = workspaceProjectNewRoute.useParams()
  const navigate = useNavigate()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })
  if (authorityLost || (access.isError && isAuthenticationRequired(access.error))) {
    return <main className="status"><h1>Entre no Conexus</h1><a className="primary" href="/protocol/oidc/login">Entrar</a></main>
  }
  if (access.isPending) return <main className="status"><h1>Carregando seu acesso</h1></main>
  if (access.isError) return <main className="status"><h1>Não foi possível consultar seu acesso</h1><button type="button" onClick={() => void access.refetch()}>Tentar novamente</button></main>
  const workspace = access.data.workspaces.find((candidate) => candidate.workspaceId === workspaceId)
  if (!workspace) return <Shell context={access.data}><main className="status"><h1>Workspace indisponível</h1><p>O servidor não revelou este Workspace para a autoridade atual.</p></main></Shell>
  return (
    <Shell context={access.data} scope={{ workspace }}>
      <main className="setup">
        <p className="eyebrow">{workspace.name} / Novo Project</p>
        <h1>Criar Project</h1>
        <p>A criação só será confirmada depois que identidade, acesso inicial e origem canônica concordarem.</p>
        <ProjectCreateForm
          workspaceId={workspaceId}
          onAuthenticationRequired={() => void navigate({ to: '/', search: { workspaceId: undefined } })}
          onCreated={(project) => void navigate({ to: '/projects/$projectId', params: { projectId: project.projectId } })}
        />
        <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId }}>Voltar aos Projects</Link>
      </main>
    </Shell>
  )
}
