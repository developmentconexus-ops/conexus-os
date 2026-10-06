import type { ArtifactDigest, ProjectId, SourceRevision } from '../../../../packages/contract/dist/index.js'

/**
 * A build checked and hashed before the runner. The registry's `seal` makes them and records each
 * in a private WeakMap; that map is the gate, and `retain` refuses anything it does not hold, even
 * a subclass the Builder writes. The abstract class and its private member only guard against an
 * accidental object with the same fields standing in for one.
 */
export abstract class SealedApplication {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  private readonly sealed = true
  constructor(readonly projectId: ProjectId, readonly sourceRevision: SourceRevision, readonly digest: ArtifactDigest) {}
}
