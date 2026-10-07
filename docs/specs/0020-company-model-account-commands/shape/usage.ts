import type { AccountId, ModelAccountId } from '@conexus/contract'
import type { FastifyInstance } from 'fastify'
import type { Admitted, RunScope, Result, WaveFailure } from './dependencies.js'
import type { OpenRun, WriteTarget } from './store.js'
import type { ModelId } from './credential.js'
import { createModelAccountModule, type ModelAccountModule } from './module.js'
import type { ModelAccountDependencies } from '#foundation-module'
declare function recordPayingAccount(proof:Admitted<RunScope>,id:ModelAccountId):Promise<Result<void,WaveFailure>>
export async function builderCall(accounts:ModelAccountModule,openRun:OpenRun,modelId:ModelId) {
 const paid=await accounts.modelFor(openRun,{modelId,thinkingLevel:null})
 if(!paid.ok)return paid
 const recorded=await openRun(proof=>recordPayingAccount(proof,paid.result.modelAccountId))
 if(!recorded.ok)return recorded
 return {ok:true,result:paid.result.model} as const
}
export async function hubComposition(deps:ModelAccountDependencies,app:FastifyInstance) {
 const models=await createModelAccountModule(deps)
 return {routes:await models.registerRoutes(app),jobs:models.jobs,close:models.close}
}
export async function defaultSetting(models:ModelAccountModule,target:Extract<WriteTarget,{scope:'installation'}>,modelId:ModelId,accountId:AccountId) {
 const saved=await models.setInstallationBuildDefault(target,modelId)
 if(!saved.ok)return saved
 return models.readDefault(accountId,'build')
}

// listAvailableModels responds to scope=installation using this read, including current default.
export async function defaultScreenRead(models:ModelAccountModule,accountId:AccountId) {
 return { models:await models.installationOffers(accountId), installationBuildDefault:await models.installationBuildDefault(accountId) }
}

import type { IdempotencyKey } from '@conexus/contract'
import type { SignInTarget } from './module.js'
export async function signInScreen(models:ModelAccountModule,accountId:AccountId,target:SignInTarget,idempotencyKey:IdempotencyKey) {
 const started=await models.start({accountId,target,idempotencyKey})
 return models.readSignIn({accountId,loginId:started.loginId})
}
