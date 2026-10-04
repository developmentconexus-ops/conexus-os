import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { z } from 'zod'

// The template's compiler is a root owned folder of the image, at a path the check derives from its
// own: the one place the check loads code it did not bundle.
const loadCompilerFile = async (compiler: string, file: string): Promise<unknown> => import(pathToFileURL(join(compiler, file)).href)

const member = (module: unknown, name: string): unknown => (typeof module === 'object' && module !== null ? Reflect.get(module, name) : undefined)
const functionOf = (module: unknown, name: string): ((...args: unknown[]) => unknown) => {
  const found = member(module, name)
  if (typeof found !== 'function') throw new Error(`the compiler has no ${name}`)
  return (...args) => found.apply(module, args)
}

const clientSchema = z.object({ apiGen: z.string(), typesGen: z.string() })
export type GeneratedClient = z.infer<typeof clientSchema>

/** The typed client the screens and handlers import, generated from an admitted manifest. */
export const generateClient = async (compiler: string, manifest: unknown): Promise<GeneratedClient> =>
  clientSchema.parse(functionOf(await loadCompilerFile(compiler, 'generate-client.mjs'), 'generateClient')(manifest))

const projectsSchema = z.object({ app: z.record(z.string(), z.unknown()), server: z.record(z.string(), z.unknown()) })

/** The two TypeScript programs: the screens, and the handlers when `conexus/` holds TypeScript. */
export const typescriptProjects = async (compiler: string, root: string) =>
  projectsSchema.parse(functionOf(await loadCompilerFile(compiler, 'tsconfig.mjs'), 'typescriptProjects')({ compilerRoot: compiler, root }))

const chunkSchema = z.looseObject({
  type: z.literal('chunk'), code: z.string(), fileName: z.string(), isEntry: z.boolean(), exports: z.array(z.string()), moduleIds: z.array(z.string()),
})
const resultSchema = z.looseObject({ output: z.array(z.union([chunkSchema, z.looseObject({ type: z.literal('asset') })])) })
export type Chunk = z.infer<typeof chunkSchema>

export type Vite = Readonly<{
  /** Builds with the given config and answers the chunks it wrote. */
  build(config: object): Promise<readonly Chunk[]>
  parseAst(code: string): unknown
}>

export const loadVite = async (compiler: string): Promise<Vite> => {
  const module = await loadCompilerFile(compiler, 'node_modules/vite/dist/node/index.js')
  const build = functionOf(module, 'build')
  return {
    build: async (config) => {
      const built = z.union([resultSchema, z.array(resultSchema)]).parse(await build(config))
      return (Array.isArray(built) ? built : [built]).flatMap((result) => result.output).filter((item) => item.type === 'chunk')
    },
    parseAst: functionOf(module, 'parseAst'),
  }
}
