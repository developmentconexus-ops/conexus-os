export declare const BUILDER_RUN_STATES: readonly ["QUEUED", "RUNNING", "SUCCEEDED", "FAILED", "INTERRUPTED"];
export type BuilderRunState = (typeof BUILDER_RUN_STATES)[number];
export declare const OPEN_RUN_STATES: readonly ["QUEUED", "RUNNING"];
export declare const BUILDER_RUN_PHASES: readonly ["PREPARING", "AGENT", "WAITING", "SOURCE_ADMISSION", "COMPILING", "FINALIZING"];
export type BuilderRunPhase = (typeof BUILDER_RUN_PHASES)[number];
export declare const BUILDER_RUN_RESULT_KINDS: readonly ["RESPONSE_ONLY", "SOURCE_CHANGED", "SOURCE_CHANGED_BUILD_FAILED"];
export type BuilderRunResultKind = (typeof BUILDER_RUN_RESULT_KINDS)[number];
