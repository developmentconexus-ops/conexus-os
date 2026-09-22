import { createRoute, useNavigate } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { WorkspaceCreateForm } from '../features/workspace/components/workspace-create-form'
import { rootRoute } from './__root'

export const workspaceNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/new',
  component: WorkspaceNewRoute,
})

function WorkspaceNewRoute() {
  const navigate = useNavigate()
  return <AccessGate>{(context) => (
    <Shell context={context}>
      <div className="cx-page cx-page--narrow">
        <div className="cx-page-head">
          <div>
            <h1>Novo Workspace</h1>
            <p>Um Workspace reúne os Projetos de uma equipe. Você será o owner e poderá convidar pessoas em seguida.</p>
          </div>
        </div>
        <div className="cx-panel">
          <WorkspaceCreateForm
            currentAccountId={context.account.accountId}
            firstWorkspace={context.workspaces.length === 0}
            onCreated={(workspace) => void navigate({ to: '/workspaces/$workspaceId/projects', params: { workspaceId: workspace.workspaceId } })}
          />
        </div>
      </div>
    </Shell>
  )}</AccessGate>
}
