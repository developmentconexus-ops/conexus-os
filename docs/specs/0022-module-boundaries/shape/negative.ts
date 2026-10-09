import type { ProjectId, WorkspaceId } from '@conexus/contract'
import type { Admitted, Checked, ProjectScope, SystemScope } from '../../../../apps/hub/src/identity-access/admission.js'
import type { ProjectLocks } from './owners.js'
import { sealShape, type SealedApplication } from './sealed.js'

function sealedRules(input: Parameters<typeof sealShape>[0], run: Parameters<typeof sealShape>[1]) {
  const real = sealShape(input, run)
  // @ts-expect-error A field copy loses the registry's nominal identity.
  const copied: SealedApplication = { ...real }
  // @ts-expect-error A plain object cannot be a registry-produced value.
  const object: SealedApplication = { projectId: real.projectId, sourceRevision: real.sourceRevision, digest: real.digest }
  return { copied, object }
}

// @ts-expect-error The owner exports a type, not a subclassable constructor.
class Forged extends SealedApplication {}
// @ts-expect-error Consumers cannot construct a sealed value.
new SealedApplication()

function proofRules(ports: ProjectLocks, checked: Checked<ProjectScope<'project.read'>>, projectId: ProjectId, workspaceId: WorkspaceId, system: Admitted<SystemScope<'builder-executor'>>) {
  // @ts-expect-error A read proof cannot lock a Project on an executor transition.
  ports.lockPresentProject(checked, projectId)
  // @ts-expect-error A Workspace id cannot select a Project.
  ports.lockPresentProject(system, workspaceId)
}
