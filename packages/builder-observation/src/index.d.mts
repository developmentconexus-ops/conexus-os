import type { z } from 'zod'

export type BuilderObservation = Readonly<
  | { kind: 'TEXT_START'; blockId: string }
  | { kind: 'TEXT_DELTA'; blockId: string; text: string }
  | { kind: 'TEXT_END'; blockId: string }
  | { kind: 'ACTIVITY'; activityId: string; label: 'READ_FILES' | 'EDIT_FILES' | 'RUN_COMMAND' | 'WORKSPACE'; state: 'started' | 'succeeded' | 'failed' | 'interrupted' }
  | { kind: 'PHASE'; phase: 'CODING' | 'PREPARING' | 'VERIFYING' | 'CORRECTING' }
  | { kind: 'OBSERVATION_END' }
  | { kind: 'OBSERVATION_UNAVAILABLE'; code: 'RUNTIME_FAILED' | 'LIMIT_REACHED' }
>
export type ObservationEvent = Readonly<{ generation: string; sequence: number; event: BuilderObservation }>
export declare const observationEventSchema: z.ZodType<ObservationEvent>
export declare function parseObservationEvent(value: unknown): ObservationEvent
