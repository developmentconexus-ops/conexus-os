import { z } from 'zod';
/** The stored text of a connector id: the column accepts any value of this shape since migration 0031. */
export declare const ConnectorIdText: z.ZodString;
export declare const BindingName: z.ZodString;
export type BindingName = z.output<typeof BindingName>;
export declare const ConnectionLabel: z.ZodString;
export declare const SankhyaCredential: z.ZodObject<{
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    xToken: z.ZodString;
}, z.core.$strict>;
export type SankhyaCredential = z.output<typeof SankhyaCredential>;
export declare const ConnectorConnection: z.ZodObject<{
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
    createdAt: z.ZodISODateTime;
    disabledAt: z.ZodOptional<z.ZodISODateTime>;
}, z.core.$strip>;
export type ConnectorConnection = z.output<typeof ConnectorConnection>;
export declare const ConnectionBinding: z.ZodObject<{
    kind: z.ZodLiteral<"binding">;
    bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
    name: z.ZodString;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
    boundAt: z.ZodISODateTime;
}, z.core.$strip>;
export type ConnectionBinding = z.output<typeof ConnectionBinding>;
export declare const BindableConnection: z.ZodObject<{
    kind: z.ZodLiteral<"bindable">;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>;
export declare const ConnectionBindingEntry: z.ZodUnion<readonly [z.ZodObject<{
    kind: z.ZodLiteral<"binding">;
    bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
    name: z.ZodString;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
    boundAt: z.ZodISODateTime;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"bindable">;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>]>;
export type ConnectionBindingEntry = z.output<typeof ConnectionBindingEntry>;
export declare const CONNECTION_CHECK_OUTCOMES: readonly ["OK", "CREDENTIAL_REFUSED", "CONNECTOR_UNCONFIGURED", "PROVIDER_UNAVAILABLE", "PROVIDER_TIMEOUT", "PROVIDER_ERROR"];
export declare const ConnectionCheckOutcome: z.ZodEnum<{
    CONNECTOR_UNCONFIGURED: "CONNECTOR_UNCONFIGURED";
    CREDENTIAL_REFUSED: "CREDENTIAL_REFUSED";
    PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT";
    PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE";
    PROVIDER_ERROR: "PROVIDER_ERROR";
    OK: "OK";
}>;
export type ConnectionCheckOutcome = z.output<typeof ConnectionCheckOutcome>;
export declare const CON01: {
    readonly id: "CON-01";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/connections";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            entries: z.ZodArray<z.ZodObject<{
                connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
                connectorId: z.ZodString;
                label: z.ZodString;
                createdAt: z.ZodISODateTime;
                disabledAt: z.ZodOptional<z.ZodISODateTime>;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
};
export declare const CON02: {
    readonly id: "CON-02";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/connections";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{
        connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
        connectorId: z.ZodEnum<{
            sankhya: "sankhya";
        }>;
        label: z.ZodString;
        credential: z.ZodObject<{
            clientId: z.ZodString;
            clientSecret: z.ZodString;
            xToken: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
            connectorId: z.ZodString;
            label: z.ZodString;
            createdAt: z.ZodISODateTime;
            disabledAt: z.ZodOptional<z.ZodISODateTime>;
        }, z.core.$strip>;
        readonly 200: z.ZodObject<{
            connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
            connectorId: z.ZodString;
            label: z.ZodString;
            createdAt: z.ZodISODateTime;
            disabledAt: z.ZodOptional<z.ZodISODateTime>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_WORKSPACE_NOT_FOUND", "CONNECTOR_LABEL_REFUSED", "CONNECTOR_CREDENTIAL_REFUSED", "CONNECTOR_CONNECTION_CONFLICT"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_WORKSPACE_NOT_FOUND";
    };
};
export declare const CON03: {
    readonly id: "CON-03";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/connections/:connectionId/authentication-check";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            outcome: z.ZodEnum<{
                CONNECTOR_UNCONFIGURED: "CONNECTOR_UNCONFIGURED";
                CREDENTIAL_REFUSED: "CREDENTIAL_REFUSED";
                PROVIDER_TIMEOUT: "PROVIDER_TIMEOUT";
                PROVIDER_UNAVAILABLE: "PROVIDER_UNAVAILABLE";
                PROVIDER_ERROR: "PROVIDER_ERROR";
                OK: "OK";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_CONNECTION_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_CONNECTION_NOT_FOUND";
        readonly connectionId: "CONNECTOR_CONNECTION_NOT_FOUND";
    };
};
export declare const CON04: {
    readonly id: "CON-04";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/workspaces/:workspaceId/connections/:connectionId";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    }, z.core.$strip>;
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
};
export declare const CON08: {
    readonly id: "CON-08";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/connection-bindings";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            entries: z.ZodArray<z.ZodUnion<readonly [z.ZodObject<{
                kind: z.ZodLiteral<"binding">;
                bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
                name: z.ZodString;
                connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
                connectorId: z.ZodString;
                label: z.ZodString;
                boundAt: z.ZodISODateTime;
            }, z.core.$strip>, z.ZodObject<{
                kind: z.ZodLiteral<"bindable">;
                connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
                connectorId: z.ZodString;
                label: z.ZodString;
            }, z.core.$strip>]>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND", "CONNECTOR_BINDING_MANAGE_REQUIRED"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const CON09: {
    readonly id: "CON-09";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/connection-bindings";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{
        connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
        name: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            kind: z.ZodLiteral<"binding">;
            bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
            name: z.ZodString;
            connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
            connectorId: z.ZodString;
            label: z.ZodString;
            boundAt: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["PROJECT_NOT_FOUND", "CONNECTOR_BINDING_MANAGE_REQUIRED", "CONNECTOR_CONNECTION_NOT_AVAILABLE", "CONNECTOR_BINDING_CONFLICT", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const CON10: {
    readonly id: "CON-10";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId/connection-bindings/:bindingId";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
    }, z.core.$strip>;
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
};
