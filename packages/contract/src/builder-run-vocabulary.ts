// GENERATED from contracts/technical/builder-run-vocabulary.json by scripts/generate-builder-run-vocabulary.mjs. Do not edit.

export const BUILDER_RUN_STATES = ['QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'INTERRUPTED'] as const
export type BuilderRunState = (typeof BUILDER_RUN_STATES)[number]
export const BUILDER_RUN_PHASES = ['PREPARING', 'AGENT', 'WAITING', 'SOURCE_ADMISSION', 'COMPILING', 'FINALIZING'] as const
export type BuilderRunPhase = (typeof BUILDER_RUN_PHASES)[number]
export const BUILDER_RUN_RESULT_KINDS = ['RESPONSE_ONLY', 'SOURCE_CHANGED', 'SOURCE_CHANGED_BUILD_FAILED'] as const
export type BuilderRunResultKind = (typeof BUILDER_RUN_RESULT_KINDS)[number]
