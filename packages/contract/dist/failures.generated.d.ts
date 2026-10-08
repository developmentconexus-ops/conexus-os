export declare const FAILURE_STATUS: {
    readonly INTERNAL_UNEXPECTED: 500;
    readonly NOT_FOUND: 404;
    readonly REQUEST_VALIDATION_FAILED: 400;
    readonly REQUEST_JSON_INVALID: 400;
    readonly REQUEST_BODY_TOO_LARGE: 413;
    readonly REQUEST_MEDIA_TYPE_UNSUPPORTED: 415;
    readonly AUTHENTICATION_REQUIRED: 401;
    readonly REQUEST_AUTHENTICITY_DENIED: 403;
    readonly IDEMPOTENCY_KEY_REQUIRED: 400;
    readonly IDEMPOTENCY_CONFLICT: 409;
    readonly OUTCOME_UNKNOWN: 409;
    readonly DATABASE_BUSY: 503;
    readonly IDENTITY_PROVIDER_UNAVAILABLE: 503;
    readonly SIGN_IN_EXPIRED: 401;
    readonly SIGN_IN_FAILED: 502;
    readonly IDENTITY_EMAIL_NOT_VERIFIED: 403;
    readonly IDENTITY_NOT_ELIGIBLE: 403;
    readonly ACCOUNT_INACTIVE: 403;
    readonly WORKSPACE_NOT_FOUND: 404;
    readonly PROJECT_NOT_FOUND: 404;
    readonly PROJECT_SOURCE_REFUSED: 422;
    readonly PROJECT_REPOSITORY_UNAVAILABLE: 503;
    readonly PROJECT_DELETE_DENIED: 403;
    readonly PROJECT_DELETING: 409;
    readonly PROJECT_NAME_MISMATCH: 409;
    readonly PROJECT_BUSY: 409;
    readonly PROJECT_DELETION_INCOMPLETE: 503;
    readonly PROJECT_THUMBNAIL_NOT_FOUND: 404;
    readonly BUILDER_SESSION_UNAVAILABLE: 503;
    readonly BUILDER_SANDBOX_OPEN_FAILED: 503;
    readonly CONVERSATION_NOT_FOUND: 404;
    readonly BUILDER_CAPACITY_FULL: 503;
    readonly BUILDER_MESSAGE_REFUSED: 422;
    readonly BUILDER_UNAVAILABLE: 503;
    readonly BUILDER_RUN_NOT_FOUND: 404;
    readonly BUILDER_TRACE_UNAVAILABLE: 503;
    readonly PREVIEW_UNAVAILABLE: 503;
    readonly PREVIEW_SUBJECT_NOT_FOUND: 404;
    readonly PREVIEW_FORM_REFUSED: 400;
    readonly SOURCE_REVISION_NOT_FOUND: 404;
    readonly SOURCE_FILE_NOT_FOUND: 404;
    readonly BUILDER_SOURCE_UNAVAILABLE: 503;
    readonly REQUEST_CONTEXT_REFUSED: 400;
    readonly TOOL_ANSWER_REFUSED: 400;
    readonly SESSION_STATE_REFUSED: 400;
    readonly BUILDER_SESSION_NOT_FOUND: 404;
    readonly CONVERSATION_SESSION_REFUSED: 400;
    readonly CONVERSATION_CONFLICT: 409;
    readonly BUILDER_BUSY: 409;
    readonly BUILDER_RUN_STOP_REFUSED: 409;
    readonly TOOL_ANSWER_ALREADY_GIVEN: 409;
    readonly QUESTION_ENDED: 409;
    readonly APPLICATION_ACCESS_MANAGE_REQUIRED: 403;
    readonly APPLICATION_ACCESS_ENTRY_NOT_FOUND: 404;
    readonly MEMBERS_MANAGE_REQUIRED: 403;
    readonly LAST_OWNER: 409;
    readonly ROSTER_ENTRY_NOT_FOUND: 404;
    readonly INSTALLATION_ADMINISTRATOR_REQUIRED: 403;
    readonly EMAIL_INVALID: 400;
    readonly ACCOUNT_NOT_FOUND: 404;
    readonly ACCOUNT_EMAIL_AMBIGUOUS: 409;
    readonly INSTALLATION_ADMINISTRATOR_NOT_FOUND: 404;
    readonly LAST_INSTALLATION_ADMINISTRATOR: 409;
    readonly CONNECTOR_CONNECTION_NOT_AVAILABLE: 404;
    readonly CONNECTOR_BINDING_CONFLICT: 409;
    readonly CONNECTOR_BINDING_MANAGE_REQUIRED: 403;
    readonly CONNECTOR_LABEL_REFUSED: 422;
    readonly CONNECTOR_CREDENTIAL_REFUSED: 422;
    readonly CONNECTOR_CONNECTION_CONFLICT: 409;
    readonly CONNECTOR_CONNECTION_NOT_FOUND: 404;
    readonly CONNECTOR_BINDING_NOT_FOUND: 404;
    readonly MODEL_ACCOUNT_PROVIDER_UNKNOWN: 404;
    readonly MODEL_ACCOUNT_KEY_REFUSED: 400;
    readonly MODEL_LOGIN_UNAVAILABLE: 503;
    readonly MODEL_LOGIN_BUSY: 409;
    readonly MODEL_LOGIN_CALLBACK_REFUSED: 400;
    readonly MODEL_LOGIN_NOT_FOUND: 404;
    readonly HUB_UNREACHABLE: 503;
    readonly HUB_RESPONSE_UNREADABLE: 502;
    readonly ANTHROPIC_STORED_RECORD_REFUSED: 500;
    readonly APPLICATION_ARTIFACT_INPUT_REFUSED: 500;
    readonly APPLICATION_CHECK_REPORT_UNREADABLE: 500;
    readonly APPLICATION_CHECK_TIMEOUT: 500;
    readonly APPLICATION_CHECK_UNREADABLE: 500;
    readonly APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED: 500;
    readonly APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED: 500;
    readonly APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED: 500;
    readonly APPLICATION_COMPILER_OUTPUT_PATH_REFUSED: 500;
    readonly APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED: 500;
    readonly APPLICATION_COMPILER_WORKSPACE_REFUSED: 500;
    readonly APPLICATION_ENTRYPOINT_REFUSED: 500;
    readonly APPLICATION_FILE_COUNT_REFUSED: 500;
    readonly APPLICATION_FILE_DUPLICATE_REFUSED: 500;
    readonly APPLICATION_FILE_ENCODING_REFUSED: 500;
    readonly APPLICATION_FILE_HASH_REFUSED: 500;
    readonly APPLICATION_FILE_ORDER_REFUSED: 500;
    readonly APPLICATION_FILE_PATH_REFUSED: 500;
    readonly APPLICATION_FILE_SHAPE_REFUSED: 500;
    readonly APPLICATION_FILE_SIZE_REFUSED: 500;
    readonly APPLICATION_MEDIA_TYPE_REFUSED: 500;
    readonly APPLICATION_MIGRATION_FAILED: 500;
    readonly APPLICATION_MIGRATION_HISTORY_DIVERGED: 500;
    readonly APPLICATION_PAYLOAD_PIN_REFUSED: 500;
    readonly APPLICATION_PAYLOAD_REFUSED: 500;
    readonly APPLICATION_RUNNER_UNAVAILABLE: 503;
    readonly APPLICATION_SERVER_REFUSED: 500;
    readonly APPLICATION_SMOKE_FAILED: 500;
    readonly APPLICATION_TOTAL_SIZE_REFUSED: 500;
    readonly BOOT_BROWSER_UNAVAILABLE: 500;
    readonly BUILDER_AGENT_COMPLETION_UNAVAILABLE: 500;
    readonly BUILDER_AGENT_PLATFORM_FAILED: 500;
    readonly BUILDER_AGENT_STALLED: 500;
    readonly BUILDER_AGENT_TRIPWIRE: 500;
    readonly BUILDER_APPLICATION_SOURCE_REFUSED: 500;
    readonly BUILDER_APP_NOT_FIXED: 500;
    readonly BUILDER_CANDIDATE_UNPACK_FAILED: 500;
    readonly BUILDER_CHECK_FAILED: 500;
    readonly BUILDER_CHECK_IDENTITY_MISMATCH: 500;
    readonly BUILDER_CHECK_INSTALL_REFUSED: 500;
    readonly BUILDER_CONVERSATIONS_UNAVAILABLE: 500;
    readonly BUILDER_GATEWAY_MODEL_REFUSED: 500;
    readonly BUILDER_LATE_RESULT_REFUSED: 500;
    readonly BUILDER_MESSAGE_ID_UNAVAILABLE: 500;
    readonly BUILDER_MODEL_AUTH_FAILED: 500;
    readonly BUILDER_MODEL_CONTENT_FILTERED: 500;
    readonly BUILDER_MODEL_CONTEXT_LENGTH: 500;
    readonly BUILDER_MODEL_INCOMPLETE: 500;
    readonly BUILDER_MODEL_NOT_SELECTED: 500;
    readonly BUILDER_MODEL_RATE_LIMITED: 500;
    readonly BUILDER_MODEL_STEP_TIMEOUT: 500;
    readonly BUILDER_MODEL_STREAM_FAILED: 500;
    readonly BUILDER_PREVIEW_NOT_BUILT: 500;
    readonly BUILDER_RESULT_BUNDLE_TOO_LARGE: 500;
    readonly BUILDER_RESULT_CONTENT_TOO_LARGE: 500;
    readonly BUILDER_RESULT_MATERIALIZATION_REFUSED: 500;
    readonly BUILDER_RUNTIME_INPUT_REFUSED: 500;
    readonly BUILDER_RUNTIME_RESULT_SCOPE_REFUSED: 500;
    readonly BUILDER_RUN_CANCELLED: 500;
    readonly BUILDER_CONVERSATION_SESSION_REFUSED: 500;
    readonly BUILDER_RUN_CREATE_FAILED: 500;
    readonly BUILDER_RUN_INPUT_REFUSED: 500;
    readonly BUILDER_RUN_NOT_ADMITTED: 500;
    readonly BUILDER_RUN_TRANSITION_REFUSED: 500;
    readonly BUILDER_RUN_PHASE_UPDATE_REFUSED: 500;
    readonly BUILDER_SANDBOX_AGENT_USER_REQUIRED: 500;
    readonly BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED: 500;
    readonly BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT: 500;
    readonly BUILDER_SANDBOX_EGRESS_POLL_FAILED: 500;
    readonly BUILDER_SANDBOX_EGRESS_START_FAILED: 500;
    readonly BUILDER_SANDBOX_FILE_REFUSED: 500;
    readonly BUILDER_SANDBOX_ID_UNAVAILABLE: 500;
    readonly BUILDER_SANDBOX_INCARNATION_CHANGED: 500;
    readonly BUILDER_SANDBOX_KEEPALIVE_FAILED: 500;
    readonly BUILDER_SESSION_DELETE_FAILED: 500;
    readonly BUILDER_SOURCE_BASE_MOVED: 500;
    readonly BUILDER_SOURCE_BASE_PIN_REFUSED: 500;
    readonly BUILDER_SOURCE_READ_REFUSED: 500;
    readonly BUILDER_SOURCE_READ_TREE_TOO_LARGE: 500;
    readonly BUILDER_SOURCE_READ_UNSAFE_ENTRY: 500;
    readonly BUILDER_STARTER_ENTRY_INSPECTION_FAILED: 500;
    readonly BUILDER_STARTER_ENTRY_UNSAFE: 500;
    readonly BUILDER_STARTER_ROOT_REFUSED: 500;
    readonly CONEXUS_APP_ROOT_MISSING: 500;
    readonly CONEXUS_GIT_FAILED: 500;
    readonly CONEXUS_GIT_MAIN_MISSING: 500;
    readonly CONEXUS_GIT_MERGE_REFUSED: 500;
    readonly CONEXUS_GIT_PROJECT_REFUSED: 500;
    readonly CONEXUS_GIT_REF_MOVED: 500;
    readonly CONEXUS_GIT_REF_REFUSED: 500;
    readonly CONEXUS_GIT_STARTER_REFUSED: 500;
    readonly GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE: 500;
    readonly GOOGLE_AI_PRO_BINARY_REFUSED: 500;
    readonly GOOGLE_AI_PRO_POOL_CLOSED: 500;
    readonly GOOGLE_AI_PRO_PORT_UNAVAILABLE: 500;
    readonly GOOGLE_AI_PRO_PROXY_START_FAILED: 500;
    readonly GOOGLE_AI_PRO_RECORD_REFUSED: 500;
    readonly GOOGLE_AI_PRO_ROUTER_UNAVAILABLE: 500;
    readonly GOOGLE_AI_PRO_STORED_RECORD_REFUSED: 500;
    readonly HUB_RESTART: 500;
    readonly MANIFEST_REFUSED: 500;
    readonly MODEL_ACCOUNT_PROBE_NOT_CALLABLE: 500;
    readonly OPENAI_CODEX_MODEL_REFUSED: 500;
    readonly OPENAI_CODEX_STORED_RECORD_REFUSED: 500;
    readonly SERVER_TREE_REFUSED: 500;
    readonly USER_CANCELLED: 500;
    readonly BUILDER_QUESTION_EXPIRED: 500;
    readonly BUILDER_QUESTION_NOT_RELEASED: 500;
    readonly BUILDER_SOURCE_ADMISSION_FAILED: 500;
    readonly BUILDER_RUN_SETTLE_LOST: 500;
    readonly APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED: 500;
    readonly APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED: 500;
    readonly APPLICATION_RUNNER_RELEASE_REFUSED: 500;
    readonly RUNNER_REQUEST_REFUSED: 400;
    readonly INPUT_REFUSED: 400;
    readonly INPUT_TOO_LARGE: 413;
    readonly OPERATION_NOT_FOUND: 404;
    readonly HANDLER_TIMEOUT: 504;
    readonly RESPONSE_TOO_LARGE: 502;
    readonly DATABASE_UNAVAILABLE: 503;
    readonly APPLICATION_RUNNER_BUSY: 429;
    readonly APPLICATION_PROJECT_BUSY: 429;
    readonly SERVER_TREE_TOO_LARGE: 413;
    readonly HANDLER_FAILED: 500;
    readonly HANDLER_LOAD_FAILED: 500;
    readonly HANDLER_EXPORT_MISSING: 500;
    readonly HANDLER_OUTPUT_UNSERIALIZABLE: 500;
    readonly HANDLER_OUTPUT_REFUSED: 502;
    readonly HANDLER_CRASHED: 500;
    readonly WORKER_FAILED: 500;
    readonly WORKER_JOB_REFUSED: 500;
    readonly CONNECTOR_SOCKET_REFUSED: 500;
    readonly CONTENT_TYPE_REFUSED: 415;
    readonly APPLICATION_NOT_FOUND: 404;
    readonly MEMORY_OBSERVATION_FAILED: 502;
    readonly MEMORY_REFLECTION_FAILED: 502;
    readonly MODEL_LOGIN_OPENAI_REFUSED: 502;
    readonly MODEL_LOGIN_ANTHROPIC_REFUSED: 502;
    readonly MODEL_LOGIN_GOOGLE_REFUSED: 502;
    readonly APPLICATION_NO_ACCESS: 403;
    readonly APPLICATION_EMAIL_NOT_VERIFIED: 403;
    readonly APPLICATION_SIGN_IN_FAILED: 403;
    readonly APPLICATION_NOT_READY: 503;
    readonly APPLICATION_SIGN_IN_REQUIRED: 401;
    readonly PREVIEW_REFUSED: 403;
    readonly NOT_GRANTED: 403;
    readonly CONNECTOR_UNCONFIGURED: 503;
    readonly CREDENTIAL_REFUSED: 502;
    readonly PROVIDER_TIMEOUT: 504;
    readonly PROVIDER_UNAVAILABLE: 503;
    readonly PROVIDER_ERROR: 502;
    readonly RESPONSE_REFUSED: 502;
    readonly CALL_LIMIT: 429;
    readonly SERVICE_REFUSED: 403;
    readonly CONNECTOR_PLATFORM_FAILED: 500;
    readonly CONFIG_MISSING: 500;
    readonly CONFIG_INVALID: 500;
    readonly HUB_ALREADY_RUNNING: 500;
    readonly HUB_SCHEMA_BEHIND: 500;
    readonly BUILDER_RUN_SETTLE_FAILED: 500;
    readonly BUILDER_RUN_SWEEP_SETTLE_FAILED: 500;
    readonly BUILDER_SESSION_RELEASE_FAILED: 500;
    readonly BUILDER_MIRROR_FAILED: 500;
    readonly BUILDER_SESSION_CLOSE_FAILED: 500;
    readonly BUILDER_AGENT_PROCESSES_KILL_FAILED: 500;
    readonly BUILDER_SANDBOX_KILL_FAILED: 500;
    readonly BUILDER_SANDBOX_PAUSE_FAILED: 500;
    readonly BUILDER_SANDBOX_EGRESS_COLLECT_FAILED: 500;
    readonly JOB_FAILED: 500;
    readonly HUB_POOL_ERROR: 500;
    readonly HUB_INSTANCE_LOCK_LOST: 500;
    readonly HUB_SHUTDOWN_FORCED: 500;
    readonly HUB_SHUTDOWN_TIMEOUT: 500;
    readonly HUB_SHUTDOWN_FAILED: 500;
    readonly HUB_FATAL: 500;
    readonly OIDC_BEGIN_FAILED: 500;
    readonly OIDC_REFRESH_TOKEN_MISSING: 500;
    readonly OIDC_CALLBACK_FAILED: 500;
    readonly SECRET_CUSTODY_LOST: 500;
};
export declare const FAILURE_CODES: readonly ["INTERNAL_UNEXPECTED", "NOT_FOUND", "REQUEST_VALIDATION_FAILED", "REQUEST_JSON_INVALID", "REQUEST_BODY_TOO_LARGE", "REQUEST_MEDIA_TYPE_UNSUPPORTED", "AUTHENTICATION_REQUIRED", "REQUEST_AUTHENTICITY_DENIED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT", "OUTCOME_UNKNOWN", "DATABASE_BUSY", "IDENTITY_PROVIDER_UNAVAILABLE", "SIGN_IN_EXPIRED", "SIGN_IN_FAILED", "IDENTITY_EMAIL_NOT_VERIFIED", "IDENTITY_NOT_ELIGIBLE", "ACCOUNT_INACTIVE", "WORKSPACE_NOT_FOUND", "PROJECT_NOT_FOUND", "PROJECT_SOURCE_REFUSED", "PROJECT_REPOSITORY_UNAVAILABLE", "PROJECT_DELETE_DENIED", "PROJECT_DELETING", "PROJECT_NAME_MISMATCH", "PROJECT_BUSY", "PROJECT_DELETION_INCOMPLETE", "PROJECT_THUMBNAIL_NOT_FOUND", "BUILDER_SESSION_UNAVAILABLE", "BUILDER_SANDBOX_OPEN_FAILED", "CONVERSATION_NOT_FOUND", "BUILDER_CAPACITY_FULL", "BUILDER_MESSAGE_REFUSED", "BUILDER_UNAVAILABLE", "BUILDER_RUN_NOT_FOUND", "BUILDER_TRACE_UNAVAILABLE", "PREVIEW_UNAVAILABLE", "PREVIEW_SUBJECT_NOT_FOUND", "PREVIEW_FORM_REFUSED", "SOURCE_REVISION_NOT_FOUND", "SOURCE_FILE_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "REQUEST_CONTEXT_REFUSED", "TOOL_ANSWER_REFUSED", "SESSION_STATE_REFUSED", "BUILDER_SESSION_NOT_FOUND", "CONVERSATION_SESSION_REFUSED", "CONVERSATION_CONFLICT", "BUILDER_BUSY", "BUILDER_RUN_STOP_REFUSED", "TOOL_ANSWER_ALREADY_GIVEN", "QUESTION_ENDED", "APPLICATION_ACCESS_MANAGE_REQUIRED", "APPLICATION_ACCESS_ENTRY_NOT_FOUND", "MEMBERS_MANAGE_REQUIRED", "LAST_OWNER", "ROSTER_ENTRY_NOT_FOUND", "INSTALLATION_ADMINISTRATOR_REQUIRED", "EMAIL_INVALID", "ACCOUNT_NOT_FOUND", "ACCOUNT_EMAIL_AMBIGUOUS", "INSTALLATION_ADMINISTRATOR_NOT_FOUND", "LAST_INSTALLATION_ADMINISTRATOR", "CONNECTOR_CONNECTION_NOT_AVAILABLE", "CONNECTOR_BINDING_CONFLICT", "CONNECTOR_BINDING_MANAGE_REQUIRED", "CONNECTOR_LABEL_REFUSED", "CONNECTOR_CREDENTIAL_REFUSED", "CONNECTOR_CONNECTION_CONFLICT", "CONNECTOR_CONNECTION_NOT_FOUND", "CONNECTOR_BINDING_NOT_FOUND", "MODEL_ACCOUNT_PROVIDER_UNKNOWN", "MODEL_ACCOUNT_KEY_REFUSED", "MODEL_LOGIN_UNAVAILABLE", "MODEL_LOGIN_BUSY", "MODEL_LOGIN_CALLBACK_REFUSED", "MODEL_LOGIN_NOT_FOUND", "HUB_UNREACHABLE", "HUB_RESPONSE_UNREADABLE", "ANTHROPIC_STORED_RECORD_REFUSED", "APPLICATION_ARTIFACT_INPUT_REFUSED", "APPLICATION_CHECK_REPORT_UNREADABLE", "APPLICATION_CHECK_TIMEOUT", "APPLICATION_CHECK_UNREADABLE", "APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED", "APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED", "APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED", "APPLICATION_COMPILER_OUTPUT_PATH_REFUSED", "APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED", "APPLICATION_COMPILER_WORKSPACE_REFUSED", "APPLICATION_ENTRYPOINT_REFUSED", "APPLICATION_FILE_COUNT_REFUSED", "APPLICATION_FILE_DUPLICATE_REFUSED", "APPLICATION_FILE_ENCODING_REFUSED", "APPLICATION_FILE_HASH_REFUSED", "APPLICATION_FILE_ORDER_REFUSED", "APPLICATION_FILE_PATH_REFUSED", "APPLICATION_FILE_SHAPE_REFUSED", "APPLICATION_FILE_SIZE_REFUSED", "APPLICATION_MEDIA_TYPE_REFUSED", "APPLICATION_MIGRATION_FAILED", "APPLICATION_MIGRATION_HISTORY_DIVERGED", "APPLICATION_PAYLOAD_PIN_REFUSED", "APPLICATION_PAYLOAD_REFUSED", "APPLICATION_RUNNER_UNAVAILABLE", "APPLICATION_SERVER_REFUSED", "APPLICATION_SMOKE_FAILED", "APPLICATION_TOTAL_SIZE_REFUSED", "BOOT_BROWSER_UNAVAILABLE", "BUILDER_AGENT_COMPLETION_UNAVAILABLE", "BUILDER_AGENT_PLATFORM_FAILED", "BUILDER_AGENT_STALLED", "BUILDER_AGENT_TRIPWIRE", "BUILDER_APPLICATION_SOURCE_REFUSED", "BUILDER_APP_NOT_FIXED", "BUILDER_CANDIDATE_UNPACK_FAILED", "BUILDER_CHECK_FAILED", "BUILDER_CHECK_IDENTITY_MISMATCH", "BUILDER_CHECK_INSTALL_REFUSED", "BUILDER_CONVERSATIONS_UNAVAILABLE", "BUILDER_GATEWAY_MODEL_REFUSED", "BUILDER_LATE_RESULT_REFUSED", "BUILDER_MESSAGE_ID_UNAVAILABLE", "BUILDER_MODEL_AUTH_FAILED", "BUILDER_MODEL_CONTENT_FILTERED", "BUILDER_MODEL_CONTEXT_LENGTH", "BUILDER_MODEL_INCOMPLETE", "BUILDER_MODEL_NOT_SELECTED", "BUILDER_MODEL_RATE_LIMITED", "BUILDER_MODEL_STEP_TIMEOUT", "BUILDER_MODEL_STREAM_FAILED", "BUILDER_PREVIEW_NOT_BUILT", "BUILDER_RESULT_BUNDLE_TOO_LARGE", "BUILDER_RESULT_CONTENT_TOO_LARGE", "BUILDER_RESULT_MATERIALIZATION_REFUSED", "BUILDER_RUNTIME_INPUT_REFUSED", "BUILDER_RUNTIME_RESULT_SCOPE_REFUSED", "BUILDER_RUN_CANCELLED", "BUILDER_CONVERSATION_SESSION_REFUSED", "BUILDER_RUN_CREATE_FAILED", "BUILDER_RUN_INPUT_REFUSED", "BUILDER_RUN_NOT_ADMITTED", "BUILDER_RUN_TRANSITION_REFUSED", "BUILDER_RUN_PHASE_UPDATE_REFUSED", "BUILDER_SANDBOX_AGENT_USER_REQUIRED", "BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED", "BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT", "BUILDER_SANDBOX_EGRESS_POLL_FAILED", "BUILDER_SANDBOX_EGRESS_START_FAILED", "BUILDER_SANDBOX_FILE_REFUSED", "BUILDER_SANDBOX_ID_UNAVAILABLE", "BUILDER_SANDBOX_INCARNATION_CHANGED", "BUILDER_SANDBOX_KEEPALIVE_FAILED", "BUILDER_SESSION_DELETE_FAILED", "BUILDER_SOURCE_BASE_MOVED", "BUILDER_SOURCE_BASE_PIN_REFUSED", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY", "BUILDER_STARTER_ENTRY_INSPECTION_FAILED", "BUILDER_STARTER_ENTRY_UNSAFE", "BUILDER_STARTER_ROOT_REFUSED", "CONEXUS_APP_ROOT_MISSING", "CONEXUS_GIT_FAILED", "CONEXUS_GIT_MAIN_MISSING", "CONEXUS_GIT_MERGE_REFUSED", "CONEXUS_GIT_PROJECT_REFUSED", "CONEXUS_GIT_REF_MOVED", "CONEXUS_GIT_REF_REFUSED", "CONEXUS_GIT_STARTER_REFUSED", "GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE", "GOOGLE_AI_PRO_BINARY_REFUSED", "GOOGLE_AI_PRO_POOL_CLOSED", "GOOGLE_AI_PRO_PORT_UNAVAILABLE", "GOOGLE_AI_PRO_PROXY_START_FAILED", "GOOGLE_AI_PRO_RECORD_REFUSED", "GOOGLE_AI_PRO_ROUTER_UNAVAILABLE", "GOOGLE_AI_PRO_STORED_RECORD_REFUSED", "HUB_RESTART", "MANIFEST_REFUSED", "MODEL_ACCOUNT_PROBE_NOT_CALLABLE", "OPENAI_CODEX_MODEL_REFUSED", "OPENAI_CODEX_STORED_RECORD_REFUSED", "SERVER_TREE_REFUSED", "USER_CANCELLED", "BUILDER_QUESTION_EXPIRED", "BUILDER_QUESTION_NOT_RELEASED", "BUILDER_SOURCE_ADMISSION_FAILED", "BUILDER_RUN_SETTLE_LOST", "APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED", "APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED", "APPLICATION_RUNNER_RELEASE_REFUSED", "RUNNER_REQUEST_REFUSED", "INPUT_REFUSED", "INPUT_TOO_LARGE", "OPERATION_NOT_FOUND", "HANDLER_TIMEOUT", "RESPONSE_TOO_LARGE", "DATABASE_UNAVAILABLE", "APPLICATION_RUNNER_BUSY", "APPLICATION_PROJECT_BUSY", "SERVER_TREE_TOO_LARGE", "HANDLER_FAILED", "HANDLER_LOAD_FAILED", "HANDLER_EXPORT_MISSING", "HANDLER_OUTPUT_UNSERIALIZABLE", "HANDLER_OUTPUT_REFUSED", "HANDLER_CRASHED", "WORKER_FAILED", "WORKER_JOB_REFUSED", "CONNECTOR_SOCKET_REFUSED", "CONTENT_TYPE_REFUSED", "APPLICATION_NOT_FOUND", "MEMORY_OBSERVATION_FAILED", "MEMORY_REFLECTION_FAILED", "MODEL_LOGIN_OPENAI_REFUSED", "MODEL_LOGIN_ANTHROPIC_REFUSED", "MODEL_LOGIN_GOOGLE_REFUSED", "APPLICATION_NO_ACCESS", "APPLICATION_EMAIL_NOT_VERIFIED", "APPLICATION_SIGN_IN_FAILED", "APPLICATION_NOT_READY", "APPLICATION_SIGN_IN_REQUIRED", "PREVIEW_REFUSED", "NOT_GRANTED", "CONNECTOR_UNCONFIGURED", "CREDENTIAL_REFUSED", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "RESPONSE_REFUSED", "CALL_LIMIT", "SERVICE_REFUSED", "CONNECTOR_PLATFORM_FAILED", "CONFIG_MISSING", "CONFIG_INVALID", "HUB_ALREADY_RUNNING", "HUB_SCHEMA_BEHIND", "BUILDER_RUN_SETTLE_FAILED", "BUILDER_RUN_SWEEP_SETTLE_FAILED", "BUILDER_SESSION_RELEASE_FAILED", "BUILDER_MIRROR_FAILED", "BUILDER_SESSION_CLOSE_FAILED", "BUILDER_AGENT_PROCESSES_KILL_FAILED", "BUILDER_SANDBOX_KILL_FAILED", "BUILDER_SANDBOX_PAUSE_FAILED", "BUILDER_SANDBOX_EGRESS_COLLECT_FAILED", "JOB_FAILED", "HUB_POOL_ERROR", "HUB_INSTANCE_LOCK_LOST", "HUB_SHUTDOWN_FORCED", "HUB_SHUTDOWN_TIMEOUT", "HUB_SHUTDOWN_FAILED", "HUB_FATAL", "OIDC_BEGIN_FAILED", "OIDC_REFRESH_TOKEN_MISSING", "OIDC_CALLBACK_FAILED", "SECRET_CUSTODY_LOST"];
export type FailureCode = (typeof FAILURE_CODES)[number];
export type FailureCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY';
export declare const FAILURE_ACTIONS: {
    readonly NONE: null;
    readonly SIGN_IN: "Entre na sua conta para continuar.";
    readonly CONNECT_MODEL_ACCOUNT: "Conecte uma conta de modelo em Configurações.";
    readonly ASK_ADMIN: "Peça a quem administra o Conexus.";
    readonly ASK_CHANGE: "Peça a quem pode alterar isso.";
    readonly CHOOSE_OTHER_MODEL: "Escolha outro modelo.";
    readonly FIX_IN_CONVERSATION: "Peça o ajuste ao Builder, na conversa.";
    readonly RETRY_LATER: "Tente novamente mais tarde.";
    readonly SIGN_IN_AGAIN: "Entre de novo.";
    readonly CONFIRM_EMAIL: "Confirme o e-mail no seu provedor de login e entre de novo.";
    readonly ASK_INVITE: "Peça um convite a quem cuida do seu Workspace, com este mesmo e-mail.";
};
export type FailureAction = keyof typeof FAILURE_ACTIONS;
export declare const FAILURES: {
    readonly INTERNAL_UNEXPECTED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos o que você procurou.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly REQUEST_VALIDATION_FAILED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Alguns dados do pedido não são válidos.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly REQUEST_JSON_INVALID: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O pedido chegou ao Conexus ilegível.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly REQUEST_BODY_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O pedido é maior do que o Conexus aceita.";
        readonly action: "NONE";
        readonly status: 413;
    };
    readonly REQUEST_MEDIA_TYPE_UNSUPPORTED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceita esse formato de pedido.";
        readonly action: "NONE";
        readonly status: 415;
    };
    readonly AUTHENTICATION_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você precisa entrar para continuar.";
        readonly action: "SIGN_IN";
        readonly status: 401;
    };
    readonly REQUEST_AUTHENTICITY_DENIED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu confirmar que o pedido veio de você. Recarregue a página.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly IDEMPOTENCY_KEY_REQUIRED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O pedido saiu sem o identificador que o Conexus exige. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly IDEMPOTENCY_CONFLICT: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Já existe um pedido igual a este, com dados diferentes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly OUTCOME_UNKNOWN: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu confirmar se o pedido anterior terminou. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly DATABASE_BUSY: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus está ocupado e não terminou o pedido. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly IDENTITY_PROVIDER_UNAVAILABLE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person+app";
        readonly message: "O serviço de login não respondeu agora. Sua sessão continua aberta.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly SIGN_IN_EXPIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O login demorou demais ou foi aberto em outra aba.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 401;
    };
    readonly SIGN_IN_FAILED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O serviço de login não concluiu a entrada.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 502;
    };
    readonly IDENTITY_EMAIL_NOT_VERIFIED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O seu provedor de login informou que o e-mail desta conta ainda não foi verificado.";
        readonly action: "CONFIRM_EMAIL";
        readonly status: 403;
    };
    readonly IDENTITY_NOT_ELIGIBLE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você entrou, mas ninguém convidou este e-mail para o Conexus.";
        readonly action: "ASK_INVITE";
        readonly status: 403;
    };
    readonly ACCOUNT_INACTIVE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esta conta foi desativada no Conexus.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly WORKSPACE_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos esse Workspace.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PROJECT_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos esse Projeto.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PROJECT_SOURCE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceitou o código inicial deste Projeto.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly PROJECT_REPOSITORY_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar o repositório do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_DELETE_DENIED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Só uma pessoa proprietária do Workspace pode excluir este Projeto.";
        readonly action: "ASK_CHANGE";
        readonly status: 403;
    };
    readonly PROJECT_DELETING: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Este Projeto está sendo excluído.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly PROJECT_NAME_MISMATCH: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O nome digitado não é o nome do Projeto. Digite exatamente como aparece.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly PROJECT_BUSY: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Projeto está processando um pedido agora. Espere terminar.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly PROJECT_DELETION_INCOMPLETE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "A exclusão do Projeto não terminou. O que já foi apagado não volta atrás. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_THUMBNAIL_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Este Projeto ainda não tem miniatura.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_SESSION_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu abrir a sessão do Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly BUILDER_SANDBOX_OPEN_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O ambiente de código não abriu. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly CONVERSATION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa conversa.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_CAPACITY_FULL: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus está com muitas execuções abertas agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly BUILDER_MESSAGE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceitou essa mensagem.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly BUILDER_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Builder não está disponível agora. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly BUILDER_RUN_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa execução.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_TRACE_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu carregar o detalhe da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PREVIEW_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu abrir a Prévia. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PREVIEW_SUBJECT_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos o que a Prévia mostraria.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PREVIEW_FORM_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "A Prévia não aceitou esse formulário.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly SOURCE_REVISION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa versão do código.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly SOURCE_FILE_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos esse arquivo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_SOURCE_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly REQUEST_CONTEXT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O pedido trouxe um contexto que só o Conexus pode definir.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly TOOL_ANSWER_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Só é possível aprovar ou recusar uma ação pendente do agente.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly SESSION_STATE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Só o nível de raciocínio pode ser alterado aqui.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly BUILDER_SESSION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa sessão do Builder.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONVERSATION_SESSION_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "A sessão de uma conversa só abre na própria conversa.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly CONVERSATION_CONFLICT: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esse identificador de conversa já está em uso.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly BUILDER_BUSY: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O modelo só muda quando o Builder está parado.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly BUILDER_RUN_STOP_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Uma execução só para pelo botão de parar.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly TOOL_ANSWER_ALREADY_GIVEN: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esta pergunta já foi respondida.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly QUESTION_ENDED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esta pergunta já foi encerrada. A resposta pode ir na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly APPLICATION_ACCESS_MANAGE_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você não tem permissão para gerenciar quem acessa este aplicativo.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly APPLICATION_ACCESS_ENTRY_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos esse acesso ao aplicativo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MEMBERS_MANAGE_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você não tem permissão para gerenciar as pessoas deste Workspace.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly LAST_OWNER: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Workspace ficaria sem dono. Torne outra pessoa dona antes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly ROSTER_ENTRY_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa pessoa na lista.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly INSTALLATION_ADMINISTRATOR_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Só quem administra o Conexus pode fazer isso.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly EMAIL_INVALID: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esse e-mail não é válido.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly ACCOUNT_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Nenhuma conta ativa usa este e-mail. A pessoa precisa entrar no Conexus uma vez antes.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly ACCOUNT_EMAIL_AMBIGUOUS: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Mais de uma conta usa este e-mail. Fale com quem opera o Conexus.";
        readonly action: "ASK_ADMIN";
        readonly status: 409;
    };
    readonly INSTALLATION_ADMINISTRATOR_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Essa pessoa não administra o Conexus.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly LAST_INSTALLATION_ADMINISTRATOR: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não é possível revogar o último administrador. Torne outra pessoa administradora antes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_CONNECTION_NOT_AVAILABLE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Esta conexão não está disponível para o Projeto.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONNECTOR_BINDING_CONFLICT: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Este nome já está em uso neste Projeto, ou esta conexão já está vinculada com outro nome.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_BINDING_MANAGE_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você não tem permissão para gerenciar as conexões deste Projeto.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly CONNECTOR_LABEL_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceitou esse nome para a conexão.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly CONNECTOR_CREDENTIAL_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceitou essas credenciais.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly CONNECTOR_CONNECTION_CONFLICT: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Já existe uma conexão com esses dados.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_CONNECTION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa conexão.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONNECTOR_BINDING_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa ligação do Projeto com a conexão.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MODEL_ACCOUNT_PROVIDER_UNKNOWN: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Este provedor não aceita chave de API.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MODEL_ACCOUNT_KEY_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Essa não é uma chave de API deste provedor.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly MODEL_LOGIN_UNAVAILABLE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "A entrada na conta do modelo não está disponível agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly MODEL_LOGIN_BUSY: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Outra entrada na conta do modelo está em andamento.";
        readonly action: "RETRY_LATER";
        readonly status: 409;
    };
    readonly MODEL_LOGIN_CALLBACK_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não aceitou esse endereço de retorno da entrada.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly MODEL_LOGIN_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Não encontramos essa entrada na conta do modelo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly HUB_UNREACHABLE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "A tela não conseguiu falar com o Conexus agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly HUB_RESPONSE_UNREADABLE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "A resposta que chegou à tela não veio do Conexus.";
        readonly action: "RETRY_LATER";
        readonly status: 502;
    };
    readonly ANTHROPIC_STORED_RECORD_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly APPLICATION_ARTIFACT_INPUT_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu guardar o aplicativo compilado. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_REPORT_UNREADABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_TIMEOUT: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_UNREADABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_PATH_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_WORKSPACE_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_ENTRYPOINT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_COUNT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_DUPLICATE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_ENCODING_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_HASH_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_ORDER_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_PATH_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_SHAPE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_SIZE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MEDIA_TYPE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MIGRATION_FAILED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "A mudança nos dados do aplicativo não foi aplicada.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MIGRATION_HISTORY_DIVERGED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "As mudanças nos dados do aplicativo não batem com as que já foram aplicadas.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_PAYLOAD_PIN_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_PAYLOAD_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_RUNNER_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_SERVER_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_SMOKE_FAILED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo compilou, mas não abriu na checagem do Conexus.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_TOTAL_SIZE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly BOOT_BROWSER_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_COMPLETION_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Builder terminou sem entregar uma resposta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_PLATFORM_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "Uma falha do Conexus, e não do modelo, interrompeu a execução. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_STALLED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O agente parou de responder por uma falha do Conexus, e não do modelo, então a execução foi encerrada. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_TRIPWIRE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "Um controle interno do Builder encerrou a execução. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_APPLICATION_SOURCE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly BUILDER_APP_NOT_FIXED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O agente tentou corrigir o app e a verificação do Conexus ainda falha. O que quebrou está na conversa, acima. A versão em uso não mudou, e os arquivos ficaram nesta conversa para o próximo pedido.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CANDIDATE_UNPACK_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_FAILED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código novo quebrou as regras do próprio Projeto, então foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_IDENTITY_MISMATCH: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_INSTALL_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CONVERSATIONS_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus falhou ao executar o Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_GATEWAY_MODEL_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor não aceita esse modelo.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_LATE_RESULT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_MESSAGE_ID_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Builder terminou sem entregar uma resposta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_AUTH_FAILED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Nenhuma conta sua ou compartilhada atende este modelo, ou o provedor a recusou.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_CONTENT_FILTERED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor do modelo bloqueou a resposta.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_CONTEXT_LENGTH: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "A conversa ficou maior do que o modelo aceita.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_INCOMPLETE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor do modelo recusou ou interrompeu o pedido.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_NOT_SELECTED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Nenhuma conta sua ou compartilhada atende este modelo, ou o provedor a recusou.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_RATE_LIMITED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor do modelo está limitando os pedidos.";
        readonly action: "RETRY_LATER";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_STEP_TIMEOUT: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O modelo passou tempo demais gerando uma única resposta, então o Conexus encerrou a execução. As alterações desta execução não foram aplicadas.";
        readonly action: "RETRY_LATER";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_STREAM_FAILED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor do modelo recusou ou interrompeu o pedido.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_PREVIEW_NOT_BUILT: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O código novo foi aceito, mas o Conexus reiniciou antes de gerar a Prévia. A última Prévia boa continua disponível. O reinício foi registrado.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_BUNDLE_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_CONTENT_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_MATERIALIZATION_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUNTIME_INPUT_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUNTIME_RESULT_SCOPE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_CANCELLED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CONVERSATION_SESSION_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o estado da conversa. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_CREATE_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_INPUT_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_NOT_ADMITTED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_TRANSITION_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_PHASE_UPDATE_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_AGENT_USER_REQUIRED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_POLL_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_START_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_FILE_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_ID_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_INCARNATION_CHANGED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_KEEPALIVE_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SESSION_DELETE_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_BASE_MOVED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O código do Projeto mudou enquanto esta execução trabalhava, então o resultado não foi aplicado e nada foi sobrescrito.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_BASE_PIN_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_TREE_TOO_LARGE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_UNSAFE_ENTRY: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ENTRY_INSPECTION_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ENTRY_UNSAFE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ROOT_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_APP_ROOT_MISSING: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_MAIN_MISSING: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_MERGE_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_PROJECT_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_REF_MOVED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_REF_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_STARTER_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_BINARY_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_POOL_CLOSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_PORT_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_PROXY_START_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_RECORD_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_ROUTER_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_STORED_RECORD_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly HUB_RESTART: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus reiniciou durante a execução. O reinício foi registrado.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly MANIFEST_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O servidor do aplicativo tem uma definição que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly MODEL_ACCOUNT_PROBE_NOT_CALLABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus falhou ao executar o Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly OPENAI_CODEX_MODEL_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O provedor não aceita esse modelo.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly OPENAI_CODEX_STORED_RECORD_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly SERVER_TREE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O servidor do aplicativo tem arquivos que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly USER_CANCELLED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_QUESTION_EXPIRED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "A pergunta ficou sem resposta e foi encerrada. A sua próxima mensagem continua o trabalho.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_QUESTION_NOT_RELEASED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Builder não conseguiu encerrar a pergunta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_ADMISSION_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "A mudança não entrou no app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_SETTLE_LOST: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus perdeu o fim deste trabalho. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_RUNNER_RELEASE_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person";
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly INPUT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Algum campo tem um valor que o app não aceita.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly INPUT_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Os dados enviados são grandes demais.";
        readonly action: "NONE";
        readonly status: 413;
    };
    readonly OPERATION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Essa operação não existe neste app.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly HANDLER_TIMEOUT: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "A operação demorou mais que o permitido.";
        readonly action: "RETRY_LATER";
        readonly status: 504;
    };
    readonly RESPONSE_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Há resultados demais para mostrar. Use um filtro para reduzir a lista.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly DATABASE_UNAVAILABLE: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "Os dados salvos do app estão indisponíveis. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_RUNNER_BUSY: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "O app está ocupado com outros pedidos agora.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly APPLICATION_PROJECT_BUSY: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Este app já tem pedidos demais em andamento.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly SERVER_TREE_TOO_LARGE: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 413;
    };
    readonly HANDLER_FAILED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_LOAD_FAILED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_EXPORT_MISSING: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_OUTPUT_UNSERIALIZABLE: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_OUTPUT_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly HANDLER_CRASHED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly WORKER_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly WORKER_JOB_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONNECTOR_SOCKET_REFUSED: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONTENT_TYPE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "O Conexus não aceitou o formato deste pedido.";
        readonly action: "NONE";
        readonly status: 415;
    };
    readonly APPLICATION_NOT_FOUND: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Não encontramos este app.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MEMORY_OBSERVATION_FAILED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "Não foi possível guardar as mensagens na memória. O Builder refaz isso na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MEMORY_REFLECTION_FAILED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "Não foi possível resumir as observações. O Builder refaz isso na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_OPENAI_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "A OpenAI recusou a entrada.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_ANTHROPIC_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "A Anthropic recusou esse código. Pode ser que ele não tenha sido copiado inteiro.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_GOOGLE_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person";
        readonly message: "O Google recusou a entrada.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly APPLICATION_NO_ACCESS: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você não tem acesso a este aplicativo.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly APPLICATION_EMAIL_NOT_VERIFIED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "Você não tem acesso a este aplicativo porque seu e-mail ainda não foi verificado.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly APPLICATION_SIGN_IN_FAILED: {
        readonly category: "USER";
        readonly audience: "person";
        readonly message: "O serviço de login não concluiu a entrada.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 403;
    };
    readonly APPLICATION_NOT_READY: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Este app ainda não está pronto para receber pedidos.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_SIGN_IN_REQUIRED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Você precisa entrar no Conexus para usar este app.";
        readonly action: "SIGN_IN";
        readonly status: 401;
    };
    readonly PREVIEW_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta prévia não aceita o pedido.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly NOT_GRANTED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Este app perdeu o acesso ao sistema da empresa. Quem administra o Workspace precisa vincular a Conexão outra vez.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly CONNECTOR_UNCONFIGURED: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "A integração com o sistema da empresa não está configurada. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly CREDENTIAL_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "O sistema da empresa recusou o acesso. Avise quem administra a integração.";
        readonly action: "ASK_ADMIN";
        readonly status: 502;
    };
    readonly PROVIDER_TIMEOUT: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person+app";
        readonly message: "O sistema da empresa não respondeu a tempo.";
        readonly action: "RETRY_LATER";
        readonly status: 504;
    };
    readonly PROVIDER_UNAVAILABLE: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person+app";
        readonly message: "O sistema da empresa está indisponível agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly PROVIDER_ERROR: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person+app";
        readonly message: "O sistema da empresa respondeu com um erro.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly RESPONSE_REFUSED: {
        readonly category: "THIRD_PARTY";
        readonly audience: "person+app";
        readonly message: "O Conexus não aceitou a resposta do sistema da empresa.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly CALL_LIMIT: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Este app fez chamadas demais ao sistema da empresa.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly SERVICE_REFUSED: {
        readonly category: "USER";
        readonly audience: "person+app";
        readonly message: "Esta operação não é permitida pela conexão com o sistema da empresa.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly CONNECTOR_PLATFORM_FAILED: {
        readonly category: "SYSTEM";
        readonly audience: "person+app";
        readonly message: "O Conexus falhou ao ler o sistema da empresa. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
};
export declare const APP_FAILURE_CLIENT_SOURCE = "// Generated by Conexus from @conexus/contract failure-client and Problem. Never edit.\nexport const FAILURE_STATUS = {\n  'INTERNAL_UNEXPECTED': 500, 'NOT_FOUND': 404, 'REQUEST_VALIDATION_FAILED': 400, 'REQUEST_JSON_INVALID': 400,\n  'REQUEST_BODY_TOO_LARGE': 413, 'REQUEST_MEDIA_TYPE_UNSUPPORTED': 415, 'AUTHENTICATION_REQUIRED': 401, 'REQUEST_AUTHENTICITY_DENIED': 403,\n  'IDEMPOTENCY_KEY_REQUIRED': 400, 'IDEMPOTENCY_CONFLICT': 409, 'OUTCOME_UNKNOWN': 409, 'DATABASE_BUSY': 503,\n  'IDENTITY_PROVIDER_UNAVAILABLE': 503, 'SIGN_IN_EXPIRED': 401, 'SIGN_IN_FAILED': 502, 'IDENTITY_EMAIL_NOT_VERIFIED': 403,\n  'IDENTITY_NOT_ELIGIBLE': 403, 'ACCOUNT_INACTIVE': 403, 'WORKSPACE_NOT_FOUND': 404, 'PROJECT_NOT_FOUND': 404,\n  'PROJECT_SOURCE_REFUSED': 422, 'PROJECT_REPOSITORY_UNAVAILABLE': 503, 'PROJECT_DELETE_DENIED': 403, 'PROJECT_DELETING': 409,\n  'PROJECT_NAME_MISMATCH': 409, 'PROJECT_BUSY': 409, 'PROJECT_DELETION_INCOMPLETE': 503, 'PROJECT_THUMBNAIL_NOT_FOUND': 404,\n  'BUILDER_SESSION_UNAVAILABLE': 503, 'BUILDER_SANDBOX_OPEN_FAILED': 503, 'CONVERSATION_NOT_FOUND': 404, 'BUILDER_CAPACITY_FULL': 503,\n  'BUILDER_MESSAGE_REFUSED': 422, 'BUILDER_UNAVAILABLE': 503, 'BUILDER_RUN_NOT_FOUND': 404, 'BUILDER_TRACE_UNAVAILABLE': 503,\n  'PREVIEW_UNAVAILABLE': 503, 'PREVIEW_SUBJECT_NOT_FOUND': 404, 'PREVIEW_FORM_REFUSED': 400, 'SOURCE_REVISION_NOT_FOUND': 404,\n  'SOURCE_FILE_NOT_FOUND': 404, 'BUILDER_SOURCE_UNAVAILABLE': 503, 'REQUEST_CONTEXT_REFUSED': 400, 'TOOL_ANSWER_REFUSED': 400,\n  'SESSION_STATE_REFUSED': 400, 'BUILDER_SESSION_NOT_FOUND': 404, 'CONVERSATION_SESSION_REFUSED': 400, 'CONVERSATION_CONFLICT': 409,\n  'BUILDER_BUSY': 409, 'BUILDER_RUN_STOP_REFUSED': 409, 'TOOL_ANSWER_ALREADY_GIVEN': 409, 'QUESTION_ENDED': 409,\n  'APPLICATION_ACCESS_MANAGE_REQUIRED': 403, 'APPLICATION_ACCESS_ENTRY_NOT_FOUND': 404, 'MEMBERS_MANAGE_REQUIRED': 403, 'LAST_OWNER': 409,\n  'ROSTER_ENTRY_NOT_FOUND': 404, 'INSTALLATION_ADMINISTRATOR_REQUIRED': 403, 'EMAIL_INVALID': 400, 'ACCOUNT_NOT_FOUND': 404,\n  'ACCOUNT_EMAIL_AMBIGUOUS': 409, 'INSTALLATION_ADMINISTRATOR_NOT_FOUND': 404, 'LAST_INSTALLATION_ADMINISTRATOR': 409, 'CONNECTOR_CONNECTION_NOT_AVAILABLE': 404,\n  'CONNECTOR_BINDING_CONFLICT': 409, 'CONNECTOR_BINDING_MANAGE_REQUIRED': 403, 'CONNECTOR_LABEL_REFUSED': 422, 'CONNECTOR_CREDENTIAL_REFUSED': 422,\n  'CONNECTOR_CONNECTION_CONFLICT': 409, 'CONNECTOR_CONNECTION_NOT_FOUND': 404, 'CONNECTOR_BINDING_NOT_FOUND': 404, 'MODEL_ACCOUNT_PROVIDER_UNKNOWN': 404,\n  'MODEL_ACCOUNT_KEY_REFUSED': 400, 'MODEL_LOGIN_UNAVAILABLE': 503, 'MODEL_LOGIN_BUSY': 409, 'MODEL_LOGIN_CALLBACK_REFUSED': 400,\n  'MODEL_LOGIN_NOT_FOUND': 404, 'HUB_UNREACHABLE': 503, 'HUB_RESPONSE_UNREADABLE': 502, 'ANTHROPIC_STORED_RECORD_REFUSED': 500,\n  'APPLICATION_ARTIFACT_INPUT_REFUSED': 500, 'APPLICATION_CHECK_REPORT_UNREADABLE': 500, 'APPLICATION_CHECK_TIMEOUT': 500, 'APPLICATION_CHECK_UNREADABLE': 500,\n  'APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED': 500, 'APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED': 500, 'APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED': 500, 'APPLICATION_COMPILER_OUTPUT_PATH_REFUSED': 500,\n  'APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED': 500, 'APPLICATION_COMPILER_WORKSPACE_REFUSED': 500, 'APPLICATION_ENTRYPOINT_REFUSED': 500, 'APPLICATION_FILE_COUNT_REFUSED': 500,\n  'APPLICATION_FILE_DUPLICATE_REFUSED': 500, 'APPLICATION_FILE_ENCODING_REFUSED': 500, 'APPLICATION_FILE_HASH_REFUSED': 500, 'APPLICATION_FILE_ORDER_REFUSED': 500,\n  'APPLICATION_FILE_PATH_REFUSED': 500, 'APPLICATION_FILE_SHAPE_REFUSED': 500, 'APPLICATION_FILE_SIZE_REFUSED': 500, 'APPLICATION_MEDIA_TYPE_REFUSED': 500,\n  'APPLICATION_MIGRATION_FAILED': 500, 'APPLICATION_MIGRATION_HISTORY_DIVERGED': 500, 'APPLICATION_PAYLOAD_PIN_REFUSED': 500, 'APPLICATION_PAYLOAD_REFUSED': 500,\n  'APPLICATION_RUNNER_UNAVAILABLE': 503, 'APPLICATION_SERVER_REFUSED': 500, 'APPLICATION_SMOKE_FAILED': 500, 'APPLICATION_TOTAL_SIZE_REFUSED': 500,\n  'BOOT_BROWSER_UNAVAILABLE': 500, 'BUILDER_AGENT_COMPLETION_UNAVAILABLE': 500, 'BUILDER_AGENT_PLATFORM_FAILED': 500, 'BUILDER_AGENT_STALLED': 500,\n  'BUILDER_AGENT_TRIPWIRE': 500, 'BUILDER_APPLICATION_SOURCE_REFUSED': 500, 'BUILDER_APP_NOT_FIXED': 500, 'BUILDER_CANDIDATE_UNPACK_FAILED': 500,\n  'BUILDER_CHECK_FAILED': 500, 'BUILDER_CHECK_IDENTITY_MISMATCH': 500, 'BUILDER_CHECK_INSTALL_REFUSED': 500, 'BUILDER_CONVERSATIONS_UNAVAILABLE': 500,\n  'BUILDER_GATEWAY_MODEL_REFUSED': 500, 'BUILDER_LATE_RESULT_REFUSED': 500, 'BUILDER_MESSAGE_ID_UNAVAILABLE': 500, 'BUILDER_MODEL_AUTH_FAILED': 500,\n  'BUILDER_MODEL_CONTENT_FILTERED': 500, 'BUILDER_MODEL_CONTEXT_LENGTH': 500, 'BUILDER_MODEL_INCOMPLETE': 500, 'BUILDER_MODEL_NOT_SELECTED': 500,\n  'BUILDER_MODEL_RATE_LIMITED': 500, 'BUILDER_MODEL_STEP_TIMEOUT': 500, 'BUILDER_MODEL_STREAM_FAILED': 500, 'BUILDER_PREVIEW_NOT_BUILT': 500,\n  'BUILDER_RESULT_BUNDLE_TOO_LARGE': 500, 'BUILDER_RESULT_CONTENT_TOO_LARGE': 500, 'BUILDER_RESULT_MATERIALIZATION_REFUSED': 500, 'BUILDER_RUNTIME_INPUT_REFUSED': 500,\n  'BUILDER_RUNTIME_RESULT_SCOPE_REFUSED': 500, 'BUILDER_RUN_CANCELLED': 500, 'BUILDER_CONVERSATION_SESSION_REFUSED': 500, 'BUILDER_RUN_CREATE_FAILED': 500,\n  'BUILDER_RUN_INPUT_REFUSED': 500, 'BUILDER_RUN_NOT_ADMITTED': 500, 'BUILDER_RUN_TRANSITION_REFUSED': 500, 'BUILDER_RUN_PHASE_UPDATE_REFUSED': 500,\n  'BUILDER_SANDBOX_AGENT_USER_REQUIRED': 500, 'BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED': 500, 'BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT': 500, 'BUILDER_SANDBOX_EGRESS_POLL_FAILED': 500,\n  'BUILDER_SANDBOX_EGRESS_START_FAILED': 500, 'BUILDER_SANDBOX_FILE_REFUSED': 500, 'BUILDER_SANDBOX_ID_UNAVAILABLE': 500, 'BUILDER_SANDBOX_INCARNATION_CHANGED': 500,\n  'BUILDER_SANDBOX_KEEPALIVE_FAILED': 500, 'BUILDER_SESSION_DELETE_FAILED': 500, 'BUILDER_SOURCE_BASE_MOVED': 500, 'BUILDER_SOURCE_BASE_PIN_REFUSED': 500,\n  'BUILDER_SOURCE_READ_REFUSED': 500, 'BUILDER_SOURCE_READ_TREE_TOO_LARGE': 500, 'BUILDER_SOURCE_READ_UNSAFE_ENTRY': 500, 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED': 500,\n  'BUILDER_STARTER_ENTRY_UNSAFE': 500, 'BUILDER_STARTER_ROOT_REFUSED': 500, 'CONEXUS_APP_ROOT_MISSING': 500, 'CONEXUS_GIT_FAILED': 500,\n  'CONEXUS_GIT_MAIN_MISSING': 500, 'CONEXUS_GIT_MERGE_REFUSED': 500, 'CONEXUS_GIT_PROJECT_REFUSED': 500, 'CONEXUS_GIT_REF_MOVED': 500,\n  'CONEXUS_GIT_REF_REFUSED': 500, 'CONEXUS_GIT_STARTER_REFUSED': 500, 'GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE': 500, 'GOOGLE_AI_PRO_BINARY_REFUSED': 500,\n  'GOOGLE_AI_PRO_POOL_CLOSED': 500, 'GOOGLE_AI_PRO_PORT_UNAVAILABLE': 500, 'GOOGLE_AI_PRO_PROXY_START_FAILED': 500, 'GOOGLE_AI_PRO_RECORD_REFUSED': 500,\n  'GOOGLE_AI_PRO_ROUTER_UNAVAILABLE': 500, 'GOOGLE_AI_PRO_STORED_RECORD_REFUSED': 500, 'HUB_RESTART': 500, 'MANIFEST_REFUSED': 500,\n  'MODEL_ACCOUNT_PROBE_NOT_CALLABLE': 500, 'OPENAI_CODEX_MODEL_REFUSED': 500, 'OPENAI_CODEX_STORED_RECORD_REFUSED': 500, 'SERVER_TREE_REFUSED': 500,\n  'USER_CANCELLED': 500, 'BUILDER_QUESTION_EXPIRED': 500, 'BUILDER_QUESTION_NOT_RELEASED': 500, 'BUILDER_SOURCE_ADMISSION_FAILED': 500,\n  'BUILDER_RUN_SETTLE_LOST': 500, 'APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED': 500, 'APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED': 500, 'APPLICATION_RUNNER_RELEASE_REFUSED': 500,\n  'RUNNER_REQUEST_REFUSED': 400, 'INPUT_REFUSED': 400, 'INPUT_TOO_LARGE': 413, 'OPERATION_NOT_FOUND': 404,\n  'HANDLER_TIMEOUT': 504, 'RESPONSE_TOO_LARGE': 502, 'DATABASE_UNAVAILABLE': 503, 'APPLICATION_RUNNER_BUSY': 429,\n  'APPLICATION_PROJECT_BUSY': 429, 'SERVER_TREE_TOO_LARGE': 413, 'HANDLER_FAILED': 500, 'HANDLER_LOAD_FAILED': 500,\n  'HANDLER_EXPORT_MISSING': 500, 'HANDLER_OUTPUT_UNSERIALIZABLE': 500, 'HANDLER_OUTPUT_REFUSED': 502, 'HANDLER_CRASHED': 500,\n  'WORKER_FAILED': 500, 'WORKER_JOB_REFUSED': 500, 'CONNECTOR_SOCKET_REFUSED': 500, 'CONTENT_TYPE_REFUSED': 415,\n  'APPLICATION_NOT_FOUND': 404, 'MEMORY_OBSERVATION_FAILED': 502, 'MEMORY_REFLECTION_FAILED': 502, 'MODEL_LOGIN_OPENAI_REFUSED': 502,\n  'MODEL_LOGIN_ANTHROPIC_REFUSED': 502, 'MODEL_LOGIN_GOOGLE_REFUSED': 502, 'APPLICATION_NO_ACCESS': 403, 'APPLICATION_EMAIL_NOT_VERIFIED': 403,\n  'APPLICATION_SIGN_IN_FAILED': 403, 'APPLICATION_NOT_READY': 503, 'APPLICATION_SIGN_IN_REQUIRED': 401, 'PREVIEW_REFUSED': 403,\n  'NOT_GRANTED': 403, 'CONNECTOR_UNCONFIGURED': 503, 'CREDENTIAL_REFUSED': 502, 'PROVIDER_TIMEOUT': 504,\n  'PROVIDER_UNAVAILABLE': 503, 'PROVIDER_ERROR': 502, 'RESPONSE_REFUSED': 502, 'CALL_LIMIT': 429,\n  'SERVICE_REFUSED': 403, 'CONNECTOR_PLATFORM_FAILED': 500, 'CONFIG_MISSING': 500, 'CONFIG_INVALID': 500,\n  'HUB_ALREADY_RUNNING': 500, 'HUB_SCHEMA_BEHIND': 500, 'BUILDER_RUN_SETTLE_FAILED': 500, 'BUILDER_RUN_SWEEP_SETTLE_FAILED': 500,\n  'BUILDER_SESSION_RELEASE_FAILED': 500, 'BUILDER_MIRROR_FAILED': 500, 'BUILDER_SESSION_CLOSE_FAILED': 500, 'BUILDER_AGENT_PROCESSES_KILL_FAILED': 500,\n  'BUILDER_SANDBOX_KILL_FAILED': 500, 'BUILDER_SANDBOX_PAUSE_FAILED': 500, 'BUILDER_SANDBOX_EGRESS_COLLECT_FAILED': 500, 'JOB_FAILED': 500,\n  'HUB_POOL_ERROR': 500, 'HUB_INSTANCE_LOCK_LOST': 500, 'HUB_SHUTDOWN_FORCED': 500, 'HUB_SHUTDOWN_TIMEOUT': 500,\n  'HUB_SHUTDOWN_FAILED': 500, 'HUB_FATAL': 500, 'OIDC_BEGIN_FAILED': 500, 'OIDC_REFRESH_TOKEN_MISSING': 500,\n  'OIDC_CALLBACK_FAILED': 500, 'SECRET_CUSTODY_LOST': 500,\n} as const\n\nexport const FAILURE_CODES = [\n  'INTERNAL_UNEXPECTED', 'NOT_FOUND', 'REQUEST_VALIDATION_FAILED', 'REQUEST_JSON_INVALID',\n  'REQUEST_BODY_TOO_LARGE', 'REQUEST_MEDIA_TYPE_UNSUPPORTED', 'AUTHENTICATION_REQUIRED', 'REQUEST_AUTHENTICITY_DENIED',\n  'IDEMPOTENCY_KEY_REQUIRED', 'IDEMPOTENCY_CONFLICT', 'OUTCOME_UNKNOWN', 'DATABASE_BUSY',\n  'IDENTITY_PROVIDER_UNAVAILABLE', 'SIGN_IN_EXPIRED', 'SIGN_IN_FAILED', 'IDENTITY_EMAIL_NOT_VERIFIED',\n  'IDENTITY_NOT_ELIGIBLE', 'ACCOUNT_INACTIVE', 'WORKSPACE_NOT_FOUND', 'PROJECT_NOT_FOUND',\n  'PROJECT_SOURCE_REFUSED', 'PROJECT_REPOSITORY_UNAVAILABLE', 'PROJECT_DELETE_DENIED', 'PROJECT_DELETING',\n  'PROJECT_NAME_MISMATCH', 'PROJECT_BUSY', 'PROJECT_DELETION_INCOMPLETE', 'PROJECT_THUMBNAIL_NOT_FOUND',\n  'BUILDER_SESSION_UNAVAILABLE', 'BUILDER_SANDBOX_OPEN_FAILED', 'CONVERSATION_NOT_FOUND', 'BUILDER_CAPACITY_FULL',\n  'BUILDER_MESSAGE_REFUSED', 'BUILDER_UNAVAILABLE', 'BUILDER_RUN_NOT_FOUND', 'BUILDER_TRACE_UNAVAILABLE',\n  'PREVIEW_UNAVAILABLE', 'PREVIEW_SUBJECT_NOT_FOUND', 'PREVIEW_FORM_REFUSED', 'SOURCE_REVISION_NOT_FOUND',\n  'SOURCE_FILE_NOT_FOUND', 'BUILDER_SOURCE_UNAVAILABLE', 'REQUEST_CONTEXT_REFUSED', 'TOOL_ANSWER_REFUSED',\n  'SESSION_STATE_REFUSED', 'BUILDER_SESSION_NOT_FOUND', 'CONVERSATION_SESSION_REFUSED', 'CONVERSATION_CONFLICT',\n  'BUILDER_BUSY', 'BUILDER_RUN_STOP_REFUSED', 'TOOL_ANSWER_ALREADY_GIVEN', 'QUESTION_ENDED',\n  'APPLICATION_ACCESS_MANAGE_REQUIRED', 'APPLICATION_ACCESS_ENTRY_NOT_FOUND', 'MEMBERS_MANAGE_REQUIRED', 'LAST_OWNER',\n  'ROSTER_ENTRY_NOT_FOUND', 'INSTALLATION_ADMINISTRATOR_REQUIRED', 'EMAIL_INVALID', 'ACCOUNT_NOT_FOUND',\n  'ACCOUNT_EMAIL_AMBIGUOUS', 'INSTALLATION_ADMINISTRATOR_NOT_FOUND', 'LAST_INSTALLATION_ADMINISTRATOR', 'CONNECTOR_CONNECTION_NOT_AVAILABLE',\n  'CONNECTOR_BINDING_CONFLICT', 'CONNECTOR_BINDING_MANAGE_REQUIRED', 'CONNECTOR_LABEL_REFUSED', 'CONNECTOR_CREDENTIAL_REFUSED',\n  'CONNECTOR_CONNECTION_CONFLICT', 'CONNECTOR_CONNECTION_NOT_FOUND', 'CONNECTOR_BINDING_NOT_FOUND', 'MODEL_ACCOUNT_PROVIDER_UNKNOWN',\n  'MODEL_ACCOUNT_KEY_REFUSED', 'MODEL_LOGIN_UNAVAILABLE', 'MODEL_LOGIN_BUSY', 'MODEL_LOGIN_CALLBACK_REFUSED',\n  'MODEL_LOGIN_NOT_FOUND', 'HUB_UNREACHABLE', 'HUB_RESPONSE_UNREADABLE', 'ANTHROPIC_STORED_RECORD_REFUSED',\n  'APPLICATION_ARTIFACT_INPUT_REFUSED', 'APPLICATION_CHECK_REPORT_UNREADABLE', 'APPLICATION_CHECK_TIMEOUT', 'APPLICATION_CHECK_UNREADABLE',\n  'APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED', 'APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED', 'APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED', 'APPLICATION_COMPILER_OUTPUT_PATH_REFUSED',\n  'APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED', 'APPLICATION_COMPILER_WORKSPACE_REFUSED', 'APPLICATION_ENTRYPOINT_REFUSED', 'APPLICATION_FILE_COUNT_REFUSED',\n  'APPLICATION_FILE_DUPLICATE_REFUSED', 'APPLICATION_FILE_ENCODING_REFUSED', 'APPLICATION_FILE_HASH_REFUSED', 'APPLICATION_FILE_ORDER_REFUSED',\n  'APPLICATION_FILE_PATH_REFUSED', 'APPLICATION_FILE_SHAPE_REFUSED', 'APPLICATION_FILE_SIZE_REFUSED', 'APPLICATION_MEDIA_TYPE_REFUSED',\n  'APPLICATION_MIGRATION_FAILED', 'APPLICATION_MIGRATION_HISTORY_DIVERGED', 'APPLICATION_PAYLOAD_PIN_REFUSED', 'APPLICATION_PAYLOAD_REFUSED',\n  'APPLICATION_RUNNER_UNAVAILABLE', 'APPLICATION_SERVER_REFUSED', 'APPLICATION_SMOKE_FAILED', 'APPLICATION_TOTAL_SIZE_REFUSED',\n  'BOOT_BROWSER_UNAVAILABLE', 'BUILDER_AGENT_COMPLETION_UNAVAILABLE', 'BUILDER_AGENT_PLATFORM_FAILED', 'BUILDER_AGENT_STALLED',\n  'BUILDER_AGENT_TRIPWIRE', 'BUILDER_APPLICATION_SOURCE_REFUSED', 'BUILDER_APP_NOT_FIXED', 'BUILDER_CANDIDATE_UNPACK_FAILED',\n  'BUILDER_CHECK_FAILED', 'BUILDER_CHECK_IDENTITY_MISMATCH', 'BUILDER_CHECK_INSTALL_REFUSED', 'BUILDER_CONVERSATIONS_UNAVAILABLE',\n  'BUILDER_GATEWAY_MODEL_REFUSED', 'BUILDER_LATE_RESULT_REFUSED', 'BUILDER_MESSAGE_ID_UNAVAILABLE', 'BUILDER_MODEL_AUTH_FAILED',\n  'BUILDER_MODEL_CONTENT_FILTERED', 'BUILDER_MODEL_CONTEXT_LENGTH', 'BUILDER_MODEL_INCOMPLETE', 'BUILDER_MODEL_NOT_SELECTED',\n  'BUILDER_MODEL_RATE_LIMITED', 'BUILDER_MODEL_STEP_TIMEOUT', 'BUILDER_MODEL_STREAM_FAILED', 'BUILDER_PREVIEW_NOT_BUILT',\n  'BUILDER_RESULT_BUNDLE_TOO_LARGE', 'BUILDER_RESULT_CONTENT_TOO_LARGE', 'BUILDER_RESULT_MATERIALIZATION_REFUSED', 'BUILDER_RUNTIME_INPUT_REFUSED',\n  'BUILDER_RUNTIME_RESULT_SCOPE_REFUSED', 'BUILDER_RUN_CANCELLED', 'BUILDER_CONVERSATION_SESSION_REFUSED', 'BUILDER_RUN_CREATE_FAILED',\n  'BUILDER_RUN_INPUT_REFUSED', 'BUILDER_RUN_NOT_ADMITTED', 'BUILDER_RUN_TRANSITION_REFUSED', 'BUILDER_RUN_PHASE_UPDATE_REFUSED',\n  'BUILDER_SANDBOX_AGENT_USER_REQUIRED', 'BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED', 'BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT', 'BUILDER_SANDBOX_EGRESS_POLL_FAILED',\n  'BUILDER_SANDBOX_EGRESS_START_FAILED', 'BUILDER_SANDBOX_FILE_REFUSED', 'BUILDER_SANDBOX_ID_UNAVAILABLE', 'BUILDER_SANDBOX_INCARNATION_CHANGED',\n  'BUILDER_SANDBOX_KEEPALIVE_FAILED', 'BUILDER_SESSION_DELETE_FAILED', 'BUILDER_SOURCE_BASE_MOVED', 'BUILDER_SOURCE_BASE_PIN_REFUSED',\n  'BUILDER_SOURCE_READ_REFUSED', 'BUILDER_SOURCE_READ_TREE_TOO_LARGE', 'BUILDER_SOURCE_READ_UNSAFE_ENTRY', 'BUILDER_STARTER_ENTRY_INSPECTION_FAILED',\n  'BUILDER_STARTER_ENTRY_UNSAFE', 'BUILDER_STARTER_ROOT_REFUSED', 'CONEXUS_APP_ROOT_MISSING', 'CONEXUS_GIT_FAILED',\n  'CONEXUS_GIT_MAIN_MISSING', 'CONEXUS_GIT_MERGE_REFUSED', 'CONEXUS_GIT_PROJECT_REFUSED', 'CONEXUS_GIT_REF_MOVED',\n  'CONEXUS_GIT_REF_REFUSED', 'CONEXUS_GIT_STARTER_REFUSED', 'GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE', 'GOOGLE_AI_PRO_BINARY_REFUSED',\n  'GOOGLE_AI_PRO_POOL_CLOSED', 'GOOGLE_AI_PRO_PORT_UNAVAILABLE', 'GOOGLE_AI_PRO_PROXY_START_FAILED', 'GOOGLE_AI_PRO_RECORD_REFUSED',\n  'GOOGLE_AI_PRO_ROUTER_UNAVAILABLE', 'GOOGLE_AI_PRO_STORED_RECORD_REFUSED', 'HUB_RESTART', 'MANIFEST_REFUSED',\n  'MODEL_ACCOUNT_PROBE_NOT_CALLABLE', 'OPENAI_CODEX_MODEL_REFUSED', 'OPENAI_CODEX_STORED_RECORD_REFUSED', 'SERVER_TREE_REFUSED',\n  'USER_CANCELLED', 'BUILDER_QUESTION_EXPIRED', 'BUILDER_QUESTION_NOT_RELEASED', 'BUILDER_SOURCE_ADMISSION_FAILED',\n  'BUILDER_RUN_SETTLE_LOST', 'APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED', 'APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED', 'APPLICATION_RUNNER_RELEASE_REFUSED',\n  'RUNNER_REQUEST_REFUSED', 'INPUT_REFUSED', 'INPUT_TOO_LARGE', 'OPERATION_NOT_FOUND',\n  'HANDLER_TIMEOUT', 'RESPONSE_TOO_LARGE', 'DATABASE_UNAVAILABLE', 'APPLICATION_RUNNER_BUSY',\n  'APPLICATION_PROJECT_BUSY', 'SERVER_TREE_TOO_LARGE', 'HANDLER_FAILED', 'HANDLER_LOAD_FAILED',\n  'HANDLER_EXPORT_MISSING', 'HANDLER_OUTPUT_UNSERIALIZABLE', 'HANDLER_OUTPUT_REFUSED', 'HANDLER_CRASHED',\n  'WORKER_FAILED', 'WORKER_JOB_REFUSED', 'CONNECTOR_SOCKET_REFUSED', 'CONTENT_TYPE_REFUSED',\n  'APPLICATION_NOT_FOUND', 'MEMORY_OBSERVATION_FAILED', 'MEMORY_REFLECTION_FAILED', 'MODEL_LOGIN_OPENAI_REFUSED',\n  'MODEL_LOGIN_ANTHROPIC_REFUSED', 'MODEL_LOGIN_GOOGLE_REFUSED', 'APPLICATION_NO_ACCESS', 'APPLICATION_EMAIL_NOT_VERIFIED',\n  'APPLICATION_SIGN_IN_FAILED', 'APPLICATION_NOT_READY', 'APPLICATION_SIGN_IN_REQUIRED', 'PREVIEW_REFUSED',\n  'NOT_GRANTED', 'CONNECTOR_UNCONFIGURED', 'CREDENTIAL_REFUSED', 'PROVIDER_TIMEOUT',\n  'PROVIDER_UNAVAILABLE', 'PROVIDER_ERROR', 'RESPONSE_REFUSED', 'CALL_LIMIT',\n  'SERVICE_REFUSED', 'CONNECTOR_PLATFORM_FAILED', 'CONFIG_MISSING', 'CONFIG_INVALID',\n  'HUB_ALREADY_RUNNING', 'HUB_SCHEMA_BEHIND', 'BUILDER_RUN_SETTLE_FAILED', 'BUILDER_RUN_SWEEP_SETTLE_FAILED',\n  'BUILDER_SESSION_RELEASE_FAILED', 'BUILDER_MIRROR_FAILED', 'BUILDER_SESSION_CLOSE_FAILED', 'BUILDER_AGENT_PROCESSES_KILL_FAILED',\n  'BUILDER_SANDBOX_KILL_FAILED', 'BUILDER_SANDBOX_PAUSE_FAILED', 'BUILDER_SANDBOX_EGRESS_COLLECT_FAILED', 'JOB_FAILED',\n  'HUB_POOL_ERROR', 'HUB_INSTANCE_LOCK_LOST', 'HUB_SHUTDOWN_FORCED', 'HUB_SHUTDOWN_TIMEOUT',\n  'HUB_SHUTDOWN_FAILED', 'HUB_FATAL', 'OIDC_BEGIN_FAILED', 'OIDC_REFRESH_TOKEN_MISSING',\n  'OIDC_CALLBACK_FAILED', 'SECRET_CUSTODY_LOST',\n] as const\n\nexport type FailureCode = (typeof FAILURE_CODES)[number]\n\nexport type FailureCategory = 'USER' | 'SYSTEM' | 'THIRD_PARTY'\n\nexport const FAILURE_ACTIONS = {\n  'NONE': null,\n  'SIGN_IN': 'Entre na sua conta para continuar.',\n  'CONNECT_MODEL_ACCOUNT': 'Conecte uma conta de modelo em Configura\u00E7\u00F5es.',\n  'ASK_ADMIN': 'Pe\u00E7a a quem administra o Conexus.',\n  'ASK_CHANGE': 'Pe\u00E7a a quem pode alterar isso.',\n  'CHOOSE_OTHER_MODEL': 'Escolha outro modelo.',\n  'FIX_IN_CONVERSATION': 'Pe\u00E7a o ajuste ao Builder, na conversa.',\n  'RETRY_LATER': 'Tente novamente mais tarde.',\n  'SIGN_IN_AGAIN': 'Entre de novo.',\n  'CONFIRM_EMAIL': 'Confirme o e-mail no seu provedor de login e entre de novo.',\n  'ASK_INVITE': 'Pe\u00E7a um convite a quem cuida do seu Workspace, com este mesmo e-mail.',\n} as const\n\nexport type FailureAction = keyof typeof FAILURE_ACTIONS\n\nexport const FAILURES = {\n  'INTERNAL_UNEXPECTED': { category: 'SYSTEM', audience: 'person', message: 'O Conexus falhou de um jeito que n\u00E3o esper\u00E1vamos. A falha foi registrada.', action: 'NONE', status: 500 },\n  'IDENTITY_PROVIDER_UNAVAILABLE': { category: 'THIRD_PARTY', audience: 'person+app', message: 'O servi\u00E7o de login n\u00E3o respondeu agora. Sua sess\u00E3o continua aberta.', action: 'RETRY_LATER', status: 503 },\n  'HUB_UNREACHABLE': { category: 'THIRD_PARTY', audience: 'person', message: 'A tela n\u00E3o conseguiu falar com o Conexus agora.', action: 'RETRY_LATER', status: 503 },\n  'HUB_RESPONSE_UNREADABLE': { category: 'THIRD_PARTY', audience: 'person', message: 'A resposta que chegou \u00E0 tela n\u00E3o veio do Conexus.', action: 'RETRY_LATER', status: 502 },\n  'APPLICATION_MIGRATION_FAILED': { category: 'USER', audience: 'person+app', message: 'A mudan\u00E7a nos dados do aplicativo n\u00E3o foi aplicada.', action: 'FIX_IN_CONVERSATION', status: 500 },\n  'APPLICATION_RUNNER_UNAVAILABLE': { category: 'SYSTEM', audience: 'person+app', message: 'O Conexus n\u00E3o conseguiu alcan\u00E7ar o servidor de aplicativos. A falha foi registrada.', action: 'NONE', status: 503 },\n  'INPUT_REFUSED': { category: 'USER', audience: 'person+app', message: 'Algum campo tem um valor que o app n\u00E3o aceita.', action: 'NONE', status: 400 },\n  'INPUT_TOO_LARGE': { category: 'USER', audience: 'person+app', message: 'Os dados enviados s\u00E3o grandes demais.', action: 'NONE', status: 413 },\n  'OPERATION_NOT_FOUND': { category: 'USER', audience: 'person+app', message: 'Essa opera\u00E7\u00E3o n\u00E3o existe neste app.', action: 'NONE', status: 404 },\n  'HANDLER_TIMEOUT': { category: 'USER', audience: 'person+app', message: 'A opera\u00E7\u00E3o demorou mais que o permitido.', action: 'RETRY_LATER', status: 504 },\n  'RESPONSE_TOO_LARGE': { category: 'USER', audience: 'person+app', message: 'H\u00E1 resultados demais para mostrar. Use um filtro para reduzir a lista.', action: 'NONE', status: 502 },\n  'DATABASE_UNAVAILABLE': { category: 'SYSTEM', audience: 'person+app', message: 'Os dados salvos do app est\u00E3o indispon\u00EDveis. A falha foi registrada.', action: 'NONE', status: 503 },\n  'APPLICATION_RUNNER_BUSY': { category: 'USER', audience: 'person+app', message: 'O app est\u00E1 ocupado com outros pedidos agora.', action: 'RETRY_LATER', status: 429 },\n  'APPLICATION_PROJECT_BUSY': { category: 'USER', audience: 'person+app', message: 'Este app j\u00E1 tem pedidos demais em andamento.', action: 'RETRY_LATER', status: 429 },\n  'SERVER_TREE_TOO_LARGE': { category: 'USER', audience: 'person+app', message: 'O aplicativo passou do tamanho que o Conexus aceita.', action: 'FIX_IN_CONVERSATION', status: 413 },\n  'HANDLER_FAILED': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 500 },\n  'HANDLER_LOAD_FAILED': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 500 },\n  'HANDLER_EXPORT_MISSING': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 500 },\n  'HANDLER_OUTPUT_UNSERIALIZABLE': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 500 },\n  'HANDLER_OUTPUT_REFUSED': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 502 },\n  'HANDLER_CRASHED': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o do app falhou.', action: 'NONE', status: 500 },\n  'WORKER_FAILED': { category: 'SYSTEM', audience: 'person+app', message: 'O Conexus falhou ao executar o app. A falha foi registrada.', action: 'NONE', status: 500 },\n  'WORKER_JOB_REFUSED': { category: 'SYSTEM', audience: 'person+app', message: 'O Conexus falhou ao executar o app. A falha foi registrada.', action: 'NONE', status: 500 },\n  'CONNECTOR_SOCKET_REFUSED': { category: 'SYSTEM', audience: 'person+app', message: 'O Conexus falhou ao executar o app. A falha foi registrada.', action: 'NONE', status: 500 },\n  'CONTENT_TYPE_REFUSED': { category: 'USER', audience: 'person+app', message: 'O Conexus n\u00E3o aceitou o formato deste pedido.', action: 'NONE', status: 415 },\n  'APPLICATION_NOT_FOUND': { category: 'USER', audience: 'person+app', message: 'N\u00E3o encontramos este app.', action: 'NONE', status: 404 },\n  'APPLICATION_NOT_READY': { category: 'USER', audience: 'person+app', message: 'Este app ainda n\u00E3o est\u00E1 pronto para receber pedidos.', action: 'NONE', status: 503 },\n  'APPLICATION_SIGN_IN_REQUIRED': { category: 'USER', audience: 'person+app', message: 'Voc\u00EA precisa entrar no Conexus para usar este app.', action: 'SIGN_IN', status: 401 },\n  'PREVIEW_REFUSED': { category: 'USER', audience: 'person+app', message: 'Esta pr\u00E9via n\u00E3o aceita o pedido.', action: 'NONE', status: 403 },\n  'NOT_GRANTED': { category: 'USER', audience: 'person+app', message: 'Este app perdeu o acesso ao sistema da empresa. Quem administra o Workspace precisa vincular a Conex\u00E3o outra vez.', action: 'ASK_ADMIN', status: 403 },\n  'CONNECTOR_UNCONFIGURED': { category: 'SYSTEM', audience: 'person+app', message: 'A integra\u00E7\u00E3o com o sistema da empresa n\u00E3o est\u00E1 configurada. A falha foi registrada.', action: 'NONE', status: 503 },\n  'CREDENTIAL_REFUSED': { category: 'USER', audience: 'person+app', message: 'O sistema da empresa recusou o acesso. Avise quem administra a integra\u00E7\u00E3o.', action: 'ASK_ADMIN', status: 502 },\n  'PROVIDER_TIMEOUT': { category: 'THIRD_PARTY', audience: 'person+app', message: 'O sistema da empresa n\u00E3o respondeu a tempo.', action: 'RETRY_LATER', status: 504 },\n  'PROVIDER_UNAVAILABLE': { category: 'THIRD_PARTY', audience: 'person+app', message: 'O sistema da empresa est\u00E1 indispon\u00EDvel agora.', action: 'RETRY_LATER', status: 503 },\n  'PROVIDER_ERROR': { category: 'THIRD_PARTY', audience: 'person+app', message: 'O sistema da empresa respondeu com um erro.', action: 'NONE', status: 502 },\n  'RESPONSE_REFUSED': { category: 'THIRD_PARTY', audience: 'person+app', message: 'O Conexus n\u00E3o aceitou a resposta do sistema da empresa.', action: 'NONE', status: 502 },\n  'CALL_LIMIT': { category: 'USER', audience: 'person+app', message: 'Este app fez chamadas demais ao sistema da empresa.', action: 'RETRY_LATER', status: 429 },\n  'SERVICE_REFUSED': { category: 'USER', audience: 'person+app', message: 'Esta opera\u00E7\u00E3o n\u00E3o \u00E9 permitida pela conex\u00E3o com o sistema da empresa.', action: 'NONE', status: 403 },\n  'CONNECTOR_PLATFORM_FAILED': { category: 'SYSTEM', audience: 'person+app', message: 'O Conexus falhou ao ler o sistema da empresa. A falha foi registrada.', action: 'NONE', status: 500 },\n} as const satisfies Readonly<Record<string, Readonly<{ category: FailureCategory; audience: 'person' | 'person+app'; message: string; action: FailureAction; status: number }>>>\n\nimport { z } from 'zod'\n\nexport const TraceId = z.string().regex(/^[0-9a-f]{32}$/).refine((value) => value !== '0'.repeat(32)).brand<'TraceId'>()\nexport type TraceId = z.output<typeof TraceId>\n\nexport const Problem = z.looseObject({\n  type: z.string(),\n  title: z.string(),\n  status: z.int().min(100).max(599),\n  code: z.enum(FAILURE_CODES),\n  traceId: TraceId.optional(),\n}).refine((problem) => problem.status === FAILURE_STATUS[problem.code]).meta({ id: 'Problem' })\nexport type Problem = z.output<typeof Problem>\n\n\n/** A public failure reconstructed at a client boundary. It never carries server diagnostics. */\nexport class ReceivedFailure extends Error {\n  readonly code: FailureCode\n  readonly status: number | null\n  readonly traceId: TraceId | null\n\n  constructor(code: FailureCode, status: number | null, traceId: TraceId | null = null) {\n    super(code)\n    this.name = 'ReceivedFailure'\n    this.code = code\n    this.status = status\n    this.traceId = traceId\n  }\n}\n\nfunction isFailureCode(value: unknown): value is FailureCode {\n  return typeof value === 'string' && Object.hasOwn(FAILURE_STATUS, value)\n}\n\n/** Reads only the closed Problem representation, and requires its status to match the HTTP status. */\nexport async function readFailure(response: Response): Promise<ReceivedFailure> {\n  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim().toLowerCase()\n  if (contentType !== 'application/problem+json') return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)\n  const body: unknown = await response.json().catch(() => null)\n  const parsed = Problem.safeParse(body)\n  if (response.status < 400 || response.status > 599 || !parsed.success || parsed.data.status !== response.status) {\n    return new ReceivedFailure('HUB_RESPONSE_UNREADABLE', response.status)\n  }\n  const { code, traceId } = parsed.data\n  return new ReceivedFailure(code, response.status, traceId ?? null)\n}\n\nexport function isFailure(error: unknown, ...codes: readonly FailureCode[]): error is ReceivedFailure {\n  return error instanceof ReceivedFailure && (codes.length === 0 || codes.includes(error.code))\n}\n\nfunction hasAudienceRow(code: FailureCode): code is keyof typeof FAILURES {\n  return Object.hasOwn(FAILURES, code)\n}\n\nfunction rowOf(code: FailureCode) {\n  if (!hasAudienceRow(code)) return FAILURES.INTERNAL_UNEXPECTED\n  return FAILURES[code]\n}\n\nfunction sentence(code: FailureCode): string {\n  const row = rowOf(code)\n  const action = FAILURE_ACTIONS[row.action]\n  return action === null ? row.message : `${row.message} ${action}`\n}\n\n/** The short reference for stored run identifiers as well as validated trace identifiers. */\nexport function shortReference(id: string): string {\n  return `Refer\u00EAncia: ${id.slice(0, 8)}.`\n}\n\nexport function failureText(error: unknown): string {\n  const code = error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE'\n  const text = sentence(code)\n  return error instanceof ReceivedFailure && error.traceId !== null && rowOf(code).category === 'SYSTEM'\n    ? `${text} ${shortReference(error.traceId)}`\n    : text\n}\n\nexport function failureCodeText(code: string | null | undefined): string {\n  return sentence(code !== null && code !== undefined && isFailureCode(code) ? code : 'INTERNAL_UNEXPECTED')\n}\n\nexport function isRetryable(error: unknown): boolean {\n  return rowOf(error instanceof ReceivedFailure ? error.code : 'HUB_RESPONSE_UNREADABLE').action === 'RETRY_LATER'\n}\n";
