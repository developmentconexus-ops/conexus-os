export * from './field-failures.js';
export * from './ids.js';
export * from './builder.js';
export * from './failures.generated.js';
export * from './connectors.js';
export * from './operation.js';
export * from './problem.js';
export * from './project.js';
export * from './workspace.js';
export declare const OPERATIONS: readonly ({
    readonly id: "BLD-08";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/tree";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: import("zod").ZodObject<{
        sourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
    }, import("zod/v4/core").$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            sourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
            entries: import("zod").ZodArray<import("zod").ZodObject<{
                path: import("zod").ZodString;
                kind: import("zod").ZodEnum<{
                    FILE: "FILE";
                    DIRECTORY: "DIRECTORY";
                }>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "BLD-09";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/file";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: import("zod").ZodObject<{
        sourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
        path: import("zod").ZodString;
    }, import("zod/v4/core").$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            sourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
            path: import("zod").ZodString;
            content: import("zod").ZodString;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "SOURCE_FILE_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "BLD-23";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/builder-session";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
            latestBuilderRun: import("zod").ZodNullable<import("zod").ZodObject<{
                builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                conversationId: import("zod").ZodString;
                state: import("zod").ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: import("zod").ZodNullable<import("zod").ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: import("zod").ZodNullable<import("zod").ZodString>;
                requestText: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodISODateTime;
                cancellationRequested: import("zod").ZodBoolean;
                pendingCalls: import("zod").ZodArray<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>>;
            latestCodeChangingRun: import("zod").ZodNullable<import("zod").ZodObject<{
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultKind: import("zod").ZodEnum<{
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>;
            }, import("zod/v4/core").$strip>>;
            preview: import("zod").ZodObject<{
                workingSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                lastGoodSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                lastGoodArtifactRevisionId: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ArtifactRevisionId", "out">>;
                lastGoodArtifactDigest: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>;
            runHistory: import("zod").ZodArray<import("zod").ZodObject<{
                builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                conversationId: import("zod").ZodString;
                state: import("zod").ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: import("zod").ZodNullable<import("zod").ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: import("zod").ZodNullable<import("zod").ZodString>;
                requestText: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodISODateTime;
                cancellationRequested: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_SESSION_UNAVAILABLE", "PROJECT_BUILD_DENIED", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "BLD-24";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/messages";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: import("zod").ZodObject<{
        'idempotency-key': import("zod/v4/core").$ZodBranded<import("zod").ZodString, "IdempotencyKey", "out">;
    }, import("zod/v4/core").$loose>;
    readonly body: import("zod").ZodObject<{
        content: import("zod").ZodString;
        conversationId: import("zod").ZodString;
    }, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            builderRun: import("zod").ZodObject<{
                builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                conversationId: import("zod").ZodString;
                state: import("zod").ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: import("zod").ZodNullable<import("zod").ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: import("zod").ZodNullable<import("zod").ZodString>;
                requestText: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodISODateTime;
                cancellationRequested: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>;
        }, import("zod/v4/core").$strip>;
        readonly 200: import("zod").ZodObject<{
            builderRun: import("zod").ZodObject<{
                builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                conversationId: import("zod").ZodString;
                state: import("zod").ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: import("zod").ZodNullable<import("zod").ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: import("zod").ZodNullable<import("zod").ZodString>;
                requestText: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodISODateTime;
                cancellationRequested: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["IDEMPOTENCY_CONFLICT", "CONVERSATION_NOT_FOUND", "BUILDER_CAPACITY_FULL", "PROJECT_BUILD_DENIED", "ACCOUNT_INACTIVE", "BUILDER_MESSAGE_REFUSED", "BUILDER_RUN_CREATE_FAILED", "BUILDER_BUSY", "PROJECT_BUSY", "BUILDER_SOURCE_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "BLD-25";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/runs/:builderRunId/cancel";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
        builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: import("zod").ZodObject<{}, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            builderRun: import("zod").ZodObject<{
                builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                conversationId: import("zod").ZodString;
                state: import("zod").ZodEnum<{
                    QUEUED: "QUEUED";
                    RUNNING: "RUNNING";
                    SUCCEEDED: "SUCCEEDED";
                    FAILED: "FAILED";
                    INTERRUPTED: "INTERRUPTED";
                }>;
                phase: import("zod").ZodNullable<import("zod").ZodEnum<{
                    PREPARING: "PREPARING";
                    AGENT: "AGENT";
                    WAITING: "WAITING";
                    SOURCE_ADMISSION: "SOURCE_ADMISSION";
                    COMPILING: "COMPILING";
                    FINALIZING: "FINALIZING";
                }>>;
                baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
                resultSourceRevision: import("zod").ZodNullable<import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">>;
                resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                    RESPONSE_ONLY: "RESPONSE_ONLY";
                    SOURCE_CHANGED: "SOURCE_CHANGED";
                    SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                }>>;
                failureCode: import("zod").ZodNullable<import("zod").ZodString>;
                requestText: import("zod").ZodNullable<import("zod").ZodString>;
                createdAt: import("zod").ZodISODateTime;
                cancellationRequested: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_RUN_NOT_FOUND", "PROJECT_BUILD_DENIED", "ACCOUNT_INACTIVE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly builderRunId: "BUILDER_RUN_NOT_FOUND";
    };
} | {
    readonly id: "BLD-26";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/builder-session/runs/:builderRunId/trace";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
        builderRunId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BuilderRunId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            available: import("zod").ZodBoolean;
            traceId: import("zod").ZodNullable<import("zod").ZodString>;
            spans: import("zod").ZodArray<import("zod").ZodObject<{
                spanId: import("zod").ZodString;
                parentSpanId: import("zod").ZodNullable<import("zod").ZodString>;
                spanType: import("zod").ZodString;
                name: import("zod").ZodString;
                startedAt: import("zod").ZodISODateTime;
                durationMs: import("zod").ZodNullable<import("zod").ZodNumber>;
                error: import("zod").ZodBoolean;
                model: import("zod").ZodNullable<import("zod").ZodString>;
                usage: import("zod").ZodNullable<import("zod").ZodObject<{
                    inputTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                    outputTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                    totalTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                    inputDetails: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>>;
                    outputDetails: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>>;
                }, import("zod/v4/core").$strip>>;
            }, import("zod/v4/core").$strip>>;
            usage: import("zod").ZodNullable<import("zod").ZodObject<{
                inputTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                outputTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                totalTokens: import("zod").ZodNullable<import("zod").ZodNumber>;
                inputDetails: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>>;
                outputDetails: import("zod").ZodOptional<import("zod").ZodRecord<import("zod").ZodString, import("zod").ZodNumber>>;
            }, import("zod/v4/core").$strip>>;
            modelCalls: import("zod").ZodNumber;
            toolCalls: import("zod").ZodNumber;
            scores: import("zod").ZodArray<import("zod").ZodObject<{
                scorer: import("zod").ZodString;
                score: import("zod").ZodNumber;
                reason: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["BUILDER_RUN_NOT_FOUND", "BUILDER_TRACE_UNAVAILABLE", "PROJECT_BUILD_DENIED"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly builderRunId: "BUILDER_RUN_NOT_FOUND";
    };
} | {
    readonly id: "BLD-29";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/source/compare";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: import("zod").ZodObject<{
        baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
        resultSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
    }, import("zod/v4/core").$strict>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            baseSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
            resultSourceRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "SourceRevision", "out">;
            files: import("zod").ZodArray<import("zod").ZodObject<{
                path: import("zod").ZodString;
                status: import("zod").ZodEnum<{
                    ADDED: "ADDED";
                    REMOVED: "REMOVED";
                    MODIFIED: "MODIFIED";
                    RENAMED: "RENAMED";
                }>;
                previousPath: import("zod").ZodNullable<import("zod").ZodString>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["SOURCE_REVISION_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "BLD-30";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/builder-session/preview";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: import("zod").ZodObject<{}, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            entryUrl: import("zod").ZodString;
            previewUrl: import("zod").ZodString;
            entryGrant: import("zod").ZodString;
            artifactRevisionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ArtifactRevisionId", "out">;
            artifactDigest: import("zod").ZodString;
            expiresAt: import("zod").ZodISODateTime;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PREVIEW_SUBJECT_NOT_FOUND", "PROJECT_BUILD_DENIED", "PREVIEW_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "CON-01";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/connections";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            entries: import("zod").ZodArray<import("zod").ZodObject<{
                connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
                connectorId: import("zod").ZodString;
                label: import("zod").ZodString;
                createdAt: import("zod").ZodISODateTime;
                disabledAt: import("zod").ZodOptional<import("zod").ZodISODateTime>;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
} | {
    readonly id: "CON-02";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/connections";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
        connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
        connectorId: import("zod").ZodLiteral<"sankhya">;
        label: import("zod").ZodString;
        credential: import("zod").ZodObject<{
            clientId: import("zod").ZodString;
            clientSecret: import("zod").ZodString;
            xToken: import("zod").ZodString;
        }, import("zod/v4/core").$strict>;
    }, import("zod/v4/core").$strict>], "connectorId">;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
            connectorId: import("zod").ZodString;
            label: import("zod").ZodString;
            createdAt: import("zod").ZodISODateTime;
            disabledAt: import("zod").ZodOptional<import("zod").ZodISODateTime>;
        }, import("zod/v4/core").$strip>;
        readonly 200: import("zod").ZodObject<{
            connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
            connectorId: import("zod").ZodString;
            label: import("zod").ZodString;
            createdAt: import("zod").ZodISODateTime;
            disabledAt: import("zod").ZodOptional<import("zod").ZodISODateTime>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_WORKSPACE_NOT_FOUND", "CONNECTOR_LABEL_REFUSED", "CONNECTOR_CREDENTIAL_REFUSED", "CONNECTOR_CONNECTION_CONFLICT"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_WORKSPACE_NOT_FOUND";
    };
} | {
    readonly id: "CON-03";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/connections/:connectionId/authentication-check";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
        connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            outcome: import("zod").ZodEnum<{
                CONNECTOR_UNCONFIGURED: "CONNECTOR_UNCONFIGURED";
                CREDENTIAL_REFUSED: "CREDENTIAL_REFUSED";
                PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT";
                PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE";
                PROVIDER_ERROR: "PROVIDER_ERROR";
                OK: "OK";
            }>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_CONNECTION_NOT_FOUND", "CONNECTOR_PLATFORM_FAILED"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_CONNECTION_NOT_FOUND";
        readonly connectionId: "CONNECTOR_CONNECTION_NOT_FOUND";
    };
} | {
    readonly id: "CON-04";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/workspaces/:workspaceId/connections/:connectionId";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
        connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_CONNECTION_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_CONNECTION_NOT_FOUND";
        readonly connectionId: "CONNECTOR_CONNECTION_NOT_FOUND";
    };
} | {
    readonly id: "CON-08";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/connection-bindings";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            entries: import("zod").ZodArray<import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"binding">;
                bindingId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BindingId", "out">;
                name: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "BindingName", "out">;
                connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
                connectorId: import("zod").ZodString;
                label: import("zod").ZodString;
                boundAt: import("zod").ZodISODateTime;
            }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
                kind: import("zod").ZodLiteral<"bindable">;
                connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
                connectorId: import("zod").ZodString;
                label: import("zod").ZodString;
            }, import("zod/v4/core").$strip>], "kind">>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND", "CONNECTOR_BINDING_MANAGE_REQUIRED"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "CON-09";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/connection-bindings";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: import("zod").ZodObject<{
        connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
        name: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "BindingName", "out">;
    }, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"binding">;
            bindingId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BindingId", "out">;
            name: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "BindingName", "out">;
            connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
            connectorId: import("zod").ZodString;
            label: import("zod").ZodString;
            boundAt: import("zod").ZodISODateTime;
        }, import("zod/v4/core").$strip>;
        readonly 200: import("zod").ZodObject<{
            kind: import("zod").ZodLiteral<"binding">;
            bindingId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BindingId", "out">;
            name: import("zod/v4/core").$ZodBranded<import("zod").ZodString, "BindingName", "out">;
            connectionId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ConnectionId", "out">;
            connectorId: import("zod").ZodString;
            label: import("zod").ZodString;
            boundAt: import("zod").ZodISODateTime;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND", "CONNECTOR_BINDING_MANAGE_REQUIRED", "CONNECTOR_CONNECTION_NOT_AVAILABLE", "CONNECTOR_BINDING_CONFLICT", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "CON-10";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId/connection-bindings/:bindingId";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
        bindingId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "BindingId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND", "CONNECTOR_BINDING_MANAGE_REQUIRED", "CONNECTOR_BINDING_NOT_FOUND", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly bindingId: "CONNECTOR_BINDING_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-01";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/projects";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodArray<import("zod").ZodObject<{
            projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
            workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
            name: import("zod").ZodString;
            archived: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strip>>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-02";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodUnion<readonly [import("zod").ZodObject<{
            projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
            workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
            name: import("zod").ZodString;
            projectRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectRevision", "out">;
            archived: import("zod").ZodBoolean;
            deleting: import("zod").ZodBoolean;
        }, import("zod/v4/core").$strip>, import("zod").ZodObject<{
            projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
            workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
            name: import("zod").ZodString;
            projectRevision: import("zod").ZodLiteral<"">;
            archived: import("zod").ZodLiteral<false>;
            deleting: import("zod").ZodLiteral<true>;
        }, import("zod/v4/core").$strip>]>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-03";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/projects";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: import("zod").ZodObject<{
        'idempotency-key': import("zod/v4/core").$ZodBranded<import("zod").ZodString, "IdempotencyKey", "out">;
    }, import("zod/v4/core").$loose>;
    readonly body: import("zod").ZodObject<{
        name: import("zod").ZodString;
        sourceBootstrap: import("zod").ZodDiscriminatedUnion<[import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"NEW">;
        }, import("zod/v4/core").$strict>, import("zod").ZodObject<{
            mode: import("zod").ZodLiteral<"EXISTING_GIT">;
            repositoryLocator: import("zod").ZodString;
        }, import("zod/v4/core").$strict>], "mode">;
    }, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
            workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
            name: import("zod").ZodString;
            projectRevision: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectRevision", "out">;
            archived: import("zod").ZodLiteral<false>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_CREATE_DENIED", "IDEMPOTENCY_CONFLICT", "PROJECT_SOURCE_REFUSED", "PROJECT_REPOSITORY_UNAVAILABLE", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-04";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: import("zod").ZodObject<{
        confirmName: import("zod").ZodString;
    }, import("zod/v4/core").$strip>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_DELETE_DENIED", "PROJECT_NOT_FOUND", "PROJECT_NAME_MISMATCH", "PROJECT_BUSY", "PROJECT_DELETION_INCOMPLETE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-SUMMARIES";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/project-summaries";
    readonly params: import("zod").ZodObject<{
        workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: import("zod").ZodObject<{
            projects: import("zod").ZodArray<import("zod").ZodObject<{
                projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
                name: import("zod").ZodString;
                archived: import("zod").ZodBoolean;
                lastActivityAt: import("zod").ZodString;
                latestRun: import("zod").ZodNullable<import("zod").ZodObject<{
                    state: import("zod").ZodEnum<{
                        QUEUED: "QUEUED";
                        RUNNING: "RUNNING";
                        SUCCEEDED: "SUCCEEDED";
                        FAILED: "FAILED";
                        INTERRUPTED: "INTERRUPTED";
                    }>;
                    resultKind: import("zod").ZodNullable<import("zod").ZodEnum<{
                        RESPONSE_ONLY: "RESPONSE_ONLY";
                        SOURCE_CHANGED: "SOURCE_CHANGED";
                        SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                    }>>;
                }, import("zod/v4/core").$strip>>;
                hasPreview: import("zod").ZodBoolean;
                deleting: import("zod").ZodBoolean;
            }, import("zod/v4/core").$strip>>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_SUMMARIES_UNAVAILABLE"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
} | {
    readonly id: "PRJ-THUMBNAIL";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/thumbnail";
    readonly params: import("zod").ZodObject<{
        projectId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "ProjectId", "out">;
    }, import("zod/v4/core").$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: {
            readonly mediaType: "image/png";
            readonly maxBytes: 512000;
            readonly cache: "revalidate-private";
        };
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_THUMBNAIL_NOT_FOUND", "PROJECT_THUMBNAIL_UNAVAILABLE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
} | {
    readonly id: "WS-01";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces";
    readonly params: null;
    readonly query: null;
    readonly headers: import("zod").ZodObject<{
        'idempotency-key': import("zod/v4/core").$ZodBranded<import("zod").ZodString, "IdempotencyKey", "out">;
    }, import("zod/v4/core").$loose>;
    readonly body: import("zod").ZodObject<{
        name: import("zod").ZodString;
    }, import("zod/v4/core").$strict>;
    readonly success: {
        readonly 201: import("zod").ZodObject<{
            workspaceId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "WorkspaceId", "out">;
            name: import("zod").ZodString;
            creatorAccountId: import("zod/v4/core").$ZodBranded<import("zod").ZodUUID, "AccountId", "out">;
            initialAccessEstablished: import("zod").ZodLiteral<true>;
        }, import("zod/v4/core").$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["IDEMPOTENCY_CONFLICT", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: null;
})[];
