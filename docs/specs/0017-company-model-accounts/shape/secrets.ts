import { z } from 'zod'
import type { ModelAccountId, ConnectionId } from '@conexus/contract'
import type { Digest } from '../../../../apps/hub/src/platform/db.js'
export type SealOwner = 'model-account' | 'connection' | 'hub-session' | 'handoff'
declare class RowContext<O extends SealOwner> {
  private readonly rowContext
  readonly owner: O
  readonly binding: string
}
export type SealContext<O extends SealOwner> = RowContext<O>
export type Sealed<O extends SealOwner> = string & z.BRAND<`sealed:${O}`>
export declare function SealedColumn<O extends SealOwner>(owner: O): z.ZodType<Sealed<O>>
export type SecretEnvelope = Readonly<{
  seal<O extends SealOwner>(value: string, context: SealContext<O>): Promise<Sealed<O>>
  open<O extends SealOwner>(sealed: Sealed<O>, context: SealContext<NoInfer<O>>): Promise<string>
  reseal<A extends SealOwner, B extends SealOwner>(sealed: Sealed<A>, from: SealContext<NoInfer<A>>, to: SealContext<B>): Promise<Sealed<B>>
  fingerprints(value: string): readonly [string, ...string[]]
}>
export declare function modelAccountContext(id: ModelAccountId): SealContext<'model-account'>
export declare function connectionContext(id: ConnectionId): SealContext<'connection'>
export declare function sessionContext(digest: Digest): SealContext<'hub-session'>
export declare function handoffContext(digest: Digest): SealContext<'handoff'>
