import { Button } from '@mastra/playground-ui/components/Button'
import { Link } from '@tanstack/react-router'
import { failureText, type ReceivedFailure } from '@conexus/contract'

/** A Project the Hub does not show this person. Waiting changes nothing, so the only way offered is back. */
export function ProjectUnavailable({ failure }: Readonly<{ failure: ReceivedFailure }>) {
  return <div className="cx-state" role="alert">
    <h2>Projeto indisponível</h2>
    <p>{failureText(failure)}</p>
    <Button as={Link} to="/workspaces" variant="outline">Ver meus Workspaces</Button>
  </div>
}
