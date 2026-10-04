import type { FastifyInstance } from 'fastify'
import { Failure } from '../platform/failure.js'
import { routes } from '../http/access.js'

const uuid = { type: 'string', format: 'uuid' } as const
const params = { type: 'object', additionalProperties: false, required: ['projectId'], properties: { projectId: uuid } } as const

const driverCode = (error: unknown): string | undefined => {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined
  return typeof error.code === 'string' ? error.code : undefined
}

export type ProjectThumbnailOperationId = 'PRJ-THUMBNAIL'

export type ProjectThumbnailReader = Readonly<{
  readThumbnail(input: Readonly<{ accountId: string; projectId: string }>): Promise<
    Readonly<{ artifactRevisionId: string; mediaType: 'image/png'; bytes: Uint8Array; sha256: string }> | null
  >
}>

export const registerProjectThumbnailRoutes = async (
  app: FastifyInstance,
  dependencies: Readonly<{
    reader: ProjectThumbnailReader
  }>,
): Promise<readonly ProjectThumbnailOperationId[]> => {
  routes(app).session<{ Params: { projectId: string } }>({
    method: 'GET',
    url: '/api/control/projects/:projectId/thumbnail',
    schema: { params },
    handler: async (request, reply, current) => {
      const thumbnail = await dependencies.reader.readThumbnail({
        accountId: current.account.accountId,
        projectId: request.params.projectId,
      }).catch((error: unknown) => {
        if (driverCode(error) === '22P02') throw new Failure('PROJECT_NOT_FOUND')
        throw new Failure('PROJECT_THUMBNAIL_UNAVAILABLE', { cause: error, details: { projectId: request.params.projectId } })
      })
      if (!thumbnail) throw new Failure('PROJECT_THUMBNAIL_NOT_FOUND')
      return reply
        .type(thumbnail.mediaType)
        .header('Cache-Control', 'private, no-cache')
        .header('ETag', `"${thumbnail.artifactRevisionId}"`)
        .send(Buffer.from(thumbnail.bytes))
    },
  })
  return ['PRJ-THUMBNAIL']
}
