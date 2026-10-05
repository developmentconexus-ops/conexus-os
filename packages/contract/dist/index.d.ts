export * from './ids.js';
export * from './failures.generated.js';
export * from './operation.js';
export * from './problem.js';
export * from './project.js';
export * from './workspace.js';
export declare const OPERATIONS: readonly ({
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
            readonly etag: true;
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
