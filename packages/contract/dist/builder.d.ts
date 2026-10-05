import { z } from 'zod';
export declare const BuilderRunSummary: z.ZodObject<{
    builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    conversationId: z.ZodString;
    state: z.ZodEnum<{
        QUEUED: "QUEUED";
        RUNNING: "RUNNING";
        SUCCEEDED: "SUCCEEDED";
        FAILED: "FAILED";
        INTERRUPTED: "INTERRUPTED";
    }>;
    phase: z.ZodNullable<z.ZodEnum<{
        PREPARING: "PREPARING";
        AGENT: "AGENT";
        WAITING: "WAITING";
        SOURCE_ADMISSION: "SOURCE_ADMISSION";
        COMPILING: "COMPILING";
        FINALIZING: "FINALIZING";
    }>>;
    baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
    resultKind: z.ZodNullable<z.ZodEnum<{
        RESPONSE_ONLY: "RESPONSE_ONLY";
        SOURCE_CHANGED: "SOURCE_CHANGED";
        SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
    }>>;
    failureCode: z.ZodNullable<z.ZodString>;
    requestText: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodISODateTime;
    cancellationRequested: z.ZodBoolean;
}, z.core.$strip>;
export type BuilderRunSummary = z.output<typeof BuilderRunSummary>;
/** The run as the browser reads it: its row, and the calls its live session waits on while the run waits on the person. */
export declare const BuilderRunView: z.ZodObject<{
    builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    conversationId: z.ZodString;
    state: z.ZodEnum<{
        QUEUED: "QUEUED";
        RUNNING: "RUNNING";
        SUCCEEDED: "SUCCEEDED";
        FAILED: "FAILED";
        INTERRUPTED: "INTERRUPTED";
    }>;
    phase: z.ZodNullable<z.ZodEnum<{
        PREPARING: "PREPARING";
        AGENT: "AGENT";
        WAITING: "WAITING";
        SOURCE_ADMISSION: "SOURCE_ADMISSION";
        COMPILING: "COMPILING";
        FINALIZING: "FINALIZING";
    }>>;
    baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
    resultKind: z.ZodNullable<z.ZodEnum<{
        RESPONSE_ONLY: "RESPONSE_ONLY";
        SOURCE_CHANGED: "SOURCE_CHANGED";
        SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
    }>>;
    failureCode: z.ZodNullable<z.ZodString>;
    requestText: z.ZodNullable<z.ZodString>;
    createdAt: z.ZodISODateTime;
    cancellationRequested: z.ZodBoolean;
    pendingCalls: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type BuilderRunView = z.output<typeof BuilderRunView>;
export declare const BuilderSession: z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    latestBuilderRun: z.ZodNullable<z.ZodObject<{
        builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        conversationId: z.ZodString;
        state: z.ZodEnum<{
            QUEUED: "QUEUED";
            RUNNING: "RUNNING";
            SUCCEEDED: "SUCCEEDED";
            FAILED: "FAILED";
            INTERRUPTED: "INTERRUPTED";
        }>;
        phase: z.ZodNullable<z.ZodEnum<{
            PREPARING: "PREPARING";
            AGENT: "AGENT";
            WAITING: "WAITING";
            SOURCE_ADMISSION: "SOURCE_ADMISSION";
            COMPILING: "COMPILING";
            FINALIZING: "FINALIZING";
        }>>;
        baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
        resultKind: z.ZodNullable<z.ZodEnum<{
            RESPONSE_ONLY: "RESPONSE_ONLY";
            SOURCE_CHANGED: "SOURCE_CHANGED";
            SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
        }>>;
        failureCode: z.ZodNullable<z.ZodString>;
        requestText: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodISODateTime;
        cancellationRequested: z.ZodBoolean;
        pendingCalls: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    latestCodeChangingRun: z.ZodNullable<z.ZodObject<{
        baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultKind: z.ZodEnum<{
            SOURCE_CHANGED: "SOURCE_CHANGED";
            SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
        }>;
    }, z.core.$strip>>;
    preview: z.ZodObject<{
        workingSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
        lastGoodSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
        lastGoodArtifactRevisionId: z.ZodNullable<z.core.$ZodBranded<z.ZodUUID, "ArtifactRevisionId", "out">>;
        lastGoodArtifactDigest: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    runHistory: z.ZodArray<z.ZodObject<{
        builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        conversationId: z.ZodString;
        state: z.ZodEnum<{
            QUEUED: "QUEUED";
            RUNNING: "RUNNING";
            SUCCEEDED: "SUCCEEDED";
            FAILED: "FAILED";
            INTERRUPTED: "INTERRUPTED";
        }>;
        phase: z.ZodNullable<z.ZodEnum<{
            PREPARING: "PREPARING";
            AGENT: "AGENT";
            WAITING: "WAITING";
            SOURCE_ADMISSION: "SOURCE_ADMISSION";
            COMPILING: "COMPILING";
            FINALIZING: "FINALIZING";
        }>>;
        baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
        resultKind: z.ZodNullable<z.ZodEnum<{
            RESPONSE_ONLY: "RESPONSE_ONLY";
            SOURCE_CHANGED: "SOURCE_CHANGED";
            SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
        }>>;
        failureCode: z.ZodNullable<z.ZodString>;
        requestText: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodISODateTime;
        cancellationRequested: z.ZodBoolean;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BuilderSession = z.output<typeof BuilderSession>;
export declare const BuilderMessageAccepted: z.ZodObject<{
    builderRun: z.ZodObject<{
        builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        conversationId: z.ZodString;
        state: z.ZodEnum<{
            QUEUED: "QUEUED";
            RUNNING: "RUNNING";
            SUCCEEDED: "SUCCEEDED";
            FAILED: "FAILED";
            INTERRUPTED: "INTERRUPTED";
        }>;
        phase: z.ZodNullable<z.ZodEnum<{
            PREPARING: "PREPARING";
            AGENT: "AGENT";
            WAITING: "WAITING";
            SOURCE_ADMISSION: "SOURCE_ADMISSION";
            COMPILING: "COMPILING";
            FINALIZING: "FINALIZING";
        }>>;
        baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
        resultKind: z.ZodNullable<z.ZodEnum<{
            RESPONSE_ONLY: "RESPONSE_ONLY";
            SOURCE_CHANGED: "SOURCE_CHANGED";
            SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
        }>>;
        failureCode: z.ZodNullable<z.ZodString>;
        requestText: z.ZodNullable<z.ZodString>;
        createdAt: z.ZodISODateTime;
        cancellationRequested: z.ZodBoolean;
    }, z.core.$strip>;
}, z.core.$strip>;
export type BuilderMessageAccepted = z.output<typeof BuilderMessageAccepted>;
export declare const BuilderTraceUsage: z.ZodObject<{
    inputTokens: z.ZodNullable<z.ZodNumber>;
    outputTokens: z.ZodNullable<z.ZodNumber>;
    totalTokens: z.ZodNullable<z.ZodNumber>;
    inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
}, z.core.$strip>;
export declare const BuilderTraceSpan: z.ZodObject<{
    spanId: z.ZodString;
    parentSpanId: z.ZodNullable<z.ZodString>;
    spanType: z.ZodString;
    name: z.ZodString;
    startedAt: z.ZodISODateTime;
    durationMs: z.ZodNullable<z.ZodNumber>;
    error: z.ZodBoolean;
    model: z.ZodNullable<z.ZodString>;
    usage: z.ZodNullable<z.ZodObject<{
        inputTokens: z.ZodNullable<z.ZodNumber>;
        outputTokens: z.ZodNullable<z.ZodNumber>;
        totalTokens: z.ZodNullable<z.ZodNumber>;
        inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const BuilderTraceScore: z.ZodObject<{
    scorer: z.ZodString;
    score: z.ZodNumber;
    reason: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const BuilderTraceSummary: z.ZodObject<{
    available: z.ZodBoolean;
    traceId: z.ZodNullable<z.ZodString>;
    spans: z.ZodArray<z.ZodObject<{
        spanId: z.ZodString;
        parentSpanId: z.ZodNullable<z.ZodString>;
        spanType: z.ZodString;
        name: z.ZodString;
        startedAt: z.ZodISODateTime;
        durationMs: z.ZodNullable<z.ZodNumber>;
        error: z.ZodBoolean;
        model: z.ZodNullable<z.ZodString>;
        usage: z.ZodNullable<z.ZodObject<{
            inputTokens: z.ZodNullable<z.ZodNumber>;
            outputTokens: z.ZodNullable<z.ZodNumber>;
            totalTokens: z.ZodNullable<z.ZodNumber>;
            inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
            outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    usage: z.ZodNullable<z.ZodObject<{
        inputTokens: z.ZodNullable<z.ZodNumber>;
        outputTokens: z.ZodNullable<z.ZodNumber>;
        totalTokens: z.ZodNullable<z.ZodNumber>;
        inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
        outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
    }, z.core.$strip>>;
    modelCalls: z.ZodNumber;
    toolCalls: z.ZodNumber;
    scores: z.ZodArray<z.ZodObject<{
        scorer: z.ZodString;
        score: z.ZodNumber;
        reason: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type BuilderTraceSummary = z.output<typeof BuilderTraceSummary>;
export type BuilderTraceUsage = z.output<typeof BuilderTraceUsage>;
export type BuilderTraceSpan = z.output<typeof BuilderTraceSpan>;
export type BuilderTraceScore = z.output<typeof BuilderTraceScore>;
export declare const SourceTree: z.ZodObject<{
    sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    entries: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        kind: z.ZodEnum<{
            FILE: "FILE";
            DIRECTORY: "DIRECTORY";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const SourceFile: z.ZodObject<{
    sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    path: z.ZodString;
    content: z.ZodString;
}, z.core.$strip>;
export declare const SourceComparison: z.ZodObject<{
    baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    resultSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    files: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        status: z.ZodEnum<{
            ADDED: "ADDED";
            REMOVED: "REMOVED";
            MODIFIED: "MODIFIED";
            RENAMED: "RENAMED";
        }>;
        previousPath: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type SourceTree = z.output<typeof SourceTree>;
export type SourceFile = z.output<typeof SourceFile>;
export type SourceComparison = z.output<typeof SourceComparison>;
export declare const PreviewLaunch: z.ZodObject<{
    entryUrl: z.ZodString;
    previewUrl: z.ZodString;
    entryGrant: z.ZodString;
    artifactRevisionId: z.core.$ZodBranded<z.ZodUUID, "ArtifactRevisionId", "out">;
    artifactDigest: z.ZodString;
    expiresAt: z.ZodISODateTime;
}, z.core.$strip>;
export type PreviewLaunch = z.output<typeof PreviewLaunch>;
export declare const BLD08: {
    readonly id: "BLD-08";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/tree";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: z.ZodObject<{
        sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    }, z.core.$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
            entries: z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                kind: z.ZodEnum<{
                    FILE: "FILE";
                    DIRECTORY: "DIRECTORY";
                }>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const BLD09: {
    readonly id: "BLD-09";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/file";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: z.ZodObject<{
        sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        path: z.ZodString;
    }, z.core.$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            sourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
            path: z.ZodString;
            content: z.ZodString;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "SOURCE_FILE_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const BLD23: {
    readonly id: "BLD-23";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/builder-session";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
            latestBuilderRun: z.ZodNullable<z.ZodObject<{
                builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: z.ZodNullable<z.ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                resultKind: z.ZodNullable<z.ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: z.ZodNullable<z.ZodString>;
                requestText: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodISODateTime;
                cancellationRequested: z.ZodBoolean;
                pendingCalls: z.ZodArray<z.ZodString>;
            }, z.core.$strip>>;
            latestCodeChangingRun: z.ZodNullable<z.ZodObject<{
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultKind: z.ZodEnum<{
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>;
            }, z.core.$strip>>;
            preview: z.ZodObject<{
                workingSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                lastGoodSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                lastGoodArtifactRevisionId: z.ZodNullable<z.core.$ZodBranded<z.ZodUUID, "ArtifactRevisionId", "out">>;
                lastGoodArtifactDigest: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>;
            runHistory: z.ZodArray<z.ZodObject<{
                builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: z.ZodNullable<z.ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                resultKind: z.ZodNullable<z.ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: z.ZodNullable<z.ZodString>;
                requestText: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodISODateTime;
                cancellationRequested: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_SESSION_UNAVAILABLE", "PROJECT_BUILD_DENIED", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const BLD24: {
    readonly id: "BLD-24";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/messages";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        content: z.ZodString;
        conversationId: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            builderRun: z.ZodObject<{
                builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: z.ZodNullable<z.ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                resultKind: z.ZodNullable<z.ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: z.ZodNullable<z.ZodString>;
                requestText: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodISODateTime;
                cancellationRequested: z.ZodBoolean;
            }, z.core.$strip>;
        }, z.core.$strip>;
        readonly 200: z.ZodObject<{
            builderRun: z.ZodObject<{
                builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: z.ZodNullable<z.ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                resultKind: z.ZodNullable<z.ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: z.ZodNullable<z.ZodString>;
                requestText: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodISODateTime;
                cancellationRequested: z.ZodBoolean;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["IDEMPOTENCY_CONFLICT", "CONVERSATION_NOT_FOUND", "BUILDER_CAPACITY_FULL", "PROJECT_BUILD_DENIED", "ACCOUNT_INACTIVE", "BUILDER_MESSAGE_REFUSED", "BUILDER_RUN_CREATE_FAILED", "BUILDER_BUSY", "PROJECT_BUSY", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const BLD25: {
    readonly id: "BLD-25";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{}, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            builderRun: z.ZodObject<{
                builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                conversationId: z.ZodString;
                state: z.ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: z.ZodNullable<z.ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
                resultSourceRevision: z.ZodNullable<z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">>;
                resultKind: z.ZodNullable<z.ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: z.ZodNullable<z.ZodString>;
                requestText: z.ZodNullable<z.ZodString>;
                createdAt: z.ZodISODateTime;
                cancellationRequested: z.ZodBoolean;
            }, z.core.$strip>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_RUN_NOT_FOUND", "PROJECT_BUILD_DENIED", "ACCOUNT_INACTIVE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly builderRunId: "BUILDER_RUN_NOT_FOUND";
    };
};
export declare const BLD26: {
    readonly id: "BLD-26";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/builder-session/runs/:builderRunId/trace";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        builderRunId: z.core.$ZodBranded<z.ZodUUID, "BuilderRunId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            available: z.ZodBoolean;
            traceId: z.ZodNullable<z.ZodString>;
            spans: z.ZodArray<z.ZodObject<{
                spanId: z.ZodString;
                parentSpanId: z.ZodNullable<z.ZodString>;
                spanType: z.ZodString;
                name: z.ZodString;
                startedAt: z.ZodISODateTime;
                durationMs: z.ZodNullable<z.ZodNumber>;
                error: z.ZodBoolean;
                model: z.ZodNullable<z.ZodString>;
                usage: z.ZodNullable<z.ZodObject<{
                    inputTokens: z.ZodNullable<z.ZodNumber>;
                    outputTokens: z.ZodNullable<z.ZodNumber>;
                    totalTokens: z.ZodNullable<z.ZodNumber>;
                    inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
                    outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
                }, z.core.$strip>>;
            }, z.core.$strip>>;
            usage: z.ZodNullable<z.ZodObject<{
                inputTokens: z.ZodNullable<z.ZodNumber>;
                outputTokens: z.ZodNullable<z.ZodNumber>;
                totalTokens: z.ZodNullable<z.ZodNumber>;
                inputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
                outputDetails: z.ZodOptional<z.ZodRecord<z.ZodString, z.ZodNumber>>;
            }, z.core.$strip>>;
            modelCalls: z.ZodNumber;
            toolCalls: z.ZodNumber;
            scores: z.ZodArray<z.ZodObject<{
                scorer: z.ZodString;
                score: z.ZodNumber;
                reason: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_RUN_NOT_FOUND", "BUILDER_TRACE_UNAVAILABLE", "PROJECT_BUILD_DENIED"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly builderRunId: "BUILDER_RUN_NOT_FOUND";
    };
};
export declare const BLD29: {
    readonly id: "BLD-29";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/compare";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: z.ZodObject<{
        baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
        resultSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
    }, z.core.$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            baseSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
            resultSourceRevision: z.core.$ZodBranded<z.ZodString, "SourceRevision", "out">;
            files: z.ZodArray<z.ZodObject<{
                path: z.ZodString;
                status: z.ZodEnum<{
                    ADDED: "ADDED";
                    REMOVED: "REMOVED";
                    MODIFIED: "MODIFIED";
                    RENAMED: "RENAMED";
                }>;
                previousPath: z.ZodNullable<z.ZodString>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const BLD30: {
    readonly id: "BLD-30";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/preview";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{}, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            entryUrl: z.ZodString;
            previewUrl: z.ZodString;
            entryGrant: z.ZodString;
            artifactRevisionId: z.core.$ZodBranded<z.ZodUUID, "ArtifactRevisionId", "out">;
            artifactDigest: z.ZodString;
            expiresAt: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PREVIEW_SUBJECT_NOT_FOUND", "PROJECT_BUILD_DENIED", "PREVIEW_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
