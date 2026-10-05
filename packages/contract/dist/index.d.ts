export * from './ids.js';
export * from './failures.generated.js';
export * from './operation.js';
export * from './problem.js';
export * from './workspace.js';
export declare const OPERATIONS: readonly {
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
}[];
