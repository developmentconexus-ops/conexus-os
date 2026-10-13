import { ProjectId } from '@conexus/contract'
import { allocate } from '../../apps/hub/src/app-runner/allocation.js'
import type { PreviewAllocation } from '../../apps/hub/src/app-runner/allocation.js'
import { disposePreviewAllocation, resetPreviewSchema, type Sql } from '../../apps/hub/src/app-runner/data-plane.js'
import type { ApplicationRunnerClient } from '../../apps/hub/src/app-runner/module.js'

export function domainRules(sql: Sql, runner: ApplicationRunnerClient, input: Omit<Parameters<ApplicationRunnerClient['invoke']>[0], 'kind'>) {
  const projectId = ProjectId.parse('30000000-0000-8000-8000-000000000005')
  const preview = allocate({ projectId, kind: 'PREVIEW' })
  const published = allocate({ projectId, kind: 'PUBLISHED' })
  resetPreviewSchema(sql, preview)
  disposePreviewAllocation(sql, preview)
  runner.invoke({ ...input, kind: 'PREVIEW' })
  runner.invoke({ ...input, kind: 'PUBLISHED' })
  // @ts-expect-error Published carries no Preview reset authority.
  resetPreviewSchema(sql, published)
  // @ts-expect-error Published carries no Preview disposal authority.
  disposePreviewAllocation(sql, published)
  // @ts-expect-error An invocation cannot infer its data domain.
  runner.invoke(input)
  // @ts-expect-error Raw strings are not admitted Project identities.
  allocate({ projectId: 'raw', kind: 'PREVIEW' })
  // @ts-expect-error A caller cannot supply coordinates independently of the Project and domain.
  allocate({ projectId, kind: 'PREVIEW', schema: published.schema })
  // @ts-expect-error Coordinates of another domain cannot be combined with Preview identity.
  const crossed: PreviewAllocation = { ...preview, runtimeRole: published.runtimeRole }
  return crossed
}
