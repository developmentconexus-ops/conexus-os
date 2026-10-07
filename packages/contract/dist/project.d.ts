import { z } from 'zod';
export declare const ProjectName: z.ZodString;
export type ProjectName = z.output<typeof ProjectName>;
export declare const ProjectListItem: z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    archived: z.ZodBoolean;
}, z.core.$strip>;
export type ProjectListItem = z.output<typeof ProjectListItem>;
export declare const ProjectDetail: z.ZodUnion<readonly [z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    projectRevision: z.core.$ZodBranded<z.ZodUUID, "ProjectRevision", "out">;
    archived: z.ZodBoolean;
    deleting: z.ZodBoolean;
}, z.core.$strip>, z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    projectRevision: z.ZodLiteral<"">;
    archived: z.ZodLiteral<false>;
    deleting: z.ZodLiteral<true>;
}, z.core.$strip>]>;
export type ProjectDetail = z.output<typeof ProjectDetail>;
export declare const ProjectCreated: z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    projectRevision: z.core.$ZodBranded<z.ZodUUID, "ProjectRevision", "out">;
    archived: z.ZodLiteral<false>;
}, z.core.$strip>;
export type ProjectCreated = z.output<typeof ProjectCreated>;
export declare const ProjectSourceBootstrap: z.ZodDiscriminatedUnion<[z.ZodObject<{
    mode: z.ZodLiteral<"NEW">;
}, z.core.$strict>, z.ZodObject<{
    mode: z.ZodLiteral<"EXISTING_GIT">;
    repositoryLocator: z.ZodString;
}, z.core.$strict>], "mode">;
export declare const ProjectCard: z.ZodObject<{
    projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    name: z.ZodString;
    archived: z.ZodBoolean;
    lastActivityAt: z.ZodString;
    latestRun: z.ZodNullable<z.ZodObject<{
        state: z.ZodEnum<{
            QUEUED: "QUEUED";
            RUNNING: "RUNNING";
            SUCCEEDED: "SUCCEEDED";
            FAILED: "FAILED";
            INTERRUPTED: "INTERRUPTED";
        }>;
        resultKind: z.ZodNullable<z.ZodEnum<{
            RESPONSE_ONLY: "RESPONSE_ONLY";
            SOURCE_CHANGED: "SOURCE_CHANGED";
            SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
        }>>;
    }, z.core.$strip>>;
    hasPreview: z.ZodBoolean;
    deleting: z.ZodBoolean;
}, z.core.$strip>;
export type ProjectCard = z.output<typeof ProjectCard>;
export declare const listProjects: {
    readonly id: "listProjects";
    readonly summary: "List the Projects of a Workspace.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/projects";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodArray<z.ZodObject<{
            projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
            workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
            name: z.ZodString;
            archived: z.ZodBoolean;
        }, z.core.$strip>>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
};
export declare const getProject: {
    readonly id: "getProject";
    readonly summary: "Read one Project the Account may open.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodUnion<readonly [z.ZodObject<{
            projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
            workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
            name: z.ZodString;
            projectRevision: z.core.$ZodBranded<z.ZodUUID, "ProjectRevision", "out">;
            archived: z.ZodBoolean;
            deleting: z.ZodBoolean;
        }, z.core.$strip>, z.ZodObject<{
            projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
            workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
            name: z.ZodString;
            projectRevision: z.ZodLiteral<"">;
            archived: z.ZodLiteral<false>;
            deleting: z.ZodLiteral<true>;
        }, z.core.$strip>]>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const createProject: {
    readonly id: "createProject";
    readonly summary: "Create a Project with its source and initial access, once per idempotency key.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/projects";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        name: z.ZodString;
        sourceBootstrap: z.ZodDiscriminatedUnion<[z.ZodObject<{
            mode: z.ZodLiteral<"NEW">;
        }, z.core.$strict>, z.ZodObject<{
            mode: z.ZodLiteral<"EXISTING_GIT">;
            repositoryLocator: z.ZodString;
        }, z.core.$strict>], "mode">;
    }, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
            workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
            name: z.ZodString;
            projectRevision: z.core.$ZodBranded<z.ZodUUID, "ProjectRevision", "out">;
            archived: z.ZodLiteral<false>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_SOURCE_REFUSED", "PROJECT_REPOSITORY_UNAVAILABLE", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
};
export declare const deleteProject: {
    readonly id: "deleteProject";
    readonly summary: "Delete a Project, its data and its repository; Workspace owners only.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: z.ZodObject<{
        confirmName: z.ZodString;
    }, z.core.$strip>;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_DELETE_DENIED", "PROJECT_NAME_MISMATCH", "PROJECT_BUSY", "PROJECT_DELETION_INCOMPLETE"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const listProjectSummaries: {
    readonly id: "listProjectSummaries";
    readonly summary: "List the Projects of a Workspace with their latest Builder activity and whether a Preview exists.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/project-summaries";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            projects: z.ZodArray<z.ZodObject<{
                projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
                name: z.ZodString;
                archived: z.ZodBoolean;
                lastActivityAt: z.ZodString;
                latestRun: z.ZodNullable<z.ZodObject<{
                    state: z.ZodEnum<{
                        QUEUED: "QUEUED";
                        RUNNING: "RUNNING";
                        SUCCEEDED: "SUCCEEDED";
                        FAILED: "FAILED";
                        INTERRUPTED: "INTERRUPTED";
                    }>;
                    resultKind: z.ZodNullable<z.ZodEnum<{
                        RESPONSE_ONLY: "RESPONSE_ONLY";
                        SOURCE_CHANGED: "SOURCE_CHANGED";
                        SOURCE_CHANGED_BUILD_FAILED: "SOURCE_CHANGED_BUILD_FAILED";
                    }>>;
                }, z.core.$strip>>;
                hasPreview: z.ZodBoolean;
                deleting: z.ZodBoolean;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_SUMMARIES_UNAVAILABLE"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
};
export declare const getProjectThumbnail: {
    readonly id: "getProjectThumbnail";
    readonly summary: "Read the captured thumbnail of a Project application, as an image.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/thumbnail";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
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
};
