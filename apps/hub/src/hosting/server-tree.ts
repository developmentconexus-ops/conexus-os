import type { ApplicationFilePath } from '@conexus/contract'
import { SERVER_ROOT } from '../platform/application-path.js'
import { Failure } from '../platform/failure.js'

/** One file of the admitted artifact's `conexus-server/` tree, exactly as the runner expects it. */
export type ServerFile = Readonly<{ path: string; sha256: string; content: string }>

/** One server file as the request's entry reads it: its bytes, absent though the manifest lists it, or no longer the served revision's. */
export type ServerFileRead =
  | Readonly<{ kind: 'FILE'; sha256: string; bytes: Uint8Array }>
  | Readonly<{ kind: 'MISSING' }>
  | Readonly<{ kind: 'NOT_READY' }>

export type ServerTree =
  | Readonly<{ kind: 'TREE'; files: readonly ServerFile[] }>
  | Readonly<{ kind: 'TOO_LARGE' }>
  | Readonly<{ kind: 'MISSING' }>
  | Readonly<{ kind: 'NOT_READY' }>

// Generous for source code, far under the runner's own worst case (128 files * 4 MiB = 512 MiB).
const SERVER_TREE_LIMIT_BYTES = 8 * 1024 * 1024

export const serverPathsOf = (files: ReadonlyArray<Readonly<{ path: ApplicationFilePath }>>): readonly ApplicationFilePath[] =>
  files.map((file) => file.path).filter((path) => path.startsWith(SERVER_ROOT))

/**
 * Reads the server tree inside the entry that admitted the request, under its proof. Sequential, not
 * Promise.all: an oversized tree stops as soon as the running total crosses the limit, so memory per
 * request is bounded by the limit plus at most one file. A refusal comes back as a value, answered once
 * the entry has committed.
 */
export const readServerTree = async (
  paths: readonly ApplicationFilePath[],
  read: (path: ApplicationFilePath) => Promise<ServerFileRead>,
): Promise<ServerTree> => {
  let totalBytes = 0
  const files: ServerFile[] = []
  for (const path of paths) {
    const file = await read(path)
    if (file.kind !== 'FILE') return file
    totalBytes += file.bytes.byteLength
    if (totalBytes > SERVER_TREE_LIMIT_BYTES) return { kind: 'TOO_LARGE' }
    files.push({ path, sha256: file.sha256, content: Buffer.from(file.bytes).toString('base64') })
  }
  return { kind: 'TREE', files }
}

/** The files the runner receives, or the failure the tree's read came to. */
export const serverFilesOf = (tree: ServerTree): readonly ServerFile[] => {
  switch (tree.kind) {
    case 'TREE': return tree.files
    case 'TOO_LARGE': throw new Failure('SERVER_TREE_TOO_LARGE')
    case 'MISSING': throw new Failure('INTERNAL_UNEXPECTED', { details: { invariant: 'APPLICATION_SERVER_FILE_MISSING' } })
    case 'NOT_READY': throw new Failure('APPLICATION_NOT_READY')
  }
}
