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
    readonly PROJECT_CREATE_DENIED: 403;
    readonly PROJECT_SOURCE_REFUSED: 422;
    readonly PROJECT_REPOSITORY_UNAVAILABLE: 503;
    readonly PROJECT_DELETE_DENIED: 403;
    readonly PROJECT_NAME_MISMATCH: 409;
    readonly PROJECT_BUSY: 409;
    readonly PROJECT_DELETION_INCOMPLETE: 503;
    readonly PROJECT_SUMMARIES_UNAVAILABLE: 503;
    readonly PROJECT_THUMBNAIL_NOT_FOUND: 404;
    readonly PROJECT_THUMBNAIL_UNAVAILABLE: 503;
    readonly BUILDER_SESSION_UNAVAILABLE: 503;
    readonly PROJECT_BUILD_DENIED: 403;
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
    readonly CONNECTOR_WORKSPACE_NOT_FOUND: 422;
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
};
export declare const FAILURE_CODES: readonly ["INTERNAL_UNEXPECTED", "NOT_FOUND", "REQUEST_VALIDATION_FAILED", "REQUEST_JSON_INVALID", "REQUEST_BODY_TOO_LARGE", "REQUEST_MEDIA_TYPE_UNSUPPORTED", "AUTHENTICATION_REQUIRED", "REQUEST_AUTHENTICITY_DENIED", "IDEMPOTENCY_KEY_REQUIRED", "IDEMPOTENCY_CONFLICT", "OUTCOME_UNKNOWN", "DATABASE_BUSY", "IDENTITY_PROVIDER_UNAVAILABLE", "SIGN_IN_EXPIRED", "SIGN_IN_FAILED", "IDENTITY_EMAIL_NOT_VERIFIED", "IDENTITY_NOT_ELIGIBLE", "ACCOUNT_INACTIVE", "WORKSPACE_NOT_FOUND", "PROJECT_NOT_FOUND", "PROJECT_CREATE_DENIED", "PROJECT_SOURCE_REFUSED", "PROJECT_REPOSITORY_UNAVAILABLE", "PROJECT_DELETE_DENIED", "PROJECT_NAME_MISMATCH", "PROJECT_BUSY", "PROJECT_DELETION_INCOMPLETE", "PROJECT_SUMMARIES_UNAVAILABLE", "PROJECT_THUMBNAIL_NOT_FOUND", "PROJECT_THUMBNAIL_UNAVAILABLE", "BUILDER_SESSION_UNAVAILABLE", "PROJECT_BUILD_DENIED", "CONVERSATION_NOT_FOUND", "BUILDER_CAPACITY_FULL", "BUILDER_MESSAGE_REFUSED", "BUILDER_UNAVAILABLE", "BUILDER_RUN_NOT_FOUND", "BUILDER_TRACE_UNAVAILABLE", "PREVIEW_UNAVAILABLE", "PREVIEW_SUBJECT_NOT_FOUND", "PREVIEW_FORM_REFUSED", "SOURCE_REVISION_NOT_FOUND", "SOURCE_FILE_NOT_FOUND", "BUILDER_SOURCE_UNAVAILABLE", "REQUEST_CONTEXT_REFUSED", "TOOL_ANSWER_REFUSED", "SESSION_STATE_REFUSED", "BUILDER_SESSION_NOT_FOUND", "CONVERSATION_SESSION_REFUSED", "CONVERSATION_CONFLICT", "BUILDER_BUSY", "BUILDER_RUN_STOP_REFUSED", "TOOL_ANSWER_ALREADY_GIVEN", "QUESTION_ENDED", "APPLICATION_ACCESS_MANAGE_REQUIRED", "APPLICATION_ACCESS_ENTRY_NOT_FOUND", "MEMBERS_MANAGE_REQUIRED", "LAST_OWNER", "ROSTER_ENTRY_NOT_FOUND", "INSTALLATION_ADMINISTRATOR_REQUIRED", "EMAIL_INVALID", "ACCOUNT_NOT_FOUND", "ACCOUNT_EMAIL_AMBIGUOUS", "INSTALLATION_ADMINISTRATOR_NOT_FOUND", "LAST_INSTALLATION_ADMINISTRATOR", "CONNECTOR_CONNECTION_NOT_AVAILABLE", "CONNECTOR_BINDING_CONFLICT", "CONNECTOR_BINDING_MANAGE_REQUIRED", "CONNECTOR_WORKSPACE_NOT_FOUND", "CONNECTOR_LABEL_REFUSED", "CONNECTOR_CREDENTIAL_REFUSED", "CONNECTOR_CONNECTION_CONFLICT", "CONNECTOR_CONNECTION_NOT_FOUND", "CONNECTOR_BINDING_NOT_FOUND", "MODEL_ACCOUNT_PROVIDER_UNKNOWN", "MODEL_ACCOUNT_KEY_REFUSED", "MODEL_LOGIN_UNAVAILABLE", "MODEL_LOGIN_BUSY", "MODEL_LOGIN_CALLBACK_REFUSED", "MODEL_LOGIN_NOT_FOUND", "HUB_UNREACHABLE", "HUB_RESPONSE_UNREADABLE", "ANTHROPIC_STORED_RECORD_REFUSED", "APPLICATION_ARTIFACT_INPUT_REFUSED", "APPLICATION_CHECK_REPORT_UNREADABLE", "APPLICATION_CHECK_TIMEOUT", "APPLICATION_CHECK_UNREADABLE", "APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED", "APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED", "APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED", "APPLICATION_COMPILER_OUTPUT_PATH_REFUSED", "APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED", "APPLICATION_COMPILER_WORKSPACE_REFUSED", "APPLICATION_ENTRYPOINT_REFUSED", "APPLICATION_FILE_COUNT_REFUSED", "APPLICATION_FILE_DUPLICATE_REFUSED", "APPLICATION_FILE_ENCODING_REFUSED", "APPLICATION_FILE_HASH_REFUSED", "APPLICATION_FILE_ORDER_REFUSED", "APPLICATION_FILE_PATH_REFUSED", "APPLICATION_FILE_SHAPE_REFUSED", "APPLICATION_FILE_SIZE_REFUSED", "APPLICATION_MEDIA_TYPE_REFUSED", "APPLICATION_MIGRATION_FAILED", "APPLICATION_MIGRATION_HISTORY_DIVERGED", "APPLICATION_PAYLOAD_PIN_REFUSED", "APPLICATION_PAYLOAD_REFUSED", "APPLICATION_RUNNER_UNAVAILABLE", "APPLICATION_SERVER_REFUSED", "APPLICATION_SMOKE_FAILED", "APPLICATION_TOTAL_SIZE_REFUSED", "BOOT_BROWSER_UNAVAILABLE", "BUILDER_AGENT_COMPLETION_UNAVAILABLE", "BUILDER_AGENT_PLATFORM_FAILED", "BUILDER_AGENT_STALLED", "BUILDER_AGENT_TRIPWIRE", "BUILDER_APPLICATION_SOURCE_REFUSED", "BUILDER_APP_NOT_FIXED", "BUILDER_CANDIDATE_UNPACK_FAILED", "BUILDER_CHECK_FAILED", "BUILDER_CHECK_IDENTITY_MISMATCH", "BUILDER_CHECK_INSTALL_REFUSED", "BUILDER_CONVERSATIONS_UNAVAILABLE", "BUILDER_GATEWAY_MODEL_REFUSED", "BUILDER_LATE_RESULT_REFUSED", "BUILDER_MESSAGE_ID_UNAVAILABLE", "BUILDER_MODEL_AUTH_FAILED", "BUILDER_MODEL_CONTENT_FILTERED", "BUILDER_MODEL_CONTEXT_LENGTH", "BUILDER_MODEL_INCOMPLETE", "BUILDER_MODEL_NOT_SELECTED", "BUILDER_MODEL_RATE_LIMITED", "BUILDER_MODEL_STEP_TIMEOUT", "BUILDER_MODEL_STREAM_FAILED", "BUILDER_PREVIEW_NOT_BUILT", "BUILDER_RESULT_BUNDLE_TOO_LARGE", "BUILDER_RESULT_CONTENT_TOO_LARGE", "BUILDER_RESULT_MATERIALIZATION_REFUSED", "BUILDER_RUNTIME_INPUT_REFUSED", "BUILDER_RUNTIME_RESULT_SCOPE_REFUSED", "BUILDER_RUN_CANCELLED", "BUILDER_CONVERSATION_SESSION_REFUSED", "BUILDER_RUN_CREATE_FAILED", "BUILDER_RUN_INPUT_REFUSED", "BUILDER_RUN_NOT_ADMITTED", "BUILDER_RUN_TRANSITION_REFUSED", "BUILDER_RUN_PHASE_UPDATE_REFUSED", "BUILDER_SANDBOX_AGENT_USER_REQUIRED", "BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED", "BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT", "BUILDER_SANDBOX_EGRESS_POLL_FAILED", "BUILDER_SANDBOX_EGRESS_START_FAILED", "BUILDER_SANDBOX_FILE_REFUSED", "BUILDER_SANDBOX_ID_UNAVAILABLE", "BUILDER_SANDBOX_INCARNATION_CHANGED", "BUILDER_SANDBOX_KEEPALIVE_FAILED", "BUILDER_SESSION_DELETE_FAILED", "BUILDER_SOURCE_BASE_MOVED", "BUILDER_SOURCE_BASE_PIN_REFUSED", "BUILDER_SOURCE_READ_REFUSED", "BUILDER_SOURCE_READ_TREE_TOO_LARGE", "BUILDER_SOURCE_READ_UNSAFE_ENTRY", "BUILDER_STARTER_ENTRY_INSPECTION_FAILED", "BUILDER_STARTER_ENTRY_UNSAFE", "BUILDER_STARTER_ROOT_REFUSED", "CONEXUS_APP_ROOT_MISSING", "CONEXUS_GIT_FAILED", "CONEXUS_GIT_MAIN_MISSING", "CONEXUS_GIT_MERGE_REFUSED", "CONEXUS_GIT_PROJECT_REFUSED", "CONEXUS_GIT_REF_MOVED", "CONEXUS_GIT_REF_REFUSED", "CONEXUS_GIT_STARTER_REFUSED", "GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE", "GOOGLE_AI_PRO_BINARY_REFUSED", "GOOGLE_AI_PRO_POOL_CLOSED", "GOOGLE_AI_PRO_PORT_UNAVAILABLE", "GOOGLE_AI_PRO_PROXY_START_FAILED", "GOOGLE_AI_PRO_RECORD_REFUSED", "GOOGLE_AI_PRO_ROUTER_UNAVAILABLE", "GOOGLE_AI_PRO_STORED_RECORD_REFUSED", "HUB_RESTART", "MANIFEST_REFUSED", "MODEL_ACCOUNT_PROBE_NOT_CALLABLE", "OPENAI_CODEX_MODEL_REFUSED", "OPENAI_CODEX_STORED_RECORD_REFUSED", "SERVER_TREE_REFUSED", "USER_CANCELLED", "BUILDER_QUESTION_EXPIRED", "BUILDER_QUESTION_NOT_RELEASED", "BUILDER_SOURCE_ADMISSION_FAILED", "BUILDER_RUN_SETTLE_LOST", "APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED", "APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED", "APPLICATION_RUNNER_RELEASE_REFUSED", "RUNNER_REQUEST_REFUSED", "INPUT_REFUSED", "INPUT_TOO_LARGE", "OPERATION_NOT_FOUND", "HANDLER_TIMEOUT", "RESPONSE_TOO_LARGE", "DATABASE_UNAVAILABLE", "APPLICATION_RUNNER_BUSY", "APPLICATION_PROJECT_BUSY", "SERVER_TREE_TOO_LARGE", "HANDLER_FAILED", "HANDLER_LOAD_FAILED", "HANDLER_EXPORT_MISSING", "HANDLER_OUTPUT_UNSERIALIZABLE", "HANDLER_OUTPUT_REFUSED", "HANDLER_CRASHED", "WORKER_FAILED", "WORKER_JOB_REFUSED", "CONNECTOR_SOCKET_REFUSED", "CONTENT_TYPE_REFUSED", "APPLICATION_NOT_FOUND", "MEMORY_OBSERVATION_FAILED", "MEMORY_REFLECTION_FAILED", "MODEL_LOGIN_OPENAI_REFUSED", "MODEL_LOGIN_ANTHROPIC_REFUSED", "MODEL_LOGIN_GOOGLE_REFUSED", "APPLICATION_NO_ACCESS", "APPLICATION_EMAIL_NOT_VERIFIED", "APPLICATION_SIGN_IN_FAILED", "APPLICATION_NOT_READY", "APPLICATION_SIGN_IN_REQUIRED", "PREVIEW_REFUSED", "NOT_GRANTED", "CONNECTOR_UNCONFIGURED", "CREDENTIAL_REFUSED", "PROVIDER_TIMEOUT", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "RESPONSE_REFUSED", "CALL_LIMIT", "SERVICE_REFUSED", "CONNECTOR_PLATFORM_FAILED", "CONFIG_MISSING", "CONFIG_INVALID", "HUB_ALREADY_RUNNING", "HUB_SCHEMA_BEHIND", "BUILDER_RUN_SETTLE_FAILED", "BUILDER_RUN_SWEEP_SETTLE_FAILED", "BUILDER_SESSION_RELEASE_FAILED", "BUILDER_MIRROR_FAILED", "BUILDER_SESSION_CLOSE_FAILED", "BUILDER_AGENT_PROCESSES_KILL_FAILED", "BUILDER_SANDBOX_KILL_FAILED", "BUILDER_SANDBOX_PAUSE_FAILED", "BUILDER_SANDBOX_EGRESS_COLLECT_FAILED", "JOB_FAILED", "HUB_POOL_ERROR", "HUB_INSTANCE_LOCK_LOST", "HUB_SHUTDOWN_FORCED", "HUB_SHUTDOWN_TIMEOUT", "HUB_SHUTDOWN_FAILED", "HUB_FATAL", "OIDC_BEGIN_FAILED", "OIDC_REFRESH_TOKEN_MISSING", "OIDC_CALLBACK_FAILED"];
export type FailureCode = (typeof FAILURE_CODES)[number];
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
        readonly message: "O Conexus falhou de um jeito que não esperávamos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly NOT_FOUND: {
        readonly message: "Não encontramos o que você procurou.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly REQUEST_VALIDATION_FAILED: {
        readonly message: "Alguns dados do pedido não são válidos.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly REQUEST_JSON_INVALID: {
        readonly message: "O pedido chegou ao Conexus ilegível.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly REQUEST_BODY_TOO_LARGE: {
        readonly message: "O pedido é maior do que o Conexus aceita.";
        readonly action: "NONE";
        readonly status: 413;
    };
    readonly REQUEST_MEDIA_TYPE_UNSUPPORTED: {
        readonly message: "O Conexus não aceita esse formato de pedido.";
        readonly action: "NONE";
        readonly status: 415;
    };
    readonly AUTHENTICATION_REQUIRED: {
        readonly message: "Você precisa entrar para continuar.";
        readonly action: "SIGN_IN";
        readonly status: 401;
    };
    readonly REQUEST_AUTHENTICITY_DENIED: {
        readonly message: "O Conexus não conseguiu confirmar que o pedido veio de você. Recarregue a página.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly IDEMPOTENCY_KEY_REQUIRED: {
        readonly message: "O pedido saiu sem o identificador que o Conexus exige. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly IDEMPOTENCY_CONFLICT: {
        readonly message: "Já existe um pedido igual a este, com dados diferentes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly OUTCOME_UNKNOWN: {
        readonly message: "O Conexus não conseguiu confirmar se o pedido anterior terminou. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly DATABASE_BUSY: {
        readonly message: "O Conexus está ocupado e não terminou o pedido. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly IDENTITY_PROVIDER_UNAVAILABLE: {
        readonly message: "O serviço de login não respondeu agora. Sua sessão continua aberta.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly SIGN_IN_EXPIRED: {
        readonly message: "O login demorou demais ou foi aberto em outra aba.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 401;
    };
    readonly SIGN_IN_FAILED: {
        readonly message: "O serviço de login não concluiu a entrada.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 502;
    };
    readonly IDENTITY_EMAIL_NOT_VERIFIED: {
        readonly message: "O seu provedor de login informou que o e-mail desta conta ainda não foi verificado.";
        readonly action: "CONFIRM_EMAIL";
        readonly status: 403;
    };
    readonly IDENTITY_NOT_ELIGIBLE: {
        readonly message: "Você entrou, mas ninguém convidou este e-mail para o Conexus.";
        readonly action: "ASK_INVITE";
        readonly status: 403;
    };
    readonly ACCOUNT_INACTIVE: {
        readonly message: "Esta conta foi desativada no Conexus.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly WORKSPACE_NOT_FOUND: {
        readonly message: "Não encontramos esse Workspace.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PROJECT_NOT_FOUND: {
        readonly message: "Não encontramos esse Projeto.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PROJECT_CREATE_DENIED: {
        readonly message: "Você não tem permissão para criar Projetos neste Workspace.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly PROJECT_SOURCE_REFUSED: {
        readonly message: "O Conexus não aceitou o código inicial deste Projeto.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly PROJECT_REPOSITORY_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu usar o repositório do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_DELETE_DENIED: {
        readonly message: "Só quem administra o Conexus pode excluir Projetos.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly PROJECT_NAME_MISMATCH: {
        readonly message: "O nome digitado não é o nome do Projeto. Digite exatamente como aparece.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly PROJECT_BUSY: {
        readonly message: "O Projeto está processando um pedido agora. Espere terminar.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly PROJECT_DELETION_INCOMPLETE: {
        readonly message: "A exclusão do Projeto não terminou. O que já foi apagado não volta atrás. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_SUMMARIES_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu listar os Projetos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_THUMBNAIL_NOT_FOUND: {
        readonly message: "Este Projeto ainda não tem miniatura.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PROJECT_THUMBNAIL_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu carregar a miniatura do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly BUILDER_SESSION_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu abrir a sessão do Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PROJECT_BUILD_DENIED: {
        readonly message: "Você não tem permissão para construir neste Projeto.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly CONVERSATION_NOT_FOUND: {
        readonly message: "Não encontramos essa conversa.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_CAPACITY_FULL: {
        readonly message: "O Conexus está com muitas execuções abertas agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly BUILDER_MESSAGE_REFUSED: {
        readonly message: "O Conexus não aceitou essa mensagem.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly BUILDER_UNAVAILABLE: {
        readonly message: "O Builder não está disponível agora. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly BUILDER_RUN_NOT_FOUND: {
        readonly message: "Não encontramos essa execução.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_TRACE_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu carregar o detalhe da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PREVIEW_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu abrir a Prévia. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly PREVIEW_SUBJECT_NOT_FOUND: {
        readonly message: "Não encontramos o que a Prévia mostraria.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly PREVIEW_FORM_REFUSED: {
        readonly message: "A Prévia não aceitou esse formulário.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly SOURCE_REVISION_NOT_FOUND: {
        readonly message: "Não encontramos essa versão do código.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly SOURCE_FILE_NOT_FOUND: {
        readonly message: "Não encontramos esse arquivo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly BUILDER_SOURCE_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly REQUEST_CONTEXT_REFUSED: {
        readonly message: "O pedido trouxe um contexto que só o Conexus pode definir.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly TOOL_ANSWER_REFUSED: {
        readonly message: "Só é possível aprovar ou recusar uma ação pendente do agente.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly SESSION_STATE_REFUSED: {
        readonly message: "Só o nível de raciocínio pode ser alterado aqui.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly BUILDER_SESSION_NOT_FOUND: {
        readonly message: "Não encontramos essa sessão do Builder.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONVERSATION_SESSION_REFUSED: {
        readonly message: "A sessão de uma conversa só abre na própria conversa.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly CONVERSATION_CONFLICT: {
        readonly message: "Esse identificador de conversa já está em uso.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly BUILDER_BUSY: {
        readonly message: "O modelo só muda quando o Builder está parado.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly BUILDER_RUN_STOP_REFUSED: {
        readonly message: "Uma execução só para pelo botão de parar.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly TOOL_ANSWER_ALREADY_GIVEN: {
        readonly message: "Esta pergunta já foi respondida.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly QUESTION_ENDED: {
        readonly message: "Esta pergunta já foi encerrada. A resposta pode ir na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly APPLICATION_ACCESS_MANAGE_REQUIRED: {
        readonly message: "Você não tem permissão para gerenciar quem acessa este aplicativo.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly APPLICATION_ACCESS_ENTRY_NOT_FOUND: {
        readonly message: "Não encontramos esse acesso ao aplicativo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MEMBERS_MANAGE_REQUIRED: {
        readonly message: "Você não tem permissão para gerenciar as pessoas deste Workspace.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly LAST_OWNER: {
        readonly message: "O Workspace ficaria sem dono. Torne outra pessoa dona antes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly ROSTER_ENTRY_NOT_FOUND: {
        readonly message: "Não encontramos essa pessoa na lista.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly INSTALLATION_ADMINISTRATOR_REQUIRED: {
        readonly message: "Só quem administra o Conexus pode fazer isso.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly EMAIL_INVALID: {
        readonly message: "Esse e-mail não é válido.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly ACCOUNT_NOT_FOUND: {
        readonly message: "Nenhuma conta ativa usa este e-mail. A pessoa precisa entrar no Conexus uma vez antes.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly ACCOUNT_EMAIL_AMBIGUOUS: {
        readonly message: "Mais de uma conta usa este e-mail. Fale com quem opera o Conexus.";
        readonly action: "ASK_ADMIN";
        readonly status: 409;
    };
    readonly INSTALLATION_ADMINISTRATOR_NOT_FOUND: {
        readonly message: "Essa pessoa não administra o Conexus.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly LAST_INSTALLATION_ADMINISTRATOR: {
        readonly message: "Não é possível revogar o último administrador. Torne outra pessoa administradora antes.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_CONNECTION_NOT_AVAILABLE: {
        readonly message: "Esta conexão não está disponível para o Projeto.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONNECTOR_BINDING_CONFLICT: {
        readonly message: "Este nome já está em uso neste Projeto, ou esta conexão já está vinculada com outro nome.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_BINDING_MANAGE_REQUIRED: {
        readonly message: "Você não tem permissão para gerenciar as conexões deste Projeto.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly CONNECTOR_WORKSPACE_NOT_FOUND: {
        readonly message: "Não encontramos o Workspace dessa conexão.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly CONNECTOR_LABEL_REFUSED: {
        readonly message: "O Conexus não aceitou esse nome para a conexão.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly CONNECTOR_CREDENTIAL_REFUSED: {
        readonly message: "O Conexus não aceitou essas credenciais.";
        readonly action: "NONE";
        readonly status: 422;
    };
    readonly CONNECTOR_CONNECTION_CONFLICT: {
        readonly message: "Já existe uma conexão com esses dados.";
        readonly action: "NONE";
        readonly status: 409;
    };
    readonly CONNECTOR_CONNECTION_NOT_FOUND: {
        readonly message: "Não encontramos essa conexão.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly CONNECTOR_BINDING_NOT_FOUND: {
        readonly message: "Não encontramos essa ligação do Projeto com a conexão.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MODEL_ACCOUNT_PROVIDER_UNKNOWN: {
        readonly message: "Este provedor não aceita chave de API.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MODEL_ACCOUNT_KEY_REFUSED: {
        readonly message: "Essa não é uma chave de API deste provedor.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly MODEL_LOGIN_UNAVAILABLE: {
        readonly message: "A entrada na conta do modelo não está disponível agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly MODEL_LOGIN_BUSY: {
        readonly message: "Outra entrada na conta do modelo está em andamento.";
        readonly action: "RETRY_LATER";
        readonly status: 409;
    };
    readonly MODEL_LOGIN_CALLBACK_REFUSED: {
        readonly message: "O Conexus não aceitou esse endereço de retorno da entrada.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly MODEL_LOGIN_NOT_FOUND: {
        readonly message: "Não encontramos essa entrada na conta do modelo.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly HUB_UNREACHABLE: {
        readonly message: "A tela não conseguiu falar com o Conexus agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly HUB_RESPONSE_UNREADABLE: {
        readonly message: "A resposta que chegou à tela não veio do Conexus.";
        readonly action: "RETRY_LATER";
        readonly status: 502;
    };
    readonly ANTHROPIC_STORED_RECORD_REFUSED: {
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly APPLICATION_ARTIFACT_INPUT_REFUSED: {
        readonly message: "O Conexus não conseguiu guardar o aplicativo compilado. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_REPORT_UNREADABLE: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_TIMEOUT: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_CHECK_UNREADABLE: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_ENTRYPOINT_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_LIMIT_REFUSED: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_MEDIA_TYPE_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_PATH_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_SIZE_REFUSED: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_WORKSPACE_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_ENTRYPOINT_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_COUNT_REFUSED: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_DUPLICATE_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_ENCODING_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_HASH_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_ORDER_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_PATH_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_SHAPE_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_FILE_SIZE_REFUSED: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MEDIA_TYPE_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MIGRATION_FAILED: {
        readonly message: "A mudança nos dados do aplicativo não foi aplicada.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_MIGRATION_HISTORY_DIVERGED: {
        readonly message: "As mudanças nos dados do aplicativo não batem com as que já foram aplicadas.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_PAYLOAD_PIN_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_PAYLOAD_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_RUNNER_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_SERVER_REFUSED: {
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_SMOKE_FAILED: {
        readonly message: "O aplicativo compilou, mas não abriu na checagem do Conexus.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_TOTAL_SIZE_REFUSED: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly BOOT_BROWSER_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_COMPLETION_UNAVAILABLE: {
        readonly message: "O Builder terminou sem entregar uma resposta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_PLATFORM_FAILED: {
        readonly message: "Uma falha do Conexus, e não do modelo, interrompeu a execução. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_STALLED: {
        readonly message: "O agente parou de responder por uma falha do Conexus, e não do modelo, então a execução foi encerrada. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_AGENT_TRIPWIRE: {
        readonly message: "Um controle interno do Builder encerrou a execução. As alterações desta execução não foram aplicadas. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_APPLICATION_SOURCE_REFUSED: {
        readonly message: "Os arquivos do aplicativo não passaram na verificação de integridade.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly BUILDER_APP_NOT_FIXED: {
        readonly message: "O agente tentou corrigir o app e a verificação do Conexus ainda falha. O que quebrou está na conversa, acima. A versão em uso não mudou, e os arquivos ficaram nesta conversa para o próximo pedido.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CANDIDATE_UNPACK_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_FAILED: {
        readonly message: "O código novo quebrou as regras do próprio Projeto, então foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_IDENTITY_MISMATCH: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CHECK_INSTALL_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CONVERSATIONS_UNAVAILABLE: {
        readonly message: "O Conexus falhou ao executar o Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_GATEWAY_MODEL_REFUSED: {
        readonly message: "O provedor não aceita esse modelo.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_LATE_RESULT_REFUSED: {
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_MESSAGE_ID_UNAVAILABLE: {
        readonly message: "O Builder terminou sem entregar uma resposta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_AUTH_FAILED: {
        readonly message: "Nenhuma conta sua ou compartilhada atende este modelo, ou o provedor a recusou.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_CONTENT_FILTERED: {
        readonly message: "O provedor do modelo bloqueou a resposta.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_CONTEXT_LENGTH: {
        readonly message: "A conversa ficou maior do que o modelo aceita.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_INCOMPLETE: {
        readonly message: "O provedor do modelo recusou ou interrompeu o pedido.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_NOT_SELECTED: {
        readonly message: "Nenhuma conta sua ou compartilhada atende este modelo, ou o provedor a recusou.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_RATE_LIMITED: {
        readonly message: "O provedor do modelo está limitando os pedidos.";
        readonly action: "RETRY_LATER";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_STEP_TIMEOUT: {
        readonly message: "O modelo passou tempo demais gerando uma única resposta, então o Conexus encerrou a execução. As alterações desta execução não foram aplicadas.";
        readonly action: "RETRY_LATER";
        readonly status: 500;
    };
    readonly BUILDER_MODEL_STREAM_FAILED: {
        readonly message: "O provedor do modelo recusou ou interrompeu o pedido.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly BUILDER_PREVIEW_NOT_BUILT: {
        readonly message: "O código novo foi aceito, mas o Conexus reiniciou antes de gerar a Prévia. A última Prévia boa continua disponível. O reinício foi registrado.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_BUNDLE_TOO_LARGE: {
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_CONTENT_TOO_LARGE: {
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RESULT_MATERIALIZATION_REFUSED: {
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUNTIME_INPUT_REFUSED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUNTIME_RESULT_SCOPE_REFUSED: {
        readonly message: "O código novo proposto foi recusado. O Projeto continua no código anterior.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_CANCELLED: {
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_CONVERSATION_SESSION_REFUSED: {
        readonly message: "O Conexus não conseguiu registrar o estado da conversa. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_CREATE_FAILED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_INPUT_REFUSED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_NOT_ADMITTED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_TRANSITION_REFUSED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_PHASE_UPDATE_REFUSED: {
        readonly message: "O Conexus não conseguiu registrar o andamento da execução. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_AGENT_USER_REQUIRED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_COMMAND_INTERFACE_REQUIRED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_COLLECT_TIMEOUT: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_POLL_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_EGRESS_START_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_FILE_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_ID_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_INCARNATION_CHANGED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SANDBOX_KEEPALIVE_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SESSION_DELETE_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_BASE_MOVED: {
        readonly message: "O código do Projeto mudou enquanto esta execução trabalhava, então o resultado não foi aplicado e nada foi sobrescrito.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_BASE_PIN_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_REFUSED: {
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_TREE_TOO_LARGE: {
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_READ_UNSAFE_ENTRY: {
        readonly message: "O Conexus não conseguiu ler o código do Projeto. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ENTRY_INSPECTION_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ENTRY_UNSAFE: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_STARTER_ROOT_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_APP_ROOT_MISSING: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_FAILED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_MAIN_MISSING: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_MERGE_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_PROJECT_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_REF_MOVED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_REF_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONEXUS_GIT_STARTER_REFUSED: {
        readonly message: "O Conexus não conseguiu preparar o ambiente de código. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_ACCOUNT_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_BINARY_REFUSED: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_POOL_CLOSED: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_PORT_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_PROXY_START_FAILED: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_RECORD_REFUSED: {
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_ROUTER_UNAVAILABLE: {
        readonly message: "O Conexus não conseguiu usar a conta Google AI Pro. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly GOOGLE_AI_PRO_STORED_RECORD_REFUSED: {
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly HUB_RESTART: {
        readonly message: "O Conexus reiniciou durante a execução. O reinício foi registrado.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly MANIFEST_REFUSED: {
        readonly message: "O servidor do aplicativo tem uma definição que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly MODEL_ACCOUNT_PROBE_NOT_CALLABLE: {
        readonly message: "O Conexus falhou ao executar o Builder. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly OPENAI_CODEX_MODEL_REFUSED: {
        readonly message: "O provedor não aceita esse modelo.";
        readonly action: "CHOOSE_OTHER_MODEL";
        readonly status: 500;
    };
    readonly OPENAI_CODEX_STORED_RECORD_REFUSED: {
        readonly message: "O Conexus não conseguiu ler a credencial salva desta conta de modelo.";
        readonly action: "CONNECT_MODEL_ACCOUNT";
        readonly status: 500;
    };
    readonly SERVER_TREE_REFUSED: {
        readonly message: "O servidor do aplicativo tem arquivos que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly USER_CANCELLED: {
        readonly message: "Execução interrompida por você.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_QUESTION_EXPIRED: {
        readonly message: "A pergunta ficou sem resposta e foi encerrada. A sua próxima mensagem continua o trabalho.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_QUESTION_NOT_RELEASED: {
        readonly message: "O Builder não conseguiu encerrar a pergunta. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_SOURCE_ADMISSION_FAILED: {
        readonly message: "A mudança não entrou no app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly BUILDER_RUN_SETTLE_LOST: {
        readonly message: "O Conexus perdeu o fim deste trabalho. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_SYMLINK_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_COMPILER_OUTPUT_NON_REGULAR_REFUSED: {
        readonly message: "Os arquivos do aplicativo têm um formato que o Conexus não aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 500;
    };
    readonly APPLICATION_RUNNER_RELEASE_REFUSED: {
        readonly message: "O Conexus não conseguiu alcançar o servidor de aplicativos. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly INPUT_REFUSED: {
        readonly message: "Algum campo tem um valor que o app não aceita.";
        readonly action: "NONE";
        readonly status: 400;
    };
    readonly INPUT_TOO_LARGE: {
        readonly message: "Os dados enviados são grandes demais.";
        readonly action: "NONE";
        readonly status: 413;
    };
    readonly OPERATION_NOT_FOUND: {
        readonly message: "Essa operação não existe neste app.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly HANDLER_TIMEOUT: {
        readonly message: "A operação demorou mais que o permitido.";
        readonly action: "RETRY_LATER";
        readonly status: 504;
    };
    readonly RESPONSE_TOO_LARGE: {
        readonly message: "Há resultados demais para mostrar. Use um filtro para reduzir a lista.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly DATABASE_UNAVAILABLE: {
        readonly message: "Os dados salvos do app estão indisponíveis. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_RUNNER_BUSY: {
        readonly message: "O app está ocupado com outros pedidos agora.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly APPLICATION_PROJECT_BUSY: {
        readonly message: "Este app já tem pedidos demais em andamento.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly SERVER_TREE_TOO_LARGE: {
        readonly message: "O aplicativo passou do tamanho que o Conexus aceita.";
        readonly action: "FIX_IN_CONVERSATION";
        readonly status: 413;
    };
    readonly HANDLER_FAILED: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_LOAD_FAILED: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_EXPORT_MISSING: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_OUTPUT_UNSERIALIZABLE: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly HANDLER_OUTPUT_REFUSED: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly HANDLER_CRASHED: {
        readonly message: "Esta operação do app falhou.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly WORKER_FAILED: {
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly WORKER_JOB_REFUSED: {
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONNECTOR_SOCKET_REFUSED: {
        readonly message: "O Conexus falhou ao executar o app. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
    readonly CONTENT_TYPE_REFUSED: {
        readonly message: "O Conexus não aceitou o formato deste pedido.";
        readonly action: "NONE";
        readonly status: 415;
    };
    readonly APPLICATION_NOT_FOUND: {
        readonly message: "Não encontramos este app.";
        readonly action: "NONE";
        readonly status: 404;
    };
    readonly MEMORY_OBSERVATION_FAILED: {
        readonly message: "Não foi possível guardar as mensagens na memória. O Builder refaz isso na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MEMORY_REFLECTION_FAILED: {
        readonly message: "Não foi possível resumir as observações. O Builder refaz isso na próxima mensagem.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_OPENAI_REFUSED: {
        readonly message: "A OpenAI recusou a entrada.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_ANTHROPIC_REFUSED: {
        readonly message: "A Anthropic recusou esse código. Pode ser que ele não tenha sido copiado inteiro.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly MODEL_LOGIN_GOOGLE_REFUSED: {
        readonly message: "O Google recusou a entrada.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly APPLICATION_NO_ACCESS: {
        readonly message: "Você não tem acesso a este aplicativo.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly APPLICATION_EMAIL_NOT_VERIFIED: {
        readonly message: "Você não tem acesso a este aplicativo porque seu e-mail ainda não foi verificado.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly APPLICATION_SIGN_IN_FAILED: {
        readonly message: "O serviço de login não concluiu a entrada.";
        readonly action: "SIGN_IN_AGAIN";
        readonly status: 403;
    };
    readonly APPLICATION_NOT_READY: {
        readonly message: "Este app ainda não está pronto para receber pedidos.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly APPLICATION_SIGN_IN_REQUIRED: {
        readonly message: "Você precisa entrar no Conexus para usar este app.";
        readonly action: "SIGN_IN";
        readonly status: 401;
    };
    readonly PREVIEW_REFUSED: {
        readonly message: "Esta prévia não aceita o pedido.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly NOT_GRANTED: {
        readonly message: "Este app perdeu o acesso ao sistema da empresa. Quem administra o Workspace precisa vincular a Conexão outra vez.";
        readonly action: "ASK_ADMIN";
        readonly status: 403;
    };
    readonly CONNECTOR_UNCONFIGURED: {
        readonly message: "A integração com o sistema da empresa não está configurada. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 503;
    };
    readonly CREDENTIAL_REFUSED: {
        readonly message: "O sistema da empresa recusou o acesso. Avise quem administra a integração.";
        readonly action: "ASK_ADMIN";
        readonly status: 502;
    };
    readonly PROVIDER_TIMEOUT: {
        readonly message: "O sistema da empresa não respondeu a tempo.";
        readonly action: "RETRY_LATER";
        readonly status: 504;
    };
    readonly PROVIDER_UNAVAILABLE: {
        readonly message: "O sistema da empresa está indisponível agora.";
        readonly action: "RETRY_LATER";
        readonly status: 503;
    };
    readonly PROVIDER_ERROR: {
        readonly message: "O sistema da empresa respondeu com um erro.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly RESPONSE_REFUSED: {
        readonly message: "O Conexus não aceitou a resposta do sistema da empresa.";
        readonly action: "NONE";
        readonly status: 502;
    };
    readonly CALL_LIMIT: {
        readonly message: "Este app fez chamadas demais ao sistema da empresa.";
        readonly action: "RETRY_LATER";
        readonly status: 429;
    };
    readonly SERVICE_REFUSED: {
        readonly message: "Esta operação não é permitida pela conexão com o sistema da empresa.";
        readonly action: "NONE";
        readonly status: 403;
    };
    readonly CONNECTOR_PLATFORM_FAILED: {
        readonly message: "O Conexus falhou ao ler o sistema da empresa. A falha foi registrada.";
        readonly action: "NONE";
        readonly status: 500;
    };
};
