import { lstatSync, readFileSync } from 'node:fs'

// A deployment names its configuration files by path. A symbolic link there would let whoever can
// write the directory redirect the read somewhere the operator never named, so the path has to be
// a regular file and nothing else.
export const readJsonFile = (path: string): unknown => {
  const stat = lstatSync(path)
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('PROJECT_CONFIG_FILE_REFUSED')
  return JSON.parse(readFileSync(path, 'utf8'))
}
