import { createHash } from 'node:crypto'
import { lstatSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { ArtifactManifest } from './report.js'

/** Every regular file the build left in `out`, with its size and sha256, pinned to the template that built it. */
export const artifactManifest = (out: string, templateRef: string): ArtifactManifest => ({
  templateRef,
  files: readdirSync(out, { recursive: true }).map(String).sort().flatMap((path) => {
    const file = join(out, path)
    if (!lstatSync(file).isFile()) return []
    const bytes = readFileSync(file)
    return [{ path: path.split('\\').join('/'), bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }]
  }),
})
