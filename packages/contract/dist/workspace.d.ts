import { z } from 'zod';
export declare const WorkspaceName: z.ZodString;
export declare const WorkspaceCreated: z.ZodObject<{
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    creatorAccountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    initialAccessEstablished: z.ZodLiteral<true>;
}, z.core.$strip>;
export type WorkspaceCreated = z.output<typeof WorkspaceCreated>;
export declare const createWorkspace: {
    readonly id: "createWorkspace";
    readonly summary: "Create a Workspace; the creator becomes its owner.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces";
    readonly params: null;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        name: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
            name: z.ZodString;
            creatorAccountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            initialAccessEstablished: z.ZodLiteral<true>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: null;
};
