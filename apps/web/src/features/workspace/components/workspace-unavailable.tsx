import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'

export function WorkspaceUnavailable() {
  return <div className="cx-page cx-page--narrow">
    <div className="cx-state">
      <h2>Workspace indisponível</h2>
      <p>Este Workspace não existe ou você não faz parte dele. Peça um convite a um owner se precisar entrar.</p>
      <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button>
    </div>
  </div>
}
