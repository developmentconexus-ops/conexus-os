import { Button } from '@mastra/playground-ui/components/Button'
import { createRoute, Link, Navigate } from '@tanstack/react-router'
import { ChevronRight, Plus } from 'lucide-react'
import { AccessGate } from '../app/access-gate'
import { Shell } from '../app/shell'
import '../features/workspace/workspace.css'
import { rootRoute } from './__root'

export const workspacesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/workspaces',
  component: () => <AccessGate>{(context) => {
    const only = context.workspaces.length === 1 ? context.workspaces[0] : undefined
    if (only) return <Navigate to="/workspaces/$workspaceId/projects" params={{ workspaceId: only.workspaceId }} replace />
    if (context.workspaces.length === 0) return <Navigate to="/workspaces/new" replace />
    return <Shell context={context}>
      <div className="cx-page cx-page--narrow">
        <div className="cx-page-head">
          <div>
            <h1>Workspaces</h1>
            <p>Escolha onde trabalhar. Cada Workspace tem seus próprios Projetos e pessoas.</p>
          </div>
          <Button as={Link} to="/workspaces/new" variant="outline"><Plus size={16} aria-hidden /> Novo Workspace</Button>
        </div>
        <ul className="cx-workspace-list">
          {context.workspaces.map((workspace) => (
            <li key={workspace.workspaceId}>
              <Link to="/workspaces/$workspaceId/projects" params={{ workspaceId: workspace.workspaceId }}>
                <span className="cx-workspace-initial" aria-hidden>{workspace.name.trim().charAt(0).toLocaleUpperCase('pt-BR')}</span>
                <span className="cx-workspace-name">{workspace.name}</span>
                <ChevronRight size={18} aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  }}</AccessGate>,
})
