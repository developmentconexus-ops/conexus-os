import { z } from 'zod';
export declare const ModelAccountProvider: z.ZodEnum<{
    anthropic: "anthropic";
    "openai-codex": "openai-codex";
    "google-ai-pro": "google-ai-pro";
}>;
export type ModelAccountProvider = z.output<typeof ModelAccountProvider>;
export declare const ModelAccountKind: z.ZodEnum<{
    api_key: "api_key";
    oauth: "oauth";
    google_ai_pro: "google_ai_pro";
}>;
export type ModelAccountKind = z.output<typeof ModelAccountKind>;
export declare const ModelRole: z.ZodEnum<{
    build: "build";
    memory: "memory";
}>;
export type ModelRole = z.output<typeof ModelRole>;
export declare const ApiKeyProvider: z.ZodEnum<{
    anthropic: "anthropic";
}>;
export declare const THINKING_LEVELS: readonly ["off", "low", "medium", "high", "xhigh", "max"];
export declare const ThinkingLevel: z.ZodEnum<{
    off: "off";
    low: "low";
    medium: "medium";
    high: "high";
    xhigh: "xhigh";
    max: "max";
}>;
export type ThinkingLevel = z.output<typeof ThinkingLevel>;
export declare const OfferedModel: z.ZodObject<{
    id: z.ZodString;
    provider: z.ZodString;
    providerName: z.ZodString;
    modelName: z.ZodString;
    thinkingLevels: z.ZodArray<z.ZodEnum<{
        off: "off";
        low: "low";
        medium: "medium";
        high: "high";
        xhigh: "xhigh";
        max: "max";
    }>>;
}, z.core.$strip>;
export type OfferedModel = z.output<typeof OfferedModel>;
export declare const OwnModelAccount: z.ZodDiscriminatedUnion<[z.ZodObject<{
    state: z.ZodLiteral<"absent">;
}, z.core.$strip>, z.ZodObject<{
    state: z.ZodLiteral<"connected">;
    kind: z.ZodEnum<{
        api_key: "api_key";
        oauth: "oauth";
        google_ai_pro: "google_ai_pro";
    }>;
}, z.core.$strip>], "state">;
export type OwnModelAccount = z.output<typeof OwnModelAccount>;
export declare const ModelAccountEntry: z.ZodObject<{
    provider: z.ZodEnum<{
        anthropic: "anthropic";
        "openai-codex": "openai-codex";
        "google-ai-pro": "google-ai-pro";
    }>;
    providerName: z.ZodString;
    own: z.ZodDiscriminatedUnion<[z.ZodObject<{
        state: z.ZodLiteral<"absent">;
    }, z.core.$strip>, z.ZodObject<{
        state: z.ZodLiteral<"connected">;
        kind: z.ZodEnum<{
            api_key: "api_key";
            oauth: "oauth";
            google_ai_pro: "google_ai_pro";
        }>;
    }, z.core.$strip>], "state">;
}, z.core.$strip>;
export type ModelAccountEntry = z.output<typeof ModelAccountEntry>;
export declare const listAvailableModels: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            models: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                provider: z.ZodString;
                providerName: z.ZodString;
                modelName: z.ZodString;
                thinkingLevels: z.ZodArray<z.ZodEnum<{
                    off: "off";
                    low: "low";
                    medium: "medium";
                    high: "high";
                    xhigh: "xhigh";
                    max: "max";
                }>>;
            }, z.core.$strip>>;
            defaultThinkingLevel: z.ZodEnum<{
                off: "off";
                low: "low";
                medium: "medium";
                high: "high";
                xhigh: "xhigh";
                max: "max";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "listAvailableModels";
    readonly summary: "List the models the Builder picker offers the current Account.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/model-accounts/models";
};
export declare const listModelAccounts: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            accounts: z.ZodArray<z.ZodObject<{
                provider: z.ZodEnum<{
                    anthropic: "anthropic";
                    "openai-codex": "openai-codex";
                    "google-ai-pro": "google-ai-pro";
                }>;
                providerName: z.ZodString;
                own: z.ZodDiscriminatedUnion<[z.ZodObject<{
                    state: z.ZodLiteral<"absent">;
                }, z.core.$strip>, z.ZodObject<{
                    state: z.ZodLiteral<"connected">;
                    kind: z.ZodEnum<{
                        api_key: "api_key";
                        oauth: "oauth";
                        google_ai_pro: "google_ai_pro";
                    }>;
                }, z.core.$strip>], "state">;
            }, z.core.$strip>>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "listModelAccounts";
    readonly summary: "List the model accounts of the current Account.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/model-accounts";
};
export declare const setModelAccountApiKey: {
    readonly id: "setModelAccountApiKey";
    readonly summary: "Store the API key of the current Account for a provider.";
    readonly access: "session";
    readonly method: "PUT";
    readonly path: "/api/control/model-accounts/:provider/api-key";
    readonly params: z.ZodObject<{
        provider: z.ZodEnum<{
            anthropic: "anthropic";
        }>;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: z.ZodObject<{
        key: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 204: null;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_ACCOUNT_KEY_REFUSED", "ACCOUNT_INACTIVE", "ACCOUNT_NOT_FOUND"];
    readonly malformed: {
        readonly provider: "MODEL_ACCOUNT_PROVIDER_UNKNOWN";
    };
};
export declare const startClaudeModelLogin: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
            url: z.ZodString;
            expiresAt: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "startClaudeModelLogin";
    readonly summary: "Start the Claude sign-in of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/anthropic/oauth/start";
};
export declare const completeClaudeModelLogin: {
    readonly query: null;
    readonly body: z.ZodObject<{
        loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
        code: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            state: z.ZodEnum<{
                succeeded: "succeeded";
                failed: "failed";
                expired: "expired";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "completeClaudeModelLogin";
    readonly summary: "Complete a Claude sign-in attempt of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/anthropic/oauth/complete";
};
export declare const startCodexModelLogin: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
            url: z.ZodString;
            userCode: z.ZodString;
            intervalMs: z.ZodNumber;
            expiresAt: z.ZodISODateTime;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "startCodexModelLogin";
    readonly summary: "Start the ChatGPT sign-in of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/openai-codex/oauth/start";
};
export declare const pollCodexModelLogin: {
    readonly query: z.ZodObject<{
        loginId: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            state: z.ZodEnum<{
                succeeded: "succeeded";
                failed: "failed";
                expired: "expired";
                waiting: "waiting";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly [];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "pollCodexModelLogin";
    readonly summary: "Poll a ChatGPT sign-in attempt of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/openai-codex/oauth/poll";
};
export declare const getGoogleModelConnection: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            own: z.ZodDiscriminatedUnion<[z.ZodObject<{
                state: z.ZodLiteral<"absent">;
            }, z.core.$strip>, z.ZodObject<{
                state: z.ZodLiteral<"connected">;
                kind: z.ZodEnum<{
                    api_key: "api_key";
                    oauth: "oauth";
                    google_ai_pro: "google_ai_pro";
                }>;
            }, z.core.$strip>], "state">;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "getGoogleModelConnection";
    readonly summary: "Read the Google connection of the current Account.";
    readonly access: "session";
    readonly method: "GET";
    readonly path: "/api/control/model-accounts/google-ai-pro/connection";
};
export declare const startGoogleModelLogin: {
    readonly query: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
            url: z.ZodString;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_BUSY", "MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "startGoogleModelLogin";
    readonly summary: "Start the Google sign-in of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/google-ai-pro/login/start";
};
export declare const completeGoogleModelLogin: {
    readonly query: null;
    readonly body: z.ZodObject<{
        loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
        callbackUrl: z.ZodString;
    }, z.core.$strict>;
    readonly success: {
        readonly 200: z.ZodObject<{
            state: z.ZodEnum<{
                succeeded: "succeeded";
                failed: "failed";
                expired: "expired";
                waiting: "waiting";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_CALLBACK_REFUSED", "MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: null;
    readonly params: null;
    readonly headers: null;
    readonly id: "completeGoogleModelLogin";
    readonly summary: "Complete a Google sign-in attempt of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/google-ai-pro/login/complete";
};
export declare const getGoogleModelLoginStatus: {
    readonly id: "getGoogleModelLoginStatus";
    readonly summary: "Read the status of a Google sign-in attempt of the current Account.";
    readonly access: "session";
    readonly method: "POST";
    readonly path: "/api/control/model-accounts/google-ai-pro/login/:loginId";
    readonly params: z.ZodObject<{
        loginId: z.core.$ZodBranded<z.ZodString, "ModelLoginId", "out">;
    }, z.core.$strip>;
    readonly query: null;
    readonly headers: null;
    readonly body: null;
    readonly success: {
        readonly 200: z.ZodObject<{
            state: z.ZodEnum<{
                succeeded: "succeeded";
                failed: "failed";
                expired: "expired";
                waiting: "waiting";
            }>;
        }, z.core.$strip>;
    };
    readonly effects: readonly [];
    readonly failures: readonly ["MODEL_LOGIN_UNAVAILABLE"];
    readonly malformed: {
        readonly loginId: "MODEL_LOGIN_NOT_FOUND";
    };
};
