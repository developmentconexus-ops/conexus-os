import { z } from 'zod';
import { BUILDER_RUN_PHASES } from './builder-run-vocabulary.js';
import { FAILURE_CODES } from './failures.generated.js';
import { fieldFailures } from './field-failures.js';
import { ArtifactDigest, ArtifactRevisionId, BuilderRunId, ConversationId, IdempotencyKey, ProjectId, SourceRevision } from './ids.js';
import { operation } from './operation.js';
const RunFailureCode = z.enum(FAILURE_CODES).meta({ id: 'FailureCode' });
const runBase = {
    builderRunId: BuilderRunId,
    projectId: ProjectId,
    conversationId: ConversationId,
    baseSourceRevision: SourceRevision,
    requestText: z.string().max(20_000).nullable(),
    createdAt: z.iso.datetime(),
    cancellationRequested: z.boolean(),
};
// Each state holds only what that state can: a phase while running, a result once settled, a failure code once it failed or was interrupted.
const runVariants = (extra) => z.discriminatedUnion('state', [
    z.object({ ...runBase, ...extra, state: z.literal('QUEUED'), phase: z.null(), resultSourceRevision: z.null(), resultKind: z.null(), failureCode: z.null() }),
    z.object({ ...runBase, ...extra, state: z.literal('RUNNING'), phase: z.enum(BUILDER_RUN_PHASES).nullable(), resultSourceRevision: SourceRevision.nullable(), resultKind: z.null(), failureCode: z.null() }),
    z.object({ ...runBase, ...extra, state: z.literal('SUCCEEDED'), phase: z.null(), resultSourceRevision: SourceRevision.nullable(), resultKind: z.enum(['RESPONSE_ONLY', 'SOURCE_CHANGED']), failureCode: z.null() }),
    z.object({ ...runBase, ...extra, state: z.literal('FAILED'), phase: z.null(), resultSourceRevision: SourceRevision.nullable(), resultKind: z.literal('SOURCE_CHANGED_BUILD_FAILED').nullable(), failureCode: RunFailureCode }),
    z.object({ ...runBase, ...extra, state: z.literal('INTERRUPTED'), phase: z.null(), resultSourceRevision: SourceRevision.nullable(), resultKind: z.null(), failureCode: RunFailureCode }),
]);
export const BuilderRunSummary = runVariants({}).meta({ id: 'BuilderRunSummary' });
/** The run as the browser reads it: its row, and the calls its live session waits on while the run waits on the person. */
export const BuilderRunView = runVariants({ pendingCalls: z.array(z.string().min(1).max(200)) }).meta({ id: 'BuilderRunView' });
const BuilderPreviewSummary = z.object({
    workingSourceRevision: SourceRevision.nullable(),
    lastPreviewSourceRevision: SourceRevision.nullable(),
    lastPreviewArtifactRevisionId: ArtifactRevisionId.nullable(),
    lastPreviewArtifactDigest: ArtifactDigest.nullable(),
}).meta({ id: 'BuilderPreviewSummary' });
const LatestCodeChangingBuilderRun = z.object({
    baseSourceRevision: SourceRevision,
    resultSourceRevision: SourceRevision,
    resultKind: z.enum(['SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED']),
}).meta({ id: 'LatestCodeChangingBuilderRun' });
export const BuilderSession = z.object({
    projectId: ProjectId,
    latestBuilderRun: BuilderRunView.nullable(),
    latestCodeChangingRun: LatestCodeChangingBuilderRun.nullable(),
    preview: BuilderPreviewSummary,
    runHistory: z.array(BuilderRunSummary),
}).meta({ id: 'BuilderSession' });
export const BuilderMessageAccepted = z.object({ builderRun: BuilderRunSummary }).meta({ id: 'BuilderMessageAccepted' });
const TokenCounts = z.record(z.string(), z.number().int().min(0));
export const BuilderTraceUsage = z.object({
    inputTokens: z.number().int().min(0).nullable(),
    outputTokens: z.number().int().min(0).nullable(),
    totalTokens: z.number().int().min(0).nullable(),
    inputDetails: TokenCounts.optional(),
    outputDetails: TokenCounts.optional(),
}).meta({ id: 'BuilderTraceUsage' });
export const BuilderTraceSpan = z.object({
    spanId: z.string().min(1),
    parentSpanId: z.string().min(1).nullable(),
    spanType: z.string().min(1),
    name: z.string().min(1),
    startedAt: z.iso.datetime(),
    durationMs: z.number().int().min(0).nullable(),
    error: z.boolean(),
    model: z.string().min(1).nullable(),
    usage: BuilderTraceUsage.nullable(),
}).meta({ id: 'BuilderTraceSpan' });
export const BuilderTraceScore = z.object({ scorer: z.string().min(1), score: z.number(), reason: z.string().nullable() }).meta({ id: 'BuilderTraceScore' });
export const BuilderTraceSummary = z.object({
    available: z.boolean(),
    traceId: z.string().min(1).nullable(),
    spans: z.array(BuilderTraceSpan),
    usage: BuilderTraceUsage.nullable(),
    modelCalls: z.number().int().min(0),
    toolCalls: z.number().int().min(0),
    scores: z.array(BuilderTraceScore),
}).meta({ id: 'BuilderTraceSummary' });
export const SourceTree = z.object({
    sourceRevision: SourceRevision,
    entries: z.array(z.object({ path: z.string().min(1), kind: z.enum(['FILE', 'DIRECTORY']) })),
}).meta({ id: 'SourceTree' });
export const SourceFile = z.object({ sourceRevision: SourceRevision, path: z.string().min(1), content: z.string() }).meta({ id: 'SourceFile' });
export const SourceComparison = z.object({
    baseSourceRevision: SourceRevision,
    resultSourceRevision: SourceRevision,
    files: z.array(z.object({
        path: z.string().min(1),
        status: z.enum(['ADDED', 'REMOVED', 'MODIFIED', 'RENAMED']),
        previousPath: z.string().min(1).nullable(),
    })),
}).meta({ id: 'SourceComparison' });
export const PreviewLaunch = z.object({
    entryUrl: z.string().min(1),
    previewUrl: z.string().min(1),
    entryGrant: z.string().min(1),
    artifactRevisionId: ArtifactRevisionId,
    artifactDigest: ArtifactDigest,
    expiresAt: z.iso.datetime(),
}).meta({ id: 'PreviewLaunch' });
const projectParam = z.object({ projectId: ProjectId });
const runParams = z.object({ projectId: ProjectId, builderRunId: BuilderRunId });
const sourceFailures = ['SOURCE_REVISION_NOT_FOUND', 'BUILDER_SOURCE_UNAVAILABLE', 'BUILDER_SOURCE_READ_REFUSED', 'BUILDER_SOURCE_READ_TREE_TOO_LARGE', 'BUILDER_SOURCE_READ_UNSAFE_ENTRY'];
const noBody = z.object({}).strict();
export const BLD08 = operation({
    id: 'BLD-08', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/source/tree',
    params: projectParam, query: z.object({ sourceRevision: SourceRevision }).strict(), headers: null, body: null,
    success: { 200: SourceTree },
    effects: [], failures: sourceFailures, malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const BLD09 = operation({
    id: 'BLD-09', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/source/file',
    params: projectParam, query: z.object({ sourceRevision: SourceRevision, path: z.string().min(1).max(4096) }).strict(), headers: null, body: null,
    success: { 200: SourceFile },
    effects: [], failures: ['SOURCE_REVISION_NOT_FOUND', 'SOURCE_FILE_NOT_FOUND', 'BUILDER_SOURCE_UNAVAILABLE'], malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const BLD23 = operation({
    id: 'BLD-23', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/builder-session',
    params: projectParam, query: null, headers: null, body: null,
    success: { 200: BuilderSession },
    effects: [], failures: ['BUILDER_SESSION_UNAVAILABLE', 'PROJECT_BUILD_DENIED', 'BUILDER_SOURCE_UNAVAILABLE'], malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const BLD24 = operation({
    id: 'BLD-24', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/builder-session/messages',
    params: projectParam, query: null,
    headers: z.looseObject({ 'idempotency-key': IdempotencyKey }),
    body: z.object({ content: z.string().min(1).max(20_000).regex(/\S/).register(fieldFailures, { failureCode: 'BUILDER_MESSAGE_REFUSED' }), conversationId: ConversationId }).strict(),
    success: { 201: BuilderMessageAccepted, 200: BuilderMessageAccepted },
    effects: [],
    failures: ['IDEMPOTENCY_CONFLICT', 'CONVERSATION_NOT_FOUND', 'BUILDER_CAPACITY_FULL', 'PROJECT_BUILD_DENIED', 'ACCOUNT_INACTIVE', 'BUILDER_MESSAGE_REFUSED',
        'BUILDER_RUN_CREATE_FAILED', 'BUILDER_BUSY', 'PROJECT_BUSY', 'BUILDER_SOURCE_UNAVAILABLE'],
    malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const BLD25 = operation({
    id: 'BLD-25', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel',
    params: runParams, query: null, headers: null, body: noBody,
    success: { 200: BuilderMessageAccepted },
    effects: [], failures: ['BUILDER_RUN_NOT_FOUND', 'PROJECT_BUILD_DENIED', 'ACCOUNT_INACTIVE'],
    malformed: { projectId: 'PROJECT_NOT_FOUND', builderRunId: 'BUILDER_RUN_NOT_FOUND' },
});
export const BLD26 = operation({
    id: 'BLD-26', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/builder-session/runs/:builderRunId/trace',
    params: runParams, query: null, headers: null, body: null,
    success: { 200: BuilderTraceSummary },
    effects: [], failures: ['BUILDER_RUN_NOT_FOUND', 'BUILDER_TRACE_UNAVAILABLE', 'PROJECT_BUILD_DENIED'],
    malformed: { projectId: 'PROJECT_NOT_FOUND', builderRunId: 'BUILDER_RUN_NOT_FOUND' },
});
export const BLD29 = operation({
    id: 'BLD-29', access: 'session', method: 'GET', path: '/api/control/projects/:projectId/source/compare',
    params: projectParam, query: z.object({ baseSourceRevision: SourceRevision, resultSourceRevision: SourceRevision }).strict(), headers: null, body: null,
    success: { 200: SourceComparison },
    effects: [], failures: sourceFailures, malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
export const BLD30 = operation({
    id: 'BLD-30', access: 'session', method: 'POST', path: '/api/control/projects/:projectId/builder-session/preview',
    params: projectParam, query: null, headers: null, body: noBody,
    success: { 201: PreviewLaunch },
    effects: [], failures: ['PREVIEW_SUBJECT_NOT_FOUND', 'PROJECT_BUILD_DENIED', 'PREVIEW_UNAVAILABLE'], malformed: { projectId: 'PROJECT_NOT_FOUND' },
});
