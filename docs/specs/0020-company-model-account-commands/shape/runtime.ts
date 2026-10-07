import type { ModelAccountId } from '@conexus/contract'
import type { Credential } from './credential.js'
import type { ConnectionGenerationId, HeldAccount } from './store.js'
import type { Result, WaveFailure } from './dependencies.js'
export type OAuthCredential = Extract<Credential,{kind:'oauth'}>
export type RefreshAnswer = Readonly<{state:'tokens';credential:OAuthCredential}> | Readonly<{state:'provider-refused'}> | Readonly<{state:'unavailable'}>
export declare function refreshAtProvider(credential:OAuthCredential):Promise<RefreshAnswer>
export type Generation = Readonly<{modelAccountId:ModelAccountId;generationId:ConnectionGenerationId}>
export type GoogleCredential = Extract<Credential,{provider:'google-ai-pro'}>
declare const ticketBrand: unique symbol
export type GoogleTicket = string & Readonly<{[ticketBrand]:true}>
export type GoogleLease = Readonly<{baseURL:string;ticket:GoogleTicket;release():Promise<void>}>
export type GoogleAiProPool = Readonly<{
 acquire(held:HeldAccount<GoogleCredential>):Promise<Result<GoogleLease,WaveFailure>>
 retire(generation:Generation):Promise<void>
 capture(signal:AbortSignal):Promise<void>
 close():Promise<void>
}>

// This wave owns this narrow provider-call boundary; 0019 supplies Failure/Result, not vendor classifiers.
export type ProviderCallFact = Readonly<{state:'provider-refused'}> | Readonly<{state:'other'}>
export declare function classifyProviderCall(error:unknown,provider:OAuthCredential['provider']):ProviderCallFact
