import { z } from 'zod'
import { fieldFailures } from './field-failures.js'

export const AccountId = z.uuid().brand<'AccountId'>().meta({ id: 'AccountId' })
export type AccountId = z.output<typeof AccountId>
export const WorkspaceId = z.uuid().brand<'WorkspaceId'>().meta({ id: 'WorkspaceId' })
export type WorkspaceId = z.output<typeof WorkspaceId>
export const ProjectId = z.uuid().brand<'ProjectId'>().meta({ id: 'ProjectId' })
export type ProjectId = z.output<typeof ProjectId>
export const ProjectRevision = z.uuid().brand<'ProjectRevision'>().meta({ id: 'ProjectRevision' })
export type ProjectRevision = z.output<typeof ProjectRevision>
export const SourceRevision = z.string().regex(/^[a-f0-9]{40}$/).brand<'SourceRevision'>().meta({ id: 'SourceRevision' })
export type SourceRevision = z.output<typeof SourceRevision>
export const ArtifactDigest = z.string().regex(/^[0-9a-f]{64}$/).brand<'ArtifactDigest'>().meta({ id: 'ArtifactDigest' })
export type ArtifactDigest = z.output<typeof ArtifactDigest>
export const ConversationId = z.uuid().brand<'ConversationId'>().meta({ id: 'ConversationId' }).register(fieldFailures, { failureCode: 'CONVERSATION_NOT_FOUND' })
export type ConversationId = z.output<typeof ConversationId>
export const BuilderRunId = z.uuid().brand<'BuilderRunId'>().meta({ id: 'BuilderRunId' })
export type BuilderRunId = z.output<typeof BuilderRunId>
export const ArtifactRevisionId = z.uuid().brand<'ArtifactRevisionId'>().meta({ id: 'ArtifactRevisionId' })
export type ArtifactRevisionId = z.output<typeof ArtifactRevisionId>
export const ExecutionId = z.uuid().brand<'ExecutionId'>().meta({ id: 'ExecutionId' })
export type ExecutionId = z.output<typeof ExecutionId>
export const InvitationId = z.uuid().brand<'InvitationId'>().meta({ id: 'InvitationId' })
export type InvitationId = z.output<typeof InvitationId>
export const GrantId = z.uuid().brand<'GrantId'>().meta({ id: 'GrantId' })
export type GrantId = z.output<typeof GrantId>
export const ConnectionId = z.uuid().brand<'ConnectionId'>().meta({ id: 'ConnectionId' })
export type ConnectionId = z.output<typeof ConnectionId>
export const BindingId = z.uuid().brand<'BindingId'>().meta({ id: 'BindingId' })
export type BindingId = z.output<typeof BindingId>
export const ModelAccountId = z.uuid().brand<'ModelAccountId'>().meta({ id: 'ModelAccountId' })
export type ModelAccountId = z.output<typeof ModelAccountId>
export const ModelLoginId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).brand<'ModelLoginId'>().meta({ id: 'ModelLoginId' })
export type ModelLoginId = z.output<typeof ModelLoginId>
export const IdempotencyKey = z.string().min(1).brand<'IdempotencyKey'>().meta({ id: 'IdempotencyKey' }).register(fieldFailures, { failureCode: 'IDEMPOTENCY_KEY_REQUIRED' })
export type IdempotencyKey = z.output<typeof IdempotencyKey>
export const ApplicationFilePath = z.string().min(1).max(1024).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/).brand<'ApplicationFilePath'>().meta({ id: 'ApplicationFilePath' })
export type ApplicationFilePath = z.output<typeof ApplicationFilePath>
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/).brand<'Sha256'>().meta({ id: 'Sha256' })
export type Sha256 = z.output<typeof Sha256>

const MEDIA_TYPES = [
  'application/json; charset=utf-8', 'application/wasm', 'font/otf', 'font/woff', 'font/woff2', 'image/avif', 'image/gif', 'image/jpeg', 'image/png',
  'image/svg+xml', 'image/webp', 'image/x-icon', 'text/css; charset=utf-8', 'text/html; charset=utf-8', 'text/javascript; charset=utf-8', 'text/plain; charset=utf-8',
] as const
export const MediaType = z.enum(MEDIA_TYPES).brand<'MediaType'>().meta({ id: 'MediaType' })
export type MediaType = z.output<typeof MediaType>

/** The media type of each file extension an application may serve; a path with another extension has none. */
const MEDIA_TYPE_BY_EXTENSION: Readonly<Record<string, (typeof MEDIA_TYPES)[number]>> = {
  '.avif': 'image/avif',
  '.cjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.gif': 'image/gif',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpeg': 'image/jpeg',
  '.jpg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}
export const mediaTypeOfPath = (path: string): MediaType | null => {
  const parsed = MediaType.safeParse(MEDIA_TYPE_BY_EXTENSION[path.slice(path.lastIndexOf('.')).toLowerCase()])
  return parsed.success ? parsed.data : null
}
