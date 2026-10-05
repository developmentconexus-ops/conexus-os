import { z } from 'zod';
export declare const Problem: z.ZodObject<{
    type: z.ZodString;
    title: z.ZodString;
    status: z.ZodInt;
    code: z.ZodString;
    traceId: z.ZodOptional<z.ZodString>;
}, z.core.$loose>;
export type Problem = z.output<typeof Problem>;
