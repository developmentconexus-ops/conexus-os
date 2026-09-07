import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import { ConnectionsSurface } from '../features/connections/components/connections-surface'
import { accessContextQueryKey, getAccessContext, isAuthenticationRequired } from '../features/identity-access/api'
import { rootRoute } from './__root'

export const workspaceConnectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/connections',
  component: WorkspaceConnectionsRoute,
})

function WorkspaceConnectionsRoute() {
  const { workspaceId } = workspaceConnectionsRoute.useParams()
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
      <main className="control-plane-page">
        <nav aria-label="Contexto"><Link to="/" search={{ workspaceId }}>Workspaces</Link> / <span>{workspace.name}</span> / <span>Connections</span></nav>
        <ConnectionsSurface ownerScopeKind="WORKSPACE" ownerId={workspaceId} />
      </main>
    </Shell>
  )
}
