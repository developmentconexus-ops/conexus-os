import type { AccountId, WorkspaceId } from '../../packages/contract/dist/index.js'
import { grantCreatorMembership } from '../../apps/hub/src/identity-access/admission.js'
import type { Admitted, AccountScope, ProjectScope, WorkspaceScope } from '../../apps/hub/src/identity-access/admission.js'
import type { ReadTx, WriteTx } from '../../apps/hub/src/platform/db.js'

declare const account: AccountId
declare const workspace: WorkspaceId
declare const owner: Admitted<WorkspaceScope<'members.manage'>>
declare const reader: Admitted<WorkspaceScope<'workspace.read'>, 'read'>
declare const readTx: ReadTx
declare const writeTx: WriteTx

// @ts-expect-error A proof cannot be constructed as an object.
const forged: Admitted<AccountScope> = { scope: { kind: 'account', accountId: account }, tx: writeTx }
// @ts-expect-error A spread copy loses the private proof brand.
const copied: Admitted<WorkspaceScope<'members.manage'>> = { ...owner, scope: { ...owner.scope, workspaceId: workspace } }
// @ts-expect-error A workspace proof cannot stand in for an account proof.
const wrongScope: Admitted<AccountScope> = owner
// @ts-expect-error A workspace read proof cannot manage members.
const wrongAction: Admitted<WorkspaceScope<'members.manage'>> = reader
// @ts-expect-error A project proof cannot stand in for a workspace proof.
const wrongProject: Admitted<ProjectScope> = owner
// @ts-expect-error A read proof cannot stand in for a write proof.
const wrongMode: Admitted<WorkspaceScope<'workspace.read'>> = reader
// @ts-expect-error ReadTx has no mutation method.
readTx.run
// @ts-expect-error The command requires an account admission proof.
grantCreatorMembership(account, workspace)
// @ts-expect-error Undefined is not a proof.
grantCreatorMembership(undefined, workspace)

void [forged, copied, wrongScope, wrongAction, wrongProject, wrongMode]
