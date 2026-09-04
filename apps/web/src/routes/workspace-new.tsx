import { useQuery } from '@tanstack/react-query'
import { createRoute, Link, useNavigate } from '@tanstack/react-router'
import { Shell } from '../app/shell'
import { useAuthorityLost } from '../app/query-client'
import {
  accessContextQueryKey,
  getAccessContext,
  isAuthenticationRequired,
} from '../features/identity-access/api'
import { WorkspaceCreateForm } from '../features/workspace/components/workspace-create-form'
import { rootRoute } from './__root'

export const workspaceNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/new',
  component: WorkspaceNewRoute,
})

function WorkspaceNewRoute() {
  const navigate = useNavigate()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })

  if (authorityLost) {
    return (
      <main className="status">
        <h1>Entre no Conexus</h1>
        <p>Uma sessão normal é necessária antes de criar um Workspace.</p>
        <a className="primary" href="/protocol/oidc/login">Entrar</a>
      </main>
    )
  }
  if (access.isPending) return <main className="status"><h1>Carregando seu acesso</h1></main>
  if (access.isError) {
    if (isAuthenticationRequired(access.error)) {
      return (
        <main className="status">
          <h1>Entre no Conexus</h1>
          <p>Uma sessão normal é necessária antes de criar um Workspace.</p>
          <a className="primary" href="/protocol/oidc/login">Entrar</a>
        </main>
      )
    }
    return (
      <main className="status">
        <h1>Não foi possível consultar seu acesso</h1>
        <p>A criação não foi iniciada.</p>
        <button type="button" onClick={() => void access.refetch()}>Tentar novamente</button>
      </main>
    )
  }

  return (
    <Shell context={access.data}>
      <main className="setup">
        <p className="eyebrow">Novo Workspace</p>
        <h1>Criar Workspace</h1>
        <p>O Workspace será criado para a conta atual, com o acesso inicial confirmado pelo servidor.</p>
        <WorkspaceCreateForm
          currentAccountId={access.data.account.accountId}
          onAuthenticationRequired={() =>
            void navigate({ to: '/', search: { workspaceId: undefined } })
          }
          onCreated={(workspace) =>
            void navigate({ to: '/', search: { workspaceId: workspace.workspaceId } })
          }
        />
        <Link to="/" search={{ workspaceId: undefined }}>Voltar</Link>
      </main>
    </Shell>
  )
}
