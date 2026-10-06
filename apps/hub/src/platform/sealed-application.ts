import type { ArtifactDigest, ProjectId, SourceRevision } from '../../../../packages/contract/dist/index.js'

/**
 * A build checked and hashed before the runner. The registry's `seal` is the only maker: the
 * class is abstract and the registry's subclass stays private to it, and the private member keeps
 * any object of the same fields from standing in for one.
 */
export abstract class SealedApplication {
  // biome-ignore lint/correctness/noUnusedPrivateClassMembers: type identity is the use
  private readonly sealed = true
  constructor(readonly projectId: ProjectId, readonly sourceRevision: SourceRevision, readonly digest: ArtifactDigest) {}
}
