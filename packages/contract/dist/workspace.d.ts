import { z } from 'zod';
export declare const IdempotencyKey: z.ZodString;
export declare const WorkspaceName: z.ZodString;
export declare const WorkspaceCreated: z.ZodObject<{
    workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    name: z.ZodString;
    creatorAccountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    initialAccessEstablished: z.ZodLiteral<true>;
}, z.core.$strip>;
export type WorkspaceCreated = z.output<typeof WorkspaceCreated>;
export declare const WS01: {
    readonly id: "WS-01";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces";
    readonly params: null;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.ZodString;
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
    readonly failures: readonly ["IDEMPOTENCY_CONFLICT"];
    readonly malformed: null;
};
