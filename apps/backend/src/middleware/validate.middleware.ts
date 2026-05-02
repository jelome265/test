/**
 * validate.middleware.ts — Zod request validation middleware factory.
 *
 * Usage:
 *   router.post('/shipments',
 *     requireAuth,
 *     validate(CreateShipmentSchema),
 *     asyncHandler(async (req, res) => {
 *       // req.body is now typed as CreateShipmentInput — fully validated
 *     })
 *   );
 *
 * The 'target' parameter determines which part of the request to validate:
 *   'body'   → req.body    (POST/PUT/PATCH requests)
 *   'query'  → req.query   (GET request query parameters)
 *   'params' → req.params  (URL path parameters, e.g. :id)
 *
 * After successful validation, the parsed (and potentially coerced/transformed)
 * value REPLACES the original req[target]. This ensures:
 *   - Zod .transform() results are used, not the raw input
 *   - .toLowerCase() on email actually takes effect
 *   - Extra fields not in the schema are stripped
 *
 * Validation errors produce a 400 ValidationError with field-level details,
 * not a generic 400 with an opaque message.
 */

import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { type ZodSchema } from 'zod';

import { ValidationError, type ValidationDetail, formatZodError } from '../errors/app-error.js';

type ValidationTarget = 'body' | 'query' | 'params';

/**
 * Middleware factory: validates req[target] against the provided Zod schema.
 *
 * @param schema - The Zod schema to validate against.
 * @param target - Which part of the request to validate. Defaults to 'body'.
 */
export function validate(schema: ZodSchema, target: ValidationTarget = 'body'): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req[target]);

    if (!result.success) {
      const details: ValidationDetail[] = result.error.issues.map((issue) => ({
        field:    issue.path.join('.') || '_root',
        message:  issue.message,
        received: issue.code === 'invalid_type' ? (issue as { received?: unknown }).received : undefined,
      }));

      next(new ValidationError('Request validation failed', details));
      return;
    }

    // Replace the raw input with the validated (and potentially transformed) value.
    // TypeScript: req[target] is typed as Record<string, string> for query/params,
    // but our schemas produce richer types — we cast safely here.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (req as any)[target] = result.data;

    next();
  };
}
