import { seal } from '../../../../apps/hub/src/registry/seal.js'

type NativeSealed = ReturnType<typeof seal>

class SealedBuild {
  private readonly sealed = true

  private constructor(readonly projectId: NativeSealed['projectId'], readonly sourceRevision: NativeSealed['sourceRevision'], readonly digest: NativeSealed['digest']) {
    Object.freeze(this)
  }

  static fromVerified(value: NativeSealed): SealedBuild {
    return new SealedBuild(value.projectId, value.sourceRevision, value.digest)
  }
}

export type SealedApplication = SealedBuild

// This probe uses the real seal; U2 puts the hidden class inside that owner and retains its WeakMap.
export function sealShape(input: Parameters<typeof seal>[0], run: Parameters<typeof seal>[1]): SealedApplication {
  return SealedBuild.fromVerified(seal(input, run))
}
