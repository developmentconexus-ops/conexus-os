import { Notice } from '@mastra/playground-ui/components/Notice'
import { failureCodeText, shortReference } from '@conexus/contract'
import type { BuilderRun } from '../api'
import { failureOutcome } from './run-state'

export function RunFailure({ run }: Readonly<{ run: BuilderRun }>) {
  const outcome = failureOutcome(run)
  if (outcome === null) return null
  const failed = outcome === 'FAILED' || outcome === 'BUILD_FAILED'
  return <div className="builder-turn-status" role={failed ? 'alert' : 'note'}>
    <Notice variant={failed ? 'destructive' : 'note'}><Notice.Message>{failureCodeText(run.failureCode)}</Notice.Message></Notice>
    {failed && <p className="builder-turn-reference">{shortReference(run.builderRunId)}</p>}
  </div>
}
