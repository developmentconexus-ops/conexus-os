import type { FastifyInstance } from 'fastify'
import { sendProblem } from '../http/problem.js'
import type { ResolveCurrentSession } from '../identity-access/current-session.js'

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
    resolveCurrentSession: ResolveCurrentSession
  }>,
): Promise<readonly ProjectThumbnailOperationId[]> => {
  app.get<{ Params: { projectId: string } }>(
    '/api/control/projects/:projectId/thumbnail',
    { schema: { params } },
    async (request, reply) => {
      const current = await dependencies.resolveCurrentSession(request)
      if (!current) return sendProblem(reply, 401, 'authentication-required', 'Authentication required')

      try {
        const thumbnail = await dependencies.reader.readThumbnail({
          accountId: current.account.accountId,
          projectId: request.params.projectId,
        })
        if (!thumbnail) return sendProblem(reply, 404, 'project-thumbnail-not-found', 'Project thumbnail not found')

        return reply
          .type(thumbnail.mediaType)
          .header('Cache-Control', 'private, no-cache')
          .header('ETag', `"${thumbnail.artifactRevisionId}"`)
          .send(Buffer.from(thumbnail.bytes))
      } catch (error) {
        if (driverCode(error) === '22P02') return sendProblem(reply, 404, 'project-not-found', 'Project not found')
        return sendProblem(reply, 503, 'project-thumbnail-unavailable', 'Project thumbnail unavailable')
      }
    },
  )
  return ['PRJ-THUMBNAIL']
}
