import type { Admitted, AccountScope, AdministratorScope } from './dependencies.js'
import type { ModelAccountStore, WriteTarget, ConnectionGenerationId } from './store.js'
import type { ModelAccountModule, ConnectedAccount } from './module.js'
import type { GoogleAiProPool } from './runtime.js'
import type { Credential, ModelId } from './credential.js'
import type { ModelAccountId } from '@conexus/contract'
declare const own:Admitted<AccountScope>
declare const unrelated:Admitted<Extract<AdministratorScope,{action:'administrators.manage'}>>
declare const store:ModelAccountStore
declare const models:ModelAccountModule
declare const model:ModelId
// @ts-expect-error Personal proof cannot write installation.
const wrongScope:WriteTarget={scope:'installation',proof:own}
// @ts-expect-error Administrator role is not admission to a different action.
const wrongAction:WriteTarget={scope:'installation',proof:unrelated}
// @ts-expect-error Default writer requires installation admission.
models.setInstallationBuildDefault({scope:'personal',proof:own},model)
// @ts-expect-error Generation identity cannot be a timestamp.
const timeGeneration:ConnectionGenerationId=new Date()
// @ts-expect-error Display response carries no actor AccountId.
const exposedActor:ConnectedAccount={state:'connected',kind:'oauth',needsSignIn:false,connectedByName:'Example',connectedAt:'example',connectedBy:{accountId:'example'}}
declare const pool:GoogleAiProPool
declare const row:ModelAccountId
declare const credential:Extract<Credential,{provider:'google-ai-pro'}>
// @ts-expect-error Pool acquire needs explicit generated generation and held spent context.
pool.acquire({generation:{modelAccountId:row,connectedAt:new Date()},credential})
// @ts-expect-error A stored refusal carries spent row context.
store.markRefused(own,{reason:'PROVIDER_REFRESH_REFUSED'})
void [wrongScope,wrongAction,timeGeneration,exposedActor]

import type { GoogleTicket } from './runtime.js'
// @ts-expect-error Raw strings cannot become owner-issued router tickets.
const rawTicket: GoogleTicket = 'invented'
void rawTicket

import type { HeldAccount } from './store.js'
declare const anthropicHold: HeldAccount<Extract<Credential,{provider:'anthropic'}>>
// @ts-expect-error Pool derives Google identity/credential from one Google hold.
pool.acquire(anthropicHold)
