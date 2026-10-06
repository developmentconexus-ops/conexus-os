import { z } from 'zod'
import type { AccountId, ArtifactDigest, ProjectId, SourceRevision, WorkspaceId } from '@conexus/contract'
import { admitAccount, admitApplication, admitBootstrap, checkApplication, checkProject, admitProject, admitSystem, admitWorkspace, configuredIdentity, grantCreatorMembership, receiptOf } from '../../apps/hub/src/identity-access/admission.js'
import type { Admitted, AccountScope, RunScope, ApplicationScope, Checked, ProjectScope, ProviderIdentity, SystemScope, WorkspaceScope } from '../../apps/hub/src/identity-access/admission.js'
import { idempotent, type Receipted } from '../../apps/hub/src/platform/receipt.js'
import { createWorkspace, type IdempotencyKey, WorkspaceId as WorkspaceIdSchema } from '@conexus/contract'
import type { AuthenticationGate, CommandGate, ReadTx, RawToken, WriteTx } from '../../apps/hub/src/platform/db.js'
import type { Lawful } from '../../apps/hub/src/builder/model-account/providers.js'
import type { ModelRoute, ModelRoutes } from '../../apps/hub/src/builder/model-routing.js'
import { digest, sql } from '../../apps/hub/src/platform/db.js'
import { SealedApplication } from '../../apps/hub/src/platform/sealed-application.js'
import type { RegistryModule } from '../../apps/hub/src/registry/module.js'
import { purgeProject } from '../../apps/hub/src/identity-access/application-access.js'
import { provisionIdentity } from '../../apps/hub/src/identity-access/authentication.js'
import type { SignInClaims } from '../../apps/hub/src/identity-access/oidc.js'

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
declare const registry: RegistryModule
declare const runProof: Admitted<RunScope>
declare const sourceRevision: SourceRevision
declare const artifactDigest: ArtifactDigest
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
// @ts-expect-error The registry purge takes the project purge proof, so another job's proof is refused.
void registry.purge(reaper, project)
// @ts-expect-error The registry purge takes a purge proof, not a build proof.
void registry.purge(builder, project)
void registry.purge(purge, project)
// @ts-expect-error An object with the sealed build's fields is not a sealed build (an accidental structural value).
void registry.retain(runProof, { projectId: project, sourceRevision, digest: artifactDigest })
// @ts-expect-error The sealed build is an abstract class, so it cannot be built by accident.
void new SealedApplication(project, sourceRevision, artifactDigest)
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

declare const identity: ProviderIdentity
declare const key: IdempotencyKey
declare const receipt: Receipted
const input = { params: undefined, query: undefined, body: { name: 'W' } }
const reply = async () => ({ workspaceId: workspace, name: 'W', creatorAccountId: account, initialAccessEstablished: true as const })
// @ts-expect-error A served read proof is not a receipt: a read cannot be keyed.
void idempotent(checked, createWorkspace, key, input, WorkspaceIdSchema, reply)
// @ts-expect-error A receipt is branded: an object literal with its fields is not one.
void idempotent({ tx: writeTx, authority: { kind: 'account', accountId: account } }, createWorkspace, key, input, WorkspaceIdSchema, reply)
// @ts-expect-error An admitted proof is not a receipt until receiptOf derives its authority.
void idempotent(owner, createWorkspace, key, input, WorkspaceIdSchema, reply)
// @ts-expect-error A read proof has no receipt: its transaction cannot write.
receiptOf(reader)
// @ts-expect-error The founding admission takes the configured identity, never a plain provider pair.
void admitBootstrap(authentication, identity)
// @ts-expect-error The founding admission takes an authentication gate, never a command gate.
void admitBootstrap(gate, configuredIdentity(identity))
// @ts-expect-error The Preview check takes a gate, not a read transaction.
void checkProject(readTx, project)

// @ts-expect-error A raw token is never a query value; only its digest is.
sql`SELECT ${presented}`

const positiveAuthentication: Promise<Admitted<AccountScope>> = admitAccount(authentication)
const positiveDigest = sql`SELECT ${digest(presented)}, ${'plain'}`
const positiveOwner: Admitted<WorkspaceScope<'members.manage'>> = owner
const positiveRead: Admitted<WorkspaceScope<'workspace.read'>, 'read'> = reader
const positiveChecked: Promise<Checked<ApplicationScope>> = checkApplication(gate, project)
const positiveAuthenticatedCheck: Promise<Checked<ApplicationScope>> = checkApplication(authentication, project)
const positiveAuthenticatedAdmission: Promise<Admitted<ApplicationScope>> = admitApplication(authentication, project)
const positivePreviewCheck: Promise<Checked<ProjectScope<'project.read'>>> = checkProject(authentication, project)
const positiveReceipt: Receipted = receiptOf(owner)
const positiveKeyed = idempotent(receipt, createWorkspace, key, input, WorkspaceIdSchema, reply)
const positiveBootstrap = admitBootstrap(authentication, configuredIdentity(identity))
const positiveCheckedRead: Promise<readonly unknown[]> = checked.tx.rows(z.unknown(), sql`SELECT 1`)
const positivePurge: Admitted<SystemScope<'project-purge'>> = purge
const positiveSystem: Promise<Admitted<SystemScope<'project-purge'>>> = admitSystem(gate, 'project-purge')
const positiveGrant: Promise<void> = grantCreatorMembership(await admitAccount(gate), workspace)

declare const accountProof: Admitted<AccountScope>
declare const claims: SignInClaims
// @ts-expect-error The identity purge takes the purge job's proof, never an account's.
const purgedByAccount: Promise<void> = purgeProject(accountProof, project)
const positiveIdentityPurge: Promise<void> = purgeProject(purge, project)
// @ts-expect-error An identity is provisioned only on a basis: the founding proof or a claim.
const provisionedBare = provisionIdentity(authentication, claims)

declare const anthropicRoute: ModelRoute<'anthropic'>
declare const googleRoute: ModelRoute<'google-ai-pro'>
// @ts-expect-error A Lawful credential of openai-codex cannot hold the api_key kind.
const unlawful: Lawful = { provider: 'openai-codex', kind: 'api_key' }
// @ts-expect-error A ModelRoutes missing the router prefix openai does not compile.
const missingPrefix: ModelRoutes = { anthropic: anthropicRoute, 'google-ai-pro': googleRoute }

void [purgedByAccount, positiveIdentityPurge, provisionedBare, positiveAuthenticatedCheck, positiveAuthenticatedAdmission, positivePreviewCheck, positiveReceipt, positiveKeyed, positiveBootstrap, unlawful, missingPrefix, literalGate, spreadGate, positiveAuthentication, positiveDigest, positiveOwner, positiveRead, positiveGrant, positivePurge, positiveSystem, positiveChecked, positiveCheckedRead, checkedAsAdmitted, admittedAsChecked, copiedChecked, writeMode, wrongJob, forged, copied, wrongScope, wrongAction, wrongProject, wrongMode]
