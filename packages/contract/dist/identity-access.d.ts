import { z } from 'zod';
/** The one parse of an email the Hub accepts: trimmed and lowercased, so a Workspace and an email name one invitation. */
export declare const EmailAddress: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
export type EmailAddress = z.output<typeof EmailAddress>;
export declare const DisplayName: z.ZodString;
export declare const WorkspaceRole: z.ZodEnum<{
    owner: "owner";
    member: "member";
}>;
export type WorkspaceRole = z.output<typeof WorkspaceRole>;
export declare const InvitationState: z.ZodEnum<{
    PENDING: "PENDING";
    EXPIRED: "EXPIRED";
}>;
export type InvitationState = z.output<typeof InvitationState>;
export declare const AccountSummary: z.ZodObject<{
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
}, z.core.$strip>;
export type AccountSummary = z.output<typeof AccountSummary>;
/** The signed in person's own account, with the email of their latest verified sign in. */
export declare const SessionAccount: z.ZodObject<{
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
    email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
}, z.core.$strip>;
export type SessionAccount = z.output<typeof SessionAccount>;
export declare const Session: z.ZodObject<{
    account: z.ZodObject<{
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
        displayName: z.ZodString;
        email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
    }, z.core.$strip>;
    administrator: z.ZodBoolean;
    workspaces: z.ZodArray<z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        name: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Session = z.output<typeof Session>;
export declare const WorkspaceMemberEntry: z.ZodObject<{
    kind: z.ZodLiteral<"member">;
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
    email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
    role: z.ZodEnum<{
        owner: "owner";
        member: "member";
    }>;
    since: z.ZodISODateTime;
}, z.core.$strip>;
export type WorkspaceMemberEntry = z.output<typeof WorkspaceMemberEntry>;
export declare const WorkspaceInvitationEntry: z.ZodObject<{
    kind: z.ZodLiteral<"invitation">;
    invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
    email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
    role: z.ZodEnum<{
        owner: "owner";
        member: "member";
    }>;
    invitedAt: z.ZodISODateTime;
    expiresAt: z.ZodISODateTime;
    state: z.ZodEnum<{
        PENDING: "PENDING";
        EXPIRED: "EXPIRED";
    }>;
}, z.core.$strip>;
export type WorkspaceInvitationEntry = z.output<typeof WorkspaceInvitationEntry>;
export declare const WorkspaceRoster: z.ZodObject<{
    viewerRole: z.ZodEnum<{
        owner: "owner";
        member: "member";
    }>;
    entries: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"member">;
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
        displayName: z.ZodString;
        email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
        role: z.ZodEnum<{
            owner: "owner";
            member: "member";
        }>;
        since: z.ZodISODateTime;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"invitation">;
        invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
        email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
        role: z.ZodEnum<{
            owner: "owner";
            member: "member";
        }>;
        invitedAt: z.ZodISODateTime;
        expiresAt: z.ZodISODateTime;
        state: z.ZodEnum<{
            PENDING: "PENDING";
            EXPIRED: "EXPIRED";
        }>;
    }, z.core.$strip>], "kind">>;
}, z.core.$strip>;
export type WorkspaceRoster = z.output<typeof WorkspaceRoster>;
export declare const ApplicationGrantEntry: z.ZodObject<{
    kind: z.ZodLiteral<"grant">;
    grantId: z.core.$ZodBranded<z.ZodUUID, "GrantId", "out">;
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
    email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
    grantedAt: z.ZodISODateTime;
}, z.core.$strip>;
export type ApplicationGrantEntry = z.output<typeof ApplicationGrantEntry>;
export declare const ApplicationInvitationEntry: z.ZodObject<{
    kind: z.ZodLiteral<"invitation">;
    invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
    email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
    invitedAt: z.ZodISODateTime;
    expiresAt: z.ZodISODateTime;
    state: z.ZodEnum<{
        PENDING: "PENDING";
        EXPIRED: "EXPIRED";
    }>;
}, z.core.$strip>;
export type ApplicationInvitationEntry = z.output<typeof ApplicationInvitationEntry>;
export declare const ApplicationAccess: z.ZodObject<{
    address: z.ZodOptional<z.ZodURL>;
    entries: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
        kind: z.ZodLiteral<"grant">;
        grantId: z.core.$ZodBranded<z.ZodUUID, "GrantId", "out">;
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
        displayName: z.ZodString;
        email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
        grantedAt: z.ZodISODateTime;
    }, z.core.$strip>, z.ZodObject<{
        kind: z.ZodLiteral<"invitation">;
        invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
        email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
        invitedAt: z.ZodISODateTime;
        expiresAt: z.ZodISODateTime;
        state: z.ZodEnum<{
            PENDING: "PENDING";
            EXPIRED: "EXPIRED";
        }>;
    }, z.core.$strip>], "kind">>;
}, z.core.$strip>;
export type ApplicationAccess = z.output<typeof ApplicationAccess>;
export declare const AdministratorEntry: z.ZodDiscriminatedUnion<[z.ZodObject<{
    grantedVia: z.ZodLiteral<"OPERATOR_BOOTSTRAP">;
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
    email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
    grantedAt: z.ZodISODateTime;
}, z.core.$strip>, z.ZodObject<{
    grantedVia: z.ZodLiteral<"ADMINISTRATOR">;
    grantedBy: z.ZodObject<{
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
        displayName: z.ZodString;
    }, z.core.$strip>;
    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    displayName: z.ZodString;
    email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
    grantedAt: z.ZodISODateTime;
}, z.core.$strip>], "grantedVia">;
export type AdministratorEntry = z.output<typeof AdministratorEntry>;
/** Why the Hub's no access page says a person cannot enter; each is a failure row with its text. */
export declare const HUB_NO_ACCESS_REASONS: readonly ["SIGN_IN_EXPIRED", "SIGN_IN_FAILED", "IDENTITY_EMAIL_NOT_VERIFIED", "IDENTITY_NOT_ELIGIBLE", "ACCOUNT_INACTIVE"];
export declare const HubNoAccessReason: z.ZodEnum<{
    SIGN_IN_EXPIRED: "SIGN_IN_EXPIRED";
    SIGN_IN_FAILED: "SIGN_IN_FAILED";
    IDENTITY_EMAIL_NOT_VERIFIED: "IDENTITY_EMAIL_NOT_VERIFIED";
    IDENTITY_NOT_ELIGIBLE: "IDENTITY_NOT_ELIGIBLE";
    ACCOUNT_INACTIVE: "ACCOUNT_INACTIVE";
}>;
export type HubNoAccessReason = z.output<typeof HubNoAccessReason>;
/** The `reason` query values of an application's no access page. */
export declare const ApplicationNoAccessReason: z.ZodEnum<{
    SIGN_IN_FAILED: "SIGN_IN_FAILED";
    NOT_GRANTED: "NOT_GRANTED";
    EMAIL_NOT_VERIFIED: "EMAIL_NOT_VERIFIED";
}>;
export type ApplicationNoAccessReason = z.output<typeof ApplicationNoAccessReason>;
/** The failure row whose text each application no access reason shows. */
export declare const APPLICATION_NO_ACCESS_TEXT: {
    readonly EMAIL_NOT_VERIFIED: "APPLICATION_EMAIL_NOT_VERIFIED";
    readonly NOT_GRANTED: "APPLICATION_NO_ACCESS";
    readonly SIGN_IN_FAILED: "APPLICATION_SIGN_IN_FAILED";
};
export declare const getSession: {
    readonly id: "getSession";
    readonly summary: "Read the signed in account, whether it administers the installation, and its Workspaces.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/session";
    readonly params: null;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            account: z.ZodObject<{
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
                email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            }, z.core.$strip>;
            administrator: z.ZodBoolean;
            workspaces: z.ZodArray<z.ZodObject<{
                workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
                name: z.ZodString;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["IDENTITY_PROVIDER_UNAVAILABLE"];
    readonly malformed: null;
};
export declare const endSession: {
    readonly id: "endSession";
    readonly summary: "End the Hub session of this browser, its Previews with it, and ask Keycloak to end its own.";
    readonly access: "sign-out";
    readonly method: "DELETE";
    readonly path: "/api/session";
    readonly params: null;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly ["clear-session-cookie"];
    readonly failures: readonly [];
    readonly malformed: null;
};
export declare const getWorkspaceRoster: {
    readonly id: "getWorkspaceRoster";
    readonly summary: "Read the members and the invitations of a Workspace, and the reader's own role.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/workspaces/:workspaceId/roster";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            viewerRole: z.ZodEnum<{
                owner: "owner";
                member: "member";
            }>;
            entries: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"member">;
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
                email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
                role: z.ZodEnum<{
                    owner: "owner";
                    member: "member";
                }>;
                since: z.ZodISODateTime;
            }, z.core.$strip>, z.ZodObject<{
                kind: z.ZodLiteral<"invitation">;
                invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
                email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
                role: z.ZodEnum<{
                    owner: "owner";
                    member: "member";
                }>;
                invitedAt: z.ZodISODateTime;
                expiresAt: z.ZodISODateTime;
                state: z.ZodEnum<{
                    PENDING: "PENDING";
                    EXPIRED: "EXPIRED";
                }>;
            }, z.core.$strip>], "kind">>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
    };
};
export declare const inviteWorkspaceMember: {
    readonly id: "inviteWorkspaceMember";
    readonly summary: "Invite an email into a Workspace with a role; the pair is the natural key, so a new invitation of the same email refreshes it and answers 200; a new one answers 201. Owner only.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/workspaces/:workspaceId/invitations";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
        role: z.ZodEnum<{
            owner: "owner";
            member: "member";
        }>;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            kind: z.ZodLiteral<"invitation">;
            invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
            email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
            role: z.ZodEnum<{
                owner: "owner";
                member: "member";
            }>;
            invitedAt: z.ZodISODateTime;
            expiresAt: z.ZodISODateTime;
            state: z.ZodEnum<{
                PENDING: "PENDING";
                EXPIRED: "EXPIRED";
            }>;
        }, z.core.$strip>;
        readonly 201: z.ZodObject<{
            kind: z.ZodLiteral<"invitation">;
            invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
            email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
            role: z.ZodEnum<{
                owner: "owner";
                member: "member";
            }>;
            invitedAt: z.ZodISODateTime;
            expiresAt: z.ZodISODateTime;
            state: z.ZodEnum<{
                PENDING: "PENDING";
                EXPIRED: "EXPIRED";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MEMBERS_MANAGE_REQUIRED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
        readonly email: "EMAIL_INVALID";
    };
};
export declare const removeWorkspaceMember: {
    readonly id: "removeWorkspaceMember";
    readonly summary: "Remove a member from a Workspace, which withdraws every right the membership gave. An owner removes anyone; a member removes only themselves.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/workspaces/:workspaceId/members/:accountId";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MEMBERS_MANAGE_REQUIRED", "LAST_OWNER", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
        readonly accountId: "ROSTER_ENTRY_NOT_FOUND";
    };
};
export declare const cancelWorkspaceInvitation: {
    readonly id: "cancelWorkspaceInvitation";
    readonly summary: "Cancel an invitation into a Workspace that nobody has claimed. Owner only.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/workspaces/:workspaceId/invitations/:invitationId";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MEMBERS_MANAGE_REQUIRED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
        readonly invitationId: "ROSTER_ENTRY_NOT_FOUND";
    };
};
export declare const setWorkspaceMemberRole: {
    readonly id: "setWorkspaceMemberRole";
    readonly summary: "Set the role of a member of a Workspace; the Workspace keeps at least one owner. Owner only.";
    readonly access: "session";
    readonly method: "PUT";
    readonly path: "/api/control/workspaces/:workspaceId/members/:accountId";
    readonly params: z.ZodObject<{
        workspaceId: z.core.$ZodBranded<z.ZodUUID, "WorkspaceId", "out">;
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{
        role: z.ZodEnum<{
            owner: "owner";
            member: "member";
        }>;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            kind: z.ZodLiteral<"member">;
            accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            displayName: z.ZodString;
            email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            role: z.ZodEnum<{
                owner: "owner";
                member: "member";
            }>;
            since: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MEMBERS_MANAGE_REQUIRED", "LAST_OWNER", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly workspaceId: "WORKSPACE_NOT_FOUND";
        readonly accountId: "ROSTER_ENTRY_NOT_FOUND";
    };
};
export declare const getApplicationAccess: {
    readonly id: "getApplicationAccess";
    readonly summary: "Read the address of a Project's application and who may use it besides the members of its Workspace. Owner only.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/projects/:projectId/application-access";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            address: z.ZodOptional<z.ZodURL>;
            entries: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                kind: z.ZodLiteral<"grant">;
                grantId: z.core.$ZodBranded<z.ZodUUID, "GrantId", "out">;
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
                email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
                grantedAt: z.ZodISODateTime;
            }, z.core.$strip>, z.ZodObject<{
                kind: z.ZodLiteral<"invitation">;
                invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
                email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
                invitedAt: z.ZodISODateTime;
                expiresAt: z.ZodISODateTime;
                state: z.ZodEnum<{
                    PENDING: "PENDING";
                    EXPIRED: "EXPIRED";
                }>;
            }, z.core.$strip>], "kind">>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["APPLICATION_ACCESS_MANAGE_REQUIRED"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
    };
};
export declare const grantApplicationAccess: {
    readonly id: "grantApplicationAccess";
    readonly summary: "Invite an email to a Project's application; the first grant fixes the application's address. The person's next sign in claims it. A new invitation answers 201, a refreshed one 200. Owner only.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/projects/:projectId/application-access";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            kind: z.ZodLiteral<"invitation">;
            invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
            email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
            invitedAt: z.ZodISODateTime;
            expiresAt: z.ZodISODateTime;
            state: z.ZodEnum<{
                PENDING: "PENDING";
                EXPIRED: "EXPIRED";
            }>;
        }, z.core.$strip>;
        readonly 201: z.ZodObject<{
            kind: z.ZodLiteral<"invitation">;
            invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
            email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
            invitedAt: z.ZodISODateTime;
            expiresAt: z.ZodISODateTime;
            state: z.ZodEnum<{
                PENDING: "PENDING";
                EXPIRED: "EXPIRED";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["APPLICATION_ACCESS_MANAGE_REQUIRED", "DATABASE_BUSY", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly email: "EMAIL_INVALID";
    };
};
export declare const revokeApplicationGrant: {
    readonly id: "revokeApplicationGrant";
    readonly summary: "Revoke a person's grant to a Project's application; their next request to it is refused. Owner only.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId/application-access/grants/:grantId";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        grantId: z.core.$ZodBranded<z.ZodUUID, "GrantId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["APPLICATION_ACCESS_MANAGE_REQUIRED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly grantId: "APPLICATION_ACCESS_ENTRY_NOT_FOUND";
    };
};
export declare const cancelApplicationInvitation: {
    readonly id: "cancelApplicationInvitation";
    readonly summary: "Cancel an invitation to a Project's application that nobody has claimed. Owner only.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/projects/:projectId/application-access/invitations/:invitationId";
    readonly params: z.ZodObject<{
        projectId: z.core.$ZodBranded<z.ZodUUID, "ProjectId", "out">;
        invitationId: z.core.$ZodBranded<z.ZodUUID, "InvitationId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["APPLICATION_ACCESS_MANAGE_REQUIRED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly projectId: "PROJECT_NOT_FOUND";
        readonly invitationId: "APPLICATION_ACCESS_ENTRY_NOT_FOUND";
    };
};
export declare const listInstallationAdministrators: {
    readonly id: "listInstallationAdministrators";
    readonly summary: "List the installation administrators and how each became one; installation administrator only.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/installation/administrators";
    readonly params: null;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            administrators: z.ZodArray<z.ZodDiscriminatedUnion<[z.ZodObject<{
                grantedVia: z.ZodLiteral<"OPERATOR_BOOTSTRAP">;
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
                email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
                grantedAt: z.ZodISODateTime;
            }, z.core.$strip>, z.ZodObject<{
                grantedVia: z.ZodLiteral<"ADMINISTRATOR">;
                grantedBy: z.ZodObject<{
                    accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                    displayName: z.ZodString;
                }, z.core.$strip>;
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
                email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
                grantedAt: z.ZodISODateTime;
            }, z.core.$strip>], "grantedVia">>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED"];
    readonly malformed: null;
};
export declare const addInstallationAdministrator: {
    readonly id: "addInstallationAdministrator";
    readonly summary: "Make the one active account with this email an installation administrator: 201 when it gets a tenure, 200 with the tenure it already holds. Installation administrator only.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/installation/administrators";
    readonly params: null;
    readonly query: null;
    readonly headers: z.ZodObject<{
        'idempotency-key': z.core.$ZodBranded<z.ZodString, "IdempotencyKey", "out">;
    }, z.core.$loose>;
    readonly body: z.ZodObject<{
        email: z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodDiscriminatedUnion<[z.ZodObject<{
            grantedVia: z.ZodLiteral<"OPERATOR_BOOTSTRAP">;
            accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            displayName: z.ZodString;
            email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            grantedAt: z.ZodISODateTime;
        }, z.core.$strip>, z.ZodObject<{
            grantedVia: z.ZodLiteral<"ADMINISTRATOR">;
            grantedBy: z.ZodObject<{
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
            }, z.core.$strip>;
            accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            displayName: z.ZodString;
            email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            grantedAt: z.ZodISODateTime;
        }, z.core.$strip>], "grantedVia">;
        readonly 201: z.ZodDiscriminatedUnion<[z.ZodObject<{
            grantedVia: z.ZodLiteral<"OPERATOR_BOOTSTRAP">;
            accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            displayName: z.ZodString;
            email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            grantedAt: z.ZodISODateTime;
        }, z.core.$strip>, z.ZodObject<{
            grantedVia: z.ZodLiteral<"ADMINISTRATOR">;
            grantedBy: z.ZodObject<{
                accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
                displayName: z.ZodString;
            }, z.core.$strip>;
            accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
            displayName: z.ZodString;
            email: z.ZodOptional<z.core.$ZodBranded<z.ZodPipe<z.ZodString, z.ZodEmail>, "EmailAddress", "out">>;
            grantedAt: z.ZodISODateTime;
        }, z.core.$strip>], "grantedVia">;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "ACCOUNT_NOT_FOUND", "ACCOUNT_EMAIL_AMBIGUOUS"];
    readonly malformed: {
        readonly email: "EMAIL_INVALID";
    };
};
export declare const removeInstallationAdministrator: {
    readonly id: "removeInstallationAdministrator";
    readonly summary: "End an account's tenure as installation administrator; the installation keeps at least one. Installation administrator only.";
    readonly access: "session";
    readonly method: "DELETE";
    readonly path: "/api/control/installation/administrators/:accountId";
    readonly params: z.ZodObject<{
        accountId: z.core.$ZodBranded<z.ZodUUID, "AccountId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["INSTALLATION_ADMINISTRATOR_REQUIRED", "LAST_INSTALLATION_ADMINISTRATOR"];
    readonly malformed: {
        readonly accountId: "INSTALLATION_ADMINISTRATOR_NOT_FOUND";
    };
};
