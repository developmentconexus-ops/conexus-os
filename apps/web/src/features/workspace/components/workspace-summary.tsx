import { useQuery } from '@tanstack/react-query'
import { getWorkspace, WorkspaceRequestError, workspaceQueryKey } from '../api'

export function WorkspaceSummary({ workspaceId }: { workspaceId: string }) {
  const workspace = useQuery({
    queryKey: workspaceQueryKey(workspaceId),
    queryFn: () => getWorkspace(workspaceId),
  })

  if (workspace.isPending) return <p role="status">Carregando o Workspace…</p>
  if (workspace.isError) {
    if (
      workspace.error instanceof WorkspaceRequestError &&
      (workspace.error.status === 403 || workspace.error.status === 404)
    ) {
      return (
        <section className="empty" aria-labelledby="workspace-unavailable">
          <h2 id="workspace-unavailable">Workspace indisponível</h2>
          <p>O servidor não revelou este Workspace para a autoridade atual.</p>
        </section>
      )
    }
    return (
      <section className="empty" aria-labelledby="workspace-failure">
        <h2 id="workspace-failure">Não foi possível consultar o Workspace</h2>
        <p>Isso não confirma ausência nem remove o acesso atual.</p>
        <button type="button" onClick={() => void workspace.refetch()}>Tentar novamente</button>
      </section>
    )
  }

  return (
    <section className="empty" aria-labelledby="current-workspace">
      <p className="eyebrow">Workspace atual</p>
      <h2 id="current-workspace">{workspace.data.name}</h2>
      <p>O acesso inicial desta conta foi confirmado pelo servidor.</p>
    </section>
  )
}
