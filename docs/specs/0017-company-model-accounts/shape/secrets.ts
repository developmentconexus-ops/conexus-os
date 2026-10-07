import { z } from 'zod'
import type { AccountId, ConnectionId } from '@conexus/contract'
import type { CredentialKind } from './credential.js'
export type SealOwner = 'model-account' | 'connection' | 'hub-session' | 'handoff'
export type SealContext<O extends SealOwner> = Readonly<{ owner: O; binding: readonly [string, ...string[]] }>
export type Sealed<O extends SealOwner> = string & z.BRAND<`sealed:${O}`>
export declare function SealedColumn<O extends SealOwner>(owner: O): z.ZodType<Sealed<O>>
export type SecretEnvelope = Readonly<{
  seal<O extends SealOwner>(value: string, context: SealContext<O>): Promise<Sealed<O>>
  open<O extends SealOwner>(sealed: Sealed<O>, context: SealContext<NoInfer<O>>): Promise<string>
  reseal<A extends SealOwner, B extends SealOwner>(sealed: Sealed<A>, from: SealContext<NoInfer<A>>, to: SealContext<B>): Promise<Sealed<B>>
  fingerprints(value: string): readonly [string, ...string[]]
}>
export type ModelAccountBinding = CredentialKind & (Readonly<{ scope: 'personal'; ownerAccountId: AccountId }> | Readonly<{ scope: 'installation' }>)
export declare function modelAccountContext(binding: ModelAccountBinding): SealContext<'model-account'>
export declare function connectionContext(connectionId: ConnectionId): SealContext<'connection'>
export declare function sessionContext(tokenDigest: Uint8Array): SealContext<'hub-session'>
export declare function handoffContext(handoffDigest: Uint8Array): SealContext<'handoff'>
