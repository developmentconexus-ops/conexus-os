import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { WorkspaceMembers } from '../features/identity-access/components/workspace-members'
import { rootRoute } from './__root'

export const workspaceMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/members',
  component: WorkspaceMembersRoute,
})

function WorkspaceMembersRoute() {
  const { workspaceId } = workspaceMembersRoute.useParams()
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
      <main>
        <nav aria-label="Contexto">
          <Link to="/" search={{ workspaceId }}>Workspaces</Link> /{' '}
          <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId }}>{workspace.name}</Link> /{' '}
          <span>Membros</span>
        </nav>
        <div className="page-heading">
          <div><p className="eyebrow">Workspace / Membros</p><h1>Membros</h1></div>
        </div>
        <WorkspaceMembers
          workspaceId={workspaceId}
          currentAccountId={access.data.account.accountId}
          onAuthenticationRequired={() => { void navigate({ to: '/', search: { workspaceId: undefined } }) }}
        />
      </main>
    </Shell>
  )
}
