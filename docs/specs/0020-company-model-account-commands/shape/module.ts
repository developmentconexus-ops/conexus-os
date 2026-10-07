import type { AccountId, ModelAccountId, ModelLoginId, ModelAccountProvider, ThinkingLevel, IdempotencyKey } from '@conexus/contract'
import type { MastraModelConfig } from '@mastra/core/llm'
import type { FastifyInstance } from 'fastify'
import type { Job } from '../../../../apps/hub/src/platform/jobs.js'
import type { Credential, CredentialKind, ModelId, ModelRole } from './credential.js'
import type { Result, WaveFailure } from './dependencies.js'
import type { OpenRun, WriteTarget } from './store.js'
import type { ModelAccountDependencies } from '#foundation-module'
export type ConnectedAccount<K extends CredentialKind['kind'] = CredentialKind['kind']> = Readonly<{state:'absent'}> | Readonly<{state:'connected';kind:K;needsSignIn:boolean;connectedByName:string;connectedAt:string}>
export type AccountInUse = Readonly<{source:'none'}> | Readonly<{source:'personal'|'installation';kind:CredentialKind['kind'];needsSignIn:boolean}>
export type ModelAccountEntry = { [P in ModelAccountProvider]: Readonly<{provider:P;providerName:string;available:boolean;personal:ConnectedAccount<Extract<CredentialKind,{provider:P}>['kind']>;installation:ConnectedAccount<Extract<CredentialKind,{provider:P}>['kind']>;inUse:AccountInUse}> }[ModelAccountProvider]
export type OfferedModel = Readonly<{id:ModelId;providerName:string;modelName:string;thinkingLevels:readonly ThinkingLevel[];paidBy:'personal'|'installation';needsSignIn:boolean}>
export type SignInTarget = Readonly<{scope:'personal'|'installation';credentialKind:Extract<CredentialKind,{kind:'oauth'|'google_ai_pro'}>}>
export type StartHandoff = Readonly<{flow:'paste-code'|'callback-paste';loginId:ModelLoginId;url:string;deadlineAt:string}> | Readonly<{flow:'device-code';loginId:ModelLoginId;url:string;code:string;deadlineAt:string;intervalMs:number}>
export type FlowInput = Readonly<{flow:'device-code'}> | Readonly<{flow:'paste-code'|'callback-paste';code:string}>
export type SignInState = Readonly<{state:'waiting'|'succeeded'|'expired'}> | Readonly<{state:'refused';code:'MODEL_LOGIN_ANTHROPIC_REFUSED'|'MODEL_LOGIN_OPENAI_REFUSED'|'MODEL_LOGIN_GOOGLE_REFUSED'|'INSTALLATION_ADMINISTRATOR_REQUIRED'|'ACCOUNT_INACTIVE'|'ACCOUNT_NOT_FOUND'}>
export type NativeAttempt = Readonly<{handoff:StartHandoff;advance(input:FlowInput):Promise<Result<Readonly<{state:'waiting'}>|Readonly<{state:'credential';credential:Credential}>,WaveFailure>>;close():Promise<void>}>
export type ModelAccountModule = Readonly<{
 modelFor(openRun:OpenRun,call:Readonly<{modelId:ModelId;thinkingLevel:ThinkingLevel|null}>):Promise<Result<Readonly<{model:MastraModelConfig;modelAccountId:ModelAccountId}>,WaveFailure>>
 checkBeforeRun(accountId:AccountId,modelIds:readonly ModelId[]):Promise<Result<void,WaveFailure>>
 readDefault(accountId:AccountId,role:ModelRole):Promise<ModelId|null>
 setInstallationBuildDefault(target:Extract<WriteTarget,{scope:'installation'}>,modelId:ModelId):Promise<Result<void,WaveFailure>>
 list(accountId:AccountId):Promise<readonly ModelAccountEntry[]>
 offers(accountId:AccountId):Promise<readonly OfferedModel[]>
 installationOffers(accountId:AccountId):Promise<readonly (OfferedModel & Readonly<{paidBy:'installation'}>)[]>
 installationBuildDefault(accountId:AccountId):Promise<Readonly<{modelId:ModelId;available:boolean}>|null>
 start(input:Readonly<{accountId:AccountId;target:SignInTarget;idempotencyKey:IdempotencyKey}>):Promise<Readonly<{loginId:ModelLoginId}>>
 readSignIn(input:Readonly<{accountId:AccountId;loginId:ModelLoginId}>):Promise<Readonly<{state:'ready';handoff:StartHandoff}>|SignInState>
 advance(input:Readonly<{accountId:AccountId;loginId:ModelLoginId;input:FlowInput}>):Promise<SignInState>
 registerRoutes(app:FastifyInstance):Promise<readonly string[]>
 jobs:readonly Job[]
 close():Promise<void>
}>
export declare function createModelAccountModule(dependencies:ModelAccountDependencies):Promise<ModelAccountModule>
