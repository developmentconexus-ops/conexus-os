import { createRoute, useNavigate } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { WorkspaceMembers } from '../features/identity-access/components/workspace-members'
import { WorkspaceUnavailable } from '../features/workspace/components/workspace-unavailable'
import { rootRoute } from './__root'

export const workspaceMembersRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/settings/people',
  component: WorkspaceMembersRoute,
})

function WorkspaceMembersRoute() {
  const { workspaceId } = workspaceMembersRoute.useParams()
  const navigate = useNavigate()
  return <AccessGate>{(context) => {
    const workspace = context.workspaces.find((candidate) => candidate.workspaceId === workspaceId)
    if (!workspace) return <Shell context={context}><WorkspaceUnavailable /></Shell>
    return <Shell context={context} scope={{ workspace }}>
      <div className="cx-page cx-page--narrow cx-people-page">
        <div className="cx-page-head">
          <div>
            <h1>Pessoas</h1>
            <p>Quem trabalha em {workspace.name}. Owners convidam, mudam papéis e removem pessoas.</p>
          </div>
        </div>
        <WorkspaceMembers
          workspaceId={workspaceId}
          currentAccountId={context.account.accountId}
          onLeft={() => void navigate({ to: '/workspaces' })}
        />
      </div>
    </Shell>
  }}</AccessGate>
}
