import { z } from 'zod';
import { FAILURE_STATUS } from './failures.generated.js';
const codes = Object.keys(FAILURE_STATUS);
export const Problem = z.looseObject({
    type: z.string(),
    title: z.string(),
    status: z.int().min(100).max(599),
    code: z.string().refine((value) => codes.includes(value)),
    traceId: z.string().optional(),
}).meta({ id: 'Problem' });
