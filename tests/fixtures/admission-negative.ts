import { z } from 'zod'
import type { AccountId, ProjectId, WorkspaceId } from '../../packages/contract/dist/index.js'
import { admitAccount, admitApplication, checkApplication, admitProject, admitSystem, admitWorkspace, grantCreatorMembership } from '../../apps/hub/src/identity-access/admission.js'
import type { Admitted, AccountScope, ApplicationScope, Checked, ProjectScope, SystemScope, WorkspaceScope } from '../../apps/hub/src/identity-access/admission.js'
import type { AuthenticationGate, CommandGate, ReadTx, RawToken, WriteTx } from '../../apps/hub/src/platform/db.js'
import { digest, sql } from '../../apps/hub/src/platform/db.js'

declare const account: AccountId
declare const workspace: WorkspaceId
declare const project: ProjectId
declare const builder: Admitted<ProjectScope<'project.build'>>
declare const checked: Checked<ApplicationScope>
declare const admittedApplication: Admitted<ApplicationScope>
declare const purge: Admitted<SystemScope<'project-purge'>>
declare const reaper: Admitted<SystemScope<'iam-reaper'>>
declare const owner: Admitted<WorkspaceScope<'members.manage'>>
declare const reader: Admitted<WorkspaceScope<'workspace.read'>, 'read'>
declare const writeReader: Admitted<WorkspaceScope<'workspace.read'>>
declare const readTx: ReadTx
declare const writeTx: WriteTx
declare const presented: RawToken
declare const gate: CommandGate
declare const authentication: AuthenticationGate

// @ts-expect-error A proof cannot be constructed as an object.
const forged: Admitted<AccountScope> = { scope: { kind: 'account', accountId: account }, tx: writeTx }
// @ts-expect-error A spread copy loses the private proof brand.
const copied: Admitted<WorkspaceScope<'members.manage'>> = { ...owner, scope: { ...owner.scope, workspaceId: workspace } }
// @ts-expect-error A workspace proof cannot stand in for an account proof.
const wrongScope: Admitted<AccountScope> = owner
// @ts-expect-error A workspace read proof cannot manage members.
const wrongAction: Admitted<WorkspaceScope<'members.manage'>> = writeReader
// @ts-expect-error A workspace proof cannot stand in for a project proof.
const wrongProject: Admitted<ProjectScope> = owner
// @ts-expect-error A read proof cannot stand in for a write proof.
const wrongMode: Admitted<WorkspaceScope<'workspace.read'>> = reader
// @ts-expect-error ReadTx has no mutation method.
readTx.run
// @ts-expect-error Account admission takes a gate, never a transaction.
admitAccount(readTx)
// @ts-expect-error Admission takes no account id: the gate carries the actor.
admitAccount(gate, account)
// @ts-expect-error A gate is nominal, so an object literal is not one.
const literalGate: CommandGate = {}
// @ts-expect-error A spread copy of a gate is not a gate.
const spreadGate: CommandGate = { ...gate }
// @ts-expect-error A gate has no query method.
gate.rows
// @ts-expect-error A gate does not expose its transaction.
gate.tx
// @ts-expect-error A workspace admission takes a command gate, not an authentication gate.
admitWorkspace(authentication, workspace, 'workspace.read')
// @ts-expect-error A transaction mode that writes cannot be asked of a read: run is not on a ReadTx.
readTx.run(sql`SELECT 1`)
// @ts-expect-error A command's own transaction is a write transaction, so it cannot take a read admission.
admitProject(builder.tx, project, 'project.read')
// @ts-expect-error A read admission of a project takes only the read actions, so a build is a command.
admitProject(readTx, project, 'project.build')
// @ts-expect-error A command's own transaction cannot take the workspace read admission either.
admitWorkspace(builder.tx, workspace, 'workspace.read')
// @ts-expect-error A reader's transaction mode is 'read', never 'write'.
const writeMode: ReadTx['mode'] = 'write'
// @ts-expect-error A job proof for one job cannot stand in for the purge job's proof.
const wrongJob: Admitted<SystemScope<'project-purge'>> = reaper
// @ts-expect-error A served read proof has a read transaction, so it cannot write.
checked.tx.run(sql`SELECT 1`)
// @ts-expect-error A served read proof cannot stand in for a write proof: no command port accepts it.
const checkedAsAdmitted: Admitted<ApplicationScope> = checked
// @ts-expect-error A write proof is not a served read proof either; the two are separate classes.
const admittedAsChecked: Checked<ApplicationScope> = admittedApplication
// @ts-expect-error A spread copy of a served read proof loses its private brand.
const copiedChecked: Checked<ApplicationScope> = { ...checked }
// @ts-expect-error The served read check takes a gate, not a read transaction.
checkApplication(readTx, project)
// @ts-expect-error The application admission takes a gate, not a read transaction.
admitApplication(readTx, workspace)
// @ts-expect-error The command requires an account admission proof.
grantCreatorMembership(account, workspace)
// @ts-expect-error Undefined is not a proof.
grantCreatorMembership(undefined, workspace)

// @ts-expect-error A raw token is never a query value; only its digest is.
sql`SELECT ${presented}`

const positiveAuthentication: Promise<Admitted<AccountScope>> = admitAccount(authentication)
const positiveDigest = sql`SELECT ${digest(presented)}, ${'plain'}`
const positiveOwner: Admitted<WorkspaceScope<'members.manage'>> = owner
const positiveRead: Admitted<WorkspaceScope<'workspace.read'>, 'read'> = reader
const positiveChecked: Promise<Checked<ApplicationScope>> = checkApplication(gate, project)
const positiveCheckedRead: Promise<readonly unknown[]> = checked.tx.rows(z.unknown(), sql`SELECT 1`)
const positivePurge: Admitted<SystemScope<'project-purge'>> = purge
const positiveSystem: Promise<Admitted<SystemScope<'project-purge'>>> = admitSystem(gate, 'project-purge')
const positiveGrant: Promise<void> = grantCreatorMembership(await admitAccount(gate), workspace)

void [literalGate, spreadGate, positiveAuthentication, positiveDigest, positiveOwner, positiveRead, positiveGrant, positivePurge, positiveSystem, positiveChecked, positiveCheckedRead, checkedAsAdmitted, admittedAsChecked, copiedChecked, writeMode, wrongJob, forged, copied, wrongScope, wrongAction, wrongProject, wrongMode]
