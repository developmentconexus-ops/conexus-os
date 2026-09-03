import { useQuery } from '@tanstack/react-query'
import { createRoute, Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useAuthorityLost } from '../app/query-client'
import { Shell } from '../app/shell'
import {
  accessContextQueryKey,
  getAccessContext,
  isAuthenticationRequired,
} from '../features/identity-access/api'
import { WorkspaceSummary } from '../features/workspace/components/workspace-summary'
import { rootRoute } from './__root'

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  validateSearch: (search: Record<string, unknown>) => ({
    workspaceId: typeof search.workspaceId === 'string' ? search.workspaceId : undefined,
  }),
  component: HomeRoute,
})

function HomeRoute() {
  const search = indexRoute.useSearch()
  const authorityLost = useAuthorityLost()
  const access = useQuery({ queryKey: accessContextQueryKey, queryFn: getAccessContext })

  if (authorityLost) {
    return (
      <Status
        title="Entre no Conexus"
        detail="A autenticação confirma sua identidade; o Conexus resolve sua conta e autorização atuais."
      >
        <a className="primary" href="/protocol/oidc/login">Entrar</a>
      </Status>
    )
  }
  if (access.isPending) {
    return <Status title="Carregando seu acesso" detail="Consultando a autoridade atual do servidor." />
  }
  if (access.isError) {
    if (isAuthenticationRequired(access.error)) {
      return (
        <Status
          title="Entre no Conexus"
          detail="A autenticação confirma sua identidade; o Conexus resolve sua conta e autorização atuais."
        >
          <a className="primary" href="/protocol/oidc/login">Entrar</a>
        </Status>
      )
    }
    return (
      <Status
        title="Não foi possível consultar seu acesso"
        detail="Isso não significa que sua lista de Workspaces está vazia."
      >
        <button type="button" onClick={() => void access.refetch()}>Tentar novamente</button>
      </Status>
    )
  }

  return (
    <Shell
      context={access.data}
      scope={{
        workspace: access.data.workspaces.find(
          (workspace) => workspace.workspaceId === search.workspaceId,
        ),
      }}
    >
      <main>
        <p className="eyebrow">Workspaces</p>
        <h1>Olá, {access.data.account.displayName}</h1>
        {access.data.workspaces.length === 0 ? (
          <section className="empty" aria-labelledby="workspace-state">
            <h2 id="workspace-state">Crie seu primeiro Workspace</h2>
            <p>O servidor confirmou que esta conta ainda não possui um Workspace divulgado.</p>
            <Link className="primary" to="/workspaces/new">Novo Workspace</Link>
          </section>
        ) : (
          <section aria-labelledby="workspace-list">
            <h2 id="workspace-list">Seus Workspaces</h2>
            <ul>
              {access.data.workspaces.map((workspace) => (
                <li key={workspace.workspaceId}>
                  <Link to="/" search={{ workspaceId: workspace.workspaceId }}>
                    {workspace.name}
                  </Link>
                </li>
              ))}
            </ul>
            <Link to="/workspaces/new">Novo Workspace</Link>
          </section>
        )}
        {search.workspaceId && (
          <>
            <WorkspaceSummary workspaceId={search.workspaceId} />
            <Link
              className="primary context-action"
              to="/workspaces/$workspaceId/projects"
              params={{ workspaceId: search.workspaceId }}
            >
              Abrir Projects
            </Link>
          </>
        )}
      </main>
    </Shell>
  )
}

function Status({ title, detail, children }: { title: string; detail: string; children?: ReactNode }) {
  return (
    <main className="status">
      <p className="eyebrow">Conexus</p>
      <h1>{title}</h1>
      <p>{detail}</p>
      {children}
    </main>
  )
}
