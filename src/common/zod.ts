/**
 * Zod v4-only entry for server/worker code. Avoids pulling Zod v3 compat trees into the Worker bundle.
 */
export { z } from 'zod/v4';
export type { ZodError, ZodIssue, ZodTypeAny } from 'zod/v4';
