import { createRoute } from '@tanstack/react-router'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import { ProjectCreateForm } from '../features/project/components/project-create-form'
import { WorkspaceUnavailable } from '../features/workspace/components/workspace-unavailable'
import { rootRoute } from './__root'

export const workspaceProjectNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces/$workspaceId/projects/new',
  component: WorkspaceProjectNewRoute,
})

function WorkspaceProjectNewRoute() {
  const { workspaceId } = workspaceProjectNewRoute.useParams()
  return <AccessGate>{(context) => {
    const workspace = context.workspaces.find((candidate) => candidate.workspaceId === workspaceId)
    if (!workspace) return <Shell context={context}><WorkspaceUnavailable /></Shell>
    return <Shell context={context} scope={{ workspace }}>
      <div className="cx-page cx-page--narrow">
        <div className="cx-page-head">
          <div>
            <h1>Novo Projeto</h1>
            <p>Cada Projeto é um aplicativo, com seu próprio repositório no GitHub criado automaticamente.</p>
          </div>
        </div>
        <div className="cx-panel"><ProjectCreateForm workspaceId={workspaceId} /></div>
      </div>
    </Shell>
  }}</AccessGate>
}
