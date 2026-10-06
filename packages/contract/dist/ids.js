import { z } from 'zod';
export const AccountId = z.uuid().brand().meta({ id: 'AccountId' });
export const WorkspaceId = z.uuid().brand().meta({ id: 'WorkspaceId' });
export const ProjectId = z.uuid().brand().meta({ id: 'ProjectId' });
export const ProjectRevision = z.uuid().brand().meta({ id: 'ProjectRevision' });
export const SourceRevision = z.string().regex(/^[a-f0-9]{40}$/).brand().meta({ id: 'SourceRevision' });
export const ArtifactDigest = z.string().regex(/^[0-9a-f]{64}$/).brand().meta({ id: 'ArtifactDigest' });
export const ConversationId = z.uuid().brand().meta({ id: 'ConversationId' });
export const BuilderRunId = z.uuid().brand().meta({ id: 'BuilderRunId' });
export const ArtifactRevisionId = z.uuid().brand().meta({ id: 'ArtifactRevisionId' });
export const ExecutionId = z.uuid().brand().meta({ id: 'ExecutionId' });
export const InvitationId = z.uuid().brand().meta({ id: 'InvitationId' });
export const GrantId = z.uuid().brand().meta({ id: 'GrantId' });
export const ConnectionId = z.uuid().brand().meta({ id: 'ConnectionId' });
export const BindingId = z.uuid().brand().meta({ id: 'BindingId' });
export const ModelAccountId = z.uuid().brand().meta({ id: 'ModelAccountId' });
export const ModelLoginId = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/).brand().meta({ id: 'ModelLoginId' });
export const IdempotencyKey = z.string().min(1).brand().meta({ id: 'IdempotencyKey' });
export const ApplicationFilePath = z.string().min(1).max(1024).regex(/^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/).brand().meta({ id: 'ApplicationFilePath' });
export const Sha256 = z.string().regex(/^[a-f0-9]{64}$/).brand().meta({ id: 'Sha256' });
const MEDIA_TYPES = [
    'application/json; charset=utf-8', 'application/wasm', 'font/otf', 'font/woff', 'font/woff2', 'image/avif', 'image/gif', 'image/jpeg', 'image/png',
    'image/svg+xml', 'image/webp', 'image/x-icon', 'text/css; charset=utf-8', 'text/html; charset=utf-8', 'text/javascript; charset=utf-8', 'text/plain; charset=utf-8',
];
export const MediaType = z.enum(MEDIA_TYPES).brand().meta({ id: 'MediaType' });
/** The media type of each file extension an application may serve; a path with another extension has none. */
const MEDIA_TYPE_BY_EXTENSION = {
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
};
/** The most files and bytes one built application holds: the compiler's output reader and the registry's seal both enforce them. */
export const APPLICATION_MAX_FILES = 256;
export const APPLICATION_MAX_TOTAL_BYTES = 12 * 1024 * 1024;
export function mediaTypeOfPath(path) {
    const parsed = MediaType.safeParse(MEDIA_TYPE_BY_EXTENSION[path.slice(path.lastIndexOf('.')).toLowerCase()]);
    return parsed.success ? parsed.data : null;
}
