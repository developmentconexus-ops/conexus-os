import type { BinaryLike } from 'node:crypto'

export declare const canonicalBytes: (value: unknown) => Buffer
export declare const sha256: (bytes: BinaryLike) => string
