import { z } from 'zod';
/** The connectors this Hub registers, the one list of them. */
export declare const ConnectorId: z.ZodEnum<{
    sankhya: "sankhya";
}>;
export type ConnectorId = z.output<typeof ConnectorId>;
/** The stored text of a connector id: the column accepts any value of this shape since migration 0031, and the registry decides which of them this Hub knows. */
export declare const ConnectorIdText: z.ZodString;
export declare const BindingName: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
export type BindingName = z.output<typeof BindingName>;
export declare const ConnectionLabel: z.ZodString;
export declare const SankhyaCredential: z.ZodObject<{
    clientId: z.ZodString;
    clientSecret: z.ZodString;
    xToken: z.ZodString;
}, z.core.$strict>;
export type SankhyaCredential = z.output<typeof SankhyaCredential>;
/** The credential schema of each registered connector. */
export declare const CONNECTOR_CREDENTIALS: {
    readonly sankhya: z.ZodObject<{
        clientId: z.ZodString;
        clientSecret: z.ZodString;
        xToken: z.ZodString;
    }, z.core.$strict>;
};
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
    name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
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
export declare const ConnectionBindingEntry: z.ZodDiscriminatedUnion<[z.ZodObject<{
    kind: z.ZodLiteral<"binding">;
    bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
    name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
    boundAt: z.ZodISODateTime;
}, z.core.$strip>, z.ZodObject<{
    kind: z.ZodLiteral<"bindable">;
    connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
    connectorId: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>], "kind">;
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
export declare const listWorkspaceConnections: {
    readonly id: "listWorkspaceConnections";
    readonly summary: "List the Connections of a Workspace without any credential field; installation administrator only.";
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
export declare const createWorkspaceConnection: {
    readonly id: "createWorkspaceConnection";
    readonly summary: "Create a Connection of a Workspace, idempotent on its client-chosen id; installation administrator only.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/connections";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodDiscriminatedUnion<[z.ZodObject<{
        connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
        connectorId: z.ZodLiteral<"sankhya">;
        label: z.ZodString;
        credential: z.ZodObject<{
            clientId: z.ZodString;
            clientSecret: z.ZodString;
            xToken: z.ZodString;
        }, z.core.$strict>;
    }, z.core.$strict>], "connectorId">;
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
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_CONNECTION_CONFLICT"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_WORKSPACE_NOT_FOUND";
        readonly label: "CONNECTOR_LABEL_REFUSED";
        readonly credential: "CONNECTOR_CREDENTIAL_REFUSED";
    };
};
export declare const checkWorkspaceConnection: {
    readonly id: "checkWorkspaceConnection";
    readonly summary: "Check a Connection by running the allow-listed authentication of its Connector; installation administrator only.";
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
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "CONNECTOR_PLATFORM_FAILED"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_CONNECTION_NOT_FOUND";
        readonly connectionId: "CONNECTOR_CONNECTION_NOT_FOUND";
    };
};
export declare const disableWorkspaceConnection: {
    readonly id: "disableWorkspaceConnection";
    readonly summary: "Disable a Connection and end its open bindings; installation administrator only.";
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
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED"];
    readonly malformed: {
        readonly workspaceId: "CONNECTOR_CONNECTION_NOT_FOUND";
        readonly connectionId: "CONNECTOR_CONNECTION_NOT_FOUND";
    };
};
export declare const listProjectConnectionBindings: {
    readonly id: "listProjectConnectionBindings";
    readonly summary: "List the open bindings of a Project and the Connections it could still bind; Workspace Owner only.";
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
            entries: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"binding">;
                bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
                name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
                connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
                connectorId: z.ZodString;
                label: z.ZodString;
                boundAt: z.ZodISODateTime;
            }, z.core.$strip>, z.ZodObject<{
                kind: z.ZodLiteral<"bindable">;
                connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
                connectorId: z.ZodString;
                label: z.ZodString;
            }, z.core.$strip>], "kind">>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["CONNECTOR_BINDING_MANAGE_REQUIRED", "PROJECT_DELETING"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const bindProjectConnection: {
    readonly id: "bindProjectConnection";
    readonly summary: "Bind an enabled Connection of the Workspace to a Project under a Project-local name; Workspace Owner only.";
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
        name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
    }, z.core.$strict>;
    readonly success: {
        readonly 201: z.ZodObject<{
            kind: z.ZodLiteral<"binding">;
            bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
            name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
            connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
            connectorId: z.ZodString;
            label: z.ZodString;
            boundAt: z.ZodISODateTime;
        }, z.core.$strip>;
        readonly 200: z.ZodObject<{
            kind: z.ZodLiteral<"binding">;
            bindingId: z.core.$ZodBranded<z.ZodUUID, "BindingId", "out">;
            name: z.core.$ZodBranded<z.ZodString, "BindingName", "out">;
            connectionId: z.core.$ZodBranded<z.ZodUUID, "ConnectionId", "out">;
            connectorId: z.ZodString;
            label: z.ZodString;
            boundAt: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["CONNECTOR_BINDING_MANAGE_REQUIRED", "PROJECT_DELETING", "CONNECTOR_CONNECTION_NOT_AVAILABLE", "CONNECTOR_BINDING_CONFLICT", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const unbindProjectConnection: {
    readonly id: "unbindProjectConnection";
    readonly summary: "End the binding of a Connection to a Project; Workspace Owner only.";
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
    readonly failures: readonly ["CONNECTOR_BINDING_MANAGE_REQUIRED", "PROJECT_DELETING", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly bindingId: "CONNECTOR_BINDING_NOT_FOUND";
    };
};
